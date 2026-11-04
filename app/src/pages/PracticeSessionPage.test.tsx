import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import { makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const questions = [
  makeQuestion({ id: 'saa-1.1-t-001' }),
  makeQuestion({ id: 'saa-2.1-t-001', difficulty: 3 }),
  makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA' }),
];

describe('演習で1問解く', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions));
  });

  it('条件を選んで始め、自信度を選んで回答し、採点結果と解説を見る', async () => {
    const user = userEvent.setup();
    renderApp('/practice');
    expect(await screen.findByRole('heading', { name: '演習' })).toBeInTheDocument();
    // 保留模試の問題は数に入らない
    expect(screen.getByText(/条件に合う問題: 2 問/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2 問を解く' }));

    const submit = await screen.findByRole('button', { name: '回答する' });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /正しい選択肢/ }));
    expect(submit).toBeDisabled(); // 自信度がまだ
    await user.click(screen.getByRole('radio', { name: '確信' }));
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(await screen.findByText('正解', { selector: '.result-banner span' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '解説' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ChatGPT に聞く' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/chatgpt\.com\/\?q=/));
    expect(screen.getByRole('link', { name: 'Claude に聞く' })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/claude\.ai\/new\?q=/));
    expect(screen.getByRole('link', { name: '誤りを報告' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/github\.com\/Uni-K-Pip\/saa-dojo\/issues\/new\?title=saa-/),
    );

    const events = await db.events.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'answer', correct: true, confidence: 'sure', mode: 'practice', selected: ['a'] });

    // 2 問目は間違えて、誤答理由を記録する
    await user.click(screen.getByRole('button', { name: '次の問題へ' }));
    await user.click(await screen.findByRole('radio', { name: /誤りの選択肢1/ }));
    await user.click(screen.getByRole('radio', { name: '勘' }));
    await user.click(screen.getByRole('button', { name: '回答する' }));
    expect(await screen.findByText('不正解', { selector: '.result-banner span' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '読み落とし' }));
    await waitFor(async () => expect((await db.events.toArray()).some((e) => e.type === 'miss-reason')).toBe(true));

    await user.click(screen.getByRole('button', { name: '結果を見る' }));
    expect(await screen.findByText('1 / 2 問正解')).toBeInTheDocument();
  });
});
