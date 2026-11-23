// 実物（設定そのものを注目点つきで読む教材）の共通処理。validate とアプリのビルドが同じ判定を使う。
// 設計は docs/visual-materials-design.md の 6章。スキーマは schema.mjs の ArtifactSchema。
import { ARTIFACT_LIMITS } from './schema.mjs';
import { parseMaterialRefs } from './diagram.mjs';

// 種類（6.3）の日本語の名前
export const ARTIFACT_KIND_LABELS = {
  'iam-policy': 'IAM ポリシー',
  'trust-policy': '信頼ポリシー',
  'bucket-policy': 'バケットポリシー',
  scp: 'サービスコントロールポリシー',
  'key-policy': 'キーポリシー',
  'endpoint-policy': 'VPC エンドポイントのポリシー',
  'route-table': 'ルートテーブル',
  'sg-rules': 'セキュリティグループのルール',
  'nacl-rules': 'ネットワーク ACL のルール',
  's3-lifecycle': 'S3 のライフサイクル設定',
  'scaling-policy': 'スケーリングポリシー',
  'dns-records': 'Route 53 のレコード',
  'listener-rules': 'ALB のリスナールール',
  'queue-settings': 'SQS のキューの設定',
  'function-settings': 'Lambda 関数の設定',
  'table-design': 'DynamoDB のテーブルの設計',
  'db-settings': 'RDS・Aurora の構成',
  alarm: 'CloudWatch のアラーム',
  'event-pattern': 'EventBridge のイベントパターン',
  'distribution-settings': 'CloudFront のディストリビューションの設定',
  'backup-plan': 'AWS Backup のバックアッププラン',
  template: 'CloudFormation のテンプレート',
};

// format ごとの本体の欄と、注目点の場所の欄
const BODY_FIELDS = { json: ['document'], table: ['columns', 'rows'], text: ['lines'] };
const NOTE_FIELD = { json: 'path', table: 'row', text: 'lines' };
const ALL_BODY = ['document', 'columns', 'rows', 'lines'];

// ---------------------------------------------------------------- JSON の場所

/**
 * `Statement[0].Condition` のような場所を、キーと番号の列にする。形が違えば null。
 * キーは `.` と `[` `]` を含まない文字列（`aws:PrincipalOrgID` のようなコロンは使える）。
 */
export function parseJsonPath(path) {
  // 配列の番号は 0 か、0 で始まらない数字（[01] は形の違い）
  if (!/^[^.[\]]+(?:\[(?:0|[1-9]\d*)\])*(?:\.[^.[\]]+(?:\[(?:0|[1-9]\d*)\])*)*$/.test(path)) return null;
  const tokens = [];
  for (const part of path.split('.')) {
    const m = /^([^[]+)((?:\[\d+\])*)$/.exec(part);
    tokens.push(m[1]);
    for (const i of m[2].matchAll(/\[(\d+)\]/g)) tokens.push(Number(i[1]));
  }
  return tokens;
}

/**
 * 範囲の表の鍵。たどるキーと番号の並びから作る（`a.b` というキーと、a の中の b が同じ鍵にならない）。
 */
export const rangeKey = (tokens) => JSON.stringify(tokens);

/** 場所が document の中にあるか */
export function resolveJsonPath(document, tokens) {
  let cur = document;
  for (const t of tokens) {
    if (typeof t === 'number') {
      if (!Array.isArray(cur) || t >= cur.length) return { found: false };
      cur = cur[t];
    } else {
      if (!cur || typeof cur !== 'object' || Array.isArray(cur) || !Object.hasOwn(cur, t)) return { found: false };
      cur = cur[t];
    }
  }
  return { found: true, value: cur };
}

/**
 * JSON を 2 字下げで整形した行と、場所（rangeKey）ごとの行の範囲。
 * 戻り値: { lines: [{ indent, text }], ranges: Map<rangeKey, [start, end]>（0 始まり）, depth }
 */
export function jsonLines(document) {
  const lines = [];
  const ranges = new Map();
  let depth = 0;
  function emit(value, indent, prefix, comma, tokens) {
    const start = lines.length;
    depth = Math.max(depth, indent);
    const tail = comma ? ',' : '';
    const isArr = Array.isArray(value);
    const entries = value && typeof value === 'object' ? (isArr ? value.map((v, i) => [i, v]) : Object.entries(value)) : null;
    if (!entries || entries.length === 0) {
      lines.push({ indent, text: `${prefix}${entries ? (isArr ? '[]' : '{}') : JSON.stringify(value)}${tail}` });
    } else {
      lines.push({ indent, text: `${prefix}${isArr ? '[' : '{'}` });
      entries.forEach(([k, v], i) => {
        emit(v, indent + 1, isArr ? '' : `${JSON.stringify(k)}: `, i < entries.length - 1, [...tokens, k]);
      });
      lines.push({ indent, text: `${isArr ? ']' : '}'}${tail}` });
    }
    if (tokens.length) ranges.set(rangeKey(tokens), [start, lines.length - 1]);
  }
  emit(document, 0, '', false, []);
  return { lines, ranges, depth };
}

// ---------------------------------------------------------------- 検査

const has = (obj, k) => obj[k] !== undefined;

/** document の中（入れ子を含む）の、数字だけのキー */
function numericKeys(value, out = []) {
  if (Array.isArray(value)) for (const v of value) numericKeys(v, out);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (/^\d+$/.test(k)) out.push(k);
      numericKeys(v, out);
    }
  return out;
}

/**
 * 実物の検査。戻り値: { errors: [文字列], warnings: [{ code, message }] }
 * ctx: { lessonIds: Set, factIds: Set }
 */
export function checkArtifact(a, ctx = {}) {
  const errors = [];
  const warnings = [];
  // 裏づけ（1.2 の 1）
  if (a.lessonRefs.length + a.factRefs.length === 0) errors.push('裏づけ（lessonRefs・factRefs）が 1 つもありません');
  if (ctx.lessonIds) for (const id of a.lessonRefs) if (!ctx.lessonIds.has(id)) errors.push(`lessonRefs のレッスン ${id} がありません`);
  if (ctx.factIds) for (const id of a.factRefs) if (!ctx.factIds.has(id)) errors.push(`factRefs の事実 ${id} が図鑑にありません`);

  // format と本体
  const want = BODY_FIELDS[a.format];
  for (const f of want) if (!has(a, f)) errors.push(`format が ${a.format} のときは ${want.join(' と ')} を書きます（${f} がありません）`);
  for (const f of ALL_BODY) if (!want.includes(f) && has(a, f)) errors.push(`format が ${a.format} のときは ${f} を書けません（${want.join(' と ')} を書きます）`);

  let json = null;
  if (a.format === 'json' && a.document) {
    json = jsonLines(a.document);
    if (json.lines.length > ARTIFACT_LIMITS.jsonLines) errors.push(`document を整形すると ${json.lines.length} 行あります（上限 ${ARTIFACT_LIMITS.jsonLines}。幅 360px で読める長さに分けてください）`);
    if (json.depth > ARTIFACT_LIMITS.jsonDepth) errors.push(`document の入れ子が ${json.depth} 段あります（上限 ${ARTIFACT_LIMITS.jsonDepth}）`);
    json.lines.forEach((l, i) => {
      const chars = l.indent * 2 + l.text.length;
      if (chars > ARTIFACT_LIMITS.jsonLineChars) errors.push(`document を整形した ${i + 1} 行目が、字下げを含めて ${chars} 字あります（上限 ${ARTIFACT_LIMITS.jsonLineChars}）`);
    });
    const numeric = numericKeys(a.document);
    if (numeric.length) errors.push(`document に数字だけのキーがあります（${numeric.join(', ')}）。読み込むと並びが変わり、書いた順に表示できません`);
  }
  if (a.format === 'text' && a.lines) {
    a.lines.forEach((l, i) => {
      if (l.includes('\t')) errors.push(`lines の ${i + 1} 行目にタブがあります（字下げは半角の空白で書きます）`);
      const indent = /^ */.exec(l)[0].length;
      if (indent > ARTIFACT_LIMITS.textIndent) errors.push(`lines の ${i + 1} 行目の字下げが ${indent} 字あります（上限 ${ARTIFACT_LIMITS.textIndent}）`);
    });
  }
  if (a.format === 'table' && a.columns && a.rows) {
    a.rows.forEach((r, i) => {
      if (r.length !== a.columns.length) errors.push(`rows の ${i + 1} 行目のセルが ${r.length} 個あります（columns は ${a.columns.length} 個）`);
    });
  }

  // 注目点の場所
  const field = NOTE_FIELD[a.format];
  a.notes.forEach((n, i) => {
    const label = `notes[${i}]`;
    const given = ['path', 'row', 'lines'].filter((k) => has(n, k));
    if (!given.includes(field)) errors.push(`${label}: format が ${a.format} のときは、場所を ${field} で指します`);
    for (const k of given) if (k !== field) errors.push(`${label}: format が ${a.format} のときは ${k} を使えません（${field} で指します）`);
    if (field === 'path' && has(n, 'path') && a.document) {
      const tokens = parseJsonPath(n.path);
      if (!tokens) errors.push(`${label}: path「${n.path}」の形が違います（\`Statement[0].Condition\` のように、キーを . でつなぎ、配列は [番号] で書きます）`);
      else if (!resolveJsonPath(a.document, tokens).found) errors.push(`${label}: path「${n.path}」が document の中にありません`);
    }
    if (field === 'row' && has(n, 'row') && a.rows && n.row > a.rows.length) errors.push(`${label}: row ${n.row} がありません（行は ${a.rows.length} 行）`);
    if (field === 'lines' && has(n, 'lines') && a.lines) {
      for (const l of n.lines) if (l > a.lines.length) errors.push(`${label}: lines の ${l} 行目がありません（行は ${a.lines.length} 行）`);
      if (new Set(n.lines).size !== n.lines.length) errors.push(`${label}: lines に同じ行が重なっています`);
    }
  });
  if (a.notes.length <= 1) warnings.push({ code: 'artifact-notes-few', message: `注目点（notes）が ${a.notes.length} 個です（2〜5 個にします）` });
  return { errors, warnings };
}

/** 本文の実物の参照の検査（存在しない ID、形の違い、参照形式）。戻り値: [{ rel, message }] */
export function checkArtifactRefs({ texts, artifactIds }) {
  const errors = [];
  for (const { rel, body } of texts) {
    for (const { kind, href, id, reference } of parseMaterialRefs(body)) {
      if (kind !== 'artifact') continue;
      let message;
      if (reference) message = '実物の参照は参照形式では書けません。`![キャプション](#/artifacts/<id>)` の形で書いてください。';
      else if (!id) message = `実物の参照の形が違います（${href}）。\`#/artifacts/\` のあとには、\`ar-\` で始まる実物の id（英小文字・数字・ハイフン）だけを書きます。?step などは付けられません。`;
      else if (!artifactIds.has(id)) message = `参照先の実物 ${id} がありません。`;
      if (message) errors.push({ rel, message });
    }
  }
  return errors;
}

// ---------------------------------------------------------------- 表示用の出力

const whereOf = (a, n) => {
  if (a.format === 'json') return n.path;
  if (a.format === 'table') return `${n.row} 行目`;
  return `${[...n.lines].sort((x, y) => x - y).join('・')} 行目`;
};

/**
 * アプリに出す形（ビルドが書く）。注目点の番号は notes の順に 1 から。
 * 本体の行（json・text）と表の行（table）に、かかる注目点の番号（marks）と、そこから始まる注目点の番号（starts）を付ける。
 */
export function renderArtifact(a, status) {
  const notes = a.notes.map((n, i) => ({ n: i + 1, text: n.text, where: whereOf(a, n) }));
  const out = { id: a.id, kind: a.kind, kindLabel: ARTIFACT_KIND_LABELS[a.kind], title: a.title, format: a.format, status, notes };
  const mark = (target, n, start) => {
    if (!target.marks.includes(n)) target.marks.push(n);
    if (start && !target.starts.includes(n)) target.starts.push(n);
  };
  if (a.format === 'json') {
    const { lines, ranges } = jsonLines(a.document);
    // indent は字下げの字数（表示は 1 字 = 1ch。折り返した行も同じ字下げにそろえる）
    out.lines = lines.map((l) => ({ indent: l.indent * 2, text: l.text, marks: [], starts: [] }));
    a.notes.forEach((n, i) => {
      const [s, e] = ranges.get(rangeKey(parseJsonPath(n.path)));
      for (let k = s; k <= e; k++) mark(out.lines[k], i + 1, k === s);
    });
  } else if (a.format === 'text') {
    out.lines = a.lines.map((text) => {
      const indent = /^ */.exec(text)[0].length;
      return { indent, text: text.slice(indent), marks: [], starts: [] };
    });
    // 飛び飛びの行は、連続した塊ごとに先頭の行へ番号を付ける
    a.notes.forEach((n, i) => {
      const set = new Set(n.lines);
      for (const l of n.lines) mark(out.lines[l - 1], i + 1, !set.has(l - 1));
    });
  } else {
    out.columns = a.columns;
    out.rows = a.rows.map((cells) => ({ cells, marks: [], starts: [] }));
    a.notes.forEach((n, i) => mark(out.rows[n.row - 1], i + 1, true));
  }
  if (a.ask) out.ask = a.ask;
  return out;
}
