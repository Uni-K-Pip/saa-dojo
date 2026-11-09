import { describe, expect, it } from 'vitest';
import type { LessonMeta } from '../content/types';
import { relatedLessons } from './progress';

const lesson = (id: string, taskStatement: string): LessonMeta => ({
  id,
  title: id,
  domain: Number(taskStatement[0]) || 0,
  taskStatement,
  order: 1,
  knowledgeRefs: [],
  services: [],
  estimatedMinutes: 10,
  questionIds: [],
});
const lessons = [lesson('lesson-2.2-ha-basics', '2.2'), lesson('lesson-2.2-dr', '2.2'), lesson('lesson-2.1-decoupling', '2.1')];

describe('関連レッスン', () => {
  it('lessonRefs のうち存在するレッスンを出す', () => {
    expect(relatedLessons({ lessonRefs: ['lesson-2.2-dr', 'lesson-2.2-none'], taskStatement: '2.2' }, lessons).map((l) => l.id)).toEqual(['lesson-2.2-dr']);
  });
  it('lessonRefs が空か、存在しないレッスンだけなら同じタスクのレッスンを出す', () => {
    expect(relatedLessons({ lessonRefs: [], taskStatement: '2.2' }, lessons).map((l) => l.id)).toEqual(['lesson-2.2-ha-basics', 'lesson-2.2-dr']);
    expect(relatedLessons({ lessonRefs: ['lesson-2.1-none'], taskStatement: '2.1' }, lessons).map((l) => l.id)).toEqual(['lesson-2.1-decoupling']);
    expect(relatedLessons({ lessonRefs: [], taskStatement: '3.1' }, lessons)).toEqual([]);
  });
});
