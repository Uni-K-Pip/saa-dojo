// フラッシュカード（間隔反復つき）
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { loadFlashcards } from '../content/loader';
import type { Flashcard } from '../content/types';
import { appendEvent } from '../db/repo';
import type { FlashcardRating } from '../domain/events';
import { buildFlashcardSchedule, flashcardQueue } from '../domain/flashcards';
import { Rating, formatDays, previewDays, type Grade, type SrsState } from '../domain/srs';
import { useStudy } from '../state/study';
import { useNow } from '../state/useNow';

const RATINGS: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: 'もう一度', key: '1' },
  { grade: Rating.Hard, label: '難しい', key: '2' },
  { grade: Rating.Good, label: '普通', key: '3' },
  { grade: Rating.Easy, label: '簡単', key: '4' },
];

export default function FlashcardsPage() {
  const decks = use(loadFlashcards());
  const { events, settings } = useStudy();
  const [deck, setDeck] = useState('');
  const now = useNow(60_000);
  const schedule = useMemo(() => buildFlashcardSchedule(events), [events]);
  const queue = useMemo(() => flashcardQueue(decks, schedule, now, settings.newCardsPerDay, deck || undefined), [decks, schedule, now, settings.newCardsPerDay, deck]);
  const current = queue.due[0] ?? queue.fresh[0] ?? null;
  const total = decks.reduce((n, d) => n + d.cards.length, 0);

  return (
    <div>
      <h1>フラッシュカード</h1>
      {total === 0 ? (
        <div className="notice warn">フラッシュカードはまだありません。</div>
      ) : (
        <>
          <div className="card">
            <label className="field" style={{ marginTop: 0 }}>
              <span>デッキ</span>
              <select value={deck} onChange={(e) => setDeck(e.target.value)}>
                <option value="">すべて（{total} 枚）</option>
                {decks.map((d) => (
                  <option key={d.deck} value={d.deck}>
                    {d.title}（{d.cards.length} 枚）
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted" style={{ marginBottom: 0 }}>
              今日の復習 {queue.due.length} 枚・新しいカード {queue.fresh.length} 枚（今日始めた {queue.newToday} / 1日 {settings.newCardsPerDay} 枚まで）・未学習 {queue.unseen} 枚
            </p>
          </div>
          {current ? (
            <CardView key={current.id} card={current} isNew={!schedule.has(current.id)} state={schedule.get(current.id) ?? null} now={now} />
          ) : (
            <div className="notice ok">今日のカードは終わりました。新しいカードの上限は設定で変えられます。</div>
          )}
        </>
      )}
    </div>
  );
}

function CardView({ card, isNew, state, now }: { card: Flashcard; isNew: boolean; state: SrsState | null; now: number }) {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const preview = useMemo(() => previewDays(state, now), [state, now]);
  const revealRef = useRef<HTMLButtonElement>(null);

  async function rate(grade: Grade) {
    if (busy) return;
    setBusy(true);
    await appendEvent({ type: 'flashcard', cardId: card.id, rating: grade as FlashcardRating, durationMs: Date.now() - startedAt.current });
  }

  useEffect(() => {
    revealRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
        return;
      }
      const r = shown ? RATINGS.find((x) => x.key === e.key) : undefined;
      if (r) {
        e.preventDefault();
        void rate(r.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="card">
      <div className="flashcard">
        {isNew && (
          <p style={{ margin: 0 }}>
            <span className="badge info">新しいカード</span>
          </p>
        )}
        <div className="front">{card.front}</div>
        {shown && (
          <div className="back" aria-live="polite">
            {card.back}
          </div>
        )}
      </div>
      {!shown ? (
        <div className="btn-row end">
          <button ref={revealRef} type="button" className="btn primary" onClick={() => setShown(true)}>
            答えを見る <span className="kbd">Space</span>
          </button>
        </div>
      ) : (
        <div className="rating-row" role="group" aria-label="思い出せたか評価する">
          {RATINGS.map((r) => (
            <button key={r.grade} type="button" className="btn" disabled={busy} onClick={() => void rate(r.grade)}>
              {r.label}
              <small>
                {formatDays(preview[r.grade])}・<span className="kbd">{r.key}</span>
              </small>
            </button>
          ))}
        </div>
      )}
      {card.services.length > 0 && <p className="small muted">{card.services.join('、')}</p>}
    </div>
  );
}
