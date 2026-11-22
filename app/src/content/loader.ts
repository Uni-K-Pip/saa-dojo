// public/data/ の分割 JSON を遅延読み込みする。同じファイルは同じ Promise を返す（React の use() 向け）。
import type {
  BlueprintSummary,
  CatalogComparison,
  CatalogEntry,
  CatalogIndex,
  DocEntry,
  FlashcardDeck,
  GlossaryEntry,
  LessonBody,
  LessonMeta,
  Manifest,
  Pool,
  Question,
  QuestionMeta,
  ServiceEntry,
} from './types';

export type Fetcher = (path: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (path) => {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`データを読み込めませんでした（${path}: HTTP ${res.status}）`);
  return res.json();
};

let fetcher: Fetcher = defaultFetcher;
const cache = new Map<string, Promise<unknown>>();

/** テスト用: 読み込み元を差し替え、キャッシュを消す */
export function setContentFetcher(f: Fetcher | null): void {
  fetcher = f ?? defaultFetcher;
  cache.clear();
}

/** 読み込みに失敗したあとに再試行できるよう、キャッシュを消す */
export function clearContentCache(): void {
  cache.clear();
}

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    p.catch(() => {
      if (cache.get(key) === p) cache.delete(key);
    });
  }
  return p;
}

export function loadManifest(): Promise<Manifest> {
  return cached('manifest.json', async () => (await fetcher('manifest.json')) as Manifest);
}

function loadKey<T>(key: string, fallback: T): Promise<T> {
  return cached(`key:${key}`, async () => {
    const m = await loadManifest();
    const f = m.files[key];
    if (!f) return fallback;
    return ((await fetcher(f.path)) as T) ?? fallback;
  });
}

export const loadBlueprint = () => loadKey<BlueprintSummary | null>('blueprint', null);
export const loadQuestionIndex = () => loadKey<QuestionMeta[]>('index', []);
export const loadLessons = () => loadKey<LessonMeta[]>('lessons', []);
export const loadLessonBody = (id: string) => loadKey<LessonBody | null>(`lesson:${id}`, null);
export const loadFlashcards = () => loadKey<FlashcardDeck[]>('flashcards', []);
export const loadGlossary = () => loadKey<GlossaryEntry[]>('glossary', []);
export const loadDocs = () => loadKey<DocEntry[]>('docs', []);
export const loadServices = () => loadKey<ServiceEntry[]>('services', []);
export const loadCatalogIndex = () => loadKey<CatalogIndex>('catalog-index', { services: [], comparisons: [] });
/** 図鑑のエントリ 1 件。エントリがない（準備中・除外）ときは null */
export const loadCatalogEntry = (id: string) => loadKey<CatalogEntry | null>(`catalog:${id}`, null);
export const loadComparisons = () => loadKey<CatalogComparison[]>('catalog-compare', []);

/** 問題の本文が入っているファイルのキー */
export function questionFileKey(meta: Pick<QuestionMeta, 'pool' | 'domain'>): string {
  const byPool: Record<Pool, string> = {
    practice: `practice-d${meta.domain}`,
    basics: 'basics',
    mockA: 'mock-a',
    mockB: 'mock-b',
  };
  return byPool[meta.pool];
}

export function loadQuestionFile(key: string): Promise<Question[]> {
  return loadKey<Question[]>(key, []);
}

/** 指定したファイル群の問題を ID で引ける Map にする */
export function loadQuestionMap(keys: string[]): Promise<Map<string, Question>> {
  const sorted = [...new Set(keys)].sort();
  return cached(`questions:${sorted.join(',')}`, async () => {
    const lists = await Promise.all(sorted.map((k) => loadQuestionFile(k)));
    return new Map(lists.flat().map((q) => [q.id, q]));
  });
}

/** 問題 ID の一覧から、必要なファイルのキーを求める（索引にない ID は無視） */
export function fileKeysFor(ids: string[], index: QuestionMeta[]): string[] {
  const byId = new Map(index.map((m) => [m.id, m]));
  const keys = new Set<string>();
  for (const id of ids) {
    const m = byId.get(id);
    if (m) keys.add(questionFileKey(m));
  }
  return [...keys].sort();
}
