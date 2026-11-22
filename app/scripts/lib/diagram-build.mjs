// 図の出力（図ごとのレイアウト済みの scene と、一覧）を組み立てる。
// 検査とレイアウトは scripts/lib/diagram.mjs・diagram-layout.mjs に任せ、validate と同じ判定にする。
// 設計は docs/visual-materials-design.md の 4章・12.2。
import { checkDiagram } from '../../../scripts/lib/diagram.mjs';
import { layoutDiagram } from '../../../scripts/lib/diagram-layout.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stemOf = (rel) => rel.split('/').pop().replace(/\.json$/, '');

/** 図の検査（"ファイル: メッセージ" の文字列）。エラーがあればビルドを止める */
export function checkDiagramsForBuild(parsed, serviceIndex) {
  const errors = [];
  const warnings = [];
  const lessonIds = new Set(parsed.lessons.map((l) => l.data.id));
  const factIds = new Set(parsed.catalogEntries.flatMap((e) => e.data.facts.map((f) => f.id)));
  const seen = new Map();
  for (const { rel, data } of parsed.diagrams ?? []) {
    if (data.id !== stemOf(rel)) errors.push(`${rel}: ファイル名と id（${data.id}）が違います`);
    if (seen.has(data.id)) errors.push(`${rel}: id ${data.id} が ${seen.get(data.id)} と重複しています`);
    else seen.set(data.id, rel);
    const found = checkDiagram(data, { lessonIds, factIds, serviceIndex });
    for (const m of found.errors) errors.push(`${rel}: ${m}`);
    for (const w of found.warnings) warnings.push(`${rel}: ${w.message}`);
  }
  return { errors, warnings };
}

/**
 * 図の出力。検証状態の仕組みはまだないので、status は常に pending。
 * 戻り値: { index: [{ id, title, type, steps, status }], scenes: [scene] }（id の順）
 */
export function buildDiagramOutputs(parsed, serviceIndex) {
  const scenes = [...(parsed.diagrams ?? [])]
    .sort((a, b) => cmp(a.data.id, b.data.id))
    .map(({ data }) => layoutDiagram(data, { serviceIndex }));
  const index = scenes.map((s) => ({ id: s.id, title: s.title, type: s.type, steps: s.steps.length, status: s.status }));
  return { index, scenes };
}
