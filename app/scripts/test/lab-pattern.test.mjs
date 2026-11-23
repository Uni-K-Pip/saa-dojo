// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { CourseSchema, courseItemKey } from '../../../scripts/lib/course.mjs';
import { checkLab, checkPattern, LAB_SECTIONS, PATTERN_SECTIONS } from '../../../scripts/lib/lab-pattern.mjs';
import { materialHash, materialHashInput } from '../../../scripts/lib/material-status.mjs';
import { buildContent, parseContent, readContentFiles } from '../lib/content-build.mjs';
import { architecture, lessonId } from './diagram-fixtures.mjs';

const diagram = architecture();
const common = { order: 10, knowledgeRefs: ['4.1-K1'], services: ['Amazon Simple Storage Service'], diagram: diagram.id, createdBy: 't' };
const lab = { ...common, id: 'lab-test-storage', title: '保存先を組み立てる', unit: 'u00', estimatedMinutes: 15 };
const pattern = { ...common, id: 'pattern-test-storage', title: '保存先を設計する', taskStatements: ['4.1'], qualifiers: ['cost'] };
const ctx = {
  diagrams: new Map([[diagram.id, { type: 'architecture', steps: 1 }]]),
  itemIds: new Set(['4.1-K1']),
  taskIds: new Set(['4.1']),
  unitIds: new Set(['u00']),
};
const diagramRef = `![図](#/diagrams/${diagram.id}?step=1)`;
const check = (n) => `> **その場の確認**
> 確認 ${n} の結果を選んでください。
>
> - [x] 動作します
> - [ ] 停止します
>
> 条件を満たしているため動作します。`;
const paragraph = '要件と部品の関係を確かめます。'.repeat(15);

function labBody({ steps = 5, breaks = 2, sections = LAB_SECTIONS } = {}) {
  const contents = {
    ゴール: `${diagramRef}\n\n${paragraph}`,
    手順: Array.from({ length: steps }, (_, i) => `### ${i + 1}. 部品を用意する\n\n${paragraph}\n\n${diagramRef}`).join('\n\n'),
    壊してみる: Array.from({ length: breaks }, (_, i) => check(i + 1)).join('\n\n'),
    確認問題: '- `saa-4.1-t-001`\n- `saa-4.1-t-002`\n- `saa-4.1-t-003`\n- `saa-basics-t-001`',
  };
  return `導入です。\n\n${sections.map((title) => `## ${title}\n\n${contents[title] ?? paragraph}`).join('\n\n')}\n`;
}
const patternBody = PATTERN_SECTIONS.map((title) => `## ${title}\n\n${paragraph}`).join('\n\n') + '\n';
const markdown = (data, body) => `---\n${Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${body}`;
const labRel = `labs/${lab.id}.md`;
const patternRel = `patterns/${pattern.id}.md`;
const course = (items) => ({ stages: [
  { id: 0, title: '土台', goal: '仕組みを学びます。', units: [{ id: 'u00', title: '保存先', items }] },
  { id: 1, title: '中心', goal: '応用を学びます。', units: [{ id: 'u01', title: '設計', items: [{ kind: 'drill' }] }] },
] });
const lessonItem = { kind: 'lesson', ref: lessonId };
const labItem = { kind: 'lab', ref: lab.id };
const patternItem = { kind: 'pattern', ref: pattern.id };
const question = (id, pool, taskStatement = '4.1') => ({
  id, pool, taskStatement, exam: 'SAA-C03', domain: taskStatement === 'basics' ? 0 : 4,
  knowledgeRefs: [`${taskStatement}-K1`], services: ['Amazon S3'], qualifier: 'cost',
  tags: [], difficulty: 2, type: 'single', selectCount: 1, stem: paragraph.slice(0, 170),
  options: ['a', 'b', 'c', 'd'].map((letter, index) => ({
    id: letter, text: `選択肢 ${index + 1}`, rationale: '選択肢の条件と要件を照らし合わせます。', correct: index === 0,
  })),
  explanation: paragraph, keyPoints: ['要件と部品の関係を確かめます。'],
  references: [{ title: 'Amazon S3', url: 'https://docs.aws.amazon.com/s3/' }],
  lessonRefs: [lessonId], needsSourceCheck: false, createdBy: 't', createdAt: '2026-11-23',
});
const rec = (section, data, body, status = 'verified') => ({
  status, checkedAt: '2026-11-23', hash: materialHash(section, materialHashInput(section, { data, body })),
});

const tmp = [];
afterEach(() => {
  for (const root of tmp.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-lab-pattern-'));
  tmp.push(root);
  const contentDir = path.join(root, 'content', 'saa-c03');
  const outDir = path.join(root, 'out');
  const read = (rel) => fs.readFileSync(new URL(`../../../content/saa-c03/${rel}`, import.meta.url), 'utf8');
  const source = {
    'blueprint.json': read('blueprint.json'), 'services.json': read('services.json'), 'review-status.json': {},
    [`lessons/d4/${lessonId}.md`]: markdown({
      id: lessonId, title: '保存先の基礎', domain: 4, taskStatement: '4.1', order: 1,
      knowledgeRefs: ['4.1-K1'], services: [], estimatedMinutes: 5, createdBy: 't',
    }, paragraph.repeat(4)),
    [`diagrams/${diagram.id}.json`]: diagram,
    [labRel]: markdown(lab, labBody()),
    [patternRel]: markdown(pattern, patternBody),
    ...extra,
  };
  for (const [rel, value] of Object.entries(source)) {
    const dest = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const validate = () => checkContent(loadContent({ root })).issues;
  const build = (includeUnverified = false) => {
    const built = buildContent({ contentDir, outDir, schema, includeUnverified });
    const output = (key) => JSON.parse(fs.readFileSync(path.join(outDir, built.manifest.files[key].path), 'utf8'));
    return { ...built, output };
  };
  return { validate, build, root, contentDir };
}

describe('ミニラボと設計パターンの共通検査', () => {
  const inspect = (body, data = lab, context = ctx) => checkLab({ data, body }, context);

  it('固定見出しに前置きとコードの例があっても通る', () => {
    const example = '```markdown\n## 余分な見出し\n### 12. 手順の例\n```\n\n~~~~markdown\n## 手順\n~~~\n### 0. 手順の例\n~~~~\n\n';
    expect(inspect(example + labBody())).toEqual({ errors: [], warnings: [] });
    expect(checkPattern({ data: pattern, body: patternBody }, ctx)).toEqual({ errors: [], warnings: [] });
    expect(inspect(labBody().replace('## ゴール', '  ##\tゴール ###  ')).errors).toEqual([]);
  });

  it.each([
    ['手順の欠け', labBody({ sections: LAB_SECTIONS.filter((title) => title !== '手順') }), '固定の見出し『## 手順』がありません'],
    ['順の違い', labBody({ sections: ['手順', 'ゴール', ...LAB_SECTIONS.slice(2)] }), '『## ゴール』のあとに置いてください'],
    ['一覧にない見出し', labBody() + '\n## 余分な見出し\n', '一覧にない見出し'],
    ['見出しの重複', labBody() + '\n## ゴール\n', '見出し『## ゴール』が重複しています'],
    ['番号の飛び', labBody().replace('### 2.', '### 3.'), '手順の番号は 2 にしてください'],
    ['番号の重複', labBody().replace('### 2.', '### 1.'), '手順の番号は 2 にしてください'],
    ['手順の形の違い', labBody().replace('### 2.', '### 二番目'), '「### 番号. 題」の形'],
    ['手順がない', labBody({ steps: 0 }), '小見出し（### 1. 題）がありません'],
  ])('%s を検出する', (_, body, message) => {
    expect(inspect(body).errors).toContainEqual(expect.stringContaining(message));
  });

  it('手順数、その場の確認の数、図の段階参照、字数を警告にする', () => {
    expect(inspect(labBody({ steps: 10, breaks: 1 }).replaceAll('?step=1', '')).warnings.map(({ code }) => code))
      .toEqual([...Array(10).fill('lab-step-diagram'), 'lab-steps', 'lab-breaks']);
    expect(inspect(LAB_SECTIONS.map((title) => `## ${title}`).join('\n')).warnings.map(({ code }) => code)).toContain('lab-length');
    expect(checkPattern({ data: pattern, body: '短い本文' }, ctx).warnings.map(({ code }) => code)).toEqual(['pattern-length']);
  });

  it('図の存在・種類・段階、項目、タスク、ユニットを確かめる', () => {
    const body = labBody();
    expect(inspect(body, { ...lab, diagram: 'dg-missing', unit: 'u99', knowledgeRefs: ['4.1-K99'] }).errors)
      .toEqual(['図 dg-missing が見つかりません', 'knowledgeRefs が blueprint にありません: 4.1-K99', 'ユニット u99 が学習コースにありません']);
    for (const type of ['architecture', 'position']) {
      const bad = { ...ctx, diagrams: new Map([[diagram.id, { type, steps: 0 }]]) };
      expect(inspect(body, lab, bad).errors).toEqual([`図 ${diagram.id} は段階表示つきの構成図にしてください`]);
    }
    expect(inspect(body, { ...lab, unit: 'u99' }, { ...ctx, unitIds: undefined }).errors).toEqual([]);
    expect(checkPattern({ data: { ...pattern, taskStatements: ['4.5'] }, body: patternBody }, ctx).errors)
      .toEqual(['taskStatements が blueprint にありません: 4.5']);
  });

  it.each([
    ['固定の見出しが欠ける', { body: labBody({ sections: LAB_SECTIONS.slice(1) }) }, 'エラー', '固定の見出し『## ゴール』がありません'],
    ['見出しの順が違う', { body: labBody({ sections: ['手順', 'ゴール', ...LAB_SECTIONS.slice(2)] }) }, 'エラー', 'のあとに置いてください'],
    ['図が存在しない', { data: { ...lab, diagram: 'dg-missing' } }, 'エラー', '図 dg-missing が見つかりません'],
    ['手順数が多い', { body: labBody({ steps: 10 }) }, '警告', '手順の数は 10 手です'],
  ])('%s ときは validate とビルドの判定が同じ', (_, { body = labBody(), data = lab }, level, message) => {
    const { validate, build } = fixture({ [labRel]: markdown(data, body) });
    const error = level === 'エラー';
    expect(validate()).toContainEqual(expect.objectContaining({ level: error ? 'error' : 'warning', message: expect.stringContaining(message) }));
    const built = build();
    expect(built.ok).toBe(!error);
    expect(error ? built.errors : built.warnings).toContainEqual(expect.stringContaining(`${labRel}:`));
    expect(error ? built.errors : built.warnings).toContainEqual(expect.stringContaining(message));
  });

  it('表示だけが認識する setext 見出しをファイルと行付きで止める', () => {
    const { validate, build } = fixture({ [patternRel]: markdown(pattern, `追加の見出し\n---\n\n${patternBody}`) });
    expect(validate().filter((issue) => issue.level === 'error')).toEqual([]);
    expect(build().errors).toContainEqual(expect.stringContaining(`${patternRel}: 本文 1 行目: 見出しを、検査と表示で違って読んでいます`));
  });

  it('手順の題に書いたコードを、本文の表示でそのまま扱える', () => {
    const body = labBody().replace('### 1. 部品を用意する', '### 1. `Amazon S3` を用意する');
    const built = fixture({ [labRel]: markdown(lab, body) }).build(true);
    expect(built.ok, built.errors.join('\n')).toBe(true);
    expect(built.output(`lab:${lab.id}`).body).toBe(body);
  });

  it('未検証の本文でも図・実物の参照とその場の確認を検査する', () => {
    const { validate, build } = fixture({
      [labRel]: markdown(lab, labBody().replace('?step=1', '?step=10') + '\n[実物](#/artifacts/ar-missing)\n'),
      [patternRel]: markdown(pattern, patternBody + '\n' + check(1).replace('[x]', '[ ]')),
    });
    const issues = validate();
    for (const code of ['diagram-ref', 'artifact-ref', 'inline-check']) {
      expect(issues).toContainEqual(expect.objectContaining({ code, level: 'error' }));
    }
    const built = build();
    expect(built.ok).toBe(false);
    for (const message of ['step=10', 'ar-missing', '確認として表示されない引用の中にタスクリスト']) {
      expect(built.errors).toContainEqual(expect.stringContaining(message));
    }
  });

  it('教材のスキーマ、ファイル名と id、重複を検査する', () => {
    expect(schema.LabFrontSchema.safeParse({ ...lab, estimatedMinutes: 26 }).success).toBe(false);
    expect(schema.PatternFrontSchema.safeParse({ ...pattern, qualifiers: ['cost', 'cost'] }).success).toBe(false);
    expect(schema.PatternFrontSchema.safeParse({ ...pattern, qualifiers: ['other'] }).success).toBe(false);
    expect(schema.LabFrontSchema.safeParse({ ...lab, extra: '' }).success).toBe(false);
    const { validate, build } = fixture({ 'labs/lab-another.md': markdown(lab, labBody()) });
    expect(validate().map(({ code }) => code)).toEqual(expect.arrayContaining(['path-mismatch', 'duplicate-id']));
    expect(build().errors).toEqual(expect.arrayContaining([
      expect.stringContaining('ファイル名と id'), expect.stringContaining('重複しています'),
    ]));
  });
});

describe('検証状態と教材の出力', () => {
  it.each([['labs', lab, labBody()], ['patterns', pattern, patternBody]])('区分 %s は本文と front matter からハッシュを作る', (section, data, body) => {
    const hash = rec(section, data, body).hash;
    expect(rec(section, { ...data, createdBy: 'v2' }, body).hash).toBe(hash);
    expect(rec(section, data, body + '\n').hash).not.toBe(hash);
    expect(rec(section, { ...data, order: 21 }, body).hash).not.toBe(hash);
    expect(schema.MaterialStatusSchema.safeParse({ [section]: { 'bad-key': rec(section, data, body) } }).success).toBe(false);
  });

  it('BOM と改行をそろえ、前後の空行を含めて同じ本文をハッシュに使う', () => {
    const body = `\n${labBody()}\n`;
    const dirs = fixture({
      [labRel]: '\ufeff' + markdown(lab, body).replaceAll('\n', '\r\n'),
      'material-status.json': { labs: { [lab.id]: rec('labs', lab, body) } },
    });
    const validated = loadContent({ root: dirs.root }).labs[0];
    const parsed = parseContent(readContentFiles(dirs.contentDir), schema).labs[0];
    expect(validated.body).toBe(body);
    expect(parsed.body).toBe(body);
    expect(materialHash('labs', materialHashInput('labs', validated))).toBe(materialHash('labs', materialHashInput('labs', parsed)));
    const built = dirs.build();
    expect(built.ok).toBe(true);
    expect(built.output(`lab:${lab.id}`)).toEqual({ id: lab.id, body });
  });

  it('記録のあとで本文を変えると警告し、未検証に戻す', () => {
    const { validate, build } = fixture({
      [labRel]: markdown(lab, labBody() + '\n追記します。\n'),
      'material-status.json': { labs: { [lab.id]: rec('labs', lab, labBody()) } },
    });
    expect(validate()).toContainEqual(expect.objectContaining({ code: 'material-stale-review', message: expect.stringContaining(lab.id) }));
    expect(build().manifest.counts.labsExcluded.pending).toBe(1);
    expect(build(true).output('lab-index')).toEqual([expect.objectContaining({ status: 'pending' })]);
  });

  it('存在しない id の検証記録はエラー', () => {
    const { validate, build } = fixture({ 'material-status.json': { patterns: { 'pattern-absent': rec('patterns', pattern, patternBody) } } });
    expect(validate()).toContainEqual(expect.objectContaining({ level: 'error', code: 'material-status-key' }));
    expect(build().errors).toContainEqual(expect.stringContaining('material-status.json: patterns.pattern-absent'));
  });

  it('出力する状態と件数を確かめ、サービスと確認問題を整える', () => {
    const fix = { ...lab, id: 'lab-fix' };
    const rejected = { ...pattern, id: 'pattern-rejected' };
    const { validate, build } = fixture({
      [`labs/${fix.id}.md`]: markdown(fix, labBody()),
      [`patterns/${rejected.id}.md`]: markdown(rejected, patternBody),
      'questions/d4/4.1/saa-4.1-t-001.json': question('saa-4.1-t-001', 'practice'),
      'questions/d4/4.1/saa-4.1-t-002.json': question('saa-4.1-t-002', 'practice'),
      'questions/d4/4.1/saa-4.1-t-003.json': question('saa-4.1-t-003', 'mockA'),
      'questions/d4/4.1/saa-4.1-t-004.json': question('saa-4.1-t-004', 'practice'),
      'questions/basics/saa-basics-t-001.json': question('saa-basics-t-001', 'basics', 'basics'),
      'review-status.json': { 'saa-4.1-t-002': { status: 'needs-fix', checkedAt: '2026-11-23' } },
      'material-status.json': {
        labs: { [lab.id]: rec('labs', lab, labBody()), [fix.id]: rec('labs', fix, labBody(), 'needs-fix') },
        patterns: { [rejected.id]: rec('patterns', rejected, patternBody, 'rejected') },
      },
    });
    expect(validate().map(({ code }) => code)).not.toContain('lab-unreferenced');
    const production = build();
    expect(production.ok, production.errors.join('\n')).toBe(true);
    expect(production.manifest.counts).toMatchObject({
      labs: 1, labsExcluded: { pending: 0, 'needs-fix': 1, rejected: 0 },
      patterns: 0, patternsExcluded: { pending: 1, 'needs-fix': 0, rejected: 1 },
    });
    expect(production.output('lab-index')).toEqual([expect.objectContaining({
      status: 'verified', services: ['Amazon S3'], questionIds: ['saa-4.1-t-001', 'saa-basics-t-001'],
    })]);
    const preview = build(true);
    expect(preview.manifest.counts).toMatchObject({
      labs: 1, labsExcluded: { pending: 0, 'needs-fix': 1, rejected: 0 },
      patterns: 1, patternsExcluded: { pending: 0, 'needs-fix': 0, rejected: 1 },
    });
    expect(preview.output('pattern-index')).toEqual([expect.objectContaining({ id: pattern.id, status: 'pending', qualifiers: ['cost'] })]);
    expect(preview.output(`pattern:${pattern.id}`)).toEqual({ id: pattern.id, body: patternBody });
    for (const built of [production, preview]) {
      expect(built.manifest.files[`lab:${fix.id}`]).toBeUndefined();
      expect(built.manifest.files[`pattern:${rejected.id}`]).toBeUndefined();
    }
  });

  it('図への参照の警告は検証済み教材の本文だけに出す', () => {
    const pendingLab = fixture();
    expect(pendingLab.validate().map(({ code }) => code)).not.toContain('diagram-ref-unverified');
    expect(pendingLab.build().warnings.join('\n')).not.toContain('出力から除いたため');
    const verifiedLab = fixture({ 'material-status.json': { labs: { [lab.id]: rec('labs', lab, labBody()) } } });
    expect(verifiedLab.validate()).toContainEqual(expect.objectContaining({ code: 'diagram-ref-unverified', message: expect.stringContaining(diagram.id) }));
    expect(verifiedLab.build().warnings).toContainEqual(expect.stringContaining('出力から除いたため'));
  });

  it('検証済み図の参照の有無は検証済み教材の本文から数える', () => {
    const diagrams = { [diagram.id]: rec('diagrams', diagram) };
    expect(fixture({ 'material-status.json': { diagrams } }).validate().map(({ code }) => code)).toContain('diagram-unreferenced');
    expect(fixture({ 'material-status.json': { diagrams, labs: { [lab.id]: rec('labs', lab, labBody()) } } })
      .validate().map(({ code }) => code)).not.toContain('diagram-unreferenced');
  });
});

describe('学習コースのミニラボと設計パターン', () => {
  it('項目の種類、参照の形、キーを確かめる', () => {
    expect(CourseSchema.safeParse(course([lessonItem, labItem, patternItem])).success).toBe(true);
    expect(CourseSchema.safeParse(course([{ ...labItem, ref: pattern.id }])).success).toBe(false);
    expect(CourseSchema.safeParse(course([{ ...patternItem, ref: lab.id }])).success).toBe(false);
    expect(courseItemKey(labItem)).toBe(`lab:${lab.id}`);
    expect(courseItemKey(patternItem)).toBe(`pattern:${pattern.id}`);
  });

  it('存在しない id を指すと validate とビルドで止める', () => {
    const { validate, build } = fixture({ 'course.json': course([lessonItem, { kind: 'lab', ref: 'lab-missing' }, { kind: 'pattern', ref: 'pattern-missing' }]) });
    for (const message of ['u00 のミニラボ lab-missing が見つかりません', 'u00 の設計パターン pattern-missing が見つかりません']) {
      expect(validate()).toContainEqual(expect.objectContaining({ code: 'course', level: 'error', message }));
      expect(build().errors).toContainEqual(`course.json: ${message}`);
    }
  });

  it('状態・割り当て・順を警告し、ビルドに出す項目だけを元の順で残す', () => {
    const { validate, build } = fixture({
      [labRel]: markdown({ ...lab, unit: 'u01' }, labBody()),
      'course.json': course([lessonItem, patternItem, { kind: 'analysis' }, labItem]),
    });
    const issues = validate();
    const codes = issues.map(({ code }) => code);
    expect(codes.filter((code) => code === 'course-material-unverified')).toHaveLength(2);
    expect(codes).toEqual(expect.arrayContaining(['course-lab-unit', 'course-item-order']));
    expect(codes).not.toContain('course-no-lab');
    const built = build();
    expect(built.ok).toBe(true);
    expect(built.warnings.filter((warning) => warning.includes('本番のビルドではユニットの画面に出しません'))).toHaveLength(2);
    expect(built.output('course').stages[0].units[0].items.map(({ kind }) => kind)).toEqual(['lesson', 'analysis']);
    expect(build(true).output('course').stages[0].units[0].items.map(({ kind }) => kind)).toEqual(['lesson', 'pattern', 'analysis', 'lab']);
  });

  it('要修正と却下はどちらのビルドでもユニットに出さない', () => {
    const { build } = fixture({
      'course.json': course([lessonItem, labItem, patternItem]),
      'material-status.json': {
        labs: { [lab.id]: rec('labs', lab, labBody(), 'needs-fix') },
        patterns: { [pattern.id]: rec('patterns', pattern, patternBody, 'rejected') },
      },
    });
    for (const includeUnverified of [false, true]) {
      const built = build(includeUnverified);
      expect(built.warnings.filter((warning) => warning.includes('どのビルドでもユニットの画面に出しません'))).toHaveLength(2);
      expect(built.output('course').stages[0].units[0].items).toEqual([lessonItem]);
    }
  });
});
