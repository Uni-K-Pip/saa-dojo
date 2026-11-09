// 端末の学習記録とシークレット Gist の同期（起動時・学習後・ボタンで実行）
import { db } from '../db/db';
import { getAllEvents, getMeta, LAST_BACKUP_KEY, mergeEvents, onEventsAppended, setMeta } from '../db/repo';
import { isSyncFile, parseSyncFile, planSync } from '../domain/sync';
import type { AppEvent } from '../domain/events';
import { GistClient, GistError, type FetchLike } from './gist';

export const TOKEN_KEY = 'githubToken';
export const GIST_ID_KEY = 'syncGistId';
export const SYNC_STATUS_KEY = 'syncStatus';

export interface SyncStatus {
  lastSyncAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  /** 最後の同期で取り込んだ・書き込んだ件数 */
  pulled: number;
  pushed: boolean;
  total: number;
}

export const EMPTY_STATUS: SyncStatus = { lastSyncAt: null, lastError: null, lastErrorAt: null, pulled: 0, pushed: false, total: 0 };

export async function getToken(): Promise<string | null> {
  return (await db.secrets.get(TOKEN_KEY))?.value ?? null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await db.secrets.put({ key: TOKEN_KEY, value: token.trim() });
  else {
    await db.secrets.delete(TOKEN_KEY);
    await db.meta.delete(GIST_ID_KEY);
    await db.meta.delete(SYNC_STATUS_KEY);
  }
}

let running: Promise<SyncStatus> | null = null;
let fetcher: FetchLike | undefined;

/** テスト用: GitHub API の呼び出しを差し替える */
export function setSyncFetcher(f: FetchLike | undefined): void {
  fetcher = f;
}

/** 同期する。トークンがなければ何もしない。同時に複数回は走らせない */
export function syncNow(): Promise<SyncStatus | null> {
  if (running) return running;
  const p = (async () => {
    const token = await getToken();
    if (!token) return null;
    return runSync(new GistClient(token, fetcher));
  })().finally(() => {
    running = null;
  });
  running = p as Promise<SyncStatus>;
  return p;
}

async function runSync(client: GistClient): Promise<SyncStatus> {
  const prev = (await getMeta<SyncStatus>(SYNC_STATUS_KEY)) ?? EMPTY_STATUS;
  try {
    let gistId = await getMeta<string>(GIST_ID_KEY);
    let gist = null;
    if (gistId) {
      try {
        gist = await client.get(gistId);
      } catch (e) {
        if (!(e instanceof GistError && e.status === 404)) throw e;
        gistId = undefined;
      }
    }
    if (!gist) {
      const found = await client.find();
      gist = found ? await client.get(found.id) : null;
    }

    const remote: AppEvent[] = [];
    const names: string[] = [];
    if (gist) {
      for (const [name, file] of Object.entries(gist.files)) {
        if (!file || !isSyncFile(name)) continue;
        names.push(name);
        remote.push(...parseSyncFile(await client.content(file)).events);
      }
    }
    const pulled = await mergeEvents(remote);
    const local = await getAllEvents();
    const plan = planSync(local, remote, names);
    if (!gist) {
      // 記録がまだなければ Gist は作らない（空のファイルは作れないため）
      const files = Object.fromEntries(Object.entries(plan.files).filter((x): x is [string, string] => x[1] !== null));
      if (Object.keys(files).length) gist = await client.create(files);
    } else if (plan.upload) {
      await client.update(gist.id, plan.files);
    }
    if (gist) await setMeta(GIST_ID_KEY, gist.id);
    const now = Date.now();
    const status: SyncStatus = { lastSyncAt: now, lastError: null, lastErrorAt: null, pulled, pushed: plan.upload, total: plan.total };
    await setMeta(SYNC_STATUS_KEY, status);
    await setMeta(LAST_BACKUP_KEY, now);
    return status;
  } catch (e) {
    const status: SyncStatus = { ...prev, lastError: e instanceof Error ? e.message : String(e), lastErrorAt: Date.now() };
    await setMeta(SYNC_STATUS_KEY, status);
    return status;
  }
}

const AFTER_STUDY_DELAY_MS = 30_000;

/** 起動時と、学習記録が増えたあと（少し待ってまとめて）に同期する。止める関数を返す */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  void syncNow();
  const off = onEventsAppended(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), AFTER_STUDY_DELAY_MS);
  });
  const onOnline = () => void syncNow();
  window.addEventListener('online', onOnline);
  return () => {
    off();
    if (timer) clearTimeout(timer);
    window.removeEventListener('online', onOnline);
  };
}
