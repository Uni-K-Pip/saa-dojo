// 模擬試験の出題と採点
import type { Question, QuestionMeta } from '../content/types';
import type { AppEvent, AnswerEvent, MockKind, MockResultEvent, NewEvent } from './events';
import { isCorrectSelection } from './grading';
import type { History } from './history';
import { shuffle, type Rng } from './rng';
import { pickQuestions } from './selection';
import type { MockSession } from './session';

/** 本番の 65 問をドメイン比重（30/26/24/20%）で割り振った数 */
export const DEFAULT_COMPOSITION: Record<number, number> = { 1: 20, 2: 17, 3: 15, 4: 13 };
export const FULL_MOCK_SIZE = 65;
export const FULL_MOCK_MINUTES = 130;
export const MINUTES_PER_QUESTION = FULL_MOCK_MINUTES / FULL_MOCK_SIZE;

export const MOCK_SIZES = [65, 30, 10, 5] as const;

export function timeLimitMsFor(count: number): number {
  return Math.round(count * MINUTES_PER_QUESTION * 60_000);
}

/**
 * total 問をドメインに割り振る。65 問なら構成どおり、それ以外は構成の比率で最大剰余法により配分する。
 */
export function allocateByDomain(total: number, composition: Record<number, number> = DEFAULT_COMPOSITION): Record<number, number> {
  const domains = Object.keys(composition)
    .map(Number)
    .sort((a, b) => a - b);
  const sum = domains.reduce((s, d) => s + (composition[d] ?? 0), 0);
  const out: Record<number, number> = {};
  if (sum <= 0 || total <= 0) {
    for (const d of domains) out[d] = 0;
    return out;
  }
  const raw = domains.map((d) => ({ d, exact: (total * (composition[d] ?? 0)) / sum }));
  let assigned = 0;
  for (const r of raw) {
    out[r.d] = Math.floor(r.exact);
    assigned += out[r.d]!;
  }
  const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.d - b.d);
  for (let i = 0; assigned < total; i = (i + 1) % order.length) {
    out[order[i]!.d]!++;
    assigned++;
  }
  return out;
}

/**
 * ランダム模試の問題を選ぶ。演習プールだけを使い、各ドメインで未回答を優先する。
 * あるドメインの問題が足りないときは、ほかのドメインの残りで補う（全体が足りなければ出せる分だけ）。
 */
export function buildRandomMock(
  index: readonly QuestionMeta[],
  history: History,
  size: number,
  rng: Rng,
  composition: Record<number, number> = DEFAULT_COMPOSITION,
): string[] {
  const pool = index.filter((q) => q.pool === 'practice');
  const targets = allocateByDomain(size, composition);
  const chosen: string[] = [];
  const leftovers: QuestionMeta[] = [];
  for (const d of Object.keys(targets).map(Number)) {
    const inDomain = pool.filter((q) => q.domain === d);
    const ranked = pickQuestions(inDomain, history, inDomain.length, rng);
    const take = ranked.slice(0, targets[d]);
    chosen.push(...take);
    const taken = new Set(take);
    leftovers.push(...inDomain.filter((q) => !taken.has(q.id)));
  }
  // 構成にないドメインの問題も補充の候補にする
  const known = new Set(Object.keys(targets).map(Number));
  leftovers.push(...pool.filter((q) => !known.has(q.domain)));
  if (chosen.length < size && leftovers.length) {
    chosen.push(...pickQuestions(leftovers, history, size - chosen.length, rng));
  }
  return shuffle(chosen, rng);
}

/** 最大剰余法: total を重みに比例して配分する（重みの合計より多くは配らない） */
export function largestRemainder<K extends string | number>(total: number, weights: readonly (readonly [K, number])[]): Map<K, number> {
  const out = new Map<K, number>(weights.map(([k]) => [k, 0]));
  const sum = weights.reduce((n, [, w]) => n + Math.max(0, w), 0);
  const want = Math.min(Math.max(0, total), sum);
  if (want === 0) return out;
  const raw = weights.map(([k, w], i) => ({ k, i, exact: (want * Math.max(0, w)) / sum }));
  let assigned = 0;
  for (const r of raw) {
    const f = Math.floor(r.exact);
    out.set(r.k, f);
    assigned += f;
  }
  const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || a.i - b.i);
  for (let i = 0; assigned < want; i = (i + 1) % order.length) {
    const r = order[i]!;
    out.set(r.k, out.get(r.k)! + 1);
    assigned++;
  }
  return out;
}

export interface FixedMockPlan {
  /** 出題する問題（タスク内は ID 順。毎回同じ組み合わせ） */
  ids: string[];
  /** 本番形式（65 問、ドメイン別 20/17/15/13）で組めるか */
  ready: boolean;
  /** 検証済みの問題数 / プール全体の問題数 */
  verified: number;
  total: number;
  /** ドメイン別: 出題する数 / 必要な数 */
  byDomain: { domain: number; count: number; need: number }[];
}

/**
 * 保留模試（mockA・mockB）の構成。検証済み（verified）の問題だけを使う。
 * 各ドメインの枠を、タスクごとの問題数に比例して配分し（最大剰余法）、タスクの中は ID 順に取る。
 */
export function planFixedMock(
  index: readonly QuestionMeta[],
  kind: 'mockA' | 'mockB',
  composition: Record<number, number> = DEFAULT_COMPOSITION,
): FixedMockPlan {
  const all = index.filter((q) => q.pool === kind);
  const pool = all.filter((q) => q.status === 'verified').sort((a, b) => (a.id < b.id ? -1 : 1));
  const ids: string[] = [];
  const byDomain: FixedMockPlan['byDomain'] = [];
  for (const d of Object.keys(composition).map(Number).sort((a, b) => a - b)) {
    const need = composition[d] ?? 0;
    const inDomain = pool.filter((q) => q.domain === d);
    const tasks = [...new Set(inDomain.map((q) => q.taskStatement))].sort();
    const quota = largestRemainder(
      need,
      tasks.map((t) => [t, inDomain.filter((q) => q.taskStatement === t).length] as const),
    );
    let count = 0;
    for (const t of tasks) {
      const take = inDomain.filter((q) => q.taskStatement === t).slice(0, quota.get(t) ?? 0);
      ids.push(...take.map((q) => q.id));
      count += take.length;
    }
    byDomain.push({ domain: d, count, need });
  }
  const size = Object.values(composition).reduce((n, x) => n + x, 0);
  const ready = ids.length === size && byDomain.every((b) => b.count === b.need);
  return { ids, ready, verified: pool.length, total: all.length, byDomain };
}

/** 準備中の理由（検証済みの問題が足りないドメイン） */
export function fixedMockShortage(plan: FixedMockPlan): string {
  const short = plan.byDomain.filter((b) => b.count < b.need).map((b) => `ドメイン ${b.domain}: ${b.count}/${b.need} 問`);
  return `検証済みの問題（${plan.verified}/${plan.total} 問）で本番形式の 65 問を組めるようになると解放できます。不足: ${short.join('、')}`;
}

/** 保留模試の問題（並びはランダム、組み合わせは毎回同じ） */
export function buildFixedMock(
  index: readonly QuestionMeta[],
  kind: 'mockA' | 'mockB',
  rng: Rng,
  composition: Record<number, number> = DEFAULT_COMPOSITION,
): string[] {
  return shuffle(planFixedMock(index, kind, composition).ids, rng);
}

export function modeForKind(kind: MockKind): AnswerEvent['mode'] {
  return kind === 'random' ? 'mock' : kind;
}

/** 提出: 回答した問題の回答イベントと、模試の結果イベントを作る */
export function gradeMock(session: MockSession, questions: Map<string, Question>, now: number): NewEvent[] {
  // 締切を過ぎてから開いたときも、締切の時刻で採点する
  const at = Math.min(now, session.startedAt + session.timeLimitMs);
  const events: NewEvent[] = [];
  let answered = 0;
  let correct = 0;
  for (const qid of session.questionIds) {
    const selected = session.answers[qid] ?? [];
    const q = questions.get(qid);
    if (selected.length === 0) continue;
    answered++;
    const ok = q ? isCorrectSelection(q, selected) : false;
    if (ok) correct++;
    const confidence = session.confidence[qid];
    events.push({
      type: 'answer',
      questionId: qid,
      selected,
      correct: ok,
      ...(confidence ? { confidence } : {}),
      mode: modeForKind(session.mockKind),
      sessionId: session.id,
      durationMs: Math.round(session.timeSpent[qid] ?? 0),
      flagged: !!session.flags[qid],
      at,
    });
  }
  events.push({
    type: 'mock-result',
    sessionId: session.id,
    kind: session.mockKind,
    questionIds: session.questionIds,
    answered,
    correct,
    total: session.questionIds.length,
    startedAt: session.startedAt,
    elapsedMs: Math.max(0, at - session.startedAt),
    timeLimitMs: session.timeLimitMs,
    at,
  });
  return events;
}

export interface MockQuestionResult {
  questionId: string;
  answer: AnswerEvent | null;
  correct: boolean;
}

export interface MockReport {
  result: MockResultEvent;
  questions: MockQuestionResult[];
  byDomain: { domain: number; correct: number; total: number }[];
  averageMs: number;
}

/** 結果画面のための集計（イベントログから組み立てる） */
export function mockReport(events: readonly AppEvent[], sessionId: string, index: readonly QuestionMeta[]): MockReport | null {
  const result = events.find((e): e is MockResultEvent => e.type === 'mock-result' && e.sessionId === sessionId);
  if (!result) return null;
  const answers = new Map<string, AnswerEvent>();
  for (const e of events) if (e.type === 'answer' && e.sessionId === sessionId) answers.set(e.questionId, e);
  const meta = new Map(index.map((m) => [m.id, m]));
  const questions = result.questionIds.map((questionId) => {
    const answer = answers.get(questionId) ?? null;
    return { questionId, answer, correct: !!answer?.correct };
  });
  const domains = new Map<number, { correct: number; total: number }>();
  for (const q of questions) {
    const d = meta.get(q.questionId)?.domain ?? 0;
    const row = domains.get(d) ?? { correct: 0, total: 0 };
    row.total++;
    if (q.correct) row.correct++;
    domains.set(d, row);
  }
  return {
    result,
    questions,
    byDomain: [...domains].sort((a, b) => a[0] - b[0]).map(([domain, r]) => ({ domain, ...r })),
    averageMs: result.total ? result.elapsedMs / result.total : 0,
  };
}

/** 模試の結果を新しい順に */
export function mockResults(events: readonly AppEvent[], kind?: MockKind): MockResultEvent[] {
  return events
    .filter((e): e is MockResultEvent => e.type === 'mock-result' && (!kind || e.kind === kind))
    .sort((a, b) => b.at - a.at);
}

/** 保留模試の初回の結果（本番形式の 65 問に満たない回と、1問も答えていない回は数えない） */
export function firstAttempt(events: readonly AppEvent[], kind: 'mockA' | 'mockB'): MockResultEvent | null {
  const list = events.filter((e): e is MockResultEvent => e.type === 'mock-result' && e.kind === kind && e.total >= FULL_MOCK_SIZE && e.answered > 0).sort((a, b) => a.at - b.at || (a.eventId < b.eventId ? -1 : 1));
  return list[0] ?? null;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
