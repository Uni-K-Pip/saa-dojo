// 図の出力（図ごとのレイアウト済みの scene と、一覧）を組み立てる。
// 検査とレイアウトは scripts/lib/diagram.mjs・diagram-layout.mjs に任せ、validate と同じ判定にする。
// 検証状態は scripts/lib/material-status.mjs（material-status.json）。設計は docs/visual-materials-design.md の 4章・11.1・12.2。
import { checkDiagram, checkDiagramRefs, diagramRefIndex, layoutAnyDiagram } from '../../../scripts/lib/diagram.mjs';
import { MATERIAL_STATUS_FILE, STATUS_LABELS, checkMaterialStatus, diagramStatuses, unverifiedDiagramRefs } from '../../../scripts/lib/material-status.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stemOf = (rel) => rel.split('/').pop().replace(/\.json$/, '');
const textsOf = (parsed) => [...parsed.lessons, ...parsed.docs];

/**
 * 図の検査（"ファイル: メッセージ" の文字列）。エラーがあればビルドを止める。
 * 出力から除く図にも、すべての検査をかける。
 */
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
  const refs = checkDiagramRefs({ texts: textsOf(parsed), diagrams: diagramRefIndex(parsed.diagrams ?? []) });
  for (const { rel, message } of refs) errors.push(`${rel}: ${message}`);
  // 検証状態（スキーマに通らなかったときは、そのエラーでもう止まっている）
  if (!parsed.materialStatusPresent || parsed.materialStatus) {
    const { issues } = checkMaterialStatus({ statusFile: parsed.materialStatus, diagrams: parsed.diagrams ?? [], texts: textsOf(parsed), file: MATERIAL_STATUS_FILE });
    for (const i of issues) (i.level === 'error' ? errors : warnings).push(`${i.rel}: ${i.message}`);
  }
  return { errors, warnings };
}

/**
 * 図の出力。status は検証状態の実効値。needs-fix・rejected の図はどのビルドでも出さない。
 * 未検証（pending）の図は、includeUnverified のときだけ出す（既定は出さない。公開のビルドに未検証の図を入れないため）。
 * 戻り値: { index: [{ id, title, type, steps, status }], scenes: [scene], excluded: { pending, 'needs-fix', rejected }, warnings }
 *   warnings は、除いた図を本文が指しているもの（"ファイル: メッセージ"）
 */
export function buildDiagramOutputs(parsed, serviceIndex, { includeUnverified = false } = {}) {
  const diagrams = parsed.diagrams ?? [];
  const statuses = diagramStatuses(parsed.materialStatus, diagrams);
  const shown = (status) => status === 'verified' || (status === 'pending' && includeUnverified);
  const excluded = { pending: 0, 'needs-fix': 0, rejected: 0 };
  const scenes = [];
  for (const { data } of [...diagrams].sort((a, b) => cmp(a.data.id, b.data.id))) {
    const { status } = statuses.get(data.id);
    if (!shown(status)) {
      excluded[status]++;
      continue;
    }
    scenes.push({ ...layoutAnyDiagram(data, { serviceIndex }), status });
  }
  const index = scenes.map((s) => ({ id: s.id, title: s.title, type: s.type, steps: s.type === 'architecture' ? s.steps.length : 0, status: s.status }));
  const warnings = unverifiedDiagramRefs(textsOf(parsed), statuses)
    .filter((r) => !shown(r.status))
    .map((r) => `${r.rel}: 本文 ${r.line} 行目: 図 ${r.id}（${STATUS_LABELS[r.status]}）を出力から除いたため、本文では図を省いて表示します`);
  return { index, scenes, excluded, warnings };
}
