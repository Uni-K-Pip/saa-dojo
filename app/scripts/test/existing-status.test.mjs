// @vitest-environment node
// 既存の教材（レッスン・早見表・ガイド・カード・用語）の検証状態: スキーマ・ハッシュ・validate・ビルド・coverage
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { checkContent, loadContent } from '../../../scripts/validate.mjs';
import { computeCoverage } from '../../../scripts/coverage.mjs';
import * as schema from '../../../scripts/lib/schema.mjs';
import { EXISTING_SECTIONS, existingMaterialItems, materialHash, materialHashInput } from '../../../scripts/lib/material-status.mjs';
import { buildContent } from '../lib/content-build.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoContent = path.join(repoRoot, 'content', 'saa-c03');
const read = (rel) => fs.readFileSync(path.join(repoContent, rel), 'utf8');

const PARA = 'データの性質を調べ、保存期間と読み取りの頻度を確かめてから、保存先を決めます。要件が変わったときは、移行の時間と費用も確かめます。';
const lessonFront = {
  id: 'lesson-4.1-storage-test', title: '保存先の選び方', domain: 4, taskStatement: '4.1', order: 10,
  knowledgeRefs: [], services: [], estimatedMinutes: 3, createdBy: 'v1',
};
const cheatFront = { id: 'cheatsheet-storage-test', title: '保存先の早見表', order: 1, taskStatements: ['4.1'], services: [], createdBy: 'v1' };
const guideFront = { id: 'guide-test', title: '試験の進め方', order: 1, taskStatements: [], services: [], createdBy: 'v1' };
const body = `\n${PARA}\n\n${PARA}\n\n${PARA}\n`;
const md = (front, text = body) => `---\n${YAML.stringify(front)}---\n${text}`;
const card = (n, over = {}) => ({
  id: `fc-tst-00${n}`, front: `カード ${n} の問いの文`, back: `カード ${n} の答えと理由`, taskStatements: ['4.1'], services: [], tags: [], ...over,
});
const deck = { deck: 'tst', title: '試しのデッキ', createdBy: 'v1', cards: [card(1), card(2)] };
const entry = (term, over = {}) => ({ term, en: term, definition: `${term} の説明の文です（十分な長さ）。`, services: [], related: [], ...over });
const glossary = { createdBy: 'v1', entries: [entry('保存先'), entry('移行')] };

const items = () => {
  const lessons = [{ rel: 'l', data: lessonFront, body }];
  const docs = [{ rel: 'c', data: cheatFront, body, docKind: 'cheatsheet' }, { rel: 'g', data: guideFront, body, docKind: 'guide' }];
  return existingMaterialItems({ lessons, docs, decks: [{ rel: 'd', data: deck }], glossaries: [{ rel: 'x', data: glossary }] });
};
const hashOf = (section, item) => materialHash(section, materialHashInput(section, item));
const rec = (hash, status = 'verified') => ({ status, checkedAt: '2026-11-24', hash });
/** 区分 → 鍵 → 今の内容のハッシュ */
const currentHashes = () => {
  const all = items();
  const key = { glossary: 'term' };
  return Object.fromEntries(EXISTING_SECTIONS.map((s) => [s, Object.fromEntries(all[s].map((it) => [it.data[key[s] ?? 'id'], hashOf(s, it)]))]));
};

const tmp = [];
afterEach(() => {
  for (const root of tmp.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** files: 置き換えるか足すファイル（content/saa-c03 からの相対パス → 中身） */
function fixture({ status, lesson = md(lessonFront), cards = deck.cards, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-existing-'));
  tmp.push(root);
  const contentDir = path.join(root, 'content', 'saa-c03');
  const source = {
    'blueprint.json': read('blueprint.json'), 'services.json': read('services.json'), 'review-status.json': {},
    'lessons/d4/lesson-4.1-storage-test.md': lesson,
    'cheatsheets/cheatsheet-storage-test.md': md(cheatFront),
    'guides/guide-test.md': md(guideFront),
    'flashcards/tst.json': { ...deck, cards },
    'glossary/test.json': glossary,
    ...(status === undefined ? {} : { 'material-status.json': status }),
    ...files,
  };
  for (const [rel, value] of Object.entries(source)) {
    const dest = path.join(contentDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root, contentDir, outDir: path.join(root, 'out') };
}

const CODES = ['material-status-key', 'material-stale-review', 'schema', 'glossary-duplicate'];
const statusIssues = (opts) => checkContent(loadContent({ root: fixture(opts).root })).issues.filter((i) => CODES.includes(i.code));

function build(opts, includeUnverified = false) {
  const dirs = fixture(opts);
  const built = buildContent({ ...dirs, schema, includeUnverified });
  expect(built.errors).toEqual([]);
  const output = (key) => JSON.parse(fs.readFileSync(path.join(dirs.outDir, built.manifest.files[key].path), 'utf8'));
  return { built, output };
}

describe('スキーマ', () => {
  const parse = (v) => schema.MaterialStatusSchema.safeParse(v).success;
  const ok = rec('0123456789ab');

  it('5 つの区分を受け付け、どれも省ける', () => {
    expect(parse({
      lessons: { 'lesson-4.1-storage-test': ok }, cheatsheets: { 'cheatsheet-storage-test': ok }, guides: { 'guide-test': ok },
      flashcards: { 'fc-tst-001': ok }, glossary: { 保存先: ok },
    })).toBe(true);
    expect(parse({ lessons: {} })).toBe(true);
  });

  it('区分に合わない鍵はエラー（早見表とガイドは id の頭で分ける）', () => {
    expect(parse({ lessons: { 'cheatsheet-storage-test': ok } })).toBe(false);
    expect(parse({ cheatsheets: { 'guide-test': ok } })).toBe(false);
    expect(parse({ guides: { 'cheatsheet-storage-test': ok } })).toBe(false);
    expect(parse({ flashcards: { 'card-1': ok } })).toBe(false);
    expect(parse({ glossary: { '': ok } })).toBe(false);
    expect(parse({ glossary: { 保存先: { ...ok, status: 'done' } } })).toBe(false);
  });
});

describe('ハッシュ', () => {
  const all = items();

  it('レッスン・早見表・ガイドは createdBy を除く front matter と本文から作る', () => {
    const [lesson] = all.lessons;
    const h = hashOf('lessons', lesson);
    expect(hashOf('lessons', { ...lesson, data: { ...lesson.data, createdBy: 'v9' } })).toBe(h);
    expect(hashOf('lessons', { ...lesson, data: { ...lesson.data, title: '別の題のレッスン' } })).not.toBe(h);
    expect(hashOf('lessons', { ...lesson, body: `${lesson.body}\n足した段落です。` })).not.toBe(h);
    const [cheat] = all.cheatsheets;
    expect(hashOf('cheatsheets', { ...cheat, data: { ...cheat.data, createdBy: 'v9' } })).toBe(hashOf('cheatsheets', cheat));
    expect(hashOf('cheatsheets', { ...cheat, body: '本文を直した' })).not.toBe(hashOf('cheatsheets', cheat));
  });

  it('カードは 1 枚の全部の欄、用語は 1 語の全部の欄から作る（デッキとファイルの欄は入れない）', () => {
    const [c] = all.flashcards;
    expect(c.data).not.toHaveProperty('createdBy');
    expect(hashOf('flashcards', c)).toBe(materialHash('flashcards', card(1)));
    expect(materialHash('flashcards', card(1, { tags: ['s3'] }))).not.toBe(materialHash('flashcards', card(1)));
    const [e] = all.glossary;
    expect(hashOf('glossary', e)).toBe(materialHash('glossary', entry('保存先')));
    expect(materialHash('glossary', entry('保存先', { related: ['移行'] }))).not.toBe(materialHash('glossary', entry('保存先')));
  });
});

describe('validate', () => {
  it('記録がなければ、エラーも警告も出さない', () => {
    expect(statusIssues({ status: {} })).toEqual([]);
    expect(statusIssues({})).toEqual([]);
  });

  it('今の内容と合う記録は何も出さない', () => {
    expect(statusIssues({ status: currentHashesAsRecords() })).toEqual([]);
  });

  it('存在しない id・用語の記録はエラー', () => {
    const ok = rec('0123456789ab');
    const issues = statusIssues({
      status: {
        lessons: { 'lesson-4.1-absent': ok }, cheatsheets: { 'cheatsheet-absent': ok }, guides: { 'guide-absent': ok },
        flashcards: { 'fc-tst-009': ok }, glossary: { ない用語: ok },
      },
    });
    expect(issues.map((i) => i.code)).toEqual(Array(5).fill('material-status-key'));
    expect(issues.map((i) => i.message).join('\n')).toContain('glossary.ない用語: この term の用語はありません');
  });

  it('記録したあとに内容が変わったものは警告（material-stale-review）', () => {
    const changed = md(lessonFront, `${body}\n足した段落です。\n`);
    const cards = [card(1, { back: '直した答え' }), card(2)];
    const issues = statusIssues({ status: currentHashesAsRecords(), lesson: changed, cards });
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', code: 'material-stale-review' })]);
    expect(issues[0].message).toContain('レッスン lesson-4.1-storage-test');
    expect(issues[0].message).toContain('カード fc-tst-001');
  });

  it('スキーマに通らないカードの記録は、material-status-key にしない（スキーマのエラーに任せる）', () => {
    const issues = statusIssues({ status: { flashcards: { 'fc-tst-002': rec('0123456789ab') } }, cards: [card(1), card(2, { back: '' })] });
    expect(issues.some((i) => i.code === 'material-status-key')).toBe(false);
    expect(issues.some((i) => i.code === 'schema')).toBe(true);
  });
});

function currentHashesAsRecords(status = 'verified') {
  return Object.fromEntries(Object.entries(currentHashes()).map(([s, map]) => [s, Object.fromEntries(Object.entries(map).map(([k, h]) => [k, rec(h, status)]))]));
}

describe('ビルド', () => {
  it('記録がなければ、すべて未検証として既定のビルドに出す', () => {
    const { built, output } = build({});
    expect(output('lessons').map((l) => l.status)).toEqual(['pending']);
    expect(output('docs').map((d) => [d.id, d.status])).toEqual([['cheatsheet-storage-test', 'pending'], ['guide-test', 'pending']]);
    expect(output('flashcards')[0].cards.map((c) => c.status)).toEqual(['pending', 'pending']);
    expect(output('glossary').map((e) => e.status)).toEqual(['pending', 'pending']);
    const c = built.manifest.counts;
    expect(c.flashcards).toBe(2);
    expect(c.glossary).toBe(2);
    expect(c.flashcardsExcluded).toEqual({ 'needs-fix': 0, rejected: 0 });
    expect(c.existingStatus.lessons).toEqual({ verified: 0, pending: 1, 'needs-fix': 0, rejected: 0 });
    expect(c.existingStatus.glossary.pending).toBe(2);
  });

  it('検証済みは verified、内容が変わったものは pending に戻る', () => {
    const { output } = build({ status: currentHashesAsRecords(), lesson: md(lessonFront, `${body}\n足した段落です。\n`) });
    expect(output('lessons')[0].status).toBe('pending');
    expect(output('docs').map((d) => d.status)).toEqual(['verified', 'verified']);
    expect(output('glossary').map((e) => e.status)).toEqual(['verified', 'verified']);
  });

  it.each([false, true])('needs-fix・rejected: レッスン・文書は出し続け、カードと用語は出さない（includeUnverified=%s）', (includeUnverified) => {
    const h = currentHashes();
    const status = {
      lessons: { 'lesson-4.1-storage-test': rec(h.lessons['lesson-4.1-storage-test'], 'needs-fix') },
      guides: { 'guide-test': rec(h.guides['guide-test'], 'rejected') },
      flashcards: { 'fc-tst-001': rec(h.flashcards['fc-tst-001'], 'needs-fix'), 'fc-tst-002': rec(h.flashcards['fc-tst-002'], 'rejected') },
      glossary: { 移行: rec(h.glossary['移行'], 'rejected') },
    };
    const { built, output } = build({ status }, includeUnverified);
    expect(output('lessons')[0].status).toBe('needs-fix');
    expect(output(`lesson:lesson-4.1-storage-test`).body).toContain(PARA);
    expect(output('docs').map((d) => [d.id, d.status])).toEqual([['cheatsheet-storage-test', 'pending'], ['guide-test', 'rejected']]);
    // デッキのカードがすべて除かれたので、デッキも出さない
    expect(output('flashcards')).toEqual([]);
    expect(output('glossary').map((e) => e.term)).toEqual(['保存先']);
    const c = built.manifest.counts;
    expect(c.flashcards).toBe(0);
    expect(c.flashcardsExcluded).toEqual({ 'needs-fix': 1, rejected: 1 });
    expect(c.glossaryExcluded).toEqual({ 'needs-fix': 0, rejected: 1 });
    expect(c.existingStatus.flashcards).toEqual({ verified: 0, pending: 0, 'needs-fix': 1, rejected: 1 });
    expect(c.existingStatus.guides.rejected).toBe(1);
  });

  it('存在しない用語の記録はビルドを止める', () => {
    const built = buildContent({ ...fixture({ status: { glossary: { ない用語: rec('0123456789ab') } } }), schema });
    expect(built.ok).toBe(false);
    expect(built.errors).toContainEqual(expect.stringContaining('material-status.json: glossary.ない用語'));
  });
});

describe('実際の教材', () => {
  const content = loadContent({ root: repoRoot });

  it('coverage の内訳に 5 つの区分があり、件数が教材の数と合う（記録の有無によらない）', () => {
    const rows = computeCoverage(content).materials.status;
    const expected = {
      lessons: content.lessons.length,
      cheatsheets: content.docs.filter((d) => d.docKind === 'cheatsheet').length,
      guides: content.docs.filter((d) => d.docKind === 'guide').length,
      flashcards: content.decks.reduce((n, d) => n + d.data.cards.length, 0),
      glossary: content.glossaries.reduce((n, g) => n + g.data.entries.length, 0),
    };
    for (const [section, total] of Object.entries(expected)) {
      const row = rows.find((x) => x.section === section);
      expect(row.total).toBe(total);
      expect(row.verified + row.pending + row['needs-fix'] + row.rejected).toBe(total);
      expect(row.unrecorded + row.stale).toBeLessThanOrEqual(row.pending);
    }
  });

  it('既定のビルドの出力が、未検証のものを含めて全部の教材を持つ（要修正・却下のカードと用語を除く）', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-existing-real-'));
    tmp.push(out);
    const built = buildContent({ contentDir: repoContent, outDir: out, schema });
    expect(built.ok).toBe(true);
    const c = built.manifest.counts;
    const total = (x) => x.verified + x.pending + x['needs-fix'] + x.rejected;
    expect(c.lessons + c.basicsLessons).toBe(total(c.existingStatus.lessons));
    expect(c.cheatsheets).toBe(total(c.existingStatus.cheatsheets));
    expect(c.guides).toBe(total(c.existingStatus.guides));
    expect(c.flashcards + c.flashcardsExcluded['needs-fix'] + c.flashcardsExcluded.rejected).toBe(total(c.existingStatus.flashcards));
    expect(c.glossary + c.glossaryExcluded['needs-fix'] + c.glossaryExcluded.rejected).toBe(total(c.existingStatus.glossary));
  });
});

describe('同じ用語がファイルをまたいで 2 つあるとき', () => {
  const files = { 'glossary/other.json': { createdBy: 'v1', entries: [entry('保存先', { en: 'Storage' })] } };

  it('validate は重複の警告を出す（記録がなくても）', () => {
    const issues = statusIssues({ files });
    expect(issues).toEqual([expect.objectContaining({ level: 'warning', code: 'glossary-duplicate', file: 'content/saa-c03/glossary/test.json' })]);
    expect(issues[0].message).toContain('保存先');
  });

  it('その用語の記録は、validate とビルドのどちらでもエラー', () => {
    const status = { glossary: { 保存先: rec(currentHashes().glossary['保存先']) } };
    const issues = statusIssues({ files, status });
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'material-status-key' }));
    expect(issues.find((i) => i.code === 'material-status-key').message).toContain('この term の用語が 2 件あり');
    const built = buildContent({ ...fixture({ files, status }), schema });
    expect(built.ok).toBe(false);
    expect(built.errors).toContainEqual(expect.stringContaining('glossary.保存先: この term の用語が 2 件あり'));
  });

  it('ビルドと coverage は、項目の数で数える', () => {
    const { built } = build({ files });
    expect(built.manifest.counts.glossary).toBe(3);
    const s = built.manifest.counts.existingStatus.glossary;
    expect(s.verified + s.pending + s['needs-fix'] + s.rejected).toBe(3);
    const row = computeCoverage(loadContent({ root: fixture({ files }).root })).materials.status.find((x) => x.section === 'glossary');
    expect(row.total).toBe(3);
  });
});

describe('スキーマに通らないファイルの記録', () => {
  const ok = rec('0123456789ab');
  it.each([
    ['レッスン', { lesson: md({ ...lessonFront, estimatedMinutes: 999 }) }, { lessons: { 'lesson-4.1-storage-test': ok } }],
    ['早見表', { files: { 'cheatsheets/cheatsheet-storage-test.md': md({ ...cheatFront, order: -1 }) } }, { cheatsheets: { 'cheatsheet-storage-test': ok } }],
    ['ガイド', { files: { 'guides/guide-test.md': md({ ...guideFront, title: 'x' }) } }, { guides: { 'guide-test': ok } }],
    ['用語集', { files: { 'glossary/test.json': { createdBy: 'v1', entries: [entry('保存先'), entry('移行', { definition: '短い' })] } } }, { glossary: { 移行: ok } }],
  ])('%s: material-status-key にせず、スキーマのエラーに任せる', (_, opts, status) => {
    const issues = statusIssues({ ...opts, status });
    expect(issues.some((i) => i.code === 'material-status-key')).toBe(false);
    expect(issues.some((i) => i.code === 'schema')).toBe(true);
  });
});

describe('ハッシュとサービス名の正規化', () => {
  it('書いたままのサービス名で作り、ビルドで正規名に直しても verified のまま', () => {
    const alias = 'Amazon Managed Streaming for Apache Kafka';
    const c = card(1, { services: [alias] });
    const status = { flashcards: { 'fc-tst-001': rec(materialHash('flashcards', c)) } };
    const { output } = build({ status, cards: [c, card(2)] });
    const [first] = output('flashcards')[0].cards;
    expect(first.services).toEqual(['Amazon MSK']);
    expect(first.status).toBe('verified');
    expect(statusIssues({ status, cards: [c, card(2)] })).toEqual([]);
  });
});

describe('出さない用語と related', () => {
  it('出さない用語は、ほかの語の related から外す', () => {
    const files = { 'glossary/test.json': { createdBy: 'v1', entries: [entry('保存先'), entry('移行', { related: ['保存先', 'ない語'] })] } };
    const status = { glossary: { 保存先: rec(materialHash('glossary', entry('保存先')), 'rejected') } };
    const { output } = build({ files, status });
    expect(output('glossary')).toEqual([expect.objectContaining({ term: '移行', related: ['ない語'] })]);
  });
});
