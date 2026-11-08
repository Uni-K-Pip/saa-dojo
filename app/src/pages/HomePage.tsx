import { use, useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadBlueprint, loadFlashcards, loadQuestionIndex } from '../content/loader';
import { buildFlashcardSchedule, flashcardQueue } from '../domain/flashcards';
import { answeredToday, computeReadiness, dailyGoal } from '../domain/readiness';
import { buildConceptSchedule, dueConcepts } from '../domain/review';
import { endOfDay } from '../domain/srs';
import { activeSessions, sessionPath } from '../state/sessions';
import { useStudy } from '../state/study';
import { useNow } from '../state/useNow';
import { BackupReminder } from '../components/BackupReminder';

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
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const decks = use(loadFlashcards());
  const { events, history, settings } = useStudy();
  const now = useNow(60_000);
  const readiness = useMemo(() => computeReadiness(events, index, history, blueprint), [events, index, history, blueprint]);
  const dueReview = useMemo(() => dueConcepts(buildConceptSchedule(events, index), endOfDay(now)).length, [events, index, now]);
  const cards = useMemo(() => flashcardQueue(decks, buildFlashcardSchedule(events), now, settings.newCardsPerDay), [decks, events, now, settings.newCardsPerDay]);
  const learnable = index.filter((q) => q.pool === 'practice' || q.pool === 'basics');
  const unanswered = learnable.filter((q) => !history.questions.has(q.id)).length;
  const goal = dailyGoal({ dailyGoal: settings.dailyGoal, examDate: settings.examDate, unanswered, now });
  const today = answeredToday(events, now);
  const isNew = events.length === 0;

  return (
    <div>
      <h1>SAA Dojo</h1>
      <p className="muted">AWS 認定ソリューションアーキテクト – アソシエイト（SAA-C03）の非公式学習アプリ</p>
      <BackupReminder />
      {isNew && (
        <section className="card" aria-labelledby="start-h">
          <h2 id="start-h">はじめに</h2>
          <p>AWS が初めてなら基礎講座から、経験があればロードマップのレッスンか演習から始めてください。</p>
          <div className="btn-row">
            <Link className="btn primary" to="/basics">
              基礎講座を読む
            </Link>
            <Link className="btn" to="/roadmap">
              ロードマップ
            </Link>
            <Link className="btn" to="/settings">
              試験日を設定
            </Link>
          </div>
        </section>
      )}
      <ResumeCard />

      <section className="card" aria-labelledby="today-h">
        <h2 id="today-h">今日の学習</h2>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">
              {today} / {goal.goal}
            </span>
            <span className="stat-label">
              今日の回答（目標
              {goal.source === 'exam' ? '・試験日から逆算' : goal.source === 'setting' ? '・設定' : ''}）
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">{dueReview}</span>
            <span className="stat-label">今日の復習（概念）</span>
          </div>
          <div className="stat">
            <span className="stat-value">{cards.due.length + cards.fresh.length}</span>
            <span className="stat-label">今日のフラッシュカード</span>
          </div>
          {goal.daysLeft !== null && (
            <div className="stat">
              <span className="stat-value">{goal.daysLeft > 0 ? `${goal.daysLeft} 日` : goal.daysLeft === 0 ? '今日' : '終了'}</span>
              <span className="stat-label">試験日まで（{settings.examDate}）</span>
            </div>
          )}
        </div>
        <div className="progress" aria-hidden="true" style={{ marginTop: 8 }}>
          <span style={{ width: `${Math.min(100, (today / Math.max(1, goal.goal)) * 100)}%` }} />
        </div>
        <div className="btn-row">
          {dueReview > 0 && (
            <Link className="btn primary" to="/review">
              復習する（{dueReview}）
            </Link>
          )}
          <Link className={`btn${dueReview > 0 ? '' : ' primary'}`} to="/practice">
            演習を始める
          </Link>
          {cards.due.length + cards.fresh.length > 0 && (
            <Link className="btn" to="/flashcards">
              フラッシュカード
            </Link>
          )}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          未回答の問題: {unanswered} / {learnable.length} 問
        </p>
      </section>

      <section className="card" aria-labelledby="ready-h">
        <h2 id="ready-h">合格準備度</h2>
        <p>
          条件の達成: <strong>{readiness.achievedCount} / {readiness.conditions.length}</strong>
        </p>
        <ul className="list">
          {readiness.conditions.map((c) => (
            <li key={c.id} className="row-between">
              <span>
                <span className={`badge ${c.achieved ? 'ok' : 'pending'}`}>{c.achieved ? '達成' : '未達'}</span> {c.label}
              </span>
              <span className="small muted">{Math.round(c.progress * 100)}%</span>
            </li>
          ))}
        </ul>
        <div className="btn-row">
          <Link className="btn small" to="/readiness">
            詳しく見る
          </Link>
          <Link className="btn small" to="/analysis">
            弱点分析
          </Link>
        </div>
      </section>
    </div>
  );
}
