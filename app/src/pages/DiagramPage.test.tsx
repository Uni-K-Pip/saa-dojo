import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { DiagramIndexEntry, DiagramScene } from '../content/types';
import { makeContentFiles } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const scene = (id: string, status: DiagramScene['status']): DiagramScene => ({
  id, type: 'architecture', title: `題 ${id}`, alt: '図の代替文です。',
  width: 328, height: 100, status, boxes: [], nodes: [], edges: [],
  steps: [{ text: '段階の説明です。', focus: [], edges: [], marks: [], reveal: [], badgeAt: null }],
});
const entry = (s: DiagramScene): DiagramIndexEntry => ({ id: s.id, title: s.title, type: s.type, steps: s.steps.length, status: s.status });

function setup(scenes: DiagramScene[]) {
  useFakeContent(makeContentFiles([], {
    'diagram-index': scenes.map(entry),
    ...Object.fromEntries(scenes.map((s) => [`diagram:${s.id}`, s])),
  }));
}

describe('図の画面', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('図が 0 枚（公開のビルド）のとき、一覧はその旨を出す', async () => {
    setup([]);
    renderApp('/diagrams');
    expect(await screen.findByRole('heading', { name: '図の一覧（試作）', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('表示できる図はまだありません。図は、検証が済んだものから載せます。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '図の一覧（試作）' }).closest('article')?.querySelector('ul')).toBeNull();
  });

  it('一覧では、未検証の図にだけ札を出す', async () => {
    setup([scene('dg-checked', 'verified'), scene('dg-draft', 'pending')]);
    renderApp('/diagrams');
    const draft = await screen.findByRole('link', { name: '題 dg-draft' });
    expect(draft.closest('li')).toHaveTextContent('未検証');
    expect(screen.getByRole('link', { name: '題 dg-checked' }).closest('li')).not.toHaveTextContent('未検証');
  });

  it('出力から除かれた図の id で開くと、表示できない理由と一覧へのリンクを出す', async () => {
    setup([]);
    renderApp('/diagrams/dg-vpc-three-tier');
    expect(await screen.findByRole('heading', { name: '見つかりません' })).toBeInTheDocument();
    expect(screen.getByText('指定された図（dg-vpc-three-tier）は表示できません。図がないか、まだ検証が済んでいない図です。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '図の一覧へ' })).toHaveAttribute('href', '/diagrams');
  });

  it('検証済みの図には札を出さず、未検証の図には札を出す', async () => {
    setup([scene('dg-checked', 'verified'), scene('dg-draft', 'pending')]);
    const { unmount } = renderApp('/diagrams/dg-checked');
    expect(await screen.findByRole('heading', { name: '題 dg-checked', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('未検証')).not.toBeInTheDocument();
    unmount();
    renderApp('/diagrams/dg-draft');
    expect(await screen.findByRole('heading', { name: '題 dg-draft', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('未検証')).toHaveClass('badge', 'pending');
  });
});
