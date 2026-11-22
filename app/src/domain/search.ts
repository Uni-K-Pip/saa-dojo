// 用語集・早見表・ガイドの検索（全角・半角、大文字・小文字、ひらがな・カタカナの違いを無視する）
import type { CatalogIndexFact, CatalogIndexService, DocEntry, GlossaryEntry } from '../content/types';

export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, ' ')
    .trim();
}

/** 空白で区切った語がすべて含まれるか */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const h = normalize(haystack);
  return words.every((w) => h.includes(w));
}

/** 用語の検索。用語名・英語名に当たったものを先に並べる */
export function searchGlossary(entries: readonly GlossaryEntry[], query: string): GlossaryEntry[] {
  const q = normalize(query);
  if (!q) return [...entries];
  const hits = entries.filter((e) => matchesQuery([e.term, e.en, e.definition, ...e.services, ...e.related].join(' '), query));
  const inName = (e: GlossaryEntry) => (normalize(`${e.term} ${e.en}`).includes(q) ? 0 : 1);
  return hits.map((e, i) => ({ e, i, r: inName(e) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.e);
}

/** 早見表・ガイドの検索。タイトル・サービスに当たったものを先に並べる */
export function searchDocs(docs: readonly DocEntry[], query: string): DocEntry[] {
  const q = normalize(query);
  if (!q) return [...docs];
  const hits = docs.filter((d) => matchesQuery([d.title, ...d.services, ...d.taskStatements, d.body].join(' '), query));
  const inTitle = (d: DocEntry) => (matchesQuery([d.title, ...d.services].join(' '), query) ? 0 : 1);
  return hits.map((d, i) => ({ d, i, r: inTitle(d) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.d);
}

export interface CatalogHit {
  service: CatalogIndexService;
  /** 検索語が事実の見出し・タグに当たったときの、その事実（名前に当たったときは空） */
  facts: CatalogIndexFact[];
}

/**
 * サービス図鑑の検索。対象は名前・別名・short・子の名前・summary・事実の見出しとタグ（事実の本文は探さない）。
 * 名前・別名に当たったものを先に並べる。名前で当たらず、事実の見出し・タグに当たったときは、その事実を返す。
 */
export function searchCatalog(services: readonly CatalogIndexService[], query: string): CatalogHit[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return services.map((service) => ({ service, facts: [] }));
  const hay = (parts: readonly (string | undefined)[]) => normalize(parts.filter(Boolean).join(' '));
  const has = (h: string) => words.every((w) => h.includes(w));
  const hits: { hit: CatalogHit; rank: number; i: number }[] = [];
  services.forEach((service, i) => {
    const names = hay([service.name, service.short, ...service.aliases, ...service.children.flatMap((c) => [c.name, ...c.aliases])]);
    const own = `${names} ${hay([service.summary])}`;
    const factHay = (f: CatalogIndexFact) => hay([f.title, ...f.tags]);
    const all = `${own} ${service.facts.map(factHay).join(' ')}`;
    if (!has(all)) return;
    // 名前で当たったときは見出しを添えない（S3 と入れると S3 の事実が全部並ぶため）。それ以外は、語に当たった事実の見出しを添える
    const byName = has(names);
    const facts = byName ? [] : service.facts.filter((f) => words.some((w) => factHay(f).includes(w)) && has(`${own} ${factHay(f)}`));
    hits.push({ hit: { service, facts }, rank: byName ? 0 : 1, i });
  });
  return hits.sort((a, b) => a.rank - b.rank || a.i - b.i).map((x) => x.hit);
}

/** 本文から、検索語の前後を抜き出す（一覧での表示用） */
export function excerpt(body: string, query: string, width = 60): string {
  const plain = body.replace(/^#+\s*/gm, '').replace(/[*_`>|]/g, '').replace(/\s+/g, ' ').trim();
  const word = normalize(query).split(' ').filter(Boolean)[0];
  const chars = Array.from(plain);
  if (!word) return chars.slice(0, width).join('') + (chars.length > width ? '…' : '');
  const norm = Array.from(plain).map((c) => normalize(c) || ' ');
  const joined = norm.join('');
  const at = joined.indexOf(word);
  if (at < 0) return chars.slice(0, width).join('') + (chars.length > width ? '…' : '');
  // norm は1文字ずつ正規化しているので、位置は概ね元の文字に対応する
  let pos = 0;
  let idx = 0;
  while (idx < norm.length && pos + norm[idx]!.length <= at) pos += norm[idx++]!.length;
  const start = Math.max(0, idx - Math.floor(width / 3));
  const end = Math.min(chars.length, start + width);
  return (start > 0 ? '…' : '') + chars.slice(start, end).join('') + (end < chars.length ? '…' : '');
}
