// 演習・復習・基礎講座・レッスンの確認問題を1問ずつ解く画面
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { appendEvent } from '../db/repo';
import { fileKeysFor, loadQuestionIndex, loadQuestionMap } from '../content/loader';
import type { Question } from '../content/types';
import type { Confidence, MissReason } from '../domain/events';
import { isCorrectSelection, optionOrder } from '../domain/grading';
import type { PracticeSession } from '../domain/session';
import { AnswerFeedback } from '../components/AnswerFeedback';
import { QuestionView, selectionHint } from '../components/QuestionView';
import { useStudy } from '../state/study';
import { createPracticeSession, updateSession } from '../state/sessions';
import { loadLessons } from '../content/loader';

export default function PracticeSessionPage() {
  const { id = '' } = useParams();
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  if (session === undefined) {
    return (
      <div className="page-loading" role="status">
        読み込み中…
      </div>
    );
  }
  if (!session || session.kind !== 'practice') {
    return (
      <div className="card">
        <h1>セッションが見つかりません</h1>
        <p>このセッションは終了したか、削除されました。</p>
        <Link className="btn" to="/practice">
          演習へ
        </Link>
      </div>
    );
  }
  return <PracticeRunner session={session} />;
}

function PracticeRunner({ session }: { session: PracticeSession }) {
  const index = use(loadQuestionIndex());
  const questions = use(loadQuestionMap(fileKeysFor(session.questionIds, index)));
  const total = session.questionIds.length;
  if (session.index >= total) return <SessionSummary session={session} questions={questions} />;
  const qid = session.questionIds[session.index]!;
  const q = questions.get(qid);
  return (
    <div>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>{session.title}</h1>
        <span className="muted small">
          {session.index + 1} / {total} 問
        </span>
      </div>
      <div className="progress" aria-hidden="true" style={{ margin: '8px 0 12px' }}>
        <span style={{ width: `${(session.index / total) * 100}%` }} />
      </div>
      {q ? (
        <QuestionStep key={qid} session={session} q={q} position={`問 ${session.index + 1}`} />
      ) : (
        <div className="card">
          <p>この問題（{qid}）は現在のコンテンツにありません。次へ進んでください。</p>
          <NextButton session={session} />
        </div>
      )}
    </div>
  );
}

function NextButton({ session, label }: { session: PracticeSession; label?: string }) {
  const last = session.index + 1 >= session.questionIds.length;
  const next = () =>
    updateSession<PracticeSession>(session.id, (s) => ({
      ...s,
      index: s.index + 1,
      ...(s.index + 1 >= s.questionIds.length ? { finishedAt: Date.now() } : {}),
    }));
  return (
    <button type="button" className="btn primary" onClick={next}>
      {label ?? (last ? '結果を見る' : '次の問題へ')}
    </button>
  );
}

function QuestionStep({ session, q, position }: { session: PracticeSession; q: Question; position: string }) {
  const { history } = useStudy();
  const lessons = use(loadLessons());
  const order = useMemo(() => optionOrder(session.id, q), [session.id, q]);
  const result = session.results[q.id];
  const [selected, setSelected] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    topRef.current?.focus({ preventScroll: true });
    window.scrollTo?.(0, 0);
  }, [result ? 'answered' : 'question']);

  const hint = selectionHint(q, selected.length);
  const ready = !hint && confidence !== null;

  async function submit() {
    if (!ready || busy || !confidence) return;
    setBusy(true);
    try {
      const correct = isCorrectSelection(q, selected);
      const durationMs = Date.now() - startedAt.current;
      const ev = await appendEvent({
        type: 'answer',
        questionId: q.id,
        selected,
        correct,
        confidence,
        mode: session.mode,
        sessionId: session.id,
        durationMs,
      });
      await updateSession<PracticeSession>(session.id, (s) => ({
        ...s,
        results: { ...s.results, [q.id]: { selected, confidence, correct, answerEventId: ev.eventId, durationMs } },
      }));
    } finally {
      setBusy(false);
    }
  }

  const flagged = history.flags.get(q.id) ?? false;
  const missReason: MissReason | null = result ? (history.missReasons.get(result.answerEventId) ?? null) : null;

  return (
    <div ref={topRef} tabIndex={-1} style={{ outline: 'none' }}>
      {result ? (
        <div className="card">
          <AnswerFeedback
            q={q}
            order={order}
            selected={result.selected}
            correct={result.correct}
            missReason={missReason}
            onMissReason={(reason) => appendEvent({ type: 'miss-reason', questionId: q.id, answerEventId: result.answerEventId, reason })}
            flagged={flagged}
            onToggleFlag={() => appendEvent({ type: 'flag', questionId: q.id, flagged: !flagged })}
            lessons={lessons}
            position={position}
          />
          <div className="sticky-actions">
            <NextButton session={session} />
          </div>
        </div>
      ) : (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <QuestionView
            q={q}
            order={order}
            selected={selected}
            onSelect={setSelected}
            confidence={confidence}
            onConfidence={setConfidence}
            position={position}
          />
          <div className="sticky-actions">
            <span className="hint" aria-live="polite">
              {hint || (confidence === null ? '自信度を選んでください' : '')}
            </span>
            <button type="submit" className="btn primary" disabled={!ready || busy}>
              回答する
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SessionSummary({ session, questions }: { session: PracticeSession; questions: Map<string, Question> }) {
  const navigate = useNavigate();
  const answered = session.questionIds.filter((id) => session.results[id]);
  const correct = answered.filter((id) => session.results[id]?.correct);
  const wrong = answered.filter((id) => !session.results[id]?.correct);
  const backTo = session.mode === 'review' ? '/review' : session.mode === 'basics' ? '/basics' : session.mode === 'lesson' ? '/roadmap' : '/practice';
  async function retryWrong() {
    const newId = await createPracticeSession({ mode: session.mode, title: `${session.title}（解き直し）`, questionIds: wrong });
    navigate(`/session/${newId}`);
  }
  return (
    <div>
      <h1>{session.title}の結果</h1>
      <div className="card">
        <div className="stat">
          <span className="stat-value">
            {correct.length} / {answered.length} 問正解
          </span>
          <span className="stat-label">正答率 {answered.length ? Math.round((correct.length / answered.length) * 100) : 0}%</span>
        </div>
      </div>
      <div className="card">
        <h2>解いた問題</h2>
        <ul className="list">
          {session.questionIds.map((id, i) => {
            const r = session.results[id];
            const q = questions.get(id);
            return (
              <li key={id} className="row-between">
                <span>
                  <span className={`badge ${r?.correct ? 'ok' : 'ng'}`}>{r ? (r.correct ? '正解' : '不正解') : '未回答'}</span>{' '}
                  問 {i + 1}（タスク {q?.taskStatement ?? '—'}）
                </span>
                <span className="small muted">{Array.from(q?.stem ?? id).slice(0, 36).join('')}…</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="btn-row">
        {wrong.length > 0 && (
          <button type="button" className="btn primary" onClick={retryWrong}>
            間違えた {wrong.length} 問を解き直す
          </button>
        )}
        <Link className="btn" to={backTo}>
          戻る
        </Link>
        <Link className="btn" to="/">
          ホームへ
        </Link>
      </div>
    </div>
  );
}
