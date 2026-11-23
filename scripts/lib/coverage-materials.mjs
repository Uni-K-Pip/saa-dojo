// coverage に足す、図・実物・その場の確認・ミニラボ・設計パターン・網羅の一覧・図鑑の事実の到達・検証状態の集計
// （docs/visual-materials-design.md 11.4。docs/learning-design.md 6 章）。
// 入力は、validate・ビルドが使う関数で読んだ結果（parseMaterialRefs・parseInlineChecks・parseCatalogLinks・
// materialStatuses など）。同じ読み方を別に書かないので、ここは数えるだけの純粋な関数にしている。
import { ARTIFACT_KINDS } from './schema.mjs';
import { parseMaterialRefs } from './diagram.mjs';
import { parseInlineChecks } from './inline-check.mjs';
import { parseCatalogLinks } from './catalog.mjs';
import { LIST_KINDS } from './coverage-lists.mjs';

const REVIEW_STATES = ['verified', 'pending', 'needs-fix', 'rejected'];
const DIAGRAM_TYPES = ['architecture', 'decision', 'position', 'timeline', 'layers'];
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const countStates = () => Object.fromEntries(REVIEW_STATES.map((k) => [k, 0]));

// 目安（設計書 17 章の「1 レッスンに 3〜6 個」、learning-design.md の 6 章の到達と想起の目標）
export const CHECKS_PER_LESSON = [3, 6];
export const FACT_TARGETS = { reachTier1: 100, reachAll: 90, recallTier1: 80 };
// 設計パターンと比較の組の「演習問題 2 問以上」（learning-design.md の 6 章 C4・C5）
export const MIN_QUESTIONS_PER_ITEM = 2;

/** 本文の図・実物の参照（画像の形で、存在する ID を指すもの。表示ではその位置に出る）。重複した ID は 1 つに数える */
function materialRefsIn(body, { diagrams, artifacts }) {
  const diagramIds = new Set();
  const artifactIds = new Set();
  for (const ref of parseMaterialRefs(body)) {
    if (!ref.image || ref.reference || !ref.id) continue;
    if (ref.kind === 'diagram' && diagrams.has(ref.id)) diagramIds.add(ref.id);
    if (ref.kind === 'artifact' && artifacts.has(ref.id)) artifactIds.add(ref.id);
  }
  return { diagramIds, artifactIds };
}

/**
 * レッスンごとの図の枚数と種類・実物の数・その場の確認の数。
 * lessons: [{ data: { id, taskStatement }, body }]、diagrams: Map(id → { type, status })、artifacts: Map(id → { status })
 */
export function lessonMaterialRows(lessons, { diagrams, artifacts }) {
  return lessons.map(({ data, body }) => {
    const { diagramIds, artifactIds } = materialRefsIn(body, { diagrams, artifacts });
    const types = Object.fromEntries(DIAGRAM_TYPES.map((t) => [t, 0]));
    let verifiedDiagrams = 0;
    for (const id of diagramIds) {
      const d = diagrams.get(id);
      types[d.type]++;
      if (d.status === 'verified') verifiedDiagrams++;
    }
    const checks = parseInlineChecks(body).filter((c) => c.problems.length === 0).length;
    return {
      id: data.id,
      task: data.taskStatement,
      diagrams: diagramIds.size,
      verifiedDiagrams,
      types,
      artifacts: artifactIds.size,
      verifiedArtifacts: [...artifactIds].filter((id) => artifacts.get(id).status === 'verified').length,
      checks,
    };
  });
}

export function summarizeLessonMaterials(rows) {
  const [lo, hi] = CHECKS_PER_LESSON;
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  return {
    lessons: rows.length,
    diagramRefs: sum((r) => r.diagrams),
    byType: Object.fromEntries(DIAGRAM_TYPES.map((t) => [t, sum((r) => r.types[t])])),
    withoutDiagram: rows.filter((r) => r.diagrams === 0).map((r) => r.id),
    withoutVerifiedDiagram: rows.filter((r) => r.verifiedDiagrams === 0).map((r) => r.id),
    artifactRefs: sum((r) => r.artifacts),
    checks: {
      total: sum((r) => r.checks),
      withChecks: rows.filter((r) => r.checks > 0).length,
      none: rows.filter((r) => r.checks === 0).map((r) => r.id),
      few: rows.filter((r) => r.checks > 0 && r.checks < lo).map((r) => r.id),
      inRange: rows.filter((r) => r.checks >= lo && r.checks <= hi).length,
      many: rows.filter((r) => r.checks > hi).map((r) => r.id),
    },
  };
}

/** 早見表ごとの、選択フロー（decision）・位置づけ図（position）の有無。docs: [{ data: { id }, body }] */
export function cheatsheetFigureRows(docs, { diagrams, artifacts = new Map() }) {
  return docs.map(({ data, body }) => {
    const { diagramIds } = materialRefsIn(body, { diagrams, artifacts });
    const has = (type) => [...diagramIds].some((id) => diagrams.get(id).type === type);
    const hasVerified = (type) => [...diagramIds].some((id) => diagrams.get(id).type === type && diagrams.get(id).status === 'verified');
    return {
      id: data.id,
      diagrams: diagramIds.size,
      decision: has('decision'),
      position: has('position'),
      decisionVerified: hasVerified('decision'),
      positionVerified: hasVerified('position'),
    };
  });
}

/** 実物の種類（kind）ごとの件数。kinds は省くと ARTIFACT_KINDS。0 件の種類も出す。items: [{ data: { id, kind } }]、status: Map(id → 状態) */
export function artifactKindCounts(items, statuses, kinds = ARTIFACT_KINDS) {
  const rows = kinds.map((kind) => ({ kind, count: 0, verified: 0 }));
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  for (const { data } of items) {
    const row = byKind.get(data.kind);
    if (!row) continue;
    row.count++;
    if (statuses.get(data.id)?.status === 'verified') row.verified++;
  }
  return rows;
}

/**
 * ユニットごとのミニラボ。course はスキーマに通った course.json の中身（なければ null）。
 * ミニラボは front matter の unit で数える（course.json に入れたユニットと同じにする決まり。違えば validate が警告する）。
 * labs: [{ data: { id, unit } }]、statuses: Map(id → { status })
 */
export function labUnitRows(course, labs, statuses) {
  if (!course) return [];
  return course.stages.flatMap((stage) => stage.units.map((unit) => {
    const own = labs.filter(({ data }) => data.unit === unit.id).map(({ data }) => ({ id: data.id, status: statuses.get(data.id)?.status ?? 'pending' }));
    const placed = unit.items.filter((i) => i.kind === 'lab').map((i) => i.ref);
    return { unit: unit.id, title: unit.title, stage: stage.id, labs: own, placed: placed.length, verified: own.filter((l) => l.status === 'verified').length };
  }));
}

/**
 * 網羅の一覧（coverage-lists.json）ごとの対応。数えるのは、一覧が指す教材のうち、実在するもの。
 *   比較の組: 早見表か図鑑の比較が 1 つ以上、演習問題が 2 問以上（learning-design.md の 6 章 C4）
 *   設計パターン: 設計パターンの教材が 1 つ、演習問題が 2 問以上（C5）
 *   つまずきの型: ミニラボ・シナリオ・問題のどれかが 1 つ以上（visual-materials-design.md の N5）
 * ctx: { cheatsheetIds, catalogComparisonIds, questionIds, labIds, patternIds, simIds, statuses }
 *   statuses: { patterns: Map, labs: Map, sims: Map }（なければ状態は数えない）
 */
export function listCoverage(lists, ctx) {
  const has = (set, ref) => (set ? set.has(ref) : true);
  const live = (refs = [], set) => refs.filter((r) => has(set, r));
  const rowsOf = {
    comparisons: lists.comparisons.map((it) => {
      const cheatsheet = it.cheatsheet && has(ctx.cheatsheetIds, it.cheatsheet) ? [it.cheatsheet] : [];
      const comparisons = live(it.comparisonRefs, ctx.catalogComparisonIds);
      const questions = live(it.questionRefs, ctx.questionIds);
      return { id: it.id, name: it.name, group: it.group, materials: cheatsheet.length + comparisons.length, cheatsheet: cheatsheet.length, comparisons: comparisons.length, questions: questions.length, met: cheatsheet.length + comparisons.length > 0 && questions.length >= MIN_QUESTIONS_PER_ITEM };
    }),
    patterns: lists.patterns.map((it) => {
      const material = it.material && has(ctx.patternIds, it.material) ? it.material : null;
      const questions = live(it.questionRefs, ctx.questionIds);
      return { id: it.id, name: it.name, group: it.group, material, status: material ? ctx.statuses?.patterns?.get(material)?.status ?? 'pending' : null, materials: material ? 1 : 0, questions: questions.length, met: Boolean(material) && questions.length >= MIN_QUESTIONS_PER_ITEM };
    }),
    pitfalls: lists.pitfalls.map((it) => {
      const labs = live(it.labRefs, ctx.labIds);
      const sims = live(it.simRefs, ctx.simIds);
      const questions = live(it.questionRefs, ctx.questionIds);
      return { id: it.id, name: it.name, materials: labs.length + sims.length, labs: labs.length, sims: sims.length, questions: questions.length, met: labs.length + sims.length + questions.length > 0 };
    }),
  };
  return Object.fromEntries(LIST_KINDS.map(({ key, label }) => {
    const rows = rowsOf[key];
    return [key, {
      label,
      total: rows.length,
      withMaterial: rows.filter((r) => r.materials > 0).length,
      withQuestions: rows.filter((r) => r.questions >= MIN_QUESTIONS_PER_ITEM).length,
      met: rows.filter((r) => r.met).length,
      rows,
    }];
  }));
}

/**
 * 図鑑の core の事実の到達と想起（learning-design.md の 6 章 C3）。
 *   到達: レッスン・早見表・ガイド・ミニラボ・設計パターンの本文の図鑑へのリンク（`#/services/<id>?f=<スラッグ>` が指す事実）か、
 *         問題の factRefs から指される。区分 1 の core は 100%、全体は 90% が目標。
 *   想起: 問題の factRefs で問われる。区分 1 の core の 80% が目標。
 * facts: [{ id, tier, depth }]、texts: 本文の文字列、questionFactRefs: 問題が指す事実の ID の配列
 * extraRefs: 目標の定義に入らない参照（図・実物・シナリオの factRefs）。参考の数だけに使う
 * 暗記カードは事実を指す欄がなく（FlashcardSchema）、本文の中の図鑑へのリンクも書かれていないので、読み取れず、含めない。
 */
export function coreFactReach(facts, { texts = [], questionFactRefs = [], extraRefs = [] }) {
  const linked = new Set();
  for (const text of texts) {
    for (const l of parseCatalogLinks(text)) if (l.kind === 'entry' && l.slug) linked.add(`${l.id}.${l.slug}`);
  }
  const asked = new Set(questionFactRefs);
  const extra = new Set(extraRefs);
  const core = facts.filter((f) => f.depth === 'core');
  const stat = (rows, pred) => {
    const n = rows.filter(pred).length;
    return { total: rows.length, reached: n, percent: rows.length ? Math.round((100 * n) / rows.length) : null };
  };
  const reached = (f) => linked.has(f.id) || asked.has(f.id);
  const tier1 = core.filter((f) => f.tier === 1);
  return {
    targets: FACT_TARGETS,
    reach: { tier1: stat(tier1, reached), all: stat(core, reached) },
    recall: { tier1: stat(tier1, (f) => asked.has(f.id)) },
    withOtherRefs: { all: stat(core, (f) => reached(f) || extra.has(f.id)) },
    linkedFacts: [...linked].filter((id) => facts.some((f) => f.id === id)).length,
    questionFacts: [...asked].filter((id) => facts.some((f) => f.id === id)).length,
  };
}

/** 検証状態の内訳。statuses: { 区分: Map(id → { status, stale, recorded }) }、labels: { 区分: 名前 } */
export function statusBreakdown(statuses, labels) {
  return Object.entries(statuses).map(([section, map]) => {
    const states = countStates();
    let stale = 0;
    let unrecorded = 0;
    for (const s of map.values()) {
      states[s.status]++;
      if (s.stale) stale++;
      if (!s.recorded) unrecorded++;
    }
    return { section, label: labels[section] ?? section, total: map.size, ...states, stale, unrecorded };
  }).sort((a, b) => byText(a.section, b.section));
}
