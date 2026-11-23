// 用語集（検索つき）
import { use, useDeferredValue, useMemo } from 'react';
import { loadGlossary } from '../content/loader';
import { searchGlossary } from '../domain/search';
import { ServiceLink } from '../components/ServiceLinks';
import { useServiceLinker } from '../state/useContent';
import { useSearchText } from '../state/useSearchText';
import { ReviewBadge } from '../components/ReviewStatus';

const LIMIT = 200;

export default function GlossaryPage() {
  const entries = use(loadGlossary());
  const { link } = useServiceLinker();
  const { text: query, setText: setQuery } = useSearchText();
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => searchGlossary(entries, deferred), [entries, deferred]);
  // すべてが未検証のあいだは、語ごとの札の代わりに上の 1 行で知らせる（172 語に同じ札が並ばないように）
  const allPending = entries.length > 0 && entries.every((e) => e.status === 'pending');

  return (
    <div>
      <h1>用語集</h1>
      <div className="card">
        <label className="field" style={{ marginTop: 0 }}>
          <span>用語を検索</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例: サブネット、NAT、Lambda" autoComplete="off" />
        </label>
        <p className="small muted" style={{ margin: 0 }} aria-live="polite">
          {query ? `${hits.length} 件見つかりました` : `${entries.length} 語`}
        </p>
        {allPending && (
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            <span className="badge pending">未検証</span> 用語の説明は、まだ内容の検証が済んでいません。
          </p>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="notice warn">用語集はまだありません。</div>
      ) : hits.length === 0 ? (
        <div className="notice">「{query}」に当てはまる用語はありません。</div>
      ) : (
        <dl className="glossary card">
          {hits.slice(0, LIMIT).map((e) => (
            <div key={`${e.term}|${e.en}`}>
              <dt>
                {e.term} <span className="small muted">{e.en}</span>
                {!allPending && <>{' '}<ReviewBadge status={e.status} label="用語" /></>}
              </dt>
              <dd>
                {e.definition}
                {(e.services.length > 0 || e.related.length > 0) && (
                  <span className="meta-row" style={{ marginTop: 4 }}>
                    {e.services.map((s) => (
                      <ServiceLink key={s} name={s} link={link} className="badge info" />
                    ))}
                    {e.related.map((r) => (
                      <button key={r} type="button" className="link-button small" onClick={() => setQuery(r)}>
                        関連: {r}
                      </button>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {hits.length > LIMIT && <p className="small muted">ほか {hits.length - LIMIT} 件。検索語を足して絞り込んでください。</p>}
    </div>
  );
}
