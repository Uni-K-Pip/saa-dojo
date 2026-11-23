// @vitest-environment node
// 実物: スキーマ・注目点の場所・検査・本文の参照・検証状態・ビルド
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { checkArtifact, jsonLines, parseJsonPath, rangeKey, renderArtifact, resolveJsonPath } from '../../../scripts/lib/artifact.mjs';
import { parseMaterialRefs } from '../../../scripts/lib/diagram.mjs';
import { materialHash } from '../../../scripts/lib/material-status.mjs';
import { buildContent } from '../lib/content-build.mjs';
import { crosscheckMarkdown } from '../lib/markdown-crosscheck.mjs';
import { lessonId } from './diagram-fixtures.mjs';

const repoContent = new URL('../../../content/saa-c03/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, repoContent), 'utf8');
const lessonRel = `lessons/d4/${lessonId}.md`;
const lesson = (addition = '') => `---
id: ${lessonId}
title: 保存先の選び方
domain: 4
taskStatement: '4.1'
order: 10
knowledgeRefs: []
services: []
estimatedMinutes: 3
createdBy: v1
---

保存するデータの性質を調べます。保存期間と読み取りの頻度を確認し、すぐに読み出す必要があるかを決めます。要件が変わったときは、移行にかかる時間と費用も確かめます。

よく使うデータと、長期保存が必要なデータを分けて考えます。たとえば運用中に何度も読むログと、監査のときだけ読むログでは、読み出しに許される時間が異なります。

候補を比べるときは、保管料金に加えて読み出しや移行にかかる費用を確認します。利用頻度の変化を見込んで、選んだ保存先が条件に合い続けるかも確認します。
${addition ? `\n${addition}\n` : ''}`;

const common = { lessonRefs: [lessonId], factRefs: [], createdBy: 'v1' };
const note = (where, text = '注目点の説明の文章です。') => ({ ...where, text });
export const jsonArtifact = () => ({
  ...common, id: 'ar-test-json', kind: 'bucket-policy', title: '検査用のポリシー', format: 'json',
  document: { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Condition: { StringEquals: { 'aws:PrincipalOrgID': 'o-example' } } }] },
  notes: [note({ path: 'Statement[0].Principal' }), note({ path: 'Statement[0].Condition' })],
  ask: { text: '組織の外から読めますか？', answer: '読めません。条件に合いません。' },
});
export const tableArtifact = () => ({
  ...common, id: 'ar-test-table', kind: 'sg-rules', title: '検査用のルール', format: 'table',
  columns: ['方向', 'ポート', '送信元'], rows: [['インバウンド', '443', 'sg-0123'], ['アウトバウンド', 'すべて', '0.0.0.0/0']],
  notes: [note({ row: 1 }), note({ row: 2 })],
});
export const textArtifact = () => ({
  ...common, id: 'ar-test-text', kind: 'dns-records', title: '検査用のレコード', format: 'text',
  lines: ['名前: example.com', '  タイプ: A', '名前: www.example.com'],
  notes: [note({ lines: [1, 2] }), note({ lines: [3] })],
});
const ctx = { lessonIds: new Set([lessonId]), factIds: new Set(['iam.global-key-principalorgid']) };
const rec = (a, status = 'verified') => ({ status, checkedAt: '2026-11-23', hash: materialHash('artifacts', a) });

const tmp = [];
afterEach(() => {
  for (const root of tmp.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture({ artifacts = [], status, body = '', raw = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-artifact-'));
  tmp.push(root);
  const contentDir = path.join(root, 'content', 'saa-c03');
  const outDir = path.join(root, 'out');
  const source = {
    'blueprint.json': read('blueprint.json'), 'services.json': read('services.json'), 'review-status.json': {},
    [lessonRel]: lesson(body),
    ...Object.fromEntries(artifacts.map((a) => [`artifacts/${a.id}.json`, a])),
    ...(status === undefined ? {} : { 'material-status.json': status }),
    ...raw,
  };
  for (const [rel, value] of Object.entries(source)) {
    const dest = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root, contentDir, outDir };
}
const issues = (opts) => checkContent(loadContent({ root: fixture(opts).root })).issues;
const codes = (opts) => issues(opts).map((i) => `${i.level}:${i.code}`);

describe('スキーマ', () => {
  const ok = (a) => schema.ArtifactSchema.safeParse(a).success;
  it('3 つの format の見本を受け付ける', () => {
    for (const a of [jsonArtifact(), tableArtifact(), textArtifact()]) expect(ok(a)).toBe(true);
  });
  it('知らない kind・format、id の形、上限を超えるものはエラー', () => {
    expect(ok({ ...jsonArtifact(), kind: 'console-screen' })).toBe(false);
    expect(ok({ ...jsonArtifact(), format: 'yaml' })).toBe(false);
    expect(ok({ ...jsonArtifact(), id: 'bucket-policy' })).toBe(false);
    expect(ok({ ...jsonArtifact(), title: '短い' })).toBe(false);
    expect(ok({ ...jsonArtifact(), notes: Array.from({ length: 6 }, () => note({ path: 'Version' })) })).toBe(false);
    expect(ok({ ...jsonArtifact(), notes: [note({ path: 'Version' }, 'あ'.repeat(121))] })).toBe(false);
    expect(ok({ ...tableArtifact(), columns: ['1', '2', '3', '4', '5'] })).toBe(false);
    expect(ok({ ...tableArtifact(), rows: [['インバウンド', '443', 'あ'.repeat(41)]] })).toBe(false);
    expect(ok({ ...textArtifact(), lines: ['あ'.repeat(81)] })).toBe(false);
    expect(ok({ ...textArtifact(), lines: Array.from({ length: 31 }, () => '行') })).toBe(false);
    expect(ok({ ...jsonArtifact(), ask: { text: '短い', answer: '読めません。条件に合いません。' } })).toBe(false);
    expect(ok({ ...jsonArtifact(), extra: 1 })).toBe(false);
  });
});

describe('注目点の場所（JSON）', () => {
  it('キーと番号の列に読み、配列と入れ子をたどる', () => {
    expect(parseJsonPath('Statement[0].Condition.StringEquals')).toEqual(['Statement', 0, 'Condition', 'StringEquals']);
    expect(parseJsonPath('Statement[0].Condition.StringEquals.aws:PrincipalOrgID')).toEqual(['Statement', 0, 'Condition', 'StringEquals', 'aws:PrincipalOrgID']);
    expect(parseJsonPath('Rules[1][0]')).toEqual(['Rules', 1, 0]);
    expect(parseJsonPath('Rules[10]')).toEqual(['Rules', 10]);
    for (const bad of ['', '.Version', 'Statement[a]', 'Statement..x', 'Statement[0]x', 'a[0].', 'Statement[01]', 'Statement[00]']) expect(parseJsonPath(bad)).toBeNull();
    const doc = jsonArtifact().document;
    expect(resolveJsonPath(doc, parseJsonPath('Statement[0].Condition'))).toMatchObject({ found: true });
    expect(resolveJsonPath(doc, parseJsonPath('Statement[1]')).found).toBe(false);
    expect(resolveJsonPath(doc, parseJsonPath('Statement[0].Action')).found).toBe(false);
    expect(resolveJsonPath(doc, parseJsonPath('Version[0]')).found).toBe(false);
  });

  it('整形した行と、場所ごとの行の範囲を返す', () => {
    const { lines, ranges } = jsonLines(jsonArtifact().document);
    expect(lines.map((l) => '  '.repeat(l.indent) + l.text).join('\n')).toBe(JSON.stringify(jsonArtifact().document, null, 2));
    const [s, e] = ranges.get(rangeKey(['Statement', 0, 'Condition']));
    expect(lines[s].text).toBe('"Condition": {');
    expect(lines[e].text).toBe('}');
  });
});

describe('checkArtifact', () => {
  const errs = (a) => checkArtifact(a, ctx).errors;
  it('見本にはエラーも警告もない', () => {
    for (const a of [jsonArtifact(), tableArtifact(), textArtifact()]) expect(checkArtifact(a, ctx)).toEqual({ errors: [], warnings: [] });
  });
  it('裏づけが 0、存在しないレッスンと事実はエラー', () => {
    expect(errs({ ...jsonArtifact(), lessonRefs: [], factRefs: [] })).toEqual([expect.stringContaining('裏づけ')]);
    expect(errs({ ...jsonArtifact(), lessonRefs: ['lesson-1.1-absent'], factRefs: ['s3.absent'] })).toEqual([
      expect.stringContaining('lesson-1.1-absent'), expect.stringContaining('s3.absent'),
    ]);
  });
  it('format と本体の不一致はエラー', () => {
    const { document, ...noDoc } = jsonArtifact();
    expect(errs(noDoc)).toContainEqual(expect.stringContaining('document がありません'));
    expect(errs({ ...jsonArtifact(), lines: ['行'] })).toContainEqual(expect.stringContaining('lines を書けません'));
    expect(errs({ ...tableArtifact(), rows: [['インバウンド', '443']] })).toContainEqual(expect.stringContaining('セルが 2 個'));
  });
  it('format と注目点の場所の種類の不一致はエラー', () => {
    expect(errs({ ...jsonArtifact(), notes: [note({ row: 1 }), note({ path: 'Version' })] })).toEqual([
      expect.stringContaining('場所を path で指します'), expect.stringContaining('row を使えません'),
    ]);
    expect(errs({ ...textArtifact(), notes: [note({ lines: [1], path: 'Version' }), note({ lines: [2] })] })).toEqual([expect.stringContaining('path を使えません')]);
  });
  it('存在しない場所を指す注目点はエラー', () => {
    expect(errs({ ...jsonArtifact(), notes: [note({ path: 'Statement[1].Effect' }), note({ path: 'Version' })] })).toEqual([expect.stringContaining('document の中にありません')]);
    expect(errs({ ...jsonArtifact(), notes: [note({ path: 'Statement[0' }), note({ path: 'Version' })] })).toEqual([expect.stringContaining('形が違います')]);
    expect(errs({ ...tableArtifact(), notes: [note({ row: 3 }), note({ row: 1 })] })).toEqual([expect.stringContaining('row 3 がありません')]);
    expect(errs({ ...textArtifact(), notes: [note({ lines: [2, 4] }), note({ lines: [1, 1] })] })).toEqual([
      expect.stringContaining('4 行目がありません'), expect.stringContaining('同じ行が重なって'),
    ]);
  });
  it('整形した行数と入れ子の上限を超えるとエラー', () => {
    const long = { ...jsonArtifact(), document: { List: Array.from({ length: 40 }, (_, i) => i) }, notes: [note({ path: 'List' }), note({ path: 'List[0]' })] };
    expect(errs(long)).toEqual([expect.stringContaining('整形すると 44 行')]);
    const deep = { ...jsonArtifact(), document: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }, notes: [note({ path: 'a' }), note({ path: 'a.b' })] };
    expect(errs(deep)).toEqual([expect.stringContaining('入れ子が 7 段')]);
  });
  it('数字だけのキー（入れ子を含む）はエラー', () => {
    const doc = { Version: '2012-10-17', Map: [{ '0': '最初' }, { '0': '次' }] };
    expect(errs({ ...jsonArtifact(), document: doc, notes: [note({ path: 'Version' }), note({ path: 'Map' })] })).toEqual([
      'document に数字だけのキーは書けません（読み込むと並びが変わることがあるため）。場所: Map[0].0, Map[1].0',
    ]);
    expect(errs({ ...jsonArtifact(), document: { ...doc, Map: { a10: 'x', '1a': 'y' } }, notes: [note({ path: 'Version' }), note({ path: 'Map' })] })).toEqual([]);
  });
  it('数字だけのキーの場所が多いときは先頭の 5 件と残りの件数を示す', () => {
    const document = {
      Version: '2012-10-17', Map: { 'a.b': { 0: true }, a: { b: { 0: true } } },
      List: Array.from({ length: 4 }, () => ({ 0: true })),
    };
    expect(errs({ ...jsonArtifact(), document, notes: [note({ path: 'Version' }), note({ path: 'List' })] })).toEqual([
      expect.stringContaining('場所: Map["a.b"].0, Map.a.b.0, List[0].0, List[1].0, List[2].0、ほか 1 件'),
    ]);
  });
  it('整形した 1 行が字下げを含めて上限の字数を超えるとエラー', () => {
    const at = (len) => ({ ...jsonArtifact(), document: { Version: '2012-10-17', A: { B: 'x'.repeat(len) } }, notes: [note({ path: 'Version' }), note({ path: 'A' })] });
    // 入れ子 2 段の字下げ 4 字 + "B": "" の 7 字 + 値
    expect(errs(at(schema.ARTIFACT_LIMITS.jsonLineChars - 11))).toEqual([]);
    expect(errs(at(schema.ARTIFACT_LIMITS.jsonLineChars - 10))).toEqual([expect.stringContaining('字下げを含めて 121 字')]);
  });
  it('text: タブを含む行と、字下げが上限を超える行はエラー', () => {
    const lines = (ls) => ({ ...textArtifact(), lines: ls });
    const pad = ' '.repeat(schema.ARTIFACT_LIMITS.textIndent);
    expect(errs(lines([`${pad}名前: a`, '\tタイプ: A', 'x']))).toEqual([expect.stringContaining('2 行目にタブ')]);
    expect(errs(lines([`${pad} 名前: a`, 'タイプ: A', 'x']))).toEqual([expect.stringContaining('1 行目の字下げが 13 字')]);
  });
  it('注目点が 1 個以下は警告', () => {
    expect(checkArtifact({ ...textArtifact(), notes: [note({ lines: [1] })] }, ctx).warnings).toEqual([expect.objectContaining({ code: 'artifact-notes-few' })]);
  });
});

describe('表示用の出力', () => {
  it('json: 場所の行の範囲に番号を付け、範囲の最初の行に始まりの印を付ける', () => {
    const out = renderArtifact(jsonArtifact(), 'pending');
    expect(out).toMatchObject({ kindLabel: 'バケットポリシー', status: 'pending', notes: [{ n: 1, where: 'Statement[0].Principal' }, { n: 2, where: 'Statement[0].Condition' }] });
    const marked = out.lines.filter((l) => l.marks.includes(2));
    expect(marked.map((l) => l.text)).toEqual(['"Condition": {', '"StringEquals": {', '"aws:PrincipalOrgID": "o-example"', '}', '}']);
    expect(marked[0].starts).toEqual([2]);
    expect(out.lines.find((l) => l.text.startsWith('"Principal"'))).toMatchObject({ marks: [1], starts: [1], indent: 6 });
  });
  it('table と text: 行に番号を付ける', () => {
    expect(renderArtifact(tableArtifact(), 'verified').rows.map((r) => r.starts)).toEqual([[1], [2]]);
    const text = renderArtifact(textArtifact(), 'verified');
    expect(text.lines.map((l) => [l.indent, l.text, l.marks, l.starts])).toEqual([
      [0, '名前: example.com', [1], [1]], [2, 'タイプ: A', [1], []], [0, '名前: www.example.com', [2], [2]],
    ]);
    expect(text.notes.map((n) => n.where)).toEqual(['1・2 行目', '3 行目']);
  });
  it('json: `.` や `[n]` を含むキーがあっても、入れ子の場所を強調する', () => {
    const lineOf = (document, path) => {
      const out = renderArtifact({ ...jsonArtifact(), document, notes: [note({ path }), note({ path })] }, 'verified');
      return out.lines.filter((l) => l.marks.includes(1)).map((l) => l.text);
    };
    expect(lineOf({ a: { b: 1 }, 'a.b': 2 }, 'a.b')).toEqual(['"b": 1']);
    expect(lineOf({ 'a.b': 2, a: { b: 1 } }, 'a.b')).toEqual(['"b": 1']);
    expect(lineOf({ a: ['x'], 'a[0]': 'y' }, 'a[0]')).toEqual(['"x"']);
  });
  it('text: 飛び飛びの行は、連続した塊ごとに先頭の行へ番号を付ける', () => {
    const a = { ...textArtifact(), lines: ['1', '2', '3', '4', '5'], notes: [note({ lines: [5, 1, 2, 4] }), note({ lines: [3] })] };
    expect(renderArtifact(a, 'verified').lines.map((l) => l.starts)).toEqual([[1], [], [2], [1], []]);
  });
});

describe('本文の参照', () => {
  it('画像だけの行・リンク・参照形式・形の違いを読み分ける', () => {
    const refs = parseMaterialRefs('![実物](#/artifacts/ar-test-json)\n\n文の [実物](#/artifacts/ar-test-json) と ![x](#/artifacts/ar-test-json?step=1)\n\n[r]: #/artifacts/ar-test-json', { withLine: true });
    expect(refs).toEqual([
      { kind: 'artifact', href: '#/artifacts/ar-test-json', id: 'ar-test-json', image: true, block: true, line: 1 },
      { kind: 'artifact', href: '#/artifacts/ar-test-json', id: 'ar-test-json', image: false, block: false, line: 3 },
      { kind: 'artifact', href: '#/artifacts/ar-test-json?step=1', image: true, block: false, line: 3 },
      { kind: 'artifact', href: '#/artifacts/ar-test-json', reference: true, line: 5 },
    ]);
  });

  it('validate: 存在しない ID、?step、参照形式はエラー。コードの中は数えない', () => {
    const body = '![a](#/artifacts/ar-absent)\n\n![b](#/artifacts/ar-test-json?step=1)\n\n![c][r]\n\n[r]: #/artifacts/ar-test-json\n\n`![d](#/artifacts/ar-none)`\n\n```\n![e](#/artifacts/ar-none)\n```';
    const found = issues({ artifacts: [jsonArtifact()], body }).filter((i) => i.code === 'artifact-ref');
    expect(found.map((i) => i.message)).toEqual([
      '参照先の実物 ar-absent がありません。',
      '実物の参照の形が違います（#/artifacts/ar-test-json?step=1）。`#/artifacts/` のあとには、`ar-` で始まる実物の id（英小文字・数字・ハイフン）だけを書きます。?step などは付けられません。',
      '実物の参照は参照形式では書けません。`![キャプション](#/artifacts/<id>)` の形で書いてください。',
    ]);
  });

  it('ビルドの突き合わせ: 検査と表示で読み方がずれる書き方を止める', () => {
    expect(crosscheckMarkdown('![実物](#/artifacts/ar-test-json)\n\n文の [実物](#/artifacts/ar-test-json) です。')).toEqual([]);
    expect(crosscheckMarkdown('![実物](#/artifacts/ar-test-json (題))')).toEqual([
      { line: 1, message: expect.stringContaining('実物の参照 #/artifacts/ar-test-json を、検査と表示で違って読んでいます') },
    ]);
  });
});

describe('validate', () => {
  it('ファイル名と id の不一致、id の重複、スキーマ違反はエラー', () => {
    const a = jsonArtifact();
    expect(codes({ raw: { 'artifacts/ar-other.json': a } })).toContain('error:path-mismatch');
    expect(codes({ artifacts: [a], raw: { 'artifacts/ar-copy.json': { ...a } } })).toContain('error:duplicate-id');
    expect(codes({ raw: { 'artifacts/ar-test-json.json': { ...a, format: 'yaml' } } })).toContain('error:schema');
  });
  it('検査のエラーと、注目点が少ない警告を出す', () => {
    expect(codes({ artifacts: [{ ...jsonArtifact(), notes: [note({ path: 'Nothing' })] }] })).toEqual(['error:artifact', 'warning:artifact-notes-few']);
  });
});

describe('検証状態', () => {
  const a = jsonArtifact();
  const ref = `![実物](#/artifacts/${a.id})`;
  const statusCodes = (opts) => issues(opts).filter((i) => /material|artifact-(ref-unverified|unreferenced)|schema/.test(i.code)).map((i) => `${i.level}:${i.code}`);

  it('区分 artifacts のスキーマとハッシュ（createdBy を除く）', () => {
    expect(schema.MaterialStatusSchema.safeParse({ artifacts: { [a.id]: rec(a) } }).success).toBe(true);
    expect(schema.MaterialStatusSchema.safeParse({ artifacts: { 'dg-x': rec(a) } }).success).toBe(false);
    expect(materialHash('artifacts', { ...a, createdBy: 'v9' })).toBe(materialHash('artifacts', a));
    expect(materialHash('artifacts', { ...a, factRefs: ['iam.global-key-principalorgid'] })).not.toBe(materialHash('artifacts', a));
  });
  it('検証済みで参照あり → なし。参照なし → 警告。内容が変わった → 警告', () => {
    expect(statusCodes({ artifacts: [a], status: { artifacts: { [a.id]: rec(a) } }, body: ref })).toEqual([]);
    expect(statusCodes({ artifacts: [a], status: { artifacts: { [a.id]: rec(a) } } })).toEqual(['warning:artifact-unreferenced']);
    expect(statusCodes({ artifacts: [{ ...a, title: '直したあとの題です' }], status: { artifacts: { [a.id]: rec(a) } }, body: ref }))
      .toEqual(['warning:material-stale-review', 'warning:artifact-ref-unverified']);
  });
  it('存在しない実物の記録はエラー。スキーマに通らない実物の記録は重ねない', () => {
    expect(statusCodes({ artifacts: [a], status: { artifacts: { 'ar-absent': rec(a) } } })).toEqual(['error:material-status-key']);
    expect(statusCodes({ raw: { [`artifacts/${a.id}.json`]: { ...a, extra: 1 } }, status: { artifacts: { [a.id]: rec(a) } } })).toEqual(['error:schema']);
  });
  it('本文が検証済みでない実物を指すと、画像とリンクで文を分けて警告する', () => {
    const found = issues({ artifacts: [a], status: { artifacts: { [a.id]: rec(a, 'needs-fix') } }, body: `${ref}\n\n[実物を開く](#/artifacts/${a.id})` })
      .filter((i) => i.code === 'artifact-ref-unverified');
    expect(found.map((i) => i.message)).toEqual([
      expect.stringMatching(/^本文 \d+ 行目: 検証済みでない実物 ar-test-json（要修正）を表示しようとしています。この実物はどのビルドでも出さず、本文だけを表示します$/),
      expect.stringMatching(/^本文 \d+ 行目: 検証済みでない実物 ar-test-json（要修正）をリンクで指しています。この実物はどのビルドでも出さないので、リンクを開くと「見つかりません」と表示します$/),
    ]);
  });
});

describe('ビルド', () => {
  const ver = jsonArtifact();
  const pend = tableArtifact();
  const fix = textArtifact();
  const status = { artifacts: { [ver.id]: rec(ver), [fix.id]: rec(fix, 'needs-fix') } };
  const body = [ver, pend, fix].map((a) => `![実物](#/artifacts/${a.id})`).join('\n\n');
  const build = (includeUnverified) => {
    const dirs = fixture({ artifacts: [ver, pend, fix], status, body });
    const built = buildContent({ ...dirs, schema, includeUnverified });
    const output = (key) => JSON.parse(fs.readFileSync(path.join(dirs.outDir, built.manifest.files[key].path), 'utf8'));
    return { built, output };
  };

  it('既定では検証済みだけを出し、除いた数を数え、除いた実物への参照を警告に出す', () => {
    const { built, output } = build(false);
    expect(built.ok).toBe(true);
    expect(output('artifact-index')).toEqual([{ id: ver.id, title: ver.title, kind: 'bucket-policy', kindLabel: 'バケットポリシー', format: 'json', status: 'verified' }]);
    expect(output(`artifact:${ver.id}`)).toMatchObject({ id: ver.id, status: 'verified', notes: [{ n: 1 }, { n: 2 }], ask: ver.ask });
    expect(built.manifest.files[`artifact:${pend.id}`]).toBeUndefined();
    expect(built.manifest.counts).toMatchObject({ artifacts: 1, artifactsExcluded: { pending: 1, 'needs-fix': 1, rejected: 0 } });
    expect(built.warnings.filter((w) => w.includes('出力から除いた'))).toEqual([
      expect.stringContaining(`実物 ${pend.id}（未検証）を出力から除いたため、本文では実物を省いて表示します`),
      expect.stringContaining(`実物 ${fix.id}（要修正）を出力から除いたため、本文では実物を省いて表示します`),
    ]);
  });

  it('--include-unverified では未検証も出し、要修正は出さない', () => {
    const { built, output } = build(true);
    expect(output('artifact-index').map((a) => [a.id, a.status])).toEqual([[ver.id, 'verified'], [pend.id, 'pending']]);
    expect(built.manifest.counts).toMatchObject({ artifacts: 2, artifactsExcluded: { pending: 0, 'needs-fix': 1, rejected: 0 } });
  });

  it('除く実物にも検査をかけ、存在しない実物の参照で止める', () => {
    const broken = buildContent({ ...fixture({ artifacts: [{ ...pend, rows: [['1']] }] }), schema });
    expect(broken.ok).toBe(false);
    expect(broken.errors).toContainEqual(expect.stringContaining(`artifacts/${pend.id}.json: rows の 1 行目のセル`));
    const missing = buildContent({ ...fixture({ artifacts: [ver], status: { artifacts: { [ver.id]: rec(ver) } }, body: `![実物](#/artifacts/${ver.id})\n\n![実物](#/artifacts/ar-absent)` }), schema });
    expect(missing).toMatchObject({ ok: false, manifest: null });
    expect(missing.errors).toEqual([expect.stringContaining('参照先の実物 ar-absent がありません')]);
  });
});
