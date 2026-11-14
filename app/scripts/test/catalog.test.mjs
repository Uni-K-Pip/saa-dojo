// @vitest-environment node
// サービス図鑑のスキーマ（scripts/lib/schema.mjs）と共通処理（scripts/lib/catalog.mjs）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CatalogComparisonSchema,
  CatalogEntrySchema,
  CatalogNeedsSchema,
  CatalogStatusSchema,
  QuestionSchema,
} from '../../../scripts/lib/schema.mjs';
import { buildCatalogModel, catalogHash, checkCatalog, effectiveStatus, entryIdForName, parseCatalogLinks } from '../../../scripts/lib/catalog.mjs';
import { buildServiceIndex } from '../../../scripts/lib/service-registry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contentDir = path.join(repoRoot, 'content', 'saa-c03');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(contentDir, rel), 'utf8'));
const serviceIndex = buildServiceIndex(readJson('blueprint.json'), readJson('services.json'));

const SRC = [{ title: 'Amazon S3 ユーザーガイド', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }];
const fact = (id, over = {}) => ({
  id,
  title: '見出しの例',
  kind: 'feature',
  text: 'これはテスト用の事実の本文です。出典で確かめた内容だけを、それだけで意味が通るように書きます。',
  depth: 'core',
  sources: SRC,
  checkedAt: '2026-11-14',
  ...over,
});
const entry = (id, over = {}) => ({
  id,
  tier: 2,
  summary: 'テスト用のエントリの概要です。何をするサービスかを、四十字以上二百字以内で書きます。',
  chooseWhen: [{ text: 'サーバーを管理せずに大量のデータを保存したい' }],
  avoidWhen: [{ text: 'ブロックストレージが必要なとき', alternatives: ['ebs'] }],
  facts: [fact(`${id}.alpha`), fact(`${id}.beta`), fact(`${id}.gamma`), fact(`${id}.delta`)],
  references: SRC,
  createdBy: 'sc1',
  createdAt: '2026-11-14',
  ...over,
});
const comparison = (over = {}) => ({
  id: 'cmp-config-cloudtrail',
  title: 'AWS Config と AWS CloudTrail',
  services: ['config', 'cloudtrail'],
  decide: ['API の呼び出しの記録なら CloudTrail'],
  rows: [{ axis: '記録するもの', values: { config: '設定の履歴', cloudtrail: 'API の呼び出し' } }],
  sources: SRC,
  checkedAt: '2026-11-14',
  createdBy: 'sc1',
  ...over,
});
const issues = (r) => (r.success ? [] : r.error.issues.map((i) => i.message));

describe('図鑑のスキーマ', () => {
  it('正しいエントリ・比較を受け付ける', () => {
    expect(issues(CatalogEntrySchema.safeParse(entry('s3')))).toEqual([]);
    expect(issues(CatalogComparisonSchema.safeParse(comparison()))).toEqual([]);
  });

  it('事実の接頭辞・重複・自分への seeAlso を拒む', () => {
    const bad = entry('s3', { facts: [fact('iam.alpha'), fact('s3.beta'), fact('s3.beta')], seeAlso: ['s3.beta'] });
    const msgs = issues(CatalogEntrySchema.safeParse(bad));
    expect(msgs.some((m) => m.includes('iam.alpha'))).toBe(true);
    expect(msgs.some((m) => m.includes('重複'))).toBe(true);
    expect(msgs.some((m) => m.includes('seeAlso'))).toBe(true);
  });

  it('比較は rows と docRef のどちらか一方だけで、values は services の全員分', () => {
    expect(issues(CatalogComparisonSchema.safeParse(comparison({ docRef: 'cheatsheet-x1' }))).some((m) => m.includes('一方'))).toBe(true);
    expect(issues(CatalogComparisonSchema.safeParse(comparison({ rows: undefined }))).some((m) => m.includes('一方'))).toBe(true);
    const partial = comparison({ rows: [{ axis: '記録', values: { config: '設定' } }] });
    expect(issues(CatalogComparisonSchema.safeParse(partial)).some((m) => m.includes('全員分'))).toBe(true);
  });

  it('検証状態のキーと、不足の対応表の decision の条件', () => {
    expect(CatalogStatusSchema.safeParse({ s3: { status: 'verified', checkedAt: '2026-11-14', hash: 'abcdef012345' } }).success).toBe(true);
    expect(CatalogStatusSchema.safeParse({ 'S3!': { status: 'verified', checkedAt: '2026-11-14', hash: 'abcdef012345' } }).success).toBe(false);
    const item = { key: 'saa-1.1-w2m-003/c', task: '1.1', side: 'correct', gap: 'none', knowledge: '知識の例です' };
    expect(CatalogNeedsSchema.safeParse({ source: 'test', items: [item] }).success).toBe(true);
    expect(CatalogNeedsSchema.safeParse({ source: 'test', items: [{ ...item, decision: 'fact' }] }).success).toBe(false);
    expect(CatalogNeedsSchema.safeParse({ source: 'test', items: [{ ...item, decision: 'skip' }] }).success).toBe(false);
    expect(CatalogNeedsSchema.safeParse({ source: 'test', items: [{ ...item, decision: 'skip', note: '範囲外' }] }).success).toBe(true);
  });

  it('問題は factRefs を任意で持てる（既存の問題はそのまま通る）', () => {
    const file = path.join(contentDir, 'questions', 'd4', '4.1');
    const name = fs.readdirSync(file).find((f) => f.endsWith('.json'));
    const q = JSON.parse(fs.readFileSync(path.join(file, name), 'utf8'));
    expect(QuestionSchema.safeParse(q).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...q, factRefs: ['s3.access-points'] }).success).toBe(true);
    expect(QuestionSchema.safeParse({ ...q, factRefs: ['not a fact'] }).success).toBe(false);
  });
});

describe('検証状態のハッシュ', () => {
  it('本文が変わると変わり、分類や確認日だけの変更では変わらない', () => {
    const f = fact('s3.alpha', { tags: ['a'], services: ['Amazon S3'] });
    const h = catalogHash('fact', f);
    expect(catalogHash('fact', { ...f, tags: ['b'], services: [], checkedAt: '2027-01-01', kind: 'quota' })).toBe(h);
    expect(catalogHash('fact', { ...f, text: `${f.text}追記` })).not.toBe(h);
    expect(catalogHash('fact', { ...f, depth: 'detail' })).not.toBe(h);
  });

  it('記録がない・内容が変わった項目は pending として扱う', () => {
    const f = fact('s3.alpha');
    expect(effectiveStatus({}, 's3.alpha', 'fact', f)).toMatchObject({ status: 'pending', recorded: false });
    const status = { 's3.alpha': { status: 'verified', checkedAt: '2026-11-14', hash: catalogHash('fact', f) } };
    expect(effectiveStatus(status, 's3.alpha', 'fact', f)).toMatchObject({ status: 'verified', stale: false });
    expect(effectiveStatus(status, 's3.alpha', 'fact', { ...f, title: '別の見出し' })).toMatchObject({ status: 'pending', stale: true });
  });
});

describe('本文のリンクとサービス名', () => {
  it('#/services/… のリンクを拾う', () => {
    const links = parseCatalogLinks('[a](#/services/s3?f=access-points) [b](#/services/iam) [c](#/services/compare/cmp-x-y)');
    expect(links).toEqual([
      { kind: 'entry', id: 's3', slug: 'access-points', raw: '#/services/s3?f=access-points', extra: undefined },
      { kind: 'entry', id: 'iam', slug: undefined, raw: '#/services/iam', extra: undefined },
      { kind: 'comparison', id: 'cmp-x-y', raw: '#/services/compare/cmp-x-y' },
    ]);
  });

  it('サービス名から扱うエントリを引く（hostedBy は親）', () => {
    expect(entryIdForName(serviceIndex, 'Amazon Simple Storage Service')).toBe('s3');
    expect(entryIdForName(serviceIndex, 'Amazon EC2 Spot Instances')).toBe('ec2');
    expect(entryIdForName(serviceIndex, 'そんなサービスはない')).toBeNull();
  });
});

describe('checkCatalog', () => {
  const base = (over = {}) => {
    const entries = over.entries ?? [{ file: 'catalog/services/s3.json', data: entry('s3') }];
    const comparisons = over.comparisons ?? [];
    const model = buildCatalogModel({ entries, comparisons, serviceIndex });
    return checkCatalog(model, { serviceIndex, lessonIds: new Set(['lesson-4.1-x1']), docIds: new Set(['cheatsheet-x1']), ...over.ctx });
  };
  const codes = (list, level) => list.filter((p) => !level || p.level === level).map((p) => p.code);

  it('参照がそろっていればエラーは出ない', () => {
    expect(codes(base(), 'error')).toEqual([]);
  });

  it('存在しない参照をエラーにする', () => {
    const e = entry('s3', {
      seeAlso: ['iam.nothing'],
      chooseWhen: [{ text: 'サーバーを管理せずに大量のデータを保存したい', factRefs: ['s3.nothing'], alternatives: ['no-such'] }],
      lessonRefs: ['lesson-4.1-zz'],
      docRefs: ['cheatsheet-zz'],
    });
    const out = base({
      entries: [{ file: 'catalog/services/s3.json', data: e }],
      comparisons: [{ file: 'catalog/comparisons/cmp-config-cloudtrail.json', data: comparison({ rows: [{ axis: '記録', values: { config: 'a', cloudtrail: 'b' }, factRefs: ['config.zz'] }] }) }],
      ctx: {
        questions: [{ file: 'questions/q.json', data: { factRefs: ['s3.alpha', 's3.zz'] } }],
        markdown: [{ file: 'lessons/l.md', text: '[a](#/services/s3?f=alpha) [b](#/services/s3?f=zz) [c](#/services/nope) [d](#/services/compare/cmp-none)' }],
      },
    });
    const msgs = out.filter((p) => p.code === 'catalog-ref').map((p) => p.message);
    for (const want of ['iam.nothing', 's3.nothing', 'no-such', 'lesson-4.1-zz', 'cheatsheet-zz', 'config.zz', 's3.zz', 'nope', 'cmp-none']) {
      expect(msgs.some((m) => m.includes(want)), want).toBe(true);
    }
    expect(msgs.some((m) => m.includes('s3.alpha'))).toBe(false);
  });

  it('台帳にない id・hostedBy のサービス・ファイル名の違いをエラーにする', () => {
    const out = base({
      entries: [
        { file: 'catalog/services/unknown-svc.json', data: entry('unknown-svc') },
        { file: 'catalog/services/ec2-spot.json', data: entry('ec2-spot') },
        { file: 'catalog/services/other.json', data: entry('s3') },
      ],
    });
    expect(out.filter((p) => p.code === 'catalog-entry').length).toBe(2);
    expect(codes(out)).toContain('path-mismatch');
  });

  it('子のサービスの id で書いた本文のリンクは、親のエントリの事実を探す', () => {
    const out = base({
      entries: [{ file: 'catalog/services/ec2.json', data: entry('ec2') }],
      ctx: { markdown: [{ file: 'lessons/l.md', text: '[spot](#/services/ec2-spot?f=alpha)' }] },
    });
    expect(codes(out, 'error')).toEqual([]);
  });

  it('検証状態: 存在しないキーはエラー、内容が変わった項目は警告', () => {
    const e = entry('s3');
    const status = {
      s3: { status: 'verified', checkedAt: '2026-11-14', hash: catalogHash('entry', e) },
      's3.alpha': { status: 'verified', checkedAt: '2026-11-14', hash: '000000000000' },
      's3.ghost': { status: 'verified', checkedAt: '2026-11-14', hash: '000000000000' },
    };
    const out = base({ entries: [{ file: 'catalog/services/s3.json', data: e }], ctx: { status, statusFile: 'catalog-status.json' } });
    expect(out.find((p) => p.code === 'review-status-key')?.message).toContain('s3.ghost');
    expect(out.find((p) => p.code === 'catalog-stale-review')?.message).toContain('s3.alpha');
  });

  it('区分の目安・確認日の古さ・未決の不足を警告にまとめる', () => {
    const thin = entry('iam', { tier: 1, facts: [fact('iam.alpha', { kind: 'quota', checkedAt: '2026-01-01' })], avoidWhen: undefined });
    const out = base({
      entries: [{ file: 'catalog/services/iam.json', data: thin }],
      ctx: {
        today: '2026-11-14',
        needs: { file: 'catalog-needs.json', data: { source: 't', items: [{ key: 'saa-1.1-w2m-003/c', task: '1.1', side: 'correct', gap: 'none', knowledge: '知識' }] } },
      },
    });
    const warns = out.filter((p) => p.level === 'warning');
    expect(warns.filter((p) => p.code === 'catalog-tier').map((p) => p.message).join('\n')).toMatch(/区分 1 .*iam\(1\)[\s\S]*chooseWhen か avoidWhen がない.*iam/);
    expect(warns.find((p) => p.code === 'catalog-old-check')?.message).toContain('iam.alpha');
    expect(warns.find((p) => p.code === 'catalog-needs')?.message).toContain('1 件');
  });
});
