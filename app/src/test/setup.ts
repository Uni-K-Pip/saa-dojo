import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// 他の処理と重なると、遅延読み込みの画面が既定の 1 秒を超えることがある（テストの制限時間 20 秒より短くしておく）
configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
});

// jsdom は scrollTo を実装していない（node 環境のテストでは window がない）
if (typeof window !== 'undefined') window.scrollTo = (() => undefined) as typeof window.scrollTo;
