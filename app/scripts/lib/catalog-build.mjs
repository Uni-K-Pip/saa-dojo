// サービス図鑑の出力（一覧用の索引・エントリごとの詳細・比較）を組み立てる。
// 共通の判定（検証状態・ハッシュ・サービス名の引き当て）は scripts/lib/catalog.mjs に任せる。
// 設計は docs/service-catalog-design.md の 5.7。
import { buildCatalogModel, checkCatalog, effectiveStatus, entryIdFor, entryIdForName } from '../../../scripts/lib/catalog.mjs';
import { registrySummary } from '../../../scripts/lib/service-registry.mjs';

// 参照が壊れていてアプリが成り立たなくなるものだけをエラーにする。ほかは警告
const ERROR_CODES = new Set(['catalog-ref', 'catalog-entry', 'path-mismatch']);
const HIDDEN = new Set(['needs-fix', 'rejected']);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (list) => [...new Set(list)].sort(cmp);

/** parsed（parseContent の結果の一部）から図鑑のモデルを作る */
function modelOf(parsed, serviceIndex) {
  return buildCatalogModel({
    entries: parsed.catalogEntries.map((e) => ({ file: e.rel, data: e.data })),
    comparisons: parsed.catalogComparisons.map((c) => ({ file: c.rel, data: c.data })),
    serviceIndex,
  });
}

/** checkCatalog の結果を、ビルドのエラーと警告（"ファイル: メッセージ" の文字列）に分ける */
export function checkCatalogForBuild(parsed, serviceIndex) {
  const errors = [];
  const warnings = [];
  const hasCatalog = parsed.catalogEntries.length > 0 || parsed.catalogComparisons.length > 0;
  if (!serviceIndex) {
    if (hasCatalog) errors.push('services.json: 図鑑のファイルがありますが、サービス台帳（services.json）がありません');
    return { errors, warnings };
  }
  const model = modelOf(parsed, serviceIndex);
  const problems = checkCatalog(model, {
    serviceIndex,
    lessonIds: new Set(parsed.lessons.map((l) => l.data.id)),
    docIds: new Set(parsed.docs.map((d) => d.data.id)),
    questions: parsed.questions.map((q) => ({ file: q.rel, data: q.data })),
    markdown: [...parsed.lessons, ...parsed.docs].map((m) => ({ file: m.rel, text: m.body })),
    status: parsed.catalogStatusPresent ? parsed.catalogStatus : null,
    statusFile: 'catalog-status.json',
    needs: parsed.catalogNeeds ? { file: parsed.catalogNeeds.rel, data: parsed.catalogNeeds.data } : null,
    // today は渡さない（確認日の古さは validate・coverage の役目）
  });
  for (const p of problems) {
    const msg = `${p.file ?? 'catalog'}: ${p.message}`;
    // review-status-key は検査上はエラーだが、ビルドは止めない
    (ERROR_CODES.has(p.code) ? errors : warnings).push(msg);
  }
  if (parsed.catalogEntries.length > 0 && !parsed.catalogStatusPresent) {
    warnings.push('catalog-status.json: ファイルがないため、図鑑のすべての項目を未検証として扱います');
  }
  return { errors, warnings };
}

/**
 * 図鑑の出力を作る。serviceIndex がなければ（台帳なし）null。
 * ctx: canon（サービス名を正規名にそろえる）, practice（検証状態で絞り込んだ演習プールの問題）,
 *      lessons / docs / decks / glossary（出力用に整えたもの）, blueprint
 */
export function buildCatalogOutputs(parsed, serviceIndex, ctx) {
  if (!serviceIndex) return null;
  const { canon, practice, lessons, docs, decks, glossary, blueprint } = ctx;
  const model = modelOf(parsed, serviceIndex);
  const statusMap = parsed.catalogStatus;
  const summary = registrySummary(serviceIndex);
  const nameOf = (id) => serviceIndex.byId.get(id)?.name ?? id;

  // ---- 検証状態で絞る。needs-fix・rejected は出さない。内容が変わった項目は pending
  const visibleEntries = []; // { data, status, facts: [{fact, status}] }
  const visibleFactIds = new Set();
  const factTitle = new Map();
  for (const { data: e } of model.entryById.values()) {
    const st = effectiveStatus(statusMap, e.id, 'entry', e).status;
    if (HIDDEN.has(st)) continue;
    const facts = [];
    for (const f of e.facts) {
      const fs = effectiveStatus(statusMap, f.id, 'fact', f).status;
      if (HIDDEN.has(fs)) continue;
      facts.push({ fact: f, status: fs });
      visibleFactIds.add(f.id);
      factTitle.set(f.id, { title: f.title, entryId: e.id });
    }
    visibleEntries.push({ data: e, status: st, facts });
  }
  visibleEntries.sort((a, b) => cmp(a.data.id, b.data.id));
  const entryOf = new Map(visibleEntries.map((e) => [e.data.id, e]));

  const visibleComparisons = [];
  for (const { data: c } of model.comparisonById.values()) {
    const st = effectiveStatus(statusMap, c.id, 'comparison', c).status;
    if (HIDDEN.has(st)) continue;
    visibleComparisons.push({ data: c, status: st });
  }
  visibleComparisons.sort((a, b) => cmp(a.data.id, b.data.id));

  const keepFacts = (ids) => (ids ?? []).filter((id) => visibleFactIds.has(id));
  const withoutEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  // ---- エントリの詳細
  const entryFiles = [];
  for (const { data: e, status, facts } of visibleEntries) {
    const point = (p) => withoutEmpty({ text: p.text, factRefs: p.factRefs ? keepFacts(p.factRefs) : undefined, alternatives: p.alternatives });
    const seeAlso = keepFacts(e.seeAlso).map((id) => {
      const t = factTitle.get(id);
      return { id, title: t.title, entryId: t.entryId, entryName: nameOf(t.entryId) };
    });
    entryFiles.push({
      id: e.id,
      data: withoutEmpty({
        id: e.id,
        tier: e.tier,
        status,
        summary: e.summary,
        chooseWhen: e.chooseWhen?.map(point),
        avoidWhen: e.avoidWhen?.map(point),
        facts: facts.map(({ fact, status: s }) => ({ ...fact, services: fact.services ? canon(fact.services) : undefined, status: s })).map(withoutEmpty),
        seeAlso,
        lessonRefs: e.lessonRefs,
        docRefs: e.docRefs,
        references: e.references,
        createdBy: e.createdBy,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }),
    });
  }

  // ---- 比較（全体を 1 ファイル）
  const comparisons = visibleComparisons.map(({ data: c, status }) =>
    withoutEmpty({
      id: c.id,
      title: c.title,
      services: c.services,
      status,
      decide: c.decide,
      rows: c.rows?.map((r) => withoutEmpty({ axis: r.axis, values: r.values, factRefs: r.factRefs ? keepFacts(r.factRefs) : undefined })),
      docRef: c.docRef,
      sources: c.sources,
      checkedAt: c.checkedAt,
      createdBy: c.createdBy,
    }),
  );
  const comparisonsOf = new Map(); // エントリ id → 比較 id
  for (const c of comparisons) {
    for (const s of new Set(c.services.map((id) => entryIdFor(serviceIndex, id)))) {
      if (!comparisonsOf.has(s)) comparisonsOf.set(s, []);
      comparisonsOf.get(s).push(c.id);
    }
  }

  // ---- 関連する教材とタスク（サービス名 → エントリ id）
  const idOfName = (name) => entryIdForName(serviceIndex, serviceIndex.canonicalize(name));
  const idsOf = (names) => new Set(names.map(idOfName).filter(Boolean));
  const bucket = () => new Map();
  const push = (m, id, v) => {
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(v);
  };
  const lessonsOf = bucket();
  const docsOf = bucket();
  const glossaryCount = new Map();
  const cardCount = new Map();
  const questionCount = new Map();
  const tasksOf = bucket();
  for (const l of lessons) for (const id of idsOf(l.services)) push(lessonsOf, id, l.id);
  for (const d of docs) for (const id of idsOf(d.services)) push(docsOf, id, d.id);
  for (const g of glossary) for (const id of idsOf(g.services)) glossaryCount.set(id, (glossaryCount.get(id) ?? 0) + 1);
  for (const d of decks) for (const c of d.cards) for (const id of idsOf(c.services)) cardCount.set(id, (cardCount.get(id) ?? 0) + 1);
  for (const q of practice) {
    for (const id of idsOf(q.services)) {
      questionCount.set(id, (questionCount.get(id) ?? 0) + 1);
      push(tasksOf, id, q.taskStatement);
    }
  }
  if (blueprint) {
    for (const d of blueprint.domains) {
      for (const t of d.taskStatements) for (const id of idsOf(t.keyServices)) push(tasksOf, id, t.id);
    }
  }

  // ---- 一覧用の索引（台帳の全サービス。hostedBy の子は親の children に入れる）
  const children = new Map();
  for (const s of summary) {
    if (s.hostedBy === undefined) continue;
    push(children, s.hostedBy, { id: s.id, name: s.name, aliases: s.aliases });
  }
  const services = summary
    .filter((s) => s.hostedBy === undefined)
    .map((s) => {
      const ent = entryOf.get(s.id);
      const row = {
        id: s.id,
        name: s.name,
        ...(s.short !== undefined ? { short: s.short } : {}),
        aliases: s.aliases,
        category: s.category,
        children: children.get(s.id) ?? [],
      };
      if (ent) {
        row.tier = ent.data.tier;
        row.summary = ent.data.summary;
        row.status = ent.status;
      }
      row.facts = (ent?.facts ?? []).map(({ fact, status }) => ({
        id: fact.id,
        title: fact.title,
        kind: fact.kind,
        depth: fact.depth,
        tags: fact.tags ?? [],
        status,
      }));
      row.tasks = uniqSorted(tasksOf.get(s.id) ?? []);
      row.related = {
        lessons: lessonsOf.get(s.id) ?? [],
        docs: docsOf.get(s.id) ?? [],
        glossary: glossaryCount.get(s.id) ?? 0,
        flashcards: cardCount.get(s.id) ?? 0,
        questions: questionCount.get(s.id) ?? 0,
      };
      row.comparisons = comparisonsOf.get(s.id) ?? [];
      return row;
    });
  const index = {
    services,
    comparisons: comparisons.map((c) => ({ id: c.id, title: c.title, services: c.services, status: c.status })),
  };

  const allFacts = visibleEntries.flatMap((e) => e.facts);
  const counts = {
    catalogEntries: visibleEntries.length,
    catalogFacts: allFacts.length,
    comparisons: comparisons.length,
    catalogFactStatus: {
      verified: allFacts.filter((f) => f.status === 'verified').length,
      pending: allFacts.filter((f) => f.status === 'pending').length,
    },
  };
  return { index, entries: entryFiles, comparisons, counts };
}
