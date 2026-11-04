// セッションの作成・更新（IndexedDB）
import { db } from '../db/db';
import { uuid } from '../domain/events';
import type { MockSession, PracticeSession, SessionRecord } from '../domain/session';

export async function updateSession<T extends SessionRecord>(id: string, fn: (s: T) => T): Promise<T | undefined> {
  return db.transaction('rw', db.sessions, async () => {
    const s = (await db.sessions.get(id)) as T | undefined;
    if (!s) return undefined;
    const next = { ...fn(s), updatedAt: Date.now() };
    await db.sessions.put(next);
    return next;
  });
}

export async function createPracticeSession(opts: {
  mode: PracticeSession['mode'];
  title: string;
  questionIds: string[];
  concepts?: Record<string, string>;
}): Promise<string> {
  const now = Date.now();
  const s: PracticeSession = {
    id: uuid(),
    kind: 'practice',
    mode: opts.mode,
    title: opts.title,
    questionIds: opts.questionIds,
    index: 0,
    results: {},
    createdAt: now,
    updatedAt: now,
    ...(opts.concepts ? { concepts: opts.concepts } : {}),
  };
  await db.sessions.put(s);
  return s.id;
}

export async function createMockSession(opts: {
  mockKind: MockSession['mockKind'];
  title: string;
  questionIds: string[];
  timeLimitMs: number;
}): Promise<string> {
  const now = Date.now();
  const s: MockSession = {
    id: uuid(),
    kind: 'mock',
    mockKind: opts.mockKind,
    title: opts.title,
    questionIds: opts.questionIds,
    index: 0,
    answers: {},
    confidence: {},
    flags: {},
    timeSpent: {},
    startedAt: now,
    timeLimitMs: opts.timeLimitMs,
    createdAt: now,
    updatedAt: now,
  };
  await db.sessions.put(s);
  return s.id;
}

/** 再開できる（終わっていない）セッションを新しい順に */
export async function activeSessions(): Promise<SessionRecord[]> {
  const all = await db.sessions.orderBy('updatedAt').reverse().toArray();
  return all.filter((s) => s.finishedAt === undefined);
}

export function sessionPath(s: SessionRecord): string {
  return s.kind === 'mock' ? `/mock/session/${s.id}` : `/session/${s.id}`;
}
