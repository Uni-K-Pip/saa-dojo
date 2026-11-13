// サービス名の照合。サービス台帳（content/saa-c03/services.json）と blueprint から、
// services 欄や本文に書かれた表記を 1 つの ID と正規名に解決する。
// validate.mjs・coverage.mjs・アプリのビルド（app/scripts/lib/content-build.mjs）が共有する。依存パッケージなし。

export const VENDOR_PREFIX = /^(?:Amazon|AWS)\s+/;
export const normName = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniq = (arr) => [...new Set(arr)];

// 略称らしい形（EC2, S3, KMS）か、大文字を 2 つ以上含む 1 語（DynamoDB, CloudFront）。
// 一般の語と紛らわしい略称は本文検索の対象から外す。
const AMBIGUOUS_FORMS = new Set(['RAM']);
const isDistinctive = (s) =>
  !AMBIGUOUS_FORMS.has(s) && (/^[A-Z0-9]{2,6}$/.test(s) || /^(?=(?:[^A-Z]*[A-Z]){2})[A-Za-z0-9]+$/.test(s));

// aliases: services に書かれても同じサービスとみなす表記 / strong: 本文中の言及を探すときに使う表記
export function serviceNameForms(name) {
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(name);
  const parts = m ? [name, m[1], m[2]] : [name];
  const aliases = new Set(parts);
  for (const p of parts) {
    const stripped = p.replace(VENDOR_PREFIX, '');
    if (stripped !== p && stripped.length >= 2) aliases.add(stripped);
  }
  if (m && !VENDOR_PREFIX.test(m[2])) aliases.add(`AWS ${m[2]}`);
  const strong = new Set([name, m ? m[1] : name]);
  for (const a of aliases) if (VENDOR_PREFIX.test(a) || isDistinctive(a)) strong.add(a);
  return { aliases: [...aliases], strong: [...strong] };
}

export function textMatcher(names) {
  return new RegExp(`(?<![A-Za-z0-9])(?:${names.map(escapeRe).join('|')})(?![A-Za-z0-9])`);
}

// 台帳がないときに、keyServices にしかないサービスに付ける分類名
export const KEY_SERVICE_CATEGORY = 'タスクのキーサービス（services.inScope に未掲載）';

// サービスの出所: blueprint の対象サービス一覧 / タスクの keyServices だけ / どちらにもない（台帳だけ）
export const SOURCES = ['inScope', 'keyServices', 'registry'];

/**
 * サービス名の索引を作る。registry（services.json の中身）がなければ、blueprint の表記をそれぞれ別のサービスとして扱う
 * （台帳を導入する前の動き）。
 *
 * - inScope: 正規名の一覧（台帳の順）
 * - category: 正規名 → 分類
 * - source: 正規名 → 出所（SOURCES）
 * - resolve(name): { kind: 'in', id, canonical, exact, declared? } / { kind: 'out', canonical, exact } / { kind: 'unknown', suggestions }
 *     exact は正規名とそのまま一致したときだけ true。declared は台帳の aliases に書かれた表記のとき true。
 * - formsOf(canonical): 本文中の言及を探すための表記（正規名と別名のすべてから作る）
 * - problems: 台帳の不整合（台帳があるときだけ。validate がエラーにする）
 */
export function buildServiceIndex(blueprint, registry = null) {
  const bpInScope = new Map(); // 名前 -> 分類
  for (const c of blueprint.services.inScope) for (const s of c.services) if (!bpInScope.has(s)) bpInScope.set(s, c.category);
  const bpKey = new Set(blueprint.domains.flatMap((d) => d.taskStatements.flatMap((t) => t.keyServices)));
  const outOfScope = uniq(blueprint.services.outOfScope);
  const problems = [];

  let entries;
  if (registry) {
    entries = registry.services.map((e) => ({ ...e, aliases: e.aliases ?? [] }));
  } else {
    entries = [];
    const seen = new Set();
    const add = (name, category) => {
      if (seen.has(name)) return;
      seen.add(name);
      entries.push({ id: name, name, aliases: [], category });
    };
    for (const [name, cat] of bpInScope) add(name, cat);
    for (const name of bpKey) add(name, KEY_SERVICE_CATEGORY);
  }

  const byId = new Map();
  for (const e of entries) {
    if (byId.has(e.id)) problems.push(`ID ${e.id} が重複しています`);
    else byId.set(e.id, e);
  }

  // 書かれた表記（正規名と aliases）→ 項目
  const declared = new Map();
  for (const e of entries) {
    for (const n of [e.name, ...e.aliases]) {
      const prev = declared.get(n);
      if (prev && prev.id !== e.id) problems.push(`表記「${n}」が ${prev.id} と ${e.id} の両方にあります`);
      else declared.set(n, e);
    }
  }

  // 正規化した表記 → 項目の ID（台帳があるときは 1 つに決まらない表記を解決しない）
  const forms = new Map();
  for (const e of entries) {
    for (const n of [e.name, ...e.aliases]) {
      for (const a of serviceNameForms(n).aliases) {
        const k = normName(a);
        if (!forms.has(k)) forms.set(k, []);
        if (!forms.get(k).includes(e.id)) forms.get(k).push(e.id);
      }
    }
  }
  if (registry) {
    for (const [k, ids] of forms) if (ids.length > 1) problems.push(`表記「${k}」が ${ids.join(' と ')} の両方に当てはまります`);
  }

  const outSet = new Set(outOfScope);
  const outForms = new Map();
  for (const n of outOfScope) {
    for (const a of serviceNameForms(n).aliases) {
      const k = normName(a);
      if (!outForms.has(k)) outForms.set(k, n);
    }
  }

  const inScope = entries.map((e) => e.name);
  const category = new Map(entries.map((e) => [e.name, e.category]));
  const source = new Map(
    entries.map((e) => {
      const names = [e.name, ...e.aliases];
      const s = names.some((n) => bpInScope.has(n)) ? 'inScope' : names.some((n) => bpKey.has(n)) ? 'keyServices' : 'registry';
      return [e.name, s];
    }),
  );

  if (registry) {
    for (const n of [...bpInScope.keys(), ...bpKey]) {
      if (!declared.has(n)) problems.push(`blueprint のサービス「${n}」が台帳にありません（name か aliases に書いてください）`);
    }
    for (const e of entries) {
      if (e.hostedBy !== undefined) {
        const parent = byId.get(e.hostedBy);
        if (!parent) problems.push(`${e.id} の hostedBy（${e.hostedBy}）が台帳にありません`);
        else if (parent.id === e.id) problems.push(`${e.id} の hostedBy が自分自身です`);
        else if (parent.hostedBy !== undefined) problems.push(`${e.id} の hostedBy（${e.hostedBy}）にも hostedBy があります（親は 1 段だけにしてください）`);
      }
      const out = [e.name, ...e.aliases].filter((n) => outSet.has(n));
      if (out.length) problems.push(`${e.id} の表記が blueprint の試験範囲外の一覧にあります: ${out.join(', ')}`);
    }
  }

  const suggest = (name) => {
    const k = normName(name);
    return inScope
      .filter((n) => {
        const nk = normName(n);
        return nk.includes(k) || k.includes(nk);
      })
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
  };

  function resolve(name) {
    const d = declared.get(name);
    if (d) {
      return d.name === name
        ? { kind: 'in', id: d.id, canonical: d.name, exact: true }
        : { kind: 'in', id: d.id, canonical: d.name, exact: false, declared: true };
    }
    if (outSet.has(name)) return { kind: 'out', canonical: name, exact: true };
    const k = normName(name);
    const ids = forms.get(k);
    if (ids && (ids.length === 1 || !registry)) {
      const e = byId.get(ids[0]);
      return { kind: 'in', id: e.id, canonical: e.name, exact: false };
    }
    if (outForms.has(k)) return { kind: 'out', canonical: outForms.get(k), exact: false };
    return { kind: 'unknown', suggestions: suggest(name) };
  }

  /** 正規名に直す（試験範囲のサービスでなければ、そのまま返す） */
  function canonicalize(name) {
    const r = resolve(name);
    return r.kind === 'in' ? r.canonical : name;
  }

  const byName = new Map(entries.map((e) => [e.name, e]));
  function formsOf(canonical) {
    const e = byName.get(canonical);
    const names = e ? [e.name, ...e.aliases] : [canonical];
    return uniq(names.flatMap((n) => serviceNameForms(n).strong));
  }

  return {
    hasRegistry: Boolean(registry),
    entries,
    byId,
    inScope,
    outOfScope,
    category,
    source,
    resolve,
    canonicalize,
    formsOf,
    problems,
    outOfScopeMatchers: outOfScope.map((name) => ({ name, re: textMatcher([name]) })),
  };
}

/** アプリに渡す台帳（別名は導出できる表記まで展開する。アプリ側で表記の規則を再実装しないため） */
export function registrySummary(index) {
  return index.entries.map((e) => {
    const names = [e.name, ...e.aliases];
    const aliases = uniq(names.flatMap((n) => serviceNameForms(n).aliases)).filter((a) => a !== e.name);
    const out = { id: e.id, name: e.name, aliases, category: e.category, source: index.source.get(e.name) };
    if (e.short !== undefined) out.short = e.short;
    if (e.hostedBy !== undefined) out.hostedBy = e.hostedBy;
    return out;
  });
}
