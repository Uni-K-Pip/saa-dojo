// 教材の検証状態（content/saa-c03/material-status.json）の共通処理。
// validate・アプリのビルド・検証の記録の道具が同じ判定を使うため、ここに集める。
// 仕組みは図鑑の catalog-status.json と同じ（scripts/lib/catalog.mjs）。記録がない、または記録したあとに
// 内容が変わった教材は pending（未検証）。設計は docs/visual-materials-design.md の 11.1・11.3。
import crypto from 'node:crypto';
import { stableStringify } from './catalog.mjs';
import { parseMaterialRefs } from './diagram.mjs';

export const MATERIAL_STATUS_FILE = 'material-status.json';

// 区分ごとの設定。kind は本文の参照の種類（parseMaterialRefs）と警告のコードの頭、omit はハッシュに含めない欄（記録の欄）。
// 区分を足すときは schema.mjs の MaterialStatusSchema にも足す
export const MATERIAL_SECTIONS = {
  diagrams: { label: '図', kind: 'diagram', omit: ['createdBy'] },
  artifacts: { label: '実物', kind: 'artifact', omit: ['createdBy'] },
  sims: { label: 'シナリオ', kind: 'sim', omit: ['createdBy'], refs: false },
  labs: { label: 'ミニラボ', kind: 'lab', omit: ['createdBy'], body: true, refs: false },
  patterns: { label: '設計パターン', kind: 'pattern', omit: ['createdBy'], body: true, refs: false },
};
const SECTION_OF_KIND = Object.fromEntries(Object.entries(MATERIAL_SECTIONS).map(([s, c]) => [c.kind, s]));

export const STATUS_LABELS = { verified: '検証済み', pending: '未検証', 'needs-fix': '要修正', rejected: '却下' };
const HIDDEN = new Set(['needs-fix', 'rejected']);

/** 教材のハッシュ。omit の欄を除いた全部の欄を、キー順をそろえた JSON にして SHA-256 の先頭 12 桁 */
export function materialHash(section, obj) {
  const conf = MATERIAL_SECTIONS[section];
  if (!conf) throw new Error(`materialHash: 区分が不正です: ${section}`);
  const picked = Object.fromEntries(Object.entries(obj).filter(([k]) => !conf.omit.includes(k)));
  return crypto.createHash('sha256').update(stableStringify(picked)).digest('hex').slice(0, 12);
}

/** 検証状態の実効値。記録がない、または記録したハッシュと今の内容が違うときは pending */
export function materialEffectiveStatus(statusFile, section, id, obj) {
  const rec = statusFile?.[section]?.[id];
  if (!rec) return { status: 'pending', stale: false, recorded: false };
  if (rec.hash !== materialHash(section, obj)) return { status: 'pending', stale: true, recorded: true, checkedAt: rec.checkedAt };
  return { status: rec.status, stale: false, recorded: true, checkedAt: rec.checkedAt };
}

/** 本文を持つ教材は front matter と本文を一緒にハッシュへ渡します。 */
export function materialHashInput(section, { data, body }) {
  return MATERIAL_SECTIONS[section]?.body ? { ...data, body } : data;
}

/** 区分の教材ごとの実効の状態（id → materialEffectiveStatus の値）。 */
export function materialStatuses(statusFile, section, items) {
  return new Map(items.map((item) => [
    item.data.id, materialEffectiveStatus(statusFile, section, item.data.id, materialHashInput(section, item)),
  ]));
}
export const diagramStatuses = (statusFile, diagrams) => materialStatuses(statusFile, 'diagrams', diagrams);

/** そのビルドで出すか（検証済みは出す。未検証は includeUnverified のときだけ。要修正・却下は出さない） */
export const isShown = (status, includeUnverified) => status === 'verified' || (status === 'pending' && includeUnverified);

/**
 * ビルドで出す教材を選び、元の教材に status を付けます。shown は id の順です。
 */
export function selectMaterials(statuses, items, includeUnverified) {
  const excluded = { pending: 0, 'needs-fix': 0, rejected: 0 };
  const shown = [];
  for (const item of [...items].sort((a, b) => (a.data.id < b.data.id ? -1 : a.data.id > b.data.id ? 1 : 0))) {
    const { status } = statuses.get(item.data.id);
    if (isShown(status, includeUnverified)) shown.push({ ...item, status });
    else excluded[status]++;
  }
  return { shown, excluded };
}

const countsForRefs = ({ material }, statuses) =>
  !material || (statuses[material.section]?.get(material.id)?.status === 'verified'
    && (!material.diagram || statuses.diagrams?.get(material.diagram)?.status === 'verified'));

/**
 * 教材の本文の図と実物の参照のうち、実効の状態が verified でないものを指すもの。
 * 存在しない教材・形の違う参照は含めない（それは参照の検査のエラー）。
 * statuses: 区分ごとの materialStatuses の値。本文に material が付く教材は既定のビルドに出すときだけ数える。
 * 戻り値: [{ rel, line, kind, id, status, block }]（line は本文の行。block は画像だけの行で、表示がその位置に出すもの）
 */
export function unverifiedMaterialRefs(texts, statuses) {
  const out = [];
  for (const text of texts) {
    if (!countsForRefs(text, statuses)) continue;
    const { rel, body } = text;
    for (const { kind, id, line, reference, block } of parseMaterialRefs(body, { withLine: true })) {
      const map = statuses[SECTION_OF_KIND[kind]];
      if (reference || !id || !map?.has(id)) continue;
      const { status } = map.get(id);
      if (status !== 'verified') out.push({ rel, line, kind, id, status, block: !!block });
    }
  }
  return out;
}

/**
 * 検証状態の検査。statusFile はスキーマに通った material-status.json の中身（なければ null）。
 * materials: 区分ごとの教材（スキーマに通ったもの）
 * presentIds: 区分ごとの id の集合（ファイルはあるがスキーマに通らなかったものを含む。省略可）
 * 戻り値: { issues: [{ level, code, rel, message }], statuses: { 区分: Map }, unverifiedRefs }
 *   エラー: 存在しない教材の記録（material-status-key。ファイルがあってスキーマのエラーで読めないものは、そちらのエラーに任せて出さない）
 *   警告: 検証後に変わった教材、本文から参照されない検証済みの図・実物、ミニラボ・設計パターンの front matter が指す検証済みでない図
 *   unverifiedRefs は unverifiedMaterialRefs の結果（警告にするかは呼び出し側が決める）
 */
export function checkMaterialStatus({ statusFile, materials, presentIds = {}, texts, file = MATERIAL_STATUS_FILE }) {
  const issues = [];
  const stale = [];
  const statuses = {};
  for (const [section, conf] of Object.entries(MATERIAL_SECTIONS)) {
    const items = materials[section] ?? [];
    const byId = materialStatuses(statusFile, section, items);
    statuses[section] = byId;
    for (const id of Object.keys(statusFile?.[section] ?? {})) {
      const d = byId.get(id);
      if (!d) {
        if (!presentIds[section]?.has(id)) issues.push({ level: 'error', code: 'material-status-key', rel: file, message: `${section}.${id}: この id の${conf.label}はありません` });
        continue;
      }
      if (d.stale) stale.push(`${conf.label} ${id}`);
    }
  }
  for (const section of ['labs', 'patterns']) {
    for (const { rel, data } of materials[section] ?? []) {
      if (statuses[section].get(data.id).status !== 'verified') continue;
      const status = statuses.diagrams.get(data.diagram)?.status;
      if (!status || status === 'verified') continue;
      const label = MATERIAL_SECTIONS[section].label;
      issues.push({
        level: 'warning',
        code: 'diagram-ref-unverified',
        rel,
        message: `front matter の diagram が検証済みでない図 ${data.diagram}（${STATUS_LABELS[status]}）を指しています。` +
          `このままでは既定のビルドにこの${label}を出しません。図を先に検証してください。`,
      });
    }
  }
  const referenced = new Set();
  for (const text of texts) {
    if (!countsForRefs(text, statuses)) continue;
    for (const { kind, id } of parseMaterialRefs(text.body)) if (id) referenced.add(`${kind}:${id}`);
  }
  for (const [section, conf] of Object.entries(MATERIAL_SECTIONS)) {
    if (conf.refs === false) continue;
    for (const { rel, data } of materials[section] ?? []) {
      if (statuses[section].get(data.id).status === 'verified' && !referenced.has(`${conf.kind}:${data.id}`)) {
        issues.push({ level: 'warning', code: `${conf.kind}-unreferenced`, rel, message: `検証済みの${conf.label} ${data.id} を、教材の本文のどこからも参照していません` });
      }
    }
  }
  if (stale.length) {
    issues.push({
      level: 'warning',
      code: 'material-stale-review',
      rel: file,
      message: `検証したあとに内容が変わった教材 ${stale.length} 件（検証し直すまで未検証として扱います）: ${stale.join(', ')}`,
    });
  }
  return { issues, statuses, unverifiedRefs: unverifiedMaterialRefs(texts, statuses) };
}

const labelOf = (kind) => MATERIAL_SECTIONS[SECTION_OF_KIND[kind]].label;

/** 本文が検証済みでない図・実物を指すときの警告文（validate 用。画像だけの行とリンクで、表示の動きに合わせる） */
export function unverifiedRefMessage({ line, kind, id, status, block }) {
  const label = labelOf(kind);
  const head = `本文 ${line} 行目: 検証済みでない${label} ${id}（${STATUS_LABELS[status]}）を${block ? '表示しようとしています' : 'リンクで指しています'}。`;
  if (block) return head + (HIDDEN.has(status) ? `この${label}はどのビルドでも出さず、本文だけを表示します` : `検証済みになるまで、本番のビルドでは${label}を省いて本文だけを表示します`);
  return head + (HIDDEN.has(status) ? `この${label}はどのビルドでも出さないので、リンクを開くと「見つかりません」と表示します` : '検証済みになるまで、本番のビルドではリンクを開くと「見つかりません」と表示します');
}

/** ビルドで除いた図・実物を本文が指すときの警告文（"本文 N 行目: …"） */
export function excludedRefMessage({ line, kind, id, status, block }) {
  const label = labelOf(kind);
  return `本文 ${line} 行目: ${label} ${id}（${STATUS_LABELS[status]}）を出力から除いたため、` +
    (block ? `本文では${label}を省いて表示します` : 'リンクを開くと「見つかりません」と表示します');
}
