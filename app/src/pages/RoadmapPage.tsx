// ロードマップ: ドメイン → タスクごとのレッスンと演習、進捗
import { use } from 'react';
import { Link } from 'react-router';
import { loadBlueprint, loadLessons, loadQuestionIndex } from '../content/loader';
import { answeredItems, lessonReadMap, percent, progressOf } from '../domain/progress';
import { useStudy } from '../state/study';

export default function RoadmapPage() {
  const blueprint = use(loadBlueprint());
  const lessons = use(loadLessons());
  const index = use(loadQuestionIndex());
  const { events, history } = useStudy();
  const read = lessonReadMap(events);
  const covered = answeredItems(index, history);
  const practice = index.filter((q) => q.pool === 'practice');
  const basicsLessons = lessons.filter((l) => l.domain === 0);

  return (
    <div>
      <h1>ロードマップ</h1>
      <p className="muted">出題範囲（4ドメイン・14タスク）ごとに、レッスンを読んでから演習で確かめます。</p>
      {basicsLessons.length > 0 && (
        <div className="notice">
          AWS が初めてなら、先に <Link to="/basics">基礎講座</Link>（{basicsLessons.length} 本、読了{' '}
          {basicsLessons.filter((l) => read.has(l.id)).length} 本）から始めてください。
        </div>
      )}
      {(blueprint?.domains ?? []).map((d) => (
        <section key={d.id} className="card" aria-labelledby={`d${d.id}-h`}>
          <h2 id={`d${d.id}-h`}>
            ドメイン {d.id}: {d.nameJa}
            <span className="small muted">（出題比重 {d.weightPercent}%）</span>
          </h2>
          {d.tasks.map((t) => {
            const tl = lessons.filter((l) => l.taskStatement === t.id);
            const tq = practice.filter((q) => q.taskStatement === t.id);
            const p = progressOf(tq, history);
            const itemsDone = t.items.filter((i) => covered.has(i.id)).length;
            return (
              <div key={t.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                <h3 style={{ margin: '0 0 4px' }}>
                  {t.id} {t.titleJa}
                </h3>
                <div className="progress" aria-hidden="true">
                  <span style={{ width: `${percent(itemsDone, t.items.length)}%` }} />
                </div>
                <p className="small muted" style={{ margin: '4px 0' }}>
                  網羅 {itemsDone}/{t.items.length} 項目・演習 {p.answered}/{p.total} 問回答
                  {p.answered > 0 ? `（最後の回答の正答率 ${percent(p.lastCorrect, p.answered)}%）` : ''}
                </p>
                {tl.length > 0 ? (
                  <ul style={{ margin: '4px 0' }}>
                    {tl.map((l) => (
                      <li key={l.id}>
                        <Link to={`/lessons/${l.id}`}>{l.title}</Link>
                        <span className="small muted"> 約 {l.estimatedMinutes} 分</span>
                        {read.has(l.id) && (
                          <>
                            {' '}
                            <span className="badge ok">読了</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">レッスンは準備中です。</p>
                )}
                {tq.length > 0 && (
                  <Link className="btn small" to={`/practice?tasks=${encodeURIComponent(t.id)}`}>
                    タスク {t.id} を演習（{tq.length} 問）
                  </Link>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
