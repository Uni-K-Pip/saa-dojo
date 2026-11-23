// 実物の出力（実物ごとの表示用のデータと、一覧）を組み立てる。
// 検査は scripts/lib/artifact.mjs に任せ、validate と同じ判定にする。設計は docs/visual-materials-design.md の 6章・11.1。
import { checkArtifact, checkArtifactRefs, renderArtifact } from '../../../scripts/lib/artifact.mjs';
import { materialStatuses, selectMaterials } from '../../../scripts/lib/material-status.mjs';

const stemOf = (rel) => rel.split('/').pop().replace(/\.json$/, '');

/** 実物の検査（"ファイル: メッセージ" の文字列）。エラーがあればビルドを止める。出力から除く実物にも、すべての検査をかける */
export function checkArtifactsForBuild(parsed) {
  const errors = [];
  const warnings = [];
  const lessonIds = new Set(parsed.lessons.map((l) => l.data.id));
  const factIds = new Set(parsed.catalogEntries.flatMap((e) => e.data.facts.map((f) => f.id)));
  const seen = new Map();
  for (const { rel, data } of parsed.artifacts ?? []) {
    if (data.id !== stemOf(rel)) errors.push(`${rel}: ファイル名と id（${data.id}）が違います`);
    if (seen.has(data.id)) errors.push(`${rel}: id ${data.id} が ${seen.get(data.id)} と重複しています`);
    else seen.set(data.id, rel);
    const found = checkArtifact(data, { lessonIds, factIds });
    for (const m of found.errors) errors.push(`${rel}: ${m}`);
    for (const w of found.warnings) warnings.push(`${rel}: ${w.message}`);
  }
  const artifactIds = new Set((parsed.artifacts ?? []).map(({ data }) => data.id));
  for (const { rel, message } of checkArtifactRefs({ texts: [...parsed.lessons, ...parsed.docs], artifactIds })) errors.push(`${rel}: ${message}`);
  return { errors, warnings };
}

/**
 * 実物の出力。図と同じく、既定は検証済みだけ、includeUnverified のときは未検証も出す。needs-fix・rejected は出さない。
 * 戻り値: { index: [{ id, title, kind, kindLabel, format, status }], items: [renderArtifact の値], excluded }
 */
export function buildArtifactOutputs(parsed, { includeUnverified = false } = {}) {
  const artifacts = parsed.artifacts ?? [];
  const { shown, excluded } = selectMaterials(materialStatuses(parsed.materialStatus, 'artifacts', artifacts), artifacts, includeUnverified);
  const items = shown.map(({ data, status }) => renderArtifact(data, status));
  const index = items.map(({ id, title, kind, kindLabel, format, status }) => ({ id, title, kind, kindLabel, format, status }));
  return { index, items, excluded };
}
