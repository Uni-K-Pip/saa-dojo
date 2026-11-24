import { parseCidr } from './cidr.mjs';

export const DESCRIPTION = '送信元から宛先までの行きと戻りで、通信がどの関門を通り、どこで止まるかを確かめます。';

export const NOT_COVERED = [
  'IPv6 の通信と Egress-Only インターネットゲートウェイは扱いません。',
  '名前解決（DNS）は扱いません。宛先は部品とアドレスで決めます。',
  'VPC ピアリング、Transit Gateway、VPN、Direct Connect の経路は扱いません。',
  'Network Firewall、インターフェイスエンドポイント、リージョン NAT ゲートウェイは扱いません。',
  'ロードバランサーが受けた通信を送り直す中継は扱いません。1 本の通信ずつ追います。',
  '同じサブネットの中の通信、複数のセキュリティグループ、TCP 以外は扱いません。',
];

export const NOT_COVERED_LINKS = {
  [NOT_COVERED[2]]: { lessonRef: 'lesson-3.4-hybrid-and-multi-vpc', label: 'VPC どうしの接続' },
  [NOT_COVERED[3]]: { lessonRef: 'lesson-1.2-vpc-network-security', label: 'NAT ゲートウェイの種類' },
};

export const RULES = {
  'sg-eni': {
    label: 'セキュリティグループの置き場所', text: 'セキュリティグループは部品のネットワークインターフェイスに付きます',
    factRef: 'vpc.quota-sg-per-eni', evidence: ['ネットワークインターフェイスに関連付けられるセキュリティグループ'],
  },
  'sg-allow-only': {
    label: 'セキュリティグループのルール', text: 'セキュリティグループに書けるのは許可ルールだけで、作成直後はインバウンドの許可がなく、アウトバウンドはすべて許可です',
    factRef: 'vpc.sg-stateful-allow-only', evidence: ['許可ルールだけ', 'アウトバウンドはすべて許可'],
  },
  'sg-stateful': {
    label: 'セキュリティグループはステートフル', text: '許可した通信への応答は、逆方向のルールに関係なく通ります',
    factRef: 'vpc.sg-stateful-allow-only', evidence: ['ステートフル', '逆方向のルールに関係なく通る'],
  },
  'sg-reference': {
    label: 'セキュリティグループの参照', text: '送信元に別のセキュリティグループを指定すると、そのグループを付けた部品のプライベート IP アドレスからの通信を許可できます',
    factRef: 'vpc.sg-referencing', evidence: ['そのグループに関連付けられたリソースのプライベート IP アドレス'],
  },
  'nacl-subnet': {
    label: 'ネットワーク ACL の置き場所', text: 'ネットワーク ACL はサブネット単位で通信を許可または拒否します',
    factRef: 'vpc.nacl-stateless', evidence: ['サブネット単位'],
  },
  'nacl-order': {
    label: 'ネットワーク ACL のルールの順', text: 'ネットワーク ACL のルールは番号の小さい順に評価され、一致した時点で適用されます',
    factRef: 'vpc.nacl-stateless', evidence: ['番号の小さい順に評価され、一致した時点で適用される'],
  },
  'nacl-stateless': {
    label: 'ネットワーク ACL はステートレス', text: 'ネットワーク ACL はステートレスなので、応答の通信は自動では許可されません',
    factRef: 'vpc.nacl-stateless', evidence: ['ステートレスなので応答の通信は自動では許可されない'],
  },
  'nacl-final-deny': {
    label: 'カスタムのネットワーク ACL の最後のルール', text: 'どのルールにも一致しない通信は番号が * のルールで拒否されるので、応答のためにクライアントのエフェメラルポートを許可するルールが要ります',
    factRef: 'vpc.nacl-custom-default-deny', evidence: ['番号が * の削除できないルール', 'エフェメラルポート'],
  },
  'nacl-default': {
    label: 'デフォルトのネットワーク ACL', text: 'デフォルトのネットワーク ACL は、サブネットに出入りする IPv4 通信をすべて許可します',
    factRef: 'vpc.nacl-default-allow', evidence: ['IPv4 通信をすべて許可'],
  },
  'nacl-no-prefix-list': {
    label: 'ネットワーク ACL とプレフィックスリスト', text: 'ネットワーク ACL のルールではプレフィックスリストを参照できません',
    factRef: 'vpc.nacl-no-prefix-list', evidence: ['プレフィックスリストを参照できない'],
  },
  'route-table': {
    label: 'ルートテーブルと local ルート', text: 'サブネットから出る通信の行き先はルートテーブルで決まり、どのルートテーブルにも VPC の中の通信のための local ルートがあります',
    factRef: 'vpc.route-table-local', evidence: ['サブネットやゲートウェイから出る通信', 'local ルート'],
  },
  'route-longest': {
    label: 'ルートの優先', text: '複数のルートが当てはまるときは、最も具体的な（プレフィックスが最も長い）ルートが使われます',
    factRef: 'vpc.route-priority', evidence: ['最も具体的な（プレフィックスが最も長い）ルートが使われる'],
  },
  'subnet-kind': {
    label: 'サブネットの種類', text: 'インターネットゲートウェイへの直接のルートがあればパブリック、なければプライベート、VPC の外へのルートが一切なければ分離サブネットです',
    factRef: 'vpc.subnet-types', evidence: ['インターネットゲートウェイへの直接のルートがあればパブリック', 'VPC の外へのルートが一切なければ分離サブネット'],
  },
  'igw-requirements': {
    label: 'インターネットと通信する条件', text: 'IPv4 でインターネットと通信するには、インターネットゲートウェイを VPC にアタッチし、サブネットのルートテーブルにそのゲートウェイへのルートを入れ、インスタンスにパブリック IPv4 アドレスか Elastic IP アドレスを持たせる必要があります',
    factRef: 'vpc.igw-requirements', evidence: ['アタッチし', 'ゲートウェイへのルートを入れ', 'パブリック IPv4 アドレスか Elastic IP アドレス'],
  },
  'igw-nat': {
    label: 'インターネットゲートウェイの付け替え', text: 'インターネットゲートウェイは、IPv4 では 1 対 1 の NAT を行います',
    factRef: 'vpc.igw-basics', evidence: ['1 対 1 の NAT'],
  },
  'igw-inbound': {
    label: 'インターネットから入る通信の宛先', text: 'インスタンスのパブリック IPv4 アドレスか Elastic IP アドレス宛ての通信は、インターネットゲートウェイが宛先をインスタンスのプライベート IPv4 アドレスに変換してから VPC に届けます',
    factRef: 'vpc.igw-inbound-translation', evidence: ['宛先をインスタンスのプライベート IPv4 アドレスに変換してから VPC に届ける'],
  },
  'nat-outbound': {
    label: 'NAT ゲートウェイの向き', text: 'NAT ゲートウェイは内側の部品から外への接続を可能にし、外側からその部品への接続は開始できません',
    factRef: 'nat-gateway.outbound-connections', evidence: ['外部サービスから、そのインスタンスへの接続を開始することはできない'],
  },
  'nat-route-igw': {
    label: 'NAT ゲートウェイから先のルート', text: 'パブリック NAT ゲートウェイでプライベートサブネットからインターネットへ接続するには、NAT ゲートウェイから VPC のインターネットゲートウェイへ通信をルーティングします',
    factRef: 'nat-gateway.public-internet-route', evidence: ['インターネットゲートウェイへトラフィックをルーティング'],
  },
  'nat-eip': {
    label: 'NAT ゲートウェイの Elastic IP アドレス', text: 'ゾーン型のパブリック NAT ゲートウェイを作成するときは、Elastic IP アドレスを関連付ける必要があります',
    factRef: 'nat-gateway.public-elastic-ip', evidence: ['Elastic IP アドレスを関連付ける必要'],
  },
  'nat-no-sg': {
    label: 'NAT ゲートウェイとセキュリティグループ', text: 'NAT ゲートウェイにはセキュリティグループを関連付けられません',
    factRef: 'nat-gateway.no-security-group', evidence: ['セキュリティグループを関連付けられない'],
  },
  'nat-translate': {
    label: 'NAT ゲートウェイの付け替え', text: 'NAT ゲートウェイは、インスタンスの送信元のプライベート IPv4 アドレスを NAT ゲートウェイのプライベート IPv4 アドレスに対応付け、パブリック NAT ゲートウェイでは、インターネットゲートウェイがそれを関連付けられた Elastic IP アドレスに対応付けます。応答の通信は、NAT ゲートウェイが元の送信元 IP アドレスに戻します',
    factRef: 'nat-gateway.source-translation', evidence: ['NAT ゲートウェイのプライベート IPv4 アドレスに対応付ける', '関連付けられた Elastic IP アドレスに対応付ける', '元の送信元 IP アドレスに戻す'],
  },
  'vpce-gateway': {
    label: 'ゲートウェイエンドポイント', text: 'ゲートウェイエンドポイントは、ルートテーブルのプレフィックスリストへのルートで、インターネットゲートウェイや NAT デバイスなしで S3 に接続します',
    factRef: 'vpc.gateway-endpoint-services', evidence: ['インターネットゲートウェイや NAT デバイスなしで接続', 'プレフィックスリストへのルート'],
  },
  'vpce-precedence': {
    label: 'エンドポイントの経路の優先', text: 'ゲートウェイエンドポイントのあるルートテーブルでは、0.0.0.0/0 がインターネットゲートウェイへ向いていても、同じリージョンの S3 宛ての通信にはエンドポイントの経路が優先されます',
    factRef: 'vpc-endpoints.gateway-route-precedence', evidence: ['0.0.0.0/0 がインターネットゲートウェイへ向いていても', 'エンドポイントの経路が優先される'],
  },
  'route-prefix-list': {
    label: 'プレフィックスリストのルートの優先', text: '重なるルートでは、プレフィックスリストを参照するルートであっても、より具体的なルートが常に優先されます',
    factRef: 'vpc.route-priority-prefix-list', evidence: ['より具体的なルートが常に優先される'],
  },
  's3-public-endpoint': {
    label: 'エンドポイントを使わない S3 への通信', text: 'エンドポイントに関連付けのないルートテーブルのサブネットの部品は、エンドポイントではなく公開のサービスエンドポイントを使います',
    factRef: 'vpc-endpoints.gateway-route-association', evidence: ['公開のサービスエンドポイントを使う'],
  },
  'sg-prefix-list': {
    label: 'セキュリティグループとプレフィックスリスト', text: 'セキュリティグループのルールの宛先には、プレフィックスリストの ID を指定できます',
    factRef: 'vpc.sg-rule-sources', evidence: ['プレフィックスリストの ID'],
  },
  'vpce-sg-nacl': {
    label: 'エンドポイントを通る通信の許可', text: 'ゲートウェイエンドポイントを使っても、セキュリティグループとネットワーク ACL が S3 との通信を許可している必要があります',
    factRef: 'vpc-endpoints.gateway-sg-nacl', evidence: ['セキュリティグループとサブネットのネットワーク ACL は、S3 や DynamoDB との通信を許可している必要'],
  },
  'address-match': {
    label: 'アドレスとポートの当たり方', text: 'アドレスが CIDR の範囲に入るか、ポートが範囲に入るかで、ルールとルートが当たるかを決めます',
    lessonRef: 'lesson-basics-ip-subnet-routing',
  },
  'trace-order': {
    label: '関門をたどる順', text: '行きは送信元から宛先へ、戻りはその逆の順に関門をたどり、最初に止まった段で終わります',
    lessonRef: 'lesson-1.2-vpc-network-security',
  },
};

export const OUTPUT_KEYS = {
  trace: {
    delivered: 'boolean', stop: 'enum', stopAt: 'enum', reason: 'enum', routeTarget: 'enum',
    seenSource: 'address', forward: 'array', return: 'array', subnetKinds: 'array',
  },
};

const ANY_IPV4 = '0.0.0.0/0';
const S3 = 'pl-s3';
const directions = ['inbound', 'outbound'];
const isRecord = (value) => Object.prototype.toString.call(value) === '[object Object]';
const isString = (value) => typeof value === 'string';
const isId = (value) => isString(value) && value.length > 0;
const inRange = (value, min, max) => value >= min && value <= max;
const integer = (value, min, max) => Number.isInteger(value) && inRange(value, min, max);
const arrayOf = (value, min, max, check) => Array.isArray(value) && inRange(value.length, min, max) && Array.from(value).every(check);
const objectOf = (value, keys) => isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
const recordOf = (value, min, max, check) => isRecord(value) && inRange(Object.keys(value).length, min, max) &&
  Object.entries(value).every(([key, item]) => isId(key) && check(item));
const unique = (values) => new Set(values).size === values.length;
const portShape = (value) => value === 'all' || (objectOf(value, ['from', 'to']) &&
  integer(value.from, 1, 65535) && integer(value.to, value.from, 65535));
const routeShape = (route) => objectOf(route, ['dest', 'target']) && isString(route.dest) && isString(route.target) &&
  (route.target === 'igw' || route.target === 'vpce-s3' || (route.target.startsWith('nat:') && route.target.length > 4));
const aclRuleShape = (rule) => objectOf(rule, ['rule', 'action', 'ports', 'cidr']) && integer(rule.rule, 1, 32766) &&
  ['allow', 'deny'].includes(rule.action) && portShape(rule.ports) && isString(rule.cidr);
const aclShape = (acl) => acl === 'default' || (objectOf(acl, directions) && directions.every((dir) =>
  arrayOf(acl[dir], 0, 6, aclRuleShape) && unique(acl[dir].map(({ rule }) => rule))));
const sgShape = (sg) => objectOf(sg, directions) && directions.every((dir) =>
  (dir === 'outbound' && sg[dir] === undefined) || arrayOf(sg[dir], 0, 6, (rule) =>
    objectOf(rule, ['ports', 'peer']) && portShape(rule.ports) && isString(rule.peer) && (dir === 'outbound' || rule.peer !== S3)));
const subnetShape = (subnet) => objectOf(subnet, ['id', 'label', 'cidr', 'routeTable', 'nacl']) &&
  isId(subnet.id) && isId(subnet.label) && subnet.label.length <= 12 && isString(subnet.cidr) && isId(subnet.routeTable) && isId(subnet.nacl);
const hostShape = (host) => objectOf(host, ['id', 'label', 'kind', 'subnet', 'ip', 'sg']) &&
  isId(host.id) && isId(host.label) && isId(host.subnet) && isString(host.ip) &&
  (host.kind === 'nat-gateway' ? host.sg === undefined : ['instance', 'alb', 'rds'].includes(host.kind) && isId(host.sg));
const externalShape = (external) => objectOf(external, ['id', 'label', 'kind', 'ip']) && isId(external.id) && isId(external.label) &&
  (external.kind === 's3' ? external.ip === undefined : external.kind === 'internet' && isString(external.ip));
const flowShape = (flow) => objectOf(flow, ['from', 'to', 'port', 'clientPort']) && isId(flow.from) && isId(flow.to) &&
  integer(flow.port, 1, 65535) && integer(flow.clientPort, 1024, 65535);

const fields = {
  vpc: (vpc) => objectOf(vpc, ['cidr', 'igw']) && isString(vpc.cidr) && typeof vpc.igw === 'boolean',
  subnets: (subnets) => arrayOf(subnets, 1, 4, subnetShape),
  routeTables: (tables) => recordOf(tables, 1, 4, (routes) => arrayOf(routes, 0, 5, routeShape)),
  nacls: (nacls) => recordOf(nacls, 1, 4, aclShape),
  securityGroups: (groups) => recordOf(groups, 1, 4, sgShape),
  hosts: (hosts) => arrayOf(hosts, 1, 6, hostShape),
  publicIps: (ips) => recordOf(ips, 0, Infinity, isString),
  externals: (externals) => arrayOf(externals, 0, 3, externalShape) && externals.filter(({ kind }) => kind === 's3').length <= 1,
  flow: flowShape,
};

const failure = (code, message, field) => ({ ok: false, error: { code, message, ...(field && { field }) } });

export function validateInput(config) {
  if (!objectOf(config, ['op', ...Object.keys(fields)]) || config.op !== 'trace') {
    return failure('input', '通信の追跡の設定を指定してください。');
  }
  for (const [field, check] of Object.entries(fields)) {
    if (!check(config[field])) return failure('input', `${field} の項目、形式、個数を確認してください。`, field);
  }
  return run(config);
}

class InputError extends Error {
  constructor(code, message, field) {
    super(message);
    this.result = failure(code, message, field);
  }
}

function requireInput(condition, code, message, field) {
  if (!condition) throw new InputError(code, message, field);
}

function readAddress(value, field, single = false) {
  const block = parseCidr(single ? `${value}/32` : value);
  if (block.ok) return block;
  if (block.error.code === 'ipv6') throw new InputError('ipv6', NOT_COVERED[0], field);
  throw new InputError('format', single ? '10.0.0.10 のように IPv4 アドレスを書いてください。' : block.error.message, field);
}

const includes = (block, address) => inRange(address, block.start, block.end);
const overlaps = (a, b) => a.start <= b.end && b.start <= a.end;
const isHost = (endpoint) => endpoint.subnet !== undefined;
const isNat = (host) => host?.kind === 'nat-gateway';
const isS3 = (endpoint) => endpoint.kind === 's3';
const isNatRoute = (route) => route?.target.startsWith('nat:');

function selectRoute(routes, peer) {
  return routes.find(({ dest, block }) => isS3(peer)
    ? dest === S3 || dest === ANY_IPV4
    : block && includes(block, peer.address));
}

function prepare(config) {
  const { flow } = config;
  const vpc = readAddress(config.vpc.cidr, 'vpc.cidr');
  requireInput(inRange(vpc.prefix, 16, 28), 'vpc-size', 'VPC の CIDR は /16〜/28 にしてください。', 'vpc.cidr');
  const ref = (record, id, field) => {
    requireInput(Object.hasOwn(record, id), 'unknown-ref', `${id} が設定にありません。`, field);
  };
  const subnets = new Map();
  for (const [index, subnet] of config.subnets.entries()) {
    const field = `subnets.${index}`;
    requireInput(!subnets.has(subnet.id), 'unknown-ref', 'サブネットの ID が重複しています。', `${field}.id`);
    const block = readAddress(subnet.cidr, `${field}.cidr`);
    requireInput(includes(vpc, block.start) && includes(vpc, block.end) &&
      [...subnets.values()].every((other) => !overlaps(other.block, block)),
    'subnet-range', 'サブネットは VPC の範囲に収め、ほかのサブネットと重ならないようにしてください。', `${field}.cidr`);
    ref(config.routeTables, subnet.routeTable, `${field}.routeTable`);
    ref(config.nacls, subnet.nacl, `${field}.nacl`);
    subnets.set(subnet.id, { ...subnet, block });
  }

  const endpoints = new Map();
  const addresses = new Set();
  for (const [index, host] of config.hosts.entries()) {
    const field = `hosts.${index}`;
    requireInput(!endpoints.has(host.id), 'unknown-ref', '通信の相手の ID が重複しています。', `${field}.id`);
    const subnet = subnets.get(host.subnet);
    requireInput(subnet, 'unknown-ref', '部品のサブネットが設定にありません。', `${field}.subnet`);
    if (!isNat(host)) ref(config.securityGroups, host.sg, `${field}.sg`);
    const address = readAddress(host.ip, `${field}.ip`, true).start;
    requireInput(inRange(address, subnet.block.start + 4, subnet.block.end - 1) && !addresses.has(address),
      'host-address', '部品には、サブネット内の未使用で予約されていないアドレスを指定してください。', `${field}.ip`);
    addresses.add(address);
    endpoints.set(host.id, { ...host, address });
  }
  for (const [index, external] of config.externals.entries()) {
    const field = `externals.${index}`;
    requireInput(!endpoints.has(external.id), 'unknown-ref', '通信の相手の ID が重複しています。', `${field}.id`);
    if (isS3(external)) {
      endpoints.set(external.id, external);
      continue;
    }
    const address = readAddress(external.ip, `${field}.ip`, true).start;
    requireInput(!includes(vpc, address), 'host-address', 'インターネットの相手には VPC の範囲外のアドレスを指定してください。', `${field}.ip`);
    addresses.add(address);
    endpoints.set(external.id, { ...external, address });
  }
  const publicIps = new Map();
  for (const [id, ip] of Object.entries(config.publicIps)) {
    const field = `publicIps.${id}`;
    requireInput(endpoints.has(id) && isHost(endpoints.get(id)), 'unknown-ref', 'パブリック IP アドレスを付ける部品が設定にありません。', field);
    const address = readAddress(ip, field, true).start;
    requireInput(!includes(vpc, address) && !addresses.has(address), 'host-address',
      'パブリック IP アドレスには VPC の範囲外でほかと重ならないアドレスを指定してください。', field);
    addresses.add(address);
    publicIps.set(id, { ip, address });
  }

  const routeTables = new Map();
  for (const [id, entries] of Object.entries(config.routeTables)) {
    const destinations = new Set();
    const routes = entries.map(({ dest, target }, index) => {
      const field = `routeTables.${id}.${index}`;
      requireInput(!destinations.has(dest), 'route', '同じ宛先のルートが重複しています。', `${field}.dest`);
      destinations.add(dest);
      const block = dest === S3 ? undefined : readAddress(dest, `${field}.dest`);
      requireInput((dest === S3) === (target === 'vpce-s3'), 'route',
        'S3 のプレフィックスリストとゲートウェイエンドポイントは組にしてください。', field);
      requireInput(!block || dest === ANY_IPV4 || !overlaps(vpc, block), 'route',
        '既定ルート以外は VPC の範囲と重ならない宛先を指定してください。', `${field}.dest`);
      if (isNatRoute({ target })) {
        const nat = endpoints.get(target.slice(4));
        requireInput(isNat(nat), 'unknown-ref', 'ルートが指す NAT ゲートウェイが設定にありません。', `${field}.target`);
        requireInput(subnets.get(nat.subnet).routeTable !== id, 'route',
          'NAT ゲートウェイを置いたサブネットのルートが、その NAT ゲートウェイ自身を指す構成は追跡しません。', `${field}.target`);
      }
      return { dest, target, block };
    });
    routes.push({ dest: config.vpc.cidr, target: 'local', block: vpc });
    routes.sort((a, b) => (b.block?.prefix ?? 33) - (a.block?.prefix ?? 33));
    routeTables.set(id, routes);
  }

  const nacls = new Map(Object.entries(config.nacls).map(([id, acl]) => [id, acl === 'default' ? acl :
    Object.fromEntries(directions.map((dir) => [dir, acl[dir].map((rule, index) => ({
      ...rule, block: readAddress(rule.cidr, `nacls.${id}.${dir}.${index}.cidr`),
    })).sort((a, b) => a.rule - b.rule)]))]));
  const securityGroups = new Map(Object.entries(config.securityGroups).map(([id, group]) => [id,
    Object.fromEntries(directions.map((dir) => [dir, group[dir]?.map((rule, index) => {
      const field = `securityGroups.${id}.${dir}.${index}.peer`;
      if (rule.peer.startsWith('sg:')) {
        ref(config.securityGroups, rule.peer.slice(3), field);
        return { ...rule, sg: rule.peer.slice(3) };
      }
      return rule.peer === S3 ? rule : { ...rule, block: readAddress(rule.peer, field) };
    })]))]));

  const from = endpoints.get(flow.from);
  const to = endpoints.get(flow.to);
  requireInput(from, 'unknown-ref', '送信元の ID が設定にありません。', 'flow.from');
  requireInput(to, 'unknown-ref', '宛先の ID が設定にありません。', 'flow.to');
  requireInput(from !== to, 'flow', '送信元と宛先には別の相手を指定してください。', 'flow');
  requireInput(!isNat(from) && !isS3(from), 'flow', 'NAT ゲートウェイと S3 を送信元にした通信は追跡しません。', 'flow.from');
  requireInput(isHost(from) || isHost(to), 'flow', '送信元と宛先のどちらかに VPC 内の部品を指定してください。', 'flow');
  requireInput(!isHost(from) || from.subnet !== to.subnet, 'flow', NOT_COVERED[5], 'flow');
  // NAT ゲートウェイは中継としてだけ扱う。VPC の中の部品から NAT ゲートウェイそのものへ向かう通信は追跡しない
  requireInput(!isHost(from) || !isNat(to), 'flow', 'NAT ゲートウェイは通信を中継する部品として扱うので、VPC の中の部品から NAT ゲートウェイそのものへ向かう通信は追跡しません。', 'flow');

  const routesFor = (host) => routeTables.get(subnets.get(host.subnet).routeTable);
  // インターネットから入る通信が、アタッチされたインターネットゲートウェイを通って（宛先にパブリック IP アドレスがある）、
  // ゲートウェイへのルートのないサブネットの部品に向かう構成は追跡しない。公式の資料が述べるのは、この構成では
  // 通信できないことまでで、どの段で止まるかは述べていないため。ゲートウェイの段で条件を満たさず止まる構成は拒否しない
  if (!isHost(from) && config.vpc.igw && publicIps.has(to.id)) {
    requireInput(selectRoute(routesFor(to), from)?.target === 'igw', 'flow',
      'IPv4 でインターネットと通信するには、インターネットゲートウェイを VPC にアタッチし、サブネットのルートテーブルにそのゲートウェイへのルートを入れ、パブリック IPv4 アドレスか Elastic IP アドレスを持たせる必要があります。宛先の部品のサブネットには相手のアドレスに当てはまるインターネットゲートウェイへのルートがないので、この通信は成り立ちません。この組み合わせは追跡しません。', 'flow');
  }
  const firstRoute = isHost(from) ? selectRoute(routesFor(from), to) : undefined;
  const nat = isNatRoute(firstRoute) ? endpoints.get(firstRoute.target.slice(4)) : undefined;
  if (nat) {
    const nextRoute = selectRoute(routesFor(nat), to);
    requireInput(!nextRoute || nextRoute.target === 'igw', 'flow',
      'NAT ゲートウェイから別の NAT ゲートウェイや S3 のエンドポイントへ向かう経路は追跡できません。', 'flow');
  }
  return { from, to, nat, subnets, routesFor, publicIps, nacls, securityGroups, viaEndpoint: firstRoute?.target === 'vpce-s3' };
}

const portsMatch = (ports, port) => ports === 'all' || inRange(port, ports.from, ports.to);
const cidrMatches = (block, cidr, peer) => isS3(peer) ? cidr === ANY_IPV4 : includes(block, peer.address);
const targetKind = (target) => target?.startsWith('nat:') ? 'nat' : target === 'vpce-s3' ? 'vpce' : target ?? 'none';

export function run(config) {
  let network;
  try {
    network = prepare(config);
  } catch (error) {
    if (error instanceof InputError) return error.result;
    throw error;
  }
  const { from, to, nat, subnets, routesFor, publicIps, nacls, securityGroups, viaEndpoint } = network;
  const used = new Set(['subnet-kind', 'trace-order']);
  const use = (...ids) => ids.forEach((id) => used.add(id));
  const output = {
    delivered: false, stop: 'none', forward: [], return: [],
    subnetKinds: [...subnets.values()].map(({ id }) => {
      const routes = routesFor({ subnet: id });
      const kind = routes.some(({ target }) => target === 'igw') ? 'public' : routes.length > 1 ? 'private' : 'isolated';
      return { subnet: id, kind };
    }),
  };
  let phase = 'forward';
  let source = from;
  let destination = to;
  let port = config.flow.port;

  function stage(gate, at, basis, details = {}, reason) {
    output[phase].push({ gate, at, verdict: reason ? 'stop' : 'pass', basis, ...details });
    if (!reason) return true;
    Object.assign(output, { stop: `${phase}-${gate}`, stopAt: at, reason });
    return false;
  }

  function sg(host, dir) {
    const gate = dir === 'inbound' ? 'sg-in' : 'sg-out';
    use('sg-eni');
    if (viaEndpoint) use('vpce-sg-nacl');
    if (phase === 'return') {
      use('sg-stateful');
      return stage(gate, host.id, 'stateful');
    }
    use('sg-allow-only');
    const rules = securityGroups.get(host.sg)[dir];
    if (!rules) return stage(gate, host.id, 'default-out', { rule: 'default' });
    const peer = dir === 'inbound' ? source : destination;
    const match = rules.findIndex((rule) => {
      use('address-match');
      if (!portsMatch(rule.ports, port)) return false;
      if (rule.sg !== undefined) {
        use('sg-reference');
        return peer.sg === rule.sg;
      }
      if (rule.peer === S3) {
        use('sg-prefix-list');
        return isS3(peer);
      }
      return cidrMatches(rule.block, rule.peer, peer);
    });
    if (match < 0) return stage(gate, host.id, 'rule', {}, 'sg-no-match');
    return stage(gate, host.id, 'rule', { rule: `${dir}-${match + 1}` });
  }

  function acl(host, dir) {
    const gate = dir === 'inbound' ? 'nacl-in' : 'nacl-out';
    const rules = nacls.get(subnets.get(host.subnet).nacl);
    use('nacl-subnet');
    if (viaEndpoint) use('vpce-sg-nacl');
    if (phase === 'return') use('nacl-stateless');
    if (rules === 'default') {
      use('nacl-default');
      return stage(gate, host.subnet, 'rule');
    }
    use('nacl-order');
    // 応答は、クライアントが選んだエフェメラルポート宛て（カスタムの ACL では、その許可が要る）
    if (phase === 'return') use('nacl-final-deny');
    const peer = dir === 'inbound' ? source : destination;
    const match = rules[dir].find((rule) => {
      use('address-match');
      if (isS3(peer)) use('nacl-no-prefix-list');
      return portsMatch(rule.ports, port) && cidrMatches(rule.block, rule.cidr, peer);
    });
    if (!match) {
      use('nacl-final-deny');
      return stage(gate, host.subnet, 'final-deny', { rule: '*' }, 'nacl-no-match');
    }
    return stage(gate, host.subnet, 'rule', { rule: String(match.rule) }, match.action === 'deny' ? 'nacl-deny' : undefined);
  }

  function route(host, fromNat = false) {
    use('route-table', 'route-longest', 'address-match');
    if (fromNat) use('nat-route-igw');
    const routes = routesFor(host);
    const match = selectRoute(routes, destination);
    // S3 宛てでエンドポイントのルートと 0.0.0.0/0 が重なるとき、0.0.0.0/0 がインターネットゲートウェイ向きなら
    // エンドポイントの経路の優先の事実、ほかの向きなら、プレフィックスリストのルートでも具体的なルートが優先される事実が受け持つ
    const any = match?.dest === S3 ? routes.find(({ dest }) => dest === ANY_IPV4) : undefined;
    if (any) use(any.target === 'igw' ? 'vpce-precedence' : 'route-prefix-list');
    if (phase === 'forward' && output.routeTarget === undefined) output.routeTarget = targetKind(match?.target);
    if (!match) return stage('route', host.subnet, 'route', {}, 'no-route');
    const { dest, target } = match;
    return stage('route', host.subnet, 'route', { route: { dest, target } });
  }

  function translate(outbound, peer) {
    const previous = outbound ? source : destination;
    if (outbound) source = peer;
    else destination = peer;
    return { translate: { from: previous.ip, to: peer.ip } };
  }

  function igw(host, outbound) {
    use('igw-requirements');
    if (!config.vpc.igw) return stage('igw', 'igw', 'route', {}, 'no-igw');
    if (isNat(host)) use('nat-eip');
    const publicIp = publicIps.get(host.id);
    if (!publicIp) return stage('igw', 'igw', 'route', {}, 'no-public-ip');
    // NAT ゲートウェイから外へ出る行きは、NAT の事実が受け持つ（インターネットゲートウェイが Elastic IP アドレスに対応付ける）
    // 外から部品へ向かう行きは、宛先の変換の事実が受け持つ
    if (!outbound && phase === 'forward' && !isNat(host)) use('igw-inbound');
    else use(isNat(host) && outbound && phase === 'forward' ? 'nat-translate' : 'igw-nat');
    if (!outbound && phase === 'forward') destination = publicIp;
    return stage('igw', 'igw', 'route', translate(outbound, outbound ? publicIp : host));
  }

  function natGate(host, peer) {
    use('nat-outbound', 'nat-no-sg');
    if (!peer) return stage('nat', host.id, 'no-sg', {}, 'nat-inbound');
    use('nat-translate');
    return stage('nat', host.id, 'no-sg', translate(phase === 'forward', peer));
  }

  function vpce() {
    use('vpce-gateway');
    return stage('vpce', 'vpce-s3', 'route');
  }

  const enter = (host) => acl(host, 'inbound') && (isNat(host) ? natGate(host) : sg(host, 'inbound'));
  const leave = (host) => sg(host, 'outbound') && acl(host, 'outbound') && route(host);
  const arrive = (at) => stage('arrive', at, 'route');

  function forward() {
    // ルートテーブルはサブネットから出る通信の行き先を決めるので、入ってくる通信の段には route がない
    if (!isHost(from)) {
      if (!igw(to, false)) return false;
      use('route-table');
      return enter(to) && arrive(to.id);
    }
    if (isS3(to) && !viaEndpoint) use('s3-public-endpoint');
    if (!leave(from)) return false;
    if (isHost(to)) return enter(to) && arrive(to.id);
    if (viaEndpoint) return vpce() && arrive(to.id);
    if (nat && !(acl(nat, 'inbound') && natGate(nat, nat) && acl(nat, 'outbound') && route(nat, true))) return false;
    return igw(nat ?? from, true) && arrive(to.id);
  }

  function respond() {
    if (!isHost(from)) return leave(to) && igw(to, true) && arrive(from.id);
    if (isHost(to)) return leave(to) && enter(from) && arrive(from.id);
    if (viaEndpoint) return vpce() && enter(from) && arrive(from.id);
    if (!igw(nat ?? from, false)) return false;
    if (nat && !(acl(nat, 'inbound') && natGate(nat, from) && acl(nat, 'outbound') && route(nat))) return false;
    return enter(from) && arrive(from.id);
  }

  if (forward()) {
    output.seenSource = source.ip;
    [source, destination] = [destination, source];
    phase = 'return';
    port = config.flow.clientPort;
    output.delivered = respond();
  }
  return { ok: true, output, rules: Object.keys(RULES).filter((id) => used.has(id)) };
}

export const PRESET = {
  op: 'trace',
  vpc: { cidr: '10.0.0.0/16', igw: true },
  subnets: [
    { id: 'pub', label: 'パブリック', cidr: '10.0.1.0/24', routeTable: 'rt-pub', nacl: 'acl-default' },
    { id: 'app', label: 'アプリ', cidr: '10.0.2.0/24', routeTable: 'rt-app', nacl: 'acl-default' },
    { id: 'data', label: 'データ', cidr: '10.0.3.0/24', routeTable: 'rt-data', nacl: 'acl-default' },
  ],
  routeTables: {
    'rt-pub': [{ dest: ANY_IPV4, target: 'igw' }],
    'rt-app': [{ dest: ANY_IPV4, target: 'nat:nat' }, { dest: S3, target: 'vpce-s3' }],
    'rt-data': [],
  },
  nacls: { 'acl-default': 'default' },
  securityGroups: {
    'sg-alb': { inbound: [{ ports: { from: 443, to: 443 }, peer: ANY_IPV4 }] },
    'sg-app': { inbound: [{ ports: { from: 443, to: 443 }, peer: 'sg:sg-alb' }] },
    'sg-db': { inbound: [{ ports: { from: 3306, to: 3306 }, peer: 'sg:sg-app' }] },
  },
  hosts: [
    { id: 'alb', label: 'ALB', kind: 'alb', subnet: 'pub', ip: '10.0.1.10', sg: 'sg-alb' },
    { id: 'nat', label: 'NAT', kind: 'nat-gateway', subnet: 'pub', ip: '10.0.1.20' },
    { id: 'app', label: 'アプリ', kind: 'instance', subnet: 'app', ip: '10.0.2.10', sg: 'sg-app' },
    { id: 'db', label: 'データベース', kind: 'rds', subnet: 'data', ip: '10.0.3.10', sg: 'sg-db' },
  ],
  publicIps: { alb: '203.0.113.10', nat: '203.0.113.20' },
  externals: [
    { id: 'client', label: 'クライアント', kind: 'internet', ip: '198.51.100.7' },
    { id: 'update', label: '更新サーバー', kind: 'internet', ip: '192.0.2.80' },
    { id: 's3', label: 'S3', kind: 's3' },
  ],
  flow: { from: 'app', to: 's3', port: 443, clientPort: 50000 },
};

export function buildPresetConfig(switches = {}) {
  const { from = PRESET.flow.from, to = PRESET.flow.to, port = PRESET.flow.port, igw = true, appRoute = 'nat',
    s3Endpoint = true, appPublicIp = false, natSubnet = 'pub', appNacl = 'default', appInbound = 'alb' } = switches;
  const config = structuredClone(PRESET);
  config.flow = { ...config.flow, from, to, port };
  config.vpc.igw = igw;
  config.routeTables['rt-app'] = [];
  if (appRoute !== 'none') config.routeTables['rt-app'].push({ dest: ANY_IPV4, target: appRoute === 'nat' ? 'nat:nat' : 'igw' });
  if (s3Endpoint) config.routeTables['rt-app'].push({ dest: S3, target: 'vpce-s3' });
  if (appPublicIp) config.publicIps.app = '203.0.113.30';
  if (natSubnet === 'data') Object.assign(config.hosts.find(isNat), { subnet: 'data', ip: '10.0.3.20' });
  if (appNacl !== 'default') {
    const rules = [{ rule: 100, action: 'allow', ports: { from: 443, to: 443 }, cidr: ANY_IPV4 }];
    if (appNacl === 'ephemeral') rules.push({ rule: 110, action: 'allow', ports: { from: 1024, to: 65535 }, cidr: ANY_IPV4 });
    config.nacls['acl-app'] = { inbound: rules, outbound: structuredClone(rules) };
    config.subnets.find(({ id }) => id === 'app').nacl = 'acl-app';
  }
  config.securityGroups['sg-app'].inbound = appInbound === 'none' ? [] :
    [{ ports: { from: 443, to: 443 }, peer: appInbound === 'alb' ? 'sg:sg-alb' : ANY_IPV4 }];
  return config;
}
