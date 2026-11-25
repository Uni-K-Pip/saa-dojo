// @vitest-environment node
import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { SIM_CONFIG_SCHEMAS } from '../../../scripts/lib/schema.mjs';
import { SIMULATORS } from '../../../scripts/lib/sims/index.mjs';
import { NOT_COVERED, OUTPUT_KEYS, PRESET, RULES, buildPresetConfig, run, validateInput } from '../../../scripts/lib/sims/trace.mjs';

const ANY = '0.0.0.0/0';
const range = (from, to = from) => ({ from, to });
const sgRule = (peer = ANY, ports = 'all') => ({ peer, ports });
const aclRule = (rule = 100, action = 'allow', cidr = ANY, ports = 'all') => ({ rule, action, cidr, ports });
const trace = (switches, change = () => {}) => {
  const config = buildPresetConfig(switches);
  change(config);
  const result = run(config);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return result;
};
const stages = (array) => array.map(({ gate, at, verdict, basis }) => [gate, at, verdict, basis]);
const pass = (gate, at, basis = 'route') => [gate, at, 'pass', basis];
const stop = (gate, at, basis) => [gate, at, 'stop', basis];
const appToUpdate = { from: 'app', to: 'update' };
const appToDb = { from: 'app', to: 'db', port: 3306 };
const clientToAlb = { from: 'client', to: 'alb' };
const setAcl = (config, subnet, { inbound = [], outbound = [] }) => {
  config.nacls['acl-test'] = { inbound, outbound };
  config.subnets.find(({ id }) => id === subnet).nacl = 'acl-test';
};

describe('アドレス、ポートと関門の判定', () => {
  it.each([
    [ANY, '192.0.2.80', true], ['192.0.2.80/32', '192.0.2.80', true], ['192.0.2.80/32', '192.0.2.81', false],
    ['192.0.2.80/30', '192.0.2.79', false], ['192.0.2.80/30', '192.0.2.80', true],
    ['192.0.2.80/30', '192.0.2.83', true], ['192.0.2.80/30', '192.0.2.84', false],
  ])('セキュリティグループで %s と %s を照合します', (cidr, ip, delivered) => {
    const { output } = trace(appToUpdate, (config) => {
      config.externals.find(({ id }) => id === 'update').ip = ip;
      config.securityGroups['sg-app'].outbound = [sgRule(cidr)];
    });
    expect(output.delivered).toBe(delivered);
    expect(output.stop).toBe(delivered ? 'none' : 'forward-sg-out');
  });

  it.each([[442, false], [443, true], [445, true], [446, false]])('宛先ポート %i を範囲の両端を含めて照合します', (port, allowed) => {
    const { output } = trace(appToUpdate, (config) => {
      config.flow.port = port;
      setAcl(config, 'app', { outbound: [aclRule(100, 'allow', ANY, range(443, 445))], inbound: [aclRule()] });
    });
    expect(output.stop).toBe(allowed ? 'none' : 'forward-nacl-out');
  });

  it.each([
    [90, false, '90', 'nacl-deny'], [200, true, '100', undefined],
  ])('ネットワーク ACL は書いた順にかかわらず番号 %i の拒否を評価します', (deny, delivered, rule, reason) => {
    const denyRule = aclRule(deny, 'deny');
    const allowRule = aclRule();
    const { output } = trace(clientToAlb, (config) => setAcl(config, 'pub', {
      inbound: delivered ? [denyRule, allowRule] : [allowRule, denyRule], outbound: [aclRule()],
    }));
    expect(output.delivered).toBe(delivered);
    expect(output.forward.find(({ gate }) => gate === 'nacl-in')).toMatchObject({ rule, basis: 'rule' });
    expect(output.reason).toBe(reason);
  });

  it('どの ACL ルールにも当たらないときは * で止まります', () => {
    const { output } = trace(appToUpdate, (config) => setAcl(config, 'app', {
      outbound: [aclRule(100, 'allow', '192.0.2.81/32')],
    }));
    expect(output).toMatchObject({ stop: 'forward-nacl-out', stopAt: 'app', reason: 'nacl-no-match', return: [] });
    expect(output.forward.at(-1)).toMatchObject({ rule: '*', basis: 'final-deny' });
    expect(output).not.toHaveProperty('routeTarget');
    expect(output).not.toHaveProperty('seenSource');
  });

  it('セキュリティグループは一致する行、既定のアウトバウンド、空のルールを区別します', () => {
    expect(trace(appToUpdate).output.forward[0]).toMatchObject({ basis: 'default-out', rule: 'default' });
    expect(trace(appToUpdate, (config) => {
      config.securityGroups['sg-app'].outbound = [sgRule('192.0.2.81/32'), sgRule(ANY, range(443))];
    }).output.forward[0]).toMatchObject({ basis: 'rule', rule: 'outbound-2', verdict: 'pass' });
    expect(trace(appToUpdate, (config) => {
      config.securityGroups['sg-app'].outbound = [];
    }).output).toMatchObject({ stop: 'forward-sg-out', stopAt: 'app', reason: 'sg-no-match', return: [] });
  });

  it('同じプライベート IP でもセキュリティグループの参照に当たるにはグループの関連付けが要ります', () => {
    const allow = trace(appToDb, (config) => {
      config.securityGroups['sg-app'].outbound = [sgRule('sg:sg-db', range(3306))];
    });
    expect(allow.output).toMatchObject({ delivered: true, seenSource: '10.0.2.10' });
    expect(allow.rules).toContain('sg-reference');
    const deny = trace(appToDb, (config) => { config.hosts.find(({ id }) => id === 'app').sg = 'sg-alb'; });
    expect(deny.output).toMatchObject({ stop: 'forward-sg-in', stopAt: 'db', reason: 'sg-no-match' });
  });

  it('NAT の付け替え後のアドレスを送信元にしても元のグループを参照できません', () => {
    const { output } = trace(appToUpdate);
    expect(output.seenSource).toBe('203.0.113.20');
    const translated = trace(clientToAlb, (config) => {
      delete config.publicIps.nat;
      config.externals.find(({ id }) => id === 'client').ip = output.seenSource;
      config.securityGroups['sg-alb'].inbound = [sgRule('sg:sg-app'), sgRule(`${output.seenSource}/32`)];
    });
    expect(translated.output.forward.find(({ gate }) => gate === 'sg-in')).toMatchObject({ rule: 'inbound-2' });
  });

  it.each(['pl-s3', ANY, '192.0.2.0/24'])('S3 は SG の %s と対応するかを判定します', (peer) => {
    const { output } = trace({}, (config) => { config.securityGroups['sg-app'].outbound = [sgRule(peer)]; });
    expect(output.delivered).toBe(peer !== '192.0.2.0/24');
  });

  it.each([true, false])('S3 の行きと戻りの ACL は %s の経路でも /0 だけに当たります', (s3Endpoint) => {
    const { output, rules } = trace({ s3Endpoint }, (config) => setAcl(config, 'app', {
      inbound: [aclRule(90, 'deny', '192.0.2.0/24'), aclRule(100, 'allow', ANY, range(50000))],
      outbound: [aclRule(90, 'deny', '192.0.2.0/24'), aclRule(100, 'allow', ANY, range(443))],
    }));
    expect(output.delivered).toBe(true);
    expect(output.routeTarget).toBe(s3Endpoint ? 'vpce' : 'nat');
    expect(output.forward.at(-1)).toMatchObject({ gate: 'arrive', at: 's3' });
    expect(output.forward.find(({ gate }) => gate === 'nacl-out').rule).toBe('100');
    expect(output.return.find(({ at, gate }) => at === 'app' && gate === 'nacl-in').rule).toBe('100');
    expect(rules).toContain('nacl-no-prefix-list');
  });

  it('S3 への通信を /0 で拒否するとエンドポイントへ着く前に止まります', () => {
    const { output, rules } = trace({}, (config) => setAcl(config, 'app', { outbound: [aclRule(100, 'deny')] }));
    expect(output).toMatchObject({ stop: 'forward-nacl-out', reason: 'nacl-deny', stopAt: 'app', return: [] });
    expect(output).not.toHaveProperty('routeTarget');
    expect(rules).toContain('vpce-sg-nacl');
    expect(rules).not.toContain('vpce-gateway');
  });

  it('個別の CIDR は S3 のルートに当たらず、プレフィックスリストが既定ルートに優先します', () => {
    for (const [appRoute, s3Endpoint, routeTarget] of [['nat', true, 'vpce'], ['nat', false, 'nat'], ['none', false, 'none']]) {
      const { output } = trace({ appRoute, s3Endpoint }, (config) => {
        config.routeTables['rt-app'].unshift({ dest: '192.0.2.0/24', target: 'igw' });
      });
      expect(output.routeTarget).toBe(routeTarget);
      expect(output.stop).toBe(routeTarget === 'none' ? 'forward-route' : 'none');
    }
  });

  it('ルートの記載順によらず最長一致のルートを使います', () => {
    const { output } = trace(appToUpdate, (config) => {
      config.routeTables['rt-app'].push({ dest: '192.0.2.0/24', target: 'igw' });
      config.routeTables['rt-app'].unshift({ dest: '192.0.2.80/32', target: 'nat:nat' });
    });
    expect(output).toMatchObject({ delivered: true, routeTarget: 'nat' });
    expect(output.forward.find(({ gate }) => gate === 'route').route).toEqual({ dest: '192.0.2.80/32', target: 'nat:nat' });
    const narrower = trace(appToUpdate, (config) => config.routeTables['rt-app'].push({ dest: '192.0.2.0/24', target: 'igw' }));
    expect(narrower.output).toMatchObject({ stop: 'forward-igw', stopAt: 'igw', reason: 'no-public-ip', routeTarget: 'igw' });
  });
});

describe('行きと戻りの段', () => {
  it('インターネットとパブリックサブネットを往復してアドレスを付け替えます', () => {
    const { output } = trace(clientToAlb);
    expect(stages(output.forward)).toEqual([pass('igw', 'igw'), pass('nacl-in', 'pub', 'rule'), pass('sg-in', 'alb', 'rule'), pass('arrive', 'alb')]);
    expect(stages(output.return)).toEqual([pass('sg-out', 'alb', 'stateful'), pass('nacl-out', 'pub', 'rule'),
      pass('route', 'pub'), pass('igw', 'igw'), pass('arrive', 'client')]);
    expect(output.forward[0].translate).toEqual({ from: '203.0.113.10', to: '10.0.1.10' });
    expect(output.return[3].translate).toEqual({ from: '10.0.1.10', to: '203.0.113.10' });
    expect(output).toMatchObject({ stop: 'none', delivered: true, seenSource: '198.51.100.7' });
    expect(output).not.toHaveProperty('routeTarget');
    expect(output).not.toHaveProperty('stopAt');
    expect(output).not.toHaveProperty('reason');
  });

  it('インターネットから入る通信で、宛先のサブネットにインターネットゲートウェイへのルートがない構成は入力で拒否します', () => {
    // 公式の資料は、この構成で通信できないことまでしか述べていないので、段の並びを作らない
    const config = buildPresetConfig(clientToAlb);
    config.routeTables['rt-pub'] = [];
    const result = run(config);
    expect(result).toMatchObject({ ok: false, error: { code: 'flow', field: 'flow' } });
    expect(result.error.message).toContain('この組み合わせは追跡しません');
    expect(result.error.message).not.toMatch(/段/);
  });

  it('NAT の前後で ACL とルートを評価し、戻りでは付け替えを元に戻します', () => {
    const { output } = trace(appToUpdate);
    expect(stages(output.forward)).toEqual([
      pass('sg-out', 'app', 'default-out'), pass('nacl-out', 'app', 'rule'), pass('route', 'app'),
      pass('nacl-in', 'pub', 'rule'), pass('nat', 'nat', 'no-sg'), pass('nacl-out', 'pub', 'rule'),
      pass('route', 'pub'), pass('igw', 'igw'), pass('arrive', 'update'),
    ]);
    expect(stages(output.return)).toEqual([
      pass('igw', 'igw'), pass('nacl-in', 'pub', 'rule'), pass('nat', 'nat', 'no-sg'), pass('nacl-out', 'pub', 'rule'),
      pass('route', 'pub'), pass('nacl-in', 'app', 'rule'), pass('sg-in', 'app', 'stateful'), pass('arrive', 'app'),
    ]);
    expect(output.forward[4].translate).toEqual({ from: '10.0.2.10', to: '10.0.1.20' });
    expect(output.forward[7].translate).toEqual({ from: '10.0.1.20', to: '203.0.113.20' });
    expect(output.return[0].translate).toEqual({ from: '203.0.113.20', to: '10.0.1.20' });
    expect(output.return[2].translate).toEqual({ from: '10.0.1.20', to: '10.0.2.10' });
    expect(output.return[4].route).toEqual({ dest: '10.0.0.0/16', target: 'local' });
    expect(output).toMatchObject({ stop: 'none', delivered: true, routeTarget: 'nat', seenSource: '203.0.113.20' });
  });

  it('NAT のサブネットも各方向の相手と宛先ポートで ACL を評価します', () => {
    const { output } = trace(appToUpdate, (config) => setAcl(config, 'pub', {
      inbound: [aclRule(100, 'allow', '10.0.2.10/32', range(443)), aclRule(110, 'allow', '192.0.2.80/32', range(50000))],
      outbound: [aclRule(120, 'allow', '192.0.2.80/32', range(443)), aclRule(130, 'allow', '10.0.2.10/32', range(50000))],
    }));
    expect(output.delivered).toBe(true);
    expect([...output.forward, ...output.return].filter(({ at, gate }) => at === 'pub' && gate.startsWith('nacl-'))
      .map(({ rule }) => rule)).toEqual(['100', '120', '110', '130']);
  });

  it('インターネットから NAT を宛先にすると NAT で止まり、NAT の EIP がなければ IGW で止まります', () => {
    const inbound = trace({ from: 'client', to: 'nat' }).output;
    expect(stages(inbound.forward)).toEqual([pass('igw', 'igw'), pass('nacl-in', 'pub', 'rule'), stop('nat', 'nat', 'no-sg')]);
    expect(inbound).toMatchObject({ stop: 'forward-nat', stopAt: 'nat', reason: 'nat-inbound', return: [] });
    const fromInside = run(buildPresetConfig({ from: 'app', to: 'nat' }));
    expect(fromInside).toMatchObject({ ok: false, error: { code: 'flow', field: 'flow' } });
    expect(fromInside.error.message).toContain('追跡しません');
    const outbound = trace(appToUpdate, (config) => { delete config.publicIps.nat; }).output;
    expect(outbound).toMatchObject({ stop: 'forward-igw', stopAt: 'igw', reason: 'no-public-ip', routeTarget: 'nat', return: [] });
    expect(outbound).not.toHaveProperty('seenSource');
  });

  it('NAT をゲートウェイへのルートのないサブネットに置くと、NAT の段を通り、NAT のサブネットのルートテーブルで止まります', () => {
    const { output, rules } = run(buildPresetConfig({ from: 'app', to: 'update', natSubnet: 'data' }));
    expect(output).toMatchObject({ stop: 'forward-route', stopAt: 'data', reason: 'no-route', routeTarget: 'nat', return: [] });
    expect(output.forward.some(({ gate, verdict }) => gate === 'nat' && verdict === 'pass')).toBe(true);
    expect(rules).toContain('nat-route-igw');
  });

  it('NAT のサブネットに合うルートがなければ、そこで止まります', () => {
    const { output } = trace(appToUpdate, (config) => { config.routeTables['rt-pub'] = []; });
    expect(output).toMatchObject({ stop: 'forward-route', stopAt: 'pub', reason: 'no-route', routeTarget: 'nat', return: [] });
    expect(output.forward.at(-1)).toEqual({ gate: 'route', at: 'pub', basis: 'route', verdict: 'stop' });
    expect(trace(appToUpdate, (config) => { config.routeTables['rt-pub'] = []; }).rules).toContain('nat-route-igw');
  });

  it('NAT を通る行きで、インターネットゲートウェイがアタッチされていなければ、NAT のあとのゲートウェイの段で止まります', () => {
    const { output } = trace({ ...appToUpdate, igw: false });
    expect(stages(output.forward)).toEqual([
      pass('sg-out', 'app', 'default-out'), pass('nacl-out', 'app', 'rule'), pass('route', 'app'),
      pass('nacl-in', 'pub', 'rule'), pass('nat', 'nat', 'no-sg'), pass('nacl-out', 'pub', 'rule'), pass('route', 'pub'),
      stop('igw', 'igw', 'route'),
    ]);
    expect(output).toMatchObject({ stop: 'forward-igw', stopAt: 'igw', reason: 'no-igw', routeTarget: 'nat', return: [] });
  });

  it('サブネットの種類は、IGW へのルートでパブリック、エンドポイントのルートだけでもプライベート、local だけで分離になります', () => {
    expect(trace({ appRoute: 'none' }).output.subnetKinds).toEqual([
      { subnet: 'pub', kind: 'public' }, { subnet: 'app', kind: 'private' }, { subnet: 'data', kind: 'isolated' },
    ]);
    expect(trace({ appRoute: 'none', s3Endpoint: false }).output.subnetKinds)
      .toContainEqual({ subnet: 'app', kind: 'isolated' });
  });

  it('VPC 内は local ルートで往復し、応答側の SG は空のルールを参照しません', () => {
    const { output } = trace(appToDb, (config) => { config.securityGroups['sg-db'].outbound = []; });
    expect(stages(output.forward)).toEqual([pass('sg-out', 'app', 'default-out'), pass('nacl-out', 'app', 'rule'), pass('route', 'app'),
      pass('nacl-in', 'data', 'rule'), pass('sg-in', 'db', 'rule'), pass('arrive', 'db')]);
    expect(stages(output.return)).toEqual([pass('sg-out', 'db', 'stateful'), pass('nacl-out', 'data', 'rule'), pass('route', 'data'),
      pass('nacl-in', 'app', 'rule'), pass('sg-in', 'app', 'stateful'), pass('arrive', 'app')]);
    expect(output).toMatchObject({ stop: 'none', delivered: true, routeTarget: 'local', seenSource: '10.0.2.10' });
    expect(output.forward[2].route).toEqual({ dest: '10.0.0.0/16', target: 'local' });
    expect(output.return[2].route).toEqual(output.forward[2].route);
  });

  it('S3 のゲートウェイエンドポイントは IGW がなくても応答を戻します', () => {
    const { output, rules } = trace({ igw: false });
    expect(stages(output.forward)).toEqual([pass('sg-out', 'app', 'default-out'), pass('nacl-out', 'app', 'rule'), pass('route', 'app'),
      pass('vpce', 'vpce-s3'), pass('arrive', 's3')]);
    expect(stages(output.return)).toEqual([pass('vpce', 'vpce-s3'), pass('nacl-in', 'app', 'rule'), pass('sg-in', 'app', 'stateful'), pass('arrive', 'app')]);
    expect(output).toMatchObject({ stop: 'none', delivered: true, routeTarget: 'vpce', seenSource: '10.0.2.10' });
    expect(output.forward[2].route).toEqual({ dest: 'pl-s3', target: 'vpce-s3' });
    // 0.0.0.0/0 は NAT ゲートウェイ向きなので、エンドポイントの経路の優先（IGW 向きの事実）ではなく、プレフィックスリストのルートの優先が入る
    expect(rules).toContain('route-prefix-list');
    expect(rules).not.toContain('vpce-precedence');
    expect(trace({ appRoute: 'igw' }).rules).toContain('vpce-precedence');
  });

  it('IGW 経由の S3 は S3 の ID に届き、既定ルートがなければ送れません', () => {
    const { output } = trace({ from: 'alb', to: 's3' });
    expect(output).toMatchObject({ stop: 'none', delivered: true, routeTarget: 'igw', seenSource: '203.0.113.10' });
    expect(output.forward.at(-1)).toMatchObject({ gate: 'arrive', at: 's3' });
    expect(trace({ appRoute: 'none', s3Endpoint: false }).output).toMatchObject({
      stop: 'forward-route', stopAt: 'app', reason: 'no-route', routeTarget: 'none', return: [],
    });
  });

  it('戻りの宛先ポートと外部アドレスでネットワーク ACL を評価します', () => {
    const sample = (clientPort) => trace(clientToAlb, (config) => {
      config.flow.clientPort = clientPort;
      setAcl(config, 'pub', {
        inbound: [aclRule(100, 'allow', '198.51.100.7/32', range(443))],
        outbound: [aclRule(100, 'allow', '198.51.100.7/32', range(50000))],
      });
    }).output;
    const a = sample(50000);
    const b = sample(50001);
    expect(a.forward).toEqual(b.forward);
    expect(a.delivered).toBe(true);
    expect(b).toMatchObject({ stop: 'return-nacl-out', stopAt: 'pub', reason: 'nacl-no-match', seenSource: '198.51.100.7' });
  });

  it('規則は実行した段に対応し、表の順で重複なく含まれます', () => {
    expect(Object.keys(RULES)).toHaveLength(29);
    expect(trace(clientToAlb).rules).toEqual(['sg-eni', 'sg-allow-only', 'sg-stateful', 'nacl-subnet', 'nacl-stateless',
      'nacl-default', 'route-table', 'route-longest', 'subnet-kind', 'igw-requirements', 'igw-nat', 'igw-inbound', 'address-match', 'trace-order']);
    expect(trace(appToUpdate, (config) => { config.securityGroups['sg-app'].outbound = []; }).rules)
      .toEqual(['sg-eni', 'sg-allow-only', 'subnet-kind', 'trace-order']);
    expect(trace(appToUpdate).rules).toEqual(['sg-eni', 'sg-allow-only', 'sg-stateful', 'nacl-subnet', 'nacl-stateless', 'nacl-default',
      'route-table', 'route-longest', 'subnet-kind', 'igw-requirements', 'igw-nat', 'nat-outbound', 'nat-route-igw', 'nat-eip',
      'nat-no-sg', 'nat-translate', 'address-match', 'trace-order']);
    // NAT ゲートウェイの付け替えは、付け替えた実行でだけ入る（外から NAT へは付け替える前に止まる）
    expect(trace({ from: 'update', to: 'nat' }).rules).not.toContain('nat-translate');
    // 段の並びに含まれる AWS の動きは、その動きが効いた実行で、受け持つ規則が入る
    const internetStopped = trace(clientToAlb, (config) => setAcl(config, 'pub', { inbound: [] }));
    expect(internetStopped.output).toMatchObject({ stop: 'forward-nacl-in' });
    expect(internetStopped.rules).toContain('route-table');
    expect(internetStopped.rules).toContain('igw-inbound');
    const ephemeral = trace(clientToAlb, (config) => setAcl(config, 'pub', {
      inbound: [aclRule(100, 'allow', ANY, range(443))], outbound: [aclRule(100, 'allow', ANY, range(1024, 65535))],
    }));
    expect(ephemeral.output.delivered).toBe(true);
    expect(ephemeral.rules).toContain('nacl-final-deny');
    const s3ViaNat = trace({ from: 'app', to: 's3', s3Endpoint: false });
    expect(s3ViaNat.output.routeTarget).toBe('nat');
    expect(s3ViaNat.rules).toContain('s3-public-endpoint');
    expect(trace({ from: 'app', to: 's3' }).rules).not.toContain('s3-public-endpoint');
    const prefixList = trace({ from: 'app', to: 's3' }, (config) => {
      config.securityGroups['sg-app'].outbound = [sgRule('pl-s3', range(443))];
    });
    expect(prefixList.output.delivered).toBe(true);
    expect(prefixList.rules).toContain('sg-prefix-list');
    expect(SIMULATORS.map(({ id }) => id)).toEqual(['cidr', 'trace', 'iam']);
    expect(SIMULATORS[1].engine.OUTPUT_KEYS).toBe(OUTPUT_KEYS);
  });
});

describe('入力の検査', () => {
  it.each([
    ['format', 'vpc.cidr', (c) => { c.vpc.cidr = '10.0.0.0'; }],
    ['format', 'subnets.0.cidr', (c) => { c.subnets[0].cidr = '10.0.1.5/24'; }],
    ['format', 'hosts.0.ip', (c) => { c.hosts[0].ip = '10.0.1.10/32'; }],
    ['format', 'routeTables.rt-pub.0.dest', (c) => { c.routeTables['rt-pub'][0].dest = '00.0.0.0/0'; }],
    ['ipv6', 'externals.0.ip', (c) => { c.externals[0].ip = '2001:db8::1'; }],
    ['ipv6', 'nacls.acl-test.inbound.0.cidr', (c) => { setAcl(c, 'app', { inbound: [aclRule(100, 'allow', '::/0')] }); }],
    ['vpc-size', 'vpc.cidr', (c) => { c.vpc.cidr = '10.0.0.0/15'; }],
    ['vpc-size', 'vpc.cidr', (c) => { c.vpc.cidr = '10.0.0.0/29'; }],
    ['subnet-range', 'subnets.0.cidr', (c) => { c.subnets[0].cidr = '10.1.1.0/24'; }],
    ['subnet-range', 'subnets.1.cidr', (c) => { c.subnets[1].cidr = '10.0.1.128/25'; }],
    ['host-address', 'hosts.0.ip', (c) => { c.hosts[0].ip = '10.0.2.100'; }],
    ...[0, 1, 2, 3, 255].map((last) => ['host-address', 'hosts.0.ip', (c) => { c.hosts[0].ip = `10.0.1.${last}`; }]),
    ['host-address', 'hosts.1.ip', (c) => { c.hosts[1].ip = c.hosts[0].ip; }],
    ['host-address', 'externals.0.ip', (c) => { c.externals[0].ip = '10.0.90.9'; }],
    ['host-address', 'publicIps.alb', (c) => { c.publicIps.alb = '10.0.10.9'; }],
    ['host-address', 'publicIps.nat', (c) => { c.publicIps.nat = c.publicIps.alb; }],
    ['host-address', 'publicIps.alb', (c) => { c.publicIps.alb = c.externals[0].ip; }],
    ['unknown-ref', 'subnets.1.routeTable', (c) => { c.subnets[1].routeTable = 'toString'; }],
    ['unknown-ref', 'subnets.1.nacl', (c) => { c.subnets[1].nacl = 'missing'; }],
    ['unknown-ref', 'hosts.0.subnet', (c) => { c.hosts[0].subnet = 'missing'; }],
    ['unknown-ref', 'hosts.0.sg', (c) => { c.hosts[0].sg = 'missing'; }],
    ['unknown-ref', 'securityGroups.sg-app.inbound.0.peer', (c) => { c.securityGroups['sg-app'].inbound[0].peer = 'sg:missing'; }],
    ['unknown-ref', 'flow.from', (c) => { c.flow.from = 'missing'; }],
    ['unknown-ref', 'flow.to', (c) => { c.flow.to = 'missing'; }],
    ['unknown-ref', 'publicIps.s3', (c) => { c.publicIps.s3 = '203.0.113.99'; }],
    ['unknown-ref', 'routeTables.rt-app.0.target', (c) => { c.routeTables['rt-app'][0].target = 'nat:missing'; }],
    ['unknown-ref', 'routeTables.rt-app.0.target', (c) => { c.routeTables['rt-app'][0].target = 'nat:alb'; }],
    ['route', 'routeTables.rt-pub.0.dest', (c) => { c.routeTables['rt-pub'][0].dest = '10.0.1.0/24'; }],
    ['route', 'routeTables.rt-pub.1.dest', (c) => { c.routeTables['rt-pub'].push({ dest: ANY, target: 'nat:nat' }); }],
    ['route', 'routeTables.rt-app.2.dest', (c) => { c.routeTables['rt-app'].push({ dest: 'pl-s3', target: 'vpce-s3' }); }],
    ['route', 'routeTables.rt-app.1', (c) => { c.routeTables['rt-app'][1].target = 'igw'; }],
    ['route', 'routeTables.rt-app.0.target', (c) => { Object.assign(c.hosts[1], { subnet: 'app', ip: '10.0.2.20' }); }],
    ['flow', 'flow', (c) => { c.flow.to = 'app'; }],
    ['flow', 'flow', (c) => { Object.assign(c.flow, { from: 'alb', to: 'nat' }); }],
    ['flow', 'flow.from', (c) => { c.flow.from = 'nat'; }],
    ['flow', 'flow.from', (c) => { Object.assign(c.flow, { from: 's3', to: 'alb' }); }],
    ['flow', 'flow', (c) => { Object.assign(c.flow, { from: 'client', to: 'update' }); }],
  ])('%s を %s で報告します', (code, field, change) => {
    const config = buildPresetConfig();
    change(config);
    expect(SIM_CONFIG_SCHEMAS.trace.safeParse(config).success).toBe(true);
    const result = run(config);
    expect(result).toMatchObject({ ok: false, error: { code, field, message: expect.stringMatching(/。$/) } });
    expect(validateInput(config)).toEqual(result);
    if (code === 'ipv6') expect(result.error.message).toBe(NOT_COVERED[0]);
  });

  it.each([
    ['余分な項目', (c) => { c.unexpected = true; }],
    ['op', (c) => { c.op = 'size'; }],
    ['サブネット 0 個', (c) => { c.subnets = []; }],
    ['サブネット 5 個', (c) => { c.subnets = Array(5).fill(c.subnets[0]); }],
    ['サブネット名 13 字', (c) => { c.subnets[0].label = 'あ'.repeat(13); }],
    ['ルートテーブル 0 個', (c) => { c.routeTables = {}; }],
    ['ルートテーブル 5 個', (c) => { c.routeTables = { a: [], b: [], c: [], d: [], e: [] }; }],
    ['ルート 6 個', (c) => { c.routeTables['rt-pub'] = Array(6).fill({ dest: ANY, target: 'igw' }); }],
    ['ACL 0 個', (c) => { c.nacls = {}; }],
    ['ACL 5 個', (c) => { c.nacls = Object.fromEntries('abcde'.split('').map((id) => [id, 'default'])); }],
    ['ACL ルール 7 個', (c) => { setAcl(c, 'app', { inbound: Array.from({ length: 7 }, (_, i) => aclRule(i + 1)) }); }],
    ['ACL ルール番号 32767', (c) => { setAcl(c, 'app', { inbound: [aclRule(32767)] }); }],
    ['ACL ルール番号の重複', (c) => { setAcl(c, 'app', { inbound: [aclRule(), aclRule()] }); }],
    ['SG 0 個', (c) => { c.securityGroups = {}; }],
    ['SG 5 個', (c) => { c.securityGroups = Object.fromEntries('abcde'.split('').map((id) => [id, { inbound: [] }])); }],
    ['SG ルール 7 個', (c) => { c.securityGroups['sg-app'].inbound = Array(7).fill(sgRule()); }],
    ['SG ポート範囲の逆転', (c) => { c.securityGroups['sg-app'].inbound = [sgRule(ANY, range(444, 443))]; }],
    ['SG インバウンドの pl-s3', (c) => { c.securityGroups['sg-app'].inbound = [sgRule('pl-s3')]; }],
    ['部品 0 個', (c) => { c.hosts = []; }],
    ['部品 7 個', (c) => { c.hosts = Array(7).fill(c.hosts[0]); }],
    ['NAT の SG', (c) => { c.hosts[1].sg = 'sg-alb'; }],
    ['部品の SG なし', (c) => { delete c.hosts[0].sg; }],
    ['S3 2 個', (c) => { c.externals[0] = { id: 'client', label: 'S3', kind: 's3' }; }],
    ['S3 の IP', (c) => { c.externals[2].ip = '192.0.2.81'; }],
    ['外部の相手 4 個', (c) => { c.externals.push({ id: 'other', label: 'その他', kind: 'internet', ip: '192.0.2.81' }); }],
    ['外部の相手の IP なし', (c) => { delete c.externals[0].ip; }],
    ['宛先ポート 0', (c) => { c.flow.port = 0; }],
    ['クライアントポート 1023', (c) => { c.flow.clientPort = 1023; }],
  ])('%s は両方の形の検査で拒否します', (_label, change) => {
    const config = buildPresetConfig();
    change(config);
    expect(SIM_CONFIG_SCHEMAS.trace.safeParse(config).success).toBe(false);
    expect(validateInput(config)).toMatchObject({ ok: false, error: { code: 'input' } });
  });

  it.each([null, [], 'trace', {}])('設定オブジェクト以外の %j は拒否します', (value) => {
    expect(validateInput(value)).toMatchObject({ ok: false, error: { code: 'input' } });
  });

  it('インターネットから入れて応答が NAT を選ぶ組を入力で拒否します', () => {
    const switches = { from: 'client', to: 'app', appPublicIp: true, appInbound: 'any' };
    expect(run(buildPresetConfig(switches))).toMatchObject({ ok: false, error: { code: 'flow', field: 'flow' } });
    // ゲートウェイの段で条件を満たさず止まる構成（パブリック IP がない、アタッチがない）は拒否せず、そこで止める
    expect(trace({ ...switches, appPublicIp: false }).output).toMatchObject({ stop: 'forward-igw', reason: 'no-public-ip' });
    expect(trace({ ...switches, appPublicIp: false }).output.forward).toHaveLength(1);
    expect(trace({ ...switches, igw: false }).output).toMatchObject({ stop: 'forward-igw', reason: 'no-igw' });
    const igwRoute = (c) => c.routeTables['rt-app'].push({ dest: '198.51.100.7/32', target: 'igw' });
    expect(trace(switches, igwRoute).output.delivered).toBe(true);
    expect(trace({ ...switches, appPublicIp: false }, igwRoute).output).toMatchObject({ stop: 'forward-igw', reason: 'no-public-ip' });
    expect(trace({ ...switches, igw: false }, igwRoute).output).toMatchObject({ stop: 'forward-igw', reason: 'no-igw' });
  });

  it('NAT から別の NAT や S3 のエンドポイントへ向かう経路を拒否します', () => {
    const chainedNat = buildPresetConfig(appToUpdate);
    chainedNat.hosts.push({ id: 'nat2', label: 'NAT 2', kind: 'nat-gateway', subnet: 'data', ip: '10.0.3.20' });
    chainedNat.routeTables['rt-pub'] = [{ dest: ANY, target: 'nat:nat2' }];
    expect(run(chainedNat)).toMatchObject({ ok: false, error: { code: 'flow', field: 'flow' } });
    const chainedEndpoint = buildPresetConfig({ s3Endpoint: false });
    chainedEndpoint.routeTables['rt-pub'].push({ dest: 'pl-s3', target: 'vpce-s3' });
    expect(run(chainedEndpoint)).toMatchObject({ ok: false, error: { code: 'flow', field: 'flow' } });
  });
});

const appToInternet = ({ igw, appRoute, natSubnet, appPublicIp }) => igw && (
  (appRoute === 'nat' && natSubnet === 'pub') || (appRoute === 'igw' && appPublicIp));
const internetToApp = ({ igw, appRoute, appPublicIp }) => igw && appRoute === 'igw' && appPublicIp;
const attached = ({ igw }) => igw;
const yes = () => true;
const no = () => false;
// SG と ACL をすべて許可したときの、送信元と宛先ごとの往復条件。
const reachability = {
  alb: { app: yes, db: yes, nat: no, client: attached, update: attached, s3: attached },
  app: { alb: yes, db: yes, nat: no, client: appToInternet, update: appToInternet, s3: (s) => s.s3Endpoint || appToInternet(s) },
  db: { alb: yes, app: yes, nat: no, client: no, update: no, s3: no },
  client: { alb: attached, app: internetToApp, db: no, nat: no },
  update: { alb: attached, app: internetToApp, db: no, nat: no },
};
const collapse = (places) => places.filter((place, index) => place !== places[index - 1]);
const choices = {
  port: [443, 80, 22, 3306], igw: [false, true], appRoute: ['none', 'nat', 'igw'], s3Endpoint: [false, true],
  appPublicIp: [false, true], natSubnet: ['pub', 'data'], appNacl: ['default', 'https', 'ephemeral'], appInbound: ['alb', 'any', 'none'],
};
const combinations = Object.entries(choices).reduce((configs, [key, values]) =>
  configs.flatMap((config) => values.map((value) => ({ ...config, [key]: value }))), [{}]);

function checkPath(output, switches) {
  const { forward, return: back, delivered, stop, stopAt, reason } = output;
  const arrived = forward.at(-1).gate === 'arrive';
  assert.equal(Object.hasOwn(output, 'seenSource'), arrived);
  assert.equal(Object.hasOwn(output, 'routeTarget'), forward.some(({ gate }) => gate === 'route'));
  const all = [...forward, ...back];
  if (delivered) {
    assert.equal(stop, 'none');
    assert.equal(back.at(-1).gate, 'arrive');
    assert.ok(all.every(({ verdict }) => verdict === 'pass'));
    assert.ok(!Object.hasOwn(output, 'stopAt') && !Object.hasOwn(output, 'reason'));
  } else {
    if (!arrived) assert.deepEqual(back, []);
    const final = all.at(-1);
    assert.equal(final.verdict, 'stop');
    assert.ok(all.slice(0, -1).every(({ verdict }) => verdict === 'pass'));
    assert.equal(stop, `${arrived ? 'return' : 'forward'}-${final.gate}`);
    assert.equal(stopAt, final.at);
    const reasons = {
      'sg-in': ['sg-no-match'], 'sg-out': ['sg-no-match'], 'nacl-in': ['nacl-no-match', 'nacl-deny'],
      'nacl-out': ['nacl-no-match', 'nacl-deny'], route: ['no-route'], igw: ['no-igw', 'no-public-ip'], nat: ['nat-inbound'],
    };
    assert.ok(reasons[final.gate].includes(reason));
  }
  if (arrived) {
    // 出発点と到着点を補い、同じ場所で続けて評価される関門を 1 つにまとめます。
    const reverse = collapse([switches.from, ...forward.map(({ at }) => at)]).reverse();
    const actual = collapse([switches.to, ...back.map(({ at }) => at)]);
    assert.deepEqual(actual, delivered ? reverse : reverse.slice(0, actual.length));
  }
}

describe('自由に試すプリセット', () => {
  it('既定値は PRESET と一致し、設定を変更しても次の実行に持ち越しません', () => {
    expect(buildPresetConfig()).toEqual(PRESET);
    const config = buildPresetConfig({ appNacl: 'https', natSubnet: 'data' });
    config.hosts[0].ip = '10.0.1.99';
    expect(buildPresetConfig()).toEqual(PRESET);
    expect(SIM_CONFIG_SCHEMAS.trace.safeParse(PRESET).success).toBe(true);
  });

  it('選べる送信元と宛先で全スイッチを回し、段の性質と到達の表を確かめます', () => {
    let total = 0;
    let invalid = 0;
    let tableChecks = 0;
    let statefulChecks = 0;
    for (const values of combinations) {
      for (const [from, targets] of Object.entries(reachability)) {
        for (const [to, expected] of Object.entries(targets)) {
          const switches = { ...values, from, to };
          const label = JSON.stringify(switches);
          const config = buildPresetConfig(switches);
          const original = validateInput(config);
          total++;
          // VPC の中の部品から NAT ゲートウェイそのものへ向かう通信は追跡しない
          const toNat = to === 'nat' && Boolean(config.hosts.find(({ id }) => id === from));
          // インターネットから入る通信が、アタッチされたゲートウェイを通って（宛先にパブリック IP がある）、
          // 0.0.0.0/0 がゲートウェイを指さないサブネットの部品に向かう構成は拒否する
          const receiverHost = config.hosts.find(({ id }) => id === to);
          const receiverRoutes = receiverHost
            ? config.routeTables[config.subnets.find(({ id }) => id === receiverHost.subnet).routeTable] : [];
          const asymmetric = ['client', 'update'].includes(from) && Boolean(receiverHost) && values.igw
            && Object.hasOwn(config.publicIps, to) && receiverRoutes.find(({ dest }) => dest === '0.0.0.0/0')?.target !== 'igw';
          if (toNat || asymmetric) {
            assert.equal(original.error?.code, 'flow', label);
            invalid++;
            continue;
          }
          assert.equal(original.ok, true, `${label} ${JSON.stringify(original.error)}`);
          try {
            checkPath(original.output, switches);
          } catch (error) {
            throw new Error(label, { cause: error });
          }

          if (original.output.return.length) {
            const sender = config.hosts.find(({ id }) => id === from);
            const receiver = config.hosts.find(({ id }) => id === to);
            if (sender) config.securityGroups[sender.sg].inbound = [];
            if (receiver) config.securityGroups[receiver.sg].outbound = [];
            const changed = run(config);
            assert.deepEqual(changed.output?.return, original.output.return, label);
            statefulChecks++;
          }

          // 到達の表では ACL と SG のスイッチを固定し、重複を省きます。
          if (values.appNacl === 'default' && values.appInbound === 'any') {
            for (const group of Object.values(config.securityGroups)) {
              group.inbound = [sgRule()];
              delete group.outbound;
            }
            assert.equal(run(config).output?.delivered, expected(values), label);
            tableChecks++;
          }
        }
      }
    }
    assert.equal(total, 44928);
    assert.equal(invalid, 6624);
    assert.equal(tableChecks, 4256);
    assert.ok(statefulChecks > 0);
  }, 30000);
});
