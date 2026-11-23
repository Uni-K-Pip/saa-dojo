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
  /** 本文のその場の確認の ID */
  checkIds: string[];
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
  /** 未検証を含める設定で書き出したか（古いデータにはない） */
  includeUnverified?: boolean;
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
    /** 出した図の枚数（古いデータにはない） */
    diagrams?: number;
    /** 出力から除いた図の枚数（状態ごと。未検証は --include-unverified のビルドでだけ出す。古いデータにはない） */
    diagramsExcluded?: { pending: number; 'needs-fix': number; rejected: number };
    /** 出した実物の件数と、除いた件数（状態ごと。古いデータにはない） */
    artifacts?: number;
    artifactsExcluded?: { pending: number; 'needs-fix': number; rejected: number };
    sims?: number;
    simsExcluded?: { pending: number; 'needs-fix': number; rejected: number };
    labs?: number;
    labsExcluded?: { pending: number; 'needs-fix': number; rejected: number; diagram?: number };
    patterns?: number;
    patternsExcluded?: { pending: number; 'needs-fix': number; rejected: number; diagram?: number };
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

// ---------- 図（app/scripts/lib/diagram-build.mjs と scripts/lib/diagram-layout.mjs の出力） ----------

export type DiagramStatus = 'verified' | 'pending';
export type DiagramEdgeKind = 'request' | 'data' | 'control' | 'blocked';
export type DiagramMarkState = 'down' | 'off' | 'standby' | 'new' | 'promoted';
export type DiagramCategory =
  | 'compute'
  | 'container'
  | 'storage'
  | 'database'
  | 'network'
  | 'security'
  | 'integration'
  | 'analytics'
  | 'management'
  | 'migration'
  | 'other';
export type DiagramPoint = [number, number];
export interface DiagramRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一覧の 1 件 */
export interface DiagramIndexEntry {
  id: string;
  title: string;
  type: AnyDiagramScene['type'];
  /** 段階の数 */
  steps: number;
  status: DiagramStatus;
}

/** 入れ物（位置は scene の座標。depth は入れ子の深さで 1 がいちばん外側） */
export interface DiagramBox {
  id: string;
  kind: string;
  /** 種類の語を補った表示用のラベル */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  /** いちばん近い外側の入れ物の id */
  parent: string | null;
  /** ラベルの矩形（線を避けて、ラベルの帯の中で右へずれることがある。古いデータにはない） */
  labelBox?: DiagramRect | null;
  /** 状態の札の矩形（どの段階でも marks に出ないなら null） */
  tag: DiagramRect | null;
}

/** 部品。short があれば 1 行目に short（太字）、2 行目に label。short がなければ label を 1 行で太字 */
export interface DiagramNode {
  id: string;
  kind: string;
  category: DiagramCategory;
  short: string | null;
  label: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  parent: string | null;
  /** 状態の札の矩形（どの段階でも marks に出ないなら null） */
  tag: DiagramRect | null;
}

export interface DiagramEdge {
  id: string;
  kind: DiagramEdgeKind;
  from: string;
  to: string;
  both: boolean;
  /** 直交の折れ線（from 側から to 側へ） */
  points: DiagramPoint[];
  label: string | null;
  /** ラベルの中心 */
  labelAt: DiagramPoint | null;
  /** ラベルの背面の矩形 */
  labelBox: DiagramRect | null;
}

export interface DiagramStep {
  text: string;
  focus: string[];
  edges: string[];
  reveal: string[];
  marks: { id: string; state: DiagramMarkState }[];
  /** 段階の番号の丸の中心（置き場所がなければ null） */
  badgeAt: DiagramPoint | null;
}

/** レイアウト済みの構成図 */
export interface DiagramScene {
  id: string;
  type: 'architecture';
  title: string;
  alt: string;
  width: number;
  height: number;
  boxes: DiagramBox[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  steps: DiagramStep[];
  status: DiagramStatus;
}

type ShapeBase = { cls: string; owner?: string };
export type DiagramShape = ShapeBase & (
  | ({ t: 'rect'; rx?: number } & DiagramRect)
  | { t: 'line'; points: DiagramPoint[]; arrow?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'text'; x: number; y: number; lines: string[]; size: 10 | 11; bold?: boolean; anchor: 'start' | 'middle' | 'end' }
);

interface ChartScene {
  id: string;
  title: string;
  alt: string;
  width: number;
  height: number;
  status: DiagramStatus;
  shapes: DiagramShape[];
}

export interface DecisionFlowNode {
  id: string;
  kind: 'ask' | 'result';
  number: number | null;
  text: string;
  why: string | null;
  service: string | null;
  serviceName: string | null;
  choices: { label: string; to: string }[];
}

export interface DecisionScene extends ChartScene {
  type: 'decision';
  start: string;
  flow: DecisionFlowNode[];
}

export interface PositionScene extends ChartScene {
  type: 'position';
  oneAxis: boolean;
  legend: { n: number; id: string; label: string; note: string | null; service: string | null; category: DiagramCategory }[];
}

export interface TimelineScene extends ChartScene {
  type: 'timeline';
}

export interface LayersScene extends ChartScene {
  type: 'layers';
  legend: { key: string; label: string; n: number }[];
  columns: string[];
}

export type AnyDiagramScene = DiagramScene | DecisionScene | PositionScene | TimelineScene | LayersScene;

// ---------- 実物（app/scripts/lib/artifact-build.mjs と scripts/lib/artifact.mjs の renderArtifact の出力） ----------

export type ArtifactFormat = 'json' | 'table' | 'text';

export interface ArtifactIndexEntry {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  format: ArtifactFormat;
  status: DiagramStatus;
}

/**
 * 本体の行（json は整形済み、text は書いたまま）。indent は字下げの字数、marks はかかる注目点の番号。
 * starts はこの行に出す注目点の番号（text は連続した行の塊ごとの先頭、json は範囲の先頭）。
 */
export interface ArtifactLine {
  indent: number;
  text: string;
  marks: number[];
  starts: number[];
}

/** 表の行。marks はかかる注目点の番号、starts はこの行に出す注目点の番号（指定した 1 行）。 */
export interface ArtifactRow {
  cells: string[];
  marks: number[];
  starts: number[];
}

export interface ArtifactData extends ArtifactIndexEntry {
  notes: { n: number; text: string; where: string }[];
  lines?: ArtifactLine[];
  columns?: string[];
  rows?: ArtifactRow[];
  ask?: { text: string; answer: string };
}

export interface SimScenarioMeta {
  id: string;
  title: string;
  status: DiagramStatus;
}

export interface SimIndexEntry {
  id: string;
  name: string;
  description: string;
  notCovered: string[];
  scenarios: SimScenarioMeta[];
}

export interface SimToggle {
  id: string;
  label: string;
  set: Record<string, unknown>;
}

export interface SimScenario<C extends object = object> extends SimScenarioMeta {
  sim: string;
  intro: string;
  predict: {
    text: string;
    key: string;
    choices: { text: string; value: string | number | boolean }[];
  };
  config: C;
  toggles: SimToggle[];
  explain: { initial: string; toggles: Record<string, string> };
  references: { href: string; title: string }[];
}

interface ReadingMaterialMeta {
  id: string;
  title: string;
  order: number;
  knowledgeRefs: string[];
  services: string[];
  diagram: string;
  status: DiagramStatus;
  questionIds: string[];
}

export interface LabMeta extends ReadingMaterialMeta {
  unit: string;
  estimatedMinutes: number;
}

export interface PatternMeta extends ReadingMaterialMeta {
  taskStatements: string[];
  qualifiers: Exclude<Qualifier, 'other'>[];
}

export interface MaterialBody {
  id: string;
  body: string;
}
