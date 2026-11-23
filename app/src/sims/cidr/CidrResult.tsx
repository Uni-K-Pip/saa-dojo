import {
  formatIpv4, parseCidr, RULES, type Config, type Output, type OverlapConfig, type OverlapOutput,
  type SizeOutput, type SplitConfig, type SplitOutput, type TierKind,
} from '../../../../scripts/lib/sims/cidr.mjs';
import type { SettingRow } from '../SimFlow';

export const number = (value: number) => value.toLocaleString('en-US');
export const ROLE_LABEL = { subnet: 'サブネット', vpc: 'VPC' };
export const CONTEXT_LABEL = { peering: 'VPC ピアリング', subnets: '同じ VPC のサブネット' };
export const TIER_LABEL: Record<TierKind, string> = { public: 'パブリック', private: 'プライベート', isolated: '分離' };

const RELATION_LABEL: Record<OverlapOutput['relation'], string> = {
  disjoint: '重なりません',
  same: '同じ範囲です',
  'a-contains-b': '範囲 A が範囲 B を含みます',
  'b-contains-a': '範囲 B が範囲 A を含みます',
};

const SIZE_ISSUE_LABEL = { 'too-large': '大きすぎる', 'too-small': '小さすぎる' } as const;

/** 層の表示。名前が種類の語と同じなら 1 回だけ出す */
export function tierText(name: string, kind: TierKind) {
  return name === TIER_LABEL[kind] ? name : `${name}（${TIER_LABEL[kind]}）`;
}

const SPLIT_LABEL: Record<SplitOutput['issue'], string> = {
  none: 'すべてのサブネットが入ります',
  'vpc-size': 'VPC を作れない大きさです',
  'subnet-size': 'サブネットを作れない大きさです',
  'subnet-larger': 'サブネットの範囲が VPC より大きくなっています',
  'not-enough': 'サブネットが全部は入りません',
};

function sizeCounts(output: SizeOutput) {
  return `全部 ${number(output.total)} 個${output.usable === undefined ? '' : ` ／ 使える ${number(output.usable)} 個`}`;
}

export function summarizeCidr(output: Output): string {
  if ('allowed' in output) return output.allowed ? sizeCounts(output) : `作れない大きさです。全部 ${number(output.total)} 個。`;
  if ('relation' in output) {
    const size = output.sizeIssueA !== 'none' || output.sizeIssueB !== 'none' ? '作れない大きさの範囲があります。' : '';
    return `${size}${RELATION_LABEL[output.relation]}。重なりは ${number(output.sharedCount)} 個。`;
  }
  return `${SPLIT_LABEL[output.issue]}。必要 ${number(output.needed)} 個、VPC の範囲 ${number(output.available)} 個。`;
}

export function cidrSettings(config: Config): SettingRow[] {
  if (config.op === 'size') {
    const rows = [
      { key: 'role', label: '種類', value: ROLE_LABEL[config.role] },
      { key: 'cidr', label: 'CIDR', value: config.cidr },
    ];
    if (config.purpose === 'alb') rows.push(
      { key: 'purpose', label: '用途', value: 'ALB の条件を確かめる' },
      { key: 'inUse', label: '使用中のアドレス', value: `${number(config.inUse ?? 0)} 個` },
    );
    return rows;
  }
  if (config.op === 'overlap') {
    return [
      { key: 'context', label: '場面', value: CONTEXT_LABEL[config.context] },
      { key: 'a', label: '範囲 A', value: config.a },
      { key: 'b', label: '範囲 B', value: config.b },
    ];
  }
  return [
    { key: 'vpc', label: 'VPC の CIDR', value: config.vpc },
    { key: 'azs', label: 'AZ の数', value: String(config.azs) },
    { key: 'tiers', label: '層', value: config.tiers.map(({ name, kind }) => tierText(name, kind)).join('、') },
    { key: 'prefix', label: 'サブネットのプレフィックス長', value: `/${config.prefix}` },
  ];
}

function ScaleLabels({ start, end }: { start: string; end: string }) {
  return <div className="cidr-scale"><span>{start}</span><span>{end}</span></div>;
}

function SizeResult({ output }: { output: SizeOutput }) {
  const { first, last, reserved, free, albIssue, allowed, sizeIssue } = output;
  const { maxPrefix, minFree } = RULES['alb-subnet'].value;
  const headCount = RULES.reserved.value.head;
  return (
    <div>
      <ScaleLabels start={first} end={last} />
      <div className={`cidr-size-band${allowed ? '' : ' invalid'}`}>
        {reserved?.slice(0, headCount).map(({ address }, index) => <span className="cidr-reserved" key={address}>予約 {index + 1}</span>)}
        <span className="cidr-space" />
        {reserved?.slice(headCount).map(({ address }, index) => <span className="cidr-reserved" key={address}>予約 {headCount + index + 1}</span>)}
      </div>
      {!allowed && sizeIssue !== 'none' && <p><strong>作れない大きさ</strong>（{SIZE_ISSUE_LABEL[sizeIssue]}。範囲は {RULES['size-range'].text}）</p>}
      <p>{sizeCounts(output)}</p>
      {reserved && (
        <ol className="cidr-reservation-list">
          {reserved.map(({ address, use }) => <li key={address}>{address}：{use}</li>)}
        </ol>
      )}
      {albIssue !== undefined && (
        <>
          <p><strong>ALB が適切にスケールするための条件</strong></p>
          <p>空きのアドレス：{number(free ?? 0)} 個</p>
          <p>{{
            none: '条件を満たす',
            prefix: `範囲が小さい（/${maxPrefix} か、それより大きい範囲が要る）`,
            free: `空きのアドレスが少ない（${minFree} 個以上が要る）`,
          }[albIssue]}</p>
        </>
      )}
    </div>
  );
}

function OverlapResult({ config, output }: { config: OverlapConfig; output: OverlapOutput }) {
  const a = parseCidr(config.a);
  const b = parseCidr(config.b);
  if (!a.ok || !b.ok) return null;
  const start = Math.min(a.start, b.start);
  const end = Math.max(a.end, b.end);
  const span = end - start + 1;
  const percent = (count: number) => count / span * 100;
  const bandStyle = (startAt: number, count: number) => ({
    width: `${Math.max(3, percent(count))}%`,
    left: `${Math.min(percent(startAt - start), 100 - Math.max(3, percent(count)))}%`,
  });
  const sharedStart = Math.max(a.start, b.start);
  const verdict = config.context === 'peering' ? output.peering : output.subnets;
  const sizeIssues = ([['A', output.sizeIssueA], ['B', output.sizeIssueB]] as const)
    .flatMap(([label, issue]) => issue === 'none' ? [] : [`範囲 ${label} は${SIZE_ISSUE_LABEL[issue]}`]);
  return (
    <div>
      <ScaleLabels start={formatIpv4(start)} end={formatIpv4(end)} />
      {[
        { label: 'A', cidr: config.a, block: a },
        { label: 'B', cidr: config.b, block: b },
      ].map(({ label, cidr, block }) => (
        <div key={label}>
          <div className="cidr-scale">範囲 {label}：{cidr}</div>
          <div className="cidr-overlap-track" aria-hidden="true">
            <div className="cidr-overlap-band" style={bandStyle(block.start, block.total)} />
            {output.overlaps && <div className="cidr-overlap-shared" style={bandStyle(sharedStart, output.sharedCount)} />}
          </div>
        </div>
      ))}
      {Math.min(percent(a.total), percent(b.total)) < 3 && <p className="cidr-caption">狭いほうの帯を実際の幅より広く描いています。</p>}
      <p><strong>{RELATION_LABEL[output.relation]}。</strong><br />
        重なり：{number(output.sharedCount)} 個{output.overlaps && '（斜線）'}
      </p>
      {verdict === 'size' && (
        <p><strong>作れない大きさ</strong>（{sizeIssues.join('、')}。範囲は {RULES['size-range'].text}）</p>
      )}
      <p>{CONTEXT_LABEL[config.context]}：{{
        size: config.context === 'peering' ? 'この大きさの VPC は作れません' : 'この大きさのサブネットは作れません',
        can: '重なりの条件を満たします',
        cannot: config.context === 'peering' ? '接続を作れません' : 'この範囲では作れません',
      }[verdict ?? 'can']}。</p>
    </div>
  );
}

function SplitResult({ config, output }: { config: SplitConfig; output: SplitOutput }) {
  const count = config.azs * config.tiers.length;
  const { subnets, available, needed, remaining, usableTotal } = output;
  const blockSize = needed / count;
  const unused = available - blockSize * subnets.length;
  const vpc = parseCidr(config.vpc);
  return (
    <div>
      <p><strong>{SPLIT_LABEL[output.issue]}。</strong></p>
      <p>必要 {number(needed)} 個 ／ VPC の範囲 {number(available)} 個</p>
      {vpc.ok && <ScaleLabels start={formatIpv4(vpc.start)} end={formatIpv4(vpc.end)} />}
      <div className="cidr-split-band" aria-hidden="true">
        {subnets.map(({ cidr, az, tier }, index) => (
          <div key={cidr} className={`cidr-split-block ${config.tiers[Math.floor(index / config.azs)]?.kind}`} style={{ flexGrow: blockSize }}>
            <span className="cidr-split-number">{index + 1}</span>
            <span className="cidr-split-name">{tier}・AZ {az}</span>
          </div>
        ))}
        {unused > 0 && <div className="cidr-split-unused" style={{ flexGrow: unused }} />}
      </div>
      {output.issue === 'not-enough' && <p className="cidr-no-fit">入らない：{count - subnets.length} 個のサブネット</p>}
      {remaining !== undefined && <p>残り {number(remaining)} 個 ／ 全サブネットで使える {number(usableTotal ?? 0)} 個</p>}
      {subnets.length > 0 && (
        <ol className="cidr-subnet-list">
          {subnets.map(({ cidr, az, tier, usable }, index) => (
            <li key={cidr}><strong>{cidr}</strong><br />
              AZ {az} ／ {tierText(tier, config.tiers[Math.floor(index / config.azs)]!.kind)}<br />
              使えるアドレス：{number(usable)} 個
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CidrResult({ config, output }: { config: Config; output: Output }) {
  if (config.op === 'size' && 'allowed' in output) return <SizeResult output={output} />;
  if (config.op === 'overlap' && 'relation' in output) return <OverlapResult config={config} output={output} />;
  if (config.op === 'split' && 'fits' in output) return <SplitResult config={config} output={output} />;
  return null;
}
