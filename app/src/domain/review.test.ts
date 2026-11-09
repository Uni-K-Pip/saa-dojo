import { describe, expect, it } from 'vitest';
import { buildHistory } from './history';
import { buildConceptSchedule, conceptGrade, dueConcepts, pickReviewQuestions, reviewableConcepts } from './review';
import { mulberry32 } from './rng';
import { Rating, dueAt } from './srs';
import { answer, makeQuestion, metaOf } from '../test/fixtures';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 3, 0, 0);
const T1 = T0 + 1000;

const q1 = makeQuestion({ id: 'saa-1.1-t-001', knowledgeRefs: ['1.1-K1', '1.1-K2'] });
const q2 = makeQuestion({ id: 'saa-1.1-t-002', knowledgeRefs: ['1.1-K1'] });
const q3 = makeQuestion({ id: 'saa-1.1-t-003', knowledgeRefs: ['1.1-K2'] });
const mockQ = makeQuestion({ id: 'saa-1.1-t-101', knowledgeRefs: ['1.1-K1'], pool: 'mockA' });
const onlyMock = makeQuestion({ id: 'saa-1.2-t-101', taskStatement: '1.2', knowledgeRefs: ['1.2-K1'], pool: 'mockB' });
const index = [q1, q2, q3, mockQ, onlyMock].map(metaOf);

describe('概念単位の復習スケジュール', () => {
  it('回答から評価を決める', () => {
    expect(conceptGrade({ correct: false, confidence: 'sure' })).toBe(Rating.Again);
    expect(conceptGrade({ correct: true, confidence: 'guess' })).toBe(Rating.Hard);
    expect(conceptGrade({ correct: true, confidence: 'maybe' })).toBe(Rating.Good);
    expect(conceptGrade({ correct: true })).toBe(Rating.Good);
    expect(conceptGrade({ correct: true, confidence: 'sure' })).toBe(Rating.Easy);
  });

  it('誤答でその問題のすべての概念のカードを作り、翌日に期限が来る', () => {
    const s = buildConceptSchedule([answer(q1.id, false, { at: T0 })], index);
    expect([...s.keys()].sort()).toEqual(['1.1-K1', '1.1-K2']);
    const due = dueAt(s.get('1.1-K1')!);
    expect(due).toBeGreaterThan(T0);
    expect(due - T0).toBeLessThanOrEqual(2 * DAY);
    expect(dueConcepts(s, T0 + 3 * DAY).map((c) => c.conceptId)).toEqual(['1.1-K1', '1.1-K2']);
    expect(dueConcepts(s, T0)).toEqual([]);
  });

  it('自信度「勘」の正解でもカードを作り、確信のある正解では作らない', () => {
    expect([...buildConceptSchedule([answer(q2.id, true, { at: T0, confidence: 'guess' })], index).keys()]).toEqual(['1.1-K1']);
    expect(buildConceptSchedule([answer(q2.id, true, { at: T0, confidence: 'sure' })], index).size).toBe(0);
    expect(buildConceptSchedule([answer(q2.id, true, { at: T0, confidence: 'maybe' })], index).size).toBe(0);
  });

  it('同じ概念の別の問題に正解すると、次の期限が延びる', () => {
    const wrong = answer(q1.id, false, { at: T0 });
    const s1 = buildConceptSchedule([wrong], index);
    const firstDue = dueAt(s1.get('1.1-K1')!);
    const s2 = buildConceptSchedule([wrong, answer(q2.id, true, { at: firstDue, confidence: 'sure' })], index);
    const st = s2.get('1.1-K1')!;
    expect(dueAt(st) - firstDue).toBeGreaterThan(2 * DAY);
    expect(st.lastQuestionId).toBe(q2.id);
    // 1.1-K2 は q2 に含まれないので変わらない
    expect(dueAt(s2.get('1.1-K2')!)).toBe(dueAt(s1.get('1.1-K2')!));
  });

  it('保留模試での誤答も概念の予定には反映するが、出題は演習と基礎講座の問題だけ', () => {
    const s = buildConceptSchedule([answer(mockQ.id, false, { at: T0, mode: 'mockA' }), answer(onlyMock.id, false, { at: T1, mode: 'mockB' })], index);
    // 演習・基礎講座の問題がない概念（1.2-K1）はカードを作らない（今日の復習の件数に残り続けないように）
    expect([...s.keys()].sort()).toEqual(['1.1-K1']);
    expect(reviewableConcepts(index)).toEqual(new Set(['1.1-K1', '1.1-K2']));
    const { picks, noQuestion } = pickReviewQuestions(dueConcepts(s, T0 + 5 * DAY), index, buildHistory([]), 10, mulberry32(1));
    expect(picks.map((p) => p.questionId).some((id) => id.endsWith('-101'))).toBe(false);
    expect(picks.map((p) => p.conceptId)).toEqual(['1.1-K1']);
    expect(noQuestion).toEqual([]);
  });

  it('同じ提出でまとめて記録された回答は、概念ごとに最も悪い評価を1回だけ反映する（記録の順序に依らない）', () => {
    const wrong = { ...answer(q1.id, false, { at: T0, mode: 'mock', sessionId: 'm1' }), eventId: 'ev-b' };
    const right = { ...answer(q2.id, true, { at: T0, mode: 'mock', sessionId: 'm1', confidence: 'sure' }), eventId: 'ev-a' };
    const s1 = buildConceptSchedule([wrong, right], index);
    const s2 = buildConceptSchedule([{ ...wrong, eventId: 'ev-a' }, { ...right, eventId: 'ev-b' }], index);
    expect(dueAt(s1.get('1.1-K1')!)).toBe(dueAt(s2.get('1.1-K1')!));
    expect(s1.get('1.1-K1')).toMatchObject({ reviews: 1, lastQuestionId: q1.id });
    // 1 問でも間違えた概念は誤答（Again）として扱う
    expect(dueAt(s1.get('1.1-K1')!)).toBe(dueAt(buildConceptSchedule([answer(q1.id, false, { at: T0 })], index).get('1.1-K1')!));
  });

  it('前回その概念で解いた問題とは別の問題を優先し、同じセッションで同じ問題は出さない', () => {
    const events = [answer(q1.id, false, { at: T0 })];
    const s = buildConceptSchedule(events, index);
    const h = buildHistory(events);
    for (let seed = 0; seed < 10; seed++) {
      const { picks } = pickReviewQuestions(dueConcepts(s, T0 + 5 * DAY), index, h, 10, mulberry32(seed));
      expect(picks).toEqual([
        { questionId: q2.id, conceptId: '1.1-K1' },
        { questionId: q3.id, conceptId: '1.1-K2' },
      ]);
    }
  });

  it('別の問題がなければ同じ問題を出す', () => {
    const small = [q2].map(metaOf);
    const events = [answer(q2.id, false, { at: T0 })];
    const { picks } = pickReviewQuestions(dueConcepts(buildConceptSchedule(events, small), T0 + 5 * DAY), small, buildHistory(events), 10, mulberry32(1));
    expect(picks).toEqual([{ questionId: q2.id, conceptId: '1.1-K1' }]);
  });

  it('出題数の上限を守る', () => {
    const events = [answer(q1.id, false, { at: T0 })];
    const { picks } = pickReviewQuestions(dueConcepts(buildConceptSchedule(events, index), T0 + 5 * DAY), index, buildHistory(events), 1, mulberry32(1));
    expect(picks).toHaveLength(1);
  });

  it('索引にない問題の回答は無視する', () => {
    expect(buildConceptSchedule([answer('saa-4.4-zz-999', false, { at: T0 })], index).size).toBe(0);
  });
});
