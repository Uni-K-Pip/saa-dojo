// サービス図鑑へのリンクの組み立て（名前 → エントリ id、事実 id → 位置）
import type { CatalogIndex, ServiceEntry } from '../content/types';
import { normalize } from './search';

/** サービス名（正規名・別名）から、そのサービスを扱う図鑑のエントリ id を引く。範囲外や不明の名前は null */
export type ServiceLinker = (name: string) => string | null;

export function makeServiceLinker(registry: readonly ServiceEntry[]): ServiceLinker {
  const byId = new Map(registry.map((e) => [e.id, e]));
  const exact = new Map<string, string>();
  const loose = new Map<string, string>();
  const owner = (e: ServiceEntry) => e.hostedBy ?? e.id;
  for (const e of registry) {
    for (const n of [e.name, ...e.aliases]) {
      if (!exact.has(n)) exact.set(n, owner(e));
      const k = normalize(n);
      if (!loose.has(k)) loose.set(k, owner(e));
    }
  }
  // 親が台帳になければ、その子自身の id を使う（壊れた台帳でもリンクを切らない）
  const safe = (id: string | undefined) => (id !== undefined && byId.has(id) ? id : null);
  return (name) => safe(exact.get(name) ?? loose.get(normalize(name)));
}

export const catalogPath = (entryId: string, slug?: string): string => `/services/${entryId}${slug ? `?f=${encodeURIComponent(slug)}` : ''}`;

/** 事実 id（<サービスid>.<スラッグ>）を分ける */
export function splitFactId(id: string): { entryId: string; slug: string } | null {
  const i = id.indexOf('.');
  return i > 0 ? { entryId: id.slice(0, i), slug: id.slice(i + 1) } : null;
}

export interface FactLink {
  id: string;
  title: string;
  entryId: string;
  slug: string;
}

/** 事実 id を、一覧（出力に残った事実）で見つかるものだけリンクにする。除外された事実・存在しない事実は捨てる */
export function resolveFactLinks(ids: readonly string[] | undefined, index: CatalogIndex): FactLink[] {
  if (!ids?.length) return [];
  const titles = new Map<string, string>();
  for (const s of index.services) for (const f of s.facts) titles.set(f.id, f.title);
  const out: FactLink[] = [];
  for (const id of ids) {
    const title = titles.get(id);
    const parts = splitFactId(id);
    if (title !== undefined && parts) out.push({ id, title, ...parts });
  }
  return out;
}

/** 問題の services から、図鑑のエントリへのリンク（エントリ id ごとに 1 つ。名前は台帳の正規名） */
export function questionCatalogLinks(
  services: readonly string[],
  registry: readonly ServiceEntry[],
  link: ServiceLinker,
): { id: string; name: string }[] {
  const byId = new Map(registry.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const s of services) {
    const id = link(s);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: byId.get(id)?.name ?? s });
  }
  return out;
}
