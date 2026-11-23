// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import { parseDiagramRefs } from '../../../scripts/lib/diagram.mjs';
import { materialHash } from '../../../scripts/lib/material-status.mjs';
import { normalizeInlineCheckQuestion, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { buildContent } from '../lib/content-build.mjs';
import { architecture, decision, layers, lessonId, position, timeline } from './diagram-fixtures.mjs';

const repoContent = new URL('../../../content/saa-c03/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, repoContent), 'utf8');
const lessonRel = `lessons/d4/${lessonId}.md`;
const sheetRel = 'cheatsheets/cheatsheet-test.md';
const guideRel = 'guides/guide-test.md';
const storageBody = '保存するデータの性質を調べます。保存期間と読み取りの頻度を確認し、すぐに読み出す必要があるかを決めます。要件が変わったときは、移行にかかる時間と費用も確かめます。';
const doc = (id, title) => `---
id: ${id}
title: ${title}
order: 10
taskStatements: []
services: []
createdBy: v1
---
`;
const markdown = {
  [lessonRel]: `---
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

${storageBody}

よく使うデータと、長期保存が必要なデータを分けて考えます。たとえば運用中に何度も読むログと、監査のときだけ読むログでは、読み出しに許される時間が異なります。

候補を比べるときは、保管料金に加えて読み出しや移行にかかる費用を確認します。利用頻度の変化を見込んで、選んだ保存先が条件に合い続けるかも確認します。
`,
  [sheetRel]: `${doc('cheatsheet-test', '保存先の早見表')}
${storageBody}
候補ごとに条件を照らし合わせ、必要な機能を満たすものを選びます。
`,
  [guideRel]: `${doc('guide-test', '読み方のガイド')}
はじめに見出しを読んで、何を学ぶところかを確認します。本文に例が出てきたら、条件を一つずつ拾い、選んだ方法で満たせるかを確かめます。読み終えたら判断の理由を自分の言葉で書き、条件が変わっても使える考え方をまとめます。
`,
};
const md = (rel, addition) => `${markdown[rel]}\n${addition}\n`;
const check = [
  '> **その場の確認**',
  '> 保存できますか？',
  '>',
  '> - [ ] できません',
  '> * [X] できます',
  '>',
  '> 保存する仕組みを備えているからです。',
].join('\n');

const tmp = [];
afterEach(() => {
  for (const root of tmp.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-chart-'));
  tmp.push(root);
  const contentDir = path.join(root, 'content', 'saa-c03');
  const outDir = path.join(root, 'out');
  const source = {
    'blueprint.json': read('blueprint.json'), 'services.json': read('services.json'), 'review-status.json': {},
    [lessonRel]: markdown[lessonRel], ...files,
  };
  for (const [rel, value] of Object.entries(source)) {
    const dest = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root, contentDir, outDir };
}

const diagramFile = (d) => [`diagrams/${d.id}.json`, d];
// 図を検証済みとして記録した material-status.json（未検証の図への参照の警告を出さないため）
const verifiedFile = (...ds) => ['material-status.json', {
  diagrams: Object.fromEntries(ds.map((d) => [d.id, { status: 'verified', checkedAt: '2026-11-23', hash: materialHash('diagrams', d) }])),
}];
const issues = (files) => checkContent(loadContent({ root: fixture(files).root })).issues;

it('図への参照を画像・リンクから読み取り、正しい形だけ id と step を得ます', () => {
  expect(parseDiagramRefs('[図](#/diagrams/dg-test-architecture) ![図](#/diagrams/dg-test-position?step=0) [誤り](#/diagrams/dg-test-position?step=-1)')).toEqual([
    { href: '#/diagrams/dg-test-architecture', id: 'dg-test-architecture', step: undefined },
    { href: '#/diagrams/dg-test-position?step=0', id: 'dg-test-position', step: 0 },
    { href: '#/diagrams/dg-test-position?step=-1' },
  ]);
});

it('タイトルつきの図参照とキャプションに角括弧を含む図参照を読み取ります', () => {
  const source = [
    '![図](#/diagrams/dg-none "題")',
    "[図](#/diagrams/dg-test-position?step=0 '題')",
    '![外側 [内側] の図](#/diagrams/dg-test-layers)',
  ].join('\n');
  expect(parseDiagramRefs(source)).toEqual([
    { href: '#/diagrams/dg-none', id: 'dg-none', step: undefined },
    { href: '#/diagrams/dg-test-position?step=0', id: 'dg-test-position', step: 0 },
    { href: '#/diagrams/dg-test-layers', id: 'dg-test-layers', step: undefined },
  ]);
  expect(issues({
    [lessonRel]: md(lessonRel, source),
    ...Object.fromEntries([position(), layers()].map(diagramFile)),
  }).filter(({ code }) => code === 'diagram-ref')).toEqual([
    expect.objectContaining({ level: 'error', message: '参照先の図 dg-none がありません。' }),
  ]);
});

it('インラインコードとコードフェンスの中にある図参照の例は読みません', () => {
  const example = '![図](#/diagrams/dg-none)';
  const source = [
    `例は \`${example}\` です。`,
    `\`\`中に \` を含む ${example}\`\``,
    `\`\`複数行の例\n${example}\`\`です。`,
    '',
    '````markdown', example, '[参照]: #/diagrams/dg-none', '```', example, '````',
    '',
    '~~~markdown', example, '~~~閉じる行ではありません', example, '~~~~',
    '',
    '> ~~~markdown', `> ${example}`, '> ~~~',
    '',
    '> ~~~markdown', `> ${example}`,
    '',
    '1. ~~~markdown', `   ${example}`, '   ~~~',
    '',
    '10. 記法の例', '    ~~~markdown', `    ${example}`, '    ~~~',
    '',
    '![`コード`を含む図](#/diagrams/dg-test-layers)',
  ].join('\n');
  expect(parseDiagramRefs(source)).toEqual([
    { href: '#/diagrams/dg-test-layers', id: 'dg-test-layers', step: undefined },
  ]);
});

it('図の参照形式を読み取り、validate とビルドでエラーにします', () => {
  const source = '![図][ref]\n\n[ref]: <#/diagrams/dg-test-layers> "題"';
  expect(parseDiagramRefs(source)).toEqual([{ href: '#/diagrams/dg-test-layers', reference: true }]);
  const files = { [guideRel]: md(guideRel, source), ...Object.fromEntries([layers()].map(diagramFile)) };
  const message = '図の参照は参照形式では書けません。`![キャプション](#/diagrams/<id>)` の形で書いてください。';
  expect(issues(files).filter(({ code }) => code === 'diagram-ref')).toEqual([
    expect.objectContaining({ level: 'error', message }),
  ]);
  const dirs = fixture(files);
  expect(buildContent({ ...dirs, schema })).toMatchObject({ ok: false, manifest: null, errors: [`${guideRel}: ${message}`] });
  expect(fs.existsSync(dirs.outDir)).toBe(false);
});

it('validate は参照の形・図の不在・段階の超過を本文ごとに報告します', () => {
  const found = issues({
    [lessonRel]: md(lessonRel, '![図](#/diagrams/dg-test-architecture?step=-1)\n\n[図](#/diagrams/dg-test-architecture?step=2)'),
    [sheetRel]: md(sheetRel, '[図](#/diagrams/dg-absent)'),
    [guideRel]: md(guideRel, '[図](#/diagrams/dg-test-layers?step=1)'),
    ...Object.fromEntries([architecture(), layers()].map(diagramFile)),
  }).filter(({ code }) => code === 'diagram-ref');
  expect(found).toHaveLength(4);
  expect(found.every(({ level }) => level === 'error')).toBe(true);
  expect(found.map(({ message }) => message)).toEqual(expect.arrayContaining([
    expect.stringContaining('参照の形が違います'), expect.stringContaining('図 dg-absent がありません'),
    expect.stringContaining('段階の数（1）'), expect.stringContaining('段階の数（0）'),
  ]));
});

it.each([false, true])('有効な図が 0 枚でも本文の参照を検査します（スキーマ違反の図あり: %s）', (invalid) => {
  const d = { ...architecture(), alt: '' };
  const found = issues({
    [lessonRel]: md(lessonRel, '![図](#/diagrams/dg-test-architecture)'),
    ...(invalid ? Object.fromEntries([diagramFile(d)]) : {}),
  });
  expect(found.filter(({ code }) => code === 'diagram-ref')).toEqual([
    expect.objectContaining({ message: '参照先の図 dg-test-architecture がありません。' }),
  ]);
});

it('その場の確認の行番号、複数行の問いと理由、選択肢を読み取ります', () => {
  const quote = `${check.replace('？', '？\n> 条件を考えましょう。')}\n> 補足です。\n>`;
  const source = `# 題\r\n\r\n${quote.replace(/^/gm, ' ')}\n引用の外です。`;
  expect(parseInlineChecks(source)).toMatchObject([{
    line: 3,
    endLine: 12,
    question: '保存できますか？\n条件を考えましょう。',
    questionKey: '保存できますか？ 条件を考えましょう。',
    options: [{ text: 'できません', correct: false }, { text: 'できます', correct: true }],
    reason: '保存する仕組みを備えているからです。\n補足です。',
    problems: [],
  }]);
});

it.each([
  ['選択肢から', 3],
  ['理由だけ', 6],
])('リスト内の確認で%s字下げを忘れると validate が報告します', (_label, indented) => {
  const lines = check.split('\n');
  const source = ['- 項目', '', ...lines.slice(0, indented).map((line) => `  ${line}`), ...lines.slice(indented)].join('\n');
  const problem = '確認の行の字下げを見出しの行とそろえてください。';
  expect(parseInlineChecks(source)).toMatchObject([{ line: 3, endLine: 9, problems: [problem] }]);
  expect(issues({ [sheetRel]: md(sheetRel, source) })).toEqual([
    expect.objectContaining({ level: 'error', code: 'inline-check', message: expect.stringContaining(problem) }),
  ]);
});

it('全角空白だけの行を引用を分ける空行として扱いません', () => {
  const source = `> 前置きです。\n　\n${check}`;
  const problem = 'その場の確認は、前の引用と空行で分けてください。';
  expect(parseInlineChecks(source)).toMatchObject([{ line: 3, problems: [problem] }]);
  expect(issues({ [sheetRel]: md(sheetRel, source) })).toEqual([
    expect.objectContaining({ level: 'error', code: 'inline-check', message: expect.stringContaining(problem) }),
  ]);
});

it.each([
  '> **その場の確認：**',
  '> **その場の確認:**',
  '> **その場の確認** 問いですか？',
  '> **その場の確認：** 問いですか？',
  '> **その場の確認**：問いですか？',
])('見出しにコロンや続きがあると validate が報告します（%#）', (heading) => {
  const source = check.replace('> **その場の確認**', heading);
  const problem = '見出しは `> **その場の確認**` だけの行にしてください。';
  expect(parseInlineChecks(source)).toMatchObject([{ line: 1, problems: [problem] }]);
  expect(issues({ [sheetRel]: md(sheetRel, source) })).toEqual([
    expect.objectContaining({ level: 'error', code: 'inline-check', message: expect.stringContaining(problem) }),
  ]);
});

it('引用のあるコードフェンスの直後に書いた確認を validate が通します', () => {
  const source = '```text\n> 例です。\n> **その場の確認：**\n```\n' + check;
  expect(parseInlineChecks(source)).toMatchObject([{ line: 5, problems: [] }]);
  expect(issues({ [sheetRel]: md(sheetRel, source) })).toEqual([]);
});

it.each([
  ['選択肢', check.replace('[X] できます', '[X] ![図](#/diagrams/dg-test-layers)')],
  ['選択肢', check.replace('[X] できます', '[X] ![画像](example.png)')],
  ['選択肢', check.replace('[X] できます', '[X] [図](<#/diagrams/dg-test-layers>)')],
  ['問い', check.replace('保存できますか？', '保存できますか？\n>\n> ![図](#/diagrams/dg-test-layers)')],
  ['問い', check.replace('保存できますか？', '# [図](#/diagrams/dg-test-layers)について')],
])('文字だけで表示する%sに画像や図へのリンクを書くと validate が報告します（%#）', (part, source) => {
  const problem = `${part}に図・実物・画像と、図や実物へのリンクは書けません。`;
  expect(parseInlineChecks(source)).toMatchObject([{ problems: [problem] }]);
  // 図は未検証なので、図を指す行には未検証の図への参照の警告も出る（ここでは確かめない）
  const found = issues({ [sheetRel]: md(sheetRel, source), ...Object.fromEntries([layers()].map(diagramFile)) });
  expect(found.filter(({ code }) => code !== 'diagram-ref-unverified')).toEqual([
    expect.objectContaining({ level: 'error', code: 'inline-check', message: expect.stringContaining(problem) }),
  ]);
});

it.each([
  '> **試験のポイント**\n> 大事な点です。',
  '> 前置きです。\n>',
])('前の引用と空行で分けていない確認をパーサーと validate が報告します（%#）', (quote) => {
  const source = [
    quote, '> **その場の確認**', '> 問いですか？', '>',
    '> - [ ] いいえ', '> - [x] はい', '>', '> 理由です。',
  ].join('\n');
  const problem = 'その場の確認は、前の引用と空行で分けてください。';
  expect(parseInlineChecks(source)).toMatchObject([{ line: 3, problems: [problem] }]);
  expect(issues({ [sheetRel]: md(sheetRel, source) }).filter(({ code }) => code === 'inline-check')).toEqual([
    expect.objectContaining({ level: 'error', message: expect.stringContaining(problem) }),
  ]);
});

it.each([
  ['ふつうの引用', '> 前置きです。\n続きの行です。', 3],
  ['囲み記事', '> **試験のポイント**\n> 大事な点です。\n続きの行です。', 4],
])('%sの遅延継続のあとに空行なしで書いた確認を報告します', (_label, quote, line) => {
  const source = `${quote}\n${check}`;
  const problem = 'その場の確認は、前の引用と空行で分けてください。';
  expect(parseInlineChecks(source)).toMatchObject([{ line, problems: [problem] }]);
  expect(issues({ [sheetRel]: md(sheetRel, source) }).filter(({ code }) => code === 'inline-check')).toEqual([
    expect.objectContaining({ level: 'error', message: expect.stringContaining(problem) }),
  ]);
});

it.each([
  [check.replace('> 保存できますか？\n', ''), '問いがありません'],
  [check.replace('保存できますか？', '問'.repeat(121)), '問いは 120 字まで'],
  [check.replace('> - [ ] できません\n', ''), '選択肢は 2〜4 個'],
  [check.replace('[X]', '[ ]'), '正解（[x]）は 1 個'],
  [check.replace('[ ]', '[x]'), '正解（[x]）は 1 個'],
  [check.replace('> 保存する仕組みを備えているからです。', ''), '理由がありません'],
  [check.replace('> * [X]', '> 別の行です。\n> * [X]'), '選択肢の並びの途中に別の行'],
])('その場の確認の誤りをパーサーと validate が報告します（%#）', (bad, problem) => {
  expect(parseInlineChecks(bad)[0].problems).toEqual([expect.stringContaining(problem)]);
  const found = issues({ [sheetRel]: md(sheetRel, bad), [guideRel]: md(guideRel, bad) });
  expect(found).toHaveLength(2);
  expect(found.every(({ level, code, message }) => level === 'error' && code === 'inline-check' && message.includes(problem))).toBe(true);
});

it('コードフェンスの中の記法の例は、その場の確認として読みません', () => {
  const source = ['```markdown', '> **その場の確認**', '> 問いだけの例です。', '```', '', '~~~', '> **その場の確認**', '~~~'].join('\n');
  expect(parseInlineChecks(source)).toEqual([]);
  expect(parseInlineChecks(`${source}\n\n${check}`)).toHaveLength(1);
});

it.each([1, 2])('レッスンにその場の確認が %s 個なら警告します', (n) => {
  const checks = [check, check.replace('保存できますか', '読み取れますか')];
  const found = issues({ [lessonRel]: md(lessonRel, checks.slice(0, n).join('\n\n')) });
  expect(found).toEqual([expect.objectContaining({ level: 'warning', code: 'inline-check-few' })]);
});

it.each([
  ['レッスン', lessonRel], ['早見表', sheetRel], ['ガイド', guideRel],
])('%sの同じ問いを強調・インラインコード・空白の違いを除いて検出します', (_label, rel) => {
  const first = check.replace('保存できますか？', '**条件を** 満たしますか？');
  const second = check.replace('保存できますか？', '_条件を_\n>   `満たしますか？`');
  const body = md(rel, `${first}\n\n${second}`);
  const firstLine = markdown[rel].split('\n---\n')[1].split('\n').length + 1;
  const secondLine = firstLine + first.split('\n').length + 1;
  expect(issues({ [rel]: body }).filter(({ code }) => code === 'inline-check')).toEqual([
    expect.objectContaining({
      level: 'error',
      message: `本文 ${secondLine} 行目: 問いの文が ${firstLine} 行目の確認と同じです。問いの文を変えてください（記録の checkId が重なります）。`,
    }),
  ]);
});

it('正しい参照とその場の確認にはエラーも警告も出ません', () => {
  const repeat = ['保存', '処理', '読み取り'].map((verb) => check.replace('保存できますか', `${verb}できますか`));
  expect(issues({
    [lessonRel]: md(lessonRel, ['![図](#/diagrams/dg-test-architecture?step=1)', ...repeat].join('\n\n')),
    [sheetRel]: md(sheetRel, `[図](#/diagrams/dg-test-layers?step=0)\n\n${check}`),
    [guideRel]: md(guideRel, `[図](#/diagrams/dg-test-layers)\n\n${check}`),
    ...Object.fromEntries([architecture(), layers()].map(diagramFile)),
    ...Object.fromEntries([verifiedFile(architecture(), layers())]),
  })).toEqual([]);
});

it.each([
  ['リンク', '[保存](https://example.com/storage)できますか？'],
  ['取り消し線', '~~保存~~できますか？'],
])('問いの文に%sだけを付けても validate が重複を報告します', (_label, decorated) => {
  const source = `${check}\n\n${check.replace('保存できますか？', decorated)}`;
  expect(issues({ [lessonRel]: md(lessonRel, source) }).filter(({ code }) => code === 'inline-check')).toEqual([
    expect.objectContaining({ level: 'error', message: expect.stringContaining('確認と同じです。') }),
  ]);
});

it('問いの画像・タグ・文字参照・強調を正規化し、語中のアンダースコアを残します', () => {
  expect(normalizeInlineCheckQuestion(
    ' __![保存](https://example.com/storage)__ <b title="a > b">先</b> \n' +
    ' `snake_case` &amp; &lt;値&gt; &quot;例&quot; &#39; &#65; &#x1F4BE; は ~~同じ~~ ですか？ ',
  )).toBe('保存 先 snake_case & <値> "例" \' A 💾 は 同じ ですか？');
});

it.each([
  ['<b>太字</b>ですか', '太字ですか'],
  ['<span title="a > b">x</span>', 'x'],
  ["<a href='x'>リンク</a>", 'リンク'],
  ['<br/>', ''],
  ['<br />', ''],
  ['<img src=x />', ''],
  ['<a\nhref="x">y</a>', 'y'],
  ['a < b', 'a < b'],
  ['<3', '<3'],
  ['<a', '<a'],
])('問いのタグと不等号の正規化は従来どおりです（%#）', (question, expected) => {
  expect(normalizeInlineCheckQuestion(question)).toBe(expected);
});

it('閉じていないタグのあとに空白が 64,000 字続いても問いを正規化できます', () => {
  expect(normalizeInlineCheckQuestion('<a' + ' '.repeat(64000))).toBe('<a');
});

it('4 種類の図が、未検証も出すビルドの索引と個別の出力に現れます', () => {
  const diagrams = [decision(), position(), timeline(), layers()];
  const dirs = fixture({
    ...Object.fromEntries(diagrams.map(diagramFile)),
    [lessonRel]: md(lessonRel, '![図](#/diagrams/dg-test-decision?step=0)'),
  });
  const built = buildContent({ ...dirs, schema, includeUnverified: true });
  expect(built.errors).toEqual([]);
  expect(built.ok).toBe(true);
  const output = (key) => JSON.parse(fs.readFileSync(path.join(dirs.outDir, built.manifest.files[key].path), 'utf8'));
  expect(output('diagram-index')).toHaveLength(4);
  for (const { id, type, title } of diagrams) {
    expect(output('diagram-index')).toContainEqual({ id, type, title, steps: 0, status: 'pending' });
    expect(built.manifest.files[`diagram:${id}`].path).toMatch(new RegExp(`^diagrams/${id}\\.[0-9a-f]{12}\\.json$`));
    expect(output(`diagram:${id}`)).toMatchObject({ id, type, title, shapes: expect.any(Array) });
  }
});

it('図の参照が切れていると、ビルドは出力を作る前に止まります', () => {
  const dirs = fixture({ [guideRel]: md(guideRel, '![図](#/diagrams/dg-absent)') });
  const built = buildContent({ ...dirs, schema });
  expect(built).toMatchObject({ ok: false, manifest: null, errors: [expect.stringContaining(`${guideRel}: 参照先の図 dg-absent`)] });
  expect(fs.existsSync(dirs.outDir)).toBe(false);
});

it.each([
  ['レッスン', lessonRel], ['早見表', sheetRel], ['ガイド', guideRel],
])('%sの確認にずれがあると、ビルドは出力を作る前に本文の行を報告します', (_label, rel) => {
  const source = md(rel, `<div>\n${check}`);
  const body = source.split('\n---\n')[1];
  const line = body.split('\n').indexOf('> **その場の確認**') + 1;
  const dirs = fixture({ [rel]: source });
  expect(buildContent({ ...dirs, schema })).toMatchObject({
    ok: false,
    manifest: null,
    errors: [expect.stringContaining(`${rel}: 本文 ${line} 行目: その場の確認が表示では確認として扱われません`)],
  });
  expect(fs.existsSync(dirs.outDir)).toBe(false);
});
