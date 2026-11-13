// 演習の出題選択。対象は演習プール（pool = practice）だけで、基礎講座と保留模試の問題は含めない。
import type { Difficulty, Qualifier, QuestionMeta, ServiceEntry } from '../content/types';
import type { History } from './history';
import { shuffle, type Rng } from './rng';

export type StatusFilter = 'unanswered' | 'wrong' | 'flagged';

export interface PracticeFilter {
  domains: number[];
  tasks: string[];
  services: string[];
  qualifiers: Qualifier[];
  difficulties: Difficulty[];
  /** いずれかに当てはまれば対象（空なら絞り込まない） */
  statuses: StatusFilter[];
}

export const EMPTY_FILTER: PracticeFilter = {
  domains: [],
  tasks: [],
  services: [],
  qualifiers: [],
  difficulties: [],
  statuses: [],
};

export const QUESTION_COUNTS = [10, 20, 30] as const;

export function practicePool(index: readonly QuestionMeta[]): QuestionMeta[] {
  return index.filter((q) => q.pool === 'practice');
}

function statusMatches(q: QuestionMeta, statuses: StatusFilter[], history: History): boolean {
  if (statuses.length === 0) return true;
  const h = history.questions.get(q.id);
  return statuses.some((s) => {
    if (s === 'unanswered') return !h;
    if (s === 'wrong') return !!h && !h.last.correct;
    return history.flags.get(q.id) ?? false;
  });
}

export function matchesFilter(q: QuestionMeta, f: PracticeFilter, history: History): boolean {
  if (f.domains.length && !f.domains.includes(q.domain)) return false;
  if (f.tasks.length && !f.tasks.includes(q.taskStatement)) return false;
  if (f.services.length && !q.services.some((s) => f.services.includes(s))) return false;
  if (f.qualifiers.length && !f.qualifiers.includes(q.qualifier)) return false;
  if (f.difficulties.length && !f.difficulties.includes(q.difficulty)) return false;
  return statusMatches(q, f.statuses, history);
}

export function filterPractice(index: readonly QuestionMeta[], f: PracticeFilter, history: History): QuestionMeta[] {
  return practicePool(index).filter((q) => matchesFilter(q, f, history));
}

/**
 * 候補から count 問を選ぶ。未回答 → 前回誤答 → 回答済み（前回の回答が古い順）の順に優先し、
 * 同じ優先度の中はランダムにする。
 */
export function pickQuestions(candidates: readonly QuestionMeta[], history: History, count: number, rng: Rng): string[] {
  const ranked = shuffle(candidates, rng).map((q, i) => {
    const h = history.questions.get(q.id);
    const rank = !h ? 0 : !h.last.correct ? 1 : 2;
    return { id: q.id, rank, lastAt: rank === 2 && h ? h.last.at : 0, i };
  });
  ranked.sort((a, b) => a.rank - b.rank || a.lastAt - b.lastAt || a.i - b.i);
  return ranked.slice(0, Math.max(0, count)).map((r) => r.id);
}

// ---------- URL のクエリとの相互変換（弱点分析などから条件付きで演習を開く） ----------
const LIST_KEYS = ['domains', 'tasks', 'services', 'qualifiers', 'difficulties', 'statuses'] as const;

export function filterToQuery(f: Partial<PracticeFilter>): string {
  const p = new URLSearchParams();
  for (const k of LIST_KEYS) {
    const v = f[k];
    if (v && v.length) p.set(k, v.join(','));
  }
  return p.toString();
}

export function filterFromQuery(params: URLSearchParams): PracticeFilter {
  const list = (k: string) => (params.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const nums = (k: string) => list(k).map(Number).filter((n) => Number.isInteger(n));
  return {
    domains: nums('domains').filter((n) => n >= 1 && n <= 4),
    tasks: list('tasks'),
    services: list('services'),
    qualifiers: list('qualifiers') as Qualifier[],
    difficulties: nums('difficulties').filter((n): n is Difficulty => n === 1 || n === 2 || n === 3),
    statuses: list('statuses').filter((s): s is StatusFilter => s === 'unanswered' || s === 'wrong' || s === 'flagged'),
  };
}

/**
 * 条件のサービス名を台帳の正規名に直す。問題の services 欄はビルドで正規名にそろえてあるので、
 * 古い表記（例: Amazon Simple Storage Service）の URL から開いても同じ問題が選ばれるようにする。台帳にない名前はそのまま残す。
 */
export function canonicalServiceFilter(f: PracticeFilter, entries: readonly ServiceEntry[]): PracticeFilter {
  if (entries.length === 0 || f.services.length === 0) return f;
  const toName = new Map<string, string>();
  for (const e of entries) toName.set(e.name, e.name);
  for (const e of entries) for (const a of e.aliases) if (!toName.has(a)) toName.set(a, e.name);
  return { ...f, services: [...new Set(f.services.map((s) => toName.get(s) ?? s))] };
}
