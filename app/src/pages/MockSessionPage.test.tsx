import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import type { MockSession } from '../domain/session';
import { makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const putMock = (s: MockSession) => db.sessions.put(s);

const questions = [
  ...[1, 2, 3, 4].flatMap((d) =>
    [1, 2].map((i) => makeQuestion({ id: `saa-${d}.1-t-00${i}`, domain: d, taskStatement: `${d}.1`, knowledgeRefs: [`${d}.1-K1`] })),
  ),
  makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' }),
];

describe('ミニ模試', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions));
  });

  it('5 問を解き、見直し画面から提出して結果と解説を見る', async () => {
    const user = userEvent.setup();
    renderApp('/mock');
    await user.click(await screen.findByRole('radio', { name: /ミニ 5 問/ }));
    await user.click(screen.getByRole('button', { name: '5 問で始める' }));

    // 1〜4 問目は正解を選び、2 問目にフラグを付ける。5 問目は未回答のまま
    for (let i = 1; i <= 4; i++) {
      expect(await screen.findByText(`問 ${i} / 5`)).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: /正しい選択肢/ }));
      if (i === 2) await user.click(screen.getByRole('button', { name: /見直しフラグを付ける/ }));
      await user.click(screen.getByRole('button', { name: '次へ →' }));
    }
    expect(await screen.findByText('問 5 / 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '見直しへ' }));

    const review = await screen.findByRole('heading', { name: '見直し' });
    const section = review.closest('section')!;
    expect(within(section).getByText(/回答済み 4 \/ 5 問 ・ 未回答 1 問 ・ フラグ 1 問/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '問 5' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '⚑ 問 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '提出する' }));
    await user.click(screen.getByRole('button', { name: '提出を確定する' }));

    expect(await screen.findByRole('heading', { name: 'ランダム模試の結果' })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ドメイン別' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全問の解説' })).toBeInTheDocument();

    const events = await db.events.toArray();
    const answers = events.filter((e) => e.type === 'answer');
    expect(answers).toHaveLength(4);
    expect(answers.every((e) => e.type === 'answer' && e.mode === 'mock' && !e.questionId.endsWith('-101'))).toBe(true);
    expect(events.filter((e) => e.type === 'mock-result')).toHaveLength(1);
  });

  it('検証済みの問題で65問を組めない保留模試は準備中で、解放も開始もできない', async () => {
    renderApp('/mock');
    expect(await screen.findAllByText('準備中（問題の検証中）')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /合格準備度の画面で解放/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '解く' })).not.toBeInTheDocument();
  });
});

// 本番形式（ドメイン別 20/17/15/13）で組める検証済みの保留模試 A
const fullMockA = [
  [1, 20],
  [2, 17],
  [3, 15],
  [4, 13],
].flatMap(([d, n]) =>
  Array.from({ length: n! }, (_, i) =>
    makeQuestion({ id: `saa-${d}.1-ma-${String(i + 1).padStart(3, '0')}`, domain: d!, taskStatement: `${d}.1`, pool: 'mockA', status: 'verified' }),
  ),
);

describe('保留模試の保護', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles([...questions, ...fullMockA]));
  });

  it('解放すると、開始前に確認を出してから始める', async () => {
    const user = userEvent.setup();
    renderApp('/readiness');
    await user.click(await screen.findByRole('button', { name: /保留模試 Aを解放/ }));
    await user.click(screen.getByRole('button', { name: '解放する' }));
    // B は検証済みの問題がないので準備中
    expect(screen.getByText('準備中（問題の検証中）')).toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: '解放済み・模擬試験へ' }));

    await user.click(await screen.findByRole('button', { name: '解く' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('130 分のタイマーは、画面を閉じても止まりません');
    expect(dialog).toHaveTextContent('この回が初回として記録され');
    expect(await db.sessions.count()).toBe(0);
    await user.click(within(dialog).getByRole('button', { name: '始める' }));
    expect(await screen.findByText('問 1 / 65')).toBeInTheDocument();
    const [s] = await db.sessions.toArray();
    expect(s).toMatchObject({ kind: 'mock', mockKind: 'mockA', timeLimitMs: 130 * 60_000 });
  });

  it('期限切れで未回答のセッションは採点せずに終え、その旨を表示する', async () => {
    const start = Date.now() - 3 * 3600_000;
    await putMock({
      id: 'old-1',
      kind: 'mock' as const,
      mockKind: 'mockA' as const,
      title: '保留模試 A',
      questionIds: fullMockA.map((q) => q.id),
      index: 0,
      answers: {},
      confidence: {},
      flags: {},
      timeSpent: {},
      startedAt: start,
      timeLimitMs: 130 * 60_000,
      createdAt: start,
      updatedAt: start,
    });
    renderApp('/mock/session/old-1');
    expect(await screen.findByText(/採点せずに終了しました/)).toBeInTheDocument();
    expect(await db.events.count()).toBe(0);
    expect((await db.sessions.get('old-1'))?.finishedAt).toEqual(expect.any(Number));
  });

  it('期限切れで回答のあるセッションは、締切の時刻で採点する', async () => {
    const start = Date.now() - 3 * 3600_000;
    const ids = fullMockA.slice(0, 5).map((q) => q.id);
    await putMock({
      id: 'old-2',
      kind: 'mock' as const,
      mockKind: 'random' as const,
      title: 'ミニ模試',
      questionIds: ids,
      index: 0,
      answers: { [ids[0]!]: ['a'] },
      confidence: {},
      flags: {},
      timeSpent: {},
      startedAt: start,
      timeLimitMs: 10 * 60_000,
      createdAt: start,
      updatedAt: start,
    });
    renderApp('/mock/session/old-2');
    expect(await screen.findByRole('heading', { name: /の結果/ })).toBeInTheDocument();
    const result = (await db.events.toArray()).find((e) => e.type === 'mock-result');
    expect(result?.at).toBe(start + 10 * 60_000);
  });
});
