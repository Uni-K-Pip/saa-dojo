import path from 'node:path';
import { diagramRefIndex, parseDiagramRefs } from './diagram.mjs';
import { parseInlineChecks } from './inline-check.mjs';

export const LAB_SECTIONS = ['ゴール', '手順', '動作を確かめる', '壊してみる', '料金がかかり続けるもの', '試験での出方', '確認問題'];
export const PATTERN_SECTIONS = ['解く課題', '構成', '選ばれる決め手', '制約が変わると', 'ひっかけ', '関連'];
export const LAB_LIMITS = { steps: [5, 9], breaks: [2, 3], length: [1500, 5000] };
export const PATTERN_LIMITS = { length: [600, 1500] };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;

/** 見出しと、その次の見出しまでの本文を行単位で拾います。 */
export function parseSections(body) {
  const lines = body.split(/\r\n?|\n/);
  const headings = [];
  let fence = null;
  for (const [index, line] of lines.entries()) {
    const f = FENCE.exec(line);
    if (f && fence === null) {
      fence = f[1];
      continue;
    }
    // 閉じるのは、同じ記号で同じ長さ以上の並びのあとに空白しかない行だけ（`~~~text` は閉じない）
    if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.slice(f[0].length).trim() === '') {
      fence = null;
      continue;
    }
    const match = fence === null && HEADING.exec(line);
    if (match) {
      const title = match[2].replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
      headings.push({ depth: match[1].length, title, line: index + 1 });
    }
  }
  return headings.map((heading, index) => ({
    ...heading,
    body: lines.slice(heading.line, (headings[index + 1]?.line ?? lines.length + 1) - 1).join('\n'),
  }));
}

/** 指定の節に含まれる小見出しを拾います。 */
export function headingsInSection(headings, title) {
  const start = headings.findIndex((heading) => heading.depth === 2 && heading.title === title);
  if (start < 0) return [];
  const end = headings.findIndex((heading, index) => index > start && heading.depth <= 2);
  return headings.slice(start + 1, end < 0 ? undefined : end);
}

function checkHeadings(headings, sections, errors) {
  const seen = new Set();
  let previous = -1;
  for (const { depth, title, line } of headings) {
    if (depth !== 2) continue;
    const index = sections.indexOf(title);
    if (index < 0) errors.push(`本文 ${line} 行目: 一覧にない見出し『## ${title}』があります`);
    else if (seen.has(title)) errors.push(`本文 ${line} 行目: 見出し『## ${title}』が重複しています`);
    else if (index < previous) errors.push(`本文 ${line} 行目: 見出し『## ${sections[previous]}』は『## ${title}』のあとに置いてください`);
    if (index >= 0) seen.add(title);
    previous = Math.max(previous, index);
  }
  for (const title of sections) {
    if (!seen.has(title)) errors.push(`固定の見出し『## ${title}』がありません`);
  }
}

function checkRefs(data, { diagrams, itemIds, taskIds }, errors) {
  const diagram = diagrams.get(data.diagram);
  if (!diagram) errors.push(`図 ${data.diagram} が見つかりません`);
  else if (diagram.type !== 'architecture' || diagram.steps === 0) {
    errors.push(`図 ${data.diagram} は段階表示つきの構成図にしてください`);
  }
  for (const [field, ids] of [['knowledgeRefs', itemIds], ['taskStatements', taskIds]]) {
    if (!ids) continue;
    const missing = [...new Set(data[field]?.filter((id) => !ids.has(id)))];
    if (missing.length) errors.push(`${field} が blueprint にありません: ${missing.join(', ')}`);
  }
}

function checkRange(warnings, code, label, count, unit, [min, max]) {
  if (count < min || count > max) {
    warnings.push({ code, message: `${label}は ${count} ${unit}です（目安は ${min}〜${max} ${unit}です）` });
  }
}

const bodyLength = (body) => Array.from(body.replace(/\s/g, '')).length;

export function checkLab({ data, body }, ctx) {
  const errors = [];
  const warnings = [];
  const headings = parseSections(body);
  checkHeadings(headings, LAB_SECTIONS, errors);
  checkRefs(data, ctx, errors);
  if (!ctx.unitIds) errors.push(`学習コース（course.json）が読めないため、ユニット ${data.unit} を確かめられません`);
  else if (!ctx.unitIds.has(data.unit)) errors.push(`ユニット ${data.unit} が学習コースにありません`);

  const steps = headingsInSection(headings, '手順').filter(({ depth }) => depth === 3);
  if (steps.length === 0) errors.push('「## 手順」に小見出し（### 1. 題）がありません');
  for (const [index, step] of steps.entries()) {
    const number = /^([1-9]\d*)\.[ \t]+\S/.exec(step.title)?.[1];
    if (!number) errors.push(`本文 ${step.line} 行目: 手順の見出しは「### 番号. 題」の形で書いてください`);
    else if (number !== String(index + 1)) {
      errors.push(`本文 ${step.line} 行目: 手順の番号は ${index + 1} にしてください（実際: ${number}）`);
    }
    if (!parseDiagramRefs(step.body).some(({ id, step: diagramStep }) => id === data.diagram && diagramStep > 0)) {
      warnings.push({ code: 'lab-step-diagram', message: `本文 ${step.line} 行目: 手順に、図 ${data.diagram} の段階（?step=1 以上）を指定した参照がありません` });
    }
  }
  checkRange(warnings, 'lab-steps', '手順の数', steps.length, '手', LAB_LIMITS.steps);

  const breaks = headings.findIndex(({ depth, title }) => depth === 2 && title === '壊してみる');
  if (breaks >= 0) {
    const end = headings.findIndex(({ depth }, index) => index > breaks && depth <= 2);
    const section = body.split(/\r\n?|\n/).slice(headings[breaks].line, end < 0 ? undefined : headings[end].line - 1).join('\n');
    checkRange(warnings, 'lab-breaks', '「壊してみる」のその場の確認', parseInlineChecks(section).length, '個', LAB_LIMITS.breaks);
  }
  checkRange(warnings, 'lab-length', '本文の字数', bodyLength(body), '字', LAB_LIMITS.length);
  return { errors, warnings };
}

export function checkPattern({ data, body }, ctx) {
  const errors = [];
  const warnings = [];
  checkHeadings(parseSections(body), PATTERN_SECTIONS, errors);
  checkRefs(data, ctx, errors);
  checkRange(warnings, 'pattern-length', '本文の字数', bodyLength(body), '字', PATTERN_LIMITS.length);
  return { errors, warnings };
}

export function labPatternContext({ diagrams, course }, { itemIds, taskIds } = {}) {
  return {
    diagrams: diagramRefIndex(diagrams),
    itemIds,
    taskIds,
    unitIds: course ? new Set(course.data.stages.flatMap(({ units }) => units.map(({ id }) => id))) : undefined,
  };
}

export function labPatternPathMessage(rel, id) {
  return path.posix.basename(rel, '.md') === id ? null : `ファイル名と id（${id}）が違います`;
}

export function labPatternTexts({ labs = [], patterns = [] }) {
  return [
    ...labs.map(({ rel, body, data }) => ({ rel, body, material: { section: 'labs', id: data.id } })),
    ...patterns.map(({ rel, body, data }) => ({ rel, body, material: { section: 'patterns', id: data.id } })),
  ];
}
