// コンテンツの読み込み・検証・分割出力。
// 検証に使うスキーマ（リポジトリ直下の scripts/lib/schema.mjs）は引数で受け取る。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

export const FORMAT = 'saa-dojo-content';
export const FORMAT_VERSION = 1;
export const HIDDEN_STATUSES = new Set(['needs-fix', 'rejected']);
const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);
// 本文中の問題 ID（レッスンの「確認問題」節など）
const QUESTION_ID_IN_TEXT = /saa-(?:basics|[1-4]\.[1-5])-[a-z][a-z0-9]{0,5}-\d{3}/g;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- ファイルの走査 ----------
export function walkFiles(dir, rel = '') {
  const out = [];
  const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
  entries.sort((a, b) => cmp(a.name, b.name));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkFiles(dir, r));
    else if (!IGNORED_FILES.has(e.name)) out.push(r);
  }
  return out;
}

export function readContentFiles(contentDir) {
  return walkFiles(contentDir).map((rel) => ({
    rel,
    text: fs.readFileSync(path.join(contentDir, ...rel.split('/')), 'utf8'),
  }));
}

// content/saa-c03 からの相対パスを種類に分類する。規則に合わなければ null。
export function classify(rel) {
  const p = rel.split('/');
  const n = p.length;
  const file = p[n - 1];
  const ext = path.posix.extname(file);
  const domainDir = /^d([1-4])$/.exec(p[1] ?? '');
  if (rel === 'blueprint.json') return { kind: 'blueprint' };
  if (rel === 'review-status.json') return { kind: 'review-status' };
  if (p[0] === 'questions' && ext === '.json') {
    if (n === 3 && p[1] === 'basics') return { kind: 'question' };
    if (n === 4 && domainDir && /^[1-4]\.[1-5]$/.test(p[2])) return { kind: 'question' };
  }
  if (p[0] === 'lessons' && ext === '.md' && n === 3 && (p[1] === 'basics' || domainDir)) return { kind: 'lesson' };
  if (p[0] === 'flashcards' && n === 2 && ext === '.json') return { kind: 'deck' };
  if (p[0] === 'glossary' && n === 2 && ext === '.json') return { kind: 'glossary' };
  if (p[0] === 'cheatsheets' && n === 2 && ext === '.md') return { kind: 'doc', docKind: 'cheatsheet' };
  if (p[0] === 'guides' && n === 2 && ext === '.md') return { kind: 'doc', docKind: 'guide' };
  return null;
}

export function parseFrontMatter(text) {
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { error: '先頭に YAML front matter がありません' };
  const doc = YAML.parseDocument(m[1] ?? '');
  if (doc.errors.length > 0) return { error: `front matter の YAML が不正です: ${doc.errors[0].message.split('\n')[0]}` };
  const data = doc.toJS();
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'front matter がキーと値の組になっていません' };
  }
  return { data, body: text.slice(m[0].length) };
}

function zodMessages(error) {
  return error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(全体)'}: ${i.message}`);
}

// ---------- 読み込みと検証 ----------
export function parseContent(files, schema) {
  const errors = [];
  const warnings = [];
  const err = (rel, msg) => errors.push(`${rel}: ${msg}`);
  const warn = (rel, msg) => warnings.push(`${rel}: ${msg}`);
  const parsed = {
    blueprint: null,
    questions: [],
    lessons: [],
    docs: [],
    decks: [],
    glossaries: [],
    reviewStatus: {},
    reviewStatusPresent: false,
  };

  const validate = (s, value, rel) => {
    const r = s.safeParse(value);
    if (r.success) return r.data;
    for (const m of zodMessages(r.error).slice(0, 10)) err(rel, m);
    return null;
  };
  const normalize = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  const json = (rel, text) => {
    try {
      return { value: JSON.parse(text) };
    } catch (e) {
      err(rel, `JSON として読めません: ${e.message}`);
      return null;
    }
  };
  const markdown = (rel, text) => {
    const fm = parseFrontMatter(text);
    if (fm.error) {
      err(rel, fm.error);
      return null;
    }
    return fm;
  };

  const sorted = [...files].sort((a, b) => cmp(a.rel, b.rel));
  for (const { rel, text: raw } of sorted) {
    const cls = classify(rel);
    if (!cls) {
      warn(rel, '配置の規則に合わないファイルのため読み飛ばしました');
      continue;
    }
    const text = normalize(raw);
    switch (cls.kind) {
      case 'blueprint': {
        const j = json(rel, text);
        if (j) parsed.blueprint = validate(schema.BlueprintSchema, j.value, rel);
        break;
      }
      case 'review-status': {
        parsed.reviewStatusPresent = true;
        const j = json(rel, text);
        const data = j && validate(schema.ReviewStatusSchema, j.value, rel);
        if (data) parsed.reviewStatus = data;
        break;
      }
      case 'question': {
        const j = json(rel, text);
        const data = j && validate(schema.QuestionSchema, j.value, rel);
        if (data) parsed.questions.push({ rel, data });
        break;
      }
      case 'lesson': {
        const fm = markdown(rel, text);
        const data = fm && validate(schema.LessonFrontSchema, fm.data, rel);
        if (data) parsed.lessons.push({ rel, data, body: fm.body });
        break;
      }
      case 'doc': {
        const fm = markdown(rel, text);
        const data = fm && validate(schema.DocFrontSchema, fm.data, rel);
        if (data) parsed.docs.push({ rel, data, body: fm.body, docKind: cls.docKind });
        break;
      }
      case 'deck': {
        const j = json(rel, text);
        const data = j && validate(schema.FlashcardDeckSchema, j.value, rel);
        if (data) parsed.decks.push({ rel, data });
        break;
      }
      case 'glossary': {
        const j = json(rel, text);
        const data = j && validate(schema.GlossaryFileSchema, j.value, rel);
        if (data) parsed.glossaries.push({ rel, data });
        break;
      }
      default:
        break;
    }
  }
  if (!files.some((f) => f.rel === 'blueprint.json')) err('blueprint.json', 'ファイルがありません');
  if (!parsed.reviewStatusPresent) warn('review-status.json', 'ファイルがないため、すべての問題を未検証として扱います');

  crossCheck(parsed, err, warn);
  return { ...parsed, errors, warnings };
}

// ファイルをまたぐ整合性（アプリが壊れるものはエラー、それ以外は警告）
function crossCheck(parsed, err, warn) {
  const seen = new Map();
  const claim = (id, rel) => {
    if (seen.has(id)) err(rel, `id ${id} が ${seen.get(id)} と重複しています`);
    else seen.set(id, rel);
  };
  for (const q of parsed.questions) claim(q.data.id, q.rel);
  for (const l of parsed.lessons) claim(l.data.id, l.rel);
  for (const d of parsed.docs) claim(d.data.id, d.rel);
  for (const d of parsed.decks) {
    claim(`deck:${d.data.deck}`, d.rel);
    for (const c of d.data.cards) claim(c.id, d.rel);
  }

  const bp = parsed.blueprint;
  if (!bp) return;
  const taskIds = new Set(['basics']);
  const itemIds = new Set(bp.basics.items.map((i) => i.id));
  for (const d of bp.domains) {
    for (const t of d.taskStatements) {
      taskIds.add(t.id);
      for (const i of t.items) itemIds.add(i.id);
    }
  }
  for (const { rel, data: q } of parsed.questions) {
    if (!taskIds.has(q.taskStatement)) err(rel, `taskStatement ${q.taskStatement} が blueprint にありません`);
    const bad = q.knowledgeRefs.filter((r) => !itemIds.has(r));
    if (bad.length) err(rel, `knowledgeRefs が blueprint にありません: ${bad.join(', ')}`);
  }
  for (const { rel, data: l } of parsed.lessons) {
    if (!taskIds.has(l.taskStatement)) err(rel, `taskStatement ${l.taskStatement} が blueprint にありません`);
  }
  const lessonIds = new Set(parsed.lessons.map((l) => l.data.id));
  for (const { rel, data: q } of parsed.questions) {
    const missing = q.lessonRefs.filter((r) => !lessonIds.has(r));
    if (missing.length) warn(rel, `lessonRefs のレッスンがまだありません: ${missing.join(', ')}`);
  }
  const questionIds = new Set(parsed.questions.map((q) => q.data.id));
  const unknown = Object.keys(parsed.reviewStatus).filter((id) => !questionIds.has(id));
  if (unknown.length) warn('review-status.json', `存在しない問題の記録があります: ${unknown.slice(0, 5).join(', ')}`);
}

// ---------- 出力の組み立て ----------
export function hashOf(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function blueprintSummary(bp, schema) {
  return {
    exam: bp.exam,
    checkedAt: bp.checkedAt,
    domains: bp.domains.map((d) => ({
      id: d.id,
      nameJa: d.nameJa,
      nameEn: d.nameEn,
      weightPercent: d.weightPercent,
      tasks: d.taskStatements.map((t) => ({
        id: t.id,
        domain: d.id,
        titleJa: t.titleJa,
        titleEn: t.titleEn,
        items: t.items,
        keyServices: t.keyServices,
      })),
    })),
    basics: { titleJa: bp.basics.titleJa, items: bp.basics.items },
    services: bp.services.inScope,
    mockComposition: schema.MOCK_COMPOSITION,
    qualifiers: schema.QUALIFIERS,
  };
}

const questionMeta = (q) => ({
  id: q.id,
  domain: q.domain,
  taskStatement: q.taskStatement,
  knowledgeRefs: q.knowledgeRefs,
  services: q.services,
  qualifier: q.qualifier,
  difficulty: q.difficulty,
  type: q.type,
  pool: q.pool,
  status: q.status,
  lessonRefs: q.lessonRefs,
  needsSourceCheck: q.needsSourceCheck,
});

export function buildOutputs(parsed, schema) {
  const statusOf = (id) => parsed.reviewStatus[id]?.status ?? 'pending';
  const excluded = { 'needs-fix': 0, rejected: 0 };
  const questions = [];
  for (const { data } of parsed.questions) {
    const status = statusOf(data.id);
    if (HIDDEN_STATUSES.has(status)) {
      excluded[status]++;
      continue;
    }
    questions.push({ ...data, status });
  }
  questions.sort((a, b) => cmp(a.id, b.id));
  const byPool = (pool) => questions.filter((q) => q.pool === pool);
  const practice = byPool('practice');
  const visible = new Map(questions.map((q) => [q.id, q]));

  const lessons = [...parsed.lessons].sort(
    (a, b) =>
      a.data.domain - b.data.domain ||
      cmp(a.data.taskStatement, b.data.taskStatement) ||
      a.data.order - b.data.order ||
      cmp(a.data.id, b.data.id),
  );
  // レッスンの確認問題: lessonRefs で参照している問題と、本文で ID を挙げている問題（保留模試は除く）
  const lessonQuestions = (id, body) => {
    const ids = new Set(questions.filter((q) => q.lessonRefs.includes(id)).map((q) => q.id));
    for (const m of body.matchAll(QUESTION_ID_IN_TEXT)) if (visible.has(m[0])) ids.add(m[0]);
    return [...ids].filter((qid) => {
      const pool = visible.get(qid)?.pool;
      return pool === 'practice' || pool === 'basics';
    }).sort();
  };

  const files = [];
  const add = (key, name, data) => files.push({ key, name, data });

  add('blueprint', 'blueprint', parsed.blueprint ? blueprintSummary(parsed.blueprint, schema) : null);
  add('index', 'question-index', questions.map(questionMeta));
  for (const d of [1, 2, 3, 4]) add(`practice-d${d}`, `practice-d${d}`, practice.filter((q) => q.domain === d));
  add('basics', 'basics-questions', byPool('basics'));
  add('mock-a', 'mock-a', byPool('mockA'));
  add('mock-b', 'mock-b', byPool('mockB'));
  add(
    'lessons',
    'lessons',
    lessons.map(({ data, body }) => ({
      id: data.id,
      title: data.title,
      domain: data.domain,
      taskStatement: data.taskStatement,
      order: data.order,
      knowledgeRefs: data.knowledgeRefs,
      services: data.services,
      estimatedMinutes: data.estimatedMinutes,
      questionIds: lessonQuestions(data.id, body),
    })),
  );
  for (const { data, body } of lessons) add(`lesson:${data.id}`, `lessons/${data.id}`, { id: data.id, body });
  const decks = [...parsed.decks].map((d) => d.data).sort((a, b) => cmp(a.deck, b.deck));
  add('flashcards', 'flashcards', decks);
  const glossary = parsed.glossaries
    .flatMap((g) => g.data.entries)
    .sort((a, b) => a.term.localeCompare(b.term, 'ja') || cmp(a.en, b.en));
  add('glossary', 'glossary', glossary);
  const docs = [...parsed.docs]
    .map(({ data, body, docKind }) => ({ ...data, kind: docKind, body }))
    .sort((a, b) => cmp(a.kind, b.kind) || a.order - b.order || cmp(a.id, b.id));
  add('docs', 'docs', docs);

  const out = [];
  const manifestFiles = {};
  for (const f of files) {
    const text = JSON.stringify(f.data);
    const hash = hashOf(text);
    const rel = `${f.name}.${hash}.json`;
    manifestFiles[f.key] = { path: rel, hash, bytes: Buffer.byteLength(text) };
    out.push({ rel, text });
  }
  const contentHash = hashOf(
    Object.keys(manifestFiles)
      .sort()
      .map((k) => `${k}:${manifestFiles[k].hash}`)
      .join('\n'),
  );
  const count = (pool) => byPool(pool).length;
  const manifest = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exam: schema.EXAM,
    contentHash,
    counts: {
      questions: { practice: count('practice'), basics: count('basics'), mockA: count('mockA'), mockB: count('mockB') },
      verified: questions.filter((q) => q.status === 'verified').length,
      pending: questions.filter((q) => q.status === 'pending').length,
      excluded,
      lessons: lessons.filter((l) => l.data.domain !== 0).length,
      basicsLessons: lessons.filter((l) => l.data.domain === 0).length,
      decks: decks.length,
      flashcards: decks.reduce((n, d) => n + d.cards.length, 0),
      glossary: glossary.length,
      cheatsheets: docs.filter((d) => d.kind === 'cheatsheet').length,
      guides: docs.filter((d) => d.kind === 'guide').length,
    },
    files: manifestFiles,
  };
  out.push({ rel: 'manifest.json', text: JSON.stringify(manifest, null, 2) });
  return { files: out, manifest };
}

// ---------- 書き出し ----------
// 以前の出力を消してから書く。見知らぬ内容のディレクトリは消さない。
export function writeOutputs(outDir, built) {
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir);
    const manifestPath = path.join(outDir, 'manifest.json');
    let ours = entries.length === 0;
    if (!ours && fs.existsSync(manifestPath)) {
      try {
        ours = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).format === FORMAT;
      } catch {
        ours = false;
      }
    }
    if (!ours) throw new Error(`${outDir} はコンテンツの出力先ではないようです（manifest.json がありません）。中身を確認してください`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  for (const f of built.files) {
    const target = path.join(outDir, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.text);
  }
}

export function buildContent({ contentDir, outDir, schema }) {
  const parsed = parseContent(readContentFiles(contentDir), schema);
  if (parsed.errors.length > 0 || !parsed.blueprint) {
    return { ok: false, errors: parsed.errors, warnings: parsed.warnings, manifest: null };
  }
  const built = buildOutputs(parsed, schema);
  writeOutputs(outDir, built);
  return { ok: true, errors: [], warnings: parsed.warnings, manifest: built.manifest };
}
