import { useId, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { LabMeta, MaterialBody, PatternMeta } from '../content/types';
import { appendEvent } from '../db/repo';
import type { NewEvent } from '../domain/events';
import { createPracticeSession } from '../state/sessions';
import { useServiceLinker } from '../state/useContent';
import { Markdown } from './Markdown';
import { ServiceLinkList } from './ServiceLinks';

export function MaterialBadges({ status, readAt }: { status: LabMeta['status']; readAt?: number }) {
  return (
    <>
      {status === 'pending' && <span className="badge pending">未検証</span>}
      {readAt !== undefined && <span className="badge ok">読了 {new Date(readAt).toLocaleDateString('ja-JP')}</span>}
    </>
  );
}

export function MissingMaterial({ id, label, to }: { id: string; label: string; to: string }) {
  return (
    <div className="card">
      <h1>見つかりません</h1>
      <p>指定された{label}（{id}）は表示できません。{label}がないか、まだ検証が済んでいない{label}です。</p>
      <Link className="btn" to={to}>{label}の一覧へ</Link>
    </div>
  );
}

export function MaterialReading({
  meta, item, label, to, details, readAt, readEvent,
}: {
  meta: LabMeta | PatternMeta;
  item: MaterialBody;
  label: string;
  to: string;
  details: ReactNode;
  readAt?: number;
  readEvent: Extract<NewEvent, { type: 'lab-read' | 'pattern-read' }>;
}) {
  const { link } = useServiceLinker();
  const navigate = useNavigate();
  const quizHeading = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { title, status, services, questionIds } = meta;
  const quizIds = new Set(questionIds);

  async function start(ids: string[]) {
    if (busy || ids.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const sid = await createPracticeSession({ mode: 'practice', title: `確認問題: ${title}`, questionIds: ids });
      navigate(`/session/${sid}`);
    } catch {
      setError('確認問題を始められませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function markRead() {
    setError('');
    try {
      await appendEvent(readEvent);
    } catch {
      setError('読了を記録できませんでした。もう一度お試しください。');
    }
  }

  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}><Link to={to}>{label}の一覧へ</Link></p>
      <h1>{title}</h1>
      <p className="meta-row">
        {details}
        <MaterialBadges status={status} readAt={readAt} />
      </p>
      {services.length > 0 && (
        <p className="small muted">扱うサービス: <ServiceLinkList names={services} link={link} /></p>
      )}
      <div className="card">
        <Markdown
          renderQuestionRef={(id) => quizIds.has(id) ? (
            <button type="button" className="link-button" onClick={() => void start([id])} disabled={busy}>
              {id} を解く
            </button>
          ) : null}
        >
          {item.body}
        </Markdown>
      </div>
      <section className="card" aria-labelledby={quizHeading}>
        <h2 id={quizHeading}>確認問題</h2>
        {error && <p className="notice warn" role="alert">{error}</p>}
        {questionIds.length > 0 ? (
          <>
            <p>{questionIds.length} 問</p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => void start(questionIds)} disabled={busy}>
                確認問題を解く（{questionIds.length} 問）
              </button>
            </div>
          </>
        ) : <p className="muted">この{label}の確認問題はまだありません。</p>}
        <div className="btn-row">
          <button type="button" className="btn" aria-pressed={readAt !== undefined} onClick={() => void markRead()}>
            {readAt === undefined ? '読了にする' : '✓ 読了済み（もう一度記録する）'}
          </button>
        </div>
      </section>
    </article>
  );
}
