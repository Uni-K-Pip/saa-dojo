// 用語集・早見表・ガイドの検索（全角・半角、大文字・小文字、ひらがな・カタカナの違いを無視する）
import type { DocEntry, GlossaryEntry } from '../content/types';

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
