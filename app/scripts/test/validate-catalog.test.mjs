// @vitest-environment node
// validate と coverage の「サービス図鑑」の検査・集計（一時フォルダのフィクスチャで確かめる）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogHash } from '../../../scripts/lib/catalog.mjs';
import { computeCoverage, renderMarkdown } from '../../../scripts/coverage.mjs';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contentDir = path.join(repoRoot, 'content', 'saa-c03');

const TODAY = '2026-11-14';
const SRC = [{ title: 'Amazon S3 ユーザーガイド', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }];
// 事実の本文は、互いに似ないように 1 件ずつ違う文にする（catalog-near-duplicate を避ける）
const TEXTS = [
  'バケットのバージョニングを有効にすると、同じキーのオブジェクトを上書きや削除をしても過去の版を取り戻せるようになります。',
  'ライフサイクルの規則で、一定の日数がたったオブジェクトを安価な保存クラスへ移したり、期限が来たら削除したりできます。',
  'サーバー側の暗号化は既定で有効になっており、鍵の管理を AWS に任せるか、自分で管理する鍵を指定するかを選べます。',
  'クロスリージョンレプリケーションを使うと、別のリージョンのバケットへオブジェクトを非同期でコピーして冗長性を高められます。',
  '署名付き URL を発行すれば、認証情報を持たない相手にも、期限つきでオブジェクトの取得や書き込みを許可できます。',
  'リクエストの課金者をバケットの持ち主から要求者に切り替えると、データ転送の費用をダウンロードする側が負担します。',
];
const fact = (id, i = 0, over = {}) => ({
  id,
  title: '見出しの例',
  kind: 'feature',
  text: TEXTS[i % TEXTS.length],
  depth: 'core',
  sources: SRC,
  checkedAt: TODAY,
  ...over,
});
const entry = (id, over = {}) => ({
  id,
  tier: 2,
  summary: 'テスト用のエントリの概要です。何をするサービスかを、四十字以上二百字以内で書きます。',
  chooseWhen: [{ text: 'サーバーを管理せずに大量のデータを保存したい' }],
  avoidWhen: [{ text: 'ブロックストレージが必要なとき', alternatives: ['ebs'] }],
  facts: [0, 1, 2, 3].map((i) => fact(`${id}.f${i}`, i)),
  references: SRC,
  createdBy: 'sc1',
  createdAt: TODAY,
  ...over,
});
const comparison = (over = {}) => ({
  id: 'cmp-config-cloudtrail',
  title: 'AWS Config と AWS CloudTrail',
  services: ['config', 'cloudtrail'],
  decide: ['API の呼び出しの記録なら CloudTrail'],
  rows: [{ axis: '記録するもの', values: { config: '設定の履歴', cloudtrail: 'API の呼び出し' } }],
  sources: SRC,
  checkedAt: TODAY,
  createdBy: 'sc1',
  ...over,
});

const NEW_CODES = ['catalog-ref', 'catalog-entry', 'catalog-tier', 'catalog-stale-review', 'catalog-old-check', 'catalog-near-duplicate', 'catalog-needs'];
const tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// files: { 'catalog/services/s3.json': {...}, 'catalog/readme.txt': '文字列' }
function load(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-catalog-'));
  tmpDirs.push(root);
  const dir = path.join(root, 'content', 'saa-c03');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['blueprint.json', 'services.json']) fs.copyFileSync(path.join(contentDir, f), path.join(dir, f));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return checkContent(loadContent({ root }));
}
const codes = (c, level) => c.issues.filter((i) => !level || i.level === level).map((i) => i.code);
const errors = (c) => c.issues.filter((i) => i.level === 'error');
const good = () => ({ 'catalog/services/s3.json': entry('s3'), 'catalog/comparisons/cmp-config-cloudtrail.json': comparison() });

describe('validate: サービス図鑑', () => {
  it('図鑑のファイルがなければ、図鑑のコードを出さない', () => {
    const c = load();
    expect(errors(c)).toEqual([]);
    expect(codes(c).filter((x) => NEW_CODES.includes(x))).toEqual([]);
    expect(c.catalog.entries).toHaveLength(0);
  });

  it('正しい図鑑ならエラーが出ない', () => {
    const c = load(good());
    expect(errors(c)).toEqual([]);
    expect(c.catalog.entries).toHaveLength(1);
    expect(c.catalog.comparisons).toHaveLength(1);
    expect(codes(c, 'warning').filter((x) => x.startsWith('catalog-'))).toEqual([]);
  });

  it('参照切れを catalog-ref にする', () => {
    const e = entry('s3', { avoidWhen: [{ text: 'ブロックストレージが必要なとき', factRefs: ['s3.nothing'], alternatives: ['ebs'] }], lessonRefs: ['lesson-1.1-nothing'] });
    const c = load({ 'catalog/services/s3.json': e });
    const refs = c.issues.filter((i) => i.code === 'catalog-ref');
    expect(refs.every((i) => i.level === 'error')).toBe(true);
    expect(refs.some((i) => i.message.includes('s3.nothing'))).toBe(true);
    expect(refs.some((i) => i.message.includes('lesson-1.1-nothing'))).toBe(true);
  });

  it('台帳にないエントリと、hostedBy のサービスのエントリを catalog-entry にする', () => {
    const c = load({
      'catalog/services/not-a-service.json': entry('not-a-service'),
      'catalog/services/ec2-spot.json': entry('ec2-spot'),
    });
    const hits = c.issues.filter((i) => i.code === 'catalog-entry');
    expect(hits).toHaveLength(2);
  });

  it('catalog/ の配下の規則外のファイルを unexpected-file にする', () => {
    const c = load({
      ...good(),
      'catalog/readme.txt': 'メモ',
      'catalog/services/s3.md': '# メモ',
      'catalog/services/nested/ebs.json': entry('ebs'),
      'catalog/other/x.json': {},
    });
    const files = c.issues.filter((i) => i.code === 'unexpected-file').map((i) => i.file);
    expect(files).toEqual(
      expect.arrayContaining([
        'content/saa-c03/catalog/readme.txt',
        'content/saa-c03/catalog/services/s3.md',
        'content/saa-c03/catalog/services/nested/ebs.json',
        'content/saa-c03/catalog/other/x.json',
      ]),
    );
    expect(files).toHaveLength(4);
  });

  it('スキーマ違反を schema にする（4 種類のファイル）', () => {
    const c = load({
      'catalog/services/s3.json': { ...entry('s3'), tier: 9 },
      'catalog/comparisons/cmp-config-cloudtrail.json': { ...comparison(), services: ['config'] },
      'catalog-status.json': { s3: { status: 'maybe', checkedAt: TODAY, hash: 'zz' } },
      'catalog-needs.json': { source: 'テスト', items: [{ key: 'bad' }] },
    });
    const files = new Set(c.issues.filter((i) => i.code === 'schema').map((i) => i.file));
    expect(files).toEqual(
      new Set([
        'content/saa-c03/catalog/services/s3.json',
        'content/saa-c03/catalog/comparisons/cmp-config-cloudtrail.json',
        'content/saa-c03/catalog-status.json',
        'content/saa-c03/catalog-needs.json',
      ]),
    );
  });

  it('事実 id の重複を duplicate-id にする（ほかのエントリの事実や、同じファイル内）', () => {
    const c = load({
      'catalog/services/s3.json': entry('s3'),
      'catalog/services/ebs.json': entry('ebs', { facts: [fact('s3.f0', 0), fact('ebs.f1', 1), fact('ebs.f1', 2)] }),
    });
    const dups = c.issues.filter((i) => i.code === 'duplicate-id');
    expect(dups.some((i) => i.message.includes('s3.f0') && i.message.includes('ebs.json'))).toBe(true);
    expect(dups.some((i) => i.message.includes('ebs.f1') && i.message.includes('同じファイル内'))).toBe(true);
  });

  it('比較 id の重複を duplicate-id にする', () => {
    const c = load({
      'catalog/comparisons/cmp-config-cloudtrail.json': comparison(),
      'catalog/comparisons/cmp-other.json': comparison({ id: 'cmp-config-cloudtrail' }),
    });
    expect(c.issues.some((i) => i.code === 'duplicate-id' && i.message.includes('cmp-config-cloudtrail'))).toBe(true);
  });

  it('事実の services の別名を service-alias にする', () => {
    const e = entry('s3');
    e.facts[0] = fact('s3.f0', 0, { services: ['Amazon Simple Storage Service'] });
    const c = load({ 'catalog/services/s3.json': e });
    const alias = c.issues.filter((i) => i.code === 'service-alias');
    expect(alias).toHaveLength(1);
    expect(alias[0].message).toContain('Amazon S3');
  });

  it('事実の本文の試験範囲外のサービス名と、似すぎた本文を警告にする', () => {
    const e = entry('s3');
    e.facts[0] = fact('s3.f0', 0, { text: 'AWS CodeBuild と連携して通知を送る設定を行うと、ビルドの担当者へオブジェクトの更新を知らせることができます。' });
    e.facts[1] = fact('s3.f1', 1, { text: TEXTS[2] });
    e.facts[2] = fact('s3.f2', 2, { text: TEXTS[2] });
    const c = load({ 'catalog/services/s3.json': e });
    expect(c.issues.some((i) => i.code === 'out-of-scope-mention' && i.message.includes('s3.f0'))).toBe(true);
    expect(c.issues.some((i) => i.code === 'catalog-near-duplicate' && i.message.includes('s3.f2') && i.message.includes('s3.f1'))).toBe(true);
    expect(errors(c)).toEqual([]);
  });

  it('検証後に内容が変わった項目を catalog-stale-review にし、不明なキーを review-status-key にする', () => {
    const e = entry('s3');
    const status = {
      's3.f0': { status: 'verified', checkedAt: TODAY, hash: 'abcdef012345' },
      's3.f1': { status: 'verified', checkedAt: TODAY, hash: catalogHash('fact', e.facts[1]) },
      's3.gone': { status: 'verified', checkedAt: TODAY, hash: 'abcdef012345' },
    };
    const c = load({ 'catalog/services/s3.json': e, 'catalog-status.json': status });
    const stale = c.issues.filter((i) => i.code === 'catalog-stale-review');
    expect(stale).toHaveLength(1);
    expect(stale[0].message).toContain('s3.f0');
    expect(stale[0].message).not.toContain('s3.f1');
    expect(c.issues.some((i) => i.code === 'review-status-key' && i.message.includes('s3.gone'))).toBe(true);
  });
});

describe('coverage: サービス図鑑', () => {
  const needsItem = (n, over = {}) => ({
    key: `saa-1.1-ex-00${n}/a`,
    task: '1.1',
    side: 'correct',
    gap: 'none',
    knowledge: `不足の知識 ${n} のテスト用の説明`,
    ...over,
  });

  it('図鑑がなければ「エントリはまだありません」と 127 サービスの集計を出す', () => {
    const cov = computeCoverage(load(), { today: TODAY });
    expect(cov.catalog.present).toBe(false);
    expect(cov.catalog.totals).toMatchObject({ services: 127, entries: 0, withoutEntry: 127 });
    const md = renderMarkdown(cov);
    expect(md).toContain('図鑑のエントリはまだありません');
    expect(md).toContain('エントリのないサービス（127 件）');
  });

  it('エントリの網羅と不足の対応を出す', () => {
    const e = entry('s3');
    const files = {
      ...good(),
      'catalog-status.json': { 's3.f0': { status: 'verified', checkedAt: TODAY, hash: catalogHash('fact', e.facts[0]) } },
      'catalog-needs.json': {
        source: 'テスト',
        items: [
          needsItem(1, { decision: 'fact', factRefs: ['s3.f0'] }),
          needsItem(2, { decision: 'fact', factRefs: ['s3.f1'] }),
          needsItem(3, { decision: 'question' }),
          needsItem(4, { decision: 'skip', note: '範囲外のため' }),
          needsItem(5),
        ],
      },
    };
    const c = load(files);
    expect(errors(c)).toEqual([]);
    const cov = computeCoverage(c, { today: TODAY });
    const cat = cov.catalog;
    expect(cat.present).toBe(true);
    expect(cat.totals).toMatchObject({ entries: 1, withoutEntry: 126, facts: 4, core: 4, detail: 0, comparisons: 1 });
    expect(cat.totals.factStatus).toMatchObject({ verified: 1, pending: 3 });
    const s3 = cat.services.find((r) => r.id === 's3');
    expect(s3).toMatchObject({ hasEntry: true, tier: 2, core: 4, detail: 0, comparisons: 0 });
    expect(cat.needs.tasks).toEqual([
      { task: '1.1', total: 5, allVerified: 1, withFacts: 2, none: 3, lesson: 0, question: 1, skip: 1, undecided: 1 },
    ]);
    expect(cat.needs.questionItems.map((q) => q.key)).toEqual(['saa-1.1-ex-003/a']);
    expect(cat.appearances.rows.find((r) => r.id === 's3').facts).toBe(4);

    const md = renderMarkdown(cov);
    expect(md).toContain('## サービス図鑑');
    expect(md).toContain('### エントリの一覧');
    expect(md).toContain('| Amazon S3 | 2 | 4 | 0 | 0 |');
    expect(md).toContain('### 不足の対応');
    expect(md).toContain('| 1.1 | 5 | 1 | 2 | 3 | 0 | 1 | 1 | 1 |');
    expect(md).toContain('saa-1.1-ex-003/a');
  });

  it('checkedAt が古い事実を再確認リストに出す', () => {
    const e = entry('s3');
    e.facts[0] = fact('s3.f0', 0, { kind: 'quota', checkedAt: '2026-01-01' });
    e.facts[1] = fact('s3.f1', 1, { kind: 'feature', checkedAt: '2026-01-01' });
    const cov = computeCoverage(load({ 'catalog/services/s3.json': e }), { today: TODAY });
    expect(cov.catalog.recheck.map((r) => r.id)).toEqual(['s3.f0']);
    expect(renderMarkdown(cov)).toContain('s3.f0');
  });
});
