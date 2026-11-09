// Service Worker の登録と、更新・オフライン準備完了のトースト
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // 開いたままでも定期的に更新を確かめる
      if (reg) setInterval(() => void reg.update().catch(() => undefined), CHECK_INTERVAL_MS);
    },
  });
  if (needRefresh) {
    return (
      <div className="toast" role="status">
        <span>新しいバージョンがあります。</span>
        <button type="button" className="btn small primary" onClick={() => void updateServiceWorker(true)}>
          再読み込み
        </button>
        <button type="button" className="btn small" onClick={() => setNeedRefresh(false)}>
          あとで
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="toast" role="status">
        <span>オフラインでも使えるようになりました。</span>
        <button type="button" className="btn small" onClick={() => setOfflineReady(false)}>
          閉じる
        </button>
      </div>
    );
  }
  return null;
}
