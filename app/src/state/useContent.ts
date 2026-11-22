// コンテンツの読み込みを React の use() で待つための小さなフック群
import { use, useMemo } from 'react';
import { loadCatalogIndex, loadLessons, loadServices } from '../content/loader';
import type { CatalogIndex, ServiceEntry } from '../content/types';
import { makeServiceLinker, type ServiceLinker } from '../domain/catalog';

export function useLessonTitles(): Map<string, string> {
  const lessons = use(loadLessons());
  return useMemo(() => new Map(lessons.map((l) => [l.id, l.title])), [lessons]);
}

/** 台帳（loadServices）から、サービス名 → 図鑑のエントリ id の変換を作る。台帳がなければどの名前もリンクにしない */
export function useServiceLinker(): { registry: ServiceEntry[]; link: ServiceLinker } {
  const registry = use(loadServices());
  const link = useMemo(() => makeServiceLinker(registry), [registry]);
  return { registry, link };
}

/** 採点後の「サービス図鑑」欄に渡す、台帳と図鑑の一覧 */
export function useCatalogContext(): { registry: ServiceEntry[]; index: CatalogIndex } {
  const registry = use(loadServices());
  const index = use(loadCatalogIndex());
  return useMemo(() => ({ registry, index }), [registry, index]);
}
