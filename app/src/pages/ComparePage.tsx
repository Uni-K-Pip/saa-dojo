// サービス図鑑の比較（5.4）。広い画面では表、狭い画面では観点ごとの縦並び（CSS だけで切り替える）
import { use } from 'react';
import { Link, useParams } from 'react-router';
import { loadCatalogIndex, loadComparisons, loadDocs, loadServices } from '../content/loader';
import { catalogPath, resolveFactLinks } from '../domain/catalog';

export default function ComparePage() {
  const { id = '' } = useParams();
  const comparisons = use(loadComparisons());
  const index = use(loadCatalogIndex());
  const registry = use(loadServices());
  const docs = use(loadDocs());
  const c = comparisons.find((x) => x.id === id);
  if (!c) {
    return (
      <div className="card">
        <h1>見つかりません</h1>
        <p>指定された比較（{id}）は現在のサービス図鑑にありません。</p>
        <Link className="btn" to="/services">
          一覧へ
        </Link>
      </div>
    );
  }
  const nameOf = (sid: string) => registry.find((s) => s.id === sid)?.name ?? sid;
  const doc = c.docRef ? docs.find((d) => d.id === c.docRef) : undefined;
  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}>
        <Link to="/services">サービス図鑑</Link> › 比較
      </p>
      <h1>{c.title}</h1>
      <p className="meta-row">
        {c.status === 'pending' && <span className="badge pending">未検証</span>}
        <span>確認日 {c.checkedAt}</span>
      </p>

      <section className="card" aria-labelledby="decide-h">
        <h2 id="decide-h">見分け方</h2>
        <ul>
          {c.decide.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        {c.docRef && (
          <p>
            詳しい比較は早見表を見てください:{' '}
            {doc ? <Link to={`/docs/${doc.id}`}>{doc.title}</Link> : <span className="muted">{c.docRef}（現在のコンテンツにありません）</span>}
          </p>
        )}
      </section>

      {c.rows && (
        <section className="card" aria-labelledby="rows-h">
          <h2 id="rows-h">観点ごとの比較</h2>
          <div className="table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">観点</th>
                  {c.services.map((s) => (
                    <th key={s} scope="col">
                      <Link to={catalogPath(s)}>{nameOf(s)}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.axis}>
                    <th scope="row">
                      {r.axis}
                      {resolveFactLinks(r.factRefs, index).map((l) => (
                        <span key={l.id} className="small fact-ref">
                          <Link to={catalogPath(l.entryId, l.slug)}>{l.title}</Link>
                        </span>
                      ))}
                    </th>
                    {c.services.map((s) => (
                      <td key={s} data-label={nameOf(s)}>
                        {r.values[s]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="small muted">
        出典:{' '}
        {c.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '、'}
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </span>
        ))}
      </p>
    </article>
  );
}
