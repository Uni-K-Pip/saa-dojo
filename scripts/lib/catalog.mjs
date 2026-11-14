// サービス図鑑の共通処理。validate・coverage・アプリのビルドで同じ判定にするため、ここに集める。
// 設計は docs/service-catalog-design.md（3章 データ、4章 検証と網羅）。
import crypto from 'node:crypto';
import path from 'node:path';
import { COMPARISON_ID, FACT_ID, SERVICE_ID } from './schema.mjs';

export const CATALOG_DIR = 'catalog';
export const CATALOG_STATUS_FILE = 'catalog-status.json';
export const CATALOG_NEEDS_FILE = 'catalog-needs.json';

// 区分ごとの目安（3.2）。事実は depth=core だけを数える
export const TIER_RULES = {
  1: { facts: [12, 30], points: true },
  2: { facts: [4, 12], points: true },
  3: { facts: [0, 2], points: false },
};

// checkedAt の再確認の目安（日数）。数値と料金は変わりやすいので短くする
export const RECHECK_DAYS = { quota: 180, pricing: 180, default: 365 };

// ---------------------------------------------------------------- ハッシュ

// キー順をそろえた JSON（配列の順序と値はそのまま。undefined の欄は出さない）
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

// 検証状態のハッシュに含める欄。ここが変わったら検証し直す。
// services・tags・kind・tier・checkedAt のような分類や記録の欄は含めない（表記の整理で検証が無効にならないように）
export const HASH_FIELDS = {
  entry: ['summary', 'chooseWhen', 'avoidWhen', 'references'],
  fact: ['title', 'text', 'examPoint', 'trap', 'depth', 'sources'],
  comparison: ['title', 'decide', 'rows', 'docRef', 'sources'],
};

export function catalogHash(kind, obj) {
  const fields = HASH_FIELDS[kind];
  if (!fields) throw new Error(`catalogHash: 種類が不正です: ${kind}`);
  const picked = Object.fromEntries(fields.map((f) => [f, obj[f]]));
  return crypto.createHash('sha256').update(stableStringify(picked)).digest('hex').slice(0, 12);
}

// 検証状態の実効値。記録がない、または記録したハッシュと今の内容が違うときは pending
export function effectiveStatus(statusMap, id, kind, obj) {
  const rec = statusMap?.[id];
  if (!rec) return { status: 'pending', stale: false, recorded: false };
  if (rec.hash !== catalogHash(kind, obj)) return { status: 'pending', stale: true, recorded: true, checkedAt: rec.checkedAt };
  return { status: rec.status, stale: false, recorded: true, checkedAt: rec.checkedAt };
}

// ---------------------------------------------------------------- 本文のリンク

// Markdown 本文の図鑑へのリンク（#/services/<id>、#/services/<id>?f=<スラッグ>、#/services/compare/<cmp-id>）
export function parseCatalogLinks(text) {
  const out = [];
  const re = /#\/services\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?(?:\?f=([a-z0-9-]+))?/g;
  for (const m of String(text ?? '').matchAll(re)) {
    if (m[1] === 'compare') out.push({ kind: 'comparison', id: m[2] ?? '', raw: m[0] });
    else out.push({ kind: 'entry', id: m[1], slug: m[3], raw: m[0], extra: m[2] });
  }
  return out;
}

// ---------------------------------------------------------------- モデル

// entries / comparisons は [{ file, data }]（data はスキーマを通ったもの）。serviceIndex は buildServiceIndex の戻り値
export function buildCatalogModel({ entries = [], comparisons = [], serviceIndex = null }) {
  const entryById = new Map();
  const factById = new Map();
  const comparisonById = new Map();
  const comparisonsByService = new Map();
  for (const e of entries) {
    if (!entryById.has(e.data.id)) entryById.set(e.data.id, e);
    for (const f of e.data.facts) if (!factById.has(f.id)) factById.set(f.id, { fact: f, entryId: e.data.id, file: e.file });
  }
  for (const c of comparisons) {
    if (comparisonById.has(c.data.id)) continue;
    comparisonById.set(c.data.id, c);
    for (const s of c.data.services) {
      const owner = entryIdFor(serviceIndex, s);
      if (!comparisonsByService.has(owner)) comparisonsByService.set(owner, []);
      comparisonsByService.get(owner).push(c.data.id);
    }
  }
  return { entryById, factById, comparisonById, comparisonsByService, serviceIndex };
}

// hostedBy を持つサービスは、親のエントリで扱う
export function entryIdFor(serviceIndex, serviceId) {
  const e = serviceIndex?.byId?.get(serviceId);
  return e?.hostedBy ?? serviceId;
}

// サービス名（正規名・別名）から、そのサービスを扱うエントリの id を引く。範囲外や不明は null
export function entryIdForName(serviceIndex, name) {
  const r = serviceIndex?.resolve?.(name);
  return r && r.kind === 'in' ? entryIdFor(serviceIndex, r.id) : null;
}

// ---------------------------------------------------------------- 検査

// 'YYYY-MM-DD' どうしの日数（b − a）。checkedAt の古さの判定に使う（coverage も同じ関数を使う）
export const daysBetween = (a, b) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * 図鑑の参照と状態を検査する。返すのは [{ level: 'error' | 'warning', code, file, message }]。
 * ctx:
 *   serviceIndex   buildServiceIndex の戻り値（台帳つき）
 *   lessonIds      Set（レッスン id）
 *   docIds         Set（早見表・ガイド id）
 *   questions      [{ file, data }]（factRefs を見る）
 *   markdown       [{ file, text }]（レッスン・早見表・ガイドの本文）
 *   status         catalog-status.json の中身（なければ null）
 *   statusFile     その相対パス（メッセージ用）
 *   needs          { file, data } | null（catalog-needs.json）
 *   today          'YYYY-MM-DD'（checkedAt の古さの判定に使う。省略すると検査しない）
 */
export function checkCatalog(model, ctx) {
  const out = [];
  const err = (code, file, message) => out.push({ level: 'error', code, file, message });
  const warn = (code, file, message) => out.push({ level: 'warning', code, file, message });
  const { serviceIndex } = ctx;
  const registryIds = serviceIndex?.byId ?? new Map();
  const lessonIds = ctx.lessonIds ?? new Set();
  const docIds = ctx.docIds ?? new Set();
  const hasFact = (id) => model.factById.has(id);
  const refFact = (file, where, id) => {
    if (!hasFact(id)) err('catalog-ref', file, `${where}: 事実 ${id} がありません`);
  };
  const refService = (file, where, id) => {
    if (!registryIds.has(id)) err('catalog-ref', file, `${where}: サービス ${id} が台帳にありません`);
  };

  // エントリ
  const tierShort = { 1: [], 2: [], 3: [] };
  const tierLong = { 1: [], 2: [], 3: [] };
  const missingPoints = [];
  for (const { file, data: e } of model.entryById.values()) {
    const base = path.posix.basename(file, '.json');
    if (base !== e.id) err('path-mismatch', file, `ファイル名 ${base} と id ${e.id} が違います`);
    const reg = registryIds.get(e.id);
    if (!reg) err('catalog-entry', file, `id ${e.id} が台帳（services.json）にありません`);
    else if (reg.hostedBy !== undefined) err('catalog-entry', file, `${e.id} は ${reg.hostedBy} のエントリで扱うサービスです（hostedBy）。エントリは作りません`);
    for (const id of e.seeAlso ?? []) refFact(file, 'seeAlso', id);
    for (const [key, list] of [['chooseWhen', e.chooseWhen], ['avoidWhen', e.avoidWhen]]) {
      for (const p of list ?? []) {
        for (const id of p.factRefs ?? []) refFact(file, `${key}.factRefs`, id);
        for (const id of p.alternatives ?? []) refService(file, `${key}.alternatives`, id);
      }
    }
    for (const id of e.lessonRefs ?? []) if (!lessonIds.has(id)) err('catalog-ref', file, `lessonRefs: レッスン ${id} がありません`);
    for (const id of e.docRefs ?? []) if (!docIds.has(id)) err('catalog-ref', file, `docRefs: 早見表・ガイド ${id} がありません`);
    const rule = TIER_RULES[e.tier];
    const core = e.facts.filter((f) => f.depth === 'core').length;
    if (core < rule.facts[0]) tierShort[e.tier].push(`${e.id}(${core})`);
    if (core > rule.facts[1]) tierLong[e.tier].push(`${e.id}(${core})`);
    if (rule.points && (!e.chooseWhen?.length || !e.avoidWhen?.length)) missingPoints.push(e.id);
  }
  for (const t of [1, 2, 3]) {
    const [lo, hi] = TIER_RULES[t].facts;
    if (tierShort[t].length) warn('catalog-tier', null, `区分 ${t} で core の事実が目安（${lo}〜${hi} 件）より少ないエントリ ${tierShort[t].length} 件: ${tierShort[t].join(', ')}`);
    if (tierLong[t].length) warn('catalog-tier', null, `区分 ${t} で core の事実が目安（${lo}〜${hi} 件）より多いエントリ ${tierLong[t].length} 件: ${tierLong[t].join(', ')}`);
  }
  if (missingPoints.length) warn('catalog-tier', null, `区分 1・2 で chooseWhen か avoidWhen がないエントリ ${missingPoints.length} 件: ${missingPoints.join(', ')}`);

  // 比較
  for (const { file, data: c } of model.comparisonById.values()) {
    const base = path.posix.basename(file, '.json');
    if (base !== c.id) err('path-mismatch', file, `ファイル名 ${base} と id ${c.id} が違います`);
    for (const id of c.services) refService(file, 'services', id);
    for (const r of c.rows ?? []) for (const id of r.factRefs ?? []) refFact(file, `rows「${r.axis}」.factRefs`, id);
    if (c.docRef && !docIds.has(c.docRef)) err('catalog-ref', file, `docRef: 早見表・ガイド ${c.docRef} がありません`);
  }

  // 問題の factRefs
  for (const { file, data: q } of ctx.questions ?? []) {
    for (const id of q.factRefs ?? []) refFact(file, 'factRefs', id);
  }

  // Markdown 本文のリンク
  for (const { file, text } of ctx.markdown ?? []) {
    for (const link of parseCatalogLinks(text)) {
      if (link.kind === 'comparison') {
        if (!COMPARISON_ID.test(link.id) || !model.comparisonById.has(link.id)) err('catalog-ref', file, `本文のリンク ${link.raw}: 比較 ${link.id || '(なし)'} がありません`);
        continue;
      }
      if (link.extra !== undefined || !SERVICE_ID.test(link.id)) {
        err('catalog-ref', file, `本文のリンク ${link.raw} の形が不正です（#/services/<id> か #/services/<id>?f=<スラッグ>）`);
        continue;
      }
      if (!registryIds.has(link.id)) {
        err('catalog-ref', file, `本文のリンク ${link.raw}: サービス ${link.id} が台帳にありません`);
        continue;
      }
      if (link.slug !== undefined) {
        const owner = entryIdFor(serviceIndex, link.id);
        const fid = `${owner}.${link.slug}`;
        if (!FACT_ID.test(fid) || !hasFact(fid)) err('catalog-ref', file, `本文のリンク ${link.raw}: 事実 ${fid} がありません`);
      }
    }
  }

  // 検証状態
  if (ctx.status) {
    const sf = ctx.statusFile ?? CATALOG_STATUS_FILE;
    const stale = [];
    for (const key of Object.keys(ctx.status)) {
      let kind = null;
      let obj = null;
      if (model.comparisonById.has(key)) [kind, obj] = ['comparison', model.comparisonById.get(key).data];
      else if (model.factById.has(key)) [kind, obj] = ['fact', model.factById.get(key).fact];
      else if (model.entryById.has(key)) [kind, obj] = ['entry', model.entryById.get(key).data];
      if (!kind) {
        err('review-status-key', sf, `${key} というエントリ・事実・比較はありません`);
        continue;
      }
      if (effectiveStatus(ctx.status, key, kind, obj).stale) stale.push(key);
    }
    if (stale.length) warn('catalog-stale-review', sf, `検証したあとに内容が変わった項目 ${stale.length} 件（検証し直すまで未検証として扱います）: ${stale.slice(0, 12).join(', ')}${stale.length > 12 ? ' ほか' : ''}`);
  }

  // checkedAt の古さ
  if (ctx.today) {
    const old = [];
    for (const { fact } of model.factById.values()) {
      const limit = RECHECK_DAYS[fact.kind] ?? RECHECK_DAYS.default;
      if (daysBetween(fact.checkedAt, ctx.today) >= limit) old.push(`${fact.id}(${fact.checkedAt})`);
    }
    for (const { data: c } of model.comparisonById.values()) {
      if (daysBetween(c.checkedAt, ctx.today) >= RECHECK_DAYS.default) old.push(`${c.id}(${c.checkedAt})`);
    }
    if (old.length) warn('catalog-old-check', null, `出典での確認から日がたった項目 ${old.length} 件（数値・料金は ${RECHECK_DAYS.quota} 日、その他は ${RECHECK_DAYS.default} 日）: ${old.slice(0, 12).join(', ')}${old.length > 12 ? ' ほか' : ''}`);
  }

  // 不足の対応表
  if (ctx.needs) {
    const { file, data } = ctx.needs;
    let undecided = 0;
    for (const it of data.items) {
      if (!it.decision) undecided += 1;
      for (const id of it.factRefs ?? []) refFact(file, `${it.key}.factRefs`, id);
    }
    if (undecided) warn('catalog-needs', file, `対応（decision）が決まっていない不足 ${undecided} 件`);
  }

  return out;
}
