import { useState } from 'react';
import { buildPresetConfig, PRESET, validateInput, type PresetEndpoint, type PresetSwitches } from '../../../../scripts/lib/sims/trace.mjs';
import { TraceResult, summarizeTrace, withStopLabel } from './TraceResult';

type Option<T> = readonly [value: T, label: string];

const ENDPOINTS = [...PRESET.hosts, ...PRESET.externals];
const DESTINATIONS = ENDPOINTS.map(({ id, label }): Option<PresetEndpoint> => [id as PresetEndpoint, label]);
const SOURCES = ENDPOINTS.flatMap(({ id, kind, label }): Option<NonNullable<PresetSwitches['from']>>[] =>
  kind === 'nat-gateway' || kind === 's3' ? [] : [[id as NonNullable<PresetSwitches['from']>, label]]);
const PORTS = [[443, '443'], [80, '80'], [22, '22'], [3306, '3306']] as const;
const PRESENCE = [[true, 'あり'], [false, 'なし']] as const;

function TraceSelect<T extends string | number | boolean>({ label, value, options, onChange }: {
  label: string;
  value: string | number | boolean;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="trace-field">
      {label}
      <select value={String(value)} onChange={(event) => {
        const option = options.find(([value]) => String(value) === event.target.value);
        if (option) onChange(option[0]);
      }}>
        {options.map(([value, name]) => <option key={String(value)} value={String(value)}>{name}</option>)}
      </select>
    </label>
  );
}

export function TraceExplore() {
  const [switches, setSwitches] = useState<PresetSwitches>({});
  const choose = <K extends keyof PresetSwitches,>(key: K) => (value: NonNullable<PresetSwitches[K]>) => {
    setSwitches((previous) => ({ ...previous, [key]: value }));
  };
  const config = buildPresetConfig(switches);
  const result = validateInput(config);

  return (
    <section className="card trace-explore" aria-labelledby="trace-explore-title">
      <h2 id="trace-explore-title">自由に試す</h2>
      <div className="trace-fields">
        <TraceSelect label="送信元" value={config.flow.from} options={SOURCES} onChange={choose('from')} />
        <TraceSelect label="宛先" value={config.flow.to} options={DESTINATIONS} onChange={choose('to')} />
        <TraceSelect label="宛先のポート" value={config.flow.port} options={PORTS} onChange={choose('port')} />
        <TraceSelect label="インターネットゲートウェイのアタッチ" value={config.vpc.igw} options={PRESENCE} onChange={choose('igw')} />
        <TraceSelect label="アプリのサブネットのルート" value={switches.appRoute ?? 'nat'} onChange={choose('appRoute')}
          options={[[ 'none', 'なし'], ['nat', 'NAT ゲートウェイへ'], ['igw', 'インターネットゲートウェイへ']]} />
        <TraceSelect label="S3 のエンドポイントのルート" value={config.routeTables['rt-app'].some(({ target }) => target === 'vpce-s3')}
          options={PRESENCE} onChange={choose('s3Endpoint')} />
        <TraceSelect label="アプリのサーバーのパブリック IP アドレス" value={Object.hasOwn(config.publicIps, 'app')}
          options={PRESENCE} onChange={choose('appPublicIp')} />
        <TraceSelect label="NAT ゲートウェイの置き場所" value={switches.natSubnet ?? 'pub'} onChange={choose('natSubnet')}
          options={[[ 'pub', 'パブリックのサブネット'], ['data', 'データのサブネット（ルートは local だけ）']]} />
        <TraceSelect label="アプリのサブネットのネットワーク ACL" value={switches.appNacl ?? 'default'} onChange={choose('appNacl')}
          options={[[ 'default', 'デフォルト'], ['https', '443 だけ許可（戻りの許可なし）'], ['ephemeral', '443 とエフェメラルポートを許可']]} />
        <TraceSelect label="アプリのセキュリティグループのインバウンドの送信元" value={switches.appInbound ?? 'alb'} onChange={choose('appInbound')}
          options={[[ 'alb', 'ALB のセキュリティグループ'], ['any', '0.0.0.0/0'], ['none', 'なし']]} />
      </div>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {result.ok && summarizeTrace(withStopLabel(config, result.output))}
      </div>
      {result.ok ? <TraceResult config={config} output={result.output} />
        : <p className="trace-error" role="alert">{result.error.message}</p>}
    </section>
  );
}
