// テスト用の小さなコンテンツと、イベントを組み立てる補助
import type { BlueprintSummary, Manifest, Question, QuestionMeta } from '../content/types';
import type { AppEvent, AnswerEvent, Confidence } from '../domain/events';

let seq = 0;

export function makeQuestion(over: Partial<Question> & { id: string }): Question {
  const domain = over.domain ?? Number(over.id.split('-')[1]?.[0] ?? 1);
  const task = over.taskStatement ?? over.id.split('-')[1] ?? '1.1';
  return {
    exam: 'SAA-C03',
    domain,
    taskStatement: task,
    knowledgeRefs: [`${task}-K1`],
    services: ['Amazon S3'],
    qualifier: 'cost',
    tags: [],
    difficulty: 2,
    type: 'single',
    selectCount: 1,
    stem: `問題文 ${over.id}。最もコスト効率が高い方法はどれですか。`,
    options: [
      { id: 'a', text: '正しい選択肢', correct: true, rationale: '正しい理由の説明です。十分な長さ。' },
      { id: 'b', text: '誤りの選択肢1', correct: false, rationale: '誤りの理由の説明です。十分な長さ。' },
      { id: 'c', text: '誤りの選択肢2', correct: false, rationale: '誤りの理由の説明です。十分な長さ。' },
      { id: 'd', text: '誤りの選択肢3', correct: false, rationale: '誤りの理由の説明です。十分な長さ。' },
    ],
    explanation: `解説 ${over.id}`,
    keyPoints: ['コストを最小に → 使った分だけ払う'],
    references: [{ title: 'Amazon S3', url: 'https://docs.aws.amazon.com/s3/' }],
    lessonRefs: [],
    pool: 'practice',
    needsSourceCheck: false,
    createdBy: 't',
    createdAt: '2026-11-04',
    status: 'pending',
    ...over,
  };
}

export function metaOf(q: Question): QuestionMeta {
  return {
    id: q.id,
    domain: q.domain,
    taskStatement: q.taskStatement,
    knowledgeRefs: q.knowledgeRefs,
    services: q.services,
    qualifier: q.qualifier,
    difficulty: q.difficulty,
    type: q.type,
    pool: q.pool,
    status: q.status,
    lessonRefs: q.lessonRefs,
    needsSourceCheck: q.needsSourceCheck,
  };
}

export function answer(
  questionId: string,
  correct: boolean,
  opts: { at?: number; confidence?: Confidence; mode?: AnswerEvent['mode']; sessionId?: string; selected?: string[] } = {},
): AnswerEvent {
  seq++;
  return {
    type: 'answer',
    eventId: `ev-${String(seq).padStart(6, '0')}-xxxx`,
    deviceId: 'dev-test',
    at: opts.at ?? 1_700_000_000_000 + seq * 1000,
    questionId,
    selected: opts.selected ?? [correct ? 'a' : 'b'],
    correct,
    confidence: opts.confidence ?? 'maybe',
    mode: opts.mode ?? 'practice',
    sessionId: opts.sessionId ?? 's1',
    durationMs: 30_000,
  };
}

export function event<T extends AppEvent['type']>(type: T, fields: Record<string, unknown>, at?: number): AppEvent {
  seq++;
  return {
    type,
    eventId: `ev-${String(seq).padStart(6, '0')}-yyyy`,
    deviceId: 'dev-test',
    at: at ?? 1_700_000_000_000 + seq * 1000,
    ...fields,
  } as unknown as AppEvent;
}

export function makeBlueprint(): BlueprintSummary {
  const task = (id: string, items: number) => ({
    id,
    domain: Number(id[0]),
    titleJa: `タスク ${id}`,
    titleEn: `Task ${id}`,
    items: Array.from({ length: items }, (_, i) => ({ id: `${id}-K${i + 1}`, kind: 'knowledge' as const, textJa: `項目 ${id}-K${i + 1}` })),
    keyServices: ['Amazon S3'],
  });
  return {
    exam: {
      code: 'SAA-C03',
      nameEn: 'AWS Certified Solutions Architect - Associate',
      nameJa: 'AWS 認定ソリューションアーキテクト – アソシエイト',
      questionsTotal: 65,
      questionsScored: 50,
      durationMinutes: 130,
      passingScore: 720,
      scoreRange: '100-1000',
      questionTypes: [],
    },
    checkedAt: '2026-11-04',
    domains: [
      { id: 1, nameJa: 'セキュアなアーキテクチャの設計', nameEn: 'D1', weightPercent: 30, tasks: [task('1.1', 2), task('1.2', 2)] },
      { id: 2, nameJa: '弾力性に優れたアーキテクチャの設計', nameEn: 'D2', weightPercent: 26, tasks: [task('2.1', 2)] },
      { id: 3, nameJa: '高性能なアーキテクチャの設計', nameEn: 'D3', weightPercent: 24, tasks: [task('3.1', 2)] },
      { id: 4, nameJa: 'コストを最適化したアーキテクチャの設計', nameEn: 'D4', weightPercent: 20, tasks: [task('4.1', 2)] },
    ],
    basics: { titleJa: '基礎講座', items: [{ id: 'basics-K1', kind: 'knowledge', textJa: 'クラウドの基本' }] },
    services: [{ category: 'ストレージ', services: ['Amazon S3'] }],
    mockComposition: { 1: 20, 2: 17, 3: 15, 4: 13 },
    qualifiers: ['cost', 'operational', 'availability', 'performance', 'security', 'minimal-change', 'other'],
  };
}

/** テスト用のコンテンツ一式を、ファイル名 → 中身の形で作る */
export function makeContentFiles(questions: Question[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  const manifestFiles: Manifest['files'] = {};
  const put = (key: string, path: string, data: unknown) => {
    files[path] = data;
    manifestFiles[key] = { path, hash: key, bytes: 0 };
  };
  put('blueprint', 'blueprint.json', makeBlueprint());
  put('index', 'index.json', questions.map(metaOf));
  for (const d of [1, 2, 3, 4]) put(`practice-d${d}`, `practice-d${d}.json`, questions.filter((q) => q.pool === 'practice' && q.domain === d));
  put('basics', 'basics.json', questions.filter((q) => q.pool === 'basics'));
  put('mock-a', 'mock-a.json', questions.filter((q) => q.pool === 'mockA'));
  put('mock-b', 'mock-b.json', questions.filter((q) => q.pool === 'mockB'));
  put('lessons', 'lessons.json', []);
  put('flashcards', 'flashcards.json', []);
  put('glossary', 'glossary.json', []);
  put('docs', 'docs.json', []);
  for (const [k, v] of Object.entries(extra)) put(k, `${k}.json`, v);
  const count = (pool: string) => questions.filter((q) => q.pool === pool).length;
  const manifest: Manifest = {
    format: 'saa-dojo-content',
    version: 1,
    exam: 'SAA-C03',
    contentHash: 'test',
    counts: {
      questions: { practice: count('practice'), basics: count('basics'), mockA: count('mockA'), mockB: count('mockB') },
      verified: 0,
      pending: questions.length,
      excluded: { 'needs-fix': 0, rejected: 0 },
      lessons: 0,
      basicsLessons: 0,
      decks: 0,
      flashcards: 0,
      glossary: 0,
      cheatsheets: 0,
      guides: 0,
    },
    files: manifestFiles,
  };
  files['manifest.json'] = manifest;
  return files;
}
