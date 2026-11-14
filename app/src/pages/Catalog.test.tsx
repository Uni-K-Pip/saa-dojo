import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../db/db';
import type {
  CatalogComparison,
  CatalogEntry,
  CatalogFact,
  CatalogIndex,
  CatalogIndexService,
  DocEntry,
  LessonMeta,
  ServiceEntry,
} from '../content/types';
import { answer, makeContentFiles, makeQuestion } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';
import { NAV_ITEMS } from '../components/Layout';

const reg = (id: string, name: string, category: string, over: Partial<ServiceEntry> = {}): ServiceEntry => ({
  id,
  name,
  aliases: [],
  category,
  source: 'inScope',
  ...over,
});
const registry: ServiceEntry[] = [
  reg('s3', 'Amazon S3', 'ストレージ', { aliases: ['S3', 'Amazon Simple Storage Service'] }),
  reg('ebs', 'Amazon EBS', 'ストレージ'),
  reg('ec2', 'Amazon EC2', 'コンピューティング', { aliases: ['EC2'] }),
  reg('ec2-spot', 'Amazon EC2 Spot Instances', 'コンピューティング', { hostedBy: 'ec2' }),
  reg('config', 'AWS Config', '管理とガバナンス'),
  reg('cloudtrail', 'AWS CloudTrail', '管理とガバナンス'),
];

const SRC = [{ title: 'Amazon S3 ユーザーガイド', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }];
const fact = (id: string, over: Partial<CatalogFact> = {}): CatalogFact => ({
  id,
  title: `見出し ${id}`,
  kind: 'feature',
  text: `本文 ${id}`,
  depth: 'core',
  sources: SRC,
  checkedAt: '2026-11-14',
  status: 'verified',
  ...over,
});
const s3Facts: CatalogFact[] = [
  fact('s3.access-points', { title: 'アクセスポイント', tags: ['VPC'], status: 'pending', examPoint: 'VPC からだけ使わせるときに使う', trap: 'バケットポリシーの代わりではない' }),
  fact('s3.versioning', { title: 'バージョニング' }),
  fact('s3.mfa-delete', { title: 'MFA Delete', kind: 'constraint', depth: 'detail' }),
];
const ec2Facts: CatalogFact[] = [fact('ec2.spot-interruption', { title: 'スポットの中断', services: ['Amazon EC2 Spot Instances'] })];
const entry = (id: string, tier: 1 | 2 | 3, facts: CatalogFact[], over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id,
  tier,
  status: 'verified',
  summary: `${id} の概要。何をするサービスかを説明する文章です。`,
  chooseWhen: [{ text: '大量のデータを保存したい', alternatives: ['ebs'], factRefs: ['s3.versioning'] }],
  facts,
  seeAlso: [{ id: 'ec2.spot-interruption', title: 'スポットの中断', entryId: 'ec2', entryName: 'Amazon EC2' }],
  references: SRC,
  createdBy: 't',
  createdAt: '2026-11-14',
  ...over,
});
const s3Entry = entry('s3', 1, s3Facts);
const ec2Entry = entry('ec2', 2, ec2Facts, { seeAlso: [], chooseWhen: undefined });

const row = (s: ServiceEntry, over: Partial<CatalogIndexService> = {}): CatalogIndexService => ({
  id: s.id,
  name: s.name,
  aliases: s.aliases,
  category: s.category,
  children: [],
  facts: [],
  tasks: [],
  related: { lessons: [], docs: [], glossary: 0, flashcards: 0, questions: 0 },
  comparisons: [],
  ...over,
});
const toIndexFact = (f: CatalogFact) => ({ id: f.id, title: f.title, kind: f.kind, depth: f.depth, tags: f.tags ?? [], status: f.status });
const catalogIndex: CatalogIndex = {
  services: [
    row(registry[0]!, {
      tier: 1,
      summary: s3Entry.summary,
      status: 'verified',
      facts: s3Facts.map(toIndexFact),
      tasks: ['1.1'],
      related: { lessons: ['lesson-4.1-s3'], docs: ['cheatsheet-s3'], glossary: 2, flashcards: 3, questions: 1 },
      comparisons: ['cmp-s3-ebs'],
    }),
    row(registry[1]!),
    row(registry[2]!, {
      tier: 2,
      summary: ec2Entry.summary,
      status: 'verified',
      children: [{ id: 'ec2-spot', name: 'Amazon EC2 Spot Instances', aliases: [] }],
      facts: ec2Facts.map(toIndexFact),
      tasks: ['2.1'],
    }),
    row(registry[4]!, { comparisons: ['cmp-config-cloudtrail', 'cmp-docs-only'] }),
    row(registry[5]!),
  ],
  comparisons: [
    { id: 'cmp-s3-ebs', title: 'S3 と EBS', services: ['s3', 'ebs'], status: 'pending' },
    { id: 'cmp-config-cloudtrail', title: 'AWS Config と AWS CloudTrail', services: ['config', 'cloudtrail'], status: 'verified' },
    { id: 'cmp-docs-only', title: '早見表だけの比較', services: ['config', 'cloudtrail'], status: 'verified' },
  ],
};
const comparisons: CatalogComparison[] = [
  {
    id: 'cmp-config-cloudtrail',
    title: 'AWS Config と AWS CloudTrail',
    services: ['config', 'cloudtrail'],
    status: 'verified',
    decide: ['設定の履歴なら Config', 'API の呼び出しの記録なら CloudTrail'],
    rows: [{ axis: '記録するもの', values: { config: '設定の履歴', cloudtrail: 'API の呼び出し' }, factRefs: ['s3.versioning'] }],
    sources: SRC,
    checkedAt: '2026-11-14',
    createdBy: 't',
  },
  {
    id: 'cmp-docs-only',
    title: '早見表だけの比較',
    services: ['config', 'cloudtrail'],
    status: 'verified',
    decide: ['違いは早見表で確かめる'],
    docRef: 'cheatsheet-s3',
    sources: SRC,
    checkedAt: '2026-11-14',
    createdBy: 't',
  },
];
const lessons: LessonMeta[] = [
  { id: 'lesson-4.1-s3', title: 'S3 のストレージクラス', domain: 4, taskStatement: '4.1', order: 1, knowledgeRefs: [], services: ['Amazon S3'], estimatedMinutes: 10, questionIds: [] },
];
const docs: DocEntry[] = [
  { id: 'cheatsheet-s3', kind: 'cheatsheet', title: 'S3 の早見表', order: 1, taskStatements: [], services: ['Amazon S3'], createdBy: 't', body: '本文' },
];

const q1 = makeQuestion({ id: 'saa-1.1-t-001', services: ['Amazon S3', 'AWS Local Zones'], factRefs: ['s3.versioning', 's3.not-in-index'] });

function setup(extra: Record<string, unknown> = {}) {
  useFakeContent(
    makeContentFiles([q1], {
      services: registry,
      'catalog-index': catalogIndex,
      'catalog:s3': s3Entry,
      'catalog:ec2': ec2Entry,
      'catalog-compare': comparisons,
      lessons,
      docs,
      ...extra,
    }),
  );
}

describe('サービス図鑑の一覧', () => {
  beforeEach(async () => {
    await resetDb();
    setup();
  });

  it('台帳の全サービスを分類ごとに出し、エントリのないサービスは準備中と表示する（子は行にしない）', async () => {
    renderApp('/services');
    expect(await screen.findByRole('heading', { name: 'サービス図鑑', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ストレージ' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'コンピューティング' })).toBeInTheDocument();
    const ebs = screen.getByRole('link', { name: 'Amazon EBS' }).closest('li')!;
    expect(within(ebs).getByText('準備中')).toBeInTheDocument();
    const s3 = screen.getByRole('link', { name: 'Amazon S3' }).closest('li')!;
    expect(within(s3).getByText(/s3 の概要/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Amazon EC2 Spot Instances' })).not.toBeInTheDocument();
  });

  it('名前・別名・子の名前で検索でき、検索語は ?q= に残る', async () => {
    const user = userEvent.setup();
    renderApp('/services');
    await screen.findByRole('searchbox');
    await user.type(screen.getByRole('searchbox', { name: 'サービスを検索' }), 'spot');
    expect(await screen.findByText('1 件見つかりました')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amazon EC2' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Amazon S3' })).not.toBeInTheDocument();
  });

  it('事実の見出しに当たると行の下に見出しを出し、タップで ?f= つきの詳細へ移る', async () => {
    const user = userEvent.setup();
    renderApp('/services?q=アクセスポイント');
    const link = await screen.findByRole('link', { name: 'アクセスポイント' });
    expect(link.closest('li')!.parentElement!.closest('li')).not.toBeNull();
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Amazon S3', level: 1 })).toBeInTheDocument();
    expect(document.getElementById('fact-access-points')).toHaveAttribute('open');
  });

  it('区分・タスク・未読で絞り込む', async () => {
    const user = userEvent.setup();
    renderApp('/services');
    await screen.findByRole('searchbox');
    await user.click(screen.getByRole('checkbox', { name: '標準' }));
    expect(await screen.findByText('1 件見つかりました')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amazon EC2' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '標準' }));
    await user.click(screen.getByRole('checkbox', { name: 'タスク 1.1' }));
    expect(screen.getByRole('link', { name: 'Amazon S3' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Amazon EC2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'タスク 1.1' }));

    // 未読: 解説があって、まだ読んでいないものだけ（準備中は出ない）
    await user.click(screen.getByRole('checkbox', { name: '未読' }));
    expect(screen.getByRole('link', { name: 'Amazon S3' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Amazon EBS' })).not.toBeInTheDocument();
  });

  it('読んだエントリには読了バッジが付き、未読の絞り込みから外れる', async () => {
    const user = userEvent.setup();
    renderApp('/services/s3');
    await user.click(await screen.findByRole('button', { name: '読んだ' }));
    await waitFor(async () => expect(await db.events.toArray()).toMatchObject([{ type: 'catalog-read', serviceId: 's3' }]));
    expect(await screen.findByRole('button', { name: /読んだ（もう一度記録する）/ })).toBeInTheDocument();
  });

  it('ナビの「調べる」に、用語集の前にサービス図鑑がある', () => {
    const labels = NAV_ITEMS.filter((i) => i.group === '調べる').map((i) => i.label);
    expect(labels.indexOf('サービス図鑑')).toBe(0);
    expect(labels.indexOf('サービス図鑑')).toBeLessThan(labels.indexOf('用語集'));
  });
});

describe('サービス図鑑の詳細', () => {
  beforeEach(async () => {
    await resetDb();
    setup();
  });

  it('エントリのないサービスでも、名前・分類・演習への入口を出す', async () => {
    renderApp('/services/ebs');
    expect(await screen.findByRole('heading', { name: 'Amazon EBS', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/準備中/, { selector: '.notice' })).toBeInTheDocument();
    expect(screen.getByText(/ストレージ/, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'このサービスの問題を演習する' })).toHaveAttribute('href', '/practice?services=Amazon+EBS');
    expect(screen.queryByRole('button', { name: '読んだ' })).not.toBeInTheDocument();
  });

  it('台帳にない id は見つかりませんと表示する', async () => {
    renderApp('/services/no-such');
    expect(await screen.findByRole('heading', { name: '見つかりません' })).toBeInTheDocument();
  });

  it('事実を kind ごとにまとめ、発展は最後。未検証バッジと試験のポイント・ひっかけ注意を出す', async () => {
    renderApp('/services/s3');
    expect(await screen.findByRole('heading', { name: 'Amazon S3', level: 1 })).toBeInTheDocument();
    const headings = within(screen.getByRole('region', { name: '機能と制約' })).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.indexOf('機能')).toBeGreaterThanOrEqual(0);
    expect(headings[headings.length - 1]).toMatch(/^発展/);
    const ap = document.getElementById('fact-access-points')!;
    expect(ap).not.toHaveAttribute('open');
    expect(within(ap).getByText('未検証')).toBeInTheDocument();
    expect(within(ap).getByRole('complementary', { name: '試験のポイント' })).toHaveClass('callout', 'tip');
    expect(within(ap).getByRole('complementary', { name: 'ひっかけ注意' })).toHaveClass('callout', 'trap');
    expect(screen.getByText('未検証の事実 1 件')).toBeInTheDocument();
    // 選ばれる決め手: alternatives は他のエントリへのリンク
    expect(screen.getByRole('link', { name: 'Amazon EBS' })).toHaveAttribute('href', '/services/ebs');
    // 関連する事実（seeAlso）
    expect(screen.getByRole('link', { name: 'スポットの中断' })).toHaveAttribute('href', '/services/ec2?f=spot-interruption');
    // 関連する教材と比較
    expect(screen.getByRole('link', { name: 'S3 のストレージクラス' })).toHaveAttribute('href', '/lessons/lesson-4.1-s3');
    expect(screen.getByRole('link', { name: 'S3 の早見表' })).toHaveAttribute('href', '/docs/cheatsheet-s3');
    expect(screen.getByRole('link', { name: 'S3 と EBS' })).toHaveAttribute('href', '/services/compare/cmp-s3-ebs');
  });

  it('?f= が指す事実の details だけを開く（発展の事実でも）', async () => {
    renderApp('/services/s3?f=mfa-delete');
    await screen.findByRole('heading', { name: 'Amazon S3', level: 1 });
    expect(document.getElementById('fact-mfa-delete')).toHaveAttribute('open');
    expect(document.getElementById('fact-versioning')).not.toHaveAttribute('open');
    expect(document.getElementById('fact-mfa-delete')).toHaveClass('is-target');
  });

  it('hostedBy の子の id で開くと、親のエントリへ移り、子の名前を services に持つ事実を開く', async () => {
    renderApp('/services/ec2-spot');
    expect(await screen.findByRole('heading', { name: 'Amazon EC2', level: 1 })).toBeInTheDocument();
    expect(document.getElementById('fact-spot-interruption')).toHaveAttribute('open');
  });

  it('子の名前を持つ事実がなければ、親のエントリの先頭へ移る', async () => {
    setup({ 'catalog:ec2': entry('ec2', 2, [fact('ec2.other')], { seeAlso: [] }) });
    renderApp('/services/ec2-spot');
    expect(await screen.findByRole('heading', { name: 'Amazon EC2', level: 1 })).toBeInTheDocument();
    expect(document.querySelector('details[open]')).toBeNull();
  });
});

describe('サービス図鑑の比較', () => {
  beforeEach(async () => {
    await resetDb();
    setup();
  });

  it('観点ごとの値をサービスの列で出し、見分け方と根拠の事実へのリンクを付ける', async () => {
    renderApp('/services/compare/cmp-config-cloudtrail');
    expect(await screen.findByRole('heading', { name: 'AWS Config と AWS CloudTrail', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('API の呼び出しの記録なら CloudTrail')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'AWS Config' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'AWS CloudTrail' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /記録するもの/ })).toBeInTheDocument();
    expect(within(table).getByText('設定の履歴')).toHaveAttribute('data-label', 'AWS Config');
    expect(within(table).getByText('API の呼び出し')).toHaveAttribute('data-label', 'AWS CloudTrail');
    expect(within(table).getByRole('link', { name: 'バージョニング' })).toHaveAttribute('href', '/services/s3?f=versioning');
  });

  it('docRef だけの比較は、見分け方と早見表へのリンクを出す', async () => {
    renderApp('/services/compare/cmp-docs-only');
    expect(await screen.findByText('違いは早見表で確かめる')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'S3 の早見表' })).toHaveAttribute('href', '/docs/cheatsheet-s3');
  });

  it('ないものは見つかりませんと表示する', async () => {
    renderApp('/services/compare/cmp-none');
    expect(await screen.findByRole('heading', { name: '見つかりません' })).toBeInTheDocument();
  });
});

describe('ほかの画面からのリンク', () => {
  beforeEach(async () => {
    await resetDb();
    setup();
  });

  it('採点後に、問題の services のエントリと factRefs の事実へのリンクを出す（範囲外・除外された事実は出さない）', async () => {
    const user = userEvent.setup();
    renderApp('/practice');
    await user.click(await screen.findByRole('button', { name: /問を解く$/ }));
    await user.click(await screen.findByRole('radio', { name: /正しい選択肢/ }));
    await user.click(screen.getByRole('radio', { name: '確信' }));
    await user.click(screen.getByRole('button', { name: '回答する' }));
    expect(await screen.findByRole('heading', { name: 'サービス図鑑' })).toBeInTheDocument();
    const box = within(screen.getByRole('heading', { name: 'サービス図鑑' }).nextElementSibling as HTMLElement);
    expect(box.getByRole('link', { name: 'Amazon S3' })).toHaveAttribute('href', '/services/s3');
    expect(box.getByRole('link', { name: 'バージョニング' })).toHaveAttribute('href', '/services/s3?f=versioning');
    expect(box.getAllByRole('link')).toHaveLength(2);
  });

  it('台帳がなければ「サービス図鑑」欄を出さない', async () => {
    useFakeContent(makeContentFiles([q1]));
    const user = userEvent.setup();
    renderApp('/practice');
    await user.click(await screen.findByRole('button', { name: /問を解く$/ }));
    await user.click(await screen.findByRole('radio', { name: /正しい選択肢/ }));
    await user.click(screen.getByRole('radio', { name: '確信' }));
    await user.click(screen.getByRole('button', { name: '回答する' }));
    expect(await screen.findByRole('heading', { name: '解説' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'サービス図鑑' })).not.toBeInTheDocument();
  });

  it('早見表とレッスンの「扱うサービス」は図鑑へのリンクになる', async () => {
    setup({ 'lesson:lesson-4.1-s3': { id: 'lesson-4.1-s3', body: '## 本文' } });
    const first = renderApp('/docs/cheatsheet-s3');
    expect(await screen.findByRole('heading', { name: 'S3 の早見表', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amazon S3' })).toHaveAttribute('href', '/services/s3');
    first.unmount();
    renderApp('/lessons/lesson-4.1-s3');
    expect(await screen.findByRole('heading', { name: 'S3 のストレージクラス', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amazon S3' })).toHaveAttribute('href', '/services/s3');
  });

  it('弱点分析のサービス別の行に、図鑑へのリンクを出す（台帳にない名前には出さない）', async () => {
    await db.events.bulkAdd([answer('saa-1.1-t-001', false)]);
    renderApp('/analysis');
    expect(await screen.findByRole('link', { name: 'Amazon S3 の図鑑' })).toHaveAttribute('href', '/services/s3');
    expect(screen.getByText('AWS Local Zones')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'AWS Local Zones の図鑑' })).not.toBeInTheDocument();
  });

  it('用語集のバッジ: 台帳にあるサービスだけリンクにする', async () => {
    setup({
      glossary: [{ term: '例', en: 'Example', definition: 'テスト用の用語の定義です。', services: ['Amazon S3', '範囲外のサービス'], related: [] }],
    });
    renderApp('/glossary');
    expect(await screen.findByRole('link', { name: 'Amazon S3' })).toHaveAttribute('href', '/services/s3');
    expect(screen.getByText('範囲外のサービス')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '範囲外のサービス' })).not.toBeInTheDocument();
  });
});
