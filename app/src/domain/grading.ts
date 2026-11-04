import type { Question } from '../content/types';
import { rngFromString, shuffle } from './rng';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function correctIds(q: Pick<Question, 'options'>): string[] {
  return q.options.filter((o) => o.correct).map((o) => o.id);
}

/** 正解の選択肢をちょうどすべて選んだときだけ正解（部分点なし） */
export function isCorrectSelection(q: Pick<Question, 'options'>, selected: readonly string[]): boolean {
  const want = new Set(correctIds(q));
  const got = new Set(selected);
  if (want.size !== got.size) return false;
  for (const id of got) if (!want.has(id)) return false;
  return true;
}

/** セッションごとに選択肢を並べ替える（同じセッション内では同じ順序） */
export function optionOrder(sessionId: string, q: Pick<Question, 'id' | 'options'>): string[] {
  return shuffle(
    q.options.map((o) => o.id),
    rngFromString(`${sessionId}:${q.id}`),
  );
}

/** 表示順での記号（例: ['c', 'a'] → 'A, C'） */
export function lettersFor(order: readonly string[], ids: readonly string[]): string {
  return ids
    .map((id) => order.indexOf(id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
    .map((i) => LETTERS[i])
    .join(', ');
}
