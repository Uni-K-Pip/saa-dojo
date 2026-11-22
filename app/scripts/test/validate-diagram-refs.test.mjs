// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import { parseDiagramRefs } from '../../../scripts/lib/diagram.mjs';
import { parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { buildContent } from '../lib/content-build.mjs';
import { architecture, decision, layers, lessonId, position, timeline } from './diagram-fixtures.mjs';

const repoContent = new URL('../../../content/saa-c03/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, repoContent), 'utf8');
const lessonRel = `lessons/d4/${lessonId}.md`;
const sheetRel = 'cheatsheets/cheatsheet-block-file-storage.md';
const guideRel = 'guides/guide-exam-strategy.md';
const md = (rel, addition) => `${read(rel)}\n\n${addition}\n`;
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
    [lessonRel]: read(lessonRel), ...files,
  };
  for (const [rel, value] of Object.entries(source)) {
    const dest = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root, contentDir, outDir };
}

const diagramFile = (d) => [`diagrams/${d.id}.json`, d];
const issues = (files) => checkContent(loadContent({ root: fixture(files).root })).issues;

it('図への参照を画像・リンクから読み取り、正しい形だけ id と step を得ます', () => {
  expect(parseDiagramRefs('[図](#/diagrams/dg-test-architecture) ![図](#/diagrams/dg-test-position?step=0) [誤り](#/diagrams/dg-test-position?step=-1)')).toEqual([
    { href: '#/diagrams/dg-test-architecture', id: 'dg-test-architecture', step: undefined },
    { href: '#/diagrams/dg-test-position?step=0', id: 'dg-test-position', step: 0 },
    { href: '#/diagrams/dg-test-position?step=-1' },
  ]);
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
  const source = `# 題\r\n\r\n ${check.replace('？', '？\n> 条件を考えましょう。')}\n> 補足です。\n>\n引用の外です。`;
  expect(parseInlineChecks(source)).toEqual([{
    line: 3,
    question: '保存できますか？\n条件を考えましょう。',
    options: [{ text: 'できません', correct: false }, { text: 'できます', correct: true }],
    reason: '保存する仕組みを備えているからです。\n補足です。',
    problems: [],
  }]);
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
  const found = issues({ [lessonRel]: md(lessonRel, Array(n).fill(check).join('\n\n')) });
  expect(found).toEqual([expect.objectContaining({ level: 'warning', code: 'inline-check-few' })]);
});

it('正しい参照とその場の確認にはエラーも警告も出ません', () => {
  const repeat = ['保存', '処理', '読み取り'].map((verb) => check.replace('保存できますか', `${verb}できますか`));
  expect(issues({
    [lessonRel]: md(lessonRel, ['![図](#/diagrams/dg-test-architecture?step=1)', ...repeat].join('\n\n')),
    [sheetRel]: md(sheetRel, `[図](#/diagrams/dg-test-layers?step=0)\n\n${check}`),
    [guideRel]: md(guideRel, `[図](#/diagrams/dg-test-layers)\n\n${check}`),
    ...Object.fromEntries([architecture(), layers()].map(diagramFile)),
  })).toEqual([]);
});

it('4 種類の図がビルドの索引と個別の出力に現れます', () => {
  const diagrams = [decision(), position(), timeline(), layers()];
  const dirs = fixture({
    ...Object.fromEntries(diagrams.map(diagramFile)),
    [lessonRel]: md(lessonRel, '![図](#/diagrams/dg-test-decision?step=0)'),
  });
  const built = buildContent({ ...dirs, schema });
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
