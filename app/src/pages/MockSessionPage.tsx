// 模擬試験を解く画面（タイマー、問題一覧からの移動、見直しフラグ、未回答とフラグの一覧、提出）
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { appendEvents } from '../db/repo';
import { fileKeysFor, loadQuestionIndex, loadQuestionMap } from '../content/loader';
import type { Question } from '../content/types';
import { optionOrder } from '../domain/grading';
import { formatDuration, gradeMock } from '../domain/mock';
import type { MockSession } from '../domain/session';
import { QuestionView } from '../components/QuestionView';
import { updateSession } from '../state/sessions';
import { useStudy } from '../state/study';
import { useNow } from '../state/useNow';

export default function MockSessionPage() {
  const { id = '' } = useParams();
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const { events } = useStudy();
  const submitted = events.some((e) => e.type === 'mock-result' && e.sessionId === id);
  if (submitted) return <Navigate to={`/mock/result/${id}`} replace />;
  if (session === undefined) {
    return (
      <div className="page-loading" role="status">
        読み込み中…
      </div>
    );
  }
  if (!session || session.kind !== 'mock') {
    return (
      <div className="card">
        <h1>模擬試験が見つかりません</h1>
        <Link className="btn" to="/mock">
          模擬試験へ
        </Link>
      </div>
    );
  }
  if (session.discarded) {
    return (
      <div className="card">
        <h1>{session.title}</h1>
        <p className="notice warn" role="status">
          制限時間が過ぎていて、1問も回答していなかったため、この回は採点せずに終了しました（結果は記録していません）。
        </p>
        <Link className="btn" to="/mock">
          模擬試験へ
        </Link>
      </div>
    );
  }
  return <MockRunner session={session} />;
}

type View = 'question' | 'review';

function MockRunner({ session }: { session: MockSession }) {
  const index = use(loadQuestionIndex());
  const questions = use(loadQuestionMap(fileKeysFor(session.questionIds, index)));
  const navigate = useNavigate();
  const now = useNow(1000);
  const [view, setView] = useState<View>('question');
  const [confirming, setConfirming] = useState(false);
  const submitting = useRef(false);
  const total = session.questionIds.length;
  const currentQid = session.questionIds[Math.min(session.index, total - 1)] ?? null;
  // いま時間を数えている問題（見直し画面やタブが隠れている間は null）
  const timing = useRef<{ qid: string | null; at: number }>({ qid: currentQid, at: Date.now() });

  const withElapsed = useCallback((s: MockSession, nextQid: string | null): MockSession => {
    const t = Date.now();
    const { qid, at } = timing.current;
    timing.current = { qid: nextQid, at: t };
    if (!qid) return s;
    return { ...s, timeSpent: { ...s.timeSpent, [qid]: (s.timeSpent[qid] ?? 0) + Math.max(0, t - at) } };
  }, []);

  const update = useCallback(
    (fn: (s: MockSession) => MockSession) => updateSession<MockSession>(session.id, fn),
    [session.id],
  );

  // 画面を離れる・タブを隠すときに、表示していた時間を保存する
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void update((s) => withElapsed(s, null));
      else timing.current = { qid: view === 'question' ? currentQid : null, at: Date.now() };
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [update, withElapsed, view, currentQid]);
  useEffect(() => () => void update((s) => withElapsed(s, null)), [update, withElapsed]);

  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    const s = (await db.sessions.get(session.id)) as MockSession | undefined;
    if (!s || s.finishedAt !== undefined) return;
    const final = withElapsed(s, null);
    const t = Date.now();
    const answered = s.questionIds.some((qid) => (s.answers[qid]?.length ?? 0) > 0);
    if (!answered && t >= s.startedAt + s.timeLimitMs) {
      // 時間切れで未回答なら採点しない（保留模試の初回が 0% で確定するのを防ぐ）
      const done: MockSession = { ...final, finishedAt: t, updatedAt: t, discarded: true };
      await db.sessions.put(done);
      submitting.current = false;
      return;
    }
    await appendEvents(gradeMock(final, questions, t));
    await db.sessions.put({ ...final, finishedAt: t, updatedAt: t });
    navigate(`/mock/result/${session.id}`, { replace: true });
  }, [navigate, questions, session.id, withElapsed]);

  const remaining = session.startedAt + session.timeLimitMs - now;
  useEffect(() => {
    if (remaining <= 0) void submit();
  }, [remaining, submit]);

  const answeredCount = session.questionIds.filter((id) => (session.answers[id]?.length ?? 0) > 0).length;
  const unanswered = session.questionIds.map((id, i) => ({ id, i })).filter(({ id }) => !(session.answers[id]?.length ?? 0));
  const flagged = session.questionIds.map((id, i) => ({ id, i })).filter(({ id }) => session.flags[id]);

  const goTo = (i: number) => {
    const qid = session.questionIds[i] ?? null;
    setView('question');
    setConfirming(false);
    void update((s) => ({ ...withElapsed(s, qid), index: i }));
    window.scrollTo?.(0, 0);
  };
  const openReview = () => {
    setView('review');
    void update((s) => withElapsed(s, null));
    window.scrollTo?.(0, 0);
  };

  const header = (
    <div className="row-between" style={{ marginBottom: 8 }}>
      <h1 style={{ margin: 0, fontSize: '1.15rem' }}>{session.title}</h1>
      <span className={`timer ${remaining < 5 * 60_000 ? 'low' : ''}`} role="timer" aria-label="残り時間">
        残り {formatDuration(remaining)}
      </span>
    </div>
  );

  const grid = (
    <div className="nav-grid" role="list" aria-label="問題一覧">
      {session.questionIds.map((id, i) => {
        const cls = [
          (session.answers[id]?.length ?? 0) > 0 ? 'answered' : '',
          session.flags[id] ? 'flagged' : '',
          view === 'question' && i === session.index ? 'current' : '',
        ].join(' ');
        const state = `${(session.answers[id]?.length ?? 0) > 0 ? '回答済み' : '未回答'}${session.flags[id] ? '・フラグあり' : ''}`;
        return (
          <button key={id} type="button" role="listitem" className={cls} onClick={() => goTo(i)} aria-label={`問 ${i + 1}（${state}）`}>
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  if (view === 'review') {
    return (
      <div>
        {header}
        <section className="card" aria-labelledby="review-h">
          <h2 id="review-h" style={{ marginTop: 0 }}>
            見直し
          </h2>
          <p>
            回答済み {answeredCount} / {total} 問 ・ 未回答 {unanswered.length} 問 ・ フラグ {flagged.length} 問
          </p>
          {grid}
          <h3>未回答の問題</h3>
          {unanswered.length === 0 ? (
            <p className="muted">ありません。</p>
          ) : (
            <ul className="chips" style={{ listStyle: 'none', padding: 0 }}>
              {unanswered.map(({ id, i }) => (
                <li key={id}>
                  <button type="button" className="btn small" onClick={() => goTo(i)}>
                    問 {i + 1}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3>見直しフラグを付けた問題</h3>
          {flagged.length === 0 ? (
            <p className="muted">ありません。</p>
          ) : (
            <ul className="chips" style={{ listStyle: 'none', padding: 0 }}>
              {flagged.map(({ id, i }) => (
                <li key={id}>
                  <button type="button" className="btn small" onClick={() => goTo(i)}>
                    ⚑ 問 {i + 1}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {confirming ? (
          <div className="notice warn" role="alertdialog" aria-labelledby="confirm-h">
            <p id="confirm-h">
              <strong>提出しますか？</strong>
              {unanswered.length > 0 && ` 未回答が ${unanswered.length} 問あります（不正解として採点します）。`}
              提出すると採点され、この回はやり直せません。
            </p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => void submit()}>
                提出を確定する
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => goTo(session.index)}>
              問題に戻る
            </button>
            <button type="button" className="btn primary" onClick={() => setConfirming(true)}>
              提出する
            </button>
          </div>
        )}
      </div>
    );
  }

  const q = currentQid ? questions.get(currentQid) : undefined;
  return (
    <div>
      {header}
      <div className="progress" aria-hidden="true" style={{ marginBottom: 12 }}>
        <span style={{ width: `${(answeredCount / Math.max(1, total)) * 100}%` }} />
      </div>
      {q ? (
        <MockQuestion key={q.id} session={session} q={q} position={`問 ${session.index + 1} / ${total}`} update={update} />
      ) : (
        <div className="card">この問題は現在のコンテンツにありません。次へ進んでください。</div>
      )}
      <div className="sticky-actions">
        <button type="button" className="btn" disabled={session.index === 0} onClick={() => goTo(session.index - 1)}>
          ← 前へ
        </button>
        {session.index + 1 < total ? (
          <button type="button" className="btn primary" onClick={() => goTo(session.index + 1)}>
            次へ →
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={openReview}>
            見直しへ
          </button>
        )}
        <button type="button" className="btn" onClick={openReview}>
          見直し・提出
        </button>
      </div>
      <details className="filter">
        <summary>問題一覧（回答済み {answeredCount} / {total}）</summary>
        {grid}
      </details>
    </div>
  );
}

function MockQuestion({
  session,
  q,
  position,
  update,
}: {
  session: MockSession;
  q: Question;
  position: string;
  update: (fn: (s: MockSession) => MockSession) => Promise<unknown>;
}) {
  const order = useMemo(() => optionOrder(session.id, q), [session.id, q]);
  const selected = session.answers[q.id] ?? [];
  const flagged = !!session.flags[q.id];
  return (
    <div className="card">
      <QuestionView
        q={q}
        order={order}
        selected={selected}
        onSelect={(ids) => void update((s) => ({ ...s, answers: { ...s.answers, [q.id]: ids } }))}
        confidence={session.confidence[q.id] ?? null}
        onConfidence={(c) => void update((s) => ({ ...s, confidence: { ...s.confidence, [q.id]: c } }))}
        position={position}
        confidenceLabel="自信度（任意）"
      />
      <div className="btn-row">
        <button
          type="button"
          className="btn small"
          aria-pressed={flagged}
          onClick={() => void update((s) => ({ ...s, flags: { ...s.flags, [q.id]: !flagged } }))}
        >
          {flagged ? '⚑ 見直しフラグを外す' : '⚐ 見直しフラグを付ける'}
        </button>
      </div>
    </div>
  );
}
