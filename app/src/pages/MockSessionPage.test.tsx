import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import { makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const questions = [
  ...[1, 2, 3, 4].flatMap((d) =>
    [1, 2].map((i) => makeQuestion({ id: `saa-${d}.1-t-00${i}`, domain: d, taskStatement: `${d}.1`, knowledgeRefs: [`${d}.1-K1`] })),
  ),
  makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' }),
];

describe('ミニ模試', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions));
  });

  it('5 問を解き、見直し画面から提出して結果と解説を見る', async () => {
    const user = userEvent.setup();
    renderApp('/mock');
    await user.click(await screen.findByRole('radio', { name: /ミニ 5 問/ }));
    await user.click(screen.getByRole('button', { name: '5 問で始める' }));

    // 1〜4 問目は正解を選び、2 問目にフラグを付ける。5 問目は未回答のまま
    for (let i = 1; i <= 4; i++) {
      expect(await screen.findByText(`問 ${i} / 5`)).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: /正しい選択肢/ }));
      if (i === 2) await user.click(screen.getByRole('button', { name: /見直しフラグを付ける/ }));
      await user.click(screen.getByRole('button', { name: '次へ →' }));
    }
    expect(await screen.findByText('問 5 / 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '見直しへ' }));

    const review = await screen.findByRole('heading', { name: '見直し' });
    const section = review.closest('section')!;
    expect(within(section).getByText(/回答済み 4 \/ 5 問 ・ 未回答 1 問 ・ フラグ 1 問/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '問 5' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: '⚑ 問 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '提出する' }));
    await user.click(screen.getByRole('button', { name: '提出を確定する' }));

    expect(await screen.findByRole('heading', { name: 'ランダム模試の結果' })).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ドメイン別' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全問の解説' })).toBeInTheDocument();

    const events = await db.events.toArray();
    const answers = events.filter((e) => e.type === 'answer');
    expect(answers).toHaveLength(4);
    expect(answers.every((e) => e.type === 'answer' && e.mode === 'mock' && !e.questionId.endsWith('-101'))).toBe(true);
    expect(events.filter((e) => e.type === 'mock-result')).toHaveLength(1);
  });

  it('保留模試は解放するまで始められない', async () => {
    renderApp('/mock');
    expect(await screen.findAllByRole('link', { name: /合格準備度の画面で解放/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '解く' })).not.toBeInTheDocument();
  });
});
