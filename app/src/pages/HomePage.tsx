import { use } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadManifest } from '../content/loader';
import { activeSessions, sessionPath } from '../state/sessions';
import { useStudy } from '../state/study';

function ResumeCard() {
  const sessions = useLiveQuery(() => activeSessions(), []);
  if (!sessions || sessions.length === 0) return null;
  return (
    <section className="card" aria-labelledby="resume-h">
      <h2 id="resume-h">続きから再開</h2>
      <ul className="list">
        {sessions.slice(0, 3).map((s) => {
          const done = s.kind === 'mock' ? Object.keys(s.answers).length : Object.keys(s.results).length;
          return (
            <li key={s.id} className="row-between">
              <span>
                {s.title}（{done} / {s.questionIds.length} 問）
              </span>
              <Link className="btn small primary" to={sessionPath(s)}>
                再開
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HomePage() {
  const manifest = use(loadManifest());
  const { history } = useStudy();
  const answered = history.questions.size;
  return (
    <div>
      <h1>SAA Dojo</h1>
      <p className="muted">AWS 認定ソリューションアーキテクト – アソシエイト（SAA-C03）の非公式学習アプリ</p>
      <ResumeCard />
      <section className="card">
        <h2>学習の状況</h2>
        <p>
          回答した問題: {answered} / {manifest.counts.questions.practice + manifest.counts.questions.basics} 問
        </p>
        <div className="btn-row">
          <Link className="btn primary" to="/practice">
            演習を始める
          </Link>
        </div>
      </section>
    </div>
  );
}
