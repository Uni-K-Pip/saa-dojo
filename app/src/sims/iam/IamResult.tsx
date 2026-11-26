import type {
  Condition, Config, Matched, Missing, Output, Policy, PolicyPrincipal, ResourceStatement, ScpLevel, Stage, Statement,
} from '../../../../scripts/lib/sims/iam.mjs';
import type { SettingRow } from '../SimFlow';

const SCP_LEVELS: Record<ScpLevel, string> = { root: 'ルート', ou: 'OU', account: 'アカウント' };
const POLICIES: Record<Policy, string> = {
  'scp-root': `SCP（${SCP_LEVELS.root}）`,
  'scp-ou': `SCP（${SCP_LEVELS.ou}）`,
  'scp-account': `SCP（${SCP_LEVELS.account}）`,
  identity: 'アイデンティティベースのポリシー',
  boundary: '権限の境界',
  'resource-policy': 'リソースベースのポリシー',
};
const MISSING: Record<Missing, string> = {
  scp: 'SCP に許可がありません',
  'no-allow': '許可するポリシーがありません',
  boundary: '権限の境界に許可がありません',
  'identity-side': 'プリンシパルの側のアイデンティティベースのポリシーに許可がありません',
  'resource-side': 'リソースの側のリソースベースのポリシーに許可がありません',
};
const STAGES: Record<Stage['stage'], string> = {
  deny: '明示的な拒否', scp: 'SCP', resource: POLICIES['resource-policy'],
  identity: POLICIES.identity, boundary: POLICIES.boundary,
};
const STATES: Record<Stage['state'], readonly [mark: string, label: string]> = {
  deny: ['✕', '拒否あり'],
  clear: ['✓', '拒否なし'],
  allow: ['✓', '許可あり'],
  'no-allow': ['－', '許可なし'],
  none: ['－', 'ポリシーなし'],
  exempt: ['－', '対象外（管理アカウント）'],
};
const IMPACTS: Record<Stage['impact'], string> = {
  'decides-deny': 'ここで拒否に決まります。ほかのポリシーの許可は結果を変えません。',
  grants: '許可の出どころです。',
  passes: '上限を満たしています。',
  blocks: 'この許可が足りません。',
  bypassed: 'リソースベースのポリシーが IAM ユーザーを名指しで許可しているので、ここに許可がなくても結果は変わりません。',
  unused: '',
};
const SIDES = {
  principal: 'プリンシパルのアカウントの評価', resource: 'リソースのアカウントの評価',
} as const;

type PolicyStatement = Statement | ResourceStatement;
type PolicyStatements = Record<Policy, PolicyStatement[] | null>;
type NumberedStage = { stage: Stage; number: number };

function principalText(principal: PolicyPrincipal) {
  return principal === '*' ? 'すべて（*）' : principal.arn;
}

function conditionText({ key, value }: Condition) {
  return `${key} が ${value}`;
}

function statementText({ effect, actions, resources, principal, condition }: PolicyStatement, scp = false) {
  const target = scp ? '' : ` → ${resources.join('、')}`;
  const subject = principal ? `（Principal: ${principalText(principal)}）` : '';
  const when = condition ? `（条件: ${conditionText(condition)}）` : '';
  return `${effect} ${actions.join('、')}${target}${subject}${when}`;
}

function policyText(statements: PolicyStatement[] | null) {
  return statements?.map((statement) => statementText(statement)).join(' ／ ') || 'なし';
}

export function iamSettings({ principal, org, request, resource, scps, identityPolicy, boundary, resourcePolicy }: Config): SettingRow[] {
  const actor = principal.kind === 'root' ? 'ルートユーザー'
    : `${principal.kind === 'user' ? 'IAM ユーザー' : 'ロール'} ${principal.name}`;
  const membership = org.membership === 'none' ? '組織に入っていない'
    : `${org.membership === 'member' ? 'メンバーアカウント' : '管理アカウント'}（${org.id}）`;
  const scpText = scps?.map(({ at, statements }) =>
    `${SCP_LEVELS[at]}: ${statements.map((statement) => statementText(statement, true)).join('; ')}`).join(' ／ ');
  return [
    { key: 'op', label: '操作', value: 'ポリシーの評価' },
    { key: 'principal', label: 'だれが', value: `${actor}（アカウント ${principal.account}）` },
    { key: 'org', label: '組織での立場', value: membership },
    { key: 'request', label: '何を', value: `${request.action}（TLS ${request.tls ? 'あり' : 'なし'}）` },
    { key: 'resource', label: 'どのリソースに', value: `${resource.arn}（アカウント ${resource.account}）` },
    { key: 'scps', label: 'SCP', value: scpText || 'なし' },
    { key: 'identityPolicy', label: POLICIES.identity, value: policyText(identityPolicy) },
    { key: 'boundary', label: POLICIES.boundary, value: policyText(boundary) },
    { key: 'resourcePolicy', label: POLICIES['resource-policy'], value: policyText(resourcePolicy) },
  ];
}

export function summarizeIam(output: Output): string {
  if (output.decision === 'allow') return '許可されます';
  if (output.decision === 'explicit-deny') {
    return `拒否されます（明示的な拒否）。${output.denyIn.map((policy) => POLICIES[policy]).join('、')}に、当てはまる Deny があります`;
  }
  return `拒否されます（暗黙の拒否）。${output.missing.map((missing) => MISSING[missing]).join('。')}`;
}

function getPolicies(config: Config): PolicyStatements {
  return {
    'scp-root': config.scps?.find(({ at }) => at === 'root')?.statements ?? null,
    'scp-ou': config.scps?.find(({ at }) => at === 'ou')?.statements ?? null,
    'scp-account': config.scps?.find(({ at }) => at === 'account')?.statements ?? null,
    identity: config.identityPolicy,
    boundary: config.boundary,
    'resource-policy': config.resourcePolicy,
  };
}

function matchedText({ policy, index }: Matched, policies: PolicyStatements) {
  const statement = policies[policy]?.[index];
  if (!statement) return [];
  const scp = policy.startsWith('scp-');
  return [`${scp ? `${POLICIES[policy]}: ` : ''}${statementText(statement, scp)}`];
}

function StageList({ stages, policies }: { stages: NumberedStage[]; policies: PolicyStatements }) {
  return (
    <ol className="iam-stage-list" role="list" start={stages[0]?.number}>
      {stages.map(({ stage, number }) => {
        const [mark, state] = STATES[stage.state];
        const impact = IMPACTS[stage.impact];
        const matched = stage.matched.flatMap((match) => matchedText(match, policies)).join(' ／ ');
        const className = ['iam-stage'];
        if (stage.impact === 'decides-deny' || stage.impact === 'blocks') className.push('iam-stage-blocked');
        if (stage.state === 'none' && stage.impact === 'unused') className.push('iam-stage-muted');
        return (
          <li key={number} className={className.join(' ')} style={{ animationDelay: `${(number - 1) * 120}ms` }}>
            <p className="iam-stage-heading">
              <span className="iam-stage-number">{number}</span>
              <strong>{STAGES[stage.stage]}</strong>
              <strong className={`iam-state-${stage.state}`}><span aria-hidden="true">{mark} </span>{state}</strong>
            </p>
            {matched && <p>当てはまった文: {matched}</p>}
            {impact && <p>{impact}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function StatementCard({ statement, matched }: { statement: PolicyStatement; matched: boolean }) {
  const { effect, actions, resources, principal, condition } = statement;
  return (
    <div className="iam-statement">
      {matched && <span className="iam-match-badge">当てはまった文</span>}
      <dl>
        <div><dt>Effect</dt><dd>{effect}</dd></div>
        <div><dt>Action</dt><dd>{actions.join('、')}</dd></div>
        <div><dt>Resource</dt><dd>{resources.join('、')}</dd></div>
        {principal && <div><dt>Principal</dt><dd>{principalText(principal)}</dd></div>}
        {condition && <div><dt>Condition</dt><dd>{conditionText(condition)}</dd></div>}
      </dl>
    </div>
  );
}

function PolicyDetails({ policies, stages }: { policies: PolicyStatements; stages: Stage[] }) {
  const matches = new Set(stages.flatMap(({ matched }) => matched.map(({ policy, index }) => `${policy}:${index}`)));
  return (
    <details className="iam-policies">
      <summary>ポリシーを見る</summary>
      {(Object.keys(policies) as Policy[]).map((policy) => {
        const statements = policies[policy];
        return (
          <section key={policy} className="iam-policy">
            <h3>{POLICIES[policy]}</h3>
            {statements?.length ? statements.map((statement, index) => (
              <StatementCard key={index} statement={statement} matched={matches.has(`${policy}:${index}`)} />
            )) : <p>なし</p>}
          </section>
        );
      })}
    </details>
  );
}

export function IamResult({ config, output }: { config: Config; output: Output }) {
  const policies = getPolicies(config);
  const stages = output.stages.map((stage, index) => ({ stage, number: index + 1 }));
  const hasSides = output.stages.some(({ side }) => side);
  return (
    <div className="iam-result">
      <p className="iam-summary"><strong>{summarizeIam(output)}</strong></p>
      {config.principal.kind === 'root' && <p>ルートユーザーの実行では、SCP だけを見ます。</p>}
      {hasSides && <p>別のアカウントのリソースなので、両方の評価が許可して初めて通ります。</p>}
      <div className="iam-stage-groups" key={JSON.stringify([config, output])}>
        {hasSides ? Object.entries(SIDES).map(([side, title]) => (
          <section key={side}>
            <h3>{title}</h3>
            <StageList stages={stages.filter(({ stage }) => stage.side === side)} policies={policies} />
          </section>
        )) : <StageList stages={stages} policies={policies} />}
      </div>
      <PolicyDetails policies={policies} stages={output.stages} />
    </div>
  );
}
