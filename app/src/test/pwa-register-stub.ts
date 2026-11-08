// テスト用: virtual:pwa-register/react の代わり（Service Worker を登録しない）
import { useState } from 'react';

export function useRegisterSW() {
  const needRefresh = useState(false);
  const offlineReady = useState(false);
  return { needRefresh, offlineReady, updateServiceWorker: async () => undefined };
}
