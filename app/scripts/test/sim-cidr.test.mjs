// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NOT_COVERED, RULES, parseCidr, run, validateInput } from '../../../scripts/lib/sims/cidr.mjs';

const cidrSize = (prefix, extra = {}) => run({ op: 'size', cidr: `0.0.0.0/${prefix}`, role: 'subnet', ...extra });
const overlap = (a, b, context = 'peering') => run({ op: 'overlap', a, b, context });
const tiers = [
  { name: 'パブリック', kind: 'public' },
  { name: 'アプリ', kind: 'private' },
  { name: 'データ', kind: 'isolated' },
];
const split = (extra = {}) => run({ op: 'split', vpc: '10.0.0.0/24', azs: 2, tiers: tiers.slice(0, 2), prefix: 26, ...extra });

// 参照実装: エンジンとは別に、BigInt とビットマスクだけで正解を出す。
const ALL = 0xffffffffn;
const toBig = (address) => address.split('.').reduce((n, octet) => (n << 8n) | BigInt(octet), 0n);
const toText = (n) => [24n, 16n, 8n, 0n].map((shift) => String((n >> shift) & 255n)).join('.');
const maskOf = (prefix) => (ALL << BigInt(32 - prefix)) & ALL;
const networkOf = (address, prefix) => toBig(address) & maskOf(prefix);
const countOf = (prefix) => 1n << BigInt(32 - prefix);
const lastOf = (address, prefix) => networkOf(address, prefix) | (~maskOf(prefix) & ALL);
const sizeIssueOf = (prefix) => (prefix < 16 ? 'too-large' : prefix > 28 ? 'too-small' : 'none');
const containsBlock = (outer, inner) => outer.prefix <= inner.prefix && (inner.network & maskOf(outer.prefix)) === outer.network;
const block = (address, prefix) => ({ prefix, network: networkOf(address, prefix) });
const blockText = ({ network, prefix }) => `${toText(network)}/${prefix}`;
const verdictOf = (a, b, shared) => (sizeIssueOf(a.prefix) !== 'none' || sizeIssueOf(b.prefix) !== 'none' ? 'size' : shared > 0n ? 'cannot' : 'can');
function referenceOverlap(a, b) {
  let relation = 'disjoint';
  let shared = 0n;
  if (containsBlock(a, b) || containsBlock(b, a)) {
    shared = countOf(Math.max(a.prefix, b.prefix));
    relation = a.prefix === b.prefix ? 'same' : a.prefix < b.prefix ? 'a-contains-b' : 'b-contains-a';
  }
  return { relation, shared };
}
function referenceSplit(vpcBlock, azs, layerCount, prefix) {
  const needed = BigInt(azs * layerCount) * countOf(prefix);
  const available = countOf(vpcBlock.prefix);
  let issue = 'none';
  if (sizeIssueOf(vpcBlock.prefix) !== 'none') issue = 'vpc-size';
  else if (sizeIssueOf(prefix) !== 'none') issue = 'subnet-size';
  else if (prefix < vpcBlock.prefix) issue = 'subnet-larger';
  else if (needed > available) issue = 'not-enough';
  return { issue, needed, available };
}
const BASES = ['0.0.0.0', '1.2.3.4', '10.0.0.0', '10.0.128.0', '10.1.0.0', '127.0.0.1', '128.0.0.0', '172.16.0.0', '192.168.1.0',
  '223.255.255.255', '255.0.0.0', '255.255.255.0', '255.255.255.254', '255.255.255.255'];

describe('CIDR の入力', () => {
  it.each(['', '10.0.0/24', '10.0.0.0.0/24', '256.0.0.0/24', '10.-1.0.0/24', '10.0.0.0', '10.0.0.0/33', '10.0.0.0/-1', '10.0.0.0/1.5'])(
    '形・範囲の違う %s をエラーにする', (value) => expect(parseCidr(value)).toMatchObject({ ok: false, error: { code: 'format' } }),
  );

  it('IPv6 とネットワークアドレスでない入力を区別する', () => {
    expect(parseCidr('2001:db8::/32')).toMatchObject({ ok: false, error: { code: 'ipv6', message: NOT_COVERED[0] } });
    expect(parseCidr('10.0.0.5/24')).toMatchObject({ ok: false, error: { code: 'not-network', fix: '10.0.0.0/24' } });
    expect(parseCidr('255.255.255.255/0')).toMatchObject({ error: { fix: '0.0.0.0/0' } });
  });

  it.each(['010.0.0.0/16', '10.0.0.0/08', '10.00.0.0/16', '10.0.0.0/016'])('先頭に 0 を付けた数 %s はエラーにする', (value) => {
    expect(parseCidr(value)).toMatchObject({ ok: false, error: { code: 'format' } });
    expect(run({ op: 'size', cidr: value, role: 'vpc' })).toMatchObject({ ok: false, error: { code: 'format', field: 'cidr' } });
  });

  it('/0 と /32 は run でも正しく通る', () => {
    expect(run({ op: 'size', cidr: '0.0.0.0/0', role: 'vpc' }).output).toMatchObject({ first: '0.0.0.0', last: '255.255.255.255', total: 4294967296 });
    expect(run({ op: 'size', cidr: '255.255.255.255/32', role: 'vpc' }).output).toMatchObject({ first: '255.255.255.255', last: '255.255.255.255', total: 1 });
  });

  it('/0 と /32 は符号なしの全範囲と 1 個のアドレスになる', () => {
    expect(parseCidr('0.0.0.0/0')).toEqual({ ok: true, prefix: 0, start: 0, end: 4294967295, total: 4294967296 });
    expect(parseCidr('255.255.255.255/32')).toEqual({ ok: true, prefix: 32, start: 4294967295, end: 4294967295, total: 1 });
  });

  it.each([
    {}, { op: 'size', role: 'other' }, { op: 'size', role: 'vpc', purpose: 'alb' },
    { op: 'size', role: 'subnet', purpose: 'alb', inUse: -1 },
    { op: 'size', role: 'subnet', inUse: 1 },
    { op: 'overlap', context: 'other' }, { op: 'split', azs: 0 }, { op: 'split', azs: 4, prefix: 40 },
    { op: 'split', azs: 4, prefix: 24, tiers: [] }, { op: 'split', azs: 1, prefix: 24, tiers: [{ name: ' ', kind: 'public' }] },
  ])('自由に試す設定の形を検査する %j', (input) => {
    expect(validateInput(input)).toMatchObject({ ok: false, error: { code: 'input', message: expect.any(String) } });
  });
});

describe('大きさ', () => {
  it.each([[15, false, 'too-large'], [16, true, 'none'], [28, true, 'none'], [29, false, 'too-small']])(
    '/%i の境界', (prefix, allowed, sizeIssue) => expect(cidrSize(prefix)).toMatchObject({ ok: true, output: { allowed, sizeIssue } }),
  );

  it('予約は先頭から順に用途が決まり、最後にも 1 つある', () => {
    expect(cidrSize(28, { cidr: '10.0.0.0/28' })).toMatchObject({
      output: { usable: 11, reserved: [
        { address: '10.0.0.0', use: 'ネットワークアドレス' },
        { address: '10.0.0.1', use: 'VPC ルーター' },
        { address: '10.0.0.2', use: 'AWS が予約' },
        { address: '10.0.0.3', use: '将来用' },
        { address: '10.0.0.15', use: 'ブロードキャスト用' },
      ] },
      rules: ['address-math', 'size-range', 'reserved'],
    });
    const vpc = cidrSize(24, { role: 'vpc' });
    expect(vpc.output).not.toHaveProperty('reserved');
    expect(vpc.output).not.toHaveProperty('usable');
    expect(vpc.rules).toEqual(['address-math', 'size-range']);
  });

  it('ALB は範囲と空きの境目を見て、両方を満たさないときは範囲を先に出す', () => {
    expect(cidrSize(27, { purpose: 'alb', inUse: 20 }).output).toMatchObject({ free: 7, albIssue: 'free' });
    expect(cidrSize(27, { purpose: 'alb', inUse: 19 }).output).toMatchObject({ free: 8, albIssue: 'none' });
    expect(cidrSize(28, { purpose: 'alb' }).output).toMatchObject({ free: 11, albIssue: 'prefix' });
    expect(cidrSize(28, { purpose: 'alb', inUse: 4 })).toMatchObject({
      output: { free: 7, albIssue: 'prefix' },
      rules: ['address-math', 'size-range', 'reserved', 'alb-subnet'],
    });
    expect(cidrSize(28, { purpose: 'alb', inUse: 12 })).toMatchObject({ ok: false, error: { code: 'in-use' } });
    expect(cidrSize(29, { purpose: 'alb' }).output).not.toHaveProperty('free');
  });

  it('決まったアドレス × /0〜/32 で、参照実装の範囲、判定、予約と一致する', () => {
    for (const base of BASES) for (let prefix = 0; prefix <= 32; prefix++) {
      const network = networkOf(base, prefix);
      const cidr = `${base}/${prefix}`;
      if (toBig(base) !== network) {
        expect(run({ op: 'size', cidr, role: 'subnet' }), cidr).toMatchObject({
          ok: false, error: { code: 'not-network', fix: `${toText(network)}/${prefix}`, field: 'cidr' },
        });
        continue;
      }
      const total = countOf(prefix);
      const allowed = sizeIssueOf(prefix) === 'none';
      const subnet = run({ op: 'size', cidr, role: 'subnet' });
      expect(subnet.ok, cidr).toBe(true);
      expect(subnet.output, cidr).toMatchObject({
        network: base, first: base, last: toText(lastOf(base, prefix)), total: Number(total), allowed, sizeIssue: sizeIssueOf(prefix),
      });
      const vpc = run({ op: 'size', cidr, role: 'vpc' });
      expect(vpc.output, cidr).toMatchObject({ allowed, sizeIssue: sizeIssueOf(prefix), total: Number(total) });
      expect(vpc.output, cidr).not.toHaveProperty('reserved');
      if (allowed) {
        expect(subnet.output.usable, cidr).toBe(Number(total - 5n));
        const expected = [0n, 1n, 2n, 3n, total - 1n].map((offset) => toText(network + offset));
        expect(subnet.output.reserved.map(({ address }) => address), cidr).toEqual(expected);
      } else {
        expect(subnet.output, cidr).not.toHaveProperty('reserved');
        expect(subnet.output, cidr).not.toHaveProperty('usable');
      }
    }
  });

  it('計算は規則の表の値を参照する', () => {
    const range = RULES['size-range'].value;
    const reservation = RULES.reserved.value;
    const alb = RULES['alb-subnet'].value;
    const saved = [range.max, reservation.head, reservation.tail, alb.maxPrefix, alb.minFree];
    try {
      range.max = 29;
      expect(cidrSize(29).output.allowed).toBe(true);
      reservation.head = 3;
      reservation.tail = 2;
      expect(cidrSize(28).output.reserved.map(({ address }) => address)).toEqual(['0.0.0.0', '0.0.0.1', '0.0.0.2', '0.0.0.14', '0.0.0.15']);
      reservation.tail = 1;
      expect(cidrSize(28).output.usable).toBe(12);
      expect(split().output.usableTotal).toBe(240);
      alb.maxPrefix = 28;
      alb.minFree = 12;
      expect(cidrSize(28, { purpose: 'alb' }).output.albIssue).toBe('none');
      alb.minFree = 13;
      expect(cidrSize(28, { purpose: 'alb' }).output.albIssue).toBe('free');
    } finally {
      [range.max, reservation.head, reservation.tail, alb.maxPrefix, alb.minFree] = saved;
    }
  });
});

describe('重なり', () => {
  it.each([
    ['10.0.0.0/16', '10.0.0.0/16', 'same', 65536, 'none', 'none'],
    ['10.0.0.0/16', '10.0.128.0/17', 'a-contains-b', 32768, 'none', 'none'],
    ['10.0.128.0/17', '10.0.0.0/16', 'b-contains-a', 32768, 'none', 'none'],
    ['10.0.0.0/17', '10.0.128.0/17', 'disjoint', 0, 'none', 'none'],
    ['10.0.0.0/16', '10.2.0.0/16', 'disjoint', 0, 'none', 'none'],
    ['0.0.0.0/0', '255.255.255.255/32', 'a-contains-b', 1, 'too-large', 'too-small'],
    ['10.0.0.0/8', '11.0.0.0/8', 'disjoint', 0, 'too-large', 'too-large'],
  ])('%s と %s の関係', (a, b, relation, sharedCount, sizeIssueA, sizeIssueB) => {
    const sized = sizeIssueA !== 'none' || sizeIssueB !== 'none';
    const verdict = sized ? 'size' : sharedCount ? 'cannot' : 'can';
    const peering = overlap(a, b);
    expect(peering).toMatchObject({
      ok: true,
      output: { relation, sharedCount, overlaps: sharedCount > 0, sizeIssueA, sizeIssueB, peering: verdict },
      rules: ['address-math', 'size-range', 'overlap-math', 'peering-overlap'],
    });
    expect(peering.output).not.toHaveProperty('subnets');
    const subnets = overlap(a, b, 'subnets');
    expect(subnets).toMatchObject({
      output: { subnets: verdict },
      rules: ['address-math', 'size-range', 'overlap-math', 'no-overlap-in-vpc'],
    });
    expect(subnets.output).not.toHaveProperty('peering');
  });

  it('決まった範囲どうしの全組で、参照実装の関係、共有数、大きさの判定、結論と一致する', () => {
    const seen = new Set();
    const blocks = [];
    for (const base of BASES) for (const prefix of [0, 8, 12, 15, 16, 17, 24, 28, 29, 32]) {
      const item = block(base, prefix);
      if (!seen.has(blockText(item))) {
        seen.add(blockText(item));
        blocks.push(item);
      }
    }
    const rulesFor = { peering: 'peering-overlap', subnets: 'no-overlap-in-vpc' };
    for (const a of blocks) for (const b of blocks) {
      const { relation, shared } = referenceOverlap(a, b);
      for (const context of ['peering', 'subnets']) {
        const label = `${blockText(a)} ${blockText(b)} ${context}`;
        const result = run({ op: 'overlap', a: blockText(a), b: blockText(b), context });
        expect(result, label).toMatchObject({
          ok: true,
          output: {
            relation, overlaps: shared > 0n, sharedCount: Number(shared),
            sizeIssueA: sizeIssueOf(a.prefix), sizeIssueB: sizeIssueOf(b.prefix), [context]: verdictOf(a, b, shared),
          },
          rules: ['address-math', 'size-range', 'overlap-math', rulesFor[context]],
        });
        expect(Object.keys(result.output).sort(), label).toEqual(
          ['relation', 'overlaps', 'sharedCount', 'sizeIssueA', 'sizeIssueB', context].sort(),
        );
      }
    }
  });
});

describe('分割', () => {
  it('ちょうど入るときは層の順、その中では AZ の順に割り当てる', () => {
    expect(split()).toMatchObject({
      output: { fits: true, remaining: 0, needed: 256, available: 256, usableTotal: 236, subnets: [
        { cidr: '10.0.0.0/26', az: 1, tier: 'パブリック', usable: 59 },
        { cidr: '10.0.0.64/26', az: 2, tier: 'パブリック', usable: 59 },
        { cidr: '10.0.0.128/26', az: 1, tier: 'アプリ', usable: 59 },
        { cidr: '10.0.0.192/26', az: 2, tier: 'アプリ', usable: 59 },
      ] },
      rules: ['address-math', 'size-range', 'within-vpc', 'no-overlap-in-vpc', 'subnet-one-az', 'reserved'],
    });
  });

  it('1 つ足りないときは入った分だけ割り当てる', () => {
    const result = split({ vpc: '10.0.0.0/26', azs: 3, tiers: tiers.slice(0, 1), prefix: 27 });
    expect(result.output).toMatchObject({ issue: 'not-enough', fits: false, subnets: [{ az: 1 }, { az: 2 }] });
    expect(result.output).not.toHaveProperty('remaining');
    expect(result.output).not.toHaveProperty('usableTotal');
  });

  it.each([
    [{ vpc: '10.0.0.0/15', prefix: 29 }, 'vpc-size'],
    [{ vpc: '10.0.0.0/29' }, 'vpc-size'],
    [{ prefix: 29 }, 'subnet-size'],
    [{ prefix: 15 }, 'subnet-size'],
    [{ prefix: 23 }, 'subnet-larger'],
  ])('最初に引っかかった条件を出す %j', (config, issue) => {
    expect(split(config)).toMatchObject({
      output: { issue, fits: false, subnets: [] }, rules: ['address-math', 'size-range', 'within-vpc'],
    });
  });

  it.each([1, 4])('AZ が %i 個のときに順に割り当てる', (azs) => {
    expect(split({ azs, tiers: tiers.slice(0, 1) }).output.subnets.map(({ az }) => az))
      .toEqual(Array.from({ length: azs }, (_, i) => i + 1));
  });

  it('複数の先頭 × VPC /14〜/30 × サブネット /12〜/31 × AZ 1〜4 × 層 1〜3 で、参照実装と一致する', () => {
    for (const base of ['10.0.0.0', '172.16.0.0', '192.168.0.0', '255.255.0.0']) {
      for (let vpcPrefix = 14; vpcPrefix <= 30; vpcPrefix++) {
        const vpcBlock = block(base, vpcPrefix);
        const vpc = blockText(vpcBlock);
        for (let azs = 1; azs <= 4; azs++) for (let layers = 1; layers <= 3; layers++) for (let prefix = 12; prefix <= 31; prefix++) {
          const label = `${vpc} azs=${azs} tiers=${layers} /${prefix}`;
          const { issue, needed, available } = referenceSplit(vpcBlock, azs, layers, prefix);
          const result = split({ vpc, azs, tiers: tiers.slice(0, layers), prefix });
          expect(result.ok, label).toBe(true);
          const { output } = result;
          expect(output, label).toMatchObject({ issue, fits: issue === 'none', needed: Number(needed), available: Number(available) });
          const size = countOf(prefix);
          const placed = issue === 'none' || issue === 'not-enough' ? Math.min(azs * layers, Number(available / size)) : 0;
          expect(output.subnets, label).toEqual(Array.from({ length: placed }, (_, i) => ({
            cidr: `${toText(vpcBlock.network + BigInt(i) * size)}/${prefix}`,
            az: (i % azs) + 1,
            tier: tiers[Math.floor(i / azs)].name,
            usable: Number(size - 5n),
          })));
          if (issue === 'none') {
            expect(output.remaining, label).toBe(Number(available - needed));
            expect(output.usableTotal, label).toBe(placed * Number(size - 5n));
          } else {
            expect(output, label).not.toHaveProperty('remaining');
            expect(output, label).not.toHaveProperty('usableTotal');
          }
        }
      }
    }
  });
});
