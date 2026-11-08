import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocEntry, GlossaryEntry } from '../content/types';
import { excerpt, matchesQuery, normalize, searchDocs, searchGlossary } from '../domain/search';
import { makeContentFiles } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const glossary: GlossaryEntry[] = [
  { term: 'サブネット', en: 'Subnet', definition: 'VPC の IP アドレスの範囲を分けたもの。', services: ['Amazon VPC'], related: ['ルートテーブル'] },
  { term: 'ルートテーブル', en: 'Route table', definition: 'サブネットの通信の行き先を決める表。', services: ['Amazon VPC'], related: [] },
  { term: 'AWS Lambda', en: 'AWS Lambda', definition: 'サーバーを管理せずにコードを実行するサービス。', services: ['AWS Lambda'], related: [] },
];
const docs: DocEntry[] = [
  {
    id: 'cheatsheet-vpc-endpoints',
    kind: 'cheatsheet',
    title: 'VPC エンドポイント',
    order: 1,
    taskStatements: ['1.2'],
    services: ['AWS PrivateLink'],
    createdBy: 't',
    body: '## 比較\n\n| 種類 | 対応 |\n|---|---|\n| ゲートウェイ型 | S3 と DynamoDB |\n\n> **ひっかけ注意**\n> オンプレミスからは使えない。',
  },
  { id: 'guide-exam-strategy', kind: 'guide', title: '試験の解き方', order: 1, taskStatements: [], services: [], createdBy: 't', body: '時間配分は1問2分が目安です。' },
];

describe('検索', () => {
  it('全角・半角、大文字・小文字、ひらがな・カタカナを区別しない', () => {
    expect(normalize('ＶＰＣ　エンドポイント')).toBe('vpc えんどぽいんと');
    expect(matchesQuery('Amazon S3 Glacier', 'ｓ３ glacier')).toBe(true);
    expect(matchesQuery('Amazon S3', 's3 ebs')).toBe(false);
  });
  it('用語名に当たったものを先に並べる', () => {
    expect(searchGlossary(glossary, 'るーと').map((e) => e.term)).toEqual(['ルートテーブル', 'サブネット']);
    expect(searchGlossary(glossary, '')).toHaveLength(3);
  });
  it('早見表は本文も検索し、該当箇所を抜き出す', () => {
    expect(searchDocs(docs, 'dynamodb').map((d) => d.id)).toEqual(['cheatsheet-vpc-endpoints']);
    expect(excerpt(docs[1]!.body, '2分')).toContain('2分');
  });
});

describe('用語集・早見表の画面', () => {
  beforeEach(async () => {
    await resetDb();
    useFakeContent(makeContentFiles([], { glossary, docs }));
  });

  it('用語集を検索し、関連語へ移れる', async () => {
    const user = userEvent.setup();
    renderApp('/glossary');
    expect(await screen.findByText('3 語')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: '用語を検索' }), 'subnet');
    expect(await screen.findByText('1 件見つかりました')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '関連: ルートテーブル' }));
    expect(screen.getByRole('searchbox')).toHaveValue('ルートテーブル');
    expect(await screen.findByText('2 件見つかりました')).toBeInTheDocument();
  });

  it('早見表を検索して開くと、表と囲み記事が表示される', async () => {
    const user = userEvent.setup();
    renderApp('/docs');
    expect(await screen.findByRole('heading', { name: '早見表' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ガイド' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'ゲートウェイ');
    expect(await screen.findByText('1 件見つかりました')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'ガイド' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'VPC エンドポイント' }));
    expect(await screen.findByRole('heading', { name: 'VPC エンドポイント', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'ひっかけ注意' })).toBeInTheDocument();
  });
});
