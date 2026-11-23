// 教材の検証状態（material-status.json）のビルドでの検査と、除いた図・実物を本文が指すときの警告。
// 判定は scripts/lib/material-status.mjs（validate と同じ）。
import { MATERIAL_STATUS_FILE, checkMaterialStatus, excludedRefMessage, isShown } from '../../../scripts/lib/material-status.mjs';

const textsOf = (parsed) => [...parsed.lessons, ...parsed.docs];
const run = (parsed) => checkMaterialStatus({
  statusFile: parsed.materialStatus,
  materials: { diagrams: parsed.diagrams ?? [], artifacts: parsed.artifacts ?? [] },
  presentIds: parsed.materialStems,
  texts: textsOf(parsed),
  file: MATERIAL_STATUS_FILE,
});

/** 検証状態の検査（"ファイル: メッセージ"）。スキーマに通らなかったときは、そのエラーでもう止まっているので見ない */
export function checkMaterialsForBuild(parsed) {
  const errors = [];
  const warnings = [];
  if (parsed.materialStatusPresent && !parsed.materialStatus) return { errors, warnings };
  for (const i of run(parsed).issues) (i.level === 'error' ? errors : warnings).push(`${i.rel}: ${i.message}`);
  return { errors, warnings };
}

/** このビルドで除いた図・実物を、本文が指しているところの警告（"ファイル: 本文 N 行目: …"） */
export function excludedRefWarnings(parsed, { includeUnverified = false } = {}) {
  return run(parsed).unverifiedRefs
    .filter((r) => !isShown(r.status, includeUnverified))
    .map((r) => `${r.rel}: ${excludedRefMessage(r)}`);
}
