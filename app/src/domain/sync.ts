// 同期のデータ形式: イベントを改行区切り JSON（1行1イベント）にして、1ファイル 1 MB 以下に分割する。
// マージはイベント ID の和集合。
import { isEventLike, sortEvents, type AppEvent } from './events';

export const SYNC_DESCRIPTION = 'saa-dojo sync';
export const MAX_FILE_BYTES = 1_000_000;
export const FILE_PREFIX = 'events-';
export const FILE_SUFFIX = '.ndjson';
const FILE_NAME = /^events-\d{3,}\.ndjson$/;

export function isSyncFile(name: string): boolean {
  return FILE_NAME.test(name);
}

export function syncFileName(i: number): string {
  return `${FILE_PREFIX}${String(i).padStart(3, '0')}${FILE_SUFFIX}`;
}

const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s).length;

/** イベントを時刻順に並べ、1ファイル maxBytes 以下の改行区切り JSON に分ける */
export function toSyncFiles(events: readonly AppEvent[], maxBytes = MAX_FILE_BYTES): Record<string, string> {
  const files: Record<string, string> = {};
  let lines: string[] = [];
  let size = 0;
  let n = 0;
  const flush = () => {
    if (lines.length === 0) return;
    files[syncFileName(n++)] = lines.join('');
    lines = [];
    size = 0;
  };
  for (const e of sortEvents([...events])) {
    const line = `${JSON.stringify(e)}\n`;
    const b = bytes(line);
    if (size + b > maxBytes) flush();
    lines.push(line);
    size += b;
  }
  flush();
  return files;
}

/** 改行区切り JSON からイベントを読む（壊れた行・形の合わない行は数えて捨てる） */
export function parseSyncFile(text: string): { events: AppEvent[]; skipped: number } {
  const events: AppEvent[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const v: unknown = JSON.parse(line);
      if (isEventLike(v)) events.push(v as unknown as AppEvent);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { events, skipped };
}

export interface SyncPlan {
  /** 端末に取り込む（Gist にだけある）イベント */
  toLocal: AppEvent[];
  /** Gist に書くべきか（端末にだけあるイベントがある、またはファイル構成が変わる） */
  upload: boolean;
  /** 書き込むファイル（upload のとき）。消すファイルは null */
  files: Record<string, string | null>;
  total: number;
}

export function planSync(local: readonly AppEvent[], remote: readonly AppEvent[], remoteFileNames: readonly string[], maxBytes = MAX_FILE_BYTES): SyncPlan {
  const localIds = new Set(local.map((e) => e.eventId));
  const remoteIds = new Set(remote.map((e) => e.eventId));
  const toLocal: AppEvent[] = [];
  const seen = new Set<string>();
  for (const e of remote) {
    if (localIds.has(e.eventId) || seen.has(e.eventId)) continue;
    seen.add(e.eventId);
    toLocal.push(e);
  }
  const union = [...local, ...toLocal];
  const localOnly = local.some((e) => !remoteIds.has(e.eventId));
  const duplicated = remote.length !== remoteIds.size;
  const upload = localOnly || duplicated || (remoteFileNames.length === 0 && union.length > 0);
  const files: Record<string, string | null> = {};
  if (upload) {
    const next = toSyncFiles(union, maxBytes);
    Object.assign(files, next);
    for (const name of remoteFileNames) if (!(name in next)) files[name] = null;
  }
  return { toLocal, upload, files, total: union.length };
}
