// 画面のテスト用: 偽のコンテンツと空のデータベースでアプリを描画する
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../App';
import { setContentFetcher } from '../content/loader';
import { db } from '../db/db';
import { forgetDeviceId } from '../db/repo';
import { StudyProvider } from '../state/study';

export async function resetDb(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
  forgetDeviceId();
}

export function useFakeContent(files: Record<string, unknown>): void {
  setContentFetcher(async (path) => {
    if (!(path in files)) throw new Error(`not found: ${path}`);
    return structuredClone(files[path]);
  });
}

export function renderApp(path: string) {
  return render(
    <StudyProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </StudyProvider>,
  );
}
