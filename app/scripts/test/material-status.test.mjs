// @vitest-environment node
// 教材の検証状態（material-status.json）: ハッシュ・実効の状態・スキーマ・validate・ビルドでの絞り込み
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { materialEffectiveStatus, materialHash } from '../../../scripts/lib/material-status.mjs';
import { buildContent } from '../lib/content-build.mjs';
import { decision, layers, lessonId, position, timeline } from './diagram-fixtures.mjs';

const repoContent = new URL('../../../content/saa-c03/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, repoContent), 'utf8');
const lessonRel = `lessons/d4/${lessonId}.md`;
const lesson = (addition = '') => `---
id: ${lessonId}
title: 保存先の選び方
domain: 4
taskStatement: '4.1'
order: 10
knowledgeRefs: []
services: []
estimatedMinutes: 3
createdBy: v1
---

保存するデータの性質を調べます。保存期間と読み取りの頻度を確認し、すぐに読み出す必要があるかを決めます。要件が変わったときは、移行にかかる時間と費用も確かめます。

よく使うデータと、長期保存が必要なデータを分けて考えます。たとえば運用中に何度も読むログと、監査のときだけ読むログでは、読み出しに許される時間が異なります。

候補を比べるときは、保管料金に加えて読み出しや移行にかかる費用を確認します。利用頻度の変化を見込んで、選んだ保存先が条件に合い続けるかも確認します。
${addition ? `\n${addition}\n` : ''}`;

const rec = (d, status = 'verified') => ({ status, checkedAt: '2026-11-23', hash: materialHash('diagrams', d) });

const tmp = [];
afterEach(() => {
  for (const root of tmp.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** diagrams: 図の配列、status: material-status.json の中身（undefined ならファイルを置かない）、body: レッスンに足す本文 */
function fixture({ diagrams = [], status, body = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-material-'));
  tmp.push(root);
  const contentDir = path.join(root, 'content', 'saa-c03');
  const outDir = path.join(root, 'out');
  const source = {
    'blueprint.json': read('blueprint.json'), 'services.json': read('services.json'), 'review-status.json': {},
    [lessonRel]: lesson(body),
    ...Object.fromEntries(diagrams.map((d) => [`diagrams/${d.id}.json`, d])),
    ...(status === undefined ? {} : { 'material-status.json': status }),
  };
  for (const [rel, value] of Object.entries(source)) {
    const dest = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root, contentDir, outDir };
}

const CODES = ['material-status-key', 'material-stale-review', 'diagram-unreferenced', 'diagram-ref-unverified'];
const statusIssues = (opts) => checkContent(loadContent({ root: fixture(opts).root })).issues.filter((i) => CODES.includes(i.code) || i.code === 'schema');

function build(opts, includeUnverified = false) {
  const dirs = fixture(opts);
  const built = buildContent({ ...dirs, schema, includeUnverified });
  const output = (key) => JSON.parse(fs.readFileSync(path.join(dirs.outDir, built.manifest.files[key].path), 'utf8'));
  return { built, output };
}

describe('ハッシュと実効の状態', () => {
  const d = decision();

  it('createdBy を除く全部の欄から作る（裏づけを変えても変わる）', () => {
    const h = materialHash('diagrams', d);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(materialHash('diagrams', { ...d, createdBy: 'v9' })).toBe(h);
    expect(materialHash('diagrams', { ...d, title: '別の題の図です' })).not.toBe(h);
    expect(materialHash('diagrams', { ...d, lessonRefs: [] })).not.toBe(h);
    expect(materialHash('diagrams', { ...d, factRefs: ['s3.lifecycle'] })).not.toBe(h);
    // キーの順はハッシュに影響しない
    expect(materialHash('diagrams', Object.fromEntries(Object.entries(d).reverse()))).toBe(h);
  });

  it('知らない区分はハッシュを作らない', () => {
    expect(() => materialHash('lessons', d)).toThrow();
  });

  it('記録なし・一致・内容が変わった', () => {
    expect(materialEffectiveStatus({ diagrams: {} }, 'diagrams', d.id, d)).toMatchObject({ status: 'pending', recorded: false, stale: false });
    expect(materialEffectiveStatus(null, 'diagrams', d.id, d)).toMatchObject({ status: 'pending', recorded: false });
    const file = { diagrams: { [d.id]: rec(d) } };
    expect(materialEffectiveStatus(file, 'diagrams', d.id, d)).toMatchObject({ status: 'verified', stale: false, recorded: true });
    expect(materialEffectiveStatus(file, 'diagrams', d.id, { ...d, alt: `${d.alt}追記` })).toMatchObject({ status: 'pending', stale: true });
    const fix = { diagrams: { [d.id]: rec(d, 'needs-fix') } };
    expect(materialEffectiveStatus(fix, 'diagrams', d.id, d)).toMatchObject({ status: 'needs-fix' });
  });
});

describe('スキーマ', () => {
  const ok = { status: 'verified', checkedAt: '2026-11-23', hash: 'abcdef012345' };
  const parse = (v) => schema.MaterialStatusSchema.safeParse(v).success;

  it('区分 diagrams の記録を受け付け、区分は省ける', () => {
    expect(parse({ diagrams: {} })).toBe(true);
    expect(parse({ diagrams: { 'dg-test-decision': ok } })).toBe(true);
    expect(parse({})).toBe(true);
  });

  it('知らない区分、図の id でない鍵、形の違う記録はエラー', () => {
    expect(parse({ lessons: {} })).toBe(false);
    expect(parse({ diagrams: { 'vpc-three-tier': ok } })).toBe(false);
    expect(parse({ diagrams: { 'dg-test-decision': { ...ok, status: 'done' } } })).toBe(false);
    expect(parse({ diagrams: { 'dg-test-decision': { ...ok, checkedAt: '2026/11/23' } } })).toBe(false);
    expect(parse({ diagrams: { 'dg-test-decision': { ...ok, hash: 'ABCDEF012345' } } })).toBe(false);
    expect(parse({ diagrams: { 'dg-test-decision': { ...ok, note: 'メモ' } } })).toBe(false);
    expect(parse({ diagrams: { 'dg-test-decision': { status: 'verified', checkedAt: '2026-11-23' } } })).toBe(false);
  });
});

describe('validate', () => {
  const d = decision();
  const ref = `![図](#/diagrams/${d.id})`;

  it('検証済みで参照がある図には警告を出さない', () => {
    expect(statusIssues({ diagrams: [d], status: { diagrams: { [d.id]: rec(d) } }, body: ref })).toEqual([]);
  });

  it('ファイルがない・記録がない未検証の図で、参照もないときは何も出さない', () => {
    expect(statusIssues({ diagrams: [d] })).toEqual([]);
    expect(statusIssues({ diagrams: [d], status: { diagrams: {} } })).toEqual([]);
  });

  it('検証済みでどこからも参照されていない図は警告', () => {
    expect(statusIssues({ diagrams: [d], status: { diagrams: { [d.id]: rec(d) } } })).toEqual([
      expect.objectContaining({ level: 'warning', code: 'diagram-unreferenced', file: `content/saa-c03/diagrams/${d.id}.json` }),
    ]);
  });

  it('記録したあとに内容が変わった図は警告（未検証に戻るので、参照していれば参照の警告も出る）', () => {
    const changed = { ...d, title: '直したあとの題です' };
    const found = statusIssues({ diagrams: [changed], status: { diagrams: { [d.id]: rec(d) } }, body: ref });
    expect(found).toEqual([
      expect.objectContaining({ level: 'warning', code: 'material-stale-review', file: 'content/saa-c03/material-status.json', message: expect.stringContaining(d.id) }),
      expect.objectContaining({ level: 'warning', code: 'diagram-ref-unverified', message: expect.stringContaining('未検証') }),
    ]);
  });

  it('存在しない図の id の記録はエラー', () => {
    expect(statusIssues({ diagrams: [d], status: { diagrams: { 'dg-absent': rec(d) } } })).toEqual([
      expect.objectContaining({ level: 'error', code: 'material-status-key', message: expect.stringContaining('dg-absent') }),
    ]);
  });

  it('スキーマ違反はエラー', () => {
    expect(statusIssues({ diagrams: [d], status: { diagrams: {}, lessons: {} } })).toEqual([
      expect.objectContaining({ level: 'error', code: 'schema', file: 'content/saa-c03/material-status.json' }),
    ]);
  });

  it.each([
    ['pending', undefined, '未検証'],
    ['needs-fix', 'needs-fix', '要修正'],
    ['rejected', 'rejected', '却下'],
  ])('本文が %s の図を指すと、文書・行・図の id・状態を警告に出す', (_label, status, word) => {
    const file = { diagrams: status ? { [d.id]: rec(d, status) } : {} };
    const found = statusIssues({ diagrams: [d], status: file, body: ref });
    const line = lesson(ref).split('\n---\n')[1].split('\n').indexOf(ref) + 1;
    expect(found).toEqual([
      expect.objectContaining({
        level: 'warning',
        code: 'diagram-ref-unverified',
        file: `content/saa-c03/${lessonRel}`,
        message: expect.stringMatching(new RegExp(`^本文 ${line} 行目: 検証済みでない図 ${d.id}（${word}）`)),
      }),
    ]);
  });
});

describe('ビルドでの絞り込み', () => {
  const ver = position();
  const pend = timeline();
  const fix = layers();
  const rej = decision();
  const diagrams = [ver, pend, fix, rej];
  const status = { diagrams: { [ver.id]: rec(ver), [fix.id]: rec(fix, 'needs-fix'), [rej.id]: rec(rej, 'rejected') } };
  const body = diagrams.map((d) => `![図](#/diagrams/${d.id})`).join('\n\n');

  it('既定では検証済みの図だけを札なしで出し、除いた数を状態ごとに数える', () => {
    const { built, output } = build({ diagrams, status, body });
    expect(built.ok).toBe(true);
    expect(output('diagram-index')).toEqual([{ id: ver.id, type: 'position', title: ver.title, steps: 0, status: 'verified' }]);
    expect(output(`diagram:${ver.id}`)).toMatchObject({ id: ver.id, status: 'verified' });
    for (const d of [pend, fix, rej]) expect(built.manifest.files[`diagram:${d.id}`]).toBeUndefined();
    expect(built.manifest.counts.diagrams).toBe(1);
    expect(built.manifest.counts.diagramsExcluded).toEqual({ pending: 1, 'needs-fix': 1, rejected: 1 });
  });

  it('--include-unverified では未検証の図も「pending」で出し、要修正・却下は出さない', () => {
    const { built, output } = build({ diagrams, status, body }, true);
    expect(built.ok).toBe(true);
    expect(output('diagram-index').map((d) => [d.id, d.status])).toEqual([[ver.id, 'verified'], [pend.id, 'pending']]);
    expect(output(`diagram:${pend.id}`)).toMatchObject({ id: pend.id, status: 'pending' });
    for (const d of [fix, rej]) expect(built.manifest.files[`diagram:${d.id}`]).toBeUndefined();
    expect(built.manifest.counts.diagrams).toBe(2);
    expect(built.manifest.counts.diagramsExcluded).toEqual({ pending: 0, 'needs-fix': 1, rejected: 1 });
  });

  it('除いた図を本文が指していても止めず、文書名と図の id を警告に出す', () => {
    const { built } = build({ diagrams, status, body });
    const refWarnings = built.warnings.filter((w) => w.includes('出力から除いた'));
    expect(refWarnings).toEqual([
      expect.stringMatching(new RegExp(`^${lessonRel}: 本文 \\d+ 行目: 図 ${pend.id}（未検証）`)),
      expect.stringMatching(new RegExp(`^${lessonRel}: 本文 \\d+ 行目: 図 ${fix.id}（要修正）`)),
      expect.stringMatching(new RegExp(`^${lessonRel}: 本文 \\d+ 行目: 図 ${rej.id}（却下）`)),
    ]);
    const included = build({ diagrams, status, body }, true).built.warnings.filter((w) => w.includes('出力から除いた'));
    expect(included).toHaveLength(2);
    expect(included.some((w) => w.includes(pend.id))).toBe(false);
  });

  it('除く図にも検査をかけ、エラーがあれば止める', () => {
    const broken = { ...pend, lessonRefs: ['lesson-4.1-absent'], factRefs: [] };
    const dirs = fixture({ diagrams: [broken], status: { diagrams: {} } });
    const built = buildContent({ ...dirs, schema });
    expect(built.ok).toBe(false);
    expect(built.errors.some((e) => e.startsWith(`diagrams/${pend.id}.json:`))).toBe(true);
  });

  it('存在しない図を指す参照は、今までどおり止める', () => {
    const dirs = fixture({ diagrams: [ver], status, body: '![図](#/diagrams/dg-absent)' });
    const built = buildContent({ ...dirs, schema });
    expect(built).toMatchObject({ ok: false, manifest: null });
    expect(built.errors).toContainEqual(expect.stringContaining('参照先の図 dg-absent'));
  });

  it('存在しない図の記録と、スキーマ違反の検証状態は、ビルドを止める', () => {
    expect(buildContent({ ...fixture({ diagrams: [ver], status: { diagrams: { 'dg-absent': rec(ver) } } }), schema }).errors)
      .toContainEqual(expect.stringContaining('material-status.json: diagrams.dg-absent'));
    expect(buildContent({ ...fixture({ diagrams: [ver], status: { lessons: {} } }), schema }).ok).toBe(false);
  });
});
