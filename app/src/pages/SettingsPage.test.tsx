import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import { LAST_BACKUP_KEY } from '../db/repo';
import { BACKUP_FORMAT, makeBackup, parseBackup } from '../domain/backup';
import { deriveSettings } from '../domain/settings';
import { answer, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

describe('書き出し・読み込みの形式', () => {
  const events = [answer('saa-1.1-t-001', true), answer('saa-1.1-t-002', false)];
  it('書き出したものを読み込める', () => {
    const b = makeBackup([...events].reverse(), 'dev-1', Date.UTC(2026, 10, 9));
    expect(b).toMatchObject({ format: BACKUP_FORMAT, version: 1, deviceId: 'dev-1', exportedAt: '2026-11-09T00:00:00.000Z' });
    expect(b.events.map((e) => e.eventId)).toEqual(events.map((e) => e.eventId));
    const r = parseBackup(JSON.stringify(b));
    expect(r).toEqual({ ok: true, events: b.events, skipped: 0 });
  });
  const evs0 = events[0]!;
  it('イベントの配列と改行区切り JSON も受け付け、形の合わない記録は数えて捨てる', () => {
    expect(parseBackup(JSON.stringify([...events, { foo: 1 }]))).toMatchObject({ ok: true, skipped: 1 });
    const nd = events.map((e) => JSON.stringify(e)).join('\n');
    expect(parseBackup(nd)).toMatchObject({ ok: true, skipped: 0 });
    // 1行だけの改行区切り JSON も読める
    expect(parseBackup(`${JSON.stringify(evs0)}\n`)).toEqual({ ok: true, events: [evs0], skipped: 0 });
  });
  it('ほかのファイルや新しい版は拒む', () => {
    expect(parseBackup('')).toMatchObject({ ok: false });
    expect(parseBackup('{"format":"other"}')).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, events: [] }))).toMatchObject({ ok: false, error: expect.stringContaining('新しい形式') });
    expect(parseBackup('not json')).toMatchObject({ ok: false });
  });
});

function readBlob(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
}

describe('設定画面', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles([makeQuestion({ id: 'saa-1.1-t-001' })]));
  });

  it('試験日・テーマを変えると設定の記録が追加される', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    const date = await screen.findByLabelText('試験日');
    fireEvent.change(date, { target: { value: '2026-12-20' } });
    await user.click(screen.getByRole('radio', { name: 'ダーク' }));
    await user.type(screen.getByLabelText(/1日の目標/), '25');
    await user.tab();
    await waitFor(async () => expect(deriveSettings(await db.events.toArray())).toMatchObject({ examDate: '2026-12-20', theme: 'dark', dailyGoal: 25 }));
  });

  it('書き出し、読み込み（重複しない）、リセット', async () => {
    const user = userEvent.setup();
    const existing = answer('saa-1.1-t-001', true);
    await db.events.add(existing);
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      created.push(b as Blob);
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderApp('/settings');

    await user.click(await screen.findByRole('button', { name: 'JSON で書き出す' }));
    expect(await screen.findByText('1 件の記録を書き出しました。')).toBeInTheDocument();
    expect(JSON.parse(await readBlob(created[0]!))).toMatchObject({ format: BACKUP_FORMAT, events: [expect.objectContaining({ eventId: existing.eventId })] });
    expect((await db.meta.get(LAST_BACKUP_KEY))?.value).toEqual(expect.any(Number));

    const incoming = answer('saa-1.1-t-001', false);
    const file = new File([JSON.stringify(makeBackup([existing, incoming], 'other', Date.now()))], 'b.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('読み込むファイル'), file);
    expect(await screen.findByText(/1 件の記録を追加しました/)).toBeInTheDocument();
    expect(await db.events.count()).toBe(2);

    await user.click(screen.getByRole('button', { name: 'すべての記録を消す…' }));
    const go = screen.getByRole('button', { name: '消す' });
    expect(go).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '元に戻せないことを理解しました' }));
    await user.click(go);
    expect(await screen.findByText('すべての記録を消しました。')).toBeInTheDocument();
    expect(await db.events.count()).toBe(0);
  });
});
