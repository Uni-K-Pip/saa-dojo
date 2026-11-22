import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './DiagramFullscreen.css';

interface Props {
  title: string;
  renderFrame: (full: boolean, expand?: () => void) => ReactNode;
  controls?: ReactNode;
}

export function DiagramFullscreen({ title, renderFrame, controls }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);
  const expand = () => setShown(true);

  useLayoutEffect(() => {
    const el = dialog.current;
    if (!shown || !el || el.open) return;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    closeButton.current?.focus();
  }, [shown]);

  function close() {
    const el = dialog.current;
    if (el?.open && typeof el.close === 'function') el.close();
    else el?.removeAttribute('open');
    setShown(false);
    expandButton.current?.focus();
  }

  return (
    <>
      <div className="dg-expand">
        <button type="button" className="btn small" aria-label="図を画面いっぱいに広げる" ref={expandButton} onClick={expand}>
          広げる
        </button>
      </div>
      {renderFrame(false, expand)}
      {shown && (
        <dialog
          ref={dialog}
          className="dg-dialog"
          aria-labelledby={titleId}
          aria-modal="true"
          onCancel={(e) => { e.preventDefault(); close(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
        >
          <div className="dg-dialog-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="btn small" ref={closeButton} onClick={close}>閉じる</button>
          </div>
          {renderFrame(true)}
          {controls}
        </dialog>
      )}
    </>
  );
}
