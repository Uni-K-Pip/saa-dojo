// 同期（GitHub のシークレット Gist）の設定と状態
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { EMPTY_STATUS, SYNC_STATUS_KEY, TOKEN_KEY, setToken, syncNow, type SyncStatus } from '../sync/sync';

const fmt = (t: number) => new Date(t).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

export default function SyncSection() {
  const hasToken = useLiveQuery(async () => !!(await db.secrets.get(TOKEN_KEY)), []);
  const status = useLiveQuery(async () => ((await db.meta.get(SYNC_STATUS_KEY))?.value as SyncStatus | undefined) ?? EMPTY_STATUS, []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const t = input.trim();
    if (!t) return;
    await setToken(t);
    setInput('');
    await run();
  }

  return (
    <section className="card" aria-labelledby="sync-h">
      <h2 id="sync-h">同期（任意）</h2>
      <p className="small muted">
        自分の GitHub の個人アクセストークン（gist 権限だけ）を入れると、学習記録をシークレット Gist（説明「saa-dojo sync」）に保存し、ほかの端末と同期します。起動時・学習のあと・下のボタンで同期し、同じ記録は重複しません。
      </p>
      <ul className="small muted">
        <li>トークンはこのブラウザの IndexedDB にだけ保存し、api.github.com 以外へは送りません。</li>
        <li>シークレット Gist は一覧や検索には出ませんが、暗号化はされていません。URL を知っている人は読めます。</li>
        <li>トークンは gist 権限だけを付け、有効期限を設定してください（GitHub の設定 → Developer settings → Personal access tokens）。</li>
      </ul>
      {hasToken === undefined ? null : hasToken ? (
        <>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
              {busy ? '同期中…' : '今すぐ同期'}
            </button>
            <button type="button" className="btn" onClick={() => void setToken(null)} disabled={busy}>
              同期をやめる（トークンを消す）
            </button>
          </div>
          {status && (
            <div aria-live="polite">
              <p className="small">
                最終同期: {status.lastSyncAt ? fmt(status.lastSyncAt) : 'まだ同期していません'}
                {status.lastSyncAt ? `（取り込み ${status.pulled} 件・記録 ${status.total} 件${status.pushed ? '・Gist を更新' : ''}）` : ''}
              </p>
              {status.lastError && status.lastErrorAt && (!status.lastSyncAt || status.lastErrorAt > status.lastSyncAt) && (
                <p className="notice error small" role="alert">
                  同期できませんでした（{fmt(status.lastErrorAt)}）: {status.lastError}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span>GitHub の個人アクセストークン</span>
            <input type="password" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" spellCheck={false} placeholder="github_pat_… または ghp_…" />
          </label>
          <button type="submit" className="btn primary" disabled={!input.trim() || busy}>
            保存して同期
          </button>
        </form>
      )}
    </section>
  );
}
