import { describe, expect, it } from 'vitest';
import { buildHistory } from './history';
import { mulberry32 } from './rng';
import { EMPTY_FILTER, filterFromQuery, filterPractice, filterToQuery, pickQuestions } from './selection';
import { answer, event, makeQuestion, metaOf } from '../test/fixtures';

const qs = [
  makeQuestion({ id: 'saa-1.1-t-001', difficulty: 1, qualifier: 'security', services: ['AWS Organizations'] }),
  makeQuestion({ id: 'saa-1.2-t-001', difficulty: 2, qualifier: 'security' }),
  makeQuestion({ id: 'saa-2.1-t-001', difficulty: 3, qualifier: 'operational', services: ['Amazon SQS'] }),
  makeQuestion({ id: 'saa-3.1-t-001', difficulty: 2, qualifier: 'performance' }),
  makeQuestion({ id: 'saa-4.1-t-001', difficulty: 2, qualifier: 'cost' }),
  makeQuestion({ id: 'saa-basics-t-001', domain: 0, taskStatement: 'basics', pool: 'basics', knowledgeRefs: ['basics-K1'] }),
  makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' }),
  makeQuestion({ id: 'saa-2.1-t-101', pool: 'mockB' }),
];
const index = qs.map(metaOf);

describe('演習の出題選択', () => {
  it('演習プールだけを対象にし、基礎講座と保留模試の問題は出さない', () => {
    const ids = filterPractice(index, EMPTY_FILTER, buildHistory([])).map((q) => q.id);
    expect(ids).toHaveLength(5);
    expect(ids).not.toContain('saa-basics-t-001');
    expect(ids).not.toContain('saa-1.1-t-101');
    expect(ids).not.toContain('saa-2.1-t-101');
    const picked = pickQuestions(filterPractice(index, EMPTY_FILTER, buildHistory([])), buildHistory([]), 30, mulberry32(1));
    expect(picked.some((id) => id.endsWith('-101') || id.includes('basics'))).toBe(false);
  });

  it('ドメイン・タスク・サービス・判断軸・難易度で絞り込む', () => {
    const h = buildHistory([]);
    const ids = (f: Partial<typeof EMPTY_FILTER>) => filterPractice(index, { ...EMPTY_FILTER, ...f }, h).map((q) => q.id);
    expect(ids({ domains: [1] })).toEqual(['saa-1.1-t-001', 'saa-1.2-t-001']);
    expect(ids({ tasks: ['2.1'] })).toEqual(['saa-2.1-t-001']);
    expect(ids({ services: ['Amazon SQS'] })).toEqual(['saa-2.1-t-001']);
    expect(ids({ qualifiers: ['security'] })).toHaveLength(2);
    expect(ids({ difficulties: [2] })).toHaveLength(3);
    expect(ids({ domains: [1], difficulties: [1] })).toEqual(['saa-1.1-t-001']);
  });

  it('未回答・誤答・フラグはいずれかに当てはまれば対象', () => {
    const h = buildHistory([
      answer('saa-1.1-t-001', true),
      answer('saa-1.2-t-001', false),
      answer('saa-2.1-t-001', false),
      answer('saa-2.1-t-001', true),
      event('flag', { questionId: 'saa-3.1-t-001', flagged: true }),
    ]);
    const ids = (statuses: ('unanswered' | 'wrong' | 'flagged')[]) =>
      filterPractice(index, { ...EMPTY_FILTER, statuses }, h).map((q) => q.id);
    expect(ids(['unanswered'])).toEqual(['saa-3.1-t-001', 'saa-4.1-t-001']);
    expect(ids(['wrong'])).toEqual(['saa-1.2-t-001']);
    expect(ids(['flagged'])).toEqual(['saa-3.1-t-001']);
    expect(ids(['wrong', 'flagged'])).toEqual(['saa-1.2-t-001', 'saa-3.1-t-001']);
  });

  it('未回答 → 前回誤答 → 回答が古い順に優先する', () => {
    const h = buildHistory([
      answer('saa-1.1-t-001', true, { at: 3000 }),
      answer('saa-1.2-t-001', true, { at: 1000 }),
      answer('saa-2.1-t-001', false, { at: 2000 }),
    ]);
    const pool = filterPractice(index, EMPTY_FILTER, h);
    for (let seed = 0; seed < 10; seed++) {
      const picked = pickQuestions(pool, h, 5, mulberry32(seed));
      expect(new Set(picked.slice(0, 2))).toEqual(new Set(['saa-3.1-t-001', 'saa-4.1-t-001']));
      expect(picked.slice(2)).toEqual(['saa-2.1-t-001', 'saa-1.2-t-001', 'saa-1.1-t-001']);
    }
    expect(pickQuestions(pool, h, 2, mulberry32(1))).toHaveLength(2);
    expect(pickQuestions([], h, 10, mulberry32(1))).toEqual([]);
  });

  it('条件を URL のクエリと相互に変換する', () => {
    const f = { ...EMPTY_FILTER, domains: [1, 3], services: ['Amazon S3'], statuses: ['wrong' as const] };
    expect(filterFromQuery(new URLSearchParams(filterToQuery(f)))).toEqual(f);
    expect(filterFromQuery(new URLSearchParams('domains=9,x&difficulties=2,5&statuses=bogus'))).toEqual({
      ...EMPTY_FILTER,
      difficulties: [2],
    });
  });
});
