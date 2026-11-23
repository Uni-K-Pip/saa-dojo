// 網羅の一覧（content/saa-c03/coverage-lists.json）。
// docs/learning-design.md の付録 B（設計パターン）・付録 C（よく比べられる組）・付録 D（つまずきの型）を、
// 機械が読めるデータにしたもの。coverage が「一覧のうち、教材がまだないもの」を数える土台になる。
// スキーマ・検査・付録の読み取りをここに置く（validate・coverage・テストが同じものを使う）。
import { z } from 'zod';
import { COMPARISON_ID, DOC_ID, LAB_ID, PATTERN_ID, QUESTION_ID, SIM_SCENARIO_ID, TASK_ID } from './schema.mjs';

export const COVERAGE_LISTS_FILE = 'coverage-lists.json';

// 一覧の項目の ID。番号は付録の並びの番号（比較の組は、付録の並びの順の通し番号）
export const PAIR_ID = /^pair-\d{2}$/;
export const DESIGN_PATTERN_ID = /^dp-\d{2}$/;
export const PITFALL_ID = /^pit-\d{2}$/;

const name = z.string().min(2).max(160);
const group = z.string().min(2).max(20);
const list = (schema) => z.array(schema).max(20).optional();
const questionRef = z.string().regex(QUESTION_ID);

// 一覧の項目が指す教材。どれも省ける（まだない教材は書かない）。ID の形だけをスキーマで見て、
// 存在するかは checkCoverageLists が警告で知らせる（教材の側が先に消えたときに、一覧のほうを直させるため）
const PairSchema = z.object({
  id: z.string().regex(PAIR_ID),
  name,
  group,
  cheatsheet: z.string().regex(DOC_ID).optional(), // 付録 C の ● の組の早見表
  comparisonRefs: list(z.string().regex(COMPARISON_ID)), // 図鑑の比較
  questionRefs: list(questionRef), // 演習問題
}).strict();

const DesignPatternSchema = z.object({
  id: z.string().regex(DESIGN_PATTERN_ID),
  name,
  group,
  tasks: z.array(z.string().regex(TASK_ID)).min(1).max(4), // 付録 B の括弧の中のタスク
  material: z.string().regex(PATTERN_ID).optional(), // 設計パターンの教材
  questionRefs: list(questionRef),
}).strict();

const PitfallSchema = z.object({
  id: z.string().regex(PITFALL_ID),
  name,
  labRefs: list(z.string().regex(LAB_ID)), // ミニラボの「壊してみる」
  simRefs: list(z.string().regex(SIM_SCENARIO_ID)), // シミュレーターのシナリオ
  questionRefs: list(questionRef),
}).strict();

export const CoverageListsSchema = z.object({
  comparisons: z.array(PairSchema).min(1),
  patterns: z.array(DesignPatternSchema).min(1),
  pitfalls: z.array(PitfallSchema).min(1),
}).strict();

// 一覧の種類。key はデータの鍵、label は表示の名前
export const LIST_KINDS = [
  { key: 'comparisons', label: '比較の組' },
  { key: 'patterns', label: '設計パターン' },
  { key: 'pitfalls', label: 'つまずきの型' },
];

// 教材のあるなしの確認に使う ID の集合。省いた区分は確認しない
// ctx: { taskIds, cheatsheetIds, catalogComparisonIds, questionIds, labIds, patternIds, simIds }
export function checkCoverageLists(lists, ctx = {}) {
  const errors = [];
  const warnings = [];
  for (const { key, label } of LIST_KINDS) {
    const ids = new Set();
    const names = new Set();
    for (const item of lists[key]) {
      if (ids.has(item.id)) errors.push(`${label}の ID ${item.id} が重複しています`);
      ids.add(item.id);
      const n = item.name.normalize('NFKC').replace(/\s+/g, ' ').trim();
      if (names.has(n)) errors.push(`${label}の名前が重複しています（${item.id}: ${item.name}）`);
      names.add(n);
    }
  }
  for (const item of lists.patterns) {
    const bad = item.tasks.filter((t) => ctx.taskIds && !ctx.taskIds.has(t));
    if (bad.length) errors.push(`${item.id}: blueprint にないタスクです: ${bad.join(', ')}`);
  }
  // 一覧が指す教材が、まだない（一覧に書いたあとで消えた）ときは警告。教材がまだない項目は、書かなければよい
  const missing = (item, field, ref, ids) => {
    if (ids && !ids.has(ref)) warnings.push(`${item.id}: ${field} の ${ref} がありません`);
  };
  for (const item of lists.comparisons) {
    if (item.cheatsheet) missing(item, 'cheatsheet', item.cheatsheet, ctx.cheatsheetIds);
    for (const r of item.comparisonRefs ?? []) missing(item, 'comparisonRefs', r, ctx.catalogComparisonIds);
    for (const r of item.questionRefs ?? []) missing(item, 'questionRefs', r, ctx.questionIds);
  }
  for (const item of lists.patterns) {
    if (item.material) missing(item, 'material', item.material, ctx.patternIds);
    for (const r of item.questionRefs ?? []) missing(item, 'questionRefs', r, ctx.questionIds);
  }
  for (const item of lists.pitfalls) {
    for (const r of item.labRefs ?? []) missing(item, 'labRefs', r, ctx.labIds);
    for (const r of item.simRefs ?? []) missing(item, 'simRefs', r, ctx.simIds);
    for (const r of item.questionRefs ?? []) missing(item, 'questionRefs', r, ctx.questionIds);
  }
  // 1 つの教材を指す項目が 2 つあるのは誤りの疑い（設計パターンの教材は 1 対 1）
  const seen = new Map();
  for (const item of lists.patterns) {
    if (!item.material) continue;
    if (seen.has(item.material)) errors.push(`設計パターンの教材 ${item.material} を ${seen.get(item.material)} と ${item.id} が指しています`);
    else seen.set(item.material, item.id);
  }
  return { errors, warnings };
}

// ---------- 付録の読み取り（docs/learning-design.md） ----------
const sectionOf = (markdown, startPattern) => {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return { head: lines[start], lines: lines.slice(start + 1, end < 0 ? undefined : end) };
};

const TASKS_TAIL = /^(.*?)（((?:[1-4]\.[1-5])(?:・[1-4]\.[1-5])*)）$/;

/**
 * 付録 B・C・D から、一覧を読み取る。付録が見つからない・形が違うときは null の区画を返す。
 * 戻り値: { patterns: { total, groups: [{ name, count, items: [{ no, name, tasks }] }] } | null,
 *           comparisons: { groups: [{ name, items: [{ name, cheatsheet }] }] } | null,
 *           pitfalls: { total, items: [{ no, name }] } | null }
 */
export function parseAppendixLists(markdown) {
  const out = { patterns: null, comparisons: null, pitfalls: null };

  const b = sectionOf(markdown, /^## 付録 B\./);
  if (b) {
    const total = Number(/（(\d+) 個/.exec(b.head)?.[1]);
    const groups = [];
    for (const line of b.lines) {
      const g = /^\*\*(.+?)（(\d+)）\*\*$/.exec(line.trim());
      if (g) {
        groups.push({ name: g[1], count: Number(g[2]), items: [] });
        continue;
      }
      const m = /^(\d+)\. (.+)$/.exec(line.trim());
      if (m && groups.length) {
        const t = TASKS_TAIL.exec(m[2]);
        groups.at(-1).items.push({ no: Number(m[1]), name: t ? t[1] : m[2], tasks: t ? t[2].split('・') : [] });
      }
    }
    out.patterns = { total, groups };
  }

  const c = sectionOf(markdown, /^## 付録 C\./);
  if (c) {
    const groups = [];
    for (const line of c.lines) {
      const g = /^\*\*(.+?)\*\*$/.exec(line.trim());
      if (g) {
        groups.push({ name: g[1], items: [] });
        continue;
      }
      // ● は、早見表がある組の印（行の途中にあることもある。名前には含めない）
      const m = /^- (.+)$/.exec(line.trim());
      if (m && groups.length) groups.at(-1).items.push({ name: m[1].replace(/\s*●/, '').trim(), cheatsheet: m[1].includes('●') });
    }
    out.comparisons = { groups };
  }

  const d = sectionOf(markdown, /^## 付録 D\./);
  if (d) {
    const total = Number(/（(\d+) 個/.exec(d.head)?.[1]);
    const items = [];
    for (const line of d.lines) {
      const m = /^(\d+)\. (.+)$/.exec(line.trim());
      if (m) items.push({ no: Number(m[1]), name: m[2] });
    }
    out.pitfalls = { total, items };
  }
  return out;
}

/**
 * 付録（parseAppendixLists の結果）と一覧のデータの食い違いを文で返す。空なら一致。
 * 件数（付録の見出しの個数・グループの個数・項目の数）、名前と並び、タスク、● と早見表の有無を突き合わせる。
 */
export function compareAppendixWithLists(appendix, lists) {
  const diffs = [];
  const same = (label, a, b) => {
    if (a !== b) diffs.push(`${label}: 付録 ${a}、データ ${b}`);
  };

  if (!appendix.patterns) diffs.push('付録 B が読めません');
  else {
    const items = appendix.patterns.groups.flatMap((g) => g.items);
    same('設計パターンの総数（見出し）', appendix.patterns.total, items.length);
    same('設計パターンの総数', items.length, lists.patterns.length);
    for (const g of appendix.patterns.groups) same(`設計パターン「${g.name}」の個数（見出し）`, g.count, g.items.length);
    items.forEach((it, i) => {
      const d = lists.patterns[i];
      if (!d) return;
      if (d.id !== `dp-${String(it.no).padStart(2, '0')}`) diffs.push(`設計パターン ${it.no}: ID が ${d.id} です`);
      if (d.name !== it.name) diffs.push(`設計パターン ${it.no}: 名前が違います（付録「${it.name}」、データ「${d.name}」）`);
      if (d.tasks.join('・') !== it.tasks.join('・')) diffs.push(`設計パターン ${it.no}: タスクが違います（付録 ${it.tasks.join('・')}、データ ${d.tasks.join('・')}）`);
    });
    const groupNames = appendix.patterns.groups.flatMap((g) => g.items.map(() => g.name));
    groupNames.forEach((g, i) => {
      if (lists.patterns[i] && lists.patterns[i].group !== g) diffs.push(`設計パターン ${i + 1}: 区分が違います（付録「${g}」、データ「${lists.patterns[i].group}」）`);
    });
  }

  if (!appendix.comparisons) diffs.push('付録 C が読めません');
  else {
    const items = appendix.comparisons.groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.name })));
    same('比較の組の総数', items.length, lists.comparisons.length);
    items.forEach((it, i) => {
      const d = lists.comparisons[i];
      if (!d) return;
      if (d.id !== `pair-${String(i + 1).padStart(2, '0')}`) diffs.push(`比較の組 ${i + 1}: ID が ${d.id} です`);
      if (d.name !== it.name) diffs.push(`比較の組 ${i + 1}: 名前が違います（付録「${it.name}」、データ「${d.name}」）`);
      if (d.group !== it.group) diffs.push(`比較の組 ${i + 1}: 区分が違います（付録「${it.group}」、データ「${d.group}」）`);
      if (Boolean(d.cheatsheet) !== it.cheatsheet) diffs.push(`比較の組 ${i + 1}: ● と早見表の有無が違います（付録 ${it.cheatsheet ? '●' : 'なし'}、データ ${d.cheatsheet ? 'あり' : 'なし'}）`);
    });
    same('比較の組の ● の数', items.filter((it) => it.cheatsheet).length, lists.comparisons.filter((d) => d.cheatsheet).length);
  }

  if (!appendix.pitfalls) diffs.push('付録 D が読めません');
  else {
    same('つまずきの型の総数（見出し）', appendix.pitfalls.total, appendix.pitfalls.items.length);
    same('つまずきの型の総数', appendix.pitfalls.items.length, lists.pitfalls.length);
    appendix.pitfalls.items.forEach((it, i) => {
      const d = lists.pitfalls[i];
      if (!d) return;
      if (d.id !== `pit-${String(it.no).padStart(2, '0')}`) diffs.push(`つまずきの型 ${it.no}: ID が ${d.id} です`);
      if (d.name !== it.name) diffs.push(`つまずきの型 ${it.no}: 名前が違います（付録「${it.name}」、データ「${d.name}」）`);
    });
  }
  return diffs;
}
