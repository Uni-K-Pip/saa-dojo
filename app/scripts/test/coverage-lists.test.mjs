// @vitest-environment node
// 網羅の一覧（content/saa-c03/coverage-lists.json）の形の検査と、学習設計書の付録との突き合わせ
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import { CoverageListsSchema, checkCoverageLists, compareAppendixWithLists, parseAppendixLists } from '../../../scripts/lib/coverage-lists.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const lists = JSON.parse(read('content/saa-c03/coverage-lists.json'));

describe('付録との突き合わせ', () => {
  const appendix = parseAppendixLists(read('docs/learning-design.md'));

  it('付録 B・C・D が読める', () => {
    expect(appendix.patterns.total).toBeGreaterThan(0);
    expect(appendix.comparisons.groups.length).toBeGreaterThan(0);
    expect(appendix.pitfalls.total).toBeGreaterThan(0);
  });

  it('件数・名前・並び・タスク・● が、付録と一覧のデータで一致する', () => {
    expect(compareAppendixWithLists(appendix, lists)).toEqual([]);
  });

  it('見出しの個数と、並べた項目の数が付録の中で一致する', () => {
    expect(appendix.patterns.total).toBe(appendix.patterns.groups.flatMap((g) => g.items).length);
    expect(appendix.pitfalls.total).toBe(appendix.pitfalls.items.length);
  });

  it('食い違いを見つける（件数・名前・● ・ID）', () => {
    const broken = structuredClone(lists);
    broken.patterns.pop();
    broken.comparisons[0].name = '違う名前';
    broken.comparisons[7].cheatsheet = undefined;
    broken.pitfalls[0].id = 'pit-99';
    const diffs = compareAppendixWithLists(appendix, broken).join('\n');
    expect(diffs).toContain('設計パターンの総数');
    expect(diffs).toContain('比較の組 1: 名前が違います');
    expect(diffs).toContain('● と早見表の有無');
    expect(diffs).toContain('つまずきの型 1: ID が pit-99');
  });

  it('付録の読み取りは、小さな入力でも動く', () => {
    const md = [
      '## 付録 B. 設計パターンの一覧（2 個。候補）', '', '**グループ（2）**', '', '1. 一つ目（1.1）', '2. 二つ目（補足）（1.2・1.3）', '',
      '## 付録 C. 比べる組', '', '**区分**', '', '- A と B ●', '- C と D ●、E', '- F', '',
      '## 付録 D. つまずきの型（1 個。候補）', '', '1. 型（補足）', '',
    ].join('\n');
    const a = parseAppendixLists(md);
    expect(a.patterns.groups[0].items).toEqual([{ no: 1, name: '一つ目', tasks: ['1.1'] }, { no: 2, name: '二つ目（補足）', tasks: ['1.2', '1.3'] }]);
    expect(a.comparisons.groups[0].items).toEqual([
      { name: 'A と B', cheatsheet: true }, { name: 'C と D、E', cheatsheet: true }, { name: 'F', cheatsheet: false },
    ]);
    expect(a.pitfalls).toEqual({ total: 1, items: [{ no: 1, name: '型（補足）' }] });
    expect(parseAppendixLists('なし')).toEqual({ patterns: null, comparisons: null, pitfalls: null });
  });
});

describe('一覧の形の検査', () => {
  it('実際のデータはスキーマに通る', () => {
    expect(CoverageListsSchema.safeParse(lists).success).toBe(true);
  });

  const base = () => ({
    comparisons: [{ id: 'pair-01', name: '比べる組 1', group: '区分' }],
    patterns: [{ id: 'dp-01', name: 'パターン 1', group: '区分', tasks: ['1.1'] }],
    pitfalls: [{ id: 'pit-01', name: 'つまずき 1' }],
  });
  const ok = (value) => CoverageListsSchema.safeParse(value).success;

  it('存在しない形の ID・知らない欄・タスクの形はスキーマのエラー', () => {
    expect(ok(base())).toBe(true);
    const bad = (mutate) => {
      const v = base();
      mutate(v);
      return ok(v);
    };
    expect(bad((v) => { v.comparisons[0].id = 'pair-1'; })).toBe(false);
    expect(bad((v) => { v.patterns[0].id = 'pattern-01'; })).toBe(false);
    expect(bad((v) => { v.pitfalls[0].id = 'pit-001'; })).toBe(false);
    expect(bad((v) => { v.patterns[0].tasks = ['5.1']; })).toBe(false);
    expect(bad((v) => { v.patterns[0].material = 'lab-x'; })).toBe(false);
    expect(bad((v) => { v.pitfalls[0].extra = 1; })).toBe(false);
    expect(bad((v) => { v.pitfalls = []; })).toBe(false);
  });

  it('重複と、blueprint にないタスクはエラー。教材がまだない（参照が実在しない）のは警告', () => {
    const v = base();
    v.comparisons.push({ id: 'pair-01', name: '比べる組 1', group: '区分' });
    v.patterns[0].tasks = ['1.9'];
    v.patterns.push({ id: 'dp-02', name: 'パターン 2', group: '区分', tasks: ['1.1'], material: 'pattern-gone' });
    v.patterns.push({ id: 'dp-03', name: 'パターン 3', group: '区分', tasks: ['1.1'], material: 'pattern-gone' });
    const { errors, warnings } = checkCoverageLists(v, { taskIds: new Set(['1.1']), patternIds: new Set() });
    expect(errors.some((m) => m.includes('pair-01 が重複'))).toBe(true);
    expect(errors.some((m) => m.includes('名前が重複'))).toBe(true);
    expect(errors.some((m) => m.includes('1.9'))).toBe(true);
    expect(errors.some((m) => m.includes('pattern-gone を dp-02 と dp-03'))).toBe(true);
    expect(warnings.filter((m) => m.includes('pattern-gone が')).length).toBe(2);
  });

  it('教材のない項目は、エラーにも警告にもならない', () => {
    expect(checkCoverageLists(base(), { taskIds: new Set(['1.1']), patternIds: new Set(), cheatsheetIds: new Set() })).toEqual({ errors: [], warnings: [] });
  });

  it('validate が、リポジトリの一覧にエラーも警告も出さない', () => {
    const content = checkContent(loadContent({ root: repoRoot }));
    const mine = content.issues.filter((i) => i.rel === 'coverage-lists.json' || /coverage-lists/.test(i.code));
    expect(mine).toEqual([]);
  });
});
