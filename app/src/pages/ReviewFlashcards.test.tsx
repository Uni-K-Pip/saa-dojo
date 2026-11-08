import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import type { FlashcardDeck } from '../content/types';
import { answer, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const questions = [
  makeQuestion({ id: 'saa-1.1-t-001', knowledgeRefs: ['1.1-K1'] }),
  makeQuestion({ id: 'saa-1.1-t-002', knowledgeRefs: ['1.1-K1'] }),
  makeQuestion({ id: 'saa-1.1-t-101', knowledgeRefs: ['1.1-K1'], pool: 'mockA' }),
];
const decks: FlashcardDeck[] = [
  {
    deck: 'storage',
    title: 'ストレージ',
    createdBy: 't',
    cards: [
      { id: 'fc-t-001', front: 'S3 の耐久性は？', back: '99.999999999%', taskStatements: [], services: [], tags: [] },
      { id: 'fc-t-002', front: 'EBS は何型？', back: 'ブロックストレージ', taskStatements: [], services: [], tags: [] },
    ],
  },
];

describe('復習', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions, { flashcards: decks }));
  });

  it('誤答した概念を、前回と別の問題で出す', async () => {
    await db.events.add(answer('saa-1.1-t-001', false));
    const user = userEvent.setup();
    renderApp('/review');
    expect(await screen.findByText('今日の復習（概念）')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1 問を復習する' }));
    expect(await screen.findByRole('button', { name: '回答する' })).toBeInTheDocument();
    const [s] = await db.sessions.toArray();
    expect(s).toMatchObject({ mode: 'review', questionIds: ['saa-1.1-t-002'], concepts: { 'saa-1.1-t-002': '1.1-K1' } });
  });

  it('復習がなければ案内を出す', async () => {
    renderApp('/review');
    expect(await screen.findByText(/まだ復習する概念はありません/)).toBeInTheDocument();
  });
});

describe('フラッシュカード', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions, { flashcards: decks }));
  });

  it('答えを見て評価すると記録され、次のカードに進む', async () => {
    const user = userEvent.setup();
    renderApp('/flashcards');
    expect(await screen.findByText('S3 の耐久性は？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /答えを見る/ }));
    expect(screen.getByText('99.999999999%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /普通/ }));
    expect(await screen.findByText('EBS は何型？')).toBeInTheDocument();
    await waitFor(async () => expect(await db.events.toArray()).toEqual([expect.objectContaining({ type: 'flashcard', cardId: 'fc-t-001', rating: 3 })]));
    // キーボードでも操作できる
    await user.keyboard(' ');
    expect(screen.getByText('ブロックストレージ')).toBeInTheDocument();
    await user.keyboard('4');
    expect(await screen.findByText(/今日のカードは終わりました/)).toBeInTheDocument();
  });
});
