// フラッシュカードの間隔反復（評価イベントから再計算）
import type { Flashcard, FlashcardDeck } from '../content/types';
import { compareEvents, type AppEvent, type FlashcardEvent } from './events';
import { dueAt, newState, review, startOfDay, type Grade, type SrsState } from './srs';

export function buildFlashcardSchedule(events: readonly AppEvent[]): Map<string, SrsState> {
  const map = new Map<string, SrsState>();
  const list = events.filter((e): e is FlashcardEvent => e.type === 'flashcard').sort(compareEvents);
  for (const e of list) {
    if (e.rating < 1 || e.rating > 4) continue;
    const st = map.get(e.cardId) ?? newState(e.at);
    map.set(e.cardId, review(st, e.at, e.rating as Grade));
  }
  return map;
}

export interface FlashcardQueue {
  due: Flashcard[];
  fresh: Flashcard[];
  /** 今日すでに始めた新しいカードの数 */
  newToday: number;
  unseen: number;
}

/** 今日解くカード: 期限が来たカード（期限順）と、1日の上限までの新しいカード（デッキ順） */
export function flashcardQueue(
  decks: readonly FlashcardDeck[],
  schedule: Map<string, SrsState>,
  now: number,
  newPerDay: number,
  deckFilter?: string,
): FlashcardQueue {
  const cards = decks.filter((d) => !deckFilter || d.deck === deckFilter).flatMap((d) => d.cards);
  const today = startOfDay(now);
  const newToday = [...schedule.values()].filter((s) => s.firstAt >= today).length;
  const due = cards
    .filter((c) => {
      const s = schedule.get(c.id);
      return s && dueAt(s) <= now;
    })
    .sort((a, b) => dueAt(schedule.get(a.id)!) - dueAt(schedule.get(b.id)!));
  const unseenCards = cards.filter((c) => !schedule.has(c.id));
  const room = Math.max(0, newPerDay - newToday);
  return { due, fresh: unseenCards.slice(0, room), newToday, unseen: unseenCards.length };
}
