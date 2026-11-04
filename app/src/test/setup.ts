import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom は scrollTo を実装していない（node 環境のテストでは window がない）
if (typeof window !== 'undefined') window.scrollTo = (() => undefined) as typeof window.scrollTo;
