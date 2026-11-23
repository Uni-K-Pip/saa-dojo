import { checkLab, checkPattern, labPatternContext, labPatternPathMessage } from '../../../scripts/lib/lab-pattern.mjs';
import { materialStatuses, selectMaterials } from '../../../scripts/lib/material-status.mjs';
import { crosscheckSections } from './markdown-crosscheck.mjs';

/** 出力から除く教材にも、すべての検査をかけます。 */
export function checkLabsAndPatternsForBuild(parsed, blueprintIndex) {
  const errors = [];
  const warnings = [];
  const ctx = labPatternContext(parsed, blueprintIndex);
  for (const [items, check] of [[parsed.labs, checkLab], [parsed.patterns, checkPattern]]) {
    for (const item of items) {
      const { rel, data, body } = item;
      const mismatch = labPatternPathMessage(rel, data.id);
      if (mismatch) errors.push(`${rel}: ${mismatch}`);
      const found = check(item, ctx);
      for (const message of found.errors) errors.push(`${rel}: ${message}`);
      for (const { message } of found.warnings) warnings.push(`${rel}: ${message}`);
      const difference = crosscheckSections(body, { lab: check === checkLab });
      if (difference) errors.push(`${rel}: 本文 ${difference.line} 行目: ${difference.message}`);
    }
  }
  return { errors, warnings };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function buildLabPatternOutputs(parsed, section, { includeUnverified, diagramIds, canon, questionIds }) {
  const materials = parsed[section];
  const { shown, excluded } = selectMaterials(materialStatuses(parsed.materialStatus, section, materials), materials, includeUnverified);
  const available = includeUnverified ? shown : shown.filter(({ data }) => diagramIds.has(data.diagram));
  available.sort((a, b) => cmp(a.data.unit ?? '', b.data.unit ?? '') || a.data.order - b.data.order || cmp(a.data.id, b.data.id));
  const index = available.map(({ data: { createdBy, ...meta }, body, status }) => ({
    ...meta, services: canon(meta.services), status, questionIds: questionIds(body),
  }));
  const items = available.map(({ data, body }) => ({ id: data.id, body }));
  return { index, items, excluded: { ...excluded, diagram: shown.length - available.length } };
}
