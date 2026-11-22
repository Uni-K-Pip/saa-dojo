import { describe, expect, it } from 'vitest';
import type { Course, CourseItem, CourseUnit } from '../content/course-types';
import { answer, event, makeQuestion, metaOf } from '../test/fixtures';
import { courseProgress, nextStep, pickUnitPractice, UNIT_PRACTICE_DONE, unitProgress } from './course';
import type { AppEvent } from './events';
import { buildHistory } from './history';
import { mulberry32 } from './rng';

const lesson = { kind: 'lesson', ref: 'lesson-1.1-iam-basics' } as const;
const doc = { kind: 'doc', ref: 'guide-exam-strategy' } as const;
const unitOf = (id: string, items: CourseItem[], practiceIds: string[] = [], stage = 0): CourseUnit => ({
  id, title: `ユニット ${id}`, stage, items, practiceIds,
});
const ctx = (events: AppEvent[] = []) => ({ events, history: buildHistory(events) });
const docKey = `doc:${doc.ref}`;

describe('学習コースの進み具合', () => {
  it('項目ごとの記録で済みになる', () => {
    const unit = unitOf('u00', [
      lesson, doc, { kind: 'practice' }, { kind: 'drill' }, { kind: 'analysis' },
      { kind: 'mock', mock: 'random' }, { kind: 'mock', mock: 'mockA' }, { kind: 'mock', mock: 'mockB' },
    ], ['q1', 'q2']);
    expect(unitProgress(unit, ctx()).done).toBe(0);
    const events = [
      event('lesson-read', { lessonId: lesson.ref }),
      event('course-check', { unitId: unit.id, itemKey: docKey, done: true }),
      event('course-check', { unitId: unit.id, itemKey: 'analysis', done: true }),
      event('drill', { sessionId: 'd', correct: 0, total: 5, durationMs: 2000 }),
      event('mock-result', { kind: 'mockA' }),
      answer('q1', false, { mode: 'unit' }),
      answer('q2', true, { mode: 'review' }),
    ];
    const progress = unitProgress(unit, ctx(events));
    expect(progress).toMatchObject({ done: 6, total: 8 });
    expect(progress.items.map(({ key, done }) => [key, done])).toEqual([
      [`lesson:${lesson.ref}`, true], [docKey, true], ['practice', true], ['drill', true], ['analysis', true],
      ['mock:random', false], ['mock:mockA', true], ['mock:mockB', false],
    ]);
  });

  it('候補が 10 問より多い演習は、異なる候補 10 問に答えると済みになる', () => {
    const ids = Array.from({ length: UNIT_PRACTICE_DONE + 2 }, (_, i) => `q${i}`);
    const unit = unitOf('u00', [{ kind: 'practice' }], ids);
    const early = ids.slice(0, UNIT_PRACTICE_DONE - 1).map((id) => answer(id, false));
    const events = [...early, answer(ids[0]!, true), answer('候補外', true)];
    expect(unitProgress(unit, ctx(events)).done).toBe(0);
    expect(unitProgress(unit, ctx([...events, answer(ids[UNIT_PRACTICE_DONE - 1]!, true)])).done).toBe(1);
  });

  it('手動の記録はユニットと項目ごとに最後の操作が勝つ', () => {
    const unit = unitOf('u00', [doc, { kind: 'analysis' }]);
    const mark = (done: boolean, at: number, unitId = unit.id) => event('course-check', { unitId, itemKey: docKey, done }, at);
    const first = mark(true, 1);
    const last = mark(false, 2);
    const other = mark(true, 3, 'u01');
    expect(unitProgress(unit, ctx([last, first, other])).done).toBe(0);
    // 時刻が同じならイベント ID 順で決めます。
    const sameTime = mark(true, 2);
    expect(unitProgress(unit, ctx([sameTime, last, first, other])).items.map(({ done }) => done)).toEqual([true, false]);
  });

  it('ステージとユニットの順で未了を出し、後のユニットを先に済ませても進み具合に反映する', () => {
    const first = unitOf('u00', [lesson, doc]);
    const second = unitOf('u01', [{ kind: 'analysis' }], [], 1);
    const course: Course = { stages: [
      { id: 0, title: '土台', goal: '前提知識を学ぶ', units: [first] },
      { id: 1, title: '中心の部品', goal: '仕組みを学ぶ', units: [second] },
    ] };
    const read = event('lesson-read', { lessonId: lesson.ref });
    const checked = event('course-check', { unitId: first.id, itemKey: docKey, done: true });
    const skippedAhead = event('course-check', { unitId: second.id, itemKey: 'analysis', done: true });
    expect(nextStep(course, ctx())).toEqual({ unit: first, item: lesson });
    expect(nextStep(course, ctx([skippedAhead]))).toEqual({ unit: first, item: lesson });
    expect(nextStep(course, ctx([read, skippedAhead]))).toEqual({ unit: first, item: doc });
    expect(nextStep(course, ctx([read, checked]))).toEqual({ unit: second, item: second.items[0] });
    expect(courseProgress(course, ctx([read, skippedAhead]))).toMatchObject({
      done: 2, total: 3, stages: [{ units: [{ done: 1, total: 2 }] }, { units: [{ done: 1, total: 1 }] }],
    });
    expect(nextStep(course, ctx([read, checked, skippedAhead]))).toBeNull();
  });
});

describe('ユニット演習の出題', () => {
  it('指定数まで選び、不足時は候補をすべて返す。保留模試と索引にない問題は除く', () => {
    const practice = Array.from({ length: 15 }, (_, i) => metaOf(makeQuestion({ id: `saa-1.1-t-${i + 1}` })));
    const basics = metaOf(makeQuestion({ id: 'saa-basics-t-001', domain: 0, pool: 'basics' }));
    const mockA = metaOf(makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' }));
    const mockB = metaOf(makeQuestion({ id: 'saa-1.1-t-201', pool: 'mockB' }));
    const outside = metaOf(makeQuestion({ id: 'saa-1.1-t-999' }));
    const index = [...practice, basics, mockA, mockB];
    const unit = unitOf('u00', [{ kind: 'practice' }], [...index.map(({ id }) => id), 'missing']);
    const history = buildHistory([answer(practice[0]!.id, true)]);
    const pick = (count: number) => pickUnitPractice(unit, [...index, outside], history, count, mulberry32(1));

    expect(pick(10)).toHaveLength(10);
    expect(pick(15)).toHaveLength(15);
    expect(pick(15)).not.toContain(practice[0]!.id);
    expect(pick(20).sort()).toEqual([...practice, basics].map(({ id }) => id).sort());
  });
});
