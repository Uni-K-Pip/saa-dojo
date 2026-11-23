import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Course } from '../content/course-types';
import type { LabMeta, PatternMeta } from '../content/types';
import { db } from '../db/db';
import { event, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const question = makeQuestion({ id: 'saa-4.1-t-001' });
const common = {
  order: 1, knowledgeRefs: ['4.1-K1'], services: ['Amazon S3'],
  diagram: 'dg-test-storage', status: 'pending' as const, questionIds: [question.id],
};
const lab: LabMeta = { ...common, id: 'lab-test-storage', title: '保存先を組み立てる', unit: 'u03', estimatedMinutes: 15 };
const pattern: PatternMeta = {
  ...common, id: 'pattern-test-storage', title: '保存先を設計する', qualifiers: ['cost'], taskStatements: ['4.1'],
};
const alternative: PatternMeta = {
  ...pattern, id: 'pattern-test-queue', title: '処理を待ち行列でつなぐ', status: 'verified',
  order: 2, services: ['Amazon SQS'], taskStatements: ['3.3'], qualifiers: ['operational'],
};
const body = [
  '## 本文',
  '',
  '> **その場の確認**',
  '> 設定を確かめるために何をしますか？',
  '>',
  '> - [x] 動作を確かめる',
  '> - [ ] そのままにする',
  '>',
  '> 設定と動作の関係を確かめられるためです。',
  '',
  `- \`${question.id}\` を確認します。`,
].join('\n');
const course: Course = { stages: [{
  id: 0, title: '土台', goal: '仕組みを学びます。',
  units: [{
    id: 'u03', title: '保存先', stage: 0, practiceIds: [],
    items: [{ kind: 'lab', ref: lab.id }, { kind: 'pattern', ref: pattern.id }],
  }],
}] };

beforeEach(async () => {
  await resetDb();
  useFakeContent(makeContentFiles([question], {
    'lab-index': [lab],
    'pattern-index': [pattern, alternative],
    [`lab:${lab.id}`]: { id: lab.id, body },
    [`pattern:${pattern.id}`]: { id: pattern.id, body },
    services: [{ id: 's3', name: 'Amazon S3', aliases: [], category: 'ストレージ' }],
    course,
  }));
});

describe('ミニラボと設計パターンの一覧', () => {
  it.each([
    ['/labs', 'ミニラボ'],
    ['/patterns', '設計パターン'],
  ])('%s は教材が 0 件の案内を表示する', async (to, label) => {
    useFakeContent(makeContentFiles([]));
    renderApp(to);
    expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument();
    expect(screen.getByText(`表示できる${label}はまだありません。${label}は、検証が済んだものから載せます。`)).toBeInTheDocument();
  });

  it('ミニラボ一覧にユニット・所要時間・未検証と最新の読了の札を出す', async () => {
    const latest = new Date(2026, 10, 23).getTime();
    await db.events.bulkAdd([event('lab-read', { labId: lab.id }, latest), event('lab-read', { labId: lab.id }, latest - 86_400_000)]);
    renderApp('/labs');
    const row = within((await screen.findByRole('link', { name: lab.title })).closest('li')!);
    expect(row.getByRole('link')).toHaveAttribute('href', `/labs/${lab.id}`);
    expect(row.getByText('U03')).toBeInTheDocument();
    expect(row.getByText('約 15 分')).toBeInTheDocument();
    expect(row.getByText('未検証')).toHaveClass('badge', 'pending');
    expect(row.getByText(`読了 ${new Date(latest).toLocaleDateString('ja-JP')}`)).toHaveClass('badge', 'ok');
  });

  it('設計パターン一覧に判断軸・タスク・未検証と読了の札を出す', async () => {
    await db.events.add(event('pattern-read', { patternId: pattern.id }));
    renderApp('/patterns');
    const row = within((await screen.findByRole('link', { name: pattern.title })).closest('li')!);
    expect(row.getByRole('link')).toHaveAttribute('href', `/patterns/${pattern.id}`);
    expect(row.getByText('タスク 4.1')).toBeInTheDocument();
    expect(row.getByText('コスト')).toHaveClass('badge');
    expect(row.getByText('未検証')).toHaveClass('badge', 'pending');
    expect(row.getByText(/^読了 /)).toHaveClass('badge', 'ok');
  });

  it('URL の判断軸・タスク・サービスを読み、条件と件数を操作できる', async () => {
    const user = userEvent.setup();
    renderApp('/patterns?q=cost&task=4.1&service=Amazon%20S3');
    expect(await screen.findByRole('link', { name: pattern.title })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: alternative.title })).not.toBeInTheDocument();
    const qualifier = screen.getByRole('combobox', { name: '判断軸' });
    const task = screen.getByRole('combobox', { name: 'タスク' });
    const service = screen.getByRole('combobox', { name: 'サービス' });
    expect(qualifier).toHaveValue('cost');
    expect(task).toHaveValue('4.1');
    expect(service).toHaveValue('Amazon S3');
    expect(screen.getByText('1 件')).toHaveAttribute('aria-live', 'polite');

    await user.selectOptions(qualifier, 'operational');
    expect(screen.getByText('条件に当てはまる設計パターンはありません。')).toBeInTheDocument();
    expect(screen.getByText('0 件')).toHaveAttribute('aria-live', 'polite');
    await user.selectOptions(task, '3.3');
    expect(screen.getByText('0 件')).toBeInTheDocument();
    await user.selectOptions(service, 'Amazon SQS');
    expect(screen.getByRole('link', { name: alternative.title })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: pattern.title })).not.toBeInTheDocument();
    await user.selectOptions(qualifier, '');
    await user.selectOptions(task, '');
    await user.selectOptions(service, '');
    expect(screen.getByText('2 件')).toBeInTheDocument();
  });
});

describe('ミニラボと設計パターンの本文', () => {
  it.each([
    ['labs', lab, { type: 'lab-read', labId: lab.id }],
    ['patterns', pattern, { type: 'pattern-read', patternId: pattern.id }],
  ] as const)('%s はその場の確認を表示し、読了を記録する', async (segment, meta, readEvent) => {
    const user = userEvent.setup();
    renderApp(`/${segment}/${meta.id}`);
    expect(await screen.findByRole('heading', { name: meta.title, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amazon S3' })).toHaveAttribute('href', '/services/s3');
    if (segment === 'labs') expect(screen.getByRole('link', { name: 'U03' })).toHaveAttribute('href', '/course/u03');
    else expect(screen.getByText('タスク 4.1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '動作を確かめる' }));
    expect(screen.getByText('正解です。')).toBeVisible();
    expect(await db.events.toArray()).toEqual([]);
    await user.click(screen.getByRole('button', { name: '読了にする', pressed: false }));
    expect(await screen.findByRole('button', { name: /読了済み/, pressed: true })).toBeInTheDocument();
    expect(await db.events.toArray()).toMatchObject([readEvent]);
  });

  it.each([
    ['labs', lab.id, `${question.id} を解く`],
    ['patterns', pattern.id, '確認問題を解く（1 問）'],
  ])('%s から確認問題を演習として始める', async (segment, id, name) => {
    const user = userEvent.setup();
    renderApp(`/${segment}/${id}`);
    await user.click(await screen.findByRole('button', { name }));
    expect(await screen.findByRole('button', { name: '回答する' })).toBeInTheDocument();
    expect(await db.sessions.toArray()).toMatchObject([{ mode: 'practice', questionIds: [question.id] }]);
  });

  it.each([
    ['labs', 'lab-excluded', 'ミニラボ'],
    ['patterns', 'pattern-excluded', '設計パターン'],
  ])('%s で見つからない教材の案内と一覧へのリンクを出す', async (segment, id, label) => {
    renderApp(`/${segment}/${id}`);
    expect(await screen.findByRole('heading', { name: '見つかりません' })).toBeInTheDocument();
    expect(screen.getByText(`指定された${label}（${id}）は表示できません。${label}がないか、まだ検証が済んでいない${label}です。`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${label}の一覧へ` })).toHaveAttribute('href', `/${segment}`);
  });
});

describe('学習コースから読む', () => {
  it('元の順で教材を案内し、読了するたびに済みになる', async () => {
    const user = userEvent.setup();
    renderApp('/course/u03');
    const first = await screen.findByRole('link', { name: lab.title });
    const rows = within(within(screen.getByRole('main')).getByRole('list')).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.badge')?.textContent)).toEqual(['ミニラボ', '設計パターン']);
    expect(within(rows[0]!).getByText('（約 15 分）')).toBeInTheDocument();
    expect(screen.queryByText('済み')).not.toBeInTheDocument();

    await act(async () => { await user.click(first); });
    await user.click(await screen.findByRole('button', { name: '読了にする' }));
    await screen.findByRole('button', { name: /読了済み/, pressed: true });
    await user.click(screen.getByRole('link', { name: 'U03' }));
    const second = await screen.findByRole('link', { name: pattern.title });
    expect(within(screen.getByRole('link', { name: lab.title }).closest('li')!).getByText('済み')).toBeInTheDocument();
    expect(second).toHaveAttribute('href', `/patterns/${pattern.id}`);

    await act(async () => { await user.click(second); });
    await user.click(await screen.findByRole('button', { name: '読了にする' }));
    await screen.findByRole('button', { name: /読了済み/, pressed: true });
    await act(async () => { await user.click(screen.getByRole('link', { name: '学ぶ' })); });
    await user.click(await screen.findByRole('link', { name: 'U03 保存先' }));
    await waitFor(() => expect(screen.getAllByText('済み')).toHaveLength(2));
  });

  it.each([
    [false, 'ミニラボを読む', lab.title, `/labs/${lab.id}`],
    [true, '設計パターンを読む', pattern.title, `/patterns/${pattern.id}`],
  ])('次に読む教材を案内する（ミニラボ読了 %s）', async (read, action, title, to) => {
    if (read) await db.events.add(event('lab-read', { labId: lab.id }));
    renderApp('/course');
    const card = within(await screen.findByRole('region', { name: '次にやること' }));
    expect(card.getByRole('link', { name: action })).toHaveAttribute('href', to);
    expect(card.getByText(title)).toBeInTheDocument();
  });
});
