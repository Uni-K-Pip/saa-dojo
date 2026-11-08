// 復習: 期限が来た概念（blueprint の項目）を、その概念の別の問題で出題する
import { use, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { loadBlueprint, loadQuestionIndex } from '../content/loader';
import { itemIndex } from '../domain/blueprint';
import { buildConceptSchedule, dueConcepts, pickReviewQuestions } from '../domain/review';
import { randomRng } from '../domain/rng';
import { dueAt, endOfDay } from '../domain/srs';
import { createPracticeSession } from '../state/sessions';
import { useStudy } from '../state/study';
import { useNow } from '../state/useNow';

const LIMITS = [10, 20, 30] as const;
const DAY = 86_400_000;

export default function ReviewPage() {
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const { events, history } = useStudy();
  const navigate = useNavigate();
  const [limit, setLimit] = useState<number>(20);
  const [busy, setBusy] = useState(false);
  const now = useNow(60_000);
  const schedule = useMemo(() => buildConceptSchedule(events, index), [events, index]);
  const due = useMemo(() => dueConcepts(schedule, endOfDay(now)), [schedule, now]);
  const upcoming = useMemo(() => {
    const today = endOfDay(now);
    const days = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, count: 0 }));
    for (const c of schedule.values()) {
      const t = dueAt(c);
      if (t <= today) continue;
      const d = Math.ceil((t - today) / DAY);
      if (d >= 1 && d <= 7) days[d - 1]!.count++;
    }
    return days;
  }, [schedule, now]);
  const items = itemIndex(blueprint);

  async function start() {
    if (busy) return;
    setBusy(true);
    const { picks } = pickReviewQuestions(due, index, history, limit, randomRng());
    if (picks.length === 0) {
      setBusy(false);
      return;
    }
    const id = await createPracticeSession({
      mode: 'review',
      title: '復習',
      questionIds: picks.map((p) => p.questionId),
      concepts: Object.fromEntries(picks.map((p) => [p.questionId, p.conceptId])),
    });
    navigate(`/session/${id}`);
  }

  const startable = pickReviewQuestions(due, index, history, limit, () => 0.5).picks.length;

  return (
    <div>
      <h1>復習</h1>
      <p className="muted">
        間違えた問題や「勘」で答えた問題の概念（出題範囲の項目）を、間隔を空けて復習します。前回と別の問題を優先して出すので、答えの丸暗記を防げます。
      </p>
      <div className="card">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">{due.length}</span>
            <span className="stat-label">今日の復習（概念）</span>
          </div>
          <div className="stat">
            <span className="stat-value">{schedule.size}</span>
            <span className="stat-label">復習中の概念</span>
          </div>
        </div>
        {due.length === 0 ? (
          <p>{schedule.size === 0 ? 'まだ復習する概念はありません。演習で問題を解くと、間違えた概念がここに入ります。' : '今日の復習は終わりました。'}</p>
        ) : (
          <>
            <fieldset>
              <legend>問題数（上限）</legend>
              <div className="chips">
                {LIMITS.map((n) => (
                  <label key={n} className="chip">
                    <input type="radio" name="review-limit" checked={limit === n} onChange={() => setLimit(n)} />
                    {n} 問
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="btn-row">
              <button type="button" className="btn primary" disabled={busy || startable === 0} onClick={start}>
                {startable > 0 ? `${startable} 問を復習する` : '出せる問題がありません'}
              </button>
            </div>
          </>
        )}
      </div>
      {due.length > 0 && (
        <section className="card" aria-labelledby="due-h">
          <h2 id="due-h">今日の復習の概念</h2>
          <ul className="list">
            {due.slice(0, 30).map((c) => {
              const info = items.get(c.conceptId);
              return (
                <li key={c.conceptId}>
                  <span className="badge info">{c.conceptId}</span> {info?.item.textJa ?? ''}
                </li>
              );
            })}
          </ul>
          {due.length > 30 && <p className="small muted">ほか {due.length - 30} 件</p>}
        </section>
      )}
      <section className="card" aria-labelledby="upcoming-h">
        <h2 id="upcoming-h">これからの予定（7日間）</h2>
        <table className="data">
          <tbody>
            {upcoming.map((d) => (
              <tr key={d.day}>
                <td>{d.day === 1 ? '明日' : `${d.day}日後`}</td>
                <td className="num">{d.count} 件</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p>
        <Link to="/flashcards">フラッシュカードの復習へ</Link>
      </p>
    </div>
  );
}
