// 学習記録の書き出し・読み込み（JSON ファイル）。読み込みはイベント ID の和集合でマージする。
import { isEventLike, sortEvents, type AppEvent } from './events';

export const BACKUP_FORMAT = 'saa-dojo-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  deviceId: string;
  events: AppEvent[];
}

export function makeBackup(events: readonly AppEvent[], deviceId: string, now: number): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), deviceId, events: sortEvents([...events]) };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `saa-dojo-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export type ParseResult = { ok: true; events: unknown[]; skipped: number } | { ok: false; error: string };

/**
 * 書き出したファイルを読む。書き出し形式のほか、イベントの配列や改行区切り JSON（同期の形式）も受け付ける。
 * 形の合わないイベントは数えて捨てる。
 */
export function parseBackup(text: string): ParseResult {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) return { ok: false, error: 'ファイルが空です' };
  let list: unknown[] | null = null;
  try {
    const data: unknown = JSON.parse(trimmed);
    if (Array.isArray(data)) list = data;
    else if (data && typeof data === 'object') {
      const o = data as Record<string, unknown>;
      // 1行だけの改行区切り JSON（記録が1件の同期ファイル）は、イベント1件として読む
      if (o.format === undefined && isEventLike(o)) return { ok: true, events: [o], skipped: 0 };
      if (o.format !== BACKUP_FORMAT) return { ok: false, error: 'SAA Dojo の書き出しファイルではありません' };
      if (typeof o.version !== 'number' || o.version > BACKUP_VERSION) return { ok: false, error: 'このアプリより新しい形式のファイルです。アプリを更新してから読み込んでください' };
      if (!Array.isArray(o.events)) return { ok: false, error: 'ファイルに学習記録がありません' };
      list = o.events;
    }
  } catch {
    // 改行区切り JSON として読む
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    const parsed: unknown[] = [];
    for (const l of lines) {
      try {
        parsed.push(JSON.parse(l));
      } catch {
        return { ok: false, error: 'JSON として読めません' };
      }
    }
    list = parsed;
  }
  if (!list) return { ok: false, error: 'SAA Dojo の書き出しファイルではありません' };
  const events = list.filter(isEventLike);
  return { ok: true, events, skipped: list.length - events.length };
}
