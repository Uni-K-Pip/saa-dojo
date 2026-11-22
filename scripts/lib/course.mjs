import { z } from 'zod';
import { DOC_ID, LESSON_ID } from './schema.mjs';

const item = (kind, fields = {}) => z.object({
  kind: z.literal(kind),
  note: z.string().min(1).max(60).optional(),
  ...fields,
}).strict();

const itemSchemas = [
  item('lesson', { ref: z.string().regex(LESSON_ID) }),
  item('doc', { ref: z.string().regex(DOC_ID) }),
  item('practice'),
  item('drill'),
  item('analysis'),
  item('mock', { mock: z.enum(['random', 'mockA', 'mockB']) }),
];
export const COURSE_ITEM_KINDS = itemSchemas.map((schema) => schema.shape.kind.value);

const UnitSchema = z.object({
  id: z.string().regex(/^u\d{2}$/),
  title: z.string().min(1).max(30),
  items: z.array(z.discriminatedUnion('kind', itemSchemas)).min(1),
}).strict();

const StageSchema = z.object({
  id: z.number().int().min(0).max(4),
  title: z.string().min(1).max(20),
  goal: z.string().min(1).max(80),
  units: z.array(UnitSchema).min(1),
}).strict();

export const CourseSchema = z.object({ stages: z.array(StageSchema).min(1) }).strict();

export function courseItemKey(item) {
  switch (item.kind) {
    case 'lesson':
    case 'doc':
      return `${item.kind}:${item.ref}`;
    case 'mock':
      return `mock:${item.mock}`;
    default:
      return item.kind;
  }
}

export function unitPracticePool(unit, { lessons, questions }) {
  const lessonIds = new Set(unit.items.filter(({ kind }) => kind === 'lesson').map(({ ref }) => ref));
  const refs = new Set(lessons.filter(({ id }) => lessonIds.has(id)).flatMap(({ knowledgeRefs }) => knowledgeRefs));
  return questions
    .filter((q) => (q.pool === 'practice' || q.pool === 'basics') && q.knowledgeRefs.some((ref) => refs.has(ref)))
    .map(({ id }) => id)
    .sort();
}

export function checkCourse(course, ctx) {
  const errors = [];
  const warnings = [];
  const unitIds = new Set();
  const lessonIds = new Set(ctx.lessons.map(({ id }) => id));
  const lessonUnits = new Map();
  let previousUnitId = '';

  for (const [index, stage] of course.stages.entries()) {
    if (stage.id !== index) errors.push(`ステージの id は 0 から順に並べてください（期待 ${index}、実際 ${stage.id}）`);
    for (const unit of stage.units) {
      if (unitIds.has(unit.id)) errors.push(`ユニットの id ${unit.id} が重複しています`);
      if (unit.id <= previousUnitId) errors.push(`ユニットの id を昇順にしてください（${previousUnitId} → ${unit.id}）`);
      unitIds.add(unit.id);
      previousUnitId = unit.id;

      const itemKeys = new Set();
      let hasLesson = false;
      for (const item of unit.items) {
        const key = courseItemKey(item);
        if (itemKeys.has(key)) errors.push(`${unit.id} の項目 ${key} が重複しています`);
        itemKeys.add(key);
        if (item.kind === 'lesson') {
          hasLesson = true;
          if (!lessonIds.has(item.ref)) errors.push(`${unit.id} のレッスン ${item.ref} が見つかりません`);
          const firstUnit = lessonUnits.get(item.ref);
          if (firstUnit && firstUnit !== unit) {
            errors.push(`レッスン ${item.ref} が複数のユニット（${firstUnit.id}、${unit.id}）に入っています`);
          }
          lessonUnits.set(item.ref, firstUnit ?? unit);
        }
        if (item.kind === 'doc' && !ctx.docIds.has(item.ref)) {
          errors.push(`${unit.id} の早見表・ガイド ${item.ref} が見つかりません`);
        }
      }

      if (itemKeys.has('practice')) {
        if (!hasLesson) errors.push(`${unit.id} にユニット演習がありますが、レッスンがありません`);
        if (unitPracticePool(unit, ctx).length === 0) errors.push(`${unit.id} のユニット演習の候補が 0 問です`);
      }
      // ミニラボの教材がまだない間は検査しません。
      if (ctx.labIds?.size && (stage.id === 1 || stage.id === 2) &&
          !unit.items.some((item) => item.kind === 'lab' && ctx.labIds.has(item.ref))) {
        warnings.push({ code: 'course-no-lab', message: `${unit.id} にミニラボがありません` });
      }
    }
  }

  for (const id of lessonIds) {
    if (!lessonUnits.has(id)) errors.push(`レッスン ${id} がどのユニットにも入っていません`);
  }
  return { errors, warnings };
}
