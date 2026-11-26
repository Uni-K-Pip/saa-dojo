import { useState } from 'react';
import { buildPresetConfig, validateInput, type PresetSwitches } from '../../../../scripts/lib/sims/iam.mjs';
import { IamResult, iamSettings, summarizeIam } from './IamResult';

type Option<T> = readonly [value: T, label: string];
const ACTIONS = ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'] as const;

function IamSelect<T extends string | boolean>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <label className="iam-field">
      {label}
      <select value={String(value)} disabled={disabled} onChange={(event) => {
        const option = options.find(([value]) => String(value) === event.target.value);
        if (option) onChange(option[0]);
      }}>
        {options.map(([value, name]) => <option key={String(value)} value={String(value)}>{name}</option>)}
      </select>
    </label>
  );
}

export function IamExplore() {
  const [switches, setSwitches] = useState<PresetSwitches>({});
  const choose = <K extends keyof PresetSwitches,>(key: K) => (value: NonNullable<PresetSwitches[K]>) => {
    setSwitches((previous) => ({ ...previous, [key]: value }));
  };
  const config = buildPresetConfig(switches);
  const result = validateInput(config);
  const root = config.principal.kind === 'root';
  const request = iamSettings(config).filter(({ key }) => key === 'principal' || key === 'request' || key === 'resource');

  return (
    <section className="card iam-explore" aria-labelledby="iam-explore-title">
      <h2 id="iam-explore-title">自由に試す</h2>
      <div className="iam-fields">
        <IamSelect label="だれが" value={config.principal.kind} onChange={choose('principal')}
          options={[[ 'user', 'IAM ユーザー'], ['role', 'ロール'], ['root', 'ルートユーザー']]} />
        <IamSelect label="何を" value={switches.action ?? 's3:GetObject'} onChange={choose('action')}
          options={ACTIONS.map((action) => [action, action])} />
        <IamSelect label="リソースのアカウント" value={switches.crossAccount ?? false} onChange={choose('crossAccount')} disabled={root}
          options={[[false, '同じアカウント'], [true, '別のアカウント']]} />
        <IamSelect label="TLS" value={config.request.tls} onChange={choose('tls')} options={[[true, 'あり'], [false, 'なし']]} />
        <IamSelect label="組織での立場" value={config.org.membership} onChange={choose('membership')}
          options={[[ 'member', 'メンバーアカウント'], ['none', '組織に入っていない'], ['management', '管理アカウント']]} />
        <IamSelect label="SCP" value={switches.scp ?? 'none'} onChange={choose('scp')} disabled={config.org.membership === 'none'}
          options={[[ 'none', 'なし'], ['full', 'すべての階層で Allow *'], ['ou-read-only', 'OU だけ Allow s3:Get*'],
            ['deny-delete', 'アカウントで s3:DeleteObject を Deny']]} />
        <IamSelect label="アイデンティティベースのポリシー" value={switches.identity ?? 'read'} onChange={choose('identity')} disabled={root}
          options={[[ 'read', 'Allow s3:GetObject'], ['none', 'なし'], ['read-write', 'Allow s3:GetObject と s3:PutObject'], ['all', 'Allow s3:*']]} />
        <IamSelect label="権限の境界" value={switches.boundary ?? 'none'} onChange={choose('boundary')} disabled={root}
          options={[[ 'none', 'なし'], ['read', 'Allow s3:Get*'], ['all', 'Allow s3:*']]} />
        <IamSelect label="バケットポリシー" value={switches.bucketPolicy ?? 'none'} onChange={choose('bucketPolicy')} disabled={root}
          options={[[ 'none', 'なし'], ['allow-principal', 'プリンシパルを名指しで Allow'], ['allow-org', '組織のプリンシパルに Allow'],
            ['deny-insecure', 'TLS なしのリクエストを Deny'], ['allow-principal-deny-insecure', '名指しで Allow と、TLS なしを Deny']]} />
      </div>
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {result.ok && summarizeIam(result.output)}
      </div>
      {result.ok ? (
        <>
          <p>{request.map(({ value }) => value).join(' ／ ')}</p>
          <IamResult config={config} output={result.output} />
        </>
      ) : <p className="iam-error" role="alert">{result.error.message}</p>}
    </section>
  );
}
