// イベントログ・メタ情報・進行中のセッションの読み書き
import { db } from './db';
import { isEventLike, sortEvents, uuid, type AppEvent, type NewEvent } from '../domain/events';
import type { SessionRecord } from '../domain/session';

let deviceIdPromise: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get('deviceId');
    if (row && typeof row.value === 'string') return row.value;
    const id = uuid();
    await db.meta.put({ key: 'deviceId', value: id });
    return id;
  });
  return deviceIdPromise;
}

/** テスト・リセット用 */
export function forgetDeviceId(): void {
  deviceIdPromise = null;
}

type Listener = (events: AppEvent[]) => void;
const appendListeners = new Set<Listener>();

/** 学習記録が追加されたときに呼ぶ（同期の予約などに使う） */
export function onEventsAppended(fn: Listener): () => void {
  appendListeners.add(fn);
  return () => appendListeners.delete(fn);
}

export async function appendEvents(items: NewEvent[]): Promise<AppEvent[]> {
  if (items.length === 0) return [];
  const deviceId = await getDeviceId();
  const now = Date.now();
  const events = items.map((e) => ({ ...e, eventId: uuid(), deviceId, at: e.at ?? now }) as AppEvent);
  await db.events.bulkAdd(events);
  for (const fn of appendListeners) fn(events);
  return events;
}

export async function appendEvent(item: NewEvent): Promise<AppEvent> {
  const [e] = await appendEvents([item]);
  return e!;
}

export async function getAllEvents(): Promise<AppEvent[]> {
  return sortEvents(await db.events.toArray());
}

/** 外部（読み込み・同期）のイベントを eventId の和集合で取り込む。追加した件数を返す */
export async function mergeEvents(incoming: unknown[]): Promise<number> {
  const valid = incoming.filter(isEventLike) as unknown as AppEvent[];
  if (valid.length === 0) return 0;
  return db.transaction('rw', db.events, async () => {
    const existing = new Set((await db.events.toCollection().primaryKeys()) as string[]);
    const seen = new Set<string>();
    const fresh: AppEvent[] = [];
    for (const e of valid) {
      if (existing.has(e.eventId) || seen.has(e.eventId)) continue;
      seen.add(e.eventId);
      fresh.push(e);
    }
    if (fresh.length) await db.events.bulkAdd(fresh);
    return fresh.length;
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function saveSession(s: SessionRecord): Promise<void> {
  await db.sessions.put({ ...s, updatedAt: Date.now() });
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db.sessions.get(id);
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

/** 終わってから日が経ったセッションを片付ける */
export async function pruneSessions(maxAgeMs = 7 * 24 * 3600 * 1000): Promise<void> {
  const limit = Date.now() - maxAgeMs;
  const old = await db.sessions.filter((s) => s.updatedAt < limit && (s.finishedAt !== undefined || s.kind !== 'mock')).primaryKeys();
  if (old.length) await db.sessions.bulkDelete(old);
}
