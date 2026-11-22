import { checkCourse, unitPracticePool } from '../../../scripts/lib/course.mjs';

export function checkCourseForBuild(parsed) {
  if (!parsed.course) return { errors: [], warnings: [] };
  return checkCourse(parsed.course.data, {
    lessons: parsed.lessons.map(({ data }) => data),
    docIds: new Set(parsed.docs.map(({ data }) => data.id)),
    questions: parsed.questions.map(({ data }) => data),
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
