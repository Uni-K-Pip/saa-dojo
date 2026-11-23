import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Course } from '../content/course-types';
import type { DocEntry, LessonMeta, SimIndexEntry, SimScenarioMeta } from '../content/types';
import { db } from '../db/db';
import { answer, event, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const lessons: LessonMeta[] = [{
  id: 'lesson-1.1-iam-basics', title: 'IAM の基礎', estimatedMinutes: 7,
  domain: 1, taskStatement: '1.1', order: 1, knowledgeRefs: ['1.1-K1'], services: [], questionIds: [], checkIds: [],
}];
const docs: DocEntry[] = [
  { id: 'cheatsheet-iam', kind: 'cheatsheet', title: 'IAM の早見表', order: 1, taskStatements: [], services: [], createdBy: 't', body: '早見表の本文' },
  { id: 'guide-exam-strategy', kind: 'guide', title: '試験の進め方', order: 2, taskStatements: [], services: [], createdBy: 't', body: 'ガイドの本文' },
];
const practice = Array.from({ length: 15 }, (_, i) => makeQuestion({ id: `saa-1.1-t-${String(i + 1).padStart(3, '0')}` }));
const mock = makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' });
const course: Course = { stages: [
  { id: 0, title: '土台', goal: '前提知識を学びます。', units: [
    { id: 'u00', title: '基礎講座', stage: 0, items: [{ kind: 'doc', ref: 'guide-exam-strategy' }], practiceIds: [] },
  ] },
  { id: 1, title: '中心の部品', goal: '仕組みを学びます。', units: [
    { id: 'u01', title: 'アクセス管理', stage: 1, items: [
      { kind: 'lesson', ref: 'lesson-1.1-iam-basics' }, { kind: 'doc', ref: 'cheatsheet-iam', note: '設計の判断を振り返ります。' },
      { kind: 'practice' }, { kind: 'drill' }, { kind: 'analysis' }, { kind: 'mock', mock: 'mockA' },
    ], practiceIds: [...practice.map(({ id }) => id), mock.id] }, // 保留模試の問題が紛れても、画面の経路で除かれることを確かめる
    { id: 'u02', title: '仕上げ', stage: 1, items: [{ kind: 'mock', mock: 'random' }], practiceIds: [] },
  ] },
] };

describe('学習コースとユニット', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles([...practice, mock], { course, lessons, docs }));
  });

  it('ステージ・ユニット・進み具合の一覧を表示する', async () => {
    await db.events.add(event('lesson-read', { lessonId: lessons[0]!.id }));
    renderApp('/course');
    expect(await screen.findByRole('heading', { name: '学習コース' })).toBeInTheDocument();
    const stage = screen.getByRole('region', { name: 'ステージ 1 中心の部品' });
    expect(within(stage).getByText('仕組みを学びます。')).toBeInTheDocument();
    const unit = within(stage).getByRole('link', { name: 'U01 アクセス管理' });
    expect(unit).toHaveAttribute('href', '/course/u01');
    expect(within(unit.closest('li')!).getByText('済み 1 / 6')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '次にやること' })).toBeInTheDocument();
  });

  it('ユニットの項目を順に並べ、教材と前後のユニットへリンクする', async () => {
    await db.events.add(answer(practice[0]!.id, false, { mode: 'review' }));
    renderApp('/course/u01');
    expect(await screen.findByRole('heading', { name: 'U01 アクセス管理' })).toBeInTheDocument();
    expect(screen.getByText(/› ステージ 1 中心の部品/)).toBeInTheDocument();
    const items = Array.from(document.querySelectorAll('ol.list > li'));
    expect(items.map((item) => item.querySelector('.badge')?.textContent)).toEqual([
      'レッスン', '早見表', 'ユニット演習', '判断軸ドリル', '弱点分析', '模擬試験',
    ]);
    for (const [i, name, href] of [
      [0, 'IAM の基礎', '/lessons/lesson-1.1-iam-basics'], [1, 'IAM の早見表', '/docs/cheatsheet-iam'],
      [3, '判断軸ドリル', '/drill'], [4, '弱点分析', '/analysis'], [5, '保留模試 A', '/mock'],
    ] as const) {
      expect(within(items[i] as HTMLElement).getByRole('link', { name })).toHaveAttribute('href', href);
    }
    expect(screen.getByText('（約 7 分）')).toBeInTheDocument();
    expect(screen.getByText('設計の判断を振り返ります。')).toBeInTheDocument();
    expect(screen.getByText('候補 15 問・回答済み 1 問')).toBeInTheDocument();
    expect(screen.queryByText(mock.stem)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /U00 基礎講座/ })).toHaveAttribute('href', '/course/u00');
    expect(screen.getByRole('link', { name: /U02 仕上げ/ })).toHaveAttribute('href', '/course/u02');
  });

  it.each([10, 15])('%i 問のユニット演習を始めるとセッションに進む', async (count) => {
    const user = userEvent.setup();
    renderApp('/course/u01');
    const name = count === 10 ? 'ユニット演習を始める（10 問）' : '15 問で始める';
    await user.click(await screen.findByRole('button', { name }));
    expect(await screen.findByRole('heading', { name: 'ユニット演習: U01 アクセス管理' })).toBeInTheDocument();
    expect(screen.getByText(`1 / ${count} 問`)).toBeInTheDocument();
    const [session] = await db.sessions.toArray();
    expect(session).toMatchObject({ mode: 'unit', unitId: 'u01' });
    expect(session?.questionIds).toHaveLength(count);
    expect(session?.questionIds).not.toContain(mock.id);
  });

  it('1 問だけでも演習でき、結果と解き直しから同じユニットに戻れる', async () => {
    const user = userEvent.setup();
    const shortCourse = structuredClone(course);
    shortCourse.stages[1]!.units[0]!.practiceIds = [practice[0]!.id];
    useFakeContent(makeContentFiles([practice[0]!], { course: shortCourse, lessons, docs }));
    renderApp('/course/u01');
    await user.click(await screen.findByRole('button', { name: 'ユニット演習を始める（1 問）' }));
    await user.click(await screen.findByRole('radio', { name: /誤りの選択肢1/ }));
    await user.click(screen.getByRole('radio', { name: '勘' }));
    await user.click(screen.getByRole('button', { name: '回答する' }));
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));
    expect(await screen.findByRole('link', { name: '戻る' })).toHaveAttribute('href', '/course/u01');
    await user.click(screen.getByRole('button', { name: '間違えた 1 問を解き直す' }));
    expect(await screen.findByRole('heading', { name: /解き直し/ })).toBeInTheDocument();
    expect(await db.sessions.toArray()).toEqual([
      expect.objectContaining({ mode: 'unit', unitId: 'u01' }), expect.objectContaining({ mode: 'unit', unitId: 'u01' }),
    ]);
    expect(await db.events.toArray()).toEqual([expect.objectContaining({ type: 'answer', mode: 'unit' })]);
  });

  it('手動で済みにでき、済みを外せる', async () => {
    const user = userEvent.setup();
    renderApp('/course/u01');
    const doc = await screen.findByRole('link', { name: 'IAM の早見表' });
    const row = within(doc.closest('li')!);
    await user.click(row.getByRole('button', { name: '済みにする', pressed: false }));
    expect(await row.findByText('済み')).toHaveClass('badge', 'ok');
    await user.click(row.getByRole('button', { name: '済みを外す', pressed: true }));
    await row.findByRole('button', { name: '済みにする', pressed: false });
    expect(row.queryByText('済み')).not.toBeInTheDocument();
    expect(await db.events.orderBy('at').toArray()).toMatchObject([
      { type: 'course-check', unitId: 'u01', itemKey: 'doc:cheatsheet-iam', done: true },
      { type: 'course-check', unitId: 'u01', itemKey: 'doc:cheatsheet-iam', done: false },
    ]);
  });

  it('ホームに最初の未了項目と行き先を表示する', async () => {
    await db.events.add(event('course-check', { unitId: 'u00', itemKey: 'doc:guide-exam-strategy', done: true }));
    renderApp('/');
    const card = within(await screen.findByRole('region', { name: '次にやること' }));
    expect(card.getByText('U01 アクセス管理')).toBeInTheDocument();
    expect(card.getByText('IAM の基礎')).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'レッスンを読む' })).toHaveAttribute('href', '/lessons/lesson-1.1-iam-basics');
    expect(card.getByRole('link', { name: 'コースを見る' })).toHaveAttribute('href', '/course');
  });

  it('存在しないユニットでは一覧へのリンクを出す', async () => {
    renderApp('/course/u99');
    expect(await screen.findByRole('heading', { name: 'ユニットが見つかりません' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '学習コースへ' })).toHaveAttribute('href', '/course');
  });
});

describe('学習コースのシミュレーター', () => {
  const scenario: SimScenarioMeta = { id: 'sim-cidr-subnet-test', title: 'サブネットの大きさを予想する', status: 'pending' };
  const simulator: SimIndexEntry = {
    id: 'cidr', name: 'CIDR とサブネット', description: 'アドレスの数を確かめます。', notCovered: [], scenarios: [scenario],
  };
  const note = '設定を変える前に結果を予想します。';
  const simCourse: Course = { stages: [{ id: 0, title: '土台', goal: '仕組みを学びます。', units: [
    { id: 'u00', title: 'ネットワーク', stage: 0, practiceIds: [], items: [{ kind: 'sim', ref: scenario.id, note }] },
  ] }] };
  const to = `/sims/${simulator.id}/${scenario.id}`;

  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles([], { course: simCourse, 'sim-index': [simulator] }));
  });

  it.each([['initial', true], ['prefix-27', false]])('ユニットに題とリンクを出し、実行 %s の済みを判定する', async (run, done) => {
    await db.events.bulkAdd([
      event('sim-run', { sim: simulator.id, scenarioId: 'sim-cidr-other', run: 'initial' }),
      event('sim-run', { sim: simulator.id, scenarioId: scenario.id, run, correct: false }),
    ]);
    renderApp('/course/u00');
    const link = await screen.findByRole('link', { name: scenario.title });
    expect(link).toHaveAttribute('href', to);
    const row = within(link.closest('li')!);
    expect(row.getByText('シミュレーター')).toHaveClass('badge');
    expect(row.getByText('未検証')).toHaveClass('badge', 'pending');
    expect(row.getByText(note)).toBeInTheDocument();
    if (done) expect(row.getByText('済み')).toHaveClass('badge', 'ok');
    else expect(row.queryByText('済み')).not.toBeInTheDocument();
  });

  it('同じユニットで、レッスンの読み直しの札とシナリオの項目を両方出す', async () => {
    const lesson: LessonMeta = { ...lessons[0], checkIds: ['c00000001'] };
    const mixed: Course = { stages: [{ ...simCourse.stages[0], units: [
      { ...simCourse.stages[0].units[0], items: [{ kind: 'lesson', ref: lesson.id }, { kind: 'sim', ref: scenario.id }] },
    ] }] };
    useFakeContent(makeContentFiles([], { course: mixed, lessons: [lesson], 'sim-index': [simulator] }));
    await db.events.add(event('check-answer', { lessonId: lesson.id, checkId: 'c00000001', correct: false, choice: 2 }));
    renderApp('/course/u00');
    const lessonLink = await screen.findByRole('link', { name: lesson.title });
    expect(within(lessonLink.closest('li')!).getByText('読み直し')).toBeVisible();
    const simLink = screen.getByRole('link', { name: scenario.title });
    expect(simLink).toHaveAttribute('href', to);
    expect(within(simLink.closest('li')!).queryByText('読み直し')).not.toBeInTheDocument();
  });

  it('ホームの「次にやること」に未了のシナリオを出す', async () => {
    renderApp('/');
    const card = within(await screen.findByRole('region', { name: '次にやること' }));
    expect(card.getByText(scenario.title)).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'シミュレーターへ' })).toHaveAttribute('href', to);
  });

  it('索引にないシナリオは ID で表示し、詳細画面で見つからないことを案内する', async () => {
    useFakeContent(makeContentFiles([], { course: simCourse, 'sim-index': [] }));
    const user = userEvent.setup();
    renderApp('/course/u00');
    const link = await screen.findByRole('link', { name: scenario.id });
    expect(link).toHaveAttribute('href', to);
    await act(async () => { await user.click(link); });
    expect(await screen.findByRole('heading', { name: '見つかりません' })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(scenario.id))).toBeInTheDocument();
  });
});
