// コンテンツのスキーマ。validate.mjs / coverage.mjs が使い、app 側の型もこれに合わせる。
// 互換性を保つため、項目の削除・必須化はしない（任意項目の追加のみ）。
import { z } from 'zod';

export const EXAM = 'SAA-C03';
export const CONTENT_ROOT = 'content/saa-c03';

// 出典として認める AWS 公式ドメイン（サブドメインを含む）
export const ALLOWED_REF_HOSTS = ['docs.aws.amazon.com', 'aws.amazon.com', 'd1.awsstatic.com'];

export const SESSION_ID = /^[a-z][a-z0-9]{0,5}$/;
export const TASK_ID = /^(basics|[1-4]\.[1-5])$/;
export const QUESTION_ID = /^saa-(basics|[1-4]\.[1-5])-([a-z][a-z0-9]{0,5})-(\d{3})$/;
// 出題範囲の項目ID。例: 1.1-K3（知識）、1.1-S2（スキル）、basics-K4（基礎講座）
export const ITEM_ID = /^(basics|[1-4]\.[1-5])-[KS]\d{1,2}$/;
export const LESSON_ID = /^lesson-(basics|[1-4]\.[1-5])-[a-z0-9-]{2,40}$/;
export const DOC_ID = /^(cheatsheet|guide)-[a-z0-9-]{2,40}$/;
export const FLASHCARD_ID = /^fc-([a-z][a-z0-9]{0,5})-(\d{3})$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

// 判断軸: 問題文の制約語が何を最優先しているか
export const QUALIFIERS = ['cost', 'operational', 'availability', 'performance', 'security', 'minimal-change', 'other'];
// basics: 基礎講座の確認問題 / practice: 演習 / mockA・mockB: 保留模試（演習には出さない）
export const POOLS = ['basics', 'practice', 'mockA', 'mockB'];
// 本番の65問をドメイン比重（30/26/24/20%）で割り振った数
export const MOCK_COMPOSITION = { 1: 20, 2: 17, 3: 15, 4: 13 };

export function hostAllowed(url) {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_REF_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function domainOfTask(task) {
  return task === 'basics' ? 0 : Number(task[0]);
}

const sessionId = z.string().regex(SESSION_ID);
const taskId = z.string().regex(TASK_ID);
const itemId = z.string().regex(ITEM_ID);
const serviceName = z.string().min(2).max(80);

export const OptionSchema = z
  .object({
    id: z.enum(['a', 'b', 'c', 'd', 'e', 'f']),
    text: z.string().min(2).max(300),
    correct: z.boolean(),
    rationale: z.string().min(15).max(700),
  })
  .strict();

export const ReferenceSchema = z
  .object({
    title: z.string().min(2).max(200),
    url: z.string().url().refine(hostAllowed, { message: '出典は AWS 公式ドメインの URL にする' }),
  })
  .strict();

export const QuestionSchema = z
  .object({
    id: z.string().regex(QUESTION_ID),
    exam: z.literal(EXAM),
    domain: z.number().int().min(0).max(4),
    taskStatement: taskId,
    knowledgeRefs: z.array(itemId).min(1).max(4),
    services: z.array(serviceName).min(1).max(8),
    qualifier: z.enum(QUALIFIERS),
    tags: z.array(z.string().min(1).max(40)).max(10),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    type: z.enum(['single', 'multiple']),
    selectCount: z.number().int().min(1).max(3),
    stem: z.string().min(60).max(700),
    options: z.array(OptionSchema).min(4).max(6),
    explanation: z.string().min(80).max(2500),
    keyPoints: z.array(z.string().min(6).max(200)).min(1).max(5),
    references: z.array(ReferenceSchema).min(1).max(4),
    lessonRefs: z.array(z.string().regex(LESSON_ID)).max(4),
    pool: z.enum(POOLS),
    needsSourceCheck: z.boolean(),
    createdBy: sessionId,
    createdAt: z.string().regex(DATE),
  })
  .strict()
  .superRefine((q, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const m = QUESTION_ID.exec(q.id);
    if (m) {
      if (m[1] !== q.taskStatement) issue(`id のタスク ${m[1]} と taskStatement ${q.taskStatement} が違う`);
      if (m[2] !== q.createdBy) issue(`id のセッション ${m[2]} と createdBy ${q.createdBy} が違う`);
    }
    if (q.domain !== domainOfTask(q.taskStatement)) issue(`domain ${q.domain} が taskStatement ${q.taskStatement} と合わない`);
    if ((q.taskStatement === 'basics') !== (q.pool === 'basics')) issue('基礎講座の問題は pool=basics、それ以外は basics 以外にする');
    for (const ref of q.knowledgeRefs) {
      if (!ref.startsWith(`${q.taskStatement}-`)) issue(`knowledgeRefs ${ref} が taskStatement ${q.taskStatement} の項目ではない`);
    }
    const ids = q.options.map((o) => o.id);
    const expected = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, ids.length);
    if (ids.join() !== expected.join()) issue(`選択肢の id は a から順に付ける（実際: ${ids.join(',')}）`);
    const nCorrect = q.options.filter((o) => o.correct).length;
    if (q.type === 'single') {
      if (q.selectCount !== 1) issue('single は selectCount=1');
      if (nCorrect !== 1) issue(`single の正解は1つ（実際: ${nCorrect}）`);
      if (q.options.length !== 4) issue('single の選択肢は4つ');
    } else {
      if (q.selectCount < 2) issue('multiple は selectCount>=2');
      if (nCorrect !== q.selectCount) issue(`正解数 ${nCorrect} が selectCount ${q.selectCount} と違う`);
      if (q.options.length < 5) issue('multiple の選択肢は5つ以上');
    }
  });

export const LessonFrontSchema = z
  .object({
    id: z.string().regex(LESSON_ID),
    title: z.string().min(2).max(80),
    domain: z.number().int().min(0).max(4),
    taskStatement: taskId,
    order: z.number().int().min(0).max(999),
    knowledgeRefs: z.array(itemId).max(40),
    services: z.array(serviceName).max(40),
    estimatedMinutes: z.number().int().min(3).max(90),
    createdBy: sessionId,
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.domain !== domainOfTask(l.taskStatement)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `domain ${l.domain} が taskStatement ${l.taskStatement} と合わない` });
    }
  });

// 比較早見表・試験戦略や受験手続きのガイド（Markdown の front matter）
export const DocFrontSchema = z
  .object({
    id: z.string().regex(DOC_ID),
    title: z.string().min(2).max(80),
    order: z.number().int().min(0).max(999),
    taskStatements: z.array(taskId).max(20),
    services: z.array(serviceName).max(40),
    createdBy: sessionId,
  })
  .strict();

export const FlashcardSchema = z
  .object({
    id: z.string().regex(FLASHCARD_ID),
    front: z.string().min(2).max(200),
    back: z.string().min(2).max(600),
    taskStatements: z.array(taskId).max(5),
    services: z.array(serviceName).max(6),
    tags: z.array(z.string().min(1).max(40)).max(8),
  })
  .strict();

export const FlashcardDeckSchema = z
  .object({
    deck: z.string().regex(/^[a-z0-9-]{2,40}$/),
    title: z.string().min(2).max(80),
    createdBy: sessionId,
    cards: z.array(FlashcardSchema).min(1),
  })
  .strict();

export const GlossaryEntrySchema = z
  .object({
    term: z.string().min(1).max(80),
    en: z.string().min(1).max(120),
    definition: z.string().min(10).max(600),
    services: z.array(serviceName).max(6),
    related: z.array(z.string().min(1).max(80)).max(8),
  })
  .strict();

export const GlossaryFileSchema = z
  .object({
    createdBy: sessionId,
    entries: z.array(GlossaryEntrySchema).min(1),
  })
  .strict();

const BlueprintItemSchema = z
  .object({
    id: itemId,
    kind: z.enum(['knowledge', 'skill']),
    textJa: z.string().min(4).max(300),
  })
  .strict();

const TaskStatementSchema = z
  .object({
    id: z.string().regex(/^[1-4]\.[1-5]$/),
    titleEn: z.string().min(4),
    titleJa: z.string().min(4),
    items: z.array(BlueprintItemSchema).min(1),
    keyServices: z.array(serviceName),
  })
  .strict();

export const BlueprintSchema = z
  .object({
    exam: z
      .object({
        code: z.literal(EXAM),
        nameEn: z.string(),
        nameJa: z.string(),
        questionsTotal: z.number().int(),
        questionsScored: z.number().int(),
        durationMinutes: z.number().int(),
        passingScore: z.number().int(),
        scoreRange: z.string(),
        questionTypes: z.array(z.string()),
      })
      .strict(),
    checkedAt: z.string().regex(DATE),
    domains: z
      .array(
        z
          .object({
            id: z.number().int().min(1).max(4),
            nameEn: z.string(),
            nameJa: z.string(),
            weightPercent: z.number(),
            taskStatements: z.array(TaskStatementSchema).min(1),
          })
          .strict(),
      )
      .length(4),
    basics: z
      .object({
        titleJa: z.string(),
        items: z.array(BlueprintItemSchema).min(1),
      })
      .strict(),
    services: z
      .object({
        inScope: z.array(z.object({ category: z.string(), services: z.array(serviceName) }).strict()),
        outOfScope: z.array(serviceName),
      })
      .strict(),
    sources: z.array(z.object({ title: z.string(), url: z.string().url() }).strict()),
  })
  .strict();

// 検証結果（アプリはこの状態で出題を絞る）。キーは問題 id。
export const ReviewStatusSchema = z.record(
  z.string().regex(QUESTION_ID),
  z
    .object({
      status: z.enum(['verified', 'pending', 'needs-fix', 'rejected']),
      checkedAt: z.string().regex(DATE),
    })
    .strict(),
);
