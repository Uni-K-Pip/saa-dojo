// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as cidr from '../../../scripts/lib/sims/cidr.mjs';
import { catalogHash } from '../../../scripts/lib/catalog.mjs';
import { materialHash } from '../../../scripts/lib/material-status.mjs';
import { checkSimFiles, checkSimRules, checkSimScenario, resolveSimText, simContext, simHashSubject } from '../../../scripts/lib/sim.mjs';

const read = (rel) => JSON.parse(fs.readFileSync(new URL(`../../../content/saa-c03/${rel}`, import.meta.url), 'utf8'));
const scenario = () => read('sims/cidr/sim-cidr-reserved-addresses.json');
const catalogEntries = ['elb', 'vpc'].map((id) => ({ data: read(`catalog/services/${id}.json`) }));
const catalogStatus = read('catalog-status.json');
const lessons = ['lesson-basics-ip-subnet-routing', 'lesson-3.4-vpc-design'].map((id) => ({ data: { id } }));
const ctx = { sim: 'cidr', ...simContext({ lessons, catalogEntries, catalogStatus }) };
const issuesOf = (value, overrides) => checkSimScenario(value, { ...ctx, ...overrides }).issues;

describe('シナリオの検査', () => {
  it('共通のスキーマと設定の形を検査する', () => {
    expect(issuesOf({ ...scenario(), extra: '追加の項目' })).toMatchObject([{ code: 'sim' }]);
    expect(issuesOf({ ...scenario(), config: undefined })).toMatchObject([{ code: 'sim' }]);
    expect(issuesOf({ ...scenario(), intro: 'あ'.repeat(301) })).toMatchObject([{ code: 'sim' }]);
    expect(issuesOf({ ...scenario(), intro: '# シナリオの状況を書く見出しを置いています。' }))
      .toMatchObject([{ code: 'sim', message: expect.stringContaining('インライン') }]);
    expect(issuesOf({ ...scenario(), config: { ...scenario().config, inUse: 3 } })).toMatchObject([{ code: 'sim' }]);
  });

  it('期待値と実行結果の食い違いに、シナリオ・実行・項目・両方の値を出す', () => {
    const value = scenario();
    value.expect.initial.total = 17;
    value.expect.toggles['prefix-27'].usable = 26;
    value.expect.toggles['prefix-29'].usable = 3;
    expect(issuesOf(value)).toEqual([
      { level: 'error', code: 'sim-expect', message: expect.stringMatching(/sim-cidr-reserved-addresses.*initial.*total.*17.*16/) },
      { level: 'error', code: 'sim-expect', message: expect.stringMatching(/sim-cidr-reserved-addresses.*prefix-27.*usable.*26.*27/) },
      { level: 'error', code: 'sim-expect', message: expect.stringMatching(/prefix-29.*usable.*3.*なし/) },
    ]);
  });

  it('出力項目の一覧と、配列の要素の順を検査する', () => {
    const value = scenario();
    const { output } = cidr.run(value.config);
    value.expect.initial.reserved = [...output.reserved].reverse();
    value.expect.initial.unknown = 42;
    expect(issuesOf(value)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'sim-expect', message: expect.stringContaining('reserved') }),
      expect.objectContaining({ code: 'sim-expect', message: expect.stringContaining('unknown') }),
    ]));
    delete value.expect.initial.unknown;
    value.expect.initial.reserved.reverse();
    expect(issuesOf(value)).toEqual([]);
  });

  it.each([
    [{ cidr: '10.0.0.0/27', role: 'vpc' }, '最上位の項目を 1 つ'],
    [{ op: 'overlap' }, 'op 以外'],
    [{ cidr: '10.0.0.0/28' }, '最初の設定と同じ'],
    [{ unknown: true }, 'toggle prefix-27'],
    [{ cidr: '10.0.0.7/24' }, '先頭のアドレスは 10.0.0.0'],
  ])('toggle の設定を検査する %j', (set, message) => {
    const value = scenario();
    value.toggles[0].set = set;
    expect(issuesOf(value)).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'sim', message: expect.stringContaining(message),
    })]));
  });

  it('toggle と expect・explain の実行名が一致することを検査する', () => {
    const value = scenario();
    delete value.expect.toggles['prefix-27'];
    value.explain.toggles.unknown = value.explain.initial;
    value.toggles[2].id = 'prefix-24';
    const issues = issuesOf(value);
    for (const key of ['重複', 'expect.toggles.prefix-27', 'explain.toggles.unknown']) {
      expect(issues).toContainEqual(expect.objectContaining({ code: 'sim', message: expect.stringContaining(key) }));
    }
  });

  it.each([
    [12, '正解は 1 つ必要です（0 個）'],
    ['11', '選択肢は number'],
    [16, 'value が重複'],
  ])('選択肢を検査する %j', (replacement, message) => {
    const value = scenario();
    value.predict.choices[2].value = replacement;
    expect(issuesOf(value)).toContainEqual(expect.objectContaining({ code: 'sim-predict', message: expect.stringContaining(message) }));
  });

  it('予想には未知の出力・配列・最初の実行にない値を使えない', () => {
    for (const key of ['unknown', 'reserved', 'free']) {
      const value = scenario();
      value.predict.key = key;
      expect(issuesOf(value)).toMatchObject([{ code: 'sim-predict' }]);
    }
  });

  it('エンジンが出さない誤答の値と、順序を持つ配列の期待値を受け付ける', () => {
    const value = scenario();
    value.predict.choices[0].value = -123;
    value.expect.initial.reserved = cidr.run(value.config).output.reserved;
    expect(issuesOf(value)).toEqual([]);
  });

  it('使った規則の裏づけと参照先の存在を検査する', () => {
    const value = scenario();
    value.factRefs = ['vpc.no-such-fact'];
    value.lessonRefs = ['lesson-basics-not-present'];
    const issues = issuesOf(value);
    for (const key of ['vpc.no-such-fact', 'lesson-basics-not-present', 'vpc.cidr-size', lessons[0].data.id]) {
      expect(issues).toContainEqual(expect.objectContaining({ code: 'sim-rule-ref', message: expect.stringContaining(key) }));
    }
  });
});

describe('差し込み', () => {
  const errorKeys = ['bogus', 'free', 'sizeIssue', 'allowed', 'reserved'];
  it.each(errorKeys)('未知・今回の出力にない・差し込めない %s をエラーにする', (key) => {
    const value = scenario();
    value.explain.initial = `この実行の出力を差し込みます。結果は {{out:${key}}} です。`;
    expect(issuesOf(value)).toMatchObject([{ code: 'sim-insert' }]);
  });

  it('予想の前に出力を差し込めない。知らない規則と間違った記法もエラーにする', () => {
    const value = scenario();
    value.intro = 'この状況で表示するアドレスの個数は {{out:total}} 個です。';
    value.predict.text = '結果は {{out:usable}} ですか。';
    value.explain.initial = '差し込みの対象は {{rule:bogus}} と {{output:total}} です。';
    expect(issuesOf(value).map(({ code, message }) => [code, message])).toEqual([
      ['sim-insert', expect.stringContaining('intro:')],
      ['sim-insert', expect.stringContaining('predict.text:')],
      ['sim-insert', expect.stringContaining('規則 bogus')],
      ['sim-insert', expect.stringContaining('書き方が違います')],
    ]);
  });

  it('数は 3 桁区切り、アドレスは原文、図鑑が表示する事実はリンクにする', () => {
    const run = cidr.run({ op: 'size', role: 'vpc', cidr: '10.0.0.0/16' });
    const options = { engine: cidr, keys: cidr.OUTPUT_KEYS.size, run };
    expect(resolveSimText('{{out:total}} 個、{{out:last}}。{{rule:size-range}}', {
      ...options, factHref: () => '#/services/vpc?f=cidr-size',
    })).toEqual({ text: '65,536 個、10.0.255.255。[/16〜/28](#/services/vpc?f=cidr-size)', issues: [] });
    expect(resolveSimText('{{rule:size-range}}', options)).toEqual({ text: '/16〜/28', issues: [] });
  });

  it('説明の文字数上限は展開前に適用する', () => {
    const value = scenario();
    value.explain.initial = 'あ'.repeat(385) + '{{rule:reserved}}';
    expect(issuesOf(value)).toMatchObject([{ code: 'sim' }]);
    value.explain.initial = 'あ'.repeat(383) + '{{rule:reserved}}';
    const found = checkSimScenario(value, { ...ctx, factHref: () => '#/services/vpc?f=subnet-reserved-ips' });
    expect(found.issues).toEqual([]);
    expect(found.texts.explain.initial.length).toBeGreaterThan(400);
  });
});

describe('差し込まない欄', () => {
  it('題・選択肢・toggle の名前に差し込みを書くとエラーにする', () => {
    const value = scenario();
    value.title = '予約の数 {{rule:reserved}}';
    value.predict.choices[0].text = '{{out:usable}} 個';
    value.toggles[0].label = '{{rule:size-range}} にする';
    const codes = issuesOf(value).filter(({ code }) => code === 'sim-insert').map(({ message }) => message);
    expect(codes).toEqual([
      expect.stringContaining('title'),
      expect.stringContaining('predict.choices.0.text'),
      expect.stringContaining(`toggles.${value.toggles[0].id}.label`),
    ]);
  });
});

describe('規則の表', () => {
  it('規則の表のエラーは、シナリオではなくエンジンのファイルに付ける', () => {
    const noElb = { sim: 'cidr', ...simContext({ lessons, catalogEntries: catalogEntries.slice(1), catalogStatus }) };
    const { issues } = checkSimFiles([{ rel: 'content/saa-c03/sims/cidr/sim-cidr-reserved-addresses.json', sim: 'cidr', data: scenario() }], noElb);
    const ruleIssue = issues.find(({ message }) => message.includes('alb-subnet'));
    expect(ruleIssue).toMatchObject({ code: 'sim-rule-fact', rel: 'scripts/lib/sims/cidr.mjs' });
  });

  it('扱わないことのリンクは、今ある文にだけ付ける', () => {
    for (const line of Object.keys(cidr.NOT_COVERED_LINKS)) expect(cidr.NOT_COVERED).toContain(line);
  });

  it('すべての規則の裏づけと扱わないことを検査できる', () => {
    expect(Object.keys(cidr.RULES)).toHaveLength(9);
    expect(checkSimRules(cidr, ctx)).toEqual([]);
  });

  it('事実や本文の根拠がなければエラーにする', () => {
    const facts = structuredClone(ctx.facts);
    facts.delete('elb.alb-subnet-capacity');
    facts.get('vpc.subnet-reserved-ips').text = '予約されることを説明します。';
    expect(checkSimRules(cidr, { ...ctx, facts })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'sim-rule-fact', level: 'error', message: expect.stringContaining('elb.alb-subnet-capacity') }),
      expect.objectContaining({ code: 'sim-rule-fact', level: 'error', message: expect.stringContaining('先頭の 4 つと最後の 1 つ') }),
    ]));
  });

  it('記録が検証済みでも、ハッシュが違う事実は警告にする', () => {
    const fact = catalogEntries[0].data.facts.find(({ id }) => id === 'elb.alb-subnet-capacity');
    const status = { ...catalogStatus, [fact.id]: { status: 'verified', hash: catalogHash('fact', { ...fact, title: '前の題' }) } };
    const context = simContext({ lessons, catalogEntries, catalogStatus: status });
    expect(checkSimRules(cidr, context)).toMatchObject([{ code: 'sim-rule-fact-unverified', level: 'warning' }]);
  });

  it('レッスンの参照先と、扱わないことの個数と字数を検査する', () => {
    const lessonIds = new Set();
    expect(checkSimRules(cidr, { ...ctx, lessonIds })).toContainEqual(expect.objectContaining({ code: 'sim-rule-ref' }));
    for (const NOT_COVERED of [[], ['短文'], ['あ'.repeat(81)], Array(7).fill('ここで扱わないことの説明です。')]) {
      // 文の数と字数だけを見るため、リンクは外す（鍵の検査は下のテスト）
      expect(checkSimRules({ ...cidr, NOT_COVERED, NOT_COVERED_LINKS: {} }, ctx)).toMatchObject([{ code: 'sim', level: 'error' }]);
    }
  });

  it('扱わないことのリンクの鍵が文にあり、リンク先のレッスンがあることを検査する', () => {
    expect(checkSimRules(cidr, ctx)).toEqual([]);
    const [line, link] = Object.entries(cidr.NOT_COVERED_LINKS)[0];
    const moved = { ...cidr, NOT_COVERED_LINKS: { [`${line}（変えた文）`]: link } };
    expect(checkSimRules(moved, ctx)).toMatchObject([{ code: 'sim-rule-ref', message: expect.stringContaining('NOT_COVERED にありません') }]);
    const noLesson = { ...cidr, NOT_COVERED_LINKS: { [line]: { ...link, lessonRef: 'lesson-no-such' } } };
    expect(checkSimRules(noLesson, ctx)).toMatchObject([{ code: 'sim-rule-ref', message: expect.stringContaining('lesson-no-such') }]);
  });
});

describe('検証ハッシュ', () => {
  const hash = (value = scenario(), engine = cidr) => materialHash('sims', simHashSubject(value, engine));
  it('createdBy を除くシナリオの欄を含める', () => {
    expect(hash({ ...scenario(), title: '修正したシナリオの題' })).not.toBe(hash());
    expect(hash({ ...scenario(), createdBy: 'someone' })).toBe(hash());
    expect(simHashSubject(scenario(), cidr)).not.toHaveProperty('createdBy');
  });

  it('全実行の全出力、使った規則の表、扱わないことが変わればハッシュが変わる', () => {
    const run = (config) => {
      const result = cidr.run(config);
      if (result.ok && config.cidr.endsWith('/27')) result.output.last = '10.0.0.30';
      return result;
    };
    expect(issuesOf(scenario(), { engine: { ...cidr, run } })).toEqual([]);
    expect(hash(scenario(), { ...cidr, run })).not.toBe(hash());
    const RULES = { ...cidr.RULES, reserved: { ...cidr.RULES.reserved, text: '規則の文を変更します' } };
    expect(hash(scenario(), { ...cidr, RULES })).not.toBe(hash());
    expect(hash(scenario(), { ...cidr, NOT_COVERED: [...cidr.NOT_COVERED].reverse() })).not.toBe(hash());
    expect(hash(scenario(), { ...cidr, DESCRIPTION: 'シミュレーターの説明を変えます。' })).not.toBe(hash());
    const links = Object.fromEntries(Object.entries(cidr.NOT_COVERED_LINKS).map(([line, link]) => [line, { ...link, label: '別のリンクの文字' }]));
    expect(hash(scenario(), { ...cidr, NOT_COVERED_LINKS: links })).not.toBe(hash());
  });

  it('結果が同じエンジンの作り直しや未使用の規則ではハッシュが変わらない', () => {
    const run = (config) => structuredClone(cidr.run({ ...config }));
    const RULES = { ...cidr.RULES, 'alb-subnet': { ...cidr.RULES['alb-subnet'], text: '別の文' } };
    expect(hash(scenario(), { ...cidr, run, RULES })).toBe(hash());
  });

  it('文に差し込んだ規則の表が変わればハッシュが変わる（実行で使っていない規則でも）', () => {
    const base = scenario();
    const value = { ...base, explain: { ...base.explain, initial: `${base.explain.initial}{{rule:alb-subnet}}` } };
    const RULES = { ...cidr.RULES, 'alb-subnet': { ...cidr.RULES['alb-subnet'], text: '別の文' } };
    expect(hash(value, { ...cidr, RULES })).not.toBe(hash(value));
  });
});
