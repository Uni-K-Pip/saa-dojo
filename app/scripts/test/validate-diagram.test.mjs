// @vitest-environment node
// 図の検査（scripts/lib/diagram.mjs の checkDiagram と、validate への組み込み）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDiagram } from '../../../scripts/lib/diagram.mjs';
import { DiagramSchema } from '../../../scripts/lib/schema.mjs';
import { buildServiceIndex } from '../../../scripts/lib/service-registry.mjs';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contentDir = path.join(repoRoot, 'content', 'saa-c03');
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(contentDir, ...p), 'utf8'));
const serviceIndex = buildServiceIndex(readJson('blueprint.json'), readJson('services.json'));
const LESSON = 'lesson-2.1-decoupling-and-messaging';
const ctx = { lessonIds: new Set([LESSON]), factIds: new Set(['sqs.visibility-timeout']), serviceIndex };

const base = (over = {}) => ({
  id: 'dg-test-diagram',
  type: 'architecture',
  title: 'テスト用の構成図',
  alt: '利用者のリクエストを API Gateway が受け、Lambda 関数が処理して DynamoDB のテーブルに書き込みます。',
  lessonRefs: [LESSON],
  factRefs: [],
  createdBy: 'v1',
  root: {
    dir: 'col',
    children: [
      { id: 'user', node: 'actor' },
      {
        id: 'grp',
        box: 'group',
        label: 'アプリ',
        dir: 'row',
        children: [
          { id: 'api', node: 'api-gateway', label: '入口' },
          { id: 'fn', node: 'lambda' },
        ],
      },
      { id: 'db', node: 'dynamodb' },
    ],
  },
  edges: [
    { id: 'e1', from: 'user', to: 'api' },
    { id: 'e2', from: 'api', to: 'fn' },
    { id: 'e3', from: 'fn', to: 'db', kind: 'data' },
  ],
  steps: [{ text: '利用者のリクエストは API Gateway から Lambda 関数に届きます。', focus: ['user', 'api', 'fn'], edges: ['e1', 'e2'] }],
  ...over,
});
const errorsOf = (d, c = ctx) => checkDiagram(d, c).errors;

describe('checkDiagram', () => {
  it('正しい図は通る（スキーマも）', () => {
    const d = base();
    expect(DiagramSchema.safeParse(d).success).toBe(true);
    expect(checkDiagram(d, ctx)).toEqual({ errors: [], warnings: [] });
  });

  it('見本 3 つはエラーがない', () => {
    const lessonIds = new Set(['lesson-3.4-vpc-design', 'lesson-2.2-ha-basics', 'lesson-2.2-disaster-recovery', LESSON]);
    for (const f of fs.readdirSync(path.join(contentDir, 'diagrams'))) {
      const d = readJson('diagrams', f);
      expect(DiagramSchema.safeParse(d).success, f).toBe(true);
      expect(errorsOf(d, { lessonIds, serviceIndex }), f).toEqual([]);
    }
  });

  it('存在しない id を指す線・段階はエラー', () => {
    const d = base({
      edges: [...base().edges, { id: 'e4', from: 'fn', to: 'nowhere' }],
      steps: [{ text: '存在しない部品と線を指している段階の説明です。', focus: ['ghost'], edges: ['e9'], reveal: ['e8'], marks: [{ id: 'ghost2', state: 'down' }] }],
    });
    const errs = errorsOf(d);
    expect(errs.some((m) => m.includes('nowhere'))).toBe(true);
    expect(errs.some((m) => m.includes('focus') && m.includes('ghost'))).toBe(true);
    expect(errs.some((m) => m.includes('e9'))).toBe(true);
    expect(errs.some((m) => m.includes('reveal') && m.includes('e8'))).toBe(true);
    expect(errs.some((m) => m.includes('marks') && m.includes('ghost2'))).toBe(true);
  });

  it('図の中の id の重複はエラー', () => {
    const d = base({ edges: [{ id: 'fn', from: 'user', to: 'api' }] });
    expect(errorsOf(d).some((m) => m.includes('重複'))).toBe(true);
  });

  it('上限（部品 14・線 16・段階 8・入れ子 5）を超えるとエラー', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `n${i}`, node: 'ec2' }));
    expect(errorsOf(base({ root: { children: many }, edges: [], steps: [] })).some((m) => m.includes('部品が 15 個'))).toBe(true);

    const edges = Array.from({ length: 17 }, (_, i) => ({ id: `x${i}`, from: 'user', to: 'db' }));
    expect(errorsOf(base({ edges, steps: [] })).some((m) => m.includes('線が 17 本'))).toBe(true);

    const steps = Array.from({ length: 9 }, () => ({ text: '段階の説明を二十字以上で書いておきます。', focus: [], edges: [] }));
    expect(errorsOf(base({ steps })).some((m) => m.includes('段階が 9 つ'))).toBe(true);

    let inner = { id: 'leaf', node: 'ec2' };
    for (let i = 6; i >= 1; i--) inner = { id: `b${i}`, box: 'group', label: `枠${i}`, children: [inner] };
    expect(errorsOf(base({ root: { children: [inner] }, edges: [], steps: [] })).some((m) => m.includes('入れ子が 6 段'))).toBe(true);
  });

  it('裏づけが 0 はエラー。存在しない lessonRefs・factRefs もエラー', () => {
    expect(errorsOf(base({ lessonRefs: [], factRefs: [] })).some((m) => m.includes('裏づけ'))).toBe(true);
    const errs = errorsOf(base({ lessonRefs: ['lesson-9.9-nothing'], factRefs: ['sqs.no-such-fact'] }));
    expect(errs.some((m) => m.includes('lesson-9.9-nothing'))).toBe(true);
    expect(errs.some((m) => m.includes('sqs.no-such-fact'))).toBe(true);
    // factIds が無いときは事実の存在を確かめない
    expect(errorsOf(base({ factRefs: ['sqs.no-such-fact'] }), { ...ctx, factIds: undefined })).toEqual([]);
  });

  it('未知の node・box、ラベルのない generic・group はエラー', () => {
    const d = base({
      root: {
        children: [
          { id: 'a', node: 'no-such-service' },
          { id: 'b', node: 'generic' },
          { id: 'c', box: 'castle', children: [{ id: 'd', node: 'ec2' }] },
          { id: 'g', box: 'group', children: [{ id: 'h', node: 'ec2' }] },
        ],
      },
      edges: [],
      steps: [],
    });
    const errs = errorsOf(d);
    expect(errs.some((m) => m.includes('no-such-service'))).toBe(true);
    expect(errs.some((m) => m.includes('generic') && m.includes('ラベル'))).toBe(true);
    expect(errs.some((m) => m.includes('castle'))).toBe(true);
    expect(errs.some((m) => m.includes('group') && m.includes('ラベル'))).toBe(true);
  });

  it('見えない並べ枠は線の端にできない', () => {
    const d = base({
      root: { dir: 'col', children: [{ id: 'top', node: 'actor' }, { id: 'frame', dir: 'row', children: [{ id: 'x', node: 'ec2' }] }] },
      edges: [{ id: 'e1', from: 'top', to: 'frame' }],
      steps: [],
    });
    expect(errorsOf(d).some((m) => m.includes('並べ枠'))).toBe(true);
  });

  it('幅が 328 を超える図はエラー（実際の幅と直し方の案内つき）', () => {
    const row = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, node: 'ec2', label: `サーバー${i}` }));
    const { errors } = checkDiagram(base({ root: { dir: 'row', children: row }, edges: [], steps: [] }), ctx);
    expect(errors.some((m) => /幅が [\d.]+ あります/.test(m) && m.includes('列に替える'))).toBe(true);
  });

  it('高さが 440 を超える図は diagram-height の警告', () => {
    const col = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, node: 'ec2' }));
    const { errors, warnings } = checkDiagram(base({ root: { dir: 'col', children: col }, edges: [], steps: [] }), ctx);
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain('diagram-height');
  });

  it('入れ物と、その中の部品を結ぶ線はエラー', () => {
    const d = base({ edges: [{ id: 'e1', from: 'grp', to: 'fn' }], steps: [] });
    expect(errorsOf(d).some((m) => m.includes('その中の部品'))).toBe(true);
  });

  it('同じ段階の marks に同じ id が 2 回あればエラー', () => {
    const T = '同じ部品に印を二つ付けている段階の説明です。';
    const d = base({ steps: [{ text: T, marks: [{ id: 'fn', state: 'down' }, { id: 'fn', state: 'new' }] }] });
    expect(errorsOf(d).some((m) => m.includes('fn が 2 回以上'))).toBe(true);
  });

  it('standby（待機）の印を使える', () => {
    const T = '復旧先のアプリケーションは待機しています。';
    const d = base({ steps: [{ text: T, focus: ['fn'], marks: [{ id: 'fn', state: 'standby' }] }] });
    expect(DiagramSchema.safeParse(d).success).toBe(true);
    expect(errorsOf(d)).toEqual([]);
  });

  it('段階の説明は 20 字以上（スキーマ）', () => {
    const d = base({ steps: [{ text: '十九字の段階の説明です。あと少し足りない。'.slice(0, 19) }] });
    expect(DiagramSchema.safeParse(d).success).toBe(false);
  });

  it('使えない fromSide・toSide は diagram-side の警告', () => {
    const d = base({ edges: [{ id: 'e1', from: 'user', to: 'db', fromSide: 'top', toSide: 'bottom' }], steps: [] });
    const { errors, warnings } = checkDiagram(d, ctx);
    expect(errors).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain('diagram-side');
  });
});

describe('checkDiagram: 段階ごとの見え方', () => {
  const T = 'これは段階の説明で、二十字以上あるテキストです。';
  const root = {
    dir: 'col',
    children: [
      { id: 'u', node: 'actor' },
      { id: 'g', box: 'group', label: 'まとまり', children: [{ id: 'a', node: 'ec2' }, { id: 'b', node: 's3' }] },
    ],
  };
  const edges = [
    { id: 'e1', from: 'u', to: 'a' },
    { id: 'e2', from: 'a', to: 'b' },
  ];

  it('子を、外側の入れ物より先に reveal するとエラー', () => {
    const d = base({ root, edges, steps: [{ text: T, reveal: ['a'] }, { text: T, reveal: ['g'] }] });
    expect(errorsOf(d).some((m) => m.includes('外側の入れ物 g'))).toBe(true);
  });

  it('線を、端の部品より先に reveal するとエラー', () => {
    const d = base({ root, edges, steps: [{ text: T, reveal: ['e1'] }, { text: T, reveal: ['a'] }] });
    expect(errorsOf(d).some((m) => m.includes('線 e1') && m.includes('端の a'))).toBe(true);
  });

  it('focus・edges・marks が、その段階で隠れている要素を指すとエラー', () => {
    const d = base({
      root,
      edges,
      steps: [
        { text: T, focus: ['b'], edges: ['e2'], marks: [{ id: 'a', state: 'down' }] },
        { text: T, reveal: ['g'] },
      ],
    });
    const errs = errorsOf(d);
    expect(errs.some((m) => m.includes('steps[0].focus: b はこの段階ではまだ隠れています'))).toBe(true);
    expect(errs.some((m) => m.includes('steps[0].edges: 線 e2 はこの段階ではまだ隠れています'))).toBe(true);
    expect(errs.some((m) => m.includes('steps[0].marks: a はこの段階ではまだ隠れています'))).toBe(true);
  });

  it('reveal した段階とそれより後なら指せる', () => {
    const d = base({
      root,
      edges,
      steps: [
        { text: T, focus: ['u'] },
        { text: T, reveal: ['g', 'e2'], focus: ['a', 'b'], edges: ['e2'], marks: [{ id: 'b', state: 'new' }] },
        { text: T, edges: ['e1', 'e2'] },
      ],
    });
    expect(errorsOf(d)).toEqual([]);
  });
});

describe('validate への組み込み', () => {
  const tmp = [];
  afterEach(() => {
    for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('リポジトリの図は分類され、エラーがない', () => {
    const c = checkContent(loadContent({ root: repoRoot }));
    expect(c.issues.filter((i) => i.file.includes('/diagrams/') && i.level === 'error')).toEqual([]);
    expect(c.diagrams.length).toBeGreaterThanOrEqual(3);
  });

  it('ファイル名と id の不一致・スキーマ違反・checkDiagram のエラーを報告する', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-dg-'));
    tmp.push(root);
    const dir = path.join(root, 'content', 'saa-c03');
    fs.mkdirSync(path.join(dir, 'diagrams'), { recursive: true });
    fs.copyFileSync(path.join(contentDir, 'blueprint.json'), path.join(dir, 'blueprint.json'));
    fs.copyFileSync(path.join(contentDir, 'services.json'), path.join(dir, 'services.json'));
    fs.writeFileSync(path.join(dir, 'diagrams', 'dg-other-name.json'), JSON.stringify(base()));
    fs.writeFileSync(path.join(dir, 'diagrams', 'dg-bad-schema.json'), JSON.stringify({ ...base({ id: 'dg-bad-schema' }), extra: 1 }));
    fs.writeFileSync(path.join(dir, 'diagrams', 'dg-no-lesson.json'), JSON.stringify(base({ id: 'dg-no-lesson' })));
    const c = checkContent(loadContent({ root }));
    const at = (f) => c.issues.filter((i) => i.file.endsWith(f) && i.level === 'error');
    expect(at('dg-other-name.json').map((i) => i.code)).toContain('path-mismatch');
    expect(at('dg-bad-schema.json').map((i) => i.code)).toContain('schema');
    expect(at('dg-no-lesson.json').some((i) => i.code === 'diagram' && i.message.includes(LESSON))).toBe(true);
  });
});
