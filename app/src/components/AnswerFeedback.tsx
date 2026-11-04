// 採点後の表示: 正誤、選択肢ごとの理由、解説、要点、出典、関連レッスン、誤答理由、外部リンク
import { Link } from 'react-router';
import type { Question } from '../content/types';
import type { MissReason } from '../domain/events';
import { LETTERS, correctIds, lettersFor } from '../domain/grading';
import { MISS_REASONS, MISS_REASON_LABELS } from '../domain/labels';
import { askText, chatGptUrl, claudeUrl, reportUrl } from '../domain/links';
import { QuestionBadges } from './QuestionView';

interface Props {
  q: Question;
  order: string[];
  selected: string[];
  correct: boolean;
  /** 誤答理由の記録（未指定なら表示しない） */
  missReason?: MissReason | null;
  onMissReason?: (r: MissReason) => void;
  flagged?: boolean;
  onToggleFlag?: () => void;
  /** レッスン ID → タイトル（存在するレッスンだけリンクにする） */
  lessonTitles?: Map<string, string>;
  showStem?: boolean;
  position?: string;
  unanswered?: boolean;
}

export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>{p}</p>
        ))}
    </>
  );
}

export function AnswerFeedback({
  q,
  order,
  selected,
  correct,
  missReason,
  onMissReason,
  flagged,
  onToggleFlag,
  lessonTitles,
  showStem = true,
  position,
  unanswered,
}: Props) {
  const byId = new Map(q.options.map((o) => [o.id, o]));
  const right = correctIds(q);
  const ask = askText(q, order, selected);
  const lessons = q.lessonRefs.filter((id) => lessonTitles?.has(id));
  return (
    <div className="feedback">
      <div className="question-head">
        {position && <strong>{position}</strong>}
        <QuestionBadges q={q} showQualifier />
      </div>
      <div className={`result-banner ${correct ? 'ok' : 'ng'}`} role="status">
        <span aria-hidden="true">{correct ? '◯' : '×'}</span>
        <span>{correct ? '正解' : unanswered ? '未回答' : '不正解'}</span>
        <span className="small" style={{ fontWeight: 400 }}>
          正解: {lettersFor(order, right)}
          {!correct && !unanswered && ` ／ あなたの回答: ${lettersFor(order, selected) || '—'}`}
        </span>
      </div>

      {showStem && <p className="stem">{q.stem}</p>}

      <h3>選択肢ごとの理由</h3>
      <div className="options">
        {order.map((id, i) => {
          const o = byId.get(id);
          if (!o) return null;
          const picked = selected.includes(id);
          const cls = o.correct ? 'is-correct' : picked ? 'is-picked-wrong' : '';
          return (
            <div key={id} className={`option-review ${cls}`}>
              <div className="option-line">
                <strong>{LETTERS[i]}.</strong>
                <span>{o.text}</span>
              </div>
              <div className="meta-row">
                {o.correct && <span className="badge ok">正解</span>}
                {picked && <span className={`badge ${o.correct ? 'ok' : 'ng'}`}>あなたの回答</span>}
              </div>
              <div className="rationale">{o.rationale}</div>
            </div>
          );
        })}
      </div>

      {!correct && onMissReason && (
        <fieldset className="card">
          <legend>間違えた理由（1つ選ぶと記録されます）</legend>
          <div className="chips">
            {MISS_REASONS.map((r) => (
              <label key={r} className="chip">
                <input type="radio" name={`miss-${q.id}`} value={r} checked={missReason === r} onChange={() => onMissReason(r)} />
                {MISS_REASON_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <h3>解説</h3>
      <div className="explanation">
        <Paragraphs text={q.explanation} />
      </div>

      <h3>要点</h3>
      <ul>
        {q.keyPoints.map((k, i) => (
          <li key={i}>{k}</li>
        ))}
      </ul>

      <h3>出典</h3>
      <ul>
        {q.references.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.title}
            </a>
          </li>
        ))}
      </ul>

      {lessons.length > 0 && (
        <>
          <h3>関連レッスン</h3>
          <ul>
            {lessons.map((id) => (
              <li key={id}>
                <Link to={`/lessons/${id}`}>{lessonTitles?.get(id)}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="btn-row">
        {onToggleFlag && (
          <button type="button" className="btn small" aria-pressed={!!flagged} onClick={onToggleFlag}>
            {flagged ? '⚑ フラグを外す' : '⚐ 見直しフラグを付ける'}
          </button>
        )}
        <a className="btn small" href={chatGptUrl(ask)} target="_blank" rel="noopener noreferrer">
          ChatGPT に聞く
        </a>
        <a className="btn small" href={claudeUrl(ask)} target="_blank" rel="noopener noreferrer">
          Claude に聞く
        </a>
        <a className="btn small" href={reportUrl(q)} target="_blank" rel="noopener noreferrer">
          誤りを報告
        </a>
      </div>
      <p className="small muted">問題 ID: {q.id}</p>
    </div>
  );
}
