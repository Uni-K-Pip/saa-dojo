// シナリオ、規則、差し込みの検査。validate とアプリのビルドで共用します。
import { effectiveStatus, stableStringify } from './catalog.mjs';
import { SIM_CONFIG_SCHEMAS, SimScenarioSchema } from './schema.mjs';
import { SIMULATORS } from './sims/index.mjs';

const textOf = (value) => JSON.stringify(value) ?? 'なし';
const same = (a, b) => stableStringify(a) === stableStringify(b);
const error = (code, message) => ({ level: 'error', code, message });
const zodMessages = (error) => error.issues.map(({ path, message }) => `${path.join('.') || '全体'}: ${message}`);
const numberFormat = new Intl.NumberFormat('en-US');
const primitiveTypes = { address: 'string', enum: 'string', number: 'number', boolean: 'boolean' };
const hasRef = (scenario, rule) => rule.factRef
  ? scenario.factRefs.includes(rule.factRef)
  : scenario.lessonRefs.includes(rule.lessonRef);

export function simContext({ lessons, catalogEntries, catalogStatus }) {
  return {
    lessonIds: new Set(lessons.map(({ data }) => data.id)),
    facts: new Map(catalogEntries.flatMap(({ data: entry }) => entry.facts.map((fact) => [fact.id, fact]))),
    catalogStatus,
  };
}

export function checkSimRules(engine, ctx) {
  const issues = [];
  // 扱わないことのリンク: 鍵が今の文にあり、リンク先のレッスンがあること
  for (const [line, link] of Object.entries(engine.NOT_COVERED_LINKS ?? {})) {
    if (!engine.NOT_COVERED.includes(line)) issues.push(error('sim-rule-ref', `扱わないことのリンクの鍵「${line}」が NOT_COVERED にありません`));
    if (!ctx.lessonIds.has(link.lessonRef)) issues.push(error('sim-rule-ref', `扱わないことのリンク先のレッスン ${link.lessonRef} がありません`));
  }
  for (const [id, rule] of Object.entries(engine.RULES)) {
    if (rule.factRef) {
      const fact = ctx.facts.get(rule.factRef);
      if (!fact) {
        issues.push(error('sim-rule-fact', `${id}: 事実 ${rule.factRef} がありません`));
        continue;
      }
      if (!Array.isArray(rule.evidence) || !rule.evidence.length || rule.evidence.some((text) => typeof text !== 'string' || !text)) {
        issues.push(error('sim-rule-fact', `${id}: 事実 ${rule.factRef} の本文から根拠の文字列を指定してください`));
        continue;
      }
      for (const evidence of rule.evidence) {
        if (!fact.text.includes(evidence)) {
          issues.push(error('sim-rule-fact', `${id}: 事実 ${rule.factRef} の本文に「${evidence}」がありません`));
        }
      }
      if (effectiveStatus(ctx.catalogStatus, fact.id, 'fact', fact).status !== 'verified') {
        issues.push({ level: 'warning', code: 'sim-rule-fact-unverified', message: `${id}: 事実 ${rule.factRef} は検証済みではありません` });
      }
    } else if (!rule.lessonRef || !ctx.lessonIds.has(rule.lessonRef)) {
      issues.push(error('sim-rule-ref', `${id}: レッスン ${rule.lessonRef ?? '（指定なし）'} がありません`));
    } else if (rule.value !== undefined) {
      issues.push(error('sim-rule-fact', `${id}: 数値を持つ規則には図鑑の事実が必要です`));
    }
  }
  if (engine.NOT_COVERED.length < 1 || engine.NOT_COVERED.length > 6 ||
      engine.NOT_COVERED.some((line) => typeof line !== 'string' || line.length < 10 || line.length > 80)) {
    issues.push(error('sim', '扱わないことは 1〜6 件で、各文は 10〜80 字にしてください'));
  }
  return issues;
}

function expectIssues(expected, run, keys, label) {
  return Object.entries(expected).flatMap(([key, value]) => {
    if (Object.hasOwn(keys, key) && Object.hasOwn(run.output, key) && same(value, run.output[key])) return [];
    return [error('sim-expect', `${label} の ${key}: 期待した値 ${textOf(value)}、エンジンの値 ${textOf(run.output[key])}`)];
  });
}

function predictIssues(scenario, outputKeys, initial) {
  const { key, choices } = scenario.predict;
  const kind = Object.hasOwn(outputKeys, key) ? outputKeys[key] : undefined;
  const type = primitiveTypes[kind];
  const issues = [];
  if (!type || !Object.hasOwn(initial.output, key)) {
    return [error('sim-predict', `predict.key の ${key} は最初の設定の単一の出力項目ではありません`)];
  }
  if (choices.some(({ value }) => typeof value !== type)) {
    issues.push(error('sim-predict', `predict.key の ${key} の選択肢は ${type} にしてください`));
  }
  if (new Set(choices.map(({ value }) => value)).size !== choices.length) {
    issues.push(error('sim-predict', 'predict.choices の value が重複しています'));
  }
  const correctCount = choices.filter(({ value }) => value === initial.output[key]).length;
  if (correctCount !== 1) issues.push(error('sim-predict', `predict の正解は 1 つ必要です（${correctCount} 個）`));
  return issues;
}

export function resolveSimText(text, { engine, keys, run, factHref = () => undefined, useRule = () => {} }) {
  const issues = [];
  const invalid = (message) => {
    issues.push(error('sim-insert', message));
    return '';
  };
  const resolved = text.replace(/\{\{([^{}]*)\}\}/g, (match, token) => {
    const [, kind, key] = /^(rule|out):([a-zA-Z0-9-]+)$/.exec(token) ?? [];
    if (!kind) return invalid(`差し込み ${match} の書き方が違います`);
    if (kind === 'rule') {
      const rule = Object.hasOwn(engine.RULES, key) ? engine.RULES[key] : undefined;
      if (!rule?.text) return invalid(`差し込める規則 ${key} がありません`);
      useRule(key);
      const href = rule.factRef && factHref(rule.factRef);
      return href ? `[${rule.text}](${href})` : rule.text;
    }
    if (!run) return invalid(`${match} は理由だけに書けます`);
    const type = Object.hasOwn(keys, key) ? keys[key] : undefined;
    if (!type || !Object.hasOwn(run.output, key)) return invalid(`この実行の出力に ${key} がありません`);
    if (type === 'number') return numberFormat.format(run.output[key]);
    if (type === 'address') return run.output[key];
    return invalid(`${key}（${type}）は本文に差し込めません`);
  });
  return { text: resolved, issues };
}

function scenarioTexts(scenario, engine, runs, keys, factHref) {
  const issues = [];
  const used = new Set(Object.values(runs).flatMap((run) => run.rules));
  const resolve = (text, label, run) => {
    const result = resolveSimText(text, { engine, keys, run, factHref, useRule: (id) => used.add(id) });
    issues.push(...result.issues.map((issue) => ({ ...issue, message: `${label}: ${issue.message}` })));
    return result.text;
  };
  // 差し込みを展開しない欄に {{…}} があれば、そのまま画面に出てしまうので止める
  const plain = [
    ['title', scenario.title],
    ...scenario.predict.choices.map(({ text }, i) => [`predict.choices.${i}.text`, text]),
    ...scenario.toggles.map(({ id, label }) => [`toggles.${id}.label`, label]),
  ];
  for (const [label, text] of plain) {
    if (text.includes('{{')) issues.push(error('sim-insert', `${label}: この欄には差し込みを書けません`));
  }
  const texts = {
    intro: resolve(scenario.intro, 'intro'),
    predict: { ...scenario.predict, text: resolve(scenario.predict.text, 'predict.text') },
    explain: {
      initial: resolve(scenario.explain.initial, 'explain.initial', runs.initial),
      toggles: Object.fromEntries(scenario.toggles.map(({ id }) => [
        id, resolve(scenario.explain.toggles[id], `explain.toggles.${id}`, runs[id]),
      ])),
    },
  };
  for (const id of used) {
    const rule = Object.hasOwn(engine.RULES, id) ? engine.RULES[id] : undefined;
    if (!rule) issues.push(error('sim-rule-ref', `規則 ${id} がありません`));
    else if (!hasRef(scenario, rule)) {
      issues.push(error('sim-rule-ref', `規則 ${id} の裏づけ ${rule.factRef ?? rule.lessonRef} を参照に含めてください`));
    }
  }
  return { texts, issues };
}

export function checkSimScenario(scenario, ctx) {
  const sim = ctx.sim;
  const engine = ctx.engine ?? SIMULATORS.find(({ id }) => id === sim)?.engine;
  const issues = [];
  const result = () => ({
    issues: issues.map((issue) => ({ ...issue, message: `${scenario?.id ?? 'シナリオ'}: ${issue.message}` })),
  });
  const parsed = SimScenarioSchema.safeParse(scenario);
  if (!parsed.success) {
    issues.push(...zodMessages(parsed.error).map((message) => error('sim', message)));
    return result();
  }
  const schema = ctx.configSchema ?? SIM_CONFIG_SCHEMAS[sim];
  if (!engine || !schema) {
    issues.push(error('sim', `シミュレーター ${sim} がありません`));
    return result();
  }

  const config = schema.safeParse(scenario.config);
  if (!config.success) {
    issues.push(...zodMessages(config.error).map((message) => error('sim', `config: ${message}`)));
    return result();
  }

  const configs = new Map([['initial', config.data]]);
  const toggleIds = new Set();
  for (const { id, set } of scenario.toggles) {
    if (id === 'initial' || toggleIds.has(id)) {
      issues.push(error('sim', `toggle の id ${id} が実行名と重複しています`));
      continue;
    }
    toggleIds.add(id);
    const [key, ...extra] = Object.keys(set);
    if (!key || extra.length || key === 'op') {
      issues.push(error('sim', `toggle ${id} の set は op 以外の最上位の項目を 1 つ指定してください`));
      continue;
    }
    if (same(config.data[key], set[key])) {
      issues.push(error('sim', `toggle ${id} の set は最初の設定と同じです`));
      continue;
    }
    const changed = schema.safeParse({ ...config.data, ...set });
    if (changed.success) configs.set(id, changed.data);
    else issues.push(...zodMessages(changed.error).map((message) => error('sim', `toggle ${id}: ${message}`)));
  }
  for (const [field, records] of [['expect', scenario.expect.toggles], ['explain', scenario.explain.toggles]]) {
    for (const id of toggleIds) {
      if (!Object.hasOwn(records, id)) issues.push(error('sim', `${field}.toggles.${id} がありません`));
    }
    for (const id of Object.keys(records)) {
      if (!toggleIds.has(id)) issues.push(error('sim', `${field}.toggles.${id} に対応する toggle がありません`));
    }
  }
  if (issues.length) return result();
  const runs = Object.fromEntries([...configs].map(([id, data]) => [id, engine.run(data)]));
  for (const [id, run] of Object.entries(runs)) {
    if (!run.ok) issues.push(error('sim', `${id}: ${run.error.message}`));
  }
  if (issues.length) return result();

  const keys = engine.OUTPUT_KEYS[config.data.op];
  for (const [id, run] of Object.entries(runs)) {
    const expected = id === 'initial' ? scenario.expect.initial : scenario.expect.toggles[id];
    issues.push(...expectIssues(expected, run, keys, id));
  }
  issues.push(...predictIssues(scenario, keys, runs.initial));
  for (const id of scenario.factRefs) {
    if (!ctx.facts.has(id)) issues.push(error('sim-rule-ref', `factRefs の事実 ${id} がありません`));
  }
  for (const id of scenario.lessonRefs) {
    if (!ctx.lessonIds.has(id)) issues.push(error('sim-rule-ref', `lessonRefs のレッスン ${id} がありません`));
  }
  const { texts, issues: textIssues } = scenarioTexts(scenario, engine, runs, keys, ctx.factHref);
  issues.push(...textIssues);
  return { ...result(), runs, texts };
}

export function simHashSubject({ createdBy, ...scenario }, engine, runs) {
  const results = runs ?? Object.fromEntries([
    ['initial', engine.run(scenario.config)],
    ...scenario.toggles.map(({ id, set }) => [id, engine.run({ ...scenario.config, ...set })]),
  ]);
  const used = new Set(Object.values(results).flatMap((run) => run.rules ?? []));
  // 文に差し込んだ規則も、画面に出るのでハッシュに含める
  const texts = [scenario.intro, scenario.predict?.text, scenario.explain?.initial, ...Object.values(scenario.explain?.toggles ?? {})];
  for (const text of texts) {
    for (const [, id] of String(text ?? '').matchAll(/\{\{rule:([a-zA-Z0-9-]+)\}\}/g)) if (Object.hasOwn(engine.RULES, id)) used.add(id);
  }
  const rules = Object.fromEntries([...used].map((id) => [id, engine.RULES[id]]));
  return { ...scenario, engine: { description: engine.DESCRIPTION, runs: results, rules, notCovered: engine.NOT_COVERED, notCoveredLinks: engine.NOT_COVERED_LINKS ?? {} } };
}

// 検証状態に渡すデータは、シナリオと全実行の結果を合わせたものです。
export function checkSimFiles(files, ctx) {
  const issues = [];
  const items = [];
  const checked = new Set();
  for (const { rel, data, sim } of files) {
    const add = (found) => issues.push(...found.map((issue) => ({ ...issue, rel })));
    const simulator = SIMULATORS.find(({ id }) => id === sim);
    if (!simulator) {
      add([error('sim', `シミュレーター ${sim} がありません`)]);
      continue;
    }
    const stem = rel.split('/').at(-1).slice(0, -'.json'.length);
    if (typeof data?.id === 'string') {
      if (data.id !== stem) add([error('path-mismatch', `ファイル名と id が違います（ファイル名: ${stem}.json、id: ${data.id}）`)]);
      if (!data.id.startsWith(`sim-${sim}-`)) add([error('path-mismatch', `id ${data.id} は sim-${sim}- で始めてください`)]);
    }
    const { engine } = simulator;
    if (!checked.has(sim)) {
      checked.add(sim);
      // 規則の表はエンジンの側にあるので、エンジンのファイルに付ける
      issues.push(...checkSimRules(engine, ctx).map((issue) => ({ ...issue, rel: `scripts/lib/sims/${sim}.mjs` })));
    }
    const found = checkSimScenario(data, { ...ctx, sim, engine });
    add(found.issues);
    if (!found.issues.length) items.push({ rel, sim, data: simHashSubject(data, engine, found.runs), texts: found.texts });
  }
  return { issues, items };
}
