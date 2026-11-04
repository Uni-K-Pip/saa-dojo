// blueprint（出題範囲）の索引
import type { BlueprintItem, BlueprintSummary, BlueprintTask } from '../content/types';

export interface ItemInfo {
  item: BlueprintItem;
  taskId: string;
  domain: number;
}

export function itemIndex(bp: BlueprintSummary | null): Map<string, ItemInfo> {
  const m = new Map<string, ItemInfo>();
  if (!bp) return m;
  for (const item of bp.basics.items) m.set(item.id, { item, taskId: 'basics', domain: 0 });
  for (const d of bp.domains) for (const t of d.tasks) for (const item of t.items) m.set(item.id, { item, taskId: t.id, domain: d.id });
  return m;
}

export function taskIndex(bp: BlueprintSummary | null): Map<string, BlueprintTask> {
  const m = new Map<string, BlueprintTask>();
  if (!bp) return m;
  for (const d of bp.domains) for (const t of d.tasks) m.set(t.id, t);
  return m;
}

/** ドメイン 1〜4 の項目 ID（基礎講座を除く） */
export function domainItemIds(bp: BlueprintSummary | null, domain?: number): string[] {
  if (!bp) return [];
  return bp.domains.filter((d) => domain === undefined || d.id === domain).flatMap((d) => d.tasks.flatMap((t) => t.items.map((i) => i.id)));
}

export function domainName(bp: BlueprintSummary | null, domain: number): string {
  if (domain === 0) return bp?.basics.titleJa ?? '基礎講座';
  return bp?.domains.find((d) => d.id === domain)?.nameJa ?? `ドメイン ${domain}`;
}
