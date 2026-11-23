import { z } from 'zod';
import { DOC_ID, LAB_ID, LESSON_ID, PATTERN_ID } from './schema.mjs';
import { STATUS_LABELS } from './material-status.mjs';

// ミニラボの量産が始まったら true にする。
export const WARN_UNITS_WITHOUT_LAB = false;

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
  item('lab', { ref: z.string().regex(LAB_ID) }),
  item('pattern', { ref: z.string().regex(PATTERN_ID) }),
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
    case 'lab':
    case 'pattern':
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

const ORDERED_ITEMS = ['lesson', 'lab', 'doc', 'pattern', 'practice'];
const ITEM_LABELS = { lesson: 'レッスン', lab: 'ミニラボ', doc: '早見表・ガイド', pattern: '設計パターン', practice: 'ユニット演習' };

export function courseMaterialContext({ labs = [], patterns = [] }, materialStatuses) {
  const labUnits = new Map(labs.map(({ data }) => [data.id, data.unit]));
  return {
    labIds: new Set(labUnits.keys()),
    patternIds: new Set(patterns.map(({ data }) => data.id)),
    labUnits,
    materialStatuses,
  };
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
      let lastOrder = -1;
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
        if (item.kind === 'lab' || item.kind === 'pattern') {
          const isLab = item.kind === 'lab';
          const ids = isLab ? ctx.labIds : ctx.patternIds;
          const label = ITEM_LABELS[item.kind];
          if (!ids?.has(item.ref)) errors.push(`${unit.id} の${label} ${item.ref} が見つかりません`);
          else {
            const status = ctx.materialStatuses?.[isLab ? 'labs' : 'patterns']?.get(item.ref)?.status;
            if (status && status !== 'verified') {
              const build = status === 'pending' ? '本番のビルドでは' : 'どのビルドでも';
              warnings.push({
                code: 'course-material-unverified',
                message: `${unit.id} が${label} ${item.ref}（${STATUS_LABELS[status]}）を指しています。${build}ユニットの画面に出しません`,
              });
            }
            const labUnit = isLab ? ctx.labUnits?.get(item.ref) : undefined;
            if (labUnit && labUnit !== unit.id) {
              warnings.push({ code: 'course-lab-unit', message: `${unit.id} のミニラボ ${item.ref} は ${labUnit} の教材です` });
            }
          }
        }
        const order = ORDERED_ITEMS.indexOf(item.kind);
        if (order >= 0 && order < lastOrder) {
          warnings.push({
            code: 'course-item-order',
            message: `${unit.id} では${ITEM_LABELS[ORDERED_ITEMS[lastOrder]]}を${ITEM_LABELS[item.kind]}のあとに置いてください`,
          });
        }
        lastOrder = Math.max(lastOrder, order);
      }

      if (itemKeys.has('practice')) {
        if (!hasLesson) errors.push(`${unit.id} にユニット演習がありますが、レッスンがありません`);
        if (unitPracticePool(unit, ctx).length === 0) errors.push(`${unit.id} のユニット演習の候補が 0 問です`);
      }
      if (ctx.warnUnitsWithoutLab === true && (stage.id === 1 || stage.id === 2) &&
          !unit.items.some((item) => item.kind === 'lab' && ctx.labIds?.has(item.ref))) {
        warnings.push({ code: 'course-no-lab', message: `${unit.id} にミニラボがありません` });
      }
    }
  }

  for (const id of lessonIds) {
    if (!lessonUnits.has(id)) errors.push(`レッスン ${id} がどのユニットにも入っていません`);
  }
  return { errors, warnings };
}
