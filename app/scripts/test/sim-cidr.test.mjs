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
const addressNumber = (address) => address.split('.').reduce((n, octet) => n * 256 + Number(octet), 0);

describe('CIDR の入力', () => {
  it.each(['', '10.0.0/24', '10.0.0.0.0/24', '256.0.0.0/24', '10.-1.0.0/24', '10.0.0.0', '10.0.0.0/33', '10.0.0.0/-1', '10.0.0.0/1.5'])(
    '形・範囲の違う %s をエラーにする', (value) => expect(parseCidr(value)).toMatchObject({ ok: false, error: { code: 'format' } }),
  );

  it('IPv6 とネットワークアドレスでない入力を区別する', () => {
    expect(parseCidr('2001:db8::/32')).toMatchObject({ ok: false, error: { code: 'ipv6', message: NOT_COVERED[0] } });
    expect(parseCidr('10.0.0.5/24')).toMatchObject({ ok: false, error: { code: 'not-network', fix: '10.0.0.0/24' } });
    expect(parseCidr('255.255.255.255/0')).toMatchObject({ error: { fix: '0.0.0.0/0' } });
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
        { address: '10.0.0.2', use: 'DNS サーバー' },
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

  it('全プレフィックスで個数、両端、範囲、予約が一致する', () => {
    for (let prefix = 0; prefix <= 32; prefix++) {
      const { output } = cidrSize(prefix);
      const allowed = prefix >= 16 && prefix <= 28;
      const { total, first, last } = output;
      expect(total).toBe(2 ** (32 - prefix));
      expect(addressNumber(last) - addressNumber(first) + 1).toBe(total);
      expect(output.allowed).toBe(allowed);
      if (allowed) {
        expect(output.sizeIssue).toBe('none');
        expect(output.usable).toBe(total - 5);
        expect(output.reserved.map(({ address }) => addressNumber(address))).toEqual([0, 1, 2, 3, total - 1]);
      } else {
        expect(output.sizeIssue).toBe(prefix < 16 ? 'too-large' : 'too-small');
        expect(output).not.toHaveProperty('reserved');
        expect(output).not.toHaveProperty('usable');
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
    ['10.0.0.0/16', '10.0.0.0/16', 'same', 65536],
    ['10.0.0.0/16', '10.0.128.0/17', 'a-contains-b', 32768],
    ['10.0.128.0/17', '10.0.0.0/16', 'b-contains-a', 32768],
    ['10.0.0.0/17', '10.0.128.0/17', 'disjoint', 0],
    ['10.0.0.0/16', '10.2.0.0/16', 'disjoint', 0],
    ['0.0.0.0/0', '255.255.255.255/32', 'a-contains-b', 1],
  ])('%s と %s の関係', (a, b, relation, sharedCount) => {
    const peering = overlap(a, b);
    expect(peering).toMatchObject({
      ok: true,
      output: { relation, sharedCount, overlaps: sharedCount > 0, peering: sharedCount ? 'cannot' : 'can' },
      rules: ['address-math', 'overlap-math', 'peering-overlap'],
    });
    expect(peering.output).not.toHaveProperty('subnets');
    const subnets = overlap(a, b, 'subnets');
    expect(subnets).toMatchObject({
      output: { subnets: sharedCount ? 'cannot' : 'can' },
      rules: ['address-math', 'overlap-math', 'no-overlap-in-vpc'],
    });
    expect(subnets.output).not.toHaveProperty('peering');
  });

  it('/8〜/28 で同じ、包含、隣接、離れた CIDR を組み合わせても対称になる', () => {
    const { start } = parseCidr('10.0.0.0/8');
    const addressAt = (offset) => [24, 16, 8, 0].map((shift) => Math.floor((start + offset) / 2 ** shift) % 256).join('.');
    const blocks = [];
    for (let prefix = 8; prefix <= 28; prefix++) {
      const size = 2 ** (32 - prefix);
      blocks.push(`10.0.0.0/${prefix}`, `${addressAt(size)}/${prefix}`, `${addressAt(size * 3)}/${prefix}`);
    }
    const reverse = { same: 'same', disjoint: 'disjoint', 'a-contains-b': 'b-contains-a', 'b-contains-a': 'a-contains-b' };
    for (const a of blocks) for (const b of blocks) {
      const { output: ab } = overlap(a, b);
      const { output: ba } = overlap(b, a);
      expect([ab.overlaps, ab.sharedCount, ab.relation]).toEqual([ba.overlaps, ba.sharedCount, reverse[ba.relation]]);
      expect(ab.sharedCount === 0).toBe(ab.relation === 'disjoint');
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

  it('VPC とサブネット /16〜/28、AZ 1〜4、層 1〜3 の全組で収まりと個数が一致する', () => {
    for (let vpcPrefix = 16; vpcPrefix <= 28; vpcPrefix++) {
      const vpc = `10.0.0.0/${vpcPrefix}`;
      const block = parseCidr(vpc);
      for (let azs = 1; azs <= 4; azs++) for (let layers = 1; layers <= 3; layers++) for (let prefix = 16; prefix <= 28; prefix++) {
        const { output } = split({ vpc, azs, tiers: tiers.slice(0, layers), prefix });
        if (!output.fits) {
          expect(output.issue).not.toBe('none');
          continue;
        }
        expect(output.needed + output.remaining).toBe(output.available);
        expect(output.subnets).toHaveLength(azs * layers);
        let previous = block.start - 1;
        for (const { cidr } of output.subnets) {
          const subnet = parseCidr(cidr);
          expect(subnet.start).toBe(previous + 1);
          expect(subnet.end).toBeLessThanOrEqual(block.end);
          previous = subnet.end;
        }
      }
    }
  });
});
