import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// 全体を並列で実行すると、遅延読み込みの画面が既定の 1 秒をわずかに超えることがある
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
});

// jsdom は scrollTo を実装していない（node 環境のテストでは window がない）
if (typeof window !== 'undefined') window.scrollTo = (() => undefined) as typeof window.scrollTo;
