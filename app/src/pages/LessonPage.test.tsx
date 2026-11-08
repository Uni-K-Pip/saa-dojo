import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import type { LessonMeta } from '../content/types';
import { makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const questions = [makeQuestion({ id: 'saa-1.1-t-001', lessonRefs: ['lesson-1.1-iam'] }), makeQuestion({ id: 'saa-1.1-t-002' })];
const lessons: LessonMeta[] = [
  {
    id: 'lesson-1.1-iam',
    title: 'IAM の基本',
    domain: 1,
    taskStatement: '1.1',
    order: 1,
    knowledgeRefs: ['1.1-K1'],
    services: ['AWS IAM'],
    estimatedMinutes: 10,
    questionIds: ['saa-1.1-t-001', 'saa-1.1-t-002'],
  },
  {
    id: 'lesson-basics-cloud',
    title: 'クラウドとは',
    domain: 0,
    taskStatement: 'basics',
    order: 1,
    knowledgeRefs: ['basics-K1'],
    services: [],
    estimatedMinutes: 5,
    questionIds: [],
  },
];
const body = [
  '## 基礎',
  '',
  '| 項目 | 内容 |',
  '|---|---|',
  '| ユーザー | 人 |',
  '',
  '> **試験のポイント**',
  '> 最小権限にする。',
  '',
  '> **ひっかけ注意**',
  '> ルートユーザーは使わない。',
  '',
  '## 確認問題',
  '',
  '- `saa-1.1-t-002`: 2問目',
].join('\n');

describe('レッスン', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(
      makeContentFiles(questions, {
        lessons,
        'lesson:lesson-1.1-iam': { id: 'lesson-1.1-iam', body },
      }),
    );
  });

  it('表と囲み記事を表示し、確認問題を解き始められる', async () => {
    const user = userEvent.setup();
    renderApp('/lessons/lesson-1.1-iam');
    expect(await screen.findByRole('heading', { name: 'IAM の基本', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '試験のポイント' })).toHaveClass('callout', 'tip');
    expect(screen.getByRole('complementary', { name: 'ひっかけ注意' })).toHaveClass('callout', 'trap');

    await user.click(screen.getByRole('button', { name: '読了にする' }));
    await waitFor(async () => expect((await db.events.toArray()).some((e) => e.type === 'lesson-read')).toBe(true));
    expect(await screen.findByText(/読了 \d/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '確認問題を解く（2 問）' }));
    expect(await screen.findByRole('button', { name: '回答する' })).toBeInTheDocument();
    const sessions = await db.sessions.toArray();
    expect(sessions[0]).toMatchObject({ kind: 'practice', mode: 'lesson' });
    expect(sessions[0]!.questionIds).toHaveLength(2);
  });

  it('本文中の問題 ID から1問だけ解ける', async () => {
    const user = userEvent.setup();
    renderApp('/lessons/lesson-1.1-iam');
    await user.click(await screen.findByRole('button', { name: 'saa-1.1-t-002 を解く' }));
    expect(await screen.findByRole('button', { name: '回答する' })).toBeInTheDocument();
    const sessions = await db.sessions.toArray();
    expect(sessions[0]!.questionIds).toEqual(['saa-1.1-t-002']);
  });

  it('ロードマップからレッスンへ進める', async () => {
    renderApp('/roadmap');
    expect(await screen.findByRole('link', { name: 'IAM の基本' })).toHaveAttribute('href', '/lessons/lesson-1.1-iam');
    expect(screen.getAllByText(/網羅 0\/2 項目/).length).toBeGreaterThan(0);
  });

  it('基礎講座の一覧には基礎レッスンだけを出す', async () => {
    renderApp('/basics');
    expect(await screen.findByRole('link', { name: 'クラウドとは' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'IAM の基本' })).not.toBeInTheDocument();
  });

  it('存在しないレッスン', async () => {
    renderApp('/lessons/lesson-1.1-none');
    expect(await screen.findByRole('heading', { name: 'レッスンが見つかりません' })).toBeInTheDocument();
  });
});
