import type { Course, CourseItem, CourseUnit } from '../content/course-types';
import type { QuestionMeta } from '../content/types';
import { compareEvents, type AppEvent, type CourseCheckEvent, type MockKind } from './events';
import type { History } from './history';
import type { Rng } from './rng';
import { FULL_MOCK_SIZE } from './mock';
import { pickQuestions } from './selection';

export const UNIT_PRACTICE_DONE = 10;

interface CourseContext {
  events: readonly AppEvent[];
  history: History;
}

function courseItemKey(item: CourseItem): string {
  switch (item.kind) {
    case 'lesson':
    case 'doc':
    case 'lab':
    case 'pattern':
      return `${item.kind}:${item.ref}`;
    case 'mock':
      return `mock:${item.mock}`;
    default:
      return item.kind;
  }
}

function courseCheckKey(unitId: string, itemKey: string): string {
  return `${unitId}:${itemKey}`;
}

function collectCompletion(events: readonly AppEvent[]) {
  const lessons = new Set<string>();
  const labs = new Set<string>();
  const patterns = new Set<string>();
  const mocks = new Set<MockKind>();
  const checks = new Map<string, CourseCheckEvent>();
  let drill = false;
  for (const event of events) {
    switch (event.type) {
      case 'lesson-read':
        lessons.add(event.lessonId);
        break;
      case 'lab-read':
        labs.add(event.labId);
        break;
      case 'pattern-read':
        patterns.add(event.patternId);
        break;
      case 'mock-result':
        // 合格準備度が初回として数える結果（65 問以上で 1 問以上回答。mock.ts の firstAttempt）だけで済みにする
        if (event.total >= FULL_MOCK_SIZE && event.answered > 0) mocks.add(event.kind);
        break;
      case 'drill':
        drill = true;
        break;
      case 'course-check': {
        const key = courseCheckKey(event.unitId, event.itemKey);
        const previous = checks.get(key);
        if (!previous || compareEvents(previous, event) < 0) checks.set(key, event);
        break;
      }
    }
  }
  return { lessons, labs, patterns, mocks, checks, drill };
}

export function answeredUnitPracticeCount(unit: CourseUnit, history: History): number {
  return unit.practiceIds.filter((id) => history.questions.has(id)).length;
}

function progressFor(unit: CourseUnit, history: History, completion: ReturnType<typeof collectCompletion>) {
  function isDone(item: CourseItem, key: string): boolean {
    switch (item.kind) {
      case 'lesson':
        return completion.lessons.has(item.ref);
      case 'lab':
        return completion.labs.has(item.ref);
      case 'pattern':
        return completion.patterns.has(item.ref);
      case 'practice':
        // 候補が 0 問なら済みにしない（要修正の問題を除いた結果、候補がなくなった場合）
        return unit.practiceIds.length > 0 &&
          answeredUnitPracticeCount(unit, history) >= Math.min(UNIT_PRACTICE_DONE, unit.practiceIds.length);
      case 'mock':
        return completion.mocks.has(item.mock);
      case 'drill':
        return completion.drill;
      case 'doc':
      case 'analysis':
        return completion.checks.get(courseCheckKey(unit.id, key))?.done === true;
    }
  }

  const items = unit.items.map((item) => {
    const key = courseItemKey(item);
    return { item, key, done: isDone(item, key) };
  });
  return { done: items.filter((item) => item.done).length, total: items.length, items };
}

export function unitProgress(unit: CourseUnit, { events, history }: CourseContext) {
  return progressFor(unit, history, collectCompletion(events));
}

export function courseProgress(course: Course, { events, history }: CourseContext) {
  const completion = collectCompletion(events);
  let done = 0;
  let total = 0;
  const stages = course.stages.map((stage) => ({
    stage,
    units: stage.units.map((unit) => {
      const progress = progressFor(unit, history, completion);
      done += progress.done;
      total += progress.total;
      return { unit, ...progress };
    }),
  }));
  return { done, total, stages };
}

export function nextStep(course: Course, { events, history }: CourseContext) {
  const completion = collectCompletion(events);
  for (const stage of course.stages) {
    for (const unit of stage.units) {
      const next = progressFor(unit, history, completion).items.find(({ done }) => !done);
      if (next) return { unit, item: next.item };
    }
  }
  return null;
}

export function unitPracticeCandidates(unit: CourseUnit, index: readonly QuestionMeta[]): QuestionMeta[] {
  const ids = new Set(unit.practiceIds);
  return index.filter((q) => ids.has(q.id) && (q.pool === 'practice' || q.pool === 'basics'));
}

export function pickUnitPractice(unit: CourseUnit, index: readonly QuestionMeta[], history: History, count: number, rng: Rng): string[] {
  return pickQuestions(unitPracticeCandidates(unit, index), history, count, rng);
}
