// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as schema from '../../../scripts/lib/schema.mjs';
import { buildOutputs, parseContent, writeOutputs } from '../lib/content-build.mjs';

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
