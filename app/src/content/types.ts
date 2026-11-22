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
  /** 図鑑の事実への参照（任意） */
  factRefs?: string[];
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
    /** サービス図鑑（古いデータにはない） */
    catalogEntries?: number;
    catalogFacts?: number;
    comparisons?: number;
    catalogFactStatus?: { verified: number; pending: number };
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

// ---------- サービス図鑑（app/scripts/lib/catalog-build.mjs の出力） ----------

export type CatalogStatus = 'verified' | 'pending';
export type CatalogTier = 1 | 2 | 3;
export type CatalogFactKind = 'feature' | 'constraint' | 'quota' | 'pricing' | 'integration';
export type CatalogFactDepth = 'core' | 'detail';

/** 一覧用: 事実の見出しだけ（本文は含まない） */
export interface CatalogIndexFact {
  id: string;
  title: string;
  kind: CatalogFactKind;
  depth: CatalogFactDepth;
  tags: string[];
  status: CatalogStatus;
}

/** 一覧用の 1 行（台帳の全サービス。hostedBy の子は親の children に入り、行にはならない） */
export interface CatalogIndexService {
  id: string;
  name: string;
  short?: string;
  aliases: string[];
  category: string;
  children: { id: string; name: string; aliases: string[] }[];
  /** エントリがあるときだけ */
  tier?: CatalogTier;
  summary?: string;
  status?: CatalogStatus;
  facts: CatalogIndexFact[];
  /** このサービスを keyServices に挙げるタスクと、このサービスの演習問題のタスク */
  tasks: string[];
  related: { lessons: string[]; docs: string[]; glossary: number; flashcards: number; questions: number };
  /** このサービスを含む比較の id */
  comparisons: string[];
}

export interface CatalogIndexComparison {
  id: string;
  title: string;
  services: string[];
  status: CatalogStatus;
}

export interface CatalogIndex {
  services: CatalogIndexService[];
  comparisons: CatalogIndexComparison[];
}

export interface CatalogFact {
  id: string;
  title: string;
  kind: CatalogFactKind;
  text: string;
  examPoint?: string;
  trap?: string;
  depth: CatalogFactDepth;
  services?: string[];
  tags?: string[];
  sources: Reference[];
  checkedAt: string;
  status: CatalogStatus;
}

export interface CatalogPoint {
  text: string;
  factRefs?: string[];
  /** 台帳のサービス id */
  alternatives?: string[];
}

export interface CatalogSeeAlso {
  id: string;
  title: string;
  entryId: string;
  entryName: string;
}

/** 図鑑のエントリ 1 件（catalog/<id>.json） */
export interface CatalogEntry {
  id: string;
  tier: CatalogTier;
  status: CatalogStatus;
  summary: string;
  chooseWhen?: CatalogPoint[];
  avoidWhen?: CatalogPoint[];
  facts: CatalogFact[];
  seeAlso: CatalogSeeAlso[];
  lessonRefs?: string[];
  docRefs?: string[];
  references: Reference[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CatalogComparison {
  id: string;
  title: string;
  /** 台帳のサービス id（2〜3 個） */
  services: string[];
  status: CatalogStatus;
  decide: string[];
  rows?: { axis: string; values: Record<string, string>; factRefs?: string[] }[];
  /** rows の代わりに、同じ組を扱う早見表の id */
  docRef?: string;
  sources: Reference[];
  checkedAt: string;
  createdBy: string;
}
