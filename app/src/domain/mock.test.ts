import { describe, expect, it } from 'vitest';
import { buildHistory } from './history';
import { allocateByDomain, buildFixedMock, buildRandomMock, largestRemainder, planFixedMock, firstAttempt, gradeMock, mockReport, timeLimitMsFor } from './mock';
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

  it('保留模試はそのプールの検証済みの問題だけを出す', () => {
    const verified = many(1, 20, 'mockA', 'ma').map((q) => metaOf({ ...q, status: 'verified' }));
    const ids = buildFixedMock([...index, ...verified], 'mockA', mulberry32(1));
    expect(ids).toHaveLength(20);
    expect(ids.every((id) => id.includes('-ma-'))).toBe(true);
    // 未検証（pending）の問題は使わない
    expect(buildFixedMock(index, 'mockA', mulberry32(1))).toEqual([]);
  });

  it('保留模試が 65 問を超えるときは構成どおりに 65 問', () => {
    const big = [...many(1, 30, 'mockA'), ...many(2, 30, 'mockA'), ...many(3, 30, 'mockA'), ...many(4, 30, 'mockA')].map((q) => metaOf({ ...q, status: 'verified' }));
    const ids = buildFixedMock(big, 'mockA', mulberry32(1));
    expect(ids).toHaveLength(65);
    expect([1, 2, 3, 4].map((d) => ids.filter((id) => id.startsWith(`saa-${d}.`)).length)).toEqual([20, 17, 15, 13]);
  });
});

describe('保留模試の構成', () => {
  // ドメインごとに複数のタスク。タスクの問題数に比例して配分する
  function tasks(domain: number, counts: number[], status: 'verified' | 'pending' = 'verified') {
    return counts.flatMap((n, t) =>
      Array.from({ length: n }, (_, i) =>
        metaOf(
          makeQuestion({
            id: `saa-${domain}.${t + 1}-ma-${String(i + 1 + (status === 'pending' ? 500 : 0)).padStart(3, '0')}`,
            domain,
            taskStatement: `${domain}.${t + 1}`,
            pool: 'mockA',
            status,
          }),
        ),
      ),
    );
  }
  const full = [...tasks(1, [7, 7, 7, 3]), ...tasks(2, [9, 9]), ...tasks(3, [5, 5, 5, 3, 2]), ...tasks(4, [6, 6, 4])];

  it('ドメインの枠をタスクの問題数に比例して配分し、どのタスクも出す', () => {
    const plan = planFixedMock(full, 'mockA');
    expect(plan.ready).toBe(true);
    expect(plan.ids).toHaveLength(65);
    expect(plan.byDomain.map((d) => d.count)).toEqual([20, 17, 15, 13]);
    const perTask = (t: string) => plan.ids.filter((id) => id.startsWith(`saa-${t}-`)).length;
    // ドメイン 1: 20 × (7,7,7,3)/24 = 5.83,5.83,5.83,2.5 → 6,6,6,2（端数の大きい順）
    expect(['1.1', '1.2', '1.3', '1.4'].map(perTask)).toEqual([6, 6, 6, 2]);
    // ドメイン 3: 15 × (5,5,5,3,2)/20 = 3.75,3.75,3.75,2.25,1.5 → 4,4,4,2,1
    expect(['3.1', '3.2', '3.3', '3.4', '3.5'].map(perTask)).toEqual([4, 4, 4, 2, 1]);
    // タスクの中は ID 順で、毎回同じ組み合わせ
    expect(plan.ids.filter((id) => id.startsWith('saa-3.5-'))).toEqual(['saa-3.5-ma-001']);
    expect(new Set(buildFixedMock(full, 'mockA', mulberry32(1)))).toEqual(new Set(buildFixedMock(full, 'mockA', mulberry32(9))));
  });

  it('枠に足りないドメインがあれば準備中（未検証の問題は数えない）', () => {
    const short = [...tasks(1, [7, 7, 5]), ...tasks(2, [9, 9]), ...tasks(3, [5, 5, 5]), ...tasks(4, [6, 6, 4]), ...tasks(1, [0, 0, 0, 5], 'pending')];
    const plan = planFixedMock(short, 'mockA');
    expect(plan.ready).toBe(false);
    expect(plan.byDomain[0]).toEqual({ domain: 1, count: 19, need: 20 });
    expect(plan).toMatchObject({ verified: 68, total: 73 });
  });

  it('最大剰余法は合計を守り、重みより多くは配らない', () => {
    expect([...largestRemainder(5, [['a', 1], ['b', 1]]).values()]).toEqual([1, 1]);
    expect([...largestRemainder(3, [['a', 2], ['b', 2], ['c', 2]]).values()]).toEqual([1, 1, 1]);
    expect([...largestRemainder(0, [['a', 2]]).values()]).toEqual([0]);
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

  it('保留模試の初回の結果を求める（65 問未満の回と、回答 0 件の回は数えない）', () => {
    const r = (sessionId: string, at: number, total: number, answered: number) =>
      event('mock-result', { sessionId, kind: 'mockA', questionIds: [], answered, correct: Math.min(answered, 50), total, startedAt: 0, elapsedMs: 0, timeLimitMs: 0 }, at);
    const short = r('x0', 50, 17, 17);
    const empty = r('x00', 60, 65, 0);
    const a = r('x1', 100, 65, 60);
    const b = r('x2', 200, 65, 65);
    expect(firstAttempt([b, a, short, empty], 'mockA')?.sessionId).toBe('x1');
    expect(firstAttempt([short, empty], 'mockA')).toBeNull();
    expect(firstAttempt([b, a], 'mockB')).toBeNull();
  });

  it('締切を過ぎてから採点しても、時刻は締切にする', () => {
    const deadline = session.startedAt + session.timeLimitMs;
    const late = gradeMock(session, questions, deadline + 3 * 3600_000);
    expect(late.every((e) => e.at === deadline)).toBe(true);
    expect(late.find((e) => e.type === 'mock-result')).toMatchObject({ elapsedMs: session.timeLimitMs });
  });
});
