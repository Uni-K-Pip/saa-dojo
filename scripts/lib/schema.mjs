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
// サービス台帳（services.json）の id
export const SERVICE_ID = /^[a-z][a-z0-9-]{1,39}$/;
// 図鑑の事実（<サービスid>.<スラッグ>）と比較（cmp-…）
export const FACT_ID = /^([a-z][a-z0-9-]{1,39})\.([a-z0-9][a-z0-9-]{1,39})$/;
export const COMPARISON_ID = /^cmp-[a-z0-9][a-z0-9-]{1,60}$/;
export const FACT_KINDS = ['feature', 'constraint', 'quota', 'pricing', 'integration'];
export const FACT_DEPTHS = ['core', 'detail'];
export const REVIEW_STATUSES = ['verified', 'pending', 'needs-fix', 'rejected'];

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
    // 図鑑の事実への参照（任意）。既存の問題には、その問題を直す機会に書き足す
    factRefs: z.array(z.string().regex(FACT_ID)).max(6).optional(),
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
      status: z.enum(REVIEW_STATUSES),
      checkedAt: z.string().regex(DATE),
    })
    .strict(),
);

// サービス台帳（services.json）。1 つのサービスに 1 つの id と 1 つの正規名を決め、別の表記を aliases に持つ。
export const ServiceRegistrySchema = z
  .object({
    checkedAt: z.string().regex(DATE),
    services: z
      .array(
        z
          .object({
            id: z.string().regex(SERVICE_ID),
            name: serviceName,
            short: z.string().min(1).max(30).optional(),
            aliases: z.array(serviceName),
            category: z.string().min(1).max(40),
            hostedBy: z.string().regex(SERVICE_ID).optional(),
            note: z.string().min(1).max(400).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

// ---------------------------------------------------------------- サービス図鑑（docs/service-catalog-design.md の 3・4 章）

const serviceId = z.string().regex(SERVICE_ID);
const factId = z.string().regex(FACT_ID);
const shortLine = (max) => z.string().min(4).max(max);
const unique = (list) => new Set(list).size === list.length;

// 図鑑の事実。1件に1つの事実だけを書き、出典で確かめた日を checkedAt に入れる
export const CatalogFactSchema = z
  .object({
    id: factId,
    title: z.string().min(2).max(60),
    kind: z.enum(FACT_KINDS),
    text: z.string().min(40).max(400),
    examPoint: shortLine(150).optional(),
    trap: shortLine(150).optional(),
    depth: z.enum(FACT_DEPTHS),
    services: z.array(serviceName).max(4).optional(),
    tags: z.array(z.string().min(1).max(20)).max(6).optional(),
    sources: z.array(ReferenceSchema).min(1).max(3),
    checkedAt: z.string().regex(DATE),
  })
  .strict();

// 選ばれる決め手・選ばれない条件の1項目
const CatalogPointSchema = z
  .object({
    text: z.string().min(10).max(120),
    factRefs: z.array(factId).max(6).optional(),
    alternatives: z.array(serviceId).max(6).optional(),
  })
  .strict();

// 図鑑のエントリ（1サービス1ファイル。content/saa-c03/catalog/services/<id>.json）
export const CatalogEntrySchema = z
  .object({
    id: serviceId,
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    summary: z.string().min(40).max(200),
    chooseWhen: z.array(CatalogPointSchema).min(1).max(6).optional(),
    avoidWhen: z.array(CatalogPointSchema).min(1).max(6).optional(),
    facts: z.array(CatalogFactSchema).max(40),
    seeAlso: z.array(factId).max(12).optional(),
    lessonRefs: z.array(z.string().regex(LESSON_ID)).max(6).optional(),
    docRefs: z.array(z.string().regex(DOC_ID)).max(6).optional(),
    references: z.array(ReferenceSchema).min(1).max(3),
    createdBy: sessionId,
    createdAt: z.string().regex(DATE),
    updatedAt: z.string().regex(DATE).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const ids = e.facts.map((f) => f.id);
    for (const id of ids) if (!id.startsWith(`${e.id}.`)) issue(`事実 ${id} の接頭辞がエントリの id ${e.id} と違う`);
    if (!unique(ids)) issue('事実の id が重複している');
    for (const id of e.seeAlso ?? []) if (id.startsWith(`${e.id}.`)) issue(`seeAlso ${id} は自分のエントリの事実（他のエントリの事実だけを書く）`);
  });

// 比較（content/saa-c03/catalog/comparisons/<id>.json）。rows か docRef のどちらか一方を持つ
export const CatalogComparisonSchema = z
  .object({
    id: z.string().regex(COMPARISON_ID),
    title: z.string().min(2).max(80),
    services: z.array(serviceId).min(2).max(3),
    decide: z.array(z.string().min(4).max(150)).min(1).max(5),
    rows: z
      .array(
        z
          .object({
            axis: z.string().min(1).max(40),
            values: z.record(serviceId, z.string().min(1).max(150)),
            factRefs: z.array(factId).max(6).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12)
      .optional(),
    docRef: z.string().regex(DOC_ID).optional(),
    sources: z.array(ReferenceSchema).min(1).max(3),
    checkedAt: z.string().regex(DATE),
    createdBy: sessionId,
  })
  .strict()
  .superRefine((c, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (!unique(c.services)) issue('services が重複している');
    if (Boolean(c.rows) === Boolean(c.docRef)) issue('rows と docRef のどちらか一方だけを書く');
    const want = [...c.services].sort().join(',');
    for (const r of c.rows ?? []) {
      const got = Object.keys(r.values).sort().join(',');
      if (got !== want) issue(`rows「${r.axis}」の values は services の全員分（${want}）をそろえる（実際: ${got}）`);
    }
  });

// 図鑑の検証状態（content/saa-c03/catalog-status.json）。キーはエントリ id・事実 id・比較 id。
// hash は検証した時点の内容のハッシュ（scripts/lib/catalog.mjs の catalogHash）
export const CatalogStatusSchema = z.record(
  z.string().refine((k) => SERVICE_ID.test(k) || FACT_ID.test(k) || COMPARISON_ID.test(k), { message: 'エントリ・事実・比較の id ではない' }),
  z
    .object({
      status: z.enum(REVIEW_STATUSES),
      checkedAt: z.string().regex(DATE),
      hash: z.string().regex(/^[0-9a-f]{12}$/),
    })
    .strict(),
);

// 監査の不足と、図鑑での対応（content/saa-c03/catalog-needs.json。アプリには出さない）
export const CATALOG_NEED_DECISIONS = ['fact', 'lesson', 'question', 'skip'];
export const CatalogNeedsSchema = z
  .object({
    source: z.string().min(2).max(200),
    items: z.array(
      z
        .object({
          key: z.string().regex(/^saa-(basics|[1-4]\.[1-5])-[a-z][a-z0-9]{0,5}-\d{3}\/[a-f]$/),
          task: taskId,
          side: z.enum(['correct', 'incorrect']),
          gap: z.enum(['none', 'partial']),
          knowledge: z.string().min(4).max(600),
          decision: z.enum(CATALOG_NEED_DECISIONS).optional(),
          factRefs: z.array(factId).max(6).optional(),
          note: z.string().min(2).max(400).optional(),
        })
        .strict()
        .superRefine((it, ctx) => {
          const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
          if (it.decision === 'fact' && !it.factRefs?.length) issue(`${it.key}: decision=fact には factRefs が要る`);
          if (it.decision === 'skip' && !it.note) issue(`${it.key}: decision=skip には note（理由）が要る`);
        }),
    ),
  })
  .strict()
  .superRefine((n, ctx) => {
    const keys = n.items.map((i) => i.key);
    if (!unique(keys)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'key が重複している' });
  });
