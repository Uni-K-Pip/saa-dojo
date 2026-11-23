// 教材の検証状態（material-status.json）のビルドでの検査と、除いた図・実物を本文が指すときの警告。
// 判定は scripts/lib/material-status.mjs（validate と同じ）。
import { MATERIAL_STATUS_FILE, checkMaterialStatus, excludedRefMessage, isShown } from '../../../scripts/lib/material-status.mjs';
import { labPatternTexts } from '../../../scripts/lib/lab-pattern.mjs';

const textsOf = (parsed) => [...parsed.lessons, ...parsed.docs, ...labPatternTexts(parsed)];
// serviceIndex は図のハッシュの対象（レイアウトの結果）を組み立てるのに使う。図の出力と同じもの
const run = (parsed, serviceIndex) => checkMaterialStatus({
  statusFile: parsed.materialStatus,
  materials: parsed,
  presentIds: parsed.materialStems,
  texts: textsOf(parsed),
  file: MATERIAL_STATUS_FILE,
  ctx: { serviceIndex },
});

/** 検証状態の検査（"ファイル: メッセージ"）。スキーマに通らなかったときは、そのエラーでもう止まっているので見ない */
export function checkMaterialsForBuild(parsed, serviceIndex = null) {
  const errors = [];
  const warnings = [];
  if (parsed.materialStatusPresent && !parsed.materialStatus) return { errors, warnings };
  const { issues, statuses } = run(parsed, serviceIndex);
  for (const i of issues) (i.level === 'error' ? errors : warnings).push(`${i.rel}: ${i.message}`);
  return { errors, warnings, statuses };
}

/** このビルドで除いた図・実物を、本文が指しているところの警告（"ファイル: 本文 N 行目: …"） */
export function excludedRefWarnings(parsed, { includeUnverified = false, serviceIndex = null } = {}) {
  return run(parsed, serviceIndex).unverifiedRefs
    .filter((r) => !isShown(r.status, includeUnverified))
    .map((r) => `${r.rel}: ${excludedRefMessage(r)}`);
}
