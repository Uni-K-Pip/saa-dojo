import { checkCourse, courseMaterialContext, unitPracticePool } from '../../../scripts/lib/course.mjs';

// hiddenStatuses: 出題しない検証状態。ユニット演習の候補は、validate と同じく出題できる問題で数える
export function checkCourseForBuild(parsed, hiddenStatuses = new Set(), materialStatuses) {
  if (!parsed.course) return { errors: [], warnings: [] };
  return checkCourse(parsed.course.data, {
    lessons: parsed.lessons.map(({ data }) => data),
    docIds: new Set(parsed.docs.map(({ data }) => data.id)),
    ...courseMaterialContext(parsed, materialStatuses),
    questions: parsed.questions
      .filter(({ data }) => !hiddenStatuses.has(parsed.reviewStatus?.[data.id]?.status ?? 'pending'))
      .map(({ data }) => data),
  });
}

export function buildCourseOutput(parsed, questions, { labIds = new Set(), patternIds = new Set() } = {}) {
  const lessons = parsed.lessons.map(({ data }) => data);
  return {
    stages: parsed.course.data.stages.map((stage) => ({
      ...stage,
      units: stage.units.map((unit) => ({
        ...unit,
        items: unit.items.filter((item) => {
          if (item.kind === 'lab') return labIds.has(item.ref);
          if (item.kind === 'pattern') return patternIds.has(item.ref);
          return true;
        }),
        stage: stage.id,
        practiceIds: unit.items.some(({ kind }) => kind === 'practice') ? unitPracticePool(unit, { lessons, questions }) : [],
      })),
    })),
  };
}
