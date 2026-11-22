import { describe, expect, it } from 'vitest';
import type { CatalogIndex, CatalogIndexService, ServiceEntry } from '../content/types';
import { event } from '../test/fixtures';
import { makeBackup, parseBackup } from './backup';
import { makeServiceLinker, questionCatalogLinks, resolveFactLinks, splitFactId } from './catalog';
import { catalogReadMap } from './progress';
import { searchCatalog } from './search';
import { parseSyncFile, toSyncFiles } from './sync';

const row = (id: string, name: string, over: Partial<CatalogIndexService> = {}): CatalogIndexService => ({
  id,
  name,
  aliases: [],
  category: 'ストレージ',
  children: [],
  facts: [],
  tasks: [],
  related: { lessons: [], docs: [], glossary: 0, flashcards: 0, questions: 0 },
  comparisons: [],
  ...over,
});
const fact = (id: string, title: string, tags: string[] = []) => ({ id, title, kind: 'feature' as const, depth: 'core' as const, tags, status: 'verified' as const });

const services = [
  row('ebs', 'Amazon EBS', { aliases: ['Elastic Block Store'] }),
  row('s3', 'Amazon S3', {
    short: 'S3',
    aliases: ['Amazon Simple Storage Service'],
    summary: 'オブジェクトストレージ。ほぼ無制限に保存できる。',
    facts: [fact('s3.access-points', 'S3 アクセスポイント', ['VPC']), fact('s3.versioning', 'バージョニング')],
  }),
  row('ec2', 'Amazon EC2', { children: [{ id: 'ec2-spot', name: 'Amazon EC2 Spot Instances', aliases: ['EC2 Spot Instances'] }] }),
];

describe('searchCatalog', () => {
  it('空の検索語なら全件（事実の見出しは添えない）', () => {
    const hits = searchCatalog(services, '  ');
    expect(hits.map((h) => h.service.id)).toEqual(['ebs', 's3', 'ec2']);
    expect(hits.every((h) => h.facts.length === 0)).toBe(true);
  });

  it('名前・別名・short・子の名前・summary で探す（全角半角・大文字小文字を区別しない）', () => {
    expect(searchCatalog(services, 'ｓ３').map((h) => h.service.id)).toEqual(['s3']);
    expect(searchCatalog(services, 'simple storage').map((h) => h.service.id)).toEqual(['s3']);
    expect(searchCatalog(services, 'spot').map((h) => h.service.id)).toEqual(['ec2']);
    expect(searchCatalog(services, 'ELASTIC block').map((h) => h.service.id)).toEqual(['ebs']);
    expect(searchCatalog(services, 'オブジェクト').map((h) => h.service.id)).toEqual(['s3']);
  });

  it('事実の見出し・タグに当たると、その事実を返す。名前に当たったときは返さない', () => {
    const byTitle = searchCatalog(services, 'アクセスポイント');
    expect(byTitle.map((h) => h.service.id)).toEqual(['s3']);
    expect(byTitle[0]!.facts.map((f) => f.id)).toEqual(['s3.access-points']);
    expect(searchCatalog(services, 'vpc')[0]!.facts.map((f) => f.id)).toEqual(['s3.access-points']);
    expect(searchCatalog(services, 's3 アクセス')[0]!.facts.map((f) => f.id)).toEqual(['s3.access-points']);
    expect(searchCatalog(services, 's3')[0]!.facts).toEqual([]);
  });

  it('名前に当たったものを、事実だけに当たったものより先に並べる', () => {
    const list = [row('a', 'Amazon A', { facts: [fact('a.s3-copy', 'S3 へのコピー')] }), row('s3', 'Amazon S3')];
    expect(searchCatalog(list, 's3').map((h) => h.service.id)).toEqual(['s3', 'a']);
  });

  it('事実の本文は探さない（索引に本文がない）', () => {
    expect(searchCatalog(services, '本文にだけある語')).toEqual([]);
  });
});

describe('catalogReadMap', () => {
  it('エントリごとに最後の「読んだ」の時刻を求める。レッスンの読了は混ぜない', () => {
    const events = [
      event('catalog-read', { serviceId: 's3' }, 100),
      event('catalog-read', { serviceId: 's3' }, 300),
      event('catalog-read', { serviceId: 'ec2' }, 200),
      event('lesson-read', { lessonId: 'lesson-1.1-x' }, 400),
    ];
    expect([...catalogReadMap(events)]).toEqual([
      ['s3', 300],
      ['ec2', 200],
    ]);
  });
});

describe('学習記録の書き出し・同期は新しい種類のイベントを通す', () => {
  const e = event('catalog-read', { serviceId: 's3' }, 1_700_000_000_000);
  it('バックアップ', () => {
    const r = parseBackup(JSON.stringify(makeBackup([e], 'dev', 1_700_000_000_000)));
    expect(r).toMatchObject({ ok: true, skipped: 0 });
    expect(r.ok && r.events).toEqual([e]);
  });
  it('同期', () => {
    const files = toSyncFiles([e]);
    const parsed = parseSyncFile(Object.values(files).join(''));
    expect(parsed).toEqual({ events: [e], skipped: 0 });
  });
});

describe('サービス名 → 図鑑のエントリ id', () => {
  const entry = (id: string, name: string, over: Partial<ServiceEntry> = {}): ServiceEntry => ({ id, name, aliases: [], category: 'x', source: 'inScope', ...over });
  const registry = [
    entry('ec2', 'Amazon EC2', { aliases: ['EC2'] }),
    entry('ec2-spot', 'Amazon EC2 Spot Instances', { aliases: ['EC2 Spot Instances'], hostedBy: 'ec2' }),
    entry('s3', 'Amazon S3', { aliases: ['S3'] }),
    entry('orphan', 'Orphan Child', { hostedBy: 'missing-parent' }),
  ];
  const link = makeServiceLinker(registry);

  it('正規名・別名から引き、hostedBy の子は親のエントリにする', () => {
    expect(link('Amazon S3')).toBe('s3');
    expect(link('s3')).toBe('s3');
    expect(link('Amazon EC2 Spot Instances')).toBe('ec2');
    expect(link('EC2 Spot Instances')).toBe('ec2');
  });
  it('範囲外・不明の名前や、親が台帳にない子は null', () => {
    expect(link('AWS Local Zones')).toBeNull();
    expect(link('')).toBeNull();
    expect(link('Orphan Child')).toBeNull();
  });
  it('問題の services からは、エントリごとに 1 つのリンクを作る', () => {
    expect(questionCatalogLinks(['Amazon EC2', 'Amazon EC2 Spot Instances', 'AWS Local Zones', 'Amazon S3'], registry, link)).toEqual([
      { id: 'ec2', name: 'Amazon EC2' },
      { id: 's3', name: 'Amazon S3' },
    ]);
  });
});

describe('事実への参照', () => {
  const index: CatalogIndex = { services, comparisons: [] };
  it('事実 id を分ける', () => {
    expect(splitFactId('s3.access-points')).toEqual({ entryId: 's3', slug: 'access-points' });
    expect(splitFactId('nodot')).toBeNull();
  });
  it('一覧に残っている事実だけをリンクにする', () => {
    expect(resolveFactLinks(['s3.versioning', 's3.gone', 'bad'], index)).toEqual([
      { id: 's3.versioning', title: 'バージョニング', entryId: 's3', slug: 'versioning' },
    ]);
    expect(resolveFactLinks(undefined, index)).toEqual([]);
  });
});
