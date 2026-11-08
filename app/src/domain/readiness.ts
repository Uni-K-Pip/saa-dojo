// 合格準備度。換算スコアは根拠がないので出さず、4つの条件の達成度を示す。
//  1. 保留模試 A・B がどちらも初回で 80% 以上
//  2. すべてのドメインで、難易度 2〜3 の初回正答率が 70% 以上
//  3. blueprint の項目の 90% 以上に回答済み
//  4. 自信度「確信」で間違えた割合が 10% 以下
import type { BlueprintSummary, QuestionMeta } from '../content/types';
import { domainItemIds } from './blueprint';
import type { AppEvent } from './events';
import type { History } from './history';
import { firstAttempt } from './mock';
import { answeredItems } from './progress';

export const MOCK_PASS = 0.8;
export const DOMAIN_PASS = 0.7;
export const COVERAGE_PASS = 0.9;
export const OVERCONFIDENT_MAX = 0.1;
/** 条件 2 の判定に必要な、ドメインごとの最低回答数（問題がそれより少なければその数） */
export const DOMAIN_MIN_SAMPLE = 10;
/** 条件 4 の判定に必要な「確信」の最低回答数 */
export const CONFIDENT_MIN_SAMPLE = 20;

export type ConditionId = 'mocks' | 'domains' | 'coverage' | 'overconfidence';

export interface Condition {
  id: ConditionId;
  label: string;
  achieved: boolean;
  /** 達成度 0〜1 */
  progress: number;
  detail: string;
}

export interface DomainStat {
  domain: number;
  /** 難易度 2〜3 の初回回答 */
  hardFirst: { answered: number; correct: number; available: number };
  /** すべての難易度の初回回答 */
  allFirst: { answered: number; correct: number };
  items: { covered: number; total: number };
}

export interface Readiness {
  conditions: Condition[];
  achievedCount: number;
  domains: DomainStat[];
  mocks: { kind: 'mockA' | 'mockB'; rate: number | null; available: number }[];
  overconfidence: { sure: number; wrong: number };
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function computeReadiness(events: readonly AppEvent[], index: readonly QuestionMeta[], history: History, bp: BlueprintSummary | null): Readiness {
  // 1. 保留模試
  const mocks = (['mockA', 'mockB'] as const).map((kind) => {
    const r = firstAttempt(events, kind);
    return { kind, rate: r ? r.correct / Math.max(1, r.total) : null, available: index.filter((q) => q.pool === kind).length };
  });
  const mockProgress = mocks.reduce((s, m) => s + (m.rate === null ? 0 : clamp(m.rate / MOCK_PASS)), 0) / mocks.length;
  const mocksOk = mocks.every((m) => m.rate !== null && m.rate >= MOCK_PASS);
  const label = (k: string) => (k === 'mockA' ? 'A' : 'B');

  // 2. ドメイン別（基礎講座を除く）
  const covered = answeredItems(index, history);
  const domainIds = bp ? bp.domains.map((d) => d.id) : [1, 2, 3, 4];
  const domains: DomainStat[] = domainIds.map((d) => {
    const qs = index.filter((q) => q.domain === d && q.pool !== 'basics');
    const hard = qs.filter((q) => q.difficulty >= 2);
    let ha = 0;
    let hc = 0;
    let aa = 0;
    let ac = 0;
    for (const q of qs) {
      const h = history.questions.get(q.id);
      if (!h) continue;
      aa++;
      if (h.first.correct) ac++;
      if (q.difficulty >= 2) {
        ha++;
        if (h.first.correct) hc++;
      }
    }
    const items = domainItemIds(bp, d);
    return {
      domain: d,
      hardFirst: { answered: ha, correct: hc, available: hard.length },
      allFirst: { answered: aa, correct: ac },
      items: { covered: items.filter((i) => covered.has(i)).length, total: items.length },
    };
  });
  const need = (s: DomainStat) => Math.max(1, Math.min(DOMAIN_MIN_SAMPLE, s.hardFirst.available));
  const domainOk = (s: DomainStat) => s.hardFirst.answered >= need(s) && s.hardFirst.correct / s.hardFirst.answered >= DOMAIN_PASS;
  const domainProgress = (s: DomainStat) => {
    if (s.hardFirst.answered === 0) return 0;
    const sample = clamp(s.hardFirst.answered / need(s));
    return sample * clamp(s.hardFirst.correct / s.hardFirst.answered / DOMAIN_PASS);
  };
  const domainsOk = domains.length > 0 && domains.every(domainOk);
  const weak = domains.filter((s) => !domainOk(s)).map((s) => s.domain);

  // 3. 網羅
  const allItems = domainItemIds(bp);
  const coveredCount = allItems.filter((i) => covered.has(i)).length;
  const coverage = allItems.length ? coveredCount / allItems.length : 0;

  // 4. 「確信」で間違えた割合（すべての回答）
  let sure = 0;
  let sureWrong = 0;
  for (const e of events) {
    if (e.type !== 'answer' || e.confidence !== 'sure') continue;
    sure++;
    if (!e.correct) sureWrong++;
  }
  const overRate = sure ? sureWrong / sure : 0;
  const overOk = sure >= CONFIDENT_MIN_SAMPLE && overRate <= OVERCONFIDENT_MAX;
  const overProgress = clamp(sure / CONFIDENT_MIN_SAMPLE) * (overRate <= OVERCONFIDENT_MAX ? 1 : clamp(OVERCONFIDENT_MAX / overRate));

  const conditions: Condition[] = [
    {
      id: 'mocks',
      label: '保留模試 A・B がどちらも初回で 80% 以上',
      achieved: mocksOk,
      progress: mocksOk ? 1 : mockProgress,
      detail: mocks.map((m) => `模試 ${label(m.kind)}: ${m.rate === null ? '未受験' : pct(m.rate)}`).join('・'),
    },
    {
      id: 'domains',
      label: 'すべてのドメインで、難易度 2〜3 の初回正答率が 70% 以上',
      achieved: domainsOk,
      progress: domainsOk ? 1 : domains.reduce((s, d) => s + domainProgress(d), 0) / Math.max(1, domains.length),
      detail: domainsOk
        ? 'すべてのドメインで達成'
        : `未達のドメイン: ${weak.join('・')}（各ドメイン ${DOMAIN_MIN_SAMPLE} 問以上の初回回答で判定）`,
    },
    {
      id: 'coverage',
      label: '出題範囲の項目の 90% 以上に回答済み',
      achieved: coverage >= COVERAGE_PASS,
      progress: clamp(coverage / COVERAGE_PASS),
      detail: `${coveredCount} / ${allItems.length} 項目（${pct(coverage)}）`,
    },
    {
      id: 'overconfidence',
      label: '自信度「確信」で間違えた割合が 10% 以下',
      achieved: overOk,
      progress: overOk ? 1 : overProgress,
      detail:
        sure < CONFIDENT_MIN_SAMPLE
          ? `「確信」の回答 ${sure} 件（${CONFIDENT_MIN_SAMPLE} 件以上で判定）${sure ? `・誤り ${pct(overRate)}` : ''}`
          : `「確信」の回答 ${sure} 件のうち誤り ${sureWrong} 件（${pct(overRate)}）`,
    },
  ];
  return {
    conditions,
    achievedCount: conditions.filter((c) => c.achieved).length,
    domains,
    mocks,
    overconfidence: { sure, wrong: sureWrong },
  };
}

// ---------- 1日の目標 ----------
const DAY = 86_400_000;

export function daysUntil(examDate: string, now: number): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate);
  if (!m) return null;
  const exam = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((exam - today.getTime()) / DAY);
}

export const DEFAULT_DAILY_GOAL = 20;
export const MIN_DAILY_GOAL = 10;

/**
 * 1日の目標問題数。設定で決めていればその値、試験日があれば未回答の問題を残りの日数で割る
 * （最後の 3 日は見直しに残す）。どちらもなければ既定値。
 */
export function dailyGoal(opts: { dailyGoal: number | null; examDate: string | null; unanswered: number; now: number }): {
  goal: number;
  daysLeft: number | null;
  source: 'setting' | 'exam' | 'default';
} {
  const daysLeft = opts.examDate ? daysUntil(opts.examDate, opts.now) : null;
  if (opts.dailyGoal) return { goal: opts.dailyGoal, daysLeft, source: 'setting' };
  if (daysLeft !== null && daysLeft > 0) {
    const studyDays = Math.max(1, daysLeft - 3);
    return { goal: Math.max(MIN_DAILY_GOAL, Math.ceil(opts.unanswered / studyDays)), daysLeft, source: 'exam' };
  }
  return { goal: DEFAULT_DAILY_GOAL, daysLeft, source: 'default' };
}

/** 今日（端末のタイムゾーン）に回答した数（模試を含む） */
export function answeredToday(events: readonly AppEvent[], now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  return events.filter((e) => e.type === 'answer' && e.at >= start && e.at <= now + 60_000).length;
}
