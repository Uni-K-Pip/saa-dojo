import { useState } from 'react';
import {
  formatIpv4, parseCidr, validateInput, type Config, type OverlapConfig, type SizeConfig, type SplitConfig, type Tier,
} from '../../../../scripts/lib/sims/cidr.mjs';
import { CidrResult, CONTEXT_LABEL, ROLE_LABEL, TIER_LABEL } from './CidrResult';

const MIN_SLIDER_PREFIX = 8;
const MAX_PREFIX = 32;
const TIER_DEFAULTS: Tier[] = [
  { name: 'パブリック', kind: 'public' },
  { name: 'アプリ', kind: 'private' },
  { name: 'データ', kind: 'isolated' },
];

type Field = 'cidr' | 'a' | 'b' | 'vpc';

function ExploreResult({ config, fixCidr }: { config: Config; fixCidr: (field: Field, cidr: string) => void }) {
  const result = validateInput(config);
  const fix = result.ok ? undefined : result.error.fix;
  const field = result.ok ? undefined : result.error.field;
  return (
    <>
      <div aria-live="polite" aria-atomic="true">
        {!result.ok && <p className="cidr-error">{result.error.message}</p>}
      </div>
      {fix && (field === 'cidr' || field === 'a' || field === 'b' || field === 'vpc') && (
        <button className="btn" type="button" onClick={() => fixCidr(field, fix)}>直した値を入れる（{fix}）</button>
      )}
      {result.ok && <CidrResult config={config} output={result.output} />}
    </>
  );
}

function PrefixSlider({ label, value, onChange }: { label: string; value: number; onChange: (prefix: number) => void }) {
  return (
    <label className="cidr-field">
      <span>{label}：/{value}</span>
      <input type="range" min={MIN_SLIDER_PREFIX} max={MAX_PREFIX} value={Math.max(MIN_SLIDER_PREFIX, value)}
        aria-label={label} aria-valuetext={`/${value}`}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
      <span className="cidr-scale" aria-hidden="true"><span>/{MIN_SLIDER_PREFIX}</span><span>/{MAX_PREFIX}</span></span>
    </label>
  );
}

function SizeExplore() {
  const [cidr, setCidr] = useState('10.0.0.0/24');
  const [role, setRole] = useState<SizeConfig['role']>('subnet');
  const [alb, setAlb] = useState(false);
  const [inUse, setInUse] = useState('0');
  const config: SizeConfig = {
    op: 'size', cidr, role,
    ...(alb && role === 'subnet' ? { purpose: 'alb', inUse: Number(inUse) } : {}),
  };
  const block = parseCidr(cidr);

  const slide = (prefix: number) => {
    if (!block.ok) return;
    const size = 2 ** (MAX_PREFIX - prefix);
    setCidr(`${formatIpv4(Math.floor(block.start / size) * size)}/${prefix}`);
  };

  return (
    <>
      <div className="cidr-fields">
        <label className="cidr-field">種類
          <select value={role} onChange={(event) => setRole(event.target.value === 'vpc' ? 'vpc' : 'subnet')}>
            <option value="subnet">{ROLE_LABEL.subnet}</option>
            <option value="vpc">{ROLE_LABEL.vpc}</option>
          </select>
        </label>
        <label className="cidr-field">CIDR
          <input type="text" value={cidr} onChange={(event) => setCidr(event.target.value)} spellCheck={false} autoCapitalize="off" />
        </label>
        {block.ok && <PrefixSlider label="プレフィックス長" value={block.prefix} onChange={slide} />}
        {role === 'subnet' && (
          <label className="cidr-checkbox">
            <input type="checkbox" checked={alb} onChange={(event) => setAlb(event.target.checked)} /> ALB の条件を確かめる
          </label>
        )}
        {alb && role === 'subnet' && (
          <label className="cidr-field">使用中のアドレス
            <input type="number" min={0} step={1} value={inUse} onChange={(event) => setInUse(event.target.value)} />
          </label>
        )}
      </div>
      <ExploreResult config={config} fixCidr={(_, fixed) => setCidr(fixed)} />
    </>
  );
}

function OverlapExplore() {
  const [a, setA] = useState('10.0.0.0/16');
  const [b, setB] = useState('10.0.128.0/17');
  const [context, setContext] = useState<OverlapConfig['context']>('peering');
  return (
    <>
      <div className="cidr-fields">
        <label className="cidr-field">場面
          <select value={context} onChange={(event) => setContext(event.target.value === 'subnets' ? 'subnets' : 'peering')}>
            <option value="peering">{CONTEXT_LABEL.peering}</option>
            <option value="subnets">{CONTEXT_LABEL.subnets}</option>
          </select>
        </label>
        <label className="cidr-field">範囲 A
          <input type="text" value={a} onChange={(event) => setA(event.target.value)} spellCheck={false} autoCapitalize="off" />
        </label>
        <label className="cidr-field">範囲 B
          <input type="text" value={b} onChange={(event) => setB(event.target.value)} spellCheck={false} autoCapitalize="off" />
        </label>
      </div>
      <ExploreResult config={{ op: 'overlap', a, b, context }} fixCidr={(field, fixed) => (field === 'a' ? setA : setB)(fixed)} />
    </>
  );
}

function SplitExplore() {
  const [config, setConfig] = useState<SplitConfig>({
    op: 'split', vpc: '10.0.0.0/24', azs: 2, tiers: TIER_DEFAULTS, prefix: 26,
  });
  const update = (changes: Partial<SplitConfig>) => setConfig((old) => ({ ...old, ...changes }));
  const updateTier = (index: number, changes: Partial<Tier>) => {
    setConfig((old) => ({ ...old, tiers: old.tiers.map((tier, i) => i === index ? { ...tier, ...changes } : tier) }));
  };

  return (
    <>
      <div className="cidr-fields">
        <label className="cidr-field">VPC の CIDR
          <input type="text" value={config.vpc} onChange={(event) => update({ vpc: event.target.value })} spellCheck={false} autoCapitalize="off" />
        </label>
        <label className="cidr-field">AZ の数
          <select value={config.azs} onChange={(event) => update({ azs: Number(event.target.value) })}>
            {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className="cidr-field">層の数
          <select value={config.tiers.length} onChange={(event) => {
            const count = Number(event.target.value);
            update({ tiers: Array.from({ length: count }, (_, index) => config.tiers[index] ?? TIER_DEFAULTS[index]!) });
          }}>
            {[1, 2, 3].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        {config.tiers.map(({ kind, name }, i) => (
          <fieldset className="cidr-tier" key={i}>
            <legend>層 {i + 1}</legend>
            <label className="cidr-field">名前
              <input type="text" value={name} maxLength={12} onChange={(event) => updateTier(i, { name: event.target.value })} />
            </label>
            <label className="cidr-field">種類
              <select value={kind} onChange={(event) => updateTier(i, { kind: event.target.value as Tier['kind'] })}>
                {Object.entries(TIER_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </fieldset>
        ))}
        <PrefixSlider label="サブネットのプレフィックス長" value={config.prefix} onChange={(prefix) => update({ prefix })} />
      </div>
      <ExploreResult config={config} fixCidr={(_, vpc) => update({ vpc })} />
    </>
  );
}

const OPERATIONS = [
  { id: 'size', label: '大きさ', Explore: SizeExplore },
  { id: 'overlap', label: '重なり', Explore: OverlapExplore },
  { id: 'split', label: '分割', Explore: SplitExplore },
] as const;

export function CidrExplore() {
  const [operation, setOperation] = useState<Config['op']>('size');
  const Explore = OPERATIONS.find(({ id }) => id === operation)!.Explore;
  return (
    <section className="card" aria-labelledby="cidr-explore">
      <h2 id="cidr-explore">自由に試す</h2>
      <div className="sim-toggles" role="group" aria-label="操作">
        {OPERATIONS.map(({ id, label }) => (
          <button key={id} type="button" className="btn" onClick={() => setOperation(id)} aria-pressed={operation === id}>{label}</button>
        ))}
      </div>
      <Explore />
    </section>
  );
}
