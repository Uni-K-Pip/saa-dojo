// 公開のたびに問題が除外・書き換えられても、途中のセッションや回答履歴が残る画面が壊れないこと
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '../db/db';
import type { MockSession, PracticeSession } from '../domain/session';
import { answer, event, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const REMOVED = 'saa-1.1-t-099'; // 次の公開で除外された問題
const REWRITTEN = 'saa-1.1-t-001'; // 選択肢が 5 つ・複数選択に書き換えられた問題（前の回答は e）

const current = [
  makeQuestion({
    id: REWRITTEN,
    type: 'multiple',
    selectCount: 2,
    knowledgeRefs: ['1.1-K1'],
    options: [
      { id: 'a', text: '新しい正解1', correct: true, rationale: '正しい理由の説明です。十分な長さ。' },
      { id: 'b', text: '新しい正解2', correct: true, rationale: '正しい理由の説明です。十分な長さ。' },
      { id: 'c', text: '新しい誤り1', correct: false, rationale: '誤りの理由の説明です。十分な長さ。' },
      { id: 'd', text: '新しい誤り2', correct: false, rationale: '誤りの理由の説明です。十分な長さ。' },
      { id: 'e', text: '新しい誤り3', correct: false, rationale: '誤りの理由の説明です。十分な長さ。' },
    ],
  }),
  makeQuestion({ id: 'saa-2.1-t-001', knowledgeRefs: ['2.1-K1'] }),
];

const T = Date.now() - 10 * 86_400_000;
const history = [
  answer(REMOVED, false, { at: T, selected: ['f'] }),
  answer(REWRITTEN, false, { at: T + 1000, selected: ['e'] }),
  answer('saa-2.1-t-001', false, { at: T + 2000 }),
  // 除外された問題を含む模試の結果
  answer(REMOVED, true, { at: T + 5000, mode: 'mock', sessionId: 'mock-old' }),
  answer(REWRITTEN, false, { at: T + 5000, mode: 'mock', sessionId: 'mock-old', selected: ['d'] }),
  event(
    'mock-result',
    { sessionId: 'mock-old', kind: 'random', questionIds: [REMOVED, REWRITTEN, 'saa-2.1-t-001'], answered: 2, correct: 1, total: 3, startedAt: T, elapsedMs: 60_000, timeLimitMs: 360_000 },
    T + 5000,
  ),
];

async function seed() {
  await db.events.bulkAdd(history);
  const now = Date.now();
  const practice: PracticeSession = {
    id: 'p-old',
    kind: 'practice',
    mode: 'practice',
    title: '演習',
    questionIds: [REMOVED, REWRITTEN],
    index: 0,
    results: {},
    createdAt: now,
    updatedAt: now,
  };
  const mock: MockSession = {
    id: 'm-open',
    kind: 'mock',
    mockKind: 'random',
    title: 'ランダム模試（3 問）',
    questionIds: [REMOVED, REWRITTEN, 'saa-2.1-t-001'],
    index: 0,
    answers: { [REMOVED]: ['a'], [REWRITTEN]: ['e'] },
    confidence: {},
    flags: { [REMOVED]: true },
    timeSpent: {},
    startedAt: now,
    timeLimitMs: 360_000,
    createdAt: now,
    updatedAt: now,
  };
  await db.sessions.bulkPut([practice, mock]);
}

const noCrash = () => expect(screen.queryByText('表示中に問題が起きました。')).not.toBeInTheDocument();

describe('コンテンツが変わったあとの画面', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(current));
    await seed();
  });

  it('ホームから再開できる（除外された問題は飛ばせる）', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: '続きから再開' })).toBeInTheDocument();
    noCrash();
  });

  it('演習の途中セッション: 除外された問題は案内を出す', async () => {
    renderApp('/session/p-old');
    expect(await screen.findByText(/現在のコンテンツにありません/)).toBeInTheDocument();
    noCrash();
  });

  it('模試の途中セッション: 除外された問題と書き換えられた問題があっても開ける', async () => {
    renderApp('/mock/session/m-open');
    expect(await screen.findByText(/この問題は現在のコンテンツにありません/)).toBeInTheDocument();
    noCrash();
  });

  it('模試の結果: 除外された問題を含んでも表示できる', async () => {
    renderApp('/mock/result/mock-old');
    expect(await screen.findByRole('heading', { name: /の結果/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全問の解説' })).toBeInTheDocument();
    noCrash();
  });

  it('弱点分析・復習・合格準備度・ホーム: 索引にない問題の回答は無視する', async () => {
    renderApp('/analysis');
    expect(await screen.findByRole('heading', { name: '判断軸別' })).toBeInTheDocument();
    noCrash();
    document.body.innerHTML = '';
    renderApp('/review');
    expect(await screen.findByText('今日の復習（概念）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /問を復習する/ })).toBeEnabled();
    noCrash();
    document.body.innerHTML = '';
    renderApp('/readiness');
    expect(await screen.findByRole('heading', { name: '合格準備度' })).toBeInTheDocument();
    noCrash();
  });
});
