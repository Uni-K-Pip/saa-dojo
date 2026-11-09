import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import { analyze, weakestFirst } from '../domain/analysis';
import { buildDrill, drillSources, splitKeyPoint } from '../domain/drill';
import { buildHistory } from '../domain/history';
import { mulberry32 } from '../domain/rng';
import { answer, event, makeContentFiles, makeQuestion, metaOf } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const questions = [
  makeQuestion({ id: 'saa-1.1-t-001', qualifier: 'security', services: ['AWS IAM'], keyPoints: ['ガードレールを全アカウントに → SCP', '矢印のない要点'] }),
  makeQuestion({ id: 'saa-2.1-t-001', qualifier: 'operational', services: ['AWS Lambda'], keyPoints: ['サーバー管理なしで → AWS Lambda'] }),
  makeQuestion({ id: 'saa-3.1-t-001', qualifier: 'performance', services: ['Amazon CloudFront'], keyPoints: ['静的コンテンツを世界に低遅延で → Amazon CloudFront'] }),
  makeQuestion({ id: 'saa-4.1-t-001', qualifier: 'cost', services: ['Amazon S3'], keyPoints: ['アクセス頻度が予測できない -> S3 Intelligent-Tiering'] }),
  makeQuestion({ id: 'saa-4.1-t-002', qualifier: 'cost', services: ['Amazon EC2'], keyPoints: ['中断してよいバッチ → スポットインスタンス'] }),
  makeQuestion({ id: 'saa-1.1-t-101', pool: 'mockA', keyPoints: ['保留模試の要点 → 出さない'] }),
];

describe('判断軸ドリルの生成', () => {
  it('矢印で制約と設計に分ける', () => {
    expect(splitKeyPoint('サーバー管理なしで → AWS Lambda')).toEqual({ cue: 'サーバー管理なしで', answer: 'AWS Lambda' });
    expect(splitKeyPoint('矢印のない要点')).toBeNull();
    expect(splitKeyPoint('A → B → C')).toBeNull();
  });
  it('保留模試の要点は使わず、選択肢は別の問題の設計から作る', () => {
    const sources = drillSources(questions);
    expect(sources.map((s) => s.answer)).not.toContain('出さない');
    expect(sources).toHaveLength(5);
    const items = buildDrill(sources, 10, mulberry32(1));
    expect(items).toHaveLength(5);
    for (const it of items) {
      expect(it.choices).toHaveLength(4);
      expect(it.choices).toContain(it.answer);
      expect(new Set(it.choices).size).toBe(4);
    }
    // 判断軸で絞り込める。誤りの選択肢は同じ判断軸を優先
    const cost = buildDrill(sources, 10, mulberry32(2), ['cost']);
    expect(cost.map((i) => i.qualifier)).toEqual(['cost', 'cost']);
    const s3 = cost.find((i) => i.answer === 'S3 Intelligent-Tiering')!;
    expect(s3.choices).toContain('スポットインスタンス');
  });
});

describe('弱点分析の集計', () => {
  it('タスク・サービス・判断軸・誤答理由で集計する', () => {
    const index = questions.map(metaOf);
    const wrong = answer('saa-1.1-t-001', false);
    const events = [
      wrong,
      answer('saa-1.1-t-001', true),
      answer('saa-4.1-t-001', false),
      event('miss-reason', { questionId: 'saa-1.1-t-001', answerEventId: wrong.eventId, reason: 'misread' }),
    ];
    const a = analyze(events, index, buildHistory(events));
    expect(a.attempts).toBe(3);
    expect(a.byTask.find((b) => b.key === '1.1')).toMatchObject({ attempts: 2, correct: 1, rate: 0.5 });
    expect(a.byQualifier[0]).toMatchObject({ key: 'cost', rate: 0 });
    expect(a.missReasons).toEqual([
      { reason: 'misread', count: 1 },
      { reason: 'unrecorded', count: 1 },
    ]);
  });
  it('回答数が少ないものは後ろに回す', () => {
    const rows = weakestFirst([
      { key: 'a', attempts: 1, correct: 0, rate: 0 },
      { key: 'b', attempts: 5, correct: 3, rate: 0.6 },
      { key: 'c', attempts: 4, correct: 1, rate: 0.25 },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['c', 'b', 'a']);
  });
});

describe('弱点分析と判断軸ドリルの画面', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles(questions));
  });

  it('弱点分析から条件付きの演習へ進める', async () => {
    await db.events.bulkAdd([answer('saa-1.1-t-001', false), answer('saa-4.1-t-001', true)]);
    renderApp('/analysis');
    expect(await screen.findByRole('heading', { name: '判断軸別' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: '演習' });
    expect(links.map((l) => l.getAttribute('href'))).toContain('/practice?qualifiers=security');
    expect(links.map((l) => l.getAttribute('href'))).toContain('/practice?tasks=1.1');
  });

  it('ドリルを最後まで解くと結果が記録される', async () => {
    const user = userEvent.setup();
    renderApp('/drill');
    await user.click(await screen.findByRole('button', { name: '5 問で始める' }));
    for (let i = 0; i < 5; i++) {
      await screen.findByText(`${i + 1} / 5 問`);
      await user.keyboard('1');
      await user.click(screen.getByRole('button', { name: i === 4 ? '結果を見る' : '次へ' }));
    }
    expect(await screen.findByRole('heading', { name: '判断軸ドリルの結果' })).toBeInTheDocument();
    await waitFor(async () => expect((await db.events.toArray()).filter((e) => e.type === 'drill')).toEqual([expect.objectContaining({ total: 5 })]));
  });
});
