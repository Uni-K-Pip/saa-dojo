import { beforeEach, describe, expect, it } from 'vitest';
import { Suspense } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import ArtifactPage from './ArtifactPage';
import userEvent from '@testing-library/user-event';
import type { ArtifactData, ArtifactIndexEntry } from '../content/types';
import { makeContentFiles } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const base = (id: string, format: ArtifactData['format'], status: ArtifactData['status'] = 'pending') => ({
  id,
  title: `題 ${id}`,
  kind: 'bucket-policy',
  kindLabel: 'バケットポリシー',
  format,
  status,
});
const json: ArtifactData = {
  ...base('ar-json', 'json'),
  lines: [
    { indent: 0, text: '{', marks: [], starts: [] },
    { indent: 2, text: '"Principal": "*",', marks: [1], starts: [1] },
    { indent: 2, text: '"Condition": {', marks: [2], starts: [2] },
    { indent: 4, text: '"StringEquals": {}', marks: [2], starts: [] },
    { indent: 2, text: '}', marks: [2], starts: [] },
    { indent: 0, text: '}', marks: [], starts: [] },
  ],
  notes: [
    { n: 1, text: 'だれでも、と書いてあります。', where: 'Principal' },
    { n: 2, text: '条件で絞っています。', where: 'Condition' },
  ],
  ask: {
    text: '組織の外から読めますか？',
    answer: '読めません。条件に合いません。',
  },
};
const table: ArtifactData = {
  ...base('ar-table', 'table', 'verified'),
  columns: ['方向', 'ポート'],
  rows: [
    { cells: ['インバウンド', '443'], marks: [1], starts: [1] },
    { cells: ['アウトバウンド', 'すべて'], marks: [], starts: [] },
  ],
  notes: [{ n: 1, text: '送信元にグループを指定しています。', where: '1 行目' }],
};
const text: ArtifactData = {
  ...base('ar-text', 'text'),
  lines: [
    { indent: 0, text: '名前: example.com', marks: [], starts: [] },
    { indent: 2, text: 'タイプ: A', marks: [1], starts: [1] },
  ],
  notes: [{ n: 1, text: 'エイリアスです。', where: '2 行目' }],
};
const entry = (a: ArtifactData): ArtifactIndexEntry => ({
  id: a.id,
  title: a.title,
  kind: a.kind,
  kindLabel: a.kindLabel,
  format: a.format,
  status: a.status,
});

function setup(items: ArtifactData[]) {
  useFakeContent(
    makeContentFiles([], {
      'artifact-index': items.map(entry),
      ...Object.fromEntries(items.map((a) => [`artifact:${a.id}`, a])),
    }),
  );
}

describe('実物の画面', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('0 件（公開のビルド）のとき、一覧はその旨を出す', async () => {
    setup([]);
    renderApp('/artifacts');
    expect(
      await screen.findByRole('heading', {
        name: '実物の一覧（試作）',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('表示できる実物はまだありません。実物は、検証が済んだものから載せます。'),
    ).toBeInTheDocument();
  });

  it('一覧では、未検証の実物にだけ札を出す', async () => {
    setup([json, table]);
    renderApp('/artifacts');
    expect((await screen.findByRole('link', { name: '題 ar-json' })).closest('li')).toHaveTextContent('未検証');
    expect(screen.getByRole('link', { name: '題 ar-table' }).closest('li')).not.toHaveTextContent('未検証');
  });

  it('除かれた実物の id で開くと、表示できない理由と一覧へのリンクを出す', async () => {
    setup([]);
    renderApp('/artifacts/ar-bucket-policy-org-only');
    expect(await screen.findByRole('heading', { name: '見つかりません' })).toBeInTheDocument();
    expect(
      screen.getByText(
        '指定された実物（ar-bucket-policy-org-only）は表示できません。実物がないか、まだ検証が済んでいない実物です。',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '実物の一覧へ' })).toHaveAttribute('href', '/artifacts');
  });

  it('json: 指した部分を強調し、注目点と同じ番号を付ける。札と種類の名前を出す', async () => {
    setup([json]);
    const { container } = renderApp('/artifacts/ar-json');
    expect(await screen.findByRole('heading', { name: '題 ar-json', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('未検証')).toHaveClass('badge', 'pending');
    expect(screen.getByText('バケットポリシー')).toBeInTheDocument();
    const body = screen.getByRole('group', { name: 'バケットポリシーの本体' });
    const marked = body.querySelectorAll('.ar-mark');
    expect([...marked].map((l) => l.textContent)).toEqual([
      '注目点 1"Principal": "*",',
      '注目点 2"Condition": {',
      '"StringEquals": {}',
      '}',
    ]);
    expect((marked[1].querySelector('.ar-text') as HTMLElement).style.paddingLeft).toBe('2ch');
    const notes = container.querySelector('.ar-notes')!;
    expect(
      within(notes as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      '1注目点 1: だれでも、と書いてあります。場所: Principal',
      '2注目点 2: 条件で絞っています。場所: Condition',
    ]);
  });

  it('問いを出し、「答えを見る」で答えを開く', async () => {
    setup([json]);
    renderApp('/artifacts/ar-json');
    expect(await screen.findByText('組織の外から読めますか？')).toBeVisible();
    const answer = screen.getByText('読めません。条件に合いません。');
    expect(answer).not.toBeVisible();
    await userEvent.click(screen.getByText('答えを見る'));
    expect(answer).toBeVisible();
  });

  it('別の実物へ移ると、開いた答えは閉じた状態に戻る', async () => {
    const other: ArtifactData = {
      ...text,
      ask: {
        text: 'エイリアスは頂点に置けますか？',
        answer: '置けます。CNAME と違います。',
      },
    };
    setup([json, other]);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/artifacts/ar-json']}>
          <Link to="/artifacts/ar-text">次の実物</Link>
          <Suspense fallback="…">
            <Routes>
              <Route path="/artifacts/:id" element={<ArtifactPage />} />
            </Routes>
          </Suspense>
        </MemoryRouter>,
      );
    });
    await userEvent.click(await screen.findByText('答えを見る'));
    expect(screen.getByText('読めません。条件に合いません。')).toBeVisible();
    await act(async () => {
      await userEvent.click(screen.getByRole('link', { name: '次の実物' }));
    });
    const answer = await screen.findByText('置けます。CNAME と違います。');
    expect(answer).not.toBeVisible();
  });

  it('table: 行を強調して番号を付け、検証済みには札を出さない', async () => {
    setup([table]);
    renderApp('/artifacts/ar-table');
    const row = (await screen.findByText('インバウンド')).closest('tr')!;
    expect(row).toHaveClass('ar-mark');
    expect(within(row).getByRole('rowheader')).toHaveTextContent('1注目点 1');
    expect(within(row).getByText('インバウンド')).toHaveAttribute('data-label', '方向');
    expect(screen.queryByText('未検証')).not.toBeInTheDocument();
  });

  it('text: 行番号を出し、指した行を強調する', async () => {
    setup([text]);
    renderApp('/artifacts/ar-text');
    const line = (await screen.findByText('タイプ: A', { exact: false })).closest('.ar-line')!;
    expect(line).toHaveClass('ar-mark');
    expect(line.textContent).toBe('行 2注目点 1タイプ: A');
  });
});
