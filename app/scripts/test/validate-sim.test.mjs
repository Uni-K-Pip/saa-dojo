// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { catalogHash } from '../../../scripts/lib/catalog.mjs';
import { materialHash } from '../../../scripts/lib/material-status.mjs';
import { simHashSubject } from '../../../scripts/lib/sim.mjs';
import * as cidr from '../../../scripts/lib/sims/cidr.mjs';
import { SIMULATORS } from '../../../scripts/lib/sims/index.mjs';
import { buildContent } from '../lib/content-build.mjs';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
const source = fileURLToPath(new URL('../../../content/saa-c03/', import.meta.url));
const id = 'sim-cidr-reserved-addresses';
const rel = `sims/cidr/${id}.json`;
const fixtures = [];
const readSource = (rel) => JSON.parse(fs.readFileSync(path.join(source, rel), 'utf8'));

const scenarios = ['alb-subnet', 'peering-overlap', 'reserved-addresses', 'three-tier-split', 'vpc-size-limits'].map((name) => {
  const file = `sims/cidr/sim-cidr-${name}.json`;
  return [file, readSource(file)];
});
const factIds = new Set(scenarios.flatMap(([, value]) => value.factRefs));
const lessonIds = new Set(scenarios.flatMap(([, value]) => value.lessonRefs));
const catalog = ['elb', 'vpc'].map((id) => {
  const file = `catalog/services/${id}.json`;
  const { chooseWhen, avoidWhen, seeAlso, lessonRefs, docRefs, ...entry } = readSource(file);
  return [file, { ...entry, facts: entry.facts.filter(({ id }) => factIds.has(id)) }];
});
const catalogStatus = Object.fromEntries(Object.entries(readSource('catalog-status.json')).filter(([id]) => factIds.has(id)));

function lessonFiles() {
  return [...lessonIds].map((id) => {
    const basics = id.startsWith('lesson-basics-');
    const folder = basics ? 'basics' : 'd3';
    return [`lessons/${folder}/${id}.md`, `---
id: ${id}
title: VPC とサブネット
domain: ${basics ? 0 : 3}
taskStatement: '${basics ? 'basics' : '3.4'}'
order: 1
knowledgeRefs: []
services: []
estimatedMinutes: 3
createdBy: v1
---

VPC を小さなサブネットに分けます。CIDR はアドレスの範囲を表します。
`];
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    if (path.relative(appDir, root).startsWith('saa-sim-test-') && path.dirname(root) === path.resolve(appDir)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

function fixture() {
  const root = fs.mkdtempSync(path.join(appDir, 'saa-sim-test-'));
  fixtures.push(root);
  const contentDir = path.join(root, 'content', 'saa-c03');
  const outDir = path.join(root, 'out');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(contentDir, file), 'utf8'));
  const write = (file, value) => {
    const dest = path.join(contentDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  };
  for (const [file, value] of [
    ['blueprint.json', readSource('blueprint.json')],
    ['services.json', readSource('services.json')],
    ['review-status.json', {}],
    ['catalog-status.json', catalogStatus],
    ...catalog, ...lessonFiles(), ...scenarios,
  ]) write(file, value);
  return {
    read, write, outDir,
    issues: () => checkContent(loadContent({ root })).issues,
    build: (includeUnverified = false) => buildContent({ contentDir, outDir, schema, includeUnverified }),
    output: (manifest, key) => JSON.parse(fs.readFileSync(path.join(outDir, manifest.files[key].path), 'utf8')),
  };
}

const recorded = (value, status = 'verified') => ({
  status, checkedAt: '2026-11-23', hash: materialHash('sims', simHashSubject(value, cidr)),
});

describe('validate とコンテンツのビルド', () => {
  it('除外する未検証シナリオでも期待値が違えばどちらも失敗する', () => {
    const { read, write, issues, build, outDir } = fixture();
    const value = read(rel);
    value.expect.initial.usable = 123;
    write(rel, value);
    const message = /initial の usable: 期待した値 123、エンジンの値 11/;
    expect(issues()).toContainEqual(expect.objectContaining({ level: 'error', code: 'sim-expect', message: expect.stringMatching(message) }));
    expect(build()).toMatchObject({ ok: false, errors: [expect.stringMatching(message)] });
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('配置、ファイル名、id の重複、存在しない検証記録を検査する', () => {
    const { read, write, issues, build } = fixture();
    const value = read(rel);
    write('sims/unknown/sim-unknown-test.json', { ...value, id: 'sim-unknown-test' });
    write('sims/cidr/sim-other-test.json', { ...value, id: 'sim-other-test' });
    write('sims/cidr/sim-cidr-duplicate.json', value);
    write('material-status.json', { sims: { 'sim-cidr-absent': recorded(value) } });
    const errors = issues().filter(({ level }) => level === 'error');
    expect(errors.map(({ message }) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining('シミュレーター unknown がありません'),
      expect.stringContaining('sim-cidr- で始めてください'),
      expect.stringContaining('ファイル名と id が違います'),
      expect.stringContaining('重複'),
      expect.stringContaining('sims.sim-cidr-absent'),
    ]));
    expect(build().ok).toBe(false);
  });

  it('既定では出さず、includeUnverified では展開済みの未検証シナリオを出す', () => {
    const { write, issues, build, output } = fixture();
    const lessons = [...lessonIds].map((ref) => ({ kind: 'lesson', ref }));
    const simItem = { kind: 'sim', ref: id };
    write('course.json', { stages: [{ id: 0, title: '土台', goal: '基礎を学ぶ', units: [
      { id: 'u00', title: 'ネットワーク', items: [...lessons, simItem] },
    ] }] });
    expect(issues().filter(({ file }) => file.endsWith('/course.json'))).toEqual([
      expect.objectContaining({ level: 'warning', code: 'course-material-unverified', message: expect.stringContaining(id) }),
    ]);

    const normal = build();
    expect(normal.ok).toBe(true);
    expect(normal.manifest.counts).toMatchObject({ sims: 0, simsExcluded: { pending: 5 } });
    // 出せるシナリオがなくても、一覧にはシミュレーターの名前と説明を出す（シナリオは 0 件）
    const empty = output(normal.manifest, 'sim-index');
    expect(empty.map(({ id, name }) => [id, name])).toEqual(SIMULATORS.map(({ id, name }) => [id, name]));
    expect(empty.every(({ scenarios, description, notCovered }) => scenarios.length === 0 && description && notCovered.length > 0)).toBe(true);
    expect(output(normal.manifest, 'course').stages[0].units[0].items).toEqual(lessons);
    expect(normal.manifest.files).not.toHaveProperty(`sim:${id}`);

    const dev = build(true);
    expect(dev.ok).toBe(true);
    expect(dev.manifest.counts).toMatchObject({ sims: 5, simsExcluded: { pending: 0 } });
    expect(output(dev.manifest, 'course').stages[0].units[0].items).toEqual([...lessons, simItem]);
    const [entry] = output(dev.manifest, 'sim-index');
    expect(entry.id).toBe('cidr');
    expect(entry.scenarios.map(({ id }) => id)).toEqual([...entry.scenarios.map(({ id }) => id)].sort());
    expect(entry.scenarios.every(({ status }) => status === 'pending')).toBe(true);
    const item = output(dev.manifest, `sim:${id}`);
    expect(item.status).toBe('pending');
    expect(item.predict.choices.map(({ value }) => value)).toEqual([16, 15, 11, 14]);
    expect(item.explain.initial).toContain('#/services/vpc?f=subnet-reserved-ips');
    expect(item.explain.initial).toContain('残りの 11 個');
    expect(item).not.toHaveProperty('expect');
    expect(item).not.toHaveProperty('engine');
  });

  it('図鑑が表示する未検証の事実にはリンクし、非表示の事実やエントリは文字で出す', () => {
    const { read, write, build, output } = fixture();
    const entry = read('catalog/services/vpc.json');
    const fact = entry.facts.find(({ id }) => id === 'vpc.subnet-reserved-ips');
    const status = read('catalog-status.json');
    const find = () => {
      const result = build(true);
      expect(result.ok).toBe(true);
      return output(result.manifest, `sim:${id}`);
    };
    delete status[fact.id];
    write('catalog-status.json', status);
    expect(find().explain.initial).toContain('#/services/vpc?f=subnet-reserved-ips');

    status[fact.id] = { status: 'needs-fix', checkedAt: '2026-11-23', hash: catalogHash('fact', fact) };
    write('catalog-status.json', status);
    expect(find().explain.initial).toContain('先頭の 4 つと最後の 1 つ');
    expect(find().explain.initial).not.toContain('#/services/');
    delete status[fact.id];

    status[entry.id] = { status: 'rejected', checkedAt: '2026-11-23', hash: catalogHash('entry', entry) };
    write('catalog-status.json', status);
    expect(find().references.every(({ href }) => href.startsWith('#/lessons/'))).toBe(true);
    expect(find().explain.initial).not.toContain('#/services/');
  });

  it('規則の文だけが変わると検証済みのシナリオが未検証に戻る', () => {
    const { read, write, issues, build, output } = fixture();
    write('material-status.json', { sims: { [id]: recorded(read(rel)) } });
    const normal = build();
    expect(normal.ok).toBe(true);
    expect(output(normal.manifest, `sim:${id}`).status).toBe('verified');
    expect(issues().some(({ code }) => code === 'sim-unreferenced' || code === 'material-stale-review')).toBe(false);

    const text = cidr.RULES.reserved.text;
    try {
      cidr.RULES.reserved.text += 'という予約です';
      expect(issues()).toContainEqual(expect.objectContaining({
        level: 'warning', code: 'material-stale-review', message: expect.stringContaining(id),
      }));
      expect(build().manifest.counts).toMatchObject({ sims: 0, simsExcluded: { pending: 5 } });
      expect(output(build(true).manifest, `sim:${id}`).status).toBe('pending');
    } finally {
      cidr.RULES.reserved.text = text;
    }
  });

  it('要修正と却下のシナリオは includeUnverified でも出さない', () => {
    const { read, write, build } = fixture();
    const other = 'sim-cidr-vpc-size-limits';
    write('material-status.json', { sims: {
      [id]: recorded(read(rel), 'needs-fix'),
      [other]: recorded(read(`sims/cidr/${other}.json`), 'rejected'),
    } });
    expect(build(true).manifest.counts).toMatchObject({ sims: 3, simsExcluded: { pending: 0, 'needs-fix': 1, rejected: 1 } });
  });
});
