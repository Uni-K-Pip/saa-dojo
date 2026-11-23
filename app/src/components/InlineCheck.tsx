import { createContext, useContext, useRef, useState, type ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import './InlineCheck.css';

export type CheckAnswer = { checkId: string; choice: number; correct: boolean };
export const CheckAnswerContext = createContext<((answer: CheckAnswer) => void) | undefined>(undefined);

const CheckContext = createContext<{
  selected: number | null;
  correctChoice: number;
  select: (choice: number) => void;
  reset: () => void;
} | null>(null);

export function InlineCheck({ node, children, className, ...props }: ComponentProps<'section'> & ExtraProps) {
  const onAnswer = useContext(CheckAnswerContext);
  const [selected, setSelected] = useState<number | null>(null);
  const section = useRef<HTMLElement>(null);
  const checkId = node?.properties.dataCheckId;
  const correctChoice = node?.properties.dataCorrectChoice;
  if (typeof checkId !== 'string' || typeof correctChoice !== 'number') {
    return <section className={className} {...props}>{children}</section>;
  }
  const select = (choice: number) => {
    if (selected !== null) return;
    setSelected(choice);
    onAnswer?.({ checkId, choice, correct: choice === correctChoice });
  };
  // 「もう一度」のボタンは消えるので、フォーカスを最初の選択肢へ移す
  const reset = () => {
    setSelected(null);
    section.current?.querySelector<HTMLButtonElement>('.inline-check-option')?.focus();
  };
  return (
    <CheckContext.Provider value={{ selected, correctChoice, select, reset }}>
      <section ref={section} className={className} aria-label="その場の確認">{children}</section>
    </CheckContext.Provider>
  );
}

export function InlineCheckOption({ node, children, ...props }: ComponentProps<'li'> & ExtraProps) {
  const check = useContext(CheckContext);
  const choice = node?.properties.dataCheckChoice;
  if (!check || typeof choice !== 'number') return <li {...props}>{children}</li>;
  const answered = check.selected !== null;
  return (
    <li data-choice={choice}>
      {/* disabled にすると、押したボタンからフォーカスが外れて本文の位置を失うので aria-disabled にする */}
      <button type="button" className="btn inline-check-option" aria-disabled={answered || undefined} onClick={() => check.select(choice)}>
        {children}
        {check.selected === choice && <span className="badge">あなたの答え</span>}
        {answered && check.correctChoice === choice && <span className="badge ok">正解</span>}
      </button>
    </li>
  );
}

export function InlineCheckReason({ node, children, ...props }: ComponentProps<'div'> & ExtraProps) {
  const check = useContext(CheckContext);
  if (!check || node?.properties.dataCheckReason !== true) return <div {...props}>{children}</div>;
  const correct = check.selected === check.correctChoice;
  return (
    <>
      <div aria-live="polite">
        {check.selected !== null && (
          <div className="inline-check-reason">
            <p><strong>{correct ? '正解です。' : '不正解です。'}</strong></p>
            {children}
          </div>
        )}
      </div>
      {check.selected !== null && <button type="button" className="btn small" onClick={check.reset}>もう一度</button>}
    </>
  );
}
