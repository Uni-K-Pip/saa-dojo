// 基礎講座: AWS 未経験者向けの基礎レッスンと確認問題
import { use, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { loadBlueprint, loadLessons, loadQuestionIndex } from '../content/loader';
import { lessonReadMap, percent, progressOf } from '../domain/progress';
import { randomRng } from '../domain/rng';
import { pickQuestions } from '../domain/selection';
import { createPracticeSession } from '../state/sessions';
import { useStudy } from '../state/study';

export default function BasicsPage() {
  const lessons = use(loadLessons()).filter((l) => l.domain === 0);
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const { events, history } = useStudy();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const read = lessonReadMap(events);
  const pool = index.filter((q) => q.pool === 'basics');
  const p = progressOf(pool, history);
  const readCount = lessons.filter((l) => read.has(l.id)).length;

  async function startAll() {
    if (busy || pool.length === 0) return;
    setBusy(true);
    const ids = pickQuestions(pool, history, 10, randomRng());
    const id = await createPracticeSession({ mode: 'basics', title: '基礎講座の確認問題', questionIds: ids });
    navigate(`/session/${id}`);
  }

  return (
    <div>
      <h1>{blueprint?.basics.titleJa ?? '基礎講座'}</h1>
      <p className="muted">
        AWS を触ったことがない人のための基礎です。上から順に読み、各レッスンの確認問題で理解を確かめてください。基礎講座の問題は演習・模擬試験には出ません。
      </p>
      <div className="card">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">
              {readCount} / {lessons.length}
            </span>
            <span className="stat-label">読了したレッスン</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {p.answered} / {p.total}
            </span>
            <span className="stat-label">回答した確認問題</span>
          </div>
          <div className="stat">
            <span className="stat-value">{percent(p.lastCorrect, p.answered)}%</span>
            <span className="stat-label">最後の回答の正答率</span>
          </div>
        </div>
        {pool.length > 0 && (
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={startAll} disabled={busy}>
              確認問題を {Math.min(10, pool.length)} 問解く（未回答を優先）
            </button>
          </div>
        )}
      </div>
      {lessons.length === 0 ? (
        <div className="notice warn">基礎講座のレッスンはまだありません。</div>
      ) : (
        <ol className="list card">
          {lessons.map((l, i) => {
            const qp = progressOf(
              l.questionIds.map((id) => ({ id })),
              history,
            );
            return (
              <li key={l.id} className="row-between">
                <span>
                  <span className="muted">{i + 1}. </span>
                  <Link to={`/lessons/${l.id}`}>{l.title}</Link>
                  <span className="small muted">
                    {' '}
                    約 {l.estimatedMinutes} 分{l.questionIds.length > 0 ? `・確認問題 ${qp.answered}/${qp.total}` : ''}
                  </span>
                </span>
                {read.has(l.id) && <span className="badge ok">読了</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
