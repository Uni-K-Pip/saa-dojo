// アプリが読むコンテンツの型（scripts/lib/schema.mjs と scripts/lib/content-build.mjs の出力に合わせる）

export type Qualifier = 'cost' | 'operational' | 'availability' | 'performance' | 'security' | 'minimal-change' | 'other';
export type Pool = 'basics' | 'practice' | 'mockA' | 'mockB';
export type QuestionStatus = 'verified' | 'pending';
export type Difficulty = 1 | 2 | 3;

export interface QuestionOption {
  id: string;
  text: string;
  correct: boolean;
  rationale: string;
}

export interface Reference {
  title: string;
  url: string;
}

export interface Question {
  id: string;
  exam: string;
  domain: number;
  taskStatement: string;
  knowledgeRefs: string[];
  services: string[];
  qualifier: Qualifier;
  tags: string[];
  difficulty: Difficulty;
  type: 'single' | 'multiple';
  selectCount: number;
  stem: string;
  options: QuestionOption[];
  explanation: string;
  keyPoints: string[];
  references: Reference[];
  lessonRefs: string[];
  pool: Pool;
  needsSourceCheck: boolean;
  createdBy: string;
  createdAt: string;
  status: QuestionStatus;
}

/** 本文を含まない問題の索引（統計・絞り込み・復習の計算に使う） */
export interface QuestionMeta {
  id: string;
  domain: number;
  taskStatement: string;
  knowledgeRefs: string[];
  services: string[];
  qualifier: Qualifier;
  difficulty: Difficulty;
  type: 'single' | 'multiple';
  pool: Pool;
  status: QuestionStatus;
  lessonRefs: string[];
  needsSourceCheck: boolean;
}

export interface BlueprintItem {
  id: string;
  kind: 'knowledge' | 'skill';
  textJa: string;
}

export interface BlueprintTask {
  id: string;
  domain: number;
  titleJa: string;
  titleEn: string;
  items: BlueprintItem[];
  keyServices: string[];
}

export interface BlueprintDomain {
  id: number;
  nameJa: string;
  nameEn: string;
  weightPercent: number;
  tasks: BlueprintTask[];
}

export interface BlueprintSummary {
  exam: {
    code: string;
    nameEn: string;
    nameJa: string;
    questionsTotal: number;
    questionsScored: number;
    durationMinutes: number;
    passingScore: number;
    scoreRange: string;
    questionTypes: string[];
  };
  checkedAt: string;
  domains: BlueprintDomain[];
  basics: { titleJa: string; items: BlueprintItem[] };
  services: { category: string; services: string[] }[];
  mockComposition: Record<string, number>;
  qualifiers: Qualifier[];
}

export interface LessonMeta {
  id: string;
  title: string;
  domain: number;
  taskStatement: string;
  order: number;
  knowledgeRefs: string[];
  services: string[];
  estimatedMinutes: number;
  /** 確認問題（lessonRefs で参照している問題と本文で挙げている問題。保留模試は含まない） */
  questionIds: string[];
}

export interface LessonBody {
  id: string;
  body: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  taskStatements: string[];
  services: string[];
  tags: string[];
}

export interface FlashcardDeck {
  deck: string;
  title: string;
  createdBy: string;
  cards: Flashcard[];
}

export interface GlossaryEntry {
  term: string;
  en: string;
  definition: string;
  services: string[];
  related: string[];
}

export interface DocEntry {
  id: string;
  kind: 'cheatsheet' | 'guide';
  title: string;
  order: number;
  taskStatements: string[];
  services: string[];
  createdBy: string;
  body: string;
}

export interface ManifestFile {
  path: string;
  hash: string;
  bytes: number;
}

export interface Manifest {
  format: 'saa-dojo-content';
  version: number;
  exam: string;
  contentHash: string;
  counts: {
    questions: Record<Pool, number>;
    verified: number;
    pending: number;
    excluded: { 'needs-fix': number; rejected: number };
    lessons: number;
    basicsLessons: number;
    decks: number;
    flashcards: number;
    glossary: number;
    cheatsheets: number;
    guides: number;
    /** サービス台帳の件数（古いデータにはない） */
    services?: number;
  };
  files: Record<string, ManifestFile>;
}

/** サービス台帳の 1 件（ビルドが services.json から作る。別名は導出できる表記まで展開済み） */
export interface ServiceEntry {
  id: string;
  /** 正規名。問題などの services 欄はビルドでこの表記にそろえてある */
  name: string;
  /** 同じサービスとみなす表記（正規名を除く） */
  aliases: string[];
  category: string;
  /** 出所: 試験ガイドの対象サービス一覧 / タスクの keyServices だけ / 台帳だけ */
  source: 'inScope' | 'keyServices' | 'registry';
  short?: string;
  /** 独立した図鑑のエントリを作らず、このサービスのエントリの中で扱う */
  hostedBy?: string;
}
