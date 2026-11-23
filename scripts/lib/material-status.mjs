// 教材の検証状態（content/saa-c03/material-status.json）の共通処理。
// validate・アプリのビルド・検証の記録の道具が同じ判定を使うため、ここに集める。
// 仕組みは図鑑の catalog-status.json と同じ（scripts/lib/catalog.mjs）。記録がない、または記録したあとに
// 内容が変わった教材は pending（未検証）。設計は docs/visual-materials-design.md の 11.1・11.3。
import crypto from 'node:crypto';
import { stableStringify } from './catalog.mjs';
import { parseDiagramRefs } from './diagram.mjs';

export const MATERIAL_STATUS_FILE = 'material-status.json';

// 区分ごとの設定。omit はハッシュに含めない欄（記録の欄）。区分を足すときは schema.mjs の MaterialStatusSchema にも足す
export const MATERIAL_SECTIONS = {
  diagrams: { label: '図', omit: ['createdBy'] },
};

export const STATUS_LABELS = { verified: '検証済み', pending: '未検証', 'needs-fix': '要修正', rejected: '却下' };

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

/** 図ごとの実効の状態（id → materialEffectiveStatus の値） */
export function diagramStatuses(statusFile, diagrams) {
  return new Map(diagrams.map(({ data }) => [data.id, materialEffectiveStatus(statusFile, 'diagrams', data.id, data)]));
}

/**
 * 本文（レッスン・早見表・ガイド）の図の参照のうち、実効の状態が verified でない図を指すもの。
 * 存在しない図・形の違う参照は含めない（それは checkDiagramRefs のエラー）。
 * 戻り値: [{ rel, line, id, status }]（line は本文の行）
 */
export function unverifiedDiagramRefs(texts, statuses) {
  const out = [];
  for (const { rel, body } of texts) {
    for (const { id, line, reference } of parseDiagramRefs(body, { withLine: true })) {
      if (reference || !id || !statuses.has(id)) continue;
      const { status } = statuses.get(id);
      if (status !== 'verified') out.push({ rel, line, id, status });
    }
  }
  return out;
}

/**
 * 検証状態の検査。statusFile はスキーマに通った material-status.json の中身（なければ null）。
 * 戻り値: { issues: [{ level, code, rel, message }], statuses, unverifiedRefs }
 *   エラー: 存在しない図の記録（material-status-key）
 *   警告: 記録したあとに内容が変わった図（material-stale-review）、検証済みなのにどこからも参照されない図（diagram-unreferenced）
 *   unverifiedRefs は unverifiedDiagramRefs の結果（警告にするかは呼び出し側が決める）
 */
export function checkMaterialStatus({ statusFile, diagrams, texts, file = MATERIAL_STATUS_FILE }) {
  const issues = [];
  const diagramById = new Map(diagrams.map((d) => [d.data.id, d]));
  const stale = [];
  for (const id of Object.keys(statusFile?.diagrams ?? {})) {
    const d = diagramById.get(id);
    if (!d) {
      issues.push({ level: 'error', code: 'material-status-key', rel: file, message: `diagrams.${id}: この id の図はありません` });
      continue;
    }
    if (materialEffectiveStatus(statusFile, 'diagrams', id, d.data).stale) stale.push(id);
  }
  if (stale.length) {
    issues.push({
      level: 'warning',
      code: 'material-stale-review',
      rel: file,
      message: `検証したあとに内容が変わった図 ${stale.length} 件（検証し直すまで未検証として扱います）: ${stale.join(', ')}`,
    });
  }

  const statuses = diagramStatuses(statusFile, diagrams);
  const referenced = new Set();
  for (const { body } of texts) for (const { id } of parseDiagramRefs(body)) if (id) referenced.add(id);
  for (const { rel, data } of diagrams) {
    if (statuses.get(data.id).status === 'verified' && !referenced.has(data.id)) {
      issues.push({ level: 'warning', code: 'diagram-unreferenced', rel, message: `検証済みの図 ${data.id} を、レッスン・早見表・ガイドの本文のどこからも参照していません` });
    }
  }
  return { issues, statuses, unverifiedRefs: unverifiedDiagramRefs(texts, statuses) };
}

/** 本文が検証済みでない図を指すときの警告文（validate 用） */
export function unverifiedRefMessage({ line, id, status }) {
  const hidden = status === 'needs-fix' || status === 'rejected';
  return `本文 ${line} 行目: 検証済みでない図 ${id}（${STATUS_LABELS[status]}）を指しています。` +
    (hidden ? 'この図はどのビルドでも出さず、本文だけを表示します' : '検証済みになるまで、本番のビルドでは図を省いて本文だけを表示します');
}
