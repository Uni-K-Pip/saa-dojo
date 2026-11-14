#!/usr/bin/env node
// コンテンツのカバレッジを Markdown で標準出力に出す。
//   node scripts/coverage.mjs [--json] [--full] [--root <dir>]
//     --json  集計結果を JSON で標準出力に出す（Markdown は出さない）
//     --full  出題範囲の項目ごとの一覧とサービスごとの件数も出す
//     --root  リポジトリのルート（既定: このファイルの親ディレクトリ）
// 環境変数 GITHUB_STEP_SUMMARY があれば、Markdown をそのファイルにも追記する。
// 集計するのは出題対象の問題（review-status が needs-fix・rejected のものは除く）。
// 常に終了コード 0（読み込みに失敗したときだけ 1）。判定は validate.mjs が行う。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOCK_COMPOSITION, POOLS, QUALIFIERS } from './lib/schema.mjs';
import { DEFAULT_ROOT, HIDDEN_STATUSES, loadContent, localToday, statusOf, textMatcher } from './validate.mjs';
import { RECHECK_DAYS, buildCatalogModel, daysBetween, effectiveStatus } from './lib/catalog.mjs';

// ---------- 目標値 ----------
const TARGET_DIFFICULTY = { 1: 20, 2: 50, 3: 30 }; // 難易度 1・2・3 の比率（%）
const TARGET_TYPE = { single: 80, multiple: 20 }; // 択一・複数選択の比率（%）
const TOLERANCE = 10; // 目標からのずれの許容幅（ポイント）
const MIN_SAMPLE = 10; // これ未満の母数では判定しない
const MIN_PER_ITEM = 2; // 出題範囲の項目あたりの最低問題数
const APPEAR_MIN = 10; // 図鑑: 問題での登場回数がこれ以上なのに
const FEW_FACTS = 4; // 図鑑: 事実がこの件数より少ないサービスを挙げる
const REVIEW_STATES = ['verified', 'pending', 'needs-fix', 'rejected'];
const MAX_LISTED = 15; // Markdown で一覧を省略するときの件数

const SOURCE_LABEL = { inScope: '対象サービス一覧', keyServices: 'keyServices のみ', registry: '台帳のみ' };
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const sign = (n) => (n > 0 ? `+${n}` : String(n));
const cell = (n, total) => (total ? `${n} (${pct(n, total)}%)` : '-');
const list = (arr) => arr.join(', ');

// ---------- 集計 ----------
function emptyStats() {
  return {
    total: 0,
    verified: 0,
    pools: Object.fromEntries(POOLS.map((p) => [p, 0])),
    difficulty: { 1: 0, 2: 0, 3: 0 },
    type: { single: 0, multiple: 0 },
    qualifier: Object.fromEntries(QUALIFIERS.map((q) => [q, 0])),
  };
}

function addStats(acc, s) {
  acc.total += s.total;
  acc.verified += s.verified;
  for (const k of Object.keys(acc.pools)) acc.pools[k] += s.pools[k];
  for (const k of Object.keys(acc.difficulty)) acc.difficulty[k] += s.difficulty[k];
  for (const k of Object.keys(acc.type)) acc.type[k] += s.type[k];
  for (const k of Object.keys(acc.qualifier)) acc.qualifier[k] += s.qualifier[k];
  return acc;
}

// 難易度・形式の目標からのずれを文字列にする
function judgeMix(s) {
  if (s.total < MIN_SAMPLE) return '母数不足';
  const off = [];
  for (const [k, target] of Object.entries(TARGET_DIFFICULTY)) {
    const d = pct(s.difficulty[k], s.total) - target;
    if (Math.abs(d) > TOLERANCE) off.push(`難易度${k} ${sign(d)}pt`);
  }
  const dm = pct(s.type.multiple, s.total) - TARGET_TYPE.multiple;
  if (Math.abs(dm) > TOLERANCE) off.push(`複数選択 ${sign(dm)}pt`);
  return off.length ? `ずれ: ${off.join(', ')}` : 'OK';
}

function questionText(q) {
  return [q.stem, ...q.options.flatMap((o) => [o.text, o.rationale]), q.explanation, ...q.keyPoints].join('\n');
}

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- サービス図鑑（docs/service-catalog-design.md 4.2） ----------
// serviceRows: サービス別の登場回数（computeCoverage の services.rows）。today: 'YYYY-MM-DD'
export function computeCatalogCoverage(content, { serviceRows = [], today = localToday() } = {}) {
  const { serviceIndex, catalog } = content;
  const entries = catalog.entries.map((x) => ({ file: x.rel, data: x.data }));
  const comparisons = catalog.comparisons.map((x) => ({ file: x.rel, data: x.data }));
  const model = buildCatalogModel({ entries, comparisons, serviceIndex });
  const statusMap = catalog.status.data ?? {};
  const countStates = () => Object.fromEntries(REVIEW_STATES.map((k) => [k, 0]));
  const factState = (id) => {
    const rec = model.factById.get(id);
    return rec ? effectiveStatus(statusMap, id, 'fact', rec.fact).status : null;
  };

  // 1. エントリの網羅（hostedBy のあるサービスは親の行に含める）
  const hostedOf = new Map();
  for (const e of serviceIndex.entries) {
    if (e.hostedBy !== undefined && serviceIndex.byId.has(e.hostedBy)) {
      if (!hostedOf.has(e.hostedBy)) hostedOf.set(e.hostedBy, []);
      hostedOf.get(e.hostedBy).push(e.name);
    }
  }
  const services = serviceIndex.entries
    .filter((e) => e.hostedBy === undefined || !serviceIndex.byId.has(e.hostedBy))
    .map((e) => {
      const entry = model.entryById.get(e.id)?.data ?? null;
      const states = countStates();
      for (const fct of entry?.facts ?? []) states[effectiveStatus(statusMap, fct.id, 'fact', fct).status]++;
      return {
        id: e.id,
        name: e.name,
        category: e.category,
        hosted: hostedOf.get(e.id) ?? [],
        hasEntry: Boolean(entry),
        tier: entry?.tier ?? null,
        core: entry ? entry.facts.filter((fct) => fct.depth === 'core').length : 0,
        detail: entry ? entry.facts.filter((fct) => fct.depth === 'detail').length : 0,
        comparisons: model.comparisonsByService.get(e.id)?.length ?? 0,
        entryStatus: entry ? effectiveStatus(statusMap, e.id, 'entry', entry).status : null,
        factStatus: states,
      };
    });
  const withEntry = services.filter((r) => r.hasEntry);
  const byTier = Object.fromEntries(
    [1, 2, 3].map((t) => {
      const rows = withEntry.filter((r) => r.tier === t);
      return [t, { entries: rows.length, core: rows.reduce((n, r) => n + r.core, 0), detail: rows.reduce((n, r) => n + r.detail, 0) }];
    }),
  );
  const noEntryByCategory = new Map();
  for (const r of services.filter((x) => !x.hasEntry)) {
    if (!noEntryByCategory.has(r.category)) noEntryByCategory.set(r.category, []);
    noEntryByCategory.get(r.category).push(r.name);
  }
  const factStates = countStates();
  for (const { fact } of model.factById.values()) factStates[effectiveStatus(statusMap, fact.id, 'fact', fact).status]++;

  // 2. 不足の対応（事実の対応は factRefs で数え、decision とは別に数える）
  let needs = null;
  if (catalog.needs.data) {
    const byTask = new Map();
    const questionItems = [];
    for (const it of catalog.needs.data.items) {
      if (!byTask.has(it.task)) {
        byTask.set(it.task, { task: it.task, total: 0, allVerified: 0, withFacts: 0, none: 0, lesson: 0, question: 0, skip: 0, undecided: 0 });
      }
      const t = byTask.get(it.task);
      t.total++;
      const refs = it.factRefs ?? [];
      const states = refs.map(factState).filter((x) => x !== null);
      if (states.length > 0) t.withFacts++;
      else t.none++;
      if (states.length > 0 && states.length === refs.length && states.every((x) => x === 'verified')) t.allVerified++;
      if (it.decision === 'lesson' || it.decision === 'question' || it.decision === 'skip') t[it.decision]++;
      else if (!it.decision) t.undecided++;
      if (it.decision === 'question') questionItems.push({ key: it.key, task: it.task, knowledge: it.knowledge });
    }
    const tasks = [...byTask.values()].sort((a, b) => byText(a.task, b.task));
    const sum = (k) => tasks.reduce((n, t) => n + t[k], 0);
    needs = {
      total: sum('total'),
      tasks,
      totals: Object.fromEntries(['allVerified', 'withFacts', 'none', 'lesson', 'question', 'skip', 'undecided'].map((k) => [k, sum(k)])),
      questionItems,
    };
  }

  // 3. 再確認リスト（catalog-old-check と同じ基準）
  const recheck = [];
  for (const { fact, entryId } of model.factById.values()) {
    const limit = RECHECK_DAYS[fact.kind] ?? RECHECK_DAYS.default;
    const days = daysBetween(fact.checkedAt, today);
    if (days >= limit) recheck.push({ id: fact.id, type: 'fact', kind: fact.kind, entryId, checkedAt: fact.checkedAt, days, limit });
  }
  for (const { data: c } of model.comparisonById.values()) {
    const days = daysBetween(c.checkedAt, today);
    if (days >= RECHECK_DAYS.default) recheck.push({ id: c.id, type: 'comparison', kind: 'comparison', entryId: null, checkedAt: c.checkedAt, days, limit: RECHECK_DAYS.default });
  }
  recheck.sort((a, b) => b.days - a.days || byText(a.id, b.id));

  // 4. 問題との対応
  const idByName = new Map(serviceIndex.entries.map((e) => [e.name, e.id]));
  const rowById = new Map(services.map((r) => [r.id, r]));
  const appearances = serviceRows
    .map((r) => {
      const row = rowById.get(idByName.get(r.name));
      return { id: idByName.get(r.name), name: r.name, questions: r.questions, facts: row ? row.core + row.detail : 0, tier: row?.tier ?? null };
    })
    .sort((a, b) => b.questions - a.questions || byText(a.name, b.name));
  const fewFacts = appearances.filter((r) => r.questions >= APPEAR_MIN && r.facts < FEW_FACTS);

  return {
    today,
    thresholds: { appearMin: APPEAR_MIN, fewFacts: FEW_FACTS },
    present: entries.length > 0 || comparisons.length > 0,
    totals: {
      services: services.length,
      hostedServices: services.reduce((n, r) => n + r.hosted.length, 0),
      entries: withEntry.length,
      withoutEntry: services.length - withEntry.length,
      facts: model.factById.size,
      core: withEntry.reduce((n, r) => n + r.core, 0),
      detail: withEntry.reduce((n, r) => n + r.detail, 0),
      comparisons: model.comparisonById.size,
      factStatus: factStates,
    },
    byTier,
    services,
    noEntry: [...noEntryByCategory].map(([category, names]) => ({ category, names })),
    tier1WithoutComparison: withEntry.filter((r) => r.tier === 1 && r.comparisons === 0).map((r) => r.id),
    needs,
    recheck,
    appearances: { rows: appearances, fewFacts },
  };
}

export function computeCoverage(content, { today } = {}) {
  const { blueprint, bpIndex, serviceIndex } = content;

  // 出題対象の問題
  const live = [];
  const excluded = { 'needs-fix': 0, rejected: 0 };
  for (const { data: q } of content.questions) {
    const status = statusOf(content, q.id);
    if (HIDDEN_STATUSES.has(status)) excluded[status]++;
    else live.push({ q, status });
  }

  // タスク別・項目別
  const taskStats = new Map(bpIndex.tasks.map((t) => [t.id, emptyStats()]));
  const itemStats = new Map([...bpIndex.itemById.keys()].map((id) => [id, { total: 0, lessons: 0, ...Object.fromEntries(POOLS.map((p) => [p, 0])) }]));
  for (const { q, status } of live) {
    const s = taskStats.get(q.taskStatement);
    if (!s) continue; // blueprint にないタスク（validate がエラーにする）
    s.total++;
    if (status === 'verified') s.verified++;
    s.pools[q.pool]++;
    s.difficulty[q.difficulty]++;
    s.type[q.type]++;
    s.qualifier[q.qualifier]++;
    for (const ref of q.knowledgeRefs) {
      const it = itemStats.get(ref);
      if (it) {
        it.total++;
        it[q.pool]++;
      }
    }
  }

  // レッスン
  const lessonStats = new Map(bpIndex.tasks.map((t) => [t.id, { count: 0, minutes: 0 }]));
  for (const { data: l } of content.lessons) {
    const s = lessonStats.get(l.taskStatement);
    if (s) {
      s.count++;
      s.minutes += l.estimatedMinutes;
    }
    for (const ref of new Set(l.knowledgeRefs)) {
      const it = itemStats.get(ref);
      if (it) it.lessons++;
    }
  }

  // タスク・項目の一覧
  const tasks = bpIndex.tasks.map((t) => {
    const rows = t.items.map((i) => ({ id: i.id, kind: i.kind, textJa: i.textJa, ...itemStats.get(i.id) }));
    return {
      id: t.id,
      domain: t.domain,
      titleJa: t.titleJa,
      ...taskStats.get(t.id),
      lessons: lessonStats.get(t.id),
      items: {
        total: rows.length,
        zero: rows.filter((r) => r.total === 0).map((r) => r.id),
        one: rows.filter((r) => r.total === 1).map((r) => r.id),
        covered: rows.filter((r) => r.total >= MIN_PER_ITEM).length,
        mockOnly: rows.filter((r) => r.total > 0 && r.basics + r.practice === 0).map((r) => r.id),
        withLesson: rows.filter((r) => r.lessons > 0).length,
        rows,
      },
    };
  });

  // ドメイン別と全体（basics を除く）
  const domains = bpIndex.domains.map((d) => ({
    ...d,
    ...tasks.filter((t) => t.domain === d.id).reduce((acc, t) => addStats(acc, t), emptyStats()),
  }));
  const overall = domains.reduce((acc, d) => addStats(acc, d), emptyStats());

  // 模試プール（ドメインごとの必要数との比較）
  const mock = Object.entries(MOCK_COMPOSITION).map(([d, target]) => {
    const dom = domains.find((x) => x.id === Number(d));
    return { domain: Number(d), target, mockA: dom?.pools.mockA ?? 0, mockB: dom?.pools.mockB ?? 0 };
  });

  // サービスの登場回数（台帳の ID ごと。hostedBy のあるサービスは親にまとめて数える）
  const parentName = new Map(
    serviceIndex.entries.map((e) => [e.name, e.hostedBy !== undefined && serviceIndex.byId.get(e.hostedBy) ? serviceIndex.byId.get(e.hostedBy).name : e.name]),
  );
  const rowNames = serviceIndex.inScope.filter((name) => parentName.get(name) === name);
  const mentions = new Map(
    rowNames.map((name) => [
      name,
      { name, category: serviceIndex.category.get(name), source: serviceIndex.source.get(name), questions: 0, flashcards: 0, text: 0 },
    ]),
  );
  // 本文の照合は、正規名と台帳の別名のすべての表記で行う
  const matchers = serviceIndex.inScope.map((name) => ({ row: parentName.get(name), re: textMatcher(serviceIndex.formsOf(name)) }));
  const countServices = (services, field) => {
    const rows = new Set();
    for (const s of services) {
      const r = serviceIndex.resolve(s);
      if (r.kind === 'in') rows.add(parentName.get(r.canonical));
    }
    for (const n of rows) mentions.get(n)[field]++;
  };
  const countText = (text) => {
    const rows = new Set(matchers.filter((m) => m.re.test(text)).map((m) => m.row));
    for (const n of rows) mentions.get(n).text++;
  };
  for (const { q } of live) {
    countServices(q.services, 'questions');
    countText(questionText(q));
  }
  for (const { data: deck } of content.decks) {
    for (const c of deck.cards) {
      countServices(c.services, 'flashcards');
      countText(`${c.front}\n${c.back}`);
    }
  }
  const serviceRows = [...mentions.values()];
  const unmentioned = serviceRows.filter((r) => r.questions + r.flashcards + r.text === 0).map((r) => ({ name: r.name, category: r.category }));
  const keyServicesOnly = serviceRows.filter((r) => r.source === 'keyServices').map((r) => r.name);

  const invalidFiles =
    content.counts.questionFiles - content.questions.length +
    content.counts.lessonFiles - content.lessons.length +
    content.counts.cheatsheetFiles + content.counts.guideFiles - content.docs.length +
    content.counts.deckFiles - content.decks.length +
    content.counts.glossaryFiles - content.glossaries.length;

  return {
    exam: blueprint.exam.code,
    checkedAt: blueprint.checkedAt,
    targets: { difficulty: TARGET_DIFFICULTY, type: TARGET_TYPE, tolerancePt: TOLERANCE, minPerItem: MIN_PER_ITEM },
    totals: {
      questions: live.length,
      verified: live.filter((x) => x.status === 'verified').length,
      pools: Object.fromEntries(POOLS.map((p) => [p, live.filter((x) => x.q.pool === p).length])),
      excluded,
      lessons: content.lessons.length,
      lessonMinutes: content.lessons.reduce((n, l) => n + l.data.estimatedMinutes, 0),
      cheatsheets: content.docs.filter((d) => d.docKind === 'cheatsheet').length,
      guides: content.docs.filter((d) => d.docKind === 'guide').length,
      flashcardDecks: content.decks.length,
      flashcards: content.decks.reduce((n, d) => n + d.data.cards.length, 0),
      glossaryEntries: content.glossaries.reduce((n, g) => n + g.data.entries.length, 0),
      invalidFiles,
    },
    tasks,
    domains,
    overall,
    mock,
    services: {
      registry: serviceIndex.hasRegistry,
      inScopeTotal: serviceRows.length,
      keyServicesOnly,
      unmentioned,
      rows: serviceRows,
    },
    catalog: computeCatalogCoverage(content, { serviceRows, today }),
  };
}

// ---------- Markdown ----------
// align: 列ごとの寄せ（l 左 / r 右）を並べた文字列
function table(headers, rows, align) {
  const cellText = (v) => String(v).replace(/\|/g, '\\|');
  const line = (cells) => `| ${cells.map(cellText).join(' | ')} |`;
  const sep = headers.map((_, i) => (align[i] === 'r' ? '---:' : '---'));
  return [line(headers), `|${sep.join('|')}|`, ...rows.map(line)].join('\n');
}

const bold = (s, on) => (on ? `**${s}**` : s);

// 表の行になる範囲: basics、各タスク、ドメイン小計、全体（basics を除く）
function scopes(cov) {
  const out = [];
  const basics = cov.tasks.find((t) => t.id === 'basics');
  out.push({ key: 'basics', name: basics.titleJa, stats: basics, isBasics: true });
  for (const d of cov.domains) {
    for (const t of cov.tasks.filter((x) => x.domain === d.id)) out.push({ key: t.id, name: t.titleJa, stats: t });
    out.push({ key: `D${d.id} 計`, name: d.nameJa, stats: d, strong: true });
  }
  out.push({ key: '全体', name: 'basics を除く', stats: cov.overall, strong: true });
  return out;
}

export function renderMarkdown(cov, { full = false } = {}) {
  const L = [];
  const t = cov.totals;
  const push = (...lines) => L.push(...lines);

  push(`# コンテンツのカバレッジ（${cov.exam}）`, '');
  push(`blueprint の確認日は ${cov.checkedAt} です。集計するのは出題対象の問題で、review-status が needs-fix・rejected のものは含めません。`, '');
  if (t.invalidFiles > 0) {
    push(`> 検証エラーのあるファイルが ${t.invalidFiles} 件あり、集計に含まれていません。\`npm run validate\` で確認してください。`, '');
  }

  // 概要
  push('## 概要', '');
  push(
    table(
      ['区分', '件数'],
      [
        ['問題（出題対象）', t.questions],
        ['　basics / practice', `${t.pools.basics} / ${t.pools.practice}`],
        ['　mockA / mockB', `${t.pools.mockA} / ${t.pools.mockB}`],
        ['　verified', t.verified],
        ['出題から除外（needs-fix / rejected）', `${t.excluded['needs-fix']} / ${t.excluded.rejected}`],
        ['レッスン', `${t.lessons}（学習時間 約 ${t.lessonMinutes} 分）`],
        ['早見表 / ガイド', `${t.cheatsheets} / ${t.guides}`],
        ['フラッシュカード', `${t.flashcards} 枚（${t.flashcardDecks} デッキ）`],
        ['用語集', `${t.glossaryEntries} 語`],
      ],
      'lr',
    ),
    '',
  );

  // 問題数
  push('## 問題数（タスク別・プール別）', '');
  push(
    table(
      ['タスク', '名称', ...POOLS, '計', 'verified'],
      scopes(cov).map(({ key, name, stats: s, strong }) => [bold(key, strong), bold(name, strong), ...POOLS.map((p) => s.pools[p]), s.total, s.verified]),
      'llrrrrrr',
    ),
    '',
  );

  // 難易度・形式
  push('## 難易度・形式の構成', '');
  push(
    `目標は難易度 1:2:3 = ${Object.values(TARGET_DIFFICULTY).join(':')}（%）、択一:複数選択 = ${Object.values(TARGET_TYPE).join(':')}（%）です。` +
      `${MIN_SAMPLE} 問未満は判定せず、目標から ${TOLERANCE} ポイントを超えてずれたものを示します。`,
    '',
  );
  push(
    table(
      ['範囲', '問題数', '難易度1', '難易度2', '難易度3', '択一', '複数選択', '判定'],
      scopes(cov).map(({ key, name, stats: s, strong, isBasics }) => [
        bold(`${key} ${name}`, strong),
        s.total,
        ...[1, 2, 3].map((k) => cell(s.difficulty[k], s.total)),
        cell(s.type.single, s.total),
        cell(s.type.multiple, s.total),
        isBasics ? '対象外' : judgeMix(s),
      ]),
      'lrrrrrrl',
    ),
    '',
  );

  // 判断軸
  push('## 判断軸（qualifier）の構成', '');
  push(
    table(
      ['範囲', '問題数', ...QUALIFIERS],
      scopes(cov).map(({ key, name, stats: s, strong }) => [bold(`${key} ${name}`, strong), s.total, ...QUALIFIERS.map((q) => cell(s.qualifier[q], s.total))]),
      'l'.padEnd(2 + QUALIFIERS.length, 'r'),
    ),
    '',
  );

  // 模試
  push('## 模試プール', '');
  push('mockA・mockB それぞれで、ドメインごとに次の問題数が必要です（本番 65 問の比重配分）。', '');
  const judgeMock = (n, target) => (n === target ? 'OK' : n < target ? `不足 ${target - n}` : `超過 ${n - target}`);
  push(
    table(
      ['ドメイン', '必要数', 'mockA', '判定', 'mockB', '判定'],
      [
        ...cov.mock.map((m) => [`D${m.domain}`, m.target, m.mockA, judgeMock(m.mockA, m.target), m.mockB, judgeMock(m.mockB, m.target)]),
        (() => {
          const sum = (f) => cov.mock.reduce((n, m) => n + f(m), 0);
          return ['**計**', sum((m) => m.target), sum((m) => m.mockA), '', sum((m) => m.mockB), ''];
        })(),
      ],
      'lrrlrl',
    ),
    '',
  );

  // 項目のカバー
  push('## 出題範囲の項目のカバー', '');
  const itemTotal = cov.tasks.reduce((n, x) => n + x.items.total, 0);
  const itemZero = cov.tasks.reduce((n, x) => n + x.items.zero.length, 0);
  const itemOne = cov.tasks.reduce((n, x) => n + x.items.one.length, 0);
  push(`各項目に紐づく問題数（knowledgeRefs）を数え、${MIN_PER_ITEM} 問未満の項目を挙げます。全 ${itemTotal} 項目のうち、0 問が ${itemZero} 項目、1 問が ${itemOne} 項目です。`, '');
  const basics = cov.tasks.find((x) => x.id === 'basics');
  push(`基礎講座（basics）の項目は ${basics.items.total} 項目のうち ${basics.items.total - basics.items.zero.length} 項目に問題があります。`, '');
  for (const x of cov.tasks) {
    const ok = x.items.covered;
    push(`- **${x.id}**（${x.items.total} 項目）: 0 問 ${x.items.zero.length} / 1 問 ${x.items.one.length} / ${MIN_PER_ITEM} 問以上 ${ok}`);
    if (x.items.zero.length) push(`  - 0 問: ${list(x.items.zero)}`);
    if (x.items.one.length) push(`  - 1 問: ${list(x.items.one)}`);
    if (x.items.mockOnly.length) push(`  - 模試にだけある（演習・基礎の問題がない）: ${list(x.items.mockOnly)}`);
  }
  push('');
  if (full) {
    push('### 項目別の問題数', '');
    push(
      table(
        ['項目', '内容', '合計', 'basics', 'practice', 'mockA', 'mockB', 'レッスン'],
        cov.tasks.flatMap((x) =>
          x.items.rows.map((r) => [r.id, r.textJa, r.total, r.basics, r.practice, r.mockA, r.mockB, r.lessons]),
        ),
        'llrrrrrr',
      ),
      '',
    );
  }

  // レッスン
  push('## レッスン', '');
  push(
    table(
      ['タスク', '名称', 'レッスン数', '学習時間（分）', 'レッスンが参照する項目'],
      cov.tasks.map((x) => [x.id, x.titleJa, x.lessons.count, x.lessons.minutes, `${x.items.withLesson} / ${x.items.total}`]),
      'llrrr',
    ),
    '',
  );
  const noLesson = cov.tasks.filter((x) => x.lessons.count === 0).map((x) => x.id);
  push(noLesson.length ? `レッスンがないタスク: ${list(noLesson)}` : 'すべてのタスクにレッスンがあります。', '');

  // サービス
  push('## サービス', '');
  const s = cov.services;
  push(
    s.registry
      ? `サービス台帳（services.json）の ${s.inScopeTotal} 件で数えます。正式名と略称などの別の表記は、同じサービスとして数えます。`
      : 'サービス台帳（services.json）がないため、blueprint の表記ごとに数えます。',
    '',
  );
  if (s.keyServicesOnly.length) {
    push(`試験ガイドの対象サービス一覧になく、タスクの keyServices にだけ挙がっているもの（${s.keyServicesOnly.length} 件）: ${list(s.keyServicesOnly)}`, '');
  }
  push(`試験範囲のサービス ${s.inScopeTotal} 件のうち、問題・フラッシュカードの services にも本文にも出てこないものは ${s.unmentioned.length} 件です。`, '');
  const byCategory = new Map();
  for (const u of s.unmentioned) {
    if (!byCategory.has(u.category)) byCategory.set(u.category, []);
    byCategory.get(u.category).push(u.name);
  }
  for (const [category, names] of byCategory) push(`- ${category}: ${list(names)}`);
  if (byCategory.size) push('');
  if (full) {
    push('### サービス別の登場回数', '');
    push(
      table(
        ['サービス', '分類', '出所', 'services（問題）', 'services（カード）', '本文'],
        s.rows.map((r) => [r.name, r.category, SOURCE_LABEL[r.source] ?? r.source, r.questions, r.flashcards, r.text]),
        'lllrrr',
      ),
      '',
    );
  }

  renderCatalogMarkdown(cov.catalog, { full, push });

  return L.join('\n').replace(/\n{3,}/g, '\n\n');
}

function renderCatalogMarkdown(c, { full, push }) {
  const t = c.totals;
  const st = (o) => REVIEW_STATES.map((k) => o[k]).join(' / ');
  push('## サービス図鑑', '');
  if (!c.present) {
    push('図鑑のエントリはまだありません。', '');
  } else {
    push(
      `台帳 ${t.services} サービス（hostedBy の ${t.hostedServices} 件は親に含む）のうち、エントリがあるのは ${t.entries} 件、ないのは ${t.withoutEntry} 件です。事実は ${t.facts} 件（core ${t.core} / detail ${t.detail}）、比較は ${t.comparisons} 件です。`,
      '',
    );
    push(`事実の検証状態（verified / pending / needs-fix / rejected）: ${st(t.factStatus)}。ハッシュが合わないものは pending として数えます。`, '');
    push(
      table(
        ['区分', 'エントリ', 'core', 'detail'],
        [1, 2, 3].map((k) => [`区分 ${k}`, c.byTier[k].entries, c.byTier[k].core, c.byTier[k].detail]),
        'lrrr',
      ),
      '',
    );
    push('### エントリの一覧', '');
    push(
      table(
        ['サービス', '区分', 'core', 'detail', '比較', '本体', '事実の検証（v / p / nf / r）'],
        c.services
          .filter((r) => r.hasEntry)
          .map((r) => [r.name + (r.hosted.length ? `（含む: ${list(r.hosted)}）` : ''), r.tier, r.core, r.detail, r.comparisons, r.entryStatus, st(r.factStatus)]),
        'lrrrrll',
      ),
      '',
    );
  }
  push(`### エントリのないサービス（${t.withoutEntry} 件）`, '');
  for (const { category, names } of c.noEntry) push(`- ${category}（${names.length} 件）: ${list(names)}`);
  if (c.noEntry.length) push('');
  if (c.present) {
    push(c.tier1WithoutComparison.length ? `比較のない区分 1 のエントリ: ${list(c.tier1WithoutComparison)}` : '比較のない区分 1 のエントリはありません。', '');
  }

  push('### 不足の対応', '');
  if (!c.needs) {
    push('catalog-needs.json がありません。', '');
  } else {
    const n = c.needs;
    push('事実の対応は factRefs で数え、decision とは別に数えます。「事実あり」は存在する事実を 1 件でも指す項目で、未検証を含みます。', '');
    push(
      table(
        ['タスク', '不足', 'すべて verified', '事実あり（未検証を含む）', '対応なし', 'lesson', 'question', 'skip', '未決'],
        [
          ...n.tasks.map((x) => [x.task, x.total, x.allVerified, x.withFacts, x.none, x.lesson, x.question, x.skip, x.undecided]),
          ['**計**', n.total, n.totals.allVerified, n.totals.withFacts, n.totals.none, n.totals.lesson, n.totals.question, n.totals.skip, n.totals.undecided],
        ],
        'lrrrrrrrr',
      ),
      '',
    );
    if (n.questionItems.length) {
      push(`decision が question の項目（${n.questionItems.length} 件）:`, '');
      for (const q of n.questionItems) push(`- ${q.key}（${q.task}）: ${q.knowledge.replace(/\s+/g, ' ')}`);
      push('');
    }
  }

  push('### 再確認リスト', '');
  push(`checkedAt が古い事実・比較（${c.today} 時点。数値・料金は ${RECHECK_DAYS.quota} 日、その他は ${RECHECK_DAYS.default} 日以上）: ${c.recheck.length} 件`, '');
  const shown = full ? c.recheck : c.recheck.slice(0, MAX_LISTED);
  for (const r of shown) push(`- ${r.id}（${r.kind}、${r.checkedAt}、${r.days} 日前）`);
  if (shown.length < c.recheck.length) push(`- …ほか ${c.recheck.length - shown.length} 件（--full で全件表示）`);
  if (c.recheck.length) push('');

  push('### 問題との対応', '');
  const few = c.appearances.fewFacts;
  push(`問題の services での登場が ${c.thresholds.appearMin} 回以上で、事実が ${c.thresholds.fewFacts} 件未満のサービス: ${few.length} 件`, '');
  const listed = full ? few : few.slice(0, MAX_LISTED);
  if (listed.length) {
    push(table(['サービス', '登場（問題）', '事実', '区分'], listed.map((r) => [r.name, r.questions, r.facts, r.tier ?? '-']), 'lrrr'), '');
  }
  if (listed.length < few.length) push(`…ほか ${few.length - listed.length} 件（--full で全件表示）`, '');
}

// ---------- CLI ----------
const USAGE = [
  '使い方: node scripts/coverage.mjs [--json] [--full] [--root <dir>]',
  '  --json  集計結果を JSON で標準出力に出す',
  '  --full  項目ごとの一覧とサービスごとの件数も出す',
  '  --root  リポジトリのルート（既定: scripts の親ディレクトリ）',
].join('\n');

function parseCliArgs(argv) {
  const opts = { json: false, full: false, root: DEFAULT_ROOT };
  const fail = (msg) => {
    console.error(`${msg}\n${USAGE}`);
    process.exit(2);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--full') opts.full = true;
    else if (a === '--root') {
      if (!argv[i + 1]) fail('--root にはディレクトリを指定してください');
      opts.root = path.resolve(argv[++i]);
    } else if (a.startsWith('--root=')) opts.root = path.resolve(a.slice('--root='.length));
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else fail(`不明なオプション: ${a}`);
  }
  return opts;
}

function main(argv) {
  const opts = parseCliArgs(argv);
  const content = loadContent({ root: opts.root });
  if (!content.blueprint) {
    console.error('blueprint.json を読み込めないため集計できません。npm run validate で原因を確認してください。');
    process.exitCode = 1;
    return;
  }
  const cov = computeCoverage(content);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(cov, null, 2)}\n`);
    return;
  }
  const md = renderMarkdown(cov, { full: opts.full });
  console.log(md);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    try {
      fs.appendFileSync(summaryFile, `${md}\n`);
    } catch (e) {
      console.error(`ジョブサマリーへの書き込みに失敗しました: ${e.message}`);
    }
  }
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`集計スクリプトが異常終了しました: ${e.stack ?? e}`);
    process.exitCode = 2;
  }
}
