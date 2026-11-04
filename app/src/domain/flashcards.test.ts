import { describe, expect, it } from 'vitest';
import type { FlashcardDeck } from '../content/types';
import { buildFlashcardSchedule, flashcardQueue } from './flashcards';
import { dueAt } from './srs';
import { event } from '../test/fixtures';

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 1, 9, 0, 0).getTime();
const card = (id: string) => ({ id, front: `表 ${id}`, back: `裏 ${id}`, taskStatements: [], services: [], tags: [] });
const decks: FlashcardDeck[] = [
  { deck: 'storage', title: 'ストレージ', createdBy: 't', cards: [card('fc-t-001'), card('fc-t-002'), card('fc-t-003')] },
  { deck: 'network', title: 'ネットワーク', createdBy: 't', cards: [card('fc-t-004')] },
];

describe('フラッシュカードの間隔反復', () => {
  it('評価から次回の期限を決め、良い評価ほど先になる', () => {
    const again = buildFlashcardSchedule([event('flashcard', { cardId: 'fc-t-001', rating: 1, durationMs: 1 }, T0)]);
    const easy = buildFlashcardSchedule([event('flashcard', { cardId: 'fc-t-001', rating: 4, durationMs: 1 }, T0)]);
    expect(dueAt(easy.get('fc-t-001')!)).toBeGreaterThan(dueAt(again.get('fc-t-001')!));
    expect(dueAt(again.get('fc-t-001')!)).toBeGreaterThan(T0);
  });

  it('期限が来たカードと、1日の上限までの新しいカードを出す', () => {
    const schedule = buildFlashcardSchedule([event('flashcard', { cardId: 'fc-t-001', rating: 3, durationMs: 1 }, T0)]);
    const sameDay = flashcardQueue(decks, schedule, T0 + 1000, 2);
    expect(sameDay.due).toEqual([]);
    expect(sameDay.newToday).toBe(1);
    expect(sameDay.fresh.map((c) => c.id)).toEqual(['fc-t-002']);
    expect(sameDay.unseen).toBe(3);

    const later = flashcardQueue(decks, schedule, T0 + 30 * DAY, 2);
    expect(later.due.map((c) => c.id)).toEqual(['fc-t-001']);
    expect(later.fresh.map((c) => c.id)).toEqual(['fc-t-002', 'fc-t-003']);
    expect(flashcardQueue(decks, schedule, T0 + 30 * DAY, 20, 'network').fresh.map((c) => c.id)).toEqual(['fc-t-004']);
  });
});
