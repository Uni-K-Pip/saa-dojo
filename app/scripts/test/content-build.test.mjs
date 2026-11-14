// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as schema from '../../../scripts/lib/schema.mjs';
import { buildOutputs, classify, parseContent, writeOutputs } from '../lib/content-build.mjs';
import { catalogHash } from '../../../scripts/lib/catalog.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contentDir = path.resolve(appDir, '../content/saa-c03');
const read = (rel) => fs.readFileSync(path.join(contentDir, rel), 'utf8');

const baseQuestion = JSON.parse(read('questions/d1/1.1/saa-1.1-ex-001.json'));
const lesson = read('lessons/d4/lesson-4.1-s3-storage-classes.md');

function question(id, over = {}) {
  return { ...baseQuestion, id, createdBy: id.split('-')[2], ...over };
}

function files(questions, extra = []) {
  return [
    { rel: 'blueprint.json', text: read('blueprint.json') },
    ...questions.map((q) => ({ rel: `questions/d1/1.1/${q.id}.json`, text: JSON.stringify(q) })),
    ...extra,
  ];
}

describe('コンテンツのビルド', () => {
  it('検証状態で問題を絞り、プールごとに分けて出力する', () => {
    const qs = [
      question('saa-1.1-a-001'),
      question('saa-1.1-a-002'),
      question('saa-1.1-a-003'),
      question('saa-1.1-a-004', { pool: 'mockA' }),
      question('saa-1.1-a-005', { pool: 'mockB' }),
      question('saa-1.1-a-006'),
    ];
    const status = {
      'saa-1.1-a-001': { status: 'verified', checkedAt: '2026-11-04' },
      'saa-1.1-a-002': { status: 'needs-fix', checkedAt: '2026-11-04' },
      'saa-1.1-a-003': { status: 'rejected', checkedAt: '2026-11-04' },
    };
    const parsed = parseContent(files(qs, [{ rel: 'review-status.json', text: JSON.stringify(status) }]), schema);
    expect(parsed.errors).toEqual([]);
    const { files: out, manifest } = buildOutputs(parsed, schema);
    const byKey = (key) => JSON.parse(out.find((f) => f.rel === manifest.files[key].path).text);

    expect(manifest.counts.questions).toEqual({ practice: 2, basics: 0, mockA: 1, mockB: 1 });
    expect(manifest.counts.excluded).toEqual({ 'needs-fix': 1, rejected: 1 });
    const d1 = byKey('practice-d1');
    expect(d1.map((q) => q.id)).toEqual(['saa-1.1-a-001', 'saa-1.1-a-006']);
    expect(d1.map((q) => q.status)).toEqual(['verified', 'pending']);
    expect(byKey('mock-a').map((q) => q.id)).toEqual(['saa-1.1-a-004']);
    expect(byKey('mock-b').map((q) => q.id)).toEqual(['saa-1.1-a-005']);
    expect(byKey('practice-d2')).toEqual([]);
    const index = byKey('index');
    expect(index.map((q) => q.id)).toEqual(['saa-1.1-a-001', 'saa-1.1-a-004', 'saa-1.1-a-005', 'saa-1.1-a-006']);
    expect(index[0]).not.toHaveProperty('stem');
    expect(byKey('blueprint').mockComposition).toEqual({ 1: 20, 2: 17, 3: 15, 4: 13 });
  });

  it('サービス台帳があれば services 欄を正規名にそろえ、台帳の要約も出力する', () => {
    const qs = [
      question('saa-1.1-a-001', { services: ['Amazon Simple Storage Service', 'Amazon S3', 'AWS Local Zones'] }),
      question('saa-1.1-a-002', { services: ['AWS Key Management Service'] }),
    ];
    const parsed = parseContent(files(qs, [{ rel: 'services.json', text: read('services.json') }]), schema);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings.filter((w) => w.startsWith('services.json'))).toEqual([]);
    const { files: out, manifest } = buildOutputs(parsed, schema);
    const byKey = (key) => JSON.parse(out.find((f) => f.rel === manifest.files[key].path).text);

    const index = byKey('index');
    // 重複は除き、試験範囲に解決できない表記はそのまま残す
    expect(index[0].services).toEqual(['Amazon S3', 'AWS Local Zones']);
    expect(index[1].services).toEqual(['AWS Key Management Service (AWS KMS)']);
    expect(byKey('practice-d1')[0].services).toEqual(['Amazon S3', 'AWS Local Zones']);
    const services = byKey('services');
    expect(manifest.counts.services).toBe(services.length);
    expect(services.find((e) => e.id === 's3')).toMatchObject({ name: 'Amazon S3', source: 'inScope' });
  });

  it('サービス台帳がなければ services 欄を書かれたまま出力する', () => {
    const qs = [question('saa-1.1-a-001', { services: ['Amazon Simple Storage Service'] })];
    const parsed = parseContent(files(qs), schema);
    expect(parsed.errors).toEqual([]);
    const { files: out, manifest } = buildOutputs(parsed, schema);
    expect(manifest.files.services).toBeUndefined();
    expect(manifest.counts.services).toBe(0);
    const index = JSON.parse(out.find((f) => f.rel === manifest.files.index.path).text);
    expect(index[0].services).toEqual(['Amazon Simple Storage Service']);
  });

  it('レッスンの確認問題に保留模試の問題を含めない', () => {
    const qs = [
      question('saa-1.1-a-001', { lessonRefs: ['lesson-4.1-s3-storage-classes'] }),
      question('saa-1.1-a-002', { lessonRefs: ['lesson-4.1-s3-storage-classes'], pool: 'mockA' }),
    ];
    const body = `${lesson}\n- \`saa-1.1-a-002\`\n- \`saa-9.9-zz-999\``;
    const parsed = parseContent(files(qs, [{ rel: 'lessons/d4/lesson-4.1-s3-storage-classes.md', text: body }]), schema);
    expect(parsed.errors).toEqual([]);
    const { files: out, manifest } = buildOutputs(parsed, schema);
    const lessons = JSON.parse(out.find((f) => f.rel === manifest.files.lessons.path).text);
    expect(lessons[0].questionIds).toEqual(['saa-1.1-a-001']);
    expect(manifest.files['lesson:lesson-4.1-s3-storage-classes'].path).toMatch(/^lessons\/lesson-4\.1-s3-storage-classes\.[0-9a-f]{12}\.json$/);
  });

  it('壊れたファイル・スキーマ違反・ID の重複はエラーにする', () => {
    const bad = { ...question('saa-1.1-a-002'), difficulty: 9 };
    const parsed = parseContent(
      files([question('saa-1.1-a-001'), bad], [
        { rel: 'questions/d1/1.1/saa-1.1-a-003.json', text: '{ broken' },
        { rel: 'questions/d1/1.2/saa-1.1-a-001.json', text: JSON.stringify(question('saa-1.1-a-001')) },
      ]),
      schema,
    );
    expect(parsed.errors.some((e) => e.includes('saa-1.1-a-002') && e.includes('difficulty'))).toBe(true);
    expect(parsed.errors.some((e) => e.includes('saa-1.1-a-003') && e.includes('JSON'))).toBe(true);
    expect(parsed.errors.some((e) => e.includes('重複'))).toBe(true);
  });

  it('blueprint にない項目を参照する問題はエラーにする', () => {
    const parsed = parseContent(files([question('saa-1.1-a-001', { knowledgeRefs: ['1.1-K99'] })]), schema);
    expect(parsed.errors.some((e) => e.includes('1.1-K99'))).toBe(true);
  });

  it('出力は内容が同じなら同じ（ハッシュ付きのファイル名）', () => {
    const p = parseContent(files([question('saa-1.1-a-001')]), schema);
    const a = buildOutputs(p, schema);
    const b = buildOutputs(p, schema);
    expect(a.manifest.contentHash).toBe(b.manifest.contentHash);
    expect(a.files.map((f) => f.rel)).toEqual(b.files.map((f) => f.rel));
  });

  it('出力先に見知らぬファイルがあるときは消さない', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-out-'));
    fs.writeFileSync(path.join(dir, 'important.txt'), 'keep');
    const p = parseContent(files([question('saa-1.1-a-001')]), schema);
    expect(() => writeOutputs(dir, buildOutputs(p, schema))).toThrow();
    expect(fs.existsSync(path.join(dir, 'important.txt'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('CLI で実際のコンテンツを書き出せる', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-cli-'));
    const out = path.join(dir, 'data');
    execFileSync(process.execPath, [path.join(appDir, 'scripts/build-content.mjs'), '--out', out, '--quiet'], { stdio: 'pipe' });
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
    expect(manifest.format).toBe('saa-dojo-content');
    for (const f of Object.values(manifest.files)) expect(fs.existsSync(path.join(out, f.path))).toBe(true);
    // 2 回目も同じ出力先に書ける（前回の出力を消してから書く）
    execFileSync(process.execPath, [path.join(appDir, 'scripts/build-content.mjs'), '--out', out, '--quiet'], { stdio: 'pipe' });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------- サービス図鑑 ----------
const SRC = [{ title: 'Amazon S3 ユーザーガイド', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }];
const catFact = (id, over = {}) => ({
  id,
  title: `見出し ${id}`,
  kind: 'feature',
  text: 'これはテスト用の事実の本文です。出典で確かめた内容だけを、それだけで意味が通るように書きます。',
  depth: 'core',
  tags: ['タグ'],
  sources: SRC,
  checkedAt: '2026-11-14',
  ...over,
});
const catEntry = (id, over = {}) => ({
  id,
  tier: 2,
  summary: 'テスト用のエントリの概要です。何をするサービスかを、四十字以上二百字以内で書きます。',
  facts: ['alpha', 'beta', 'gamma', 'delta'].map((slug) => catFact(`${id}.${slug}`)),
  references: SRC,
  createdBy: 'sc1',
  createdAt: '2026-11-14',
  ...over,
});
const catComparison = (over = {}) => ({
  id: 'cmp-config-cloudtrail',
  title: 'AWS Config と AWS CloudTrail',
  services: ['config', 'cloudtrail'],
  decide: ['API の呼び出しの記録なら CloudTrail'],
  rows: [{ axis: '記録するもの', values: { config: '設定の履歴', cloudtrail: 'API の呼び出し' }, factRefs: ['s3.alpha', 's3.gamma'] }],
  sources: SRC,
  checkedAt: '2026-11-14',
  createdBy: 'sc1',
  ...over,
});
const rec = (kind, obj, status = 'verified') => ({ status, checkedAt: '2026-11-14', hash: catalogHash(kind, obj) });
const jsonFile = (rel, data) => ({ rel, text: JSON.stringify(data) });
const registryFile = () => ({ rel: 'services.json', text: read('services.json') });
const catalogFiles = (entries, comparisons = [], extra = []) => [
  registryFile(),
  ...entries.map((e) => jsonFile(`catalog/services/${e.id}.json`, e)),
  ...comparisons.map((c) => jsonFile(`catalog/comparisons/${c.id}.json`, c)),
  ...extra,
];
const outputOf = (parsed) => {
  const { files: out, manifest } = buildOutputs(parsed, schema);
  const byKey = (key) => JSON.parse(out.find((f) => f.rel === manifest.files[key].path).text);
  return { out, manifest, byKey };
};

describe('サービス図鑑のビルド', () => {
  it('分類: 図鑑のファイルを種類ごとに見分ける', () => {
    expect(classify('catalog/services/s3.json')).toEqual({ kind: 'catalog-entry' });
    expect(classify('catalog/comparisons/cmp-a-b.json')).toEqual({ kind: 'catalog-comparison' });
    expect(classify('catalog-status.json')).toEqual({ kind: 'catalog-status' });
    expect(classify('catalog-needs.json')).toEqual({ kind: 'catalog-needs' });
    expect(classify('catalog/other/x.json')).toBeNull();
  });

  it('図鑑がなくても、一覧は台帳の全サービスを持ち、hostedBy の子は親の children に入る', () => {
    const parsed = parseContent(files([question('saa-1.1-a-001')], [registryFile()]), schema);
    expect(parsed.errors).toEqual([]);
    const { manifest, byKey } = outputOf(parsed);
    const index = byKey('catalog-index');
    const registry = byKey('services');
    expect(index.services.map((s) => s.id)).toEqual(registry.filter((s) => !s.hostedBy).map((s) => s.id));
    const ec2 = index.services.find((s) => s.id === 'ec2');
    expect(ec2.children.map((c) => c.id)).toEqual(['ec2-spot']);
    expect(index.services.some((s) => s.id === 'ec2-spot')).toBe(false);
    expect(ec2).not.toHaveProperty('tier');
    expect(ec2).not.toHaveProperty('summary');
    expect(ec2).not.toHaveProperty('status');
    expect(ec2.facts).toEqual([]);
    expect(index.comparisons).toEqual([]);
    expect(byKey('catalog-compare')).toEqual([]);
    expect(manifest.counts).toMatchObject({ catalogEntries: 0, catalogFacts: 0, comparisons: 0, catalogFactStatus: { verified: 0, pending: 0 } });
    expect(manifest.version).toBe(1);
  });

  it('台帳がなければ図鑑は出力しない', () => {
    const parsed = parseContent(files([question('saa-1.1-a-001')]), schema);
    const { manifest } = outputOf(parsed);
    expect(manifest.files['catalog-index']).toBeUndefined();
    expect(manifest.counts.catalogEntries).toBe(0);
  });

  it('図鑑があるとき: 検証状態で除外し、内容が変わった項目は pending にして出力する', () => {
    const s3 = catEntry('s3', { seeAlso: ['ebs.alpha', 'ebs.beta'] });
    const changed = { ...s3.facts[3], text: `${s3.facts[3].text}（あとから直した）` };
    s3.facts[3] = changed;
    const ebs = catEntry('ebs', { tier: 3, facts: [catFact('ebs.alpha'), catFact('ebs.beta')], seeAlso: ['s3.alpha', 's3.gamma'] });
    const iam = catEntry('iam');
    const cmpOk = catComparison();
    const status = {
      s3: rec('entry', s3),
      's3.alpha': rec('fact', s3.facts[0]),
      's3.gamma': rec('fact', s3.facts[2], 'needs-fix'),
      // 検証したあとに本文を直した → pending
      's3.delta': { ...rec('fact', s3.facts[3]), hash: catalogHash('fact', { ...changed, text: '直す前の本文' }) },
      'ebs.alpha': rec('fact', ebs.facts[0], 'rejected'),
      ebs: rec('entry', ebs),
      iam: rec('entry', iam, 'needs-fix'),
      'cmp-config-cloudtrail': rec('comparison', cmpOk),
    };
    const qs = [
      question('saa-1.1-a-001', { services: ['Amazon S3'], taskStatement: '1.1' }),
      question('saa-1.1-a-002', { services: ['Amazon S3'], pool: 'mockA' }),
    ];
    const needs = { source: 'test', items: [{ key: 'saa-1.1-w2m-003/c', task: '1.1', side: 'correct', gap: 'none', knowledge: '知識の例です' }] };
    const parsed = parseContent(
      files(qs, catalogFiles([s3, ebs, iam], [cmpOk], [jsonFile('catalog-status.json', status), jsonFile('catalog-needs.json', needs)])),
      schema,
    );
    expect(parsed.errors).toEqual([]);
    // 検証したあとに内容が変わった項目は警告（ビルドは止めない）
    expect(parsed.warnings.some((w) => w.includes('catalog-status.json') && w.includes('s3.delta'))).toBe(true);
    const { out, manifest, byKey } = outputOf(parsed);

    // catalog-needs はアプリに出さない
    expect(JSON.stringify(manifest)).not.toContain('catalog-needs');
    expect(out.some((f) => f.text.includes('saa-1.1-w2m-003/c'))).toBe(false);

    // エントリ本体が needs-fix の iam は、出力しない（一覧では準備中のまま）
    expect(manifest.files['catalog:iam']).toBeUndefined();
    expect(manifest.files['catalog:s3'].path).toMatch(/^catalog\/s3\.[0-9a-f]{12}\.json$/);
    const index = byKey('catalog-index');
    const iamRow = index.services.find((r) => r.id === 'iam');
    expect(iamRow).toBeTruthy();
    expect(iamRow).not.toHaveProperty('summary');
    expect(iamRow.facts).toEqual([]);

    // 事実: needs-fix は除き、記録なしと内容が変わったものは pending
    const s3Out = byKey('catalog:s3');
    expect(s3Out.facts.map((f) => [f.id, f.status])).toEqual([
      ['s3.alpha', 'verified'],
      ['s3.beta', 'pending'],
      ['s3.delta', 'pending'],
    ]);
    expect(s3Out.status).toBe('verified');
    // seeAlso は除外後の事実だけを、見出しとエントリ名つきに解決する
    expect(s3Out.seeAlso).toEqual([{ id: 'ebs.beta', title: '見出し ebs.beta', entryId: 'ebs', entryName: 'Amazon EBS' }]);
    expect(byKey('catalog:ebs').seeAlso.map((x) => x.id)).toEqual(['s3.alpha']);

    const s3Row = index.services.find((r) => r.id === 's3');
    expect(s3Row).toMatchObject({ tier: 2, status: 'verified', summary: s3.summary });
    expect(s3Row.facts.map((f) => f.id)).toEqual(['s3.alpha', 's3.beta', 's3.delta']);
    expect(s3Row.facts[0]).toEqual({ id: 's3.alpha', title: '見出し s3.alpha', kind: 'feature', depth: 'core', tags: ['タグ'], status: 'verified' });
    // 問題の services からの関連: 演習の問題だけを数える（保留模試は数えない）
    expect(s3Row.related.questions).toBe(1);
    expect(s3Row.tasks).toContain('1.1');
    // 比較: 除外した事実への参照は落とし、サービスごとの一覧にも入る
    expect(index.comparisons).toEqual([{ id: 'cmp-config-cloudtrail', title: 'AWS Config と AWS CloudTrail', services: ['config', 'cloudtrail'], status: 'verified' }]);
    expect(index.services.find((r) => r.id === 'config').comparisons).toEqual(['cmp-config-cloudtrail']);
    expect(byKey('catalog-compare')[0].rows[0].factRefs).toEqual(['s3.alpha']);
    expect(manifest.counts).toMatchObject({
      catalogEntries: 2,
      catalogFacts: 4,
      comparisons: 1,
      catalogFactStatus: { verified: 1, pending: 3 },
    });
  });

  it('図鑑の参照切れ・ファイル名の不一致・hostedBy の子のエントリはビルドを止めるエラーにする', () => {
    const e = catEntry('s3', { seeAlso: ['ebs.nothing'], chooseWhen: [{ text: 'サーバーを管理せずに大量のデータを保存したい', alternatives: ['no-such'] }] });
    const spot = catEntry('ec2-spot');
    const wrongName = jsonFile('catalog/services/other.json', catEntry('iam'));
    const q = question('saa-1.1-a-001', { factRefs: ['s3.nothing'] });
    const parsed = parseContent(files([q], [...catalogFiles([e, spot]), wrongName]), schema);
    const text = parsed.errors.join('\n');
    expect(text).toContain('ebs.nothing');
    expect(text).toContain('no-such');
    expect(text).toContain('ec2-spot');
    expect(text).toContain('ファイル名 other と id iam');
    expect(text).toContain('s3.nothing');
  });

  it('警告にとどまるもの: 区分の目安の不足', () => {
    const parsed = parseContent(files([question('saa-1.1-a-001')], catalogFiles([catEntry('s3', { tier: 1 })])), schema);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings.some((w) => w.includes('区分 1'))).toBe(true);
  });

  it('本文の図鑑リンクが存在しない事実を指すとエラーにする', () => {
    const body = `${lesson.replace(/\n$/, '')}\n\n[S3](#/services/s3?f=nothing)\n`;
    const parsed = parseContent(
      files([question('saa-1.1-a-001')], [...catalogFiles([catEntry('s3')]), { rel: 'lessons/d4/lesson-4.1-s3-storage-classes.md', text: body }]),
      schema,
    );
    expect(parsed.errors.some((e) => e.includes('s3.nothing'))).toBe(true);
  });

  it('スキーマ違反の図鑑ファイルはエラーにする', () => {
    const parsed = parseContent(files([question('saa-1.1-a-001')], catalogFiles([catEntry('s3', { summary: '短い' })])), schema);
    expect(parsed.errors.some((e) => e.includes('catalog/services/s3.json') && e.includes('summary'))).toBe(true);
  });
});
