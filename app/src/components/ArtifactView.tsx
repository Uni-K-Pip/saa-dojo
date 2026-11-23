// 実物の表示（設計書 6章）。本体（整形した JSON・表・行）を出し、注目点の場所を強調して番号を付け、
// 注目点の一覧と同じ番号で対応させる（色だけで区別しない）。ask は「答えを見る」で開く（回答は記録しない）。
import type { ArtifactData } from '../content/types';
import './ArtifactView.css';

function NoteNum({ n }: { n: number }) {
  return (
    <span className="ar-num">
      <span className="visually-hidden">注目点 </span>
      {n}
    </span>
  );
}

function Lines({ item }: { item: ArtifactData }) {
  const numbered = item.format === 'text';
  const lines = item.lines ?? [];
  // 注目点の番号は、本文の前の専用の列に出す（番号のある行だけ字が右にずれないよう、どの行も同じ幅を取る）
  const noted = lines.some((l) => l.starts.length > 0);
  return (
    <div className={`ar-code${numbered ? ' numbered' : ''}${noted ? ' noted' : ''}`}>
      {lines.map((l, i) => (
        <div key={i} className={l.marks.length ? 'ar-line ar-mark' : 'ar-line'}>
          {numbered && (
            <span className="ar-ln">
              <span className="visually-hidden">行 </span>
              {i + 1}
            </span>
          )}
          {noted && (
            <span className="ar-gutter">
              {l.starts.map((n) => (
                <NoteNum key={n} n={n} />
              ))}
            </span>
          )}
          <span className="ar-text" style={{ paddingLeft: `${l.indent}ch` }}>
            {l.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function Table({ item }: { item: ArtifactData }) {
  const columns = item.columns ?? [];
  return (
    <table className="ar-table">
      <thead>
        <tr>
          <th scope="col">行</th>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(item.rows ?? []).map((r, i) => (
          <tr key={i} className={r.marks.length ? 'ar-mark' : undefined}>
            <th scope="row" className="ar-rowhead">
              <span className="ar-rowno">{i + 1}</span>
              {r.starts.map((n) => (
                <NoteNum key={n} n={n} />
              ))}
            </th>
            {r.cells.map((c, j) => (
              <td key={j} data-label={columns[j]}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ArtifactView({ item }: { item: ArtifactData }) {
  return (
    <div className="artifact">
      <p className="meta-row">
        <span className="badge info">{item.kindLabel}</span>
        {item.status === 'pending' && <span className="badge pending">未検証</span>}
      </p>
      <div className="ar-body" role="group" aria-label={`${item.kindLabel}の本体`}>
        {item.format === 'table' ? <Table item={item} /> : <Lines item={item} />}
      </div>
      {item.notes.length > 0 && (
        <>
          <p className="ar-sub">注目点</p>
          <ol className="ar-notes">
            {item.notes.map((n) => (
              <li key={n.n}>
                <span className="ar-num" aria-hidden="true">
                  {n.n}
                </span>
                <div>
                  <span className="visually-hidden">注目点 {n.n}: </span>
                  {n.text}
                  <span className="ar-where">
                    場所: <code>{n.where}</code>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {item.ask && (
        <section className="ar-ask" aria-label="読んだあとの問い">
          <p className="ar-sub">問い</p>
          <p>{item.ask.text}</p>
          <details>
            <summary>答えを見る</summary>
            <p>{item.ask.answer}</p>
          </details>
        </section>
      )}
    </div>
  );
}

export default ArtifactView;
