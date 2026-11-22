// サービス図鑑の一覧: 検索（?q=）、区分・タスク・未読の絞り込み、分類ごとのリスト
import { use, useDeferredValue, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { loadBlueprint, loadCatalogIndex } from '../content/loader';
import type { CatalogIndexService, CatalogTier } from '../content/types';
import { catalogPath } from '../domain/catalog';
import { catalogReadMap } from '../domain/progress';
import { searchCatalog } from '../domain/search';
import { useStudy } from '../state/study';

export const TIER_LABELS: Record<CatalogTier, string> = { 1: '主要', 2: '標準', 3: '概要' };
const TIERS: CatalogTier[] = [1, 2, 3];
const SUMMARY_CHARS = 60;

const head = (text: string) => {
  const chars = Array.from(text);
  return chars.length > SUMMARY_CHARS ? `${chars.slice(0, SUMMARY_CHARS).join('')}…` : text;
};

function list(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export default function ServicesPage() {
  const index = use(loadCatalogIndex());
  const blueprint = use(loadBlueprint());
  const { events } = useStudy();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const deferred = useDeferredValue(query);
  const tiers = list(params, 'tier').map(Number).filter((n): n is CatalogTier => n === 1 || n === 2 || n === 3);
  const tasks = list(params, 'task');
  const unread = params.get('unread') === '1';
  const read = useMemo(() => catalogReadMap(events), [events]);

  // 検索語と絞り込みは URL に持つ（詳細から戻っても同じ表示になる）
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const toggle = <T extends string | number>(key: string, current: readonly T[], value: T) => {
    const set = new Set<T>(current);
    if (!set.delete(value)) set.add(value);
    update({ [key]: [...set].join(',') || null });
  };

  const taskIds = useMemo(() => {
    const ids = new Set(index.services.flatMap((s) => s.tasks));
    return [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  }, [index]);
  const taskTitle = (id: string) => blueprint?.domains.flatMap((d) => d.tasks).find((t) => t.id === id)?.titleJa;

  const hits = useMemo(() => searchCatalog(index.services, deferred), [index, deferred]);
  const filtered = hits.filter(({ service: s }) => {
    if (tiers.length && (s.tier === undefined || !tiers.includes(s.tier))) return false;
    if (tasks.length && !s.tasks.some((t) => tasks.includes(t))) return false;
    if (unread && (s.tier === undefined || read.has(s.id))) return false;
    return true;
  });
  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const h of filtered) {
      const cat = h.service.category;
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(h);
    }
    return [...m];
  }, [filtered]);
  const prepared = index.services.filter((s) => s.tier !== undefined).length;
  const filtering = Boolean(query) || tiers.length > 0 || tasks.length > 0 || unread;

  return (
    <div>
      <h1>サービス図鑑</h1>
      <div className="card">
        <label className="field" style={{ marginTop: 0 }}>
          <span>サービスを検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value || null })}
            placeholder="例: S3、Lambda、アクセスポイント"
            autoComplete="off"
          />
        </label>
        <div className="chips chips-scroll" role="group" aria-label="絞り込み">
          {TIERS.map((t) => (
            <label key={t} className="chip">
              <input type="checkbox" checked={tiers.includes(t)} onChange={() => toggle('tier', tiers, t)} />
              {TIER_LABELS[t]}
            </label>
          ))}
          <label className="chip">
            <input type="checkbox" checked={unread} onChange={() => update({ unread: unread ? null : '1' })} />
            未読
          </label>
          {taskIds.map((t) => (
            <label key={t} className="chip" title={taskTitle(t)}>
              <input type="checkbox" checked={tasks.includes(t)} onChange={() => toggle('task', tasks, t)} />
              タスク {t}
            </label>
          ))}
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }} aria-live="polite">
          {filtering ? `${filtered.length} 件見つかりました` : `${index.services.length} サービス（解説あり ${prepared}）`}
        </p>
      </div>

      {index.services.length === 0 ? (
        <div className="notice warn">サービス図鑑のデータがまだありません。</div>
      ) : filtered.length === 0 ? (
        <div className="notice">条件に当てはまるサービスはありません。</div>
      ) : (
        groups.map(([category, rows], gi) => (
          <section key={category} className="card" aria-labelledby={`cat-${gi}`}>
            <h2 id={`cat-${gi}`}>{category}</h2>
            <ul className="list">
              {rows.map(({ service, facts }) => (
                <ServiceRow key={service.id} service={service} facts={facts} readAt={read.get(service.id)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function ServiceRow({
  service: s,
  facts,
  readAt,
}: {
  service: CatalogIndexService;
  facts: CatalogIndexService['facts'];
  readAt: number | undefined;
}) {
  return (
    <li>
      <div className="row-between">
        <Link to={catalogPath(s.id)} style={s.tier === 1 ? { fontWeight: 700 } : undefined}>
          {s.name}
        </Link>
        {readAt !== undefined && <span className="badge ok">読了</span>}
      </div>
      {s.summary !== undefined ? <div className="small muted">{head(s.summary)}</div> : <div className="small muted">準備中</div>}
      {facts.length > 0 && (
        <ul className="fact-hits small">
          {facts.map((f) => (
            <li key={f.id}>
              <Link to={catalogPath(s.id, f.id.slice(s.id.length + 1))}>{f.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
