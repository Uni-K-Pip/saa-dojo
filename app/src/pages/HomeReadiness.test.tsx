import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '../db/db';
import { deriveSettings } from '../domain/settings';
import { answer, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';
import { needsBackup } from '../components/BackupReminder';

const questions = [
  makeQuestion({ id: 'saa-1.1-t-001' }),
  makeQuestion({ id: 'saa-2.1-t-001' }),
  makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' }),
  makeQuestion({ id: 'saa-1.1-t-201', pool: 'mockB' }),
];

describe('ホームと合格準備度', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions));
  });

  it('初めての人には案内を出し、4つの条件を未達で表示する', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'はじめに' })).toBeInTheDocument();
    expect(screen.getByText(/条件の達成/)).toHaveTextContent('0 / 4');
    expect(screen.getByText('未回答の問題: 2 / 2 問')).toBeInTheDocument();
  });

  it('今日の復習数と、試験日から逆算した目標を出す', async () => {
    await db.events.bulkAdd([
      answer('saa-1.1-t-001', false),
      { type: 'setting', key: 'examDate', value: '2099-01-01', eventId: 'ev-set-000001', deviceId: 'd', at: 1 } as never,
    ]);
    renderApp('/');
    expect(await screen.findByText('今日の復習（概念）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '復習する（1）' })).toBeInTheDocument();
    expect(screen.getByText(/試験日から逆算/)).toBeInTheDocument();
    // 古い記録があり書き出していないので、書き出しを促す
    expect(await screen.findByText(/学習記録はこの端末のブラウザにだけ保存されています/)).toBeInTheDocument();
  });

  it('検証済みの問題で組めない保留模試は、合格準備度の画面でも準備中で解放できない', async () => {
    renderApp('/readiness');
    expect(await screen.findByRole('heading', { name: '合格準備度' })).toBeInTheDocument();
    expect(screen.getAllByText('準備中（問題の検証中）')).toHaveLength(2);
    expect(screen.getAllByText(/不足: ドメイン 1: 0\/20 問/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /を解放/ })).not.toBeInTheDocument();
    expect(deriveSettings(await db.events.toArray()).unlockMockA).toBe(false);
  });
});

describe('書き出しの催促', () => {
  const day = 86_400_000;
  it('記録がなければ出さない。1週間たてば出す', () => {
    expect(needsBackup(null, null, 10 * day)).toBe(false);
    expect(needsBackup(0, null, 6 * day)).toBe(false);
    expect(needsBackup(0, null, 7 * day)).toBe(true);
    expect(needsBackup(0, 5 * day, 10 * day)).toBe(false);
    expect(needsBackup(0, 2 * day, 10 * day)).toBe(true);
  });
});
