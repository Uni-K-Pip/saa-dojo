// 早見表・ガイドの一覧（検索つき）と本文
import { use, useDeferredValue, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { loadDocs } from '../content/loader';
import type { DocEntry } from '../content/types';
import { excerpt, searchDocs } from '../domain/search';
import { Markdown } from '../components/Markdown';
import { ServiceLinkList } from '../components/ServiceLinks';
import { useServiceLinker } from '../state/useContent';

const KIND_LABELS: Record<DocEntry['kind'], string> = { cheatsheet: '早見表', guide: 'ガイド' };

export default function DocsPage() {
  const docs = use(loadDocs());
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => searchDocs(docs, deferred), [docs, deferred]);

  return (
    <div>
      <h1>早見表・ガイド</h1>
      <div className="card">
        <label className="field" style={{ marginTop: 0 }}>
          <span>検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
            placeholder="例: VPC エンドポイント、Glacier"
            autoComplete="off"
          />
        </label>
        <p className="small muted" style={{ margin: 0 }} aria-live="polite">
          {query ? `${hits.length} 件見つかりました` : `${docs.length} 件`}
        </p>
      </div>
      {docs.length === 0 && <div className="notice warn">早見表・ガイドはまだありません。</div>}
      {(['cheatsheet', 'guide'] as const).map((kind) => {
        const list = hits.filter((d) => d.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="card" aria-labelledby={`${kind}-h`}>
            <h2 id={`${kind}-h`}>{KIND_LABELS[kind]}</h2>
            <ul className="list">
              {list.map((d) => (
                <li key={d.id}>
                  <Link to={`/docs/${d.id}`}>{d.title}</Link>
                  {d.taskStatements.length > 0 && <span className="small muted">（タスク {d.taskStatements.join('・')}）</span>}
                  {deferred && <div className="small muted">{excerpt(d.body, deferred)}</div>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {query && hits.length === 0 && <div className="notice">「{query}」に当てはまるものはありません。</div>}
    </div>
  );
}

export function DocPage() {
  const { id = '' } = useParams();
  const docs = use(loadDocs());
  const { link } = useServiceLinker();
  const doc = docs.find((d) => d.id === id);
  if (!doc) {
    return (
      <div className="card">
        <h1>見つかりません</h1>
        <p>指定された早見表・ガイド（{id}）は現在のコンテンツにありません。</p>
        <Link className="btn" to="/docs">
          一覧へ
        </Link>
      </div>
    );
  }
  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}>
        <Link to="/docs">早見表・ガイド</Link> › {KIND_LABELS[doc.kind]}
      </p>
      <h1>{doc.title}</h1>
      {doc.services.length > 0 && <p className="small muted">
          扱うサービス: <ServiceLinkList names={doc.services} link={link} />
        </p>}
      <div className="card">
        <Markdown>{doc.body}</Markdown>
      </div>
      {doc.taskStatements.length > 0 && (
        <div className="btn-row">
          <Link className="btn" to={`/practice?tasks=${encodeURIComponent(doc.taskStatements.join(','))}`}>
            関連タスク（{doc.taskStatements.join('・')}）を演習する
          </Link>
        </div>
      )}
    </article>
  );
}
