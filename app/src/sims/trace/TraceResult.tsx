import type { Config, Gate, Nacl, NaclRule, Output, Ports, Reason, SecurityGroup, SecurityGroupRule, Stage } from '../../../../scripts/lib/sims/trace.mjs';
import type { SettingRow } from '../SimFlow';

const GATES: Record<Gate, string> = {
  'sg-out': 'セキュリティグループ（出る）',
  'nacl-out': 'ネットワーク ACL（出る）',
  route: 'ルートテーブル',
  igw: 'インターネットゲートウェイ',
  nat: 'NAT ゲートウェイ',
  vpce: 'ゲートウェイエンドポイント',
  'nacl-in': 'ネットワーク ACL（入る）',
  'sg-in': 'セキュリティグループ（入る）',
  arrive: '到着',
};

const BASES: Record<Stage['basis'], string> = {
  rule: '当たったルール',
  stateful: '応答なので通す（ステートフル）',
  'default-out': 'アウトバウンドの既定の許可',
  'final-deny': 'どのルールにも当てはまらない（*）',
  'no-sg': 'セキュリティグループなし',
  route: '宛先に当てはまるルート',
};

const REASONS: Record<Reason, string> = {
  'sg-no-match': '許可ルールに当てはまりません。',
  'nacl-deny': '拒否のルールに当たりました。',
  'nacl-no-match': '最後の * のルールで拒否されました。',
  'no-route': '宛先に当てはまるルートがありません。',
  'no-igw': 'インターネットゲートウェイがアタッチされていません。',
  'no-public-ip': 'パブリック IP アドレスがありません。',
  'nat-inbound': '外側から NAT ゲートウェイへの接続を開始できません。',
};

const SUBNET_KINDS: Record<Output['subnetKinds'][number]['kind'], string> = {
  public: 'パブリック', private: 'プライベート', isolated: '分離',
};
const HOST_KINDS: Record<Config['hosts'][number]['kind'], string> = {
  instance: 'インスタンス', alb: 'ALB', rds: 'データベース', 'nat-gateway': GATES.nat,
};
const DIRECTIONS = { forward: '行き', return: '戻り' } as const;
type Direction = keyof typeof DIRECTIONS;
type StagePlace = Pick<Stage, 'gate' | 'at'>;
type SummaryOutput = Output & { stopLabel?: string };

function endpointLabel(config: Config, id: string) {
  return config.hosts.find((host) => host.id === id)?.label
    ?? config.externals.find((external) => external.id === id)?.label
    ?? id;
}

function isSubnetGate(gate: Gate) {
  return gate === 'nacl-in' || gate === 'nacl-out' || gate === 'route';
}

function stageLabel(config: Config, { gate, at }: StagePlace) {
  if (gate === 'igw' || gate === 'vpce') return GATES[gate];
  if (isSubnetGate(gate)) return config.subnets.find((subnet) => subnet.id === at)?.label ?? at;
  return endpointLabel(config, at);
}

function stopGate(stop: Exclude<Output['stop'], 'none'>) {
  const [direction, ...parts] = stop.split('-');
  return { direction: direction as Direction, gate: parts.join('-') as Gate };
}

export function withStopLabel(config: Config, output: Output): SummaryOutput {
  if (output.stop === 'none' || !output.stopAt) return output;
  const { gate } = stopGate(output.stop);
  return { ...output, stopLabel: stageLabel(config, { gate, at: output.stopAt }) };
}

export function summarizeTrace(output: SummaryOutput): string {
  if (output.delivered) return '届きました（行きと戻り）';
  if (output.stop === 'none') return '通信が止まりました。';
  const { direction, gate } = stopGate(output.stop);
  const gateName = GATES[gate].replace(/（(?:入る|出る)）$/, '');
  const place = gate === 'igw' || gate === 'vpce' ? undefined : output.stopLabel ?? output.stopAt;
  return `${DIRECTIONS[direction]}の${gateName}${place ? `（${place}）` : ''}で止まりました`;
}

function routeText(config: Config, { dest, target }: NonNullable<Stage['route']>) {
  let label: string = target;
  if (target === 'igw') label = GATES.igw;
  if (target === 'vpce-s3') label = GATES.vpce;
  if (target.startsWith('nat:')) label = `${GATES.nat}（${endpointLabel(config, target.slice(4))}）`;
  return `${dest} → ${label}`;
}

function portText(ports: Ports) {
  if (ports === 'all') return 'すべてのポート';
  return ports.from === ports.to ? String(ports.from) : `${ports.from}〜${ports.to}`;
}

function naclRuleText({ rule, action, ports, cidr }: NaclRule) {
  return `ルール ${rule}: ${action === 'allow' ? '許可' : '拒否'} TCP ${portText(ports)} ${cidr}`;
}

function securityGroupRuleText({ ports, peer }: SecurityGroupRule) {
  const peerLabel = peer.startsWith('sg:') ? `セキュリティグループ ${peer.slice(3)}` : peer;
  return `許可 TCP ${portText(ports)} ${peerLabel}`;
}

function directionRules(inbound: string[], outbound: string[]) {
  return `インバウンド ${inbound.join('、') || 'ルールなし'} ／ アウトバウンド ${outbound.join('、') || 'ルールなし'}`;
}

function naclText(acl: Nacl) {
  return acl === 'default' ? 'デフォルト（すべて許可）'
    : directionRules(acl.inbound.map(naclRuleText), acl.outbound.map(naclRuleText));
}

function securityGroupText(group: SecurityGroup) {
  return directionRules(group.inbound.map(securityGroupRuleText), group.outbound?.map(securityGroupRuleText) ?? ['既定ですべて許可']);
}

export function traceSettings(config: Config): SettingRow[] {
  const { vpc, subnets, routeTables, nacls, securityGroups, hosts, publicIps, externals, flow } = config;
  const values: Record<keyof Config, [string, string]> = {
    op: ['操作', '通信の追跡'],
    vpc: ['VPC', `VPC ${vpc.cidr}、${GATES.igw}${vpc.igw ? 'あり' : 'なし'}`],
    subnets: ['サブネット', subnets.map(({ label, cidr, routeTable, nacl }) => `${label} ${cidr}（${routeTable}、${nacl}）`).join(' ／ ')],
    routeTables: ['ルートテーブル', Object.entries(routeTables).map(([id, routes]) =>
      `${id}: ${routes.map((route) => routeText(config, route)).join('、') || 'local のみ'}`).join(' ／ ')],
    nacls: ['ネットワーク ACL', Object.entries(nacls).map(([id, acl]) => `${id}: ${naclText(acl)}`).join(' ／ ')],
    securityGroups: ['セキュリティグループ', Object.entries(securityGroups).map(([id, group]) => `${id}: ${securityGroupText(group)}`).join(' ／ ')],
    hosts: ['部品', hosts.map(({ label, kind, subnet, ip, sg }) =>
      `${label}（${HOST_KINDS[kind]}） ${ip}、${subnets.find(({ id }) => id === subnet)?.label ?? subnet}${sg ? `、${sg}` : ''}`).join(' ／ ')],
    publicIps: ['パブリック IP アドレス', Object.entries(publicIps).map(([id, ip]) => `${endpointLabel(config, id)}: ${ip}`).join(' ／ ') || 'なし'],
    externals: ['VPC の外の相手', externals.map(({ label, ip }) => ip ? `${label} ${ip}` : label).join(' ／ ') || 'なし'],
    flow: ['通信', `${endpointLabel(config, flow.from)} → ${endpointLabel(config, flow.to)}、TCP ${flow.port}（送信元のポート ${flow.clientPort}）`],
  };
  return Object.entries(values).map(([key, [label, value]]) => ({ key, label, value }));
}

function stageDetail(config: Config, stage: Stage, direction: Direction) {
  const { at, gate, rule, route, translate, basis } = stage;
  if (translate) {
    const fromOutside = config.externals.some(({ id }) => id === config.flow.from);
    const going = direction === 'forward';
    const source = gate === 'nat' ? going : going !== fromOutside;
    return `${source ? '送信元' : '宛先'}を ${translate.to} に付け替え（元のアドレス ${translate.from}）`;
  }
  if (route) return routeText(config, route);
  if (gate === 'arrive') return '宛先に届きました。';
  if (gate === 'vpce') return direction === 'forward' ? 'S3 へ運びます。' : 'S3 からの応答を VPC へ戻します。';
  if (basis !== 'rule') return BASES[basis];

  const dir = gate.endsWith('-in') ? 'inbound' : 'outbound';
  if (gate === 'nacl-in' || gate === 'nacl-out') {
    const subnet = config.subnets.find(({ id }) => id === at);
    const acl = subnet && config.nacls[subnet.nacl];
    if (acl === 'default') return naclText(acl);
    const match = acl?.[dir].find((entry) => String(entry.rule) === rule);
    if (match) return naclRuleText(match);
  }
  if (rule && (gate === 'sg-in' || gate === 'sg-out')) {
    const sg = config.hosts.find(({ id }) => id === at)?.sg;
    const line = Number(rule.slice(dir.length + 1));
    const match = sg ? config.securityGroups[sg]?.[dir]?.[line - 1] : undefined;
    if (match) return `ルール ${line} 行目: ${securityGroupRuleText(match)}`;
  }
  return BASES[basis];
}

function TraceStages({ config, output, direction }: { config: Config; output: Output; direction: Direction }) {
  const stages = output[direction];
  return (
    <section className="trace-direction">
      <h3>{DIRECTIONS[direction]}</h3>
      {stages.length === 0 ? <p>行きで止まったので、戻りはありません</p> : (
        <ol className="trace-stages" role="list">
          {stages.map((stage, index) => {
            const stopped = stage.verdict === 'stop';
            const reason = stopped && output.reason ? REASONS[output.reason] : '';
            const detail = reason && !stage.rule ? reason : stageDetail(config, stage, direction);
            const gate = GATES[stage.gate];
            const place = stageLabel(config, stage);
            return (
              <li key={index} className={stopped ? 'trace-stage trace-stopped' : 'trace-stage'}>
                <p className="trace-stage-heading">
                  <span className="trace-number">{index + 1}</span>
                  <strong>{gate}</strong>
                  {(stage.gate !== 'igw' && stage.gate !== 'vpce') && <span>{place}</span>}
                  <strong className={stopped ? 'trace-stop' : 'trace-pass'}>
                    <span aria-hidden="true">{stopped ? '✕ ' : '✓ '}</span>{stopped ? '止まる' : '通る'}
                  </strong>
                </p>
                <p>{detail} {reason && reason !== detail && <span>{reason}</span>}</p>
                {stopped && <p className="trace-stop">ここから先へは進みません</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function stageNumbers(output: Output, matches: (stage: Stage) => boolean) {
  return (['forward', 'return'] as const).flatMap((direction) => {
    const numbers = output[direction].flatMap((stage, index) => matches(stage) ? [index + 1] : []);
    return numbers.length ? [`${DIRECTIONS[direction]} ${numbers.join('、')}`] : [];
  }).join('・');
}

function TraceTopology({ config, output }: { config: Config; output: Output }) {
  const igwNumbers = stageNumbers(output, ({ gate }) => gate === 'igw');
  const endpointNumbers = stageNumbers(output, ({ gate }) => gate === 'vpce');
  const hasEndpoint = Object.values(config.routeTables).some((routes) => routes.some(({ target }) => target === 'vpce-s3'));
  return (
    <details className="trace-topology">
      <summary>構成を見る</summary>
      <p>VPC {config.vpc.cidr}</p>
      <p>{GATES.igw}のアタッチ{config.vpc.igw ? 'あり' : 'なし'} {igwNumbers && <span className="trace-numbers">{igwNumbers}</span>}</p>
      {hasEndpoint && <p>{GATES.vpce}（S3） {endpointNumbers && <span className="trace-numbers">{endpointNumbers}</span>}</p>}
      <div className="trace-subnets">
        {config.subnets.map(({ id, label, cidr, routeTable, nacl }) => {
          const kind = output.subnetKinds.find(({ subnet }) => subnet === id)?.kind;
          const numbers = stageNumbers(output, ({ gate, at }) => at === id && isSubnetGate(gate));
          return (
            <section key={id} className="trace-subnet">
              <h4>{label} {kind && <span className="trace-kind">{SUBNET_KINDS[kind]}</span>}</h4>
              <p>{cidr} {numbers && <span className="trace-numbers">{numbers}</span>}</p>
              <p><strong>ルートテーブル</strong> {routeTable}</p>
              <ul>
                <li>{config.vpc.cidr} → local</li>
                {config.routeTables[routeTable].map((route) => <li key={route.dest}>{routeText(config, route)}</li>)}
              </ul>
              <p><strong>ネットワーク ACL</strong> {nacl}: {naclText(config.nacls[nacl])}</p>
              {config.hosts.filter((host) => host.subnet === id).map((host) => {
                const hostNumbers = stageNumbers(output, ({ gate, at }) =>
                  at === host.id && (gate === 'sg-in' || gate === 'sg-out' || gate === 'nat' || gate === 'arrive'));
                const publicIp = Object.hasOwn(config.publicIps, host.id) ? config.publicIps[host.id] : 'なし';
                return (
                  <div key={host.id} className="trace-host">
                    <p><strong>{host.label}</strong> <span className="trace-kind">{HOST_KINDS[host.kind]}</span> {hostNumbers && <span className="trace-numbers">{hostNumbers}</span>}</p>
                    <p>プライベート IP アドレス {host.ip}</p>
                    <p>パブリック IP アドレス {publicIp}</p>
                    <p><strong>セキュリティグループ</strong> {host.sg ? `${host.sg}: ${securityGroupText(config.securityGroups[host.sg])}` : 'なし'}</p>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {config.externals.length > 0 && (
        <section>
          <h4>VPC の外の相手</h4>
          <ul>
            {config.externals.map(({ id, label, ip }) => {
              const numbers = stageNumbers(output, ({ gate, at }) => gate === 'arrive' && at === id);
              return <li key={id}>{label} {ip} {numbers && <span className="trace-numbers">{numbers}</span>}</li>;
            })}
          </ul>
        </section>
      )}
    </details>
  );
}

export function TraceResult({ config, output }: { config: Config; output: Output }) {
  return (
    <div className="trace-result">
      <p className="trace-summary"><strong>{summarizeTrace(withStopLabel(config, output))}</strong></p>
      <TraceStages config={config} output={output} direction="forward" />
      <TraceStages config={config} output={output} direction="return" />
      <TraceTopology config={config} output={output} />
    </div>
  );
}
