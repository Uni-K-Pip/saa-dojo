// IPv4 の CIDR とサブネットの計算。
const BASICS = 'lesson-basics-ip-subnet-routing';

// シミュレーターの説明（一覧と画面の冒頭に出る。シナリオのハッシュに入る）
export const DESCRIPTION = 'プレフィックス長を変えて、アドレスの数、予約されるアドレス、範囲の重なりを確かめます。';

export const RULES = {
  'address-math': {
    label: 'アドレスの数と範囲', text: 'プレフィックス長が 1 増えるとアドレスの数は半分になります', lessonRef: BASICS,
  },
  'size-range': {
    label: 'VPC とサブネットの大きさ', value: { min: 16, max: 28 }, text: '/16〜/28',
    factRef: 'vpc.cidr-size', evidence: ['/16', '/28'],
  },
  reserved: {
    label: 'サブネットで予約されるアドレス', value: { head: 4, tail: 1 },
    text: '先頭の 4 つと最後の 1 つ（合わせて 5 つ）',
    factRef: 'vpc.subnet-reserved-ips', evidence: ['先頭の 4 つと最後の 1 つ', '5 つ'],
  },
  'no-overlap-in-vpc': {
    label: '同じ VPC のサブネットの重なり', text: '同じ VPC のサブネットどうしの CIDR は重ねられません',
    factRef: 'vpc.cidr-size', evidence: ['重ねられない'],
  },
  'within-vpc': {
    label: 'サブネットの範囲', text: 'サブネットは VPC のアドレス範囲の中から取ります',
    factRef: 'vpc.subnet-cidr-subset', evidence: ['VPC の CIDR ブロックの一部（サブセット）'],
  },
  'subnet-one-az': {
    label: 'サブネットの AZ', text: 'サブネットは 1 つの AZ に収まります',
    factRef: 'vpc.regional-subnet-az', evidence: ['1 つのアベイラビリティーゾーン'],
  },
  'overlap-math': {
    label: 'CIDR の範囲の関係', text: '範囲が同じか、片方がもう片方を含むときに重なります', lessonRef: 'lesson-3.4-vpc-design',
  },
  'peering-overlap': {
    label: 'VPC ピアリングと CIDR の重なり', text: 'CIDR が一致または重複する VPC どうしではピアリング接続を作れません',
    factRef: 'vpc.peering-overlap', evidence: ['一致または重複'],
  },
  'alb-subnet': {
    label: 'ALB が適切にスケールするための条件', value: { maxPrefix: 27, minFree: 8 },
    text: '/27 か、それより大きい範囲で、空きのアドレスが 8 個以上',
    factRef: 'elb.alb-subnet-capacity', evidence: ['/27', '8 個以上'],
  },
};

export const NOT_COVERED = [
  'IPv6 の CIDR とサブネットは扱いません。',
  'セカンダリ CIDR を足したあとの計算と、足せる範囲の制限は扱いません。',
  'その範囲を VPC に使えるか（プライベートアドレスの範囲かなど）は確かめません。',
  'サブネットの種類はルートで決まります。ここでは層の名前として扱うだけです。',
  'VPC とサブネットの数の上限は扱いません。',
  '使っているアドレスの数は、入力した値だけで数えます。',
];

// 扱わないことの文に付けるレッスンへのリンク（文そのものを鍵にする。文を変えたら鍵も合わせる）
export const NOT_COVERED_LINKS = {
  'その範囲を VPC に使えるか（プライベートアドレスの範囲かなど）は確かめません。': { lessonRef: BASICS, label: 'プライベート IP アドレスの範囲' },
};

export const OUTPUT_KEYS = {
  size: {
    network: 'address', first: 'address', last: 'address', total: 'number', allowed: 'boolean',
    sizeIssue: 'enum', reserved: 'array', usable: 'number', free: 'number', albIssue: 'enum',
  },
  overlap: {
    relation: 'enum', overlaps: 'boolean', sharedCount: 'number', sizeIssueA: 'enum', sizeIssueB: 'enum', peering: 'enum', subnets: 'enum',
  },
  split: { issue: 'enum', fits: 'boolean', needed: 'number', available: 'number', remaining: 'number', subnets: 'array', usableTotal: 'number' },
};

const IPV4_BITS = 32;
const OCTET_SIZE = 256;
const blockSize = (prefix) => 2 ** (IPV4_BITS - prefix);

export function formatIpv4(address) {
  return [3, 2, 1, 0].map((position) => Math.floor(address / OCTET_SIZE ** position) % OCTET_SIZE).join('.');
}

const error = (code, message, details = {}) => ({ ok: false, error: { code, message, ...details } });
const formatError = () => error('format', '10.0.0.0/16 のように書いてください。');

export function parseCidr(cidr) {
  if (typeof cidr !== 'string') return formatError();
  if (cidr.includes(':')) return error('ipv6', NOT_COVERED[0]);
  // 先頭に 0 を付けた数（010 など）は 8 進数とも読めるので受け付けない
  const match = /^((?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3})\/(0|[1-9]\d?)$/.exec(cidr);
  if (!match || match[0] !== cidr) return formatError();
  const octets = match[1].split('.').map(Number);
  const prefix = Number(match[2]);
  if (prefix > IPV4_BITS || octets.some((octet) => octet >= OCTET_SIZE)) return formatError();
  const address = octets.reduce((value, octet) => value * OCTET_SIZE + octet, 0);
  const total = blockSize(prefix);
  const start = Math.floor(address / total) * total;
  if (start !== address) {
    const network = formatIpv4(start);
    return error('not-network', `このプレフィックス長の先頭のアドレスは ${network} です。`, { fix: `${network}/${prefix}` });
  }
  return { ok: true, prefix, start, end: start + total - 1, total };
}

function sizeIssue(prefix) {
  const { min, max } = RULES['size-range'].value;
  if (prefix < min) return 'too-large';
  if (prefix > max) return 'too-small';
  return 'none';
}

const reservedUses = ['ネットワークアドレス', 'VPC ルーター', 'DNS サーバー', '将来用'];
const reservedCount = () => RULES.reserved.value.head + RULES.reserved.value.tail;

function size(config, block) {
  const { start, end, total, prefix } = block;
  const issue = sizeIssue(prefix);
  const first = formatIpv4(start);
  const output = { network: first, first, last: formatIpv4(end), total, allowed: issue === 'none', sizeIssue: issue };
  const rules = ['address-math', 'size-range'];
  if (config.role !== 'subnet' || !output.allowed) return { ok: true, output, rules };

  const { head, tail } = RULES.reserved.value;
  output.reserved = [
    ...Array.from({ length: head }, (_, i) => ({ address: formatIpv4(start + i), use: reservedUses[i] ?? '予約' })),
    ...Array.from({ length: tail }, (_, i) => ({ address: formatIpv4(end - tail + i + 1), use: 'ブロードキャスト用' })),
  ];
  output.usable = total - reservedCount();
  rules.push('reserved');

  if (config.purpose === 'alb') {
    const inUse = config.inUse ?? 0;
    if (inUse > output.usable) return error('in-use', '使用中の数が、割り当てられるアドレスの数を超えています。', { field: 'inUse' });
    const { maxPrefix, minFree } = RULES['alb-subnet'].value;
    output.free = output.usable - inUse;
    output.albIssue = prefix > maxPrefix ? 'prefix' : output.free < minFree ? 'free' : 'none';
    rules.push('alb-subnet');
  }
  return { ok: true, output, rules };
}

function overlap(config, a, b) {
  const sharedCount = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start) + 1);
  const overlaps = sharedCount > 0;
  let relation = 'disjoint';
  if (overlaps) {
    relation = a.start === b.start && a.end === b.end ? 'same' : a.total > b.total ? 'a-contains-b' : 'b-contains-a';
  }
  // 作れない大きさの範囲は、重なりの有無より先にそれを伝える
  const sizeIssueA = sizeIssue(a.prefix);
  const sizeIssueB = sizeIssue(b.prefix);
  const verdict = sizeIssueA !== 'none' || sizeIssueB !== 'none' ? 'size' : overlaps ? 'cannot' : 'can';
  const output = { relation, overlaps, sharedCount, sizeIssueA, sizeIssueB, [config.context]: verdict };
  return {
    ok: true, output,
    rules: ['address-math', 'size-range', 'overlap-math', config.context === 'peering' ? 'peering-overlap' : 'no-overlap-in-vpc'],
  };
}

function splitIssue(vpc, prefix, size, needed) {
  if (sizeIssue(vpc.prefix) !== 'none') return 'vpc-size';
  if (sizeIssue(prefix) !== 'none') return 'subnet-size';
  if (size > vpc.total) return 'subnet-larger';
  if (needed > vpc.total) return 'not-enough';
  return 'none';
}

function split(config, vpc) {
  const { azs, tiers, prefix } = config;
  const total = blockSize(prefix);
  const needed = azs * tiers.length * total;
  const available = vpc.total;
  const issue = splitIssue(vpc, prefix, total, needed);
  const fits = issue === 'none';
  const output = { issue, fits, needed, available, subnets: [] };
  const rules = ['address-math', 'size-range', 'within-vpc'];
  if (fits || issue === 'not-enough') {
    const count = Math.min(azs * tiers.length, Math.floor(available / total));
    const usable = total - reservedCount();
    output.subnets = Array.from({ length: count }, (_, i) => ({
      cidr: `${formatIpv4(vpc.start + i * total)}/${prefix}`,
      az: i % azs + 1,
      tier: tiers[Math.floor(i / azs)].name,
      usable,
    }));
    rules.push('no-overlap-in-vpc', 'subnet-one-az', 'reserved');
    if (fits) {
      output.remaining = available - needed;
      output.usableTotal = usable * count;
    }
  }
  return { ok: true, output, rules };
}

export function run(config) {
  const field = { size: 'cidr', overlap: 'a', split: 'vpc' }[config.op];
  const first = parseCidr(config[field]);
  if (!first.ok) return { ...first, error: { ...first.error, field } };
  if (config.op === 'size') return size(config, first);
  if (config.op === 'split') return split(config, first);
  const second = parseCidr(config.b);
  if (!second.ok) return { ...second, error: { ...second.error, field: 'b' } };
  return overlap(config, first, second);
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function validateInput(config) {
  const invalid = (message) => error('input', message);
  if (!isRecord(config)) return invalid('操作の設定を入力してください。');
  if (config.op === 'size') {
    if (!['vpc', 'subnet'].includes(config.role)) return invalid('VPC またはサブネットを選んでください。');
    if (config.purpose !== undefined && (config.role !== 'subnet' || config.purpose !== 'alb')) {
      return invalid('ALB の条件を確かめるときはサブネットを選んでください。');
    }
    if (config.inUse !== undefined && (config.purpose !== 'alb' || !integerIn(config.inUse, 0, Infinity))) {
      return invalid('ALB の条件を確かめるときは、使用中の数を 0 以上の整数で入力してください。');
    }
  } else if (config.op === 'overlap') {
    if (!['peering', 'subnets'].includes(config.context)) return invalid('ピアリングまたは同じ VPC のサブネットを選んでください。');
  } else if (config.op === 'split') {
    if (!integerIn(config.azs, 1, 4)) return invalid('AZ の数を 1〜4 の整数で入力してください。');
    if (!integerIn(config.prefix, 0, IPV4_BITS)) return invalid('プレフィックス長を 0〜32 の整数で入力してください。');
    if (!Array.isArray(config.tiers) || config.tiers.length < 1 || config.tiers.length > 3 ||
        config.tiers.some((tier) => !isRecord(tier) || typeof tier.name !== 'string' ||
          tier.name.trim().length === 0 || tier.name.length > 12 || !['public', 'private', 'isolated'].includes(tier.kind))) {
      return invalid('層を 1〜3 個にして、それぞれに 1〜12 字の名前と種類を設定してください。');
    }
  } else {
    return invalid('大きさ、重なり、分割のいずれかを選んでください。');
  }
  return run(config);
}
