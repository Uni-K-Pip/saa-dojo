// 問題文と選択肢（single はラジオ、multiple はチェックボックス）、自信度の選択
import type { Question } from '../content/types';
import type { Confidence } from '../domain/events';
import { LETTERS } from '../domain/grading';
import { CONFIDENCES, CONFIDENCE_LABELS, DIFFICULTY_LABELS, QUALIFIER_LABELS } from '../domain/labels';

export function QuestionBadges({ q, showQualifier = false }: { q: Question; showQualifier?: boolean }) {
  return (
    <span className="meta-row">
      <span>タスク {q.taskStatement}</span>
      <span aria-hidden="true">·</span>
      <span>難易度 {DIFFICULTY_LABELS[q.difficulty]}</span>
      {showQualifier && (
        <>
          <span aria-hidden="true">·</span>
          <span>判断軸 {QUALIFIER_LABELS[q.qualifier]}</span>
        </>
      )}
      {q.status === 'pending' && (
        <span className="badge pending" title="内容の検証がまだ終わっていない問題です">
          未検証
        </span>
      )}
      {q.needsSourceCheck && (
        <span className="badge info" title="公式ドキュメントで確認しきれていない事実を含みます">
          出典確認中
        </span>
      )}
    </span>
  );
}

export function selectionHint(q: Pick<Question, 'type' | 'selectCount'>, count: number): string {
  if (q.type === 'single') return count === 0 ? '選択肢を1つ選んでください' : '';
  if (count < q.selectCount) return `あと${q.selectCount - count}つ選んでください`;
  if (count > q.selectCount) return `${q.selectCount}つまで選んでください（${count - q.selectCount}つ多い）`;
  return '';
}

interface Props {
  q: Question;
  order: string[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  confidence: Confidence | null;
  onConfidence: (c: Confidence) => void;
  disabled?: boolean;
  /** 見出しの番号（例: 3 / 10） */
  position?: string;
  confidenceLabel?: string;
}

export function QuestionView({ q, order, selected, onSelect, confidence, onConfidence, disabled, position, confidenceLabel }: Props) {
  const byId = new Map(q.options.map((o) => [o.id, o]));
  const multiple = q.type === 'multiple';
  const toggle = (id: string) => {
    if (!multiple) onSelect([id]);
    else onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const name = `q-${q.id}`;
  return (
    <div className="question">
      <div className="question-head">
        {position && <strong>{position}</strong>}
        <QuestionBadges q={q} />
      </div>
      <p className="stem">{q.stem}</p>
      <fieldset className="options" disabled={disabled}>
        <legend>{multiple ? `選択肢から${q.selectCount}つ選んでください` : '選択肢から1つ選んでください'}</legend>
        {order.map((id, i) => {
          const o = byId.get(id);
          if (!o) return null;
          return (
            <label key={id} className="option">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={name}
                value={id}
                checked={selected.includes(id)}
                onChange={() => toggle(id)}
              />
              <span className="option-letter" aria-hidden="true">
                {LETTERS[i]}
              </span>
              <span className="option-text">
                <span className="visually-hidden">{LETTERS[i]}. </span>
                {o.text}
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="confidence" disabled={disabled}>
        <legend>{confidenceLabel ?? '自信度（回答前に選んでください）'}</legend>
        <div className="chips">
          {CONFIDENCES.map((c) => (
            <label key={c} className="chip">
              <input type="radio" name={`${name}-confidence`} value={c} checked={confidence === c} onChange={() => onConfidence(c)} />
              {CONFIDENCE_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
