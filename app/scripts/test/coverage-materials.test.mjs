// @vitest-environment node
// coverage の図・実物・その場の確認・ミニラボ・網羅の一覧・事実の到達・検証状態の集計（小さな入力で関数を確かめる）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeCoverage, renderMarkdown } from '../../../scripts/coverage.mjs';
import { loadContent } from '../../../scripts/validate.mjs';
import {
  artifactKindCounts,
  cheatsheetFigureRows,
  coreFactReach,
  labUnitRows,
  lessonMaterialRows,
  listCoverage,
  statusBreakdown,
  summarizeLessonMaterials,
} from '../../../scripts/lib/coverage-materials.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const diagrams = new Map([
  ['dg-aaa', { type: 'architecture', status: 'verified' }],
  ['dg-bbb', { type: 'decision', status: 'pending' }],
  ['dg-ccc', { type: 'position', status: 'verified' }],
]);
const artifacts = new Map([['ar-aaa', { status: 'verified' }], ['ar-bbb', { status: 'pending' }]]);

const check = (question, tail = '') => `> **その場の確認**\n> ${question}\n>\n> - [ ] はい\n> - [x] いいえ\n>\n> 理由です。${tail}\n`;
const lesson = (id, body) => ({ data: { id, taskStatement: '1.1' }, body });

describe('レッスンごとの図・実物・その場の確認', () => {
  const rows = lessonMaterialRows(
    [
      lesson('lesson-1.1-a', `本文\n\n![図](#/diagrams/dg-aaa)\n\n![同じ図](#/diagrams/dg-aaa)\n\n![選択](#/diagrams/dg-bbb)\n\n![物](#/artifacts/ar-aaa)\n\n${check('問い 1 です')}\n${check('問い 2 です')}`),
      lesson('lesson-1.1-b', '図のない本文です。\n\n[図へのリンク](#/diagrams/dg-aaa)\n'),
      lesson('lesson-1.1-c', `存在しない図 ![x](#/diagrams/dg-none)\n\n![図](#/diagrams/dg-ccc)\n\n\`\`\`markdown\n![コード](#/diagrams/dg-aaa)\n\`\`\`\n\n${check('一つ')}\n${check('二つ')}\n${check('三つ')}\n`),
    ],
    { diagrams, artifacts },
  );

  it('同じ図は 1 枚に数え、種類と検証済みを分ける', () => {
    expect(rows[0]).toMatchObject({ id: 'lesson-1.1-a', diagrams: 2, verifiedDiagrams: 1, artifacts: 1, verifiedArtifacts: 1, checks: 2 });
    expect(rows[0].types).toMatchObject({ architecture: 1, decision: 1, position: 0 });
  });

  it('リンクだけ・存在しない図・コードの中の参照は数えない', () => {
    expect(rows[1]).toMatchObject({ diagrams: 0, checks: 0 });
    expect(rows[2]).toMatchObject({ diagrams: 1, verifiedDiagrams: 1, checks: 3 });
  });

  it('形の違うその場の確認は数えない', () => {
    const [bad] = lessonMaterialRows([lesson('lesson-1.1-d', '> **その場の確認**\n> 選択肢のない問い\n')], { diagrams, artifacts });
    expect(bad.checks).toBe(0);
  });

  it('図のないレッスンと確認の数を集計する', () => {
    const s = summarizeLessonMaterials(rows);
    expect(s.lessons).toBe(3);
    expect(s.diagramRefs).toBe(3);
    expect(s.withoutDiagram).toEqual(['lesson-1.1-b']);
    expect(s.withoutVerifiedDiagram).toEqual(['lesson-1.1-b']);
    expect(s.checks).toMatchObject({ total: 5, withChecks: 2, none: ['lesson-1.1-b'], few: ['lesson-1.1-a'], inRange: 1, many: [] });
    expect(s.byType).toMatchObject({ architecture: 1, decision: 1, position: 1, timeline: 0 });
  });

  it('レッスンが 0 本でも壊れない', () => {
    expect(summarizeLessonMaterials([])).toMatchObject({ lessons: 0, diagramRefs: 0, withoutDiagram: [] });
  });
});

describe('早見表の選択フロー・位置づけ図', () => {
  it('種類ごとの有無と、検証済みかどうか', () => {
    const rows = cheatsheetFigureRows(
      [
        { data: { id: 'cheatsheet-x' }, body: '![](#/diagrams/dg-bbb)\n\n![](#/diagrams/dg-ccc)\n' },
        { data: { id: 'cheatsheet-y' }, body: '図なし' },
      ],
      { diagrams },
    );
    expect(rows[0]).toMatchObject({ diagrams: 2, decision: true, decisionVerified: false, position: true, positionVerified: true });
    expect(rows[1]).toMatchObject({ diagrams: 0, decision: false, position: false });
  });
});

describe('実物の種類ごとの件数', () => {
  it('0 件の種類も出し、検証済みを分ける', () => {
    const rows = artifactKindCounts(
      [{ data: { id: 'ar-aaa', kind: 'sg-rules' } }, { data: { id: 'ar-bbb', kind: 'sg-rules' } }, { data: { id: 'ar-ccc', kind: 'scp' } }],
      new Map([['ar-aaa', { status: 'verified' }], ['ar-bbb', { status: 'pending' }]]),
      ['sg-rules', 'scp', 'alarm'],
    );
    expect(rows).toEqual([
      { kind: 'sg-rules', count: 2, verified: 1 },
      { kind: 'scp', count: 1, verified: 0 },
      { kind: 'alarm', count: 0, verified: 0 },
    ]);
  });
});

describe('ユニットごとのミニラボ', () => {
  const course = {
    stages: [
      { id: 1, units: [{ id: 'u01', title: 'A', items: [{ kind: 'lab', ref: 'lab-x' }] }, { id: 'u02', title: 'B', items: [{ kind: 'practice' }] }] },
      { id: 2, units: [{ id: 'u06', title: 'C', items: [] }] },
    ],
  };
  it('front matter の unit で数え、ないユニットも出す', () => {
    const rows = labUnitRows(course, [{ data: { id: 'lab-x', unit: 'u01' } }, { data: { id: 'lab-y', unit: 'u01' } }], new Map([['lab-x', { status: 'verified' }]]));
    expect(rows.map((r) => [r.unit, r.labs.length, r.verified])).toEqual([['u01', 2, 1], ['u02', 0, 0], ['u06', 0, 0]]);
    expect(rows[0].labs[1]).toEqual({ id: 'lab-y', status: 'pending' });
    expect(rows[0].placed).toBe(1);
  });
  it('コースがなければ空', () => {
    expect(labUnitRows(null, [], new Map())).toEqual([]);
  });
});

describe('網羅の一覧ごとの対応', () => {
  const lists = {
    comparisons: [
      { id: 'pair-01', name: 'a', group: 'g', cheatsheet: 'cheatsheet-a', questionRefs: ['q1', 'q2'] },
      { id: 'pair-02', name: 'b', group: 'g', comparisonRefs: ['cmp-b'], questionRefs: ['q1'] },
      { id: 'pair-03', name: 'c', group: 'g', cheatsheet: 'cheatsheet-gone', questionRefs: ['q1', 'q2'] },
    ],
    patterns: [
      { id: 'dp-01', name: 'p', group: 'g', tasks: ['1.1'], material: 'pattern-p', questionRefs: ['q1', 'q2'] },
      { id: 'dp-02', name: 'q', group: 'g', tasks: ['1.1'] },
    ],
    pitfalls: [
      { id: 'pit-01', name: 'x', simRefs: ['sim-a-b'] },
      { id: 'pit-02', name: 'y', labRefs: ['lab-gone'] },
      { id: 'pit-03', name: 'z' },
    ],
  };
  const ids = (...a) => new Set(a);
  const r = listCoverage(lists, {
    cheatsheetIds: ids('cheatsheet-a'),
    catalogComparisonIds: ids('cmp-b'),
    questionIds: ids('q1', 'q2'),
    labIds: ids(),
    patternIds: ids('pattern-p'),
    simIds: ids('sim-a-b'),
    statuses: { patterns: new Map([['pattern-p', { status: 'verified' }]]) },
  });

  it('比較の組: 早見表か図鑑の比較と、演習 2 問以上', () => {
    expect(r.comparisons).toMatchObject({ total: 3, withMaterial: 2, withQuestions: 2, met: 1 });
    expect(r.comparisons.rows[2].materials).toBe(0); // 早見表が実在しない参照は数えない
  });
  it('設計パターン: 教材と演習 2 問以上', () => {
    expect(r.patterns).toMatchObject({ total: 2, withMaterial: 1, withQuestions: 1, met: 1 });
    expect(r.patterns.rows[0].status).toBe('verified');
  });
  it('つまずきの型: ミニラボ・シナリオ・問題のどれか', () => {
    expect(r.pitfalls).toMatchObject({ total: 3, withMaterial: 1, met: 1 });
    expect(r.pitfalls.rows.map((x) => x.met)).toEqual([true, false, false]);
  });
});

describe('図鑑の core の事実の到達', () => {
  const facts = [
    { id: 's3.a', tier: 1, depth: 'core' },
    { id: 's3.b', tier: 1, depth: 'core' },
    { id: 's3.c', tier: 1, depth: 'detail' },
    { id: 'sqs.a', tier: 2, depth: 'core' },
    { id: 'sqs.b', tier: 2, depth: 'core' },
  ];
  it('本文のリンクと問題の factRefs から指される core の割合', () => {
    const r = coreFactReach(facts, {
      texts: ['[S3](#/services/s3?f=a)', '[SQS](#/services/sqs)', '[ない](#/services/s3?f=zzz)'],
      questionFactRefs: ['sqs.a', 'sqs.a'],
      extraRefs: ['sqs.b'],
    });
    expect(r.reach.tier1).toEqual({ total: 2, reached: 1, percent: 50 });
    expect(r.reach.all).toEqual({ total: 4, reached: 2, percent: 50 });
    expect(r.recall.tier1).toEqual({ total: 2, reached: 0, percent: 0 });
    expect(r.withOtherRefs.all.reached).toBe(3);
    expect(r.linkedFacts).toBe(1);
  });
  it('core がなければ割合は null', () => {
    expect(coreFactReach([], {}).reach.tier1).toEqual({ total: 0, reached: 0, percent: null });
  });
});

describe('検証状態の内訳', () => {
  it('区分ごとに状態、記録なし、変更で戻ったものを数える', () => {
    const rows = statusBreakdown(
      {
        diagrams: new Map([
          ['a', { status: 'verified', stale: false, recorded: true }],
          ['b', { status: 'pending', stale: true, recorded: true }],
          ['c', { status: 'pending', stale: false, recorded: false }],
          ['d', { status: 'needs-fix', stale: false, recorded: true }],
        ]),
        labs: new Map(),
      },
      { diagrams: '図' },
    );
    expect(rows.find((x) => x.section === 'diagrams')).toMatchObject({ label: '図', total: 4, verified: 1, pending: 2, 'needs-fix': 1, rejected: 0, stale: 1, unrecorded: 1 });
    expect(rows.find((x) => x.section === 'labs')).toMatchObject({ total: 0 });
  });
});

describe('npm run coverage の出力', () => {
  const cov = computeCoverage(loadContent({ root: repoRoot }));

  it('既存の節を変えずに、集計の節を足す', () => {
    const md = renderMarkdown(cov);
    const order = ['## 概要', '## サービス図鑑', '## 図・実物・その場の確認', '## ミニラボ（ユニット別）', '## 網羅の一覧（比較の組・設計パターン・つまずきの型）', '## 図鑑の core の事実の到達', '## 教材の検証状態（material-status.json）'];
    const at = order.map((h) => md.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('JSON の materials が、実在する教材の数と合う', () => {
    const m = cov.materials;
    expect(m.lessons.lessons).toBe(cov.totals.lessons);
    expect(m.artifactKinds.reduce((n, k) => n + k.count, 0)).toBe(fs.readdirSync(path.join(repoRoot, 'content/saa-c03/artifacts')).filter((f) => f.endsWith('.json')).length);
    const diagramRow = m.status.find((x) => x.section === 'diagrams');
    expect(diagramRow.total).toBe(fs.readdirSync(path.join(repoRoot, 'content/saa-c03/diagrams')).filter((f) => f.endsWith('.json')).length);
    expect(diagramRow.verified + diagramRow.pending + diagramRow['needs-fix'] + diagramRow.rejected).toBe(diagramRow.total);
    expect(m.cheatsheets).toHaveLength(cov.totals.cheatsheets);
    expect(m.lists.comparisons.total + m.lists.patterns.total + m.lists.pitfalls.total).toBeGreaterThan(0);
  });
});
