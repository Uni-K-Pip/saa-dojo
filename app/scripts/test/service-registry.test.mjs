// @vitest-environment node
// サービス台帳（content/saa-c03/services.json）と、validate の名寄せの検査
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ServiceRegistrySchema } from '../../../scripts/lib/schema.mjs';
import { buildServiceIndex, registrySummary } from '../../../scripts/lib/service-registry.mjs';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contentDir = path.join(repoRoot, 'content', 'saa-c03');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(contentDir, rel), 'utf8'));
const blueprint = readJson('blueprint.json');
const registry = readJson('services.json');

// 正式名と略称が別のサービスとして登録されていた組（監査で見つかった 15 組）
const MERGED = [
  ['Amazon Managed Streaming for Apache Kafka', 'Amazon MSK'],
  ['Amazon Simple Notification Service', 'Amazon SNS'],
  ['Amazon Simple Queue Service', 'Amazon SQS'],
  ['Amazon Elastic Compute Cloud', 'Amazon EC2'],
  ['Amazon Elastic Container Service', 'Amazon ECS'],
  ['Amazon Elastic Kubernetes Service', 'Amazon EKS'],
  ['Amazon Relational Database Service', 'Amazon RDS'],
  ['AWS Database Migration Service', 'AWS Database Migration Service (AWS DMS)'],
  ['Amazon Virtual Private Cloud', 'Amazon VPC'],
  ['AWS Certificate Manager', 'AWS Certificate Manager (ACM)'],
  ['AWS Key Management Service', 'AWS Key Management Service (AWS KMS)'],
  ['AWS Identity and Access Management', 'AWS Identity and Access Management (IAM)'],
  ['Amazon Elastic Block Store', 'Amazon EBS'],
  ['Amazon Elastic File System', 'Amazon EFS'],
  ['Amazon Simple Storage Service', 'Amazon S3'],
];

describe('サービス台帳', () => {
  const index = buildServiceIndex(blueprint, ServiceRegistrySchema.parse(registry));

  it('スキーマに合い、不整合がない', () => {
    expect(index.problems).toEqual([]);
    expect(index.inScope).toHaveLength(132);
  });

  it('blueprint のサービス名はすべて台帳の 1 件に解決する', () => {
    const names = [
      ...blueprint.services.inScope.flatMap((c) => c.services),
      ...blueprint.domains.flatMap((d) => d.taskStatements.flatMap((t) => t.keyServices)),
    ];
    for (const n of names) expect(index.resolve(n), n).toMatchObject({ kind: 'in' });
  });

  it('正式名と略称の組を同じ ID と正規名にまとめる', () => {
    for (const [long, canonical] of MERGED) {
      const a = index.resolve(long);
      const b = index.resolve(canonical);
      expect(a, long).toMatchObject({ kind: 'in', canonical, exact: false, declared: true });
      expect(b, canonical).toMatchObject({ kind: 'in', canonical, exact: true });
      expect(a.id).toBe(b.id);
    }
  });

  it('括弧の分解やベンダー名の省略で導ける表記も解決する', () => {
    expect(index.resolve('S3')).toMatchObject({ id: 's3', canonical: 'Amazon S3', exact: false });
    expect(index.resolve('AWS KMS')).toMatchObject({ id: 'kms', exact: false });
    expect(index.resolve('Amazon ECR')).toMatchObject({ id: 'ecr', canonical: 'Amazon Elastic Container Registry' });
    expect(index.canonicalize('Amazon Simple Storage Service')).toBe('Amazon S3');
    expect(index.canonicalize('AWS Local Zones')).toBe('AWS Local Zones');
  });

  it('対象サービス一覧にないサービスの出所を keyServices として残す', () => {
    expect(index.source.get('Amazon EC2 Spot Instances')).toBe('keyServices');
    expect(index.source.get('Amazon S3')).toBe('inScope');
  });

  it('アプリ向けの要約に、導出できる別名まで展開して入れる', () => {
    const s3 = registrySummary(index).find((e) => e.id === 's3');
    expect(s3.aliases).toEqual(expect.arrayContaining(['S3', 'Amazon Simple Storage Service']));
    expect(s3.aliases).not.toContain('Amazon S3');
  });
});

describe('サービス台帳の不整合の検出', () => {
  const tiny = (services) => buildServiceIndex(blueprint, { checkedAt: '2026-11-13', services });
  const base = registry.services;

  it('ID の重複、表記の重なり、hostedBy の誤りを問題として返す', () => {
    const p = tiny([
      ...base,
      { id: 's3', name: 'Amazon S3 Copy', aliases: [], category: 'ストレージ' },
      { id: 'dup-alias', name: 'Dup', aliases: ['Amazon Simple Storage Service'], category: 'ストレージ' },
      { id: 'child', name: 'Child Service', aliases: [], category: 'ストレージ', hostedBy: 'nothing' },
    ]).problems;
    expect(p.some((m) => m.includes('ID s3 が重複'))).toBe(true);
    expect(p.some((m) => m.includes('Amazon Simple Storage Service'))).toBe(true);
    expect(p.some((m) => m.includes('child の hostedBy'))).toBe(true);
  });

  it('blueprint のサービスが台帳にないときは問題として返す', () => {
    const p = tiny(base.filter((e) => e.id !== 'timestream')).problems;
    expect(p).toEqual([expect.stringContaining('Amazon Timestream')]);
  });

  it('台帳がなければ、blueprint の表記をそれぞれ別のサービスとして扱う（従来の動き）', () => {
    const legacy = buildServiceIndex(blueprint);
    expect(legacy.hasRegistry).toBe(false);
    expect(legacy.problems).toEqual([]);
    expect(legacy.resolve('Amazon Simple Storage Service')).toMatchObject({ canonical: 'Amazon Simple Storage Service', exact: true });
    expect(legacy.inScope.length).toBeGreaterThan(132);
  });
});

describe('validate の名寄せ', () => {
  const tmpDirs = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function fixture({ withRegistry = true, services = ['Amazon Simple Storage Service', 'AWS Lambda'] } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-registry-'));
    tmpDirs.push(root);
    const dir = path.join(root, 'content', 'saa-c03');
    fs.mkdirSync(path.join(dir, 'questions', 'd1', '1.1'), { recursive: true });
    fs.copyFileSync(path.join(contentDir, 'blueprint.json'), path.join(dir, 'blueprint.json'));
    if (withRegistry) fs.copyFileSync(path.join(contentDir, 'services.json'), path.join(dir, 'services.json'));
    const q = readJson('questions/d1/1.1/saa-1.1-ex-001.json');
    for (const n of [1, 2]) {
      const id = `saa-1.1-ex-00${n}`;
      fs.writeFileSync(path.join(dir, 'questions', 'd1', '1.1', `${id}.json`), JSON.stringify({ ...q, id, services }));
    }
    return checkContent(loadContent({ root }));
  }

  it('台帳の別名で書かれた services を、表記ごとに 1 件の警告にまとめる', () => {
    const c = fixture();
    expect(c.issues.filter((i) => i.level === 'error')).toEqual([]);
    const alias = c.issues.filter((i) => i.code === 'service-alias');
    expect(alias).toHaveLength(1);
    expect(alias[0].message).toContain('Amazon S3');
    expect(alias[0].message).toContain('2 ファイル');
  });

  it('台帳がないときは警告し、従来どおり検証を続ける', () => {
    const c = fixture({ withRegistry: false });
    expect(c.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(c.issues.some((i) => i.code === 'registry-missing')).toBe(true);
    expect(c.issues.some((i) => i.code === 'service-alias')).toBe(false);
  });
});
