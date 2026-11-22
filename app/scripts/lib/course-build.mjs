import { checkCourse, unitPracticePool } from '../../../scripts/lib/course.mjs';

// hiddenStatuses: 出題しない検証状態。ユニット演習の候補は、validate と同じく出題できる問題で数える
export function checkCourseForBuild(parsed, hiddenStatuses = new Set()) {
  if (!parsed.course) return { errors: [], warnings: [] };
  return checkCourse(parsed.course.data, {
    lessons: parsed.lessons.map(({ data }) => data),
    docIds: new Set(parsed.docs.map(({ data }) => data.id)),
    questions: parsed.questions
      .filter(({ data }) => !hiddenStatuses.has(parsed.reviewStatus?.[data.id]?.status ?? 'pending'))
      .map(({ data }) => data),
  });
}

export function buildCourseOutput(parsed, questions) {
  const lessons = parsed.lessons.map(({ data }) => data);
  return {
    stages: parsed.course.data.stages.map((stage) => ({
      ...stage,
      units: stage.units.map((unit) => ({
        ...unit,
        stage: stage.id,
        practiceIds: unit.items.some(({ kind }) => kind === 'practice') ? unitPracticePool(unit, { lessons, questions }) : [],
      })),
    })),
  };
}
