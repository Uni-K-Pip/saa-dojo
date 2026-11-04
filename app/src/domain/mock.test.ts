import { describe, expect, it } from 'vitest';
import { buildHistory } from './history';
import { allocateByDomain, buildFixedMock, buildRandomMock, firstAttempt, gradeMock, mockReport, timeLimitMsFor } from './mock';
import { mulberry32 } from './rng';
import type { MockSession } from './session';
import { answer, event, makeQuestion, metaOf } from '../test/fixtures';

function many(domain: number, n: number, pool: 'practice' | 'mockA' | 'mockB' = 'practice', tag = 't') {
  return Array.from({ length: n }, (_, i) =>
    makeQuestion({ id: `saa-${domain}.1-${tag}-${String(i + 1).padStart(3, '0')}`, domain, taskStatement: `${domain}.1`, pool, knowledgeRefs: [`${domain}.1-K1`] }),
  );
}

describe('模擬試験の配分', () => {
  it('65 問はドメイン 1〜4 に 20・17・15・13 問', () => {
    expect(allocateByDomain(65)).toEqual({ 1: 20, 2: 17, 3: 15, 4: 13 });
  });

  it('ほかの問題数は比率で配分し、合計が指定どおりになる', () => {
    for (const n of [1, 5, 10, 30, 64, 100]) {
      const a = allocateByDomain(n);
      expect(Object.values(a).reduce((s, x) => s + x, 0)).toBe(n);
    }
    expect(allocateByDomain(5)).toEqual({ 1: 2, 2: 1, 3: 1, 4: 1 });
    expect(allocateByDomain(0)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });

  it('制限時間は 1 問あたり 2 分（65 問で 130 分）', () => {
    expect(timeLimitMsFor(65)).toBe(130 * 60_000);
    expect(timeLimitMsFor(5)).toBe(10 * 60_000);
  });
});

describe('ランダム模試の出題', () => {
  const pool = [...many(1, 30), ...many(2, 30), ...many(3, 30), ...many(4, 30)];
  const mocks = [...many(1, 20, 'mockA', 'ma'), ...many(2, 20, 'mockB', 'mb')];
  const basics = [makeQuestion({ id: 'saa-basics-t-001', domain: 0, taskStatement: 'basics', pool: 'basics', knowledgeRefs: ['basics-K1'] })];
  const index = [...pool, ...mocks, ...basics].map(metaOf);

  it('構成どおりに出し、保留模試と基礎講座の問題は出さない', () => {
    const ids = buildRandomMock(index, buildHistory([]), 65, mulberry32(7));
    expect(ids).toHaveLength(65);
    expect(new Set(ids).size).toBe(65);
    const byDomain = (d: number) => ids.filter((id) => id.startsWith(`saa-${d}.`)).length;
    expect([1, 2, 3, 4].map(byDomain)).toEqual([20, 17, 15, 13]);
    expect(ids.some((id) => id.includes('-ma-') || id.includes('-mb-') || id.includes('basics'))).toBe(false);
  });

  it('未回答の問題を優先する', () => {
    const answered = pool.filter((q) => q.domain === 1).slice(0, 25);
    const h = buildHistory(answered.map((q) => answer(q.id, true)));
    const ids = buildRandomMock(index, h, 65, mulberry32(3));
    const d1 = ids.filter((id) => id.startsWith('saa-1.'));
    // ドメイン 1 の未回答は 5 問。すべて含まれ、残り 15 問は回答済みから
    const unanswered = pool.filter((q) => q.domain === 1).slice(25).map((q) => q.id);
    for (const id of unanswered) expect(d1).toContain(id);
    expect(d1).toHaveLength(20);
  });

  it('あるドメインが足りなければほかのドメインで補い、全体が足りなければ出せる分だけ', () => {
    const small = [...many(1, 3), ...many(2, 30)].map(metaOf);
    const ids = buildRandomMock(small, buildHistory([]), 10, mulberry32(1));
    expect(ids).toHaveLength(10);
    expect(ids.filter((id) => id.startsWith('saa-1.'))).toHaveLength(3);
    expect(buildRandomMock(many(4, 4).map(metaOf), buildHistory([]), 65, mulberry32(1))).toHaveLength(4);
    expect(buildRandomMock([], buildHistory([]), 5, mulberry32(1))).toEqual([]);
  });

  it('保留模試はそのプールの問題だけを出す', () => {
    const ids = buildFixedMock(index, 'mockA', mulberry32(1));
    expect(ids).toHaveLength(20);
    expect(ids.every((id) => id.includes('-ma-'))).toBe(true);
  });

  it('保留模試が 65 問を超えるときは構成どおりに 65 問', () => {
    const big = [...many(1, 30, 'mockA'), ...many(2, 30, 'mockA'), ...many(3, 30, 'mockA'), ...many(4, 30, 'mockA')].map(metaOf);
    const ids = buildFixedMock(big, 'mockA', mulberry32(1));
    expect(ids).toHaveLength(65);
    expect([1, 2, 3, 4].map((d) => ids.filter((id) => id.startsWith(`saa-${d}.`)).length)).toEqual([20, 17, 15, 13]);
  });
});

describe('模擬試験の採点と結果', () => {
  const qs = many(1, 3);
  const questions = new Map(qs.map((q) => [q.id, q]));
  const session: MockSession = {
    id: 'mock-1',
    kind: 'mock',
    mockKind: 'random',
    title: 'ランダム模試',
    questionIds: qs.map((q) => q.id),
    index: 0,
    answers: { [qs[0]!.id]: ['a'], [qs[1]!.id]: ['b'] },
    confidence: { [qs[0]!.id]: 'sure' },
    flags: { [qs[1]!.id]: true },
    timeSpent: { [qs[0]!.id]: 40_000, [qs[1]!.id]: 80_000 },
    startedAt: 1_000_000,
    timeLimitMs: 6 * 60_000,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
  };

  it('回答した問題だけ回答イベントを作り、未回答は不正解として数える', () => {
    const evs = gradeMock(session, questions, 1_000_000 + 150_000);
    const answers = evs.filter((e) => e.type === 'answer');
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ correct: true, confidence: 'sure', mode: 'mock', durationMs: 40_000, flagged: false });
    expect(answers[1]).toMatchObject({ correct: false, mode: 'mock', flagged: true });
    expect(answers[1]).not.toHaveProperty('confidence');
    const result = evs.find((e) => e.type === 'mock-result');
    expect(result).toMatchObject({ answered: 2, correct: 1, total: 3, elapsedMs: 150_000 });
  });

  it('結果画面の集計をイベントログから組み立てる', () => {
    const evs = gradeMock(session, questions, 1_200_000).map((e, i) => ({ ...e, eventId: `e-${i}-xxxxxx`, deviceId: 'd', at: 1_200_000 }));
    const report = mockReport(evs as never, 'mock-1', qs.map(metaOf));
    expect(report?.byDomain).toEqual([{ domain: 1, correct: 1, total: 3 }]);
    expect(report?.questions.map((q) => q.correct)).toEqual([true, false, false]);
    expect(report?.questions[2]?.answer).toBeNull();
    expect(mockReport([], 'nope', [])).toBeNull();
  });

  it('保留模試の初回の結果を求める', () => {
    const a = event('mock-result', { sessionId: 'x1', kind: 'mockA', questionIds: [], answered: 0, correct: 50, total: 65, startedAt: 0, elapsedMs: 0, timeLimitMs: 0 }, 100);
    const b = event('mock-result', { sessionId: 'x2', kind: 'mockA', questionIds: [], answered: 0, correct: 60, total: 65, startedAt: 0, elapsedMs: 0, timeLimitMs: 0 }, 200);
    expect(firstAttempt([b, a], 'mockA')?.sessionId).toBe('x1');
    expect(firstAttempt([b, a], 'mockB')).toBeNull();
  });
});
