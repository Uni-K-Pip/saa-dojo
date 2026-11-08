// 同期（GitHub Gist）の設定。実装は同期機能の追加時に入れる
export default function SyncSection() {
  return (
    <section className="card" aria-labelledby="sync-h">
      <h2 id="sync-h">同期</h2>
      <p className="small muted">端末間の同期は準備中です。それまでは書き出し・読み込みで記録を移してください。</p>
    </section>
  );
}
