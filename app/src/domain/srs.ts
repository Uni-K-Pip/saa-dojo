// 間隔反復（ts-fsrs）。概念の復習とフラッシュカードで共通に使う。
// 端末をまたいで同じ結果になるよう、ゆらぎ（fuzz）は使わない。日単位で扱うため短期の学習ステップも使わない。
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false }));

export { Rating };
export type { Grade };

export interface SrsState {
  card: Card;
  reviews: number;
  lapses: number;
  firstAt: number;
  lastAt: number;
}

export function newState(at: number): SrsState {
  return { card: createEmptyCard(new Date(at)), reviews: 0, lapses: 0, firstAt: at, lastAt: at };
}

export function review(state: SrsState, at: number, grade: Grade): SrsState {
  const when = new Date(Math.max(at, state.lastAt));
  const card = scheduler.next(state.card, when, grade).card;
  return {
    card,
    reviews: state.reviews + 1,
    lapses: state.lapses + (grade === Rating.Again && state.reviews > 0 ? 1 : 0),
    firstAt: state.firstAt,
    lastAt: when.getTime(),
  };
}

export function dueAt(state: SrsState): number {
  return state.card.due.getTime();
}

/** 各評価を選んだときの次回までの日数（ボタンの表示用） */
export function previewDays(state: SrsState | null, at: number): Record<Grade, number> {
  const s = state ?? newState(at);
  const p = scheduler.repeat(s.card, new Date(Math.max(at, s.lastAt)));
  const days = (g: Grade) => Math.max(0, Math.round((p[g].card.due.getTime() - at) / 86_400_000));
  return {
    [Rating.Again]: days(Rating.Again),
    [Rating.Hard]: days(Rating.Hard),
    [Rating.Good]: days(Rating.Good),
    [Rating.Easy]: days(Rating.Easy),
  } as Record<Grade, number>;
}

/** その日（端末のタイムゾーン）の終わり */
export function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDays(days: number): string {
  if (days <= 0) return '今日';
  if (days < 30) return `${days}日`;
  if (days < 365) return `${Math.round(days / 30)}か月`;
  return `${(days / 365).toFixed(1)}年`;
}
