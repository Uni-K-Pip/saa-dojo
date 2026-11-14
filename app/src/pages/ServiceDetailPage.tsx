// サービス図鑑の詳細（5.3）。エントリがなくても、名前・分類・関連する教材・演習への入口は出す
import { use, useEffect, useMemo } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import {
  loadCatalogEntry,
  loadCatalogIndex,
  loadDocs,
  loadLessons,
  loadServices,
} from '../content/loader';
import type { CatalogEntry, CatalogFact, CatalogFactKind, CatalogIndex, CatalogIndexService, CatalogPoint, ServiceEntry } from '../content/types';
import { appendEvent } from '../db/repo';
import { catalogPath, resolveFactLinks, type ServiceLinker } from '../domain/catalog';
import { catalogReadMap } from '../domain/progress';
import { filterToQuery } from '../domain/selection';
import { ServiceLinkList } from '../components/ServiceLinks';
import { useServiceLinker } from '../state/useContent';
import { useStudy } from '../state/study';
import { TIER_LABELS } from './ServicesPage';

const KIND_ORDER: CatalogFactKind[] = ['feature', 'constraint', 'quota', 'pricing', 'integration'];
export const KIND_LABELS: Record<CatalogFactKind, string> = {
  feature: '機能',
  constraint: '制約・できないこと',
  quota: '数値（上限・既定値・期間）',
  pricing: '料金の仕組み',
  integration: '他サービスとの連携',
};

const slugOf = (entryId: string, factId: string) => factId.slice(entryId.length + 1);

function NotFound({ id }: { id: string }) {
  return (
    <div className="card">
      <h1>見つかりません</h1>
      <p>指定されたサービス（{id}）は現在のサービス図鑑にありません。</p>
      <Link className="btn" to="/services">
        一覧へ
      </Link>
    </div>
  );
}

export default function ServiceDetailPage() {
  const { id = '' } = useParams();
  const registry = use(loadServices());
  const reg = registry.find((s) => s.id === id);
  if (!reg) return <NotFound id={id} />;
  // 子のサービス（hostedBy）は親のエントリで扱う
  if (reg.hostedBy !== undefined && registry.some((s) => s.id === reg.hostedBy)) return <ChildRedirect child={reg} parentId={reg.hostedBy} />;
  return <ServiceView key={reg.id} reg={reg} registry={registry} />;
}

/** 親のエントリの事実に、子の正規名を services に持つものがあれば、その事実の位置へ移る */
function ChildRedirect({ child, parentId }: { child: ServiceEntry; parentId: string }) {
  const entry = use(loadCatalogEntry(parentId));
  const hit = entry?.facts.find((f) => f.services?.includes(child.name));
  return <Navigate replace to={catalogPath(parentId, hit ? slugOf(parentId, hit.id) : undefined)} />;
}

function ServiceView({ reg, registry }: { reg: ServiceEntry; registry: ServiceEntry[] }) {
  const index = use(loadCatalogIndex());
  const entry = use(loadCatalogEntry(reg.id));
  const row = index.services.find((s) => s.id === reg.id);
  const { link } = useServiceLinker();
  const { events } = useStudy();
  const [params] = useSearchParams();
  const f = params.get('f') ?? '';
  const readAt = catalogReadMap(events).get(reg.id);

  // ?f= の事実を開いたうえで、その位置へ移動する（開くのは描画時の open 属性。ここでは位置合わせだけ）
  useEffect(() => {
    if (!f) return;
    const el = document.getElementById(`fact-${f}`);
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView?.({ block: 'start' });
  }, [f, entry]);

  const children = row?.children ?? [];
  const unverified = entry ? entry.facts.filter((x) => x.status === 'pending').length : 0;
  const names = [reg.name, ...children.map((c) => c.name)];

  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}>
        <Link to="/services">サービス図鑑</Link> › {reg.category}
      </p>
      <h1>{reg.name}</h1>
      {reg.aliases.length > 0 && <p className="small muted">別名: {reg.aliases.join('、')}</p>}
      {children.length > 0 && <p className="small muted">このエントリで扱う: {children.map((c) => c.name).join('、')}</p>}
      <p className="meta-row">
        {entry ? (
          <>
            <span className="badge info">区分 {entry.tier}（{TIER_LABELS[entry.tier]}）</span>
            {entry.status === 'pending' && <span className="badge pending">未検証</span>}
            {unverified > 0 && <span>未検証の事実 {unverified} 件</span>}
          </>
        ) : (
          <span className="badge pending">準備中</span>
        )}
        {readAt !== undefined && <span className="badge ok">読了 {new Date(readAt).toLocaleDateString('ja-JP')}</span>}
      </p>

      {entry ? (
        <EntryBody entry={entry} registry={registry} index={index} link={link} />
      ) : (
        <div className="notice">このサービスの解説は準備中です。下の関連する教材と演習は使えます。</div>
      )}

      {row && <Related row={row} index={index} names={names} />}

      {entry && (
        <div className="btn-row">
          <button type="button" className="btn" aria-pressed={readAt !== undefined} onClick={() => void appendEvent({ type: 'catalog-read', serviceId: reg.id })}>
            {readAt !== undefined ? '✓ 読んだ（もう一度記録する）' : '読んだ'}
          </button>
        </div>
      )}
    </article>
  );
}

function PointList({ title, points, registry, index }: { title: string; points: CatalogPoint[]; registry: ServiceEntry[]; index: CatalogIndex }) {
  const nameOf = (id: string) => registry.find((s) => s.id === id)?.name ?? id;
  return (
    <section className="card" aria-label={title}>
      <h2>{title}</h2>
      <ul>
        {points.map((p) => (
          <li key={p.text}>
            {p.text}
            {p.alternatives?.map((a) => (
              <span key={a}>
                {' '}
                → <Link to={catalogPath(a)}>{nameOf(a)}</Link>
              </span>
            ))}
            {resolveFactLinks(p.factRefs, index).map((l) => (
              <span key={l.id} className="small">
                {' '}
                （<Link to={catalogPath(l.entryId, l.slug)}>{l.title}</Link>）
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EntryBody({ entry, registry, index, link }: { entry: CatalogEntry; registry: ServiceEntry[]; index: CatalogIndex; link: ServiceLinker }) {
  const [params] = useSearchParams();
  const f = params.get('f') ?? '';
  const core = entry.facts.filter((x) => x.depth === 'core');
  const detail = entry.facts.filter((x) => x.depth === 'detail');
  return (
    <>
      <p>{entry.summary}</p>
      {entry.chooseWhen && <PointList title="選ばれる決め手" points={entry.chooseWhen} registry={registry} index={index} />}
      {entry.avoidWhen && <PointList title="選ばれない条件" points={entry.avoidWhen} registry={registry} index={index} />}

      {entry.facts.length > 0 && (
        <section className="card" aria-labelledby="facts-h">
          <h2 id="facts-h">機能と制約</h2>
          {KIND_ORDER.map((kind) => {
            const list = core.filter((x) => x.kind === kind);
            return list.length > 0 ? <FactGroup key={kind} title={KIND_LABELS[kind]} facts={list} entryId={entry.id} target={f} link={link} /> : null;
          })}
          {detail.length > 0 && <FactGroup title="発展（試験より細かい可能性がある内容）" facts={detail} entryId={entry.id} target={f} link={link} />}
        </section>
      )}

      {entry.seeAlso.length > 0 && (
        <section className="card" aria-labelledby="see-h">
          <h2 id="see-h">関連する事実</h2>
          <ul>
            {entry.seeAlso.map((s) => (
              <li key={s.id}>
                <Link to={catalogPath(s.entryId, slugOf(s.entryId, s.id))}>{s.title}</Link> <span className="small muted">（{s.entryName}）</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function FactGroup({ title, facts, entryId, target, link }: { title: string; facts: CatalogFact[]; entryId: string; target: string; link: ServiceLinker }) {
  return (
    <div className="fact-group">
      <h3>{title}</h3>
      {facts.map((x) => (
        <FactItem key={x.id} fact={x} slug={slugOf(entryId, x.id)} target={target} link={link} />
      ))}
    </div>
  );
}

function FactItem({ fact: x, slug, target, link }: { fact: CatalogFact; slug: string; target: string; link: ServiceLinker }) {
  const isTarget = target === slug;
  return (
    <details id={`fact-${slug}`} className={`fact${isTarget ? ' is-target' : ''}`} open={isTarget}>
      <summary>
        {x.title}
        {x.depth === 'detail' && <span className="badge info">発展</span>}
        {x.status === 'pending' && <span className="badge pending">未検証</span>}
      </summary>
      <p>{x.text}</p>
      {x.examPoint && (
        <aside className="callout tip" aria-label="試験のポイント">
          <p className="callout-title">試験のポイント</p>
          <p>{x.examPoint}</p>
        </aside>
      )}
      {x.trap && (
        <aside className="callout trap" aria-label="ひっかけ注意">
          <p className="callout-title">ひっかけ注意</p>
          <p>{x.trap}</p>
        </aside>
      )}
      {x.services && x.services.length > 0 && (
        <p className="small muted">
          関連するサービス: <ServiceLinkList names={x.services} link={link} />
        </p>
      )}
      <p className="small muted">
        出典:{' '}
        {x.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && '、'}
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </span>
        ))}
        （確認日 {x.checkedAt}）
      </p>
    </details>
  );
}

function Related({ row, index, names }: { row: CatalogIndexService; index: CatalogIndex; names: string[] }) {
  const lessons = use(loadLessons());
  const docs = use(loadDocs());
  const lessonById = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const r = row.related;
  const cmps = row.comparisons
    .map((id) => index.comparisons.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const lessonList = r.lessons.map((id) => lessonById.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
  const docList = r.docs.map((id) => docById.get(id)).filter((d): d is NonNullable<typeof d> => !!d);
  return (
    <>
      {cmps.length > 0 && (
        <section className="card" aria-labelledby="cmp-h">
          <h2 id="cmp-h">比較</h2>
          <ul>
            {cmps.map((c) => (
              <li key={c.id}>
                <Link to={`/services/compare/${c.id}`}>{c.title}</Link>
                {c.status === 'pending' && <span className="badge pending">未検証</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card" aria-labelledby="rel-h">
        <h2 id="rel-h">関連する教材</h2>
        {lessonList.length > 0 && (
          <>
            <h3>レッスン</h3>
            <ul>
              {lessonList.map((l) => (
                <li key={l.id}>
                  <Link to={`/lessons/${l.id}`}>{l.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {docList.length > 0 && (
          <>
            <h3>早見表・ガイド</h3>
            <ul>
              {docList.map((d) => (
                <li key={d.id}>
                  <Link to={`/docs/${d.id}`}>{d.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <ul>
          <li>
            用語: {r.glossary} 語{r.glossary > 0 && <> （<Link to={`/glossary?${new URLSearchParams({ q: row.name })}`}>用語集で探す</Link>）</>}
          </li>
          <li>フラッシュカード: {r.flashcards} 枚</li>
          <li>演習問題: {r.questions} 問</li>
        </ul>
        <div className="btn-row">
          <Link className="btn primary" to={`/practice?${filterToQuery({ services: names })}`}>
            このサービスの問題を演習する
          </Link>
        </div>
      </section>
    </>
  );
}
