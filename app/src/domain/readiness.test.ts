import { describe, expect, it } from 'vitest';
import type { QuestionMeta } from '../content/types';
import { answer, event, makeBlueprint, makeQuestion, metaOf } from '../test/fixtures';
import type { AppEvent } from './events';
import { buildHistory } from './history';
import { answeredToday, computeReadiness, dailyGoal, daysUntil } from './readiness';

const bp = makeBlueprint();
// 各ドメインに難易度 2 の問題を 10 問、項目は K1/K2 に振る
function makeIndex(): QuestionMeta[] {
  const tasks = ['1.1', '1.2', '2.1', '3.1', '4.1'];
  const out: QuestionMeta[] = [];
  for (const t of tasks) {
    const n = t.startsWith('1') ? 5 : 10;
    for (let i = 1; i <= n; i++) {
      out.push(metaOf(makeQuestion({ id: `saa-${t}-t-${String(i).padStart(3, '0')}`, knowledgeRefs: [`${t}-K${(i % 2) + 1}`] })));
    }
  }
  out.push(metaOf(makeQuestion({ id: 'saa-1.1-t-900', pool: 'mockA' })));
  out.push(metaOf(makeQuestion({ id: 'saa-1.1-t-901', pool: 'mockB' })));
  return out;
}

function mockResult(kind: 'mockA' | 'mockB', correct: number, total: number, at?: number): AppEvent {
  return event('mock-result', { sessionId: `m-${kind}-${at ?? 0}`, kind, questionIds: [], answered: total, correct, total, startedAt: 0, elapsedMs: 0, timeLimitMs: 0 }, at);
}

const r = (events: AppEvent[], index = makeIndex()) => computeReadiness(events, index, buildHistory(events), bp);

describe('合格準備度', () => {
  it('何もしていなければどの条件も未達', () => {
    const res = r([]);
    expect(res.achievedCount).toBe(0);
    expect(res.conditions.map((c) => c.progress)).toEqual([0, 0, 0, 0]);
  });

  it('保留模試は初回の結果で判定する（2回目以降は使わない）', () => {
    const a = r([mockResult('mockA', 50, 65, 1000), mockResult('mockA', 65, 65, 2000), mockResult('mockB', 55, 65, 1500)]);
    const c = a.conditions.find((x) => x.id === 'mocks')!;
    expect(c.achieved).toBe(false);
    const b = r([mockResult('mockA', 53, 65, 1000), mockResult('mockB', 52, 65, 1500)]);
    expect(b.conditions.find((x) => x.id === 'mocks')!.achieved).toBe(true);
  });

  it('ドメインの条件は難易度2〜3の初回正答率と最低回答数で判定する', () => {
    const index = makeIndex();
    const events: AppEvent[] = [];
    for (const q of index.filter((m) => m.pool === 'practice')) {
      // 初回は 8 割正解、2 回目は全部正解（初回だけを見る）
      const n = Number(q.id.slice(-3));
      events.push(answer(q.id, n % 5 !== 0));
      events.push(answer(q.id, true));
    }
    const res = r(events, index);
    const c = res.conditions.find((x) => x.id === 'domains')!;
    expect(c.achieved).toBe(true);
    expect(res.domains.find((d) => d.domain === 2)!.hardFirst).toEqual({ answered: 10, correct: 8, available: 10 });

    // ドメイン 4 だけ回答数が足りない
    const fewer = events.filter((e) => !(e.type === 'answer' && e.questionId.startsWith('saa-4.1') && Number(e.questionId.slice(-3)) > 5));
    const res2 = r(fewer, index);
    expect(res2.conditions.find((x) => x.id === 'domains')!.achieved).toBe(false);
    expect(res2.conditions.find((x) => x.id === 'domains')!.detail).toContain('4');
  });

  it('網羅は blueprint の項目（基礎講座を除く）の回答済みの割合', () => {
    const index = makeIndex();
    // 10 項目のうち 9 項目
    const ids = ['saa-1.1-t-001', 'saa-1.1-t-002', 'saa-1.2-t-001', 'saa-1.2-t-002', 'saa-2.1-t-001', 'saa-2.1-t-002', 'saa-3.1-t-001', 'saa-3.1-t-002', 'saa-4.1-t-001'];
    const res = r(
      ids.map((id) => answer(id, false)),
      index,
    );
    const c = res.conditions.find((x) => x.id === 'coverage')!;
    expect(c.detail).toContain('9 / 10');
    expect(c.achieved).toBe(true);
    const res2 = r(
      ids.slice(0, 8).map((id) => answer(id, true)),
      index,
    );
    expect(res2.conditions.find((x) => x.id === 'coverage')!.achieved).toBe(false);
  });

  it('「確信」の誤答率は 20 件以上で判定する', () => {
    const sure = (ok: boolean) => answer('saa-2.1-t-001', ok, { confidence: 'sure' });
    const few = r(Array.from({ length: 10 }, () => sure(true)));
    expect(few.conditions.find((x) => x.id === 'overconfidence')!.achieved).toBe(false);
    expect(few.conditions.find((x) => x.id === 'overconfidence')!.progress).toBeCloseTo(0.5);
    const ok = r([...Array.from({ length: 18 }, () => sure(true)), sure(false), sure(false), answer('saa-2.1-t-002', false, { confidence: 'guess' })]);
    expect(ok.overconfidence).toEqual({ sure: 20, wrong: 2 });
    expect(ok.conditions.find((x) => x.id === 'overconfidence')!.achieved).toBe(true);
    const ng = r([...Array.from({ length: 17 }, () => sure(true)), sure(false), sure(false), sure(false)]);
    expect(ng.conditions.find((x) => x.id === 'overconfidence')!.achieved).toBe(false);
  });
});

describe('1日の目標', () => {
  const now = new Date(2026, 10, 8, 12).getTime();
  it('試験日までの日数', () => {
    expect(daysUntil('2026-11-18', now)).toBe(10);
    expect(daysUntil('2026-11-08', now)).toBe(0);
    expect(daysUntil('bad', now)).toBeNull();
  });
  it('設定値 → 試験日からの逆算 → 既定値の順', () => {
    expect(dailyGoal({ dailyGoal: 15, examDate: '2026-11-18', unanswered: 500, now })).toMatchObject({ goal: 15, source: 'setting' });
    expect(dailyGoal({ dailyGoal: null, examDate: '2026-11-18', unanswered: 140, now })).toMatchObject({ goal: 20, daysLeft: 10, source: 'exam' });
    expect(dailyGoal({ dailyGoal: null, examDate: '2026-11-18', unanswered: 7, now })).toMatchObject({ goal: 10 });
    expect(dailyGoal({ dailyGoal: null, examDate: null, unanswered: 7, now })).toMatchObject({ goal: 20, source: 'default' });
  });
  it('今日の回答数', () => {
    const today = answer('saa-1.1-t-001', true, { at: now - 3600_000 });
    const yesterday = answer('saa-1.1-t-001', true, { at: now - 86_400_000 });
    expect(answeredToday([today, yesterday], now)).toBe(1);
  });
});
