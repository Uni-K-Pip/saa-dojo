import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { getMeta } from '../db/repo';
import { MAX_FILE_BYTES, SYNC_DESCRIPTION, parseSyncFile, planSync, toSyncFiles } from '../domain/sync';
import type { AppEvent } from '../domain/events';
import { answer } from '../test/fixtures';
import { resetDb } from '../test/render';
import { API, type FetchLike } from './gist';
import { GIST_ID_KEY, SYNC_STATUS_KEY, setSyncFetcher, setToken, syncNow, type SyncStatus } from './sync';

describe('同期のデータ形式', () => {
  const evs = [answer('saa-1.1-t-001', true), answer('saa-1.1-t-002', false), answer('saa-1.1-t-003', true)];

  it('改行区切り JSON にして、上限を超えたらファイルを分ける', () => {
    const one = toSyncFiles(evs);
    expect(Object.keys(one)).toEqual(['events-000.ndjson']);
    expect(parseSyncFile(one['events-000.ndjson']!).events.map((e) => e.eventId)).toEqual(evs.map((e) => e.eventId));
    const lineBytes = new TextEncoder().encode(`${JSON.stringify(evs[0])}\n`).length;
    const split = toSyncFiles(evs, lineBytes * 2 + 5);
    expect(Object.keys(split)).toEqual(['events-000.ndjson', 'events-001.ndjson']);
    for (const text of Object.values(split)) expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(lineBytes * 2 + 5);
    expect(MAX_FILE_BYTES).toBe(1_000_000);
  });

  it('壊れた行は数えて捨てる', () => {
    expect(parseSyncFile(`${JSON.stringify(evs[0])}\n{broken\n{"a":1}\n`)).toMatchObject({ skipped: 2 });
  });

  it('マージはイベント ID の和集合', () => {
    const [a, b, c] = evs as [AppEvent, AppEvent, AppEvent];
    const p = planSync([a, b], [b, c], ['events-000.ndjson', 'events-001.ndjson']);
    expect(p.toLocal.map((e) => e.eventId)).toEqual([c.eventId]);
    expect(p.upload).toBe(true);
    expect(p.total).toBe(3);
    expect(p.files['events-001.ndjson']).toBeNull();
    expect(parseSyncFile(p.files['events-000.ndjson']!).events).toHaveLength(3);
    // 端末の記録がすべて Gist にあれば書き込まない
    expect(planSync([b], [b, c], ['events-000.ndjson'])).toMatchObject({ upload: false, files: {} });
  });
});

// 偽の GitHub API（Gist を1つだけ扱う）
function fakeGitHub(initial: { id: string; files: Record<string, string> } | null) {
  const state = { gist: initial, calls: [] as { method: string; url: string; auth: string | null }[] };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const view = () =>
    state.gist && {
      id: state.gist.id,
      description: SYNC_DESCRIPTION,
      public: false,
      files: Object.fromEntries(Object.entries(state.gist.files).map(([n, c]) => [n, { filename: n, content: c, truncated: false }])),
    };
  const fetcher: FetchLike = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    state.calls.push({ method, url, auth: headers.Authorization ?? null });
    if (!url.startsWith(`${API}/`)) throw new Error(`unexpected host: ${url}`);
    const path = url.slice(API.length);
    if (method === 'GET' && path.startsWith('/gists?')) return json(state.gist ? [view()] : []);
    if (method === 'GET' && path.startsWith('/gists/')) return state.gist && path === `/gists/${state.gist.id}` ? json(view()) : json({}, 404);
    if (method === 'POST' && path === '/gists') {
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ description: SYNC_DESCRIPTION, public: false });
      state.gist = { id: 'g1', files: Object.fromEntries(Object.entries(body.files as Record<string, { content: string }>).map(([n, f]) => [n, f.content])) };
      return json(view(), 201);
    }
    if (method === 'PATCH' && state.gist) {
      const body = JSON.parse(String(init.body));
      for (const [n, f] of Object.entries(body.files as Record<string, { content: string } | null>)) {
        if (f === null) delete state.gist.files[n];
        else state.gist.files[n] = f.content;
      }
      return json(view());
    }
    return json({}, 400);
  };
  return { state, fetcher };
}

describe('Gist との同期', () => {
  beforeEach(async () => {
    await resetDb();
    await db.secrets.clear();
  });
  afterEach(() => setSyncFetcher(undefined));

  it('トークンがなければ何もしない', async () => {
    const gh = fakeGitHub(null);
    setSyncFetcher(gh.fetcher);
    expect(await syncNow()).toBeNull();
    expect(gh.state.calls).toHaveLength(0);
  });

  it('Gist がなければシークレット Gist を作り、ある場合は両方向にマージする', async () => {
    const local = answer('saa-1.1-t-001', true);
    await db.events.add(local);
    await setToken('ghp_test');
    const gh = fakeGitHub(null);
    setSyncFetcher(gh.fetcher);

    const s1 = (await syncNow())!;
    expect(s1).toMatchObject({ lastError: null, pushed: true, total: 1 });
    expect(gh.state.gist?.files['events-000.ndjson']).toContain(local.eventId);
    expect(await getMeta(GIST_ID_KEY)).toBe('g1');
    // トークンは api.github.com にだけ送る
    expect(gh.state.calls.every((c) => c.url.startsWith('https://api.github.com/') && c.auth === 'Bearer ghp_test')).toBe(true);

    // 別の端末が記録を足した
    const other = { ...answer('saa-1.1-t-002', false), deviceId: 'dev-other' };
    gh.state.gist!.files['events-000.ndjson'] += `${JSON.stringify(other)}\n`;
    const mine = answer('saa-1.1-t-003', true);
    await db.events.add(mine);
    const s2 = (await syncNow())!;
    expect(s2).toMatchObject({ pulled: 1, pushed: true, total: 3 });
    expect(await db.events.count()).toBe(3);
    const remote = parseSyncFile(gh.state.gist!.files['events-000.ndjson']!).events.map((e) => e.eventId);
    expect(new Set(remote)).toEqual(new Set([local.eventId, other.eventId, mine.eventId]));

    // 変化がなければ書き込まない
    const s3 = (await syncNow())!;
    expect(s3).toMatchObject({ pulled: 0, pushed: false });
  });

  it('保存した Gist が消えていたら探し直し、エラーは状態に残す', async () => {
    await db.events.add(answer('saa-1.1-t-001', true));
    await setToken('ghp_test');
    await db.meta.put({ key: GIST_ID_KEY, value: 'deleted' });
    const gh = fakeGitHub({ id: 'g9', files: {} });
    setSyncFetcher(gh.fetcher);
    expect(await syncNow()).toMatchObject({ lastError: null, pushed: true });
    expect(await getMeta(GIST_ID_KEY)).toBe('g9');

    setSyncFetcher(async () => new Response('{}', { status: 401 }));
    const s = (await syncNow())!;
    expect(s.lastError).toContain('トークンが無効');
    expect(((await getMeta<SyncStatus>(SYNC_STATUS_KEY)) ?? null)?.lastSyncAt).toEqual(expect.any(Number));
  });
});
