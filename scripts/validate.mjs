#!/usr/bin/env node
// content/saa-c03 配下のコンテンツを検証する。
//   node scripts/validate.mjs [--quiet] [--json] [--all] [--root <dir>]
//     --quiet  件数と結果だけを表示する
//     --json   結果を JSON で標準出力に出す（他の出力はしない）
//     --all    警告・エラーを省略せずにすべて表示する
//     --root   リポジトリのルート（既定: このファイルの親ディレクトリ）
// エラーがあれば終了コード 1、警告だけなら 0。
// coverage.mjs が読み込み処理を共有するため、読み込み・検査の関数を export している。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  CONTENT_ROOT,
  QUESTION_ID,
  BlueprintSchema,
  QuestionSchema,
  LessonFrontSchema,
  DocFrontSchema,
  FlashcardDeckSchema,
  GlossaryFileSchema,
  ReviewStatusSchema,
  ServiceRegistrySchema,
} from './lib/schema.mjs';
import { buildServiceIndex, normName } from './lib/service-registry.mjs';

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 閾値 ----------
const STEM_MIN = 150;
const STEM_MAX = 350;
const LESSON_BODY_MIN = 200;
const DOC_BODY_MIN = 100;
const NEAR_DUPLICATE_THRESHOLD = 0.6; // 文字 3-gram の Jaccard 係数
const LONGEST_CORRECT_LIMIT = 0.4; // 択一問題で正解が最長になる割合の上限
const SMALL_SAMPLE = 20; // これ未満は参考値と注記する
const MAX_SCHEMA_ISSUES_PER_FILE = 12;
const MAX_LINES_PER_GROUP = 20;
const MAX_ERROR_LINES = 200;
const IGNORED_FILES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db']);
export const HIDDEN_STATUSES = new Set(['needs-fix', 'rejected']);

// ---------- 小物 ----------
const chars = (s) => Array.from(s).length;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = (arr) => [...new Set(arr)];
const clip = (s, n = 60) => {
  const a = Array.from(String(s));
  return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join('');
};
const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);

// ---------- 指摘の蓄積 ----------
const label = (rel) => (rel ? `${CONTENT_ROOT}/${rel}` : CONTENT_ROOT);

class Reporter {
  constructor() {
    this.issues = [];
  }
  error(code, rel, message, extra = {}) {
    this.issues.push({ level: 'error', code, file: label(rel), message, ...extra });
  }
  // strong: 特に注意が必要な警告
  warn(code, rel, message, extra = {}) {
    this.issues.push({ level: 'warning', code, file: label(rel), message, ...extra });
  }
}

// ---------- ファイルの走査と分類 ----------
function walk(dir, rel = '') {
  const out = [];
  const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
  entries.sort((a, b) => cmp(a.name, b.name));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else if (!IGNORED_FILES.has(e.name)) out.push(r);
  }
  return out;
}

// content/saa-c03 からの相対パス（/ 区切り）を種類に分類する。規則に合わなければ null。
function classify(rel) {
  const p = rel.split('/');
  const n = p.length;
  const ext = path.posix.extname(p[n - 1]);
  const stem = p[n - 1].slice(0, p[n - 1].length - ext.length);
  const domainDir = /^d([1-4])$/.exec(p[1] ?? '');

  if (rel === 'blueprint.json') return { kind: 'blueprint' };
  if (rel === 'services.json') return { kind: 'registry' };
  if (rel === 'review-status.json') return { kind: 'review-status' };
  if (p[0] === 'questions' && ext === '.json') {
    if (n === 3 && p[1] === 'basics') return { kind: 'question', dirTask: 'basics', stem };
    if (n === 4 && domainDir && /^[1-4]\.[1-5]$/.test(p[2]) && p[2][0] === domainDir[1]) {
      return { kind: 'question', dirTask: p[2], stem };
    }
  }
  if (p[0] === 'lessons' && ext === '.md' && n === 3) {
    if (p[1] === 'basics') return { kind: 'lesson', dirDomain: 0, stem };
    if (domainDir) return { kind: 'lesson', dirDomain: Number(domainDir[1]), stem };
  }
  if (p[0] === 'flashcards' && n === 2 && ext === '.json') return { kind: 'deck', stem };
  if (p[0] === 'glossary' && n === 2 && ext === '.json') return { kind: 'glossary', stem };
  if (p[0] === 'cheatsheets' && n === 2 && ext === '.md') return { kind: 'doc', docKind: 'cheatsheet', stem };
  if (p[0] === 'guides' && n === 2 && ext === '.md') return { kind: 'doc', docKind: 'guide', stem };
  return null;
}

export const LAYOUT_HELP = [
  '許可する配置（content/saa-c03 からの相対パス）:',
  '  blueprint.json / services.json / review-status.json',
  '  questions/d<1-4>/<タスク>/<id>.json   questions/basics/<id>.json',
  '  lessons/d<1-4>/<id>.md   lessons/basics/<id>.md',
  '  flashcards/<デッキ>.json   glossary/<名前>.json',
  '  cheatsheets/<id>.md   guides/<id>.md',
];

// ---------- 読み込み（文字コード・JSON・front matter） ----------
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

function jsonErrorMessage(e, text) {
  let msg = e.message;
  const m = /position (\d+)/.exec(msg);
  if (m && !/line \d+/.test(msg)) {
    const before = text.slice(0, Number(m[1]));
    const line = before.split('\n').length;
    const col = Number(m[1]) - before.lastIndexOf('\n');
    msg += `（${line} 行目 ${col} 列目）`;
  }
  return msg;
}

function parseFrontMatter(text) {
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { error: '先頭に YAML front matter（--- で囲んだ部分）がありません' };
  // 先頭に空行を足し、YAML の行番号をファイル上の行番号に合わせる
  const doc = YAML.parseDocument(`\n${m[1] ?? ''}`);
  if (doc.errors.length > 0) {
    return { error: `front matter の YAML が不正です: ${doc.errors[0].message.split('\n')[0]}` };
  }
  const data = doc.toJS();
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'front matter がキーと値の組（マッピング）になっていません' };
  }
  return { data, body: text.slice(m[0].length) };
}

// ---------- zod の指摘を日本語 1 行にする ----------
function getAt(obj, pathArr) {
  let cur = obj;
  for (const k of pathArr) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}
const fmtPath = (pathArr) =>
  pathArr.reduce((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : String(k)), '');
const lengthOf = (v) => (typeof v === 'string' ? chars(v) : Array.isArray(v) ? v.length : undefined);
const show = (v) => clip(JSON.stringify(v) ?? String(v), 50);

export function formatZodIssue(issue, raw) {
  const where = fmtPath(issue.path) || '(全体)';
  const val = getAt(raw, issue.path);
  let msg;
  switch (issue.code) {
    case 'invalid_type':
      msg =
        issue.received === 'undefined'
          ? '必須項目がありません'
          : `型が違います（期待: ${issue.expected}、実際: ${issue.received}）`;
      break;
    case 'too_small':
    case 'too_big': {
      const small = issue.code === 'too_small';
      const bound = small ? issue.minimum : issue.maximum;
      const unit = issue.type === 'string' ? '文字' : issue.type === 'array' ? '個' : '';
      const incl = issue.inclusive === false ? (small ? 'より大きい値' : '未満') : small ? '以上' : '以下';
      const what = issue.exact ? `ちょうど ${bound}${unit}` : `${bound}${unit}${incl}`;
      const cur = lengthOf(val) ?? (typeof val === 'number' ? val : undefined);
      msg = `${what}にしてください${cur !== undefined ? `（現在 ${cur}${unit}）` : ''}`;
      break;
    }
    case 'invalid_string':
      msg =
        issue.validation === 'url'
          ? `URL の形式が正しくありません（値: ${show(val)}）`
          : `形式が違います（値: ${show(val)}）`;
      break;
    case 'invalid_enum_value':
      msg = `次のいずれかにしてください: ${issue.options.join(' / ')}（値: ${show(val)}）`;
      break;
    case 'invalid_literal':
      msg = `${show(issue.expected)} にしてください（値: ${show(val)}）`;
      break;
    case 'unrecognized_keys':
      msg = `定義にないキーがあります: ${issue.keys.join(', ')}`;
      break;
    case 'invalid_union': {
      const lits = (issue.unionErrors ?? [])
        .flatMap((e) => e.issues)
        .filter((i) => i.code === 'invalid_literal')
        .map((i) => show(i.expected));
      msg = lits.length ? `次のいずれかにしてください: ${lits.join(' / ')}（値: ${show(val)}）` : '許可された型のどれにも合いません';
      break;
    }
    case 'custom':
      msg = issue.message + (issue.path.length && typeof val === 'string' ? `（値: ${show(val)}）` : '');
      break;
    default:
      msg = issue.message;
  }
  return `${where}: ${msg}`;
}

// ---------- blueprint の索引 ----------
export function buildBlueprintIndex(blueprint) {
  const tasks = [];
  const taskById = new Map();
  const itemById = new Map();
  const addTask = (task) => {
    tasks.push(task);
    taskById.set(task.id, task);
    for (const item of task.items) itemById.set(item.id, { ...item, task: task.id });
  };
  addTask({ id: 'basics', domain: 0, titleJa: blueprint.basics.titleJa, items: blueprint.basics.items, keyServices: [] });
  for (const d of blueprint.domains) {
    for (const t of d.taskStatements) {
      addTask({ id: t.id, domain: d.id, titleJa: t.titleJa, items: t.items, keyServices: t.keyServices });
    }
  }
  return {
    domains: blueprint.domains.map((d) => ({ id: d.id, nameJa: d.nameJa, weightPercent: d.weightPercent })),
    tasks,
    taskById,
    itemById,
    taskIds: new Set(taskById.keys()),
    itemIds: new Set(itemById.keys()),
  };
}

// ---------- サービス名の照合 ----------
// 照合の本体は scripts/lib/service-registry.mjs にある。coverage.mjs などが validate.mjs から読み込むため、ここからも export する。
export { KEY_SERVICE_CATEGORY, buildServiceIndex, serviceNameForms, textMatcher } from './lib/service-registry.mjs';

// ---------- 読み込み ----------
export function statusOf(content, id) {
  return content.reviewStatus.data?.[id]?.status ?? 'pending';
}

export function loadContent({ root = DEFAULT_ROOT } = {}) {
  const contentDir = path.join(root, ...CONTENT_ROOT.split('/'));
  const report = new Reporter();
  const content = {
    root,
    contentDir,
    report,
    issues: report.issues,
    blueprint: null,
    bpIndex: null,
    serviceIndex: null,
    registry: { present: false, data: null }, // サービス台帳（services.json）
    serviceAliasUses: new Map(), // 別名の表記 → { canonical, files: Set }（services 欄の表記ゆれを集約して報告する）
    questions: [], // { rel, data }（スキーマに通ったものだけ）
    lessons: [], // { rel, data, body }
    docs: [], // { rel, data, body, docKind }
    decks: [], // { rel, data }
    glossaries: [], // { rel, data }
    reviewStatus: { present: false, data: null },
    ids: new Map(), // id -> [{ type, rel }]（スキーマ不適合のファイルも含む）
    counts: { questionFiles: 0, lessonFiles: 0, cheatsheetFiles: 0, guideFiles: 0, deckFiles: 0, glossaryFiles: 0 },
  };

  if (!fs.existsSync(contentDir) || !fs.statSync(contentDir).isDirectory()) {
    report.error('blueprint-missing', '', `${CONTENT_ROOT} ディレクトリがありません`);
    return content;
  }

  const registerId = (id, type, rel) => {
    if (typeof id !== 'string') return;
    if (!content.ids.has(id)) content.ids.set(id, []);
    content.ids.get(id).push({ type, rel });
  };

  function readText(rel) {
    try {
      let text = UTF8.decode(fs.readFileSync(path.join(contentDir, ...rel.split('/'))));
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
        report.warn('bom', rel, 'BOM 付きの UTF-8 です。BOM なしで保存してください');
      }
      if (text.includes(REPLACEMENT_CHAR)) report.error('encoding', rel, '置換文字（U+FFFD）が含まれています。文字化けしていないか確認してください');
      return text.replace(/\r\n?/g, '\n');
    } catch (e) {
      if (e.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') {
        report.error('encoding', rel, 'UTF-8 として読めない文字があります（UTF-8 で保存し直してください）');
      } else {
        report.error('read-failed', rel, `読み込みに失敗しました: ${e.message}`);
      }
      return null;
    }
  }

  function readJson(rel) {
    const text = readText(rel);
    if (text === null) return null;
    try {
      return { value: JSON.parse(text) };
    } catch (e) {
      report.error('parse', rel, `JSON として読めません: ${jsonErrorMessage(e, text)}`);
      return null;
    }
  }

  function readMarkdown(rel) {
    const text = readText(rel);
    if (text === null) return null;
    const fm = parseFrontMatter(text);
    if (fm.error) {
      report.error('parse', rel, fm.error);
      return null;
    }
    return fm;
  }

  function validateWith(schema, value, rel) {
    let result;
    try {
      result = schema.safeParse(value);
    } catch (e) {
      report.error('schema', rel, `スキーマ検証中に例外が起きました: ${e.message}`);
      return null;
    }
    if (result.success) return result.data;
    const messages = uniq(result.error.issues.map((i) => formatZodIssue(i, value)));
    for (const msg of messages.slice(0, MAX_SCHEMA_ISSUES_PER_FILE)) report.error('schema', rel, msg);
    if (messages.length > MAX_SCHEMA_ISSUES_PER_FILE) {
      report.error('schema', rel, `ほか ${messages.length - MAX_SCHEMA_ISSUES_PER_FILE} 件のスキーマ違反があります`);
    }
    return null;
  }

  const files = walk(contentDir);

  // blueprint とサービス台帳を最初に読む（他の検査が参照する）
  if (files.includes('services.json')) {
    content.registry.present = true;
    const j = readJson('services.json');
    content.registry.data = j && validateWith(ServiceRegistrySchema, j.value, 'services.json');
  }
  if (files.includes('blueprint.json')) {
    const j = readJson('blueprint.json');
    const bp = j && validateWith(BlueprintSchema, j.value, 'blueprint.json');
    if (bp) {
      content.blueprint = bp;
      content.bpIndex = buildBlueprintIndex(bp);
      content.serviceIndex = buildServiceIndex(bp, content.registry.data);
    }
  } else {
    report.error('blueprint-missing', 'blueprint.json', 'blueprint.json がありません');
  }

  for (const rel of files) {
    const cls = classify(rel);
    if (!cls) {
      report.error('unexpected-file', rel, '配置の規則に合わない場所・拡張子のファイルです');
      continue;
    }
    switch (cls.kind) {
      case 'question': {
        content.counts.questionFiles++;
        const j = readJson(rel);
        if (!j) break;
        const raw = j.value;
        const data = validateWith(QuestionSchema, raw, rel);
        registerId(raw?.id, 'question', rel);
        checkQuestionPlacement(report, rel, cls, raw);
        if (data) content.questions.push({ rel, data });
        break;
      }
      case 'lesson': {
        content.counts.lessonFiles++;
        const fm = readMarkdown(rel);
        if (!fm) break;
        const data = validateWith(LessonFrontSchema, fm.data, rel);
        registerId(fm.data?.id, 'lesson', rel);
        checkLessonPlacement(report, rel, cls, fm.data);
        if (data) content.lessons.push({ rel, data, body: fm.body });
        break;
      }
      case 'doc': {
        content.counts[`${cls.docKind}Files`]++;
        const fm = readMarkdown(rel);
        if (!fm) break;
        const data = validateWith(DocFrontSchema, fm.data, rel);
        registerId(fm.data?.id, 'doc', rel);
        checkDocPlacement(report, rel, cls, fm.data);
        if (data) content.docs.push({ rel, data, body: fm.body, docKind: cls.docKind });
        break;
      }
      case 'deck': {
        content.counts.deckFiles++;
        const j = readJson(rel);
        if (!j) break;
        const data = validateWith(FlashcardDeckSchema, j.value, rel);
        for (const card of Array.isArray(j.value?.cards) ? j.value.cards : []) registerId(card?.id, 'flashcard', rel);
        if (typeof j.value?.deck === 'string' && j.value.deck !== cls.stem) {
          report.error('path-mismatch', rel, `ファイル名（${cls.stem}.json）と deck（${j.value.deck}）が違います`);
        }
        if (data) content.decks.push({ rel, data });
        break;
      }
      case 'glossary': {
        content.counts.glossaryFiles++;
        const j = readJson(rel);
        if (!j) break;
        const data = validateWith(GlossaryFileSchema, j.value, rel);
        if (data) content.glossaries.push({ rel, data });
        break;
      }
      case 'review-status': {
        content.reviewStatus.present = true;
        const j = readJson(rel);
        if (j) content.reviewStatus.data = validateWith(ReviewStatusSchema, j.value, rel);
        break;
      }
      default:
        break;
    }
  }
  return content;
}

// ---------- 配置と id の整合 ----------
function checkQuestionPlacement(report, rel, cls, raw) {
  const id = raw?.id;
  if (typeof id !== 'string') return;
  if (cls.stem !== id) report.error('path-mismatch', rel, `ファイル名と id が違います（ファイル名: ${cls.stem}.json、id: ${id}）`);
  const m = QUESTION_ID.exec(id);
  const others = [];
  if (m && m[1] !== cls.dirTask) others.push(`id のタスク（${m[1]}）`);
  if (typeof raw.taskStatement === 'string' && raw.taskStatement !== cls.dirTask) others.push(`taskStatement（${raw.taskStatement}）`);
  if (others.length) report.error('path-mismatch', rel, `置き場所のタスク（${cls.dirTask}）が${others.join('・')}と違います`);
}

function checkLessonPlacement(report, rel, cls, raw) {
  const id = raw?.id;
  if (typeof id !== 'string') return;
  if (cls.stem !== id) report.error('path-mismatch', rel, `ファイル名と id が違います（ファイル名: ${cls.stem}.md、id: ${id}）`);
  const m = /^lesson-(basics|[1-4]\.[1-5])-/.exec(id);
  if (m && typeof raw.taskStatement === 'string' && m[1] !== raw.taskStatement) {
    report.error('path-mismatch', rel, `id のタスク（${m[1]}）と taskStatement（${raw.taskStatement}）が違います`);
  }
  if (typeof raw.domain === 'number' && raw.domain !== cls.dirDomain) {
    const dir = cls.dirDomain === 0 ? 'basics' : `d${cls.dirDomain}`;
    report.error('path-mismatch', rel, `置き場所（lessons/${dir}）と domain（${raw.domain}）が違います`);
  }
}

function checkDocPlacement(report, rel, cls, raw) {
  const id = raw?.id;
  if (typeof id !== 'string') return;
  if (cls.stem !== id) report.error('path-mismatch', rel, `ファイル名と id が違います（ファイル名: ${cls.stem}.md、id: ${id}）`);
  if (!id.startsWith(`${cls.docKind}-`)) {
    report.error('path-mismatch', rel, `${cls.docKind === 'guide' ? 'guides' : 'cheatsheets'} 配下の id は ${cls.docKind}- で始めてください（id: ${id}）`);
  }
}

// ---------- 意味の検査 ----------
// 他の選択肢を記号で指している表現（選択肢をシャッフルすると意味が変わる）
const LETTER_REF_PATTERNS = [
  /選択肢\s*[A-Fa-fＡ-Ｆａ-ｆ1-6１-６]/,
  /[（(]\s*[A-FＡ-Ｆa-fａ-ｆ]\s*[）)]/,
  /(?<![A-Za-z0-9_-])[A-FＡ-Ｆ]\s*(?:と|、|，|,|および|及び|または|又は|か|や)\s*[A-FＡ-Ｆ](?![A-Za-z0-9_-])/,
];
// 選択肢の本文が他の選択肢との位置関係に依存する表現
const POSITION_REF_PATTERN = /上記|下記|前者|後者|前述|上述|左記|右記|選択肢|(?:いずれ|どれ|すべて|全て)も?(?:正しい|正しくない|誤り|誤っている|間違い)/;

const OPTION_TEXT_PATTERNS = [...LETTER_REF_PATTERNS, POSITION_REF_PATTERN];

function findRefs(text, where, patterns, hits) {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      hits.push(`${where}「${m[0]}」`);
      return;
    }
  }
}

function checkServiceNames(content, rel, names, where) {
  const { report, serviceIndex } = content;
  if (!serviceIndex || names.length === 0) return;
  const alias = [];
  const out = [];
  const unknown = [];
  const unknownNames = [];
  for (const name of uniq(names)) {
    const r = serviceIndex.resolve(name);
    if (r.kind === 'in') {
      if (r.exact) continue;
      if (serviceIndex.hasRegistry) {
        // 台帳があるときは、ファイルごとではなく「表記 → 正規名」ごとに集約して最後に報告する
        const uses = content.serviceAliasUses;
        if (!uses.has(name)) uses.set(name, { canonical: r.canonical, declared: Boolean(r.declared), files: new Set() });
        uses.get(name).files.add(rel);
      } else {
        alias.push(`${name} → ${r.canonical}`);
      }
    } else if (r.kind === 'out') {
      out.push(name);
    } else {
      unknownNames.push(name);
      unknown.push(r.suggestions.length ? `${name}（候補: ${r.suggestions.join(' / ')}）` : name);
    }
  }
  if (out.length) {
    report.warn('service-out-of-scope', rel, `${where} に試験範囲外のサービスがあります: ${out.join(', ')}`, { strong: true });
  }
  if (unknown.length) {
    report.warn('service-unlisted', rel, `${where} に blueprint の対象サービスにない名前があります: ${unknown.join(', ')}`, {
      names: unknownNames,
    });
  }
  if (alias.length) {
    report.warn('service-alias', rel, `${where} の表記を blueprint に合わせてください: ${alias.join(', ')}`);
  }
}

// services 欄の別名の表記を「表記 → 正規名（ファイル数）」の 1 行ずつにまとめて報告する
function reportServiceAliases(content) {
  const { report } = content;
  const rows = [...content.serviceAliasUses].sort((a, b) => b[1].files.size - a[1].files.size || cmp(a[0], b[0]));
  for (const [name, u] of rows) {
    const where = u.declared ? '台帳の別名' : '別表記';
    report.warn('service-alias', '', `services の「${name}」（${where}）は正規名「${u.canonical}」で書いてください（${u.files.size} ファイル）`, {
      files: [...u.files].sort().map(label),
    });
  }
}

function checkRegistry(content) {
  const { report, registry, serviceIndex } = content;
  if (!registry.present) {
    report.warn('registry-missing', 'services.json', 'サービス台帳がないため、blueprint の表記をそれぞれ別のサービスとして扱います');
    return;
  }
  if (!serviceIndex?.hasRegistry) return; // 台帳を読めなかった（スキーマ違反などは読み込み時に報告済み）
  for (const msg of serviceIndex.problems) report.error('registry', 'services.json', msg);
  const extra = serviceIndex.inScope.filter((n) => serviceIndex.source.get(n) === 'registry');
  if (extra.length) {
    report.warn('registry', 'services.json', `blueprint にないサービスが台帳にあります: ${extra.join(', ')}`, { strong: true });
  }
}

function checkTaskIds(content, rel, ids, where) {
  const { report, bpIndex } = content;
  if (!bpIndex) return;
  const bad = uniq(ids.filter((t) => !bpIndex.taskIds.has(t)));
  if (bad.length) report.error('unknown-task', rel, `${where} が blueprint にないタスクです: ${bad.join(', ')}`);
}

function checkBlueprint(content) {
  const { report, blueprint } = content;
  const rel = 'blueprint.json';
  const seen = new Set();
  const visit = (items, prefix, where) => {
    for (const it of items) {
      if (!it.id.startsWith(`${prefix}-`)) report.error('blueprint', rel, `${where} の項目 ${it.id} が ${prefix}- で始まっていません`);
      if (seen.has(it.id)) report.error('blueprint', rel, `項目 id ${it.id} が重複しています`);
      seen.add(it.id);
    }
  };
  const taskSeen = new Set();
  for (const d of blueprint.domains) {
    for (const t of d.taskStatements) {
      if (taskSeen.has(t.id)) report.error('blueprint', rel, `タスク id ${t.id} が重複しています`);
      taskSeen.add(t.id);
      if (!t.id.startsWith(`${d.id}.`)) report.error('blueprint', rel, `タスク ${t.id} がドメイン ${d.id} に属していません`);
      visit(t.items, t.id, `タスク ${t.id}`);
    }
  }
  visit(blueprint.basics.items, 'basics', 'basics');
  const outOfScope = new Set(blueprint.services.outOfScope);
  for (const d of blueprint.domains) {
    for (const t of d.taskStatements) {
      const bad = t.keyServices.filter((s) => outOfScope.has(s));
      if (bad.length) report.error('blueprint', rel, `タスク ${t.id} の keyServices に試験範囲外のサービスがあります: ${bad.join(', ')}`);
    }
  }
  const sum = blueprint.domains.reduce((s, d) => s + d.weightPercent, 0);
  if (sum !== 100) report.warn('blueprint', rel, `ドメインの比重の合計が ${sum}% です（100% のはずです）`);
}

function checkQuestion(content, { rel, data: q }) {
  const { report, bpIndex, serviceIndex } = content;

  checkTaskIds(content, rel, [q.taskStatement], 'taskStatement');
  if (bpIndex) {
    const bad = q.knowledgeRefs.filter((r) => !bpIndex.itemIds.has(r));
    if (bad.length) report.error('unknown-item', rel, `knowledgeRefs が blueprint にありません: ${bad.join(', ')}`);
  }

  checkServiceNames(content, rel, q.services, 'services');
  if (serviceIndex) {
    const text = [q.stem, ...q.options.map((o) => o.text)].join('\n');
    const hit = serviceIndex.outOfScopeMatchers.filter((m) => m.re.test(text)).map((m) => m.name);
    if (hit.length) {
      report.warn('out-of-scope-mention', rel, `問題文・選択肢に試験範囲外のサービス名があります: ${hit.join(', ')}`, { strong: true });
    }
  }

  const len = chars(q.stem);
  if (len < STEM_MIN || len > STEM_MAX) {
    report.warn('stem-length', rel, `問題文が ${len} 文字です（目安は ${STEM_MIN}〜${STEM_MAX} 文字）`);
  }

  const hits = [];
  findRefs(q.stem, 'stem', LETTER_REF_PATTERNS, hits);
  q.options.forEach((o, i) => {
    findRefs(o.text, `options[${i}].text`, OPTION_TEXT_PATTERNS, hits);
    findRefs(o.rationale, `options[${i}].rationale`, LETTER_REF_PATTERNS, hits);
  });
  findRefs(q.explanation, 'explanation', LETTER_REF_PATTERNS, hits);
  q.keyPoints.forEach((k, i) => findRefs(k, `keyPoints[${i}]`, LETTER_REF_PATTERNS, hits));
  if (hits.length) {
    report.warn('option-reference', rel, `選択肢を記号・位置で指している可能性があります: ${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ' ほか' : ''}`);
  }

  const texts = q.options.map((o) => o.text.trim());
  const dup = uniq(texts.filter((t, i) => texts.indexOf(t) !== i));
  if (dup.length) report.warn('duplicate-option-text', rel, `同じ文言の選択肢があります: ${dup.map((d) => clip(d, 30)).join(', ')}`);
}

function checkLesson(content, { rel, data: l, body }) {
  const { report, bpIndex } = content;
  checkTaskIds(content, rel, [l.taskStatement], 'taskStatement');
  if (bpIndex) {
    const bad = l.knowledgeRefs.filter((r) => !bpIndex.itemIds.has(r));
    if (bad.length) report.error('unknown-item', rel, `knowledgeRefs が blueprint にありません: ${bad.join(', ')}`);
  }
  checkServiceNames(content, rel, l.services, 'services');
  checkBody(report, rel, body, LESSON_BODY_MIN);
}

function checkBody(report, rel, body, min) {
  const n = chars(body.trim());
  if (n === 0) report.error('empty-body', rel, '本文が空です');
  else if (n < min) report.warn('body-short', rel, `本文が ${n} 文字と短いです（${min} 文字未満）`);
}

function checkDoc(content, { rel, data: d, body }) {
  checkTaskIds(content, rel, d.taskStatements, 'taskStatements');
  checkServiceNames(content, rel, d.services, 'services');
  checkBody(content.report, rel, body, DOC_BODY_MIN);
}

function checkDeck(content, { rel, data: deck }) {
  checkTaskIds(content, rel, deck.cards.flatMap((c) => c.taskStatements), 'cards[].taskStatements');
  checkServiceNames(content, rel, deck.cards.flatMap((c) => c.services), 'cards[].services');
}

function checkGlossary(content, { rel, data: g }) {
  const { report } = content;
  checkServiceNames(content, rel, g.entries.flatMap((e) => e.services), 'entries[].services');
  const seen = new Map();
  for (const e of g.entries) {
    const key = normName(e.term);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dups = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  if (dups.length) report.warn('glossary-duplicate', rel, `同じ用語が複数あります: ${dups.slice(0, 5).join(', ')}`);
}

function checkGlossaryRelated(content) {
  // 全ファイルの用語が出そろってから、related の参照先を調べる
  const terms = new Set();
  for (const { data: g } of content.glossaries) {
    for (const e of g.entries) {
      terms.add(normName(e.term));
      terms.add(normName(e.en));
    }
  }
  for (const { rel, data: g } of content.glossaries) {
    const missing = uniq(g.entries.flatMap((e) => e.related).filter((r) => !terms.has(normName(r))));
    if (missing.length) {
      const sample = missing.slice(0, 5).join(', ');
      content.report.warn('glossary-related', rel, `related が用語集にない語です（${missing.length} 件）: ${sample}${missing.length > 5 ? ' ほか' : ''}`);
    }
  }
}

function checkDuplicateIds(content) {
  for (const [id, list] of content.ids) {
    if (list.length < 2) continue;
    const [first, ...rest] = list;
    for (const dup of rest) {
      const same = dup.rel === first.rel;
      content.report.error('duplicate-id', dup.rel, `id ${id} が${same ? '同じファイル内で' : ` ${label(first.rel)} と`}重複しています`);
    }
  }
}

function checkLessonRefs(content) {
  const missing = new Map(); // レッスン id -> 参照元の問題
  for (const { rel, data: q } of content.questions) {
    for (const ref of q.lessonRefs) {
      const exists = content.ids.get(ref)?.some((x) => x.type === 'lesson');
      if (exists) continue;
      if (!missing.has(ref)) missing.set(ref, []);
      missing.get(ref).push({ rel, id: q.id });
    }
  }
  for (const [ref, from] of missing) {
    const sample = from.slice(0, 3).map((f) => f.id).join(', ');
    content.report.warn('lesson-missing', from[0].rel, `lessonRefs の ${ref} に対応するレッスンがまだありません（参照元 ${from.length} 問: ${sample}${from.length > 3 ? ' ほか' : ''}）`);
  }
}

function checkReviewStatus(content) {
  const { report, reviewStatus } = content;
  const rel = 'review-status.json';
  if (!reviewStatus.present) {
    report.warn('review-status-missing', rel, 'review-status.json がありません（すべての問題を pending として扱います）');
    return;
  }
  if (!reviewStatus.data) return;
  const unknown = Object.keys(reviewStatus.data).filter((id) => !content.ids.get(id)?.some((x) => x.type === 'question'));
  if (unknown.length) {
    const sample = unknown.slice(0, 5).join(', ');
    report.error('review-status-key', rel, `存在しない問題の id が ${unknown.length} 件あります: ${sample}${unknown.length > 5 ? ' ほか' : ''}`);
  }
}

// 問題文の文字 3-gram の Jaccard 係数が閾値を超える組を探す
export function findNearDuplicates(questions, threshold = NEAR_DUPLICATE_THRESHOLD) {
  const dict = new Map();
  const docs = [];
  for (const rec of questions) {
    const s = Array.from(rec.data.stem.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ''));
    if (s.length < 3) continue;
    const grams = new Set();
    for (let i = 0; i + 3 <= s.length; i++) {
      const g = s[i] + s[i + 1] + s[i + 2];
      let id = dict.get(g);
      if (id === undefined) {
        id = dict.size;
        dict.set(g, id);
      }
      grams.add(id);
    }
    docs.push({ rec, grams: Int32Array.from(grams).sort() });
  }
  docs.sort((a, b) => a.grams.length - b.grams.length);

  const pairs = [];
  for (let i = 0; i < docs.length; i++) {
    const a = docs[i].grams;
    for (let j = i + 1; j < docs.length; j++) {
      const b = docs[j].grams;
      // 集合が小さい方の大きさ / 大きい方の大きさ が Jaccard の上限。閾値以下なら以降も該当しない
      if (a.length <= threshold * b.length) break;
      const need = Math.floor((threshold * (a.length + b.length)) / (1 + threshold) + 1e-9) + 1;
      let x = 0;
      let y = 0;
      let common = 0;
      while (x < a.length && y < b.length) {
        if (common + Math.min(a.length - x, b.length - y) < need) break;
        if (a[x] === b[y]) {
          common++;
          x++;
          y++;
        } else if (a[x] < b[y]) x++;
        else y++;
      }
      if (common >= need) {
        pairs.push({ a: docs[i].rec, b: docs[j].rec, similarity: common / (a.length + b.length - common) });
      }
    }
  }
  return pairs.sort((p, q) => q.similarity - p.similarity);
}

function checkNearDuplicates(content) {
  for (const { a, b, similarity } of findNearDuplicates(content.questions)) {
    if (a.data.id === b.data.id) continue; // 同じ id の重複は duplicate-id で報告済み
    content.report.warn('near-duplicate', a.rel, `${b.data.id} と問題文が似ています（類似度 ${similarity.toFixed(2)}）`, {
      pair: [a.data.id, b.data.id],
    });
  }
}

// 択一問題で「正解が選択肢の中で唯一の最長」になる割合を調べる（偏りは正解の推測につながる）
export function longestCorrectStats(questions) {
  const stat = (list) => {
    let longest = 0;
    for (const { data: q } of list) {
      const lens = q.options.map((o) => chars(o.text));
      const ci = q.options.findIndex((o) => o.correct);
      if (ci >= 0 && lens.every((n, i) => i === ci || n < lens[ci])) longest++;
    }
    return { single: list.length, longest, ratio: list.length ? longest / list.length : 0 };
  };
  const singles = questions.filter((r) => r.data.type === 'single');
  const byCreator = new Map();
  for (const r of singles) {
    if (!byCreator.has(r.data.createdBy)) byCreator.set(r.data.createdBy, []);
    byCreator.get(r.data.createdBy).push(r);
  }
  return { ...stat(singles), byCreator: [...byCreator].map(([createdBy, list]) => ({ createdBy, ...stat(list) })) };
}

function checkLongestCorrect(content) {
  const s = longestCorrectStats(content.questions);
  content.longestCorrect = s;
  if (s.single === 0 || s.ratio <= LONGEST_CORRECT_LIMIT) return;
  const bias = s.byCreator
    .filter((c) => c.single >= 5 && c.ratio > LONGEST_CORRECT_LIMIT)
    .sort((a, b) => b.ratio - a.ratio)
    .map((c) => `${c.createdBy}: ${pct(c.longest, c.single)}%（${c.longest}/${c.single}）`);
  const note = s.single < SMALL_SAMPLE ? `。母数が ${s.single} 問と少ないため参考値です` : '';
  content.report.warn(
    'correct-longest',
    'questions',
    `択一問題の ${pct(s.longest, s.single)}%（${s.longest}/${s.single} 問）で正解が最も長い選択肢です（上限 ${LONGEST_CORRECT_LIMIT * 100}%）${note}${bias.length ? `。偏りが大きい作成者ID: ${bias.join(', ')}` : ''}`,
  );
}

export function checkContent(content) {
  if (content.blueprint) checkBlueprint(content);
  if (content.blueprint) checkRegistry(content);
  for (const q of content.questions) checkQuestion(content, q);
  for (const l of content.lessons) checkLesson(content, l);
  for (const d of content.docs) checkDoc(content, d);
  for (const d of content.decks) checkDeck(content, d);
  for (const g of content.glossaries) checkGlossary(content, g);
  reportServiceAliases(content);
  checkGlossaryRelated(content);
  checkDuplicateIds(content);
  checkLessonRefs(content);
  checkReviewStatus(content);
  checkNearDuplicates(content);
  checkLongestCorrect(content);
  return content;
}

// ---------- 結果のまとめ ----------
export function summarize(content) {
  const errors = content.issues.filter((i) => i.level === 'error');
  const warnings = content.issues.filter((i) => i.level === 'warning');
  const questionsByPool = {};
  const reviewStatus = { verified: 0, pending: 0, 'needs-fix': 0, rejected: 0 };
  let needsSourceCheck = 0;
  for (const { data: q } of content.questions) {
    questionsByPool[q.pool] = (questionsByPool[q.pool] ?? 0) + 1;
    reviewStatus[statusOf(content, q.id)]++;
    if (q.needsSourceCheck) needsSourceCheck++;
  }
  const c = content.counts;
  return {
    ok: errors.length === 0,
    contentRoot: CONTENT_ROOT,
    counts: {
      questions: { files: c.questionFiles, valid: content.questions.length },
      lessons: { files: c.lessonFiles, valid: content.lessons.length },
      cheatsheets: c.cheatsheetFiles,
      guides: c.guideFiles,
      flashcardDecks: { files: c.deckFiles, valid: content.decks.length },
      flashcards: content.decks.reduce((n, d) => n + d.data.cards.length, 0),
      glossaryFiles: c.glossaryFiles,
      glossaryEntries: content.glossaries.reduce((n, g) => n + g.data.entries.length, 0),
    },
    stats: {
      questionsByPool,
      reviewStatus,
      needsSourceCheck,
      longestCorrect: content.longestCorrect
        ? { single: content.longestCorrect.single, longest: content.longestCorrect.longest, ratio: content.longestCorrect.ratio }
        : null,
    },
    errors,
    warnings,
  };
}

// ---------- 表示 ----------
const CODE_LABELS = {
  'blueprint-missing': 'blueprint を読めない',
  'read-failed': 'ファイルの読み込み失敗',
  encoding: '文字コードの不正',
  parse: '構文エラー（JSON / YAML）',
  schema: 'スキーマ違反',
  'path-mismatch': '配置と id の不一致',
  'unexpected-file': '想定外の場所のファイル',
  'duplicate-id': 'id の重複',
  'unknown-task': 'blueprint にないタスク',
  'unknown-item': 'blueprint にない項目',
  blueprint: 'blueprint の不整合',
  registry: 'サービス台帳の不整合',
  'registry-missing': 'サービス台帳がない',
  'empty-body': '本文が空',
  'review-status-key': 'review-status の不明な id',
  'service-out-of-scope': '試験範囲外のサービス（services）',
  'out-of-scope-mention': '試験範囲外のサービス（問題文・選択肢）',
  'stem-length': '問題文の長さ',
  'option-reference': '選択肢を記号・位置で参照',
  'duplicate-option-text': '同じ文言の選択肢',
  'service-unlisted': 'blueprint にないサービス名',
  'service-alias': 'サービス名の表記ゆれ',
  'lesson-missing': '存在しない lessonRefs',
  'near-duplicate': '問題文が似ている組',
  'correct-longest': '正解が最長に偏っている',
  'review-status-missing': 'review-status.json がない',
  'body-short': '本文が短い',
  'glossary-duplicate': '用語の重複',
  'glossary-related': '用語集にない related',
  bom: 'BOM 付き',
};
const codeLabel = (code) => CODE_LABELS[code] ?? code;

function histogram(items, n = 8) {
  const m = new Map();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, n).map(([k, v]) => `${k} ×${v}`);
}

function renderText(result, opts) {
  const { counts: c, stats: s, errors, warnings } = result;
  const L = [];
  L.push(`SAA Dojo コンテンツ検証（${result.contentRoot}）`);

  if (!opts.quiet) {
    L.push('');
    L.push('読み込み');
    L.push(`  問題 ${c.questions.files} 件（有効 ${c.questions.valid}） / レッスン ${c.lessons.files} 件（有効 ${c.lessons.valid}） / 早見表 ${c.cheatsheets} 件 / ガイド ${c.guides} 件`);
    L.push(`  フラッシュカード ${c.flashcardDecks.files} デッキ・${c.flashcards} 枚 / 用語集 ${c.glossaryFiles} ファイル・${c.glossaryEntries} 語`);
    const pools = ['basics', 'practice', 'mockA', 'mockB'].map((p) => `${p} ${s.questionsByPool[p] ?? 0}`).join(' / ');
    L.push(`  問題のプール: ${pools}`);
    const st = s.reviewStatus;
    L.push(`  検証状況: verified ${st.verified} / pending ${st.pending} / needs-fix ${st['needs-fix']} / rejected ${st.rejected}（出典の再確認が必要な問題 ${s.needsSourceCheck} 問）`);
  }

  if (!opts.quiet && errors.length) {
    L.push('');
    L.push(`エラー ${errors.length} 件`);
    const byFile = new Map();
    for (const e of errors) {
      if (!byFile.has(e.file)) byFile.set(e.file, []);
      byFile.get(e.file).push(e);
    }
    let printed = 0;
    for (const [file, list] of [...byFile].sort((a, b) => cmp(a[0], b[0]))) {
      if (!opts.all && printed >= MAX_ERROR_LINES) break;
      L.push(`  ${file}`);
      for (const e of list) {
        L.push(`    - ${e.message}`);
        printed++;
      }
    }
    if (!opts.all && printed < errors.length) L.push(`  …ほか ${errors.length - printed} 件（--all で全件表示）`);
    if (errors.some((e) => e.code === 'unexpected-file')) {
      L.push('');
      for (const line of LAYOUT_HELP) L.push(`  ${line}`);
    }
  }

  if (!opts.quiet && warnings.length) {
    L.push('');
    L.push(`警告 ${warnings.length} 件`);
    const groups = new Map();
    for (const w of warnings) {
      if (!groups.has(w.code)) groups.set(w.code, []);
      groups.get(w.code).push(w);
    }
    const order = [...groups.keys()].sort((a, b) => {
      const sa = groups.get(a).some((w) => w.strong) ? 0 : 1;
      const sb = groups.get(b).some((w) => w.strong) ? 0 : 1;
      return sa - sb;
    });
    for (const code of order) {
      const list = groups.get(code);
      const mark = list.some((w) => w.strong) ? '【要注意】' : '';
      L.push(`  ■ ${mark}${codeLabel(code)}: ${list.length} 件`);
      const limit = opts.all ? list.length : MAX_LINES_PER_GROUP;
      for (const w of list.slice(0, limit)) L.push(`    ${w.file}: ${w.message}`);
      if (list.length > limit) L.push(`    …ほか ${list.length - limit} 件（--all で全件表示）`);
      if (code === 'service-unlisted') {
        const top = histogram(list.flatMap((w) => w.names ?? []));
        if (top.length) L.push(`    多い名前: ${top.join(' / ')}`);
      }
    }
  }

  if (opts.quiet) {
    const byCode = (list) => histogram(list.map((i) => codeLabel(i.code)), 20).join(' / ');
    if (errors.length) L.push(`  エラーの内訳: ${byCode(errors)}`);
    if (warnings.length) L.push(`  警告の内訳: ${byCode(warnings)}`);
  }

  L.push('');
  L.push(`結果: ${result.ok ? '成功' : '失敗'}（エラー ${errors.length} 件、警告 ${warnings.length} 件）`);
  return L.join('\n');
}

// GitHub Actions のアノテーション（Actions 上でだけ出す）
function renderAnnotations(result) {
  const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const lines = [];
  for (const [level, list] of [['error', result.errors], ['warning', result.warnings]]) {
    for (const i of list.slice(0, 10)) {
      lines.push(`::${level} file=${escProp(i.file)},title=${escProp(codeLabel(i.code))}::${esc(i.message)}`);
    }
  }
  return lines;
}

// ---------- CLI ----------
const USAGE = [
  '使い方: node scripts/validate.mjs [--quiet] [--json] [--all] [--root <dir>]',
  '  --quiet  件数と結果だけを表示する',
  '  --json   結果を JSON で標準出力に出す',
  '  --all    警告・エラーを省略せずにすべて表示する',
  '  --root   リポジトリのルート（既定: scripts の親ディレクトリ）',
].join('\n');

function parseCliArgs(argv) {
  const opts = { quiet: false, json: false, all: false, root: DEFAULT_ROOT };
  const fail = (msg) => {
    console.error(`${msg}\n${USAGE}`);
    process.exit(2);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--all') opts.all = true;
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
  const content = checkContent(loadContent({ root: opts.root }));
  const result = summarize(content);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(renderText(result, opts));
    if (process.env.GITHUB_ACTIONS === 'true') for (const line of renderAnnotations(result)) console.log(line);
  }
  process.exitCode = result.ok ? 0 : 1;
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
    console.error(`検証スクリプトが異常終了しました: ${e.stack ?? e}`);
    process.exitCode = 2;
  }
}
