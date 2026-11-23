// 図の語彙と検査（docs/visual-materials-design.md の 2章・4章・11.3）。
// validate.mjs とアプリのビルド（app/scripts/lib/diagram-build.mjs）が共有する。依存パッケージなし。
// 構造の形はスキーマ（schema.mjs の DiagramSchema）で確かめたあとに、ここで意味を確かめる。
import { DESIGN_WIDTH, layoutDiagram, layoutDiagramReport, textWidth } from './diagram-layout.mjs';
import { checkKindDiagram, layoutKindDiagram, shapeBounds } from './diagram-kinds.mjs';
import { diagramRefOf } from './diagram-refs.mjs';

// ---------------------------------------------------------------- 語彙

// 入れ物（2.2）。word: ラベルに必ず含める種類の語（なければ前に付ける）、prefix: ラベルの前に付ける種類の語、
// fallback: ラベルを省いたときの表示、required: ラベルが必須、family: 交差軸の大きさをそろえる仲間
export const BOX_KINDS = {
  aws: { fallback: 'AWS クラウド' },
  org: { prefix: '組織' },
  ou: { prefix: 'OU' },
  account: { prefix: 'アカウント' },
  region: { fallback: 'リージョン' },
  vpc: { fallback: 'VPC' },
  az: { fallback: 'AZ' },
  'subnet-public': { word: 'パブリック', family: 'subnet' },
  'subnet-private': { word: 'プライベート', family: 'subnet' },
  'subnet-isolated': { word: '分離', family: 'subnet' },
  asg: { fallback: 'Auto Scaling グループ' },
  sg: { word: 'SG' },
  edge: { fallback: 'エッジロケーション' },
  onprem: { fallback: 'オンプレミス' },
  group: { required: true },
};

// サービスでない部品（2.3）。short: 1 行目に出す短い名前（なければ label を 1 行目に出す）、
// fallback: label を省いたときの表示、required: ラベルが必須、category: 色の鍵
export const NODE_VOCAB = {
  actor: { fallback: '利用者', category: 'other' },
  client: { fallback: 'クライアント', category: 'other' },
  internet: { fallback: 'インターネット', category: 'other' },
  server: { fallback: 'サーバー', category: 'other' },
  datastore: { fallback: 'データの置き場所', category: 'other' },
  igw: { short: 'IGW', category: 'network' },
  vgw: { short: 'VGW', category: 'network' },
  cgw: { short: 'CGW', category: 'network' },
  'route-table': { short: 'ルート', category: 'network' },
  nacl: { short: 'NACL', category: 'network' },
  eni: { short: 'ENI', category: 'network' },
  'endpoint-gateway': { short: 'GW 型', category: 'network' },
  'endpoint-interface': { short: 'IF 型', category: 'network' },
  peering: { short: 'ピアリング', category: 'network' },
  policy: { fallback: 'ポリシー', category: 'security' },
  key: { fallback: '鍵', category: 'security' },
  data: { fallback: 'データ', category: 'other' },
  generic: { required: true, category: 'other' },
};

export const EDGE_KINDS = ['request', 'data', 'control', 'blocked'];
export const MARK_STATES = ['down', 'off', 'standby', 'new', 'promoted'];
export const MARK_LABELS = { down: '停止', off: '切り離し', standby: '待機', new: '新規', promoted: '昇格' };

// 上限（2.5。仮の値）
export const DIAGRAM_LIMITS = {
  nodes: 14,
  depth: 5,
  edges: 16,
  steps: 8,
  nodeLabel: 12,
  boxLabel: 20,
  edgeLabel: 16,
  height: 440, // これを超える高さは警告（段階の説明が画面の外に出る）
};

// 色の鍵（app/src/styles.css の --dg-cat-<鍵>）
export const CATEGORY_KEYS = ['compute', 'container', 'storage', 'database', 'network', 'security', 'integration', 'analytics', 'management', 'migration', 'other'];

// 台帳の分類（日本語）→ 色の鍵
const CATEGORY_BY_NAME = {
  分析: 'analytics',
  機械学習: 'analytics',
  アプリケーション統合: 'integration',
  フロントエンドWebとモバイル: 'integration',
  AWSコスト管理: 'management',
  管理とガバナンス: 'management',
  開発者用ツール: 'management',
  コンピューティング: 'compute',
  サーバーレス: 'compute',
  コンテナ: 'container',
  データベース: 'database',
  移行と転送: 'migration',
  ネットワーキングとコンテンツ配信: 'network',
  'セキュリティ、アイデンティティ、コンプライアンス': 'security',
  ストレージ: 'storage',
};

// 分類からは決まらないサービス（「関連機能（試験ガイドの例示に登場）」など）の色の鍵
const CATEGORY_BY_ID = {
  'nat-gateway': 'network',
  'vpc-endpoints': 'network',
  sts: 'security',
  'service-quotas': 'management',
  'trusted-advisor': 'management',
  sct: 'migration',
  firehose: 'analytics',
};

// 正規名から作ると長すぎる、または通じにくい短い名前
const SHORT_OVERRIDES = {
  elb: 'ELB',
  'nat-gateway': 'NAT',
  'ec2-auto-scaling': 'Auto Scaling',
  'auto-scaling': 'Auto Scaling',
  'vpc-endpoints': 'エンドポイント',
  'ec2-spot': 'スポット',
  'aurora-serverless': 'Aurora SL',
  'kinesis-data-streams': 'KDS',
  'kinesis-video-streams': 'KVS',
  'elastic-disaster-recovery': 'DRS',
  'application-migration-service': 'MGN',
  'application-discovery-service': 'Discovery',
  'managed-service-for-prometheus': 'Prometheus',
  'managed-grafana': 'Grafana',
  'serverless-application-repository': 'SAR',
  'vmware-cloud-on-aws': 'VMware',
  'cost-and-usage-report': 'CUR',
  'iam-identity-center': 'Identity Ctr',
  'elastic-beanstalk': 'Beanstalk',
  'site-to-site-vpn': 'S2S VPN',
  'global-accelerator': 'Accelerator',
  'well-architected-tool': 'WA Tool',
  'health-dashboard': 'Health',
  'management-console': 'Console',
  cli: 'CLI',
  // 部品の幅（104）に収まらないもの
  opensearch: 'OpenSearch',
  ecr: 'ECR',
  'compute-optimizer': 'Optimizer',
  'license-manager': 'License Mgr',
  'service-catalog': 'Service Cat.',
  'systems-manager': 'SSM',
  'transfer-family': 'Transfer',
  'transit-gateway': 'TGW',
  'directory-service': 'Directory',
  'firewall-manager': 'FW Manager',
  'network-firewall': 'Network FW',
  ram: 'RAM',
  'secrets-manager': 'Secrets Mgr',
  'storage-gateway': 'Storage GW',
  'trusted-advisor': 'Advisor',
};

const VENDOR_PREFIX = /^(?:Amazon|AWS)\s+/;

/** サービスの短い名前（部品の 1 行目）。service は台帳の 1 件（{ id, name, short? }） */
export function shortNameOf(service) {
  if (service.short) return service.short;
  if (SHORT_OVERRIDES[service.id]) return SHORT_OVERRIDES[service.id];
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(service.name);
  if (m) {
    // 末尾の括弧が略称（AWS KMS、IAM）ならそれを使う。説明（for Apache Cassandra）は使わない
    const inner = m[2].replace(VENDOR_PREFIX, '').trim();
    if (/^[A-Z][A-Za-z0-9-]{1,9}$/.test(inner)) return inner;
    return m[1].replace(VENDOR_PREFIX, '');
  }
  return service.name.replace(VENDOR_PREFIX, '');
}

/** 台帳のサービスを id で引く（serviceIndex は buildServiceIndex の戻り値。なければ null） */
export function serviceOf(serviceIndex, id) {
  return serviceIndex?.hasRegistry === false ? null : (serviceIndex?.byId?.get(id) ?? null);
}

/** 部品の色の鍵。node は部品の node の値。台帳のサービスを語彙より優先する */
export function categoryKeyOf(node, serviceIndex) {
  const service = serviceOf(serviceIndex, node);
  if (service) return CATEGORY_BY_ID[service.id] ?? CATEGORY_BY_NAME[service.category] ?? 'other';
  return NODE_VOCAB[node]?.category ?? 'other';
}

/** 入れ物に表示するラベル（種類の語を補う） */
export function boxLabelOf(kind, label) {
  const info = BOX_KINDS[kind] ?? {};
  if (info.word) return label ? (label.includes(info.word) ? label : `${info.word} ${label}`) : info.word;
  if (info.prefix) return label ? (label.startsWith(info.prefix) ? label : `${info.prefix} ${label}`) : info.prefix;
  return label ?? info.fallback ?? '';
}

/** 部品の表示（short: 1 行目の短い名前。なければ null で、label を 1 行目に太字で出す） */
export function nodeTextOf(node, label, serviceIndex) {
  const service = serviceOf(serviceIndex, node);
  if (service) return { short: shortNameOf(service), label: label ?? null };
  const v = NODE_VOCAB[node];
  if (v?.short) return { short: v.short, label: label ?? null };
  return { short: null, label: label ?? v?.fallback ?? node };
}

// ---------------------------------------------------------------- 木のたどり

/**
 * root の木を深さ優先でたどる。visit(item, info) の info は
 * { type: 'node' | 'box' | 'frame', depth（入れ物の入れ子の深さ。自分が入れ物なら自分を含む）, parentBox（いちばん近い入れ物の id か null）, path }
 */
export function walkDiagram(root, visit) {
  const rec = (item, depth, parentBox, path) => {
    const type = item.node !== undefined ? 'node' : item.box !== undefined ? 'box' : 'frame';
    const d = type === 'box' ? depth + 1 : depth;
    visit(item, { type, depth: d, parentBox, path });
    const nextParent = type === 'box' ? item.id : parentBox;
    (item.children ?? []).forEach((c, i) => rec(c, d, nextParent, `${path}.children[${i}]`));
  };
  (root?.children ?? []).forEach((c, i) => rec(c, 0, null, `root.children[${i}]`));
}

// ---------------------------------------------------------------- 検査

const chars = (s) => Array.from(s).length;

/**
 * 図を検査する（スキーマを通った図が前提）。
 * ctx: { lessonIds: Set, factIds?: Set（無いときは事実の存在を確かめない）, serviceIndex }
 * 戻り値: { errors: string[], warnings: { code, message }[] }
 */
export function checkDiagram(diagram, ctx = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (code, message) => warnings.push({ code, message });
  const { lessonIds, factIds, serviceIndex } = ctx;

  // 裏づけ
  const lessonRefs = diagram.lessonRefs ?? [];
  const factRefs = diagram.factRefs ?? [];
  if (lessonRefs.length + factRefs.length === 0) err('裏づけ（lessonRefs・factRefs）が 1 つもありません');
  if (lessonIds) for (const id of lessonRefs) if (!lessonIds.has(id)) err(`lessonRefs: レッスン ${id} がありません`);
  if (factIds) for (const id of factRefs) if (!factIds.has(id)) err(`factRefs: 図鑑の事実 ${id} がありません`);
  const altLength = chars(diagram.alt);
  if (altLength < 80) warn('diagram-alt-short', `代替文が ${altLength} 字です（目安 80 字以上）。置き場所とつながりを文章で書いてください。`);

  if (diagram.type !== 'architecture') {
    const checked = checkKindDiagram(diagram, ctx);
    errors.push(...checked.errors);
    warnings.push(...checked.warnings);
    if (errors.length === 0) {
      const { scene, warnings: layoutWarnings } = layoutKindDiagram(diagram, { serviceIndex });
      const { left, right } = shapeBounds(scene);
      if (left < 0 || right > DESIGN_WIDTH) {
        err(`図の中身が幅 ${DESIGN_WIDTH} をはみ出しています（左端 ${left}、右端 ${right}）。`);
      }
      if (diagram.type !== 'decision' && scene.height > DIAGRAM_LIMITS.height) {
        warn('diagram-height', `レイアウトした高さが ${scene.height} あります（目安 ${DIAGRAM_LIMITS.height} 以下）。図を分けてください。`);
      }
      warnings.push(...layoutWarnings);
    }
    return { errors, warnings };
  }

  // 木
  const items = new Map(); // id -> { type, item }
  const claim = (id, type, item, where, parentBox) => {
    if (items.has(id)) err(`${where}: id ${id} が図の中で重複しています`);
    else items.set(id, { type, item, parentBox });
  };
  let nodeCount = 0;
  let maxDepth = 0;
  walkDiagram(diagram.root, (item, { type, depth, path, parentBox }) => {
    if (item.id !== undefined) claim(item.id, type, item, path, parentBox);
    maxDepth = Math.max(maxDepth, depth);
    if (type === 'node') {
      nodeCount++;
      const known = serviceOf(serviceIndex, item.node) || NODE_VOCAB[item.node];
      if (!known) err(`${path}: 部品 ${item.node} は台帳のサービスでも部品の語彙でもありません`);
      if (NODE_VOCAB[item.node]?.required && !serviceOf(serviceIndex, item.node) && !item.label) err(`${path}: 部品 ${item.node} にはラベルが要ります`);
      if (item.label && chars(item.label) > DIAGRAM_LIMITS.nodeLabel) err(`${path}: 部品のラベルは ${DIAGRAM_LIMITS.nodeLabel} 字までです（${chars(item.label)} 字）`);
    } else if (type === 'box') {
      if (!BOX_KINDS[item.box]) err(`${path}: 入れ物 ${item.box} は語彙にありません（${Object.keys(BOX_KINDS).join(' / ')}）`);
      else if (BOX_KINDS[item.box].required && !item.label) err(`${path}: 入れ物 ${item.box} にはラベルが要ります`);
      if (item.label && chars(item.label) > DIAGRAM_LIMITS.boxLabel) err(`${path}: 入れ物のラベルは ${DIAGRAM_LIMITS.boxLabel} 字までです（${chars(item.label)} 字）`);
    }
  });
  if (nodeCount > DIAGRAM_LIMITS.nodes) err(`部品が ${nodeCount} 個あります（上限 ${DIAGRAM_LIMITS.nodes}）。図を分けるか段階表示にしてください`);
  if (maxDepth > DIAGRAM_LIMITS.depth) err(`入れ物の入れ子が ${maxDepth} 段あります（上限 ${DIAGRAM_LIMITS.depth}）`);

  // 線
  const edges = diagram.edges ?? [];
  if (edges.length > DIAGRAM_LIMITS.edges) err(`線が ${edges.length} 本あります（上限 ${DIAGRAM_LIMITS.edges}）`);
  const edgeIds = new Set();
  const ancestorsOf = (id) => {
    const out = [];
    for (let p = items.get(id)?.parentBox ?? null; p; p = items.get(p)?.parentBox ?? null) out.push(p);
    return out;
  };
  const endpoint = (id, where) => {
    const hit = items.get(id);
    if (!hit) err(`${where}: ${id} は図にありません`);
    else if (hit.type === 'frame') err(`${where}: ${id} は見えない並べ枠なので線の端にできません`);
  };
  edges.forEach((e, i) => {
    const where = `edges[${i}]（${e.id}）`;
    if (items.has(e.id) || edgeIds.has(e.id)) err(`${where}: id ${e.id} が図の中で重複しています`);
    edgeIds.add(e.id);
    endpoint(e.from, `${where}.from`);
    endpoint(e.to, `${where}.to`);
    if (e.from === e.to) err(`${where}: from と to が同じです`);
    else if (ancestorsOf(e.from).includes(e.to) || ancestorsOf(e.to).includes(e.from)) err(`${where}: 入れ物と、その中の部品・入れ物は線で結べません`);
    if (e.label && chars(e.label) > DIAGRAM_LIMITS.edgeLabel) err(`${where}: 線のラベルは ${DIAGRAM_LIMITS.edgeLabel} 字までです`);
  });

  // 段階
  const steps = diagram.steps ?? [];
  if (steps.length > DIAGRAM_LIMITS.steps) err(`段階が ${steps.length} つあります（上限 ${DIAGRAM_LIMITS.steps}）`);
  const isShape = (id) => items.has(id) && items.get(id).type !== 'frame';
  const revealed = new Map();
  steps.forEach((s, i) => {
    const where = `steps[${i}]`;
    for (const id of s.focus ?? []) if (!isShape(id)) err(`${where}.focus: ${id} は図の部品・入れ物にありません`);
    for (const id of s.edges ?? []) if (!edgeIds.has(id)) err(`${where}.edges: 線 ${id} がありません`);
    for (const id of s.reveal ?? []) {
      if (!isShape(id) && !edgeIds.has(id)) err(`${where}.reveal: ${id} は図の部品・入れ物・線にありません`);
      else if (revealed.has(id)) err(`${where}.reveal: ${id} は steps[${revealed.get(id)}] でも reveal しています`);
      else revealed.set(id, i);
    }
    for (const m of s.marks ?? []) if (!isShape(m.id)) err(`${where}.marks: ${m.id} は図の部品・入れ物にありません`);
    const markIds = (s.marks ?? []).map((m) => m.id);
    for (const id of new Set(markIds.filter((id, k) => markIds.indexOf(id) !== k))) err(`${where}.marks: ${id} が 2 回以上あります`);
  });

  // 段階ごとの見え方（app の stepView と同じ規則）。要素は、自分・外側の入れ物・（線なら）両端の、いちばん遅い reveal の段階から見える
  if (errors.length === 0) {
    const own = (id) => (revealed.has(id) ? revealed.get(id) + 1 : 0);
    const shownAt = (id) => Math.max(own(id), ...ancestorsOf(id).map(own));
    const edgeById = new Map(edges.map((e) => [e.id, e]));
    const visibleFrom = (id) => (edgeById.has(id) ? Math.max(own(id), shownAt(edgeById.get(id).from), shownAt(edgeById.get(id).to)) : shownAt(id));
    for (const [id, i] of revealed) {
      const at = i + 1;
      if (edgeById.has(id)) {
        const e = edgeById.get(id);
        for (const end of [e.from, e.to]) if (shownAt(end) > at) err(`steps[${i}].reveal: 線 ${id} を、端の ${end}（steps[${shownAt(end) - 1}] で現れる）より先に reveal しています`);
      } else {
        for (const p of ancestorsOf(id)) if (own(p) > at) err(`steps[${i}].reveal: ${id} を、外側の入れ物 ${p}（steps[${own(p) - 1}] で現れる）より先に reveal しています`);
      }
    }
    steps.forEach((s, i) => {
      const n = i + 1;
      const where = `steps[${i}]`;
      const hiddenNow = (id) => visibleFrom(id) > n;
      for (const id of s.focus ?? []) if (hiddenNow(id)) err(`${where}.focus: ${id} はこの段階ではまだ隠れています`);
      for (const id of s.edges ?? []) if (hiddenNow(id)) err(`${where}.edges: 線 ${id} はこの段階ではまだ隠れています`);
      for (const m of s.marks ?? []) if (hiddenNow(m.id)) err(`${where}.marks: ${m.id} はこの段階ではまだ隠れています`);
    });
  }

  if (errors.length > 0) return { errors, warnings };

  // レイアウトしてからの検査
  const { scene, warnings: layoutWarnings } = layoutDiagramReport(diagram, { serviceIndex });
  if (scene.width > DESIGN_WIDTH) {
    err(wideDiagramMessage(scene.width));
  }
  if (scene.height > DIAGRAM_LIMITS.height) {
    warn('diagram-height', `レイアウトした高さが ${scene.height} あります（目安 ${DIAGRAM_LIMITS.height} 以下）。段階の説明が画面の外に出るので、図を分けるか、列を行に替えてください`);
  }
  for (const w of layoutWarnings) warn(w.code, w.message);
  for (const n of scene.nodes) {
    const lines = n.short ? [[n.short, 11, true], [n.label ?? '', 10, false]] : [[n.label ?? '', 11, true]];
    const widest = Math.max(...lines.map(([t, size, bold]) => textWidth(t, size, bold)));
    if (widest > n.w - 4) warn('diagram-label', `部品 ${n.id} の文字（${lines.map((l) => l[0]).filter(Boolean).join(' / ')}）が部品の幅に収まりません`);
  }
  for (const hit of edgesThroughNodes(scene)) {
    warn('diagram-overlap', `線 ${hit.edge} が端点でない部品 ${hit.node} の上を通ります`);
  }
  return { errors, warnings };
}

function wideDiagramMessage(width) {
  return `レイアウトした幅が ${width} あります（上限 ${DESIGN_WIDTH}。超えると幅 360px の画面で文字が 11px 未満になります）。横に並べた行を列に替えるか、ラベルを短くしてください`;
}

export function layoutAnyDiagram(diagram, opts) {
  return diagram.type === 'architecture' ? layoutDiagram(diagram, opts) : layoutKindDiagram(diagram, opts).scene;
}

export function diagramRefIndex(items) {
  return new Map(items.map(({ data }) => [
    data.id, { type: data.type, steps: data.type === 'architecture' ? (data.steps?.length ?? 0) : 0 },
  ]));
}

function withoutDiagramCode(markdown) {
  let fence;
  let listDepth = 0;
  const listIndents = [0];
  const text = markdown.split(/\r\n?|\n/).map((line) => {
    const quote = /^(?: {0,3}>[ \t]?)+/.exec(line)?.[0] ?? '';
    const quoteMarks = quote.match(/ {0,3}>[ \t]?/g) ?? [];
    const depth = quoteMarks.length;
    const content = line.slice(quote.length);
    if (fence) {
      const code = line.slice(quoteMarks.slice(0, fence.depth).join('').length);
      if (depth >= fence.depth && (!code.trim() || /^ */.exec(code)[0].length >= fence.indent)) {
        const end = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(code.slice(fence.indent))?.[1];
        if (end && end[0] === fence.mark[0] && end.length >= fence.mark.length) fence = undefined;
        return '';
      }
      fence = undefined;
    }

    if (depth !== listDepth) {
      listDepth = depth;
      listIndents.length = 1;
    }
    if (!content.trim()) return line;
    // リスト内では項目の本文の字下げを起点にフェンスを読みます。
    const indent = /^ */.exec(content)[0].length;
    while (listIndents.at(-1) > indent) listIndents.pop();
    const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)]) {1,4}(?=\S)/.exec(content.slice(listIndents.at(-1)));
    if (list) listIndents.push(listIndents.at(-1) + list[0].length);
    const start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content.slice(listIndents.at(-1)));
    if (start && (start[1][0] === '~' || !start[2].includes('`'))) {
      fence = { mark: start[1], depth, indent: listIndents.at(-1) };
    }
    return fence ? '' : line;
  }).join('\n');
  // 空行をまたがず、同じ数のバッククォートで閉じたコードを検査から除きます。
  return text.split(/(\n[ \t]*\n)/).map((block) =>
    block.replace(/(?<![\\`])(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, (span) => span.replace(/[^\n]+/g, '\0')),
  ).join('');
}

export function parseDiagramRefs(markdown) {
  const text = withoutDiagramCode(markdown);
  const inline = /!?\[(?:\\[^\n]|[^[\]\\]|\[(?:\\[^\n]|[^[\]\\])*\])*\]\(\s*(?:<(#\/diagrams\/[^<>\s]*)>|(#\/diagrams\/[^)\s<>]*))(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?\s*\)/g;
  const definitions = /^ {0,3}\[[^\]\n]+\]:[ \t]*(?:\n[ \t]*)?<?(#\/diagrams\/[^>\s]*)/gm;
  const refs = Array.from(text.matchAll(inline), ([, angleHref, bareHref]) => {
    const href = angleHref ?? bareHref;
    return { href, ...diagramRefOf(href) };
  });
  for (const [, href] of text.matchAll(definitions)) refs.push({ href, reference: true });
  return refs;
}

export function checkDiagramRefs({ texts, diagrams }) {
  const errors = [];
  for (const { rel, body } of texts) {
    for (const { href, id, step, reference } of parseDiagramRefs(body)) {
      const target = diagrams.get(id);
      const maxStep = target?.type === 'architecture' ? target.steps : 0;
      let message;
      if (reference) message = '図の参照は参照形式では書けません。`![キャプション](#/diagrams/<id>)` の形で書いてください。';
      else if (!id) message = `図の参照の形が違います（${href}）。`;
      else if (!target) message = `参照先の図 ${id} がありません。`;
      else if (step !== undefined && step > maxStep) message = `図 ${id} の step=${step} が段階の数（${maxStep}）を超えています。`;
      if (message) errors.push({ rel, message });
    }
  }
  return errors;
}

/** 線の区間が、端点でない部品の矩形を通るものを挙げる */
export function edgesThroughNodes(scene) {
  const out = [];
  for (const e of scene.edges) {
    for (const n of scene.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      const inside = { x1: n.x + 0.5, y1: n.y + 0.5, x2: n.x + n.w - 0.5, y2: n.y + n.h - 0.5 };
      const hit = e.points.slice(1).some((p, i) => segmentHitsRect(e.points[i], p, inside));
      if (hit) out.push({ edge: e.id, node: n.id });
    }
  }
  return out;
}

function segmentHitsRect([ax, ay], [bx, by], r) {
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  return maxX > r.x1 && minX < r.x2 && maxY > r.y1 && minY < r.y2;
}
