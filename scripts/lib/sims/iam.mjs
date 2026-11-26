export const DESCRIPTION = 'だれが・何を・どのリソースに、を決めて、関係するポリシーから、リクエストが許可されるか拒否されるかを確かめます。';

export const NOT_COVERED = [
  'リソースコントロールポリシー（RCP）は扱いません。組織のポリシーは SCP だけです。',
  'ロールを引き受ける操作（sts:AssumeRole）と信頼ポリシーは扱いません。',
  'KMS のキーとキーポリシーは扱いません。',
  'セッションポリシー、フェデレーションのセッション、匿名のリクエストは扱いません。',
  'NotAction などの否定の要素とポリシー変数は扱いません。条件キーは 2 種類だけです。',
  'リソースベースのポリシーは S3 のバケットポリシーだけです。ACL などの例外は扱いません。',
];

export const NOT_COVERED_LINKS = {
  [NOT_COVERED[0]]: { lessonRef: 'lesson-1.1-multi-account', label: '組織のポリシー' },
  [NOT_COVERED[1]]: { lessonRef: 'lesson-1.1-roles-federation', label: 'ロールと信頼ポリシー' },
  [NOT_COVERED[2]]: { lessonRef: 'lesson-1.3-encryption-and-keys', label: 'KMS のキーポリシー' },
};

export const RULES = {
  'default-deny': {
    label: '暗黙の拒否', text: 'IAM ユーザーやロールのリクエストは、ポリシーで明示的に許可されていなければ暗黙に拒否されます',
    factRef: 'iam.implicit-deny', evidence: ['既定ではすべてのリクエストが暗黙に拒否される', 'ポリシーで明示的に許可されている必要がある'],
  },
  'root-full-access': {
    label: 'ルートユーザーの権限', text: 'ルートユーザーは、暗黙の拒否の既定に対する例外で、完全なアクセス権を持ちます',
    factRef: 'iam.implicit-deny', evidence: ['ルートユーザーは完全なアクセス権を持つ例外'],
  },
  'explicit-deny': {
    label: '明示的な拒否の優先', text: 'どのポリシーでも、明示的な拒否があれば許可より優先して拒否されます',
    factRef: 'iam.policy-evaluation-allow-deny', evidence: ['どのポリシーでも明示的な拒否があれば、許可より優先して拒否される'],
  },
  'same-account-union': {
    label: '同じアカウントでの許可', text: '同じアカウントでは、アイデンティティベースとリソースベースのポリシーのどちらかが許可していれば許可されます',
    factRef: 'iam.policy-evaluation-allow-deny', evidence: ['どちらかが許可していれば許可される'],
  },
  'identity-policy': {
    label: 'アイデンティティベースのポリシー', text: 'アイデンティティベースのポリシーは、IAM ユーザーやロールが何をどのリソースにどんな条件で実行できるかを決めます',
    factRef: 'iam.identity-policy-types', evidence: ['その ID が何をどのリソースにどんな条件で実行できるかを決める'],
  },
  'boundary-ceiling': {
    label: '権限の境界による上限', text: '権限の境界自体は権限を付与せず、アイデンティティベースのポリシーを通じて実行できるのは、そのポリシーと境界の両方が許可する操作に限られます',
    factRef: 'iam.boundary-basics', evidence: ['そのポリシーと境界の両方が許可する操作に限られる', '境界自体は権限を付与しない'],
  },
  'boundary-user-direct': {
    label: 'IAM ユーザーの ARN への直接の許可', text: '同じアカウントでリソースベースのポリシーが IAM ユーザーの ARN に直接与えた許可は、アイデンティティベースのポリシーや権限の境界の暗黙の拒否では制限されません',
    factRef: 'iam.boundary-resource-policy', evidence: ['IAM ユーザーの ARN に直接許可を与えている場合', '暗黙の拒否では制限されない'],
  },
  'boundary-role-arn': {
    label: 'IAM ロールの ARN への許可と境界', text: '同じアカウントでリソースベースのポリシーが IAM ロールの ARN に与えた許可は、権限の境界の暗黙の拒否で制限されます',
    factRef: 'iam.boundary-resource-policy', evidence: ['IAM ロールの ARN への許可は、境界の暗黙の拒否で制限される'],
  },
  'scp-ceiling': {
    label: 'SCP による上限', text: 'SCP は組織内の IAM ユーザーやロールが使える権限の上限を定め、実際の許可には IAM ポリシーなどが必要です',
    factRef: 'organizations.scp-permission-ceiling', evidence: ['権限の上限を定める', 'SCP 自体は権限を付与せず'],
  },
  'scp-every-level': {
    label: 'SCP のすべての階層での許可', text: 'SCP の評価で許可されるには、組織のルートから対象アカウントまでのすべての階層にその操作を許可する Allow が必要です',
    factRef: 'organizations.scp-allow-at-every-level', evidence: ['すべての階層でその操作を許可する Allow が必要'],
  },
  'scp-deny': {
    label: 'SCP の明示的な拒否', text: '組織のルート、OU、対象アカウントのどの階層でも、SCP が操作を明示的に拒否すると、その操作は拒否されます',
    factRef: 'organizations.scp-deny-inheritance', evidence: ['いずれかに付いた SCP が操作を明示的に拒否すると、その操作は拒否される'],
  },
  'scp-root-user': {
    label: 'メンバーアカウントのルートユーザー', text: 'SCP は、メンバーアカウントのルートユーザーが行う操作にも制限を適用します',
    factRef: 'organizations.scp-member-root', evidence: ['メンバーアカウントのルートユーザーが行う操作にも制限を適用する'],
  },
  'scp-management': {
    label: '管理アカウントの SCP', text: '管理アカウントの操作を SCP で制限することはできません',
    factRef: 'organizations.scp-management-exemption', evidence: ['管理アカウントの操作をその SCP で制限できない'],
  },
  'cross-account-both': {
    label: '別のアカウントで両方に要る許可', text: '別のアカウントのリソースへのリクエストは、プリンシパル側のアイデンティティベースのポリシーとリソース側のリソースベースのポリシーの両方が許可していて初めて許可され、どちらかのアカウントの評価に明示的な拒否があれば拒否されます',
    factRef: 'iam.cross-account-both-policies', evidence: ['両方が許可していて初めて', 'どちらかのアカウントの評価で明示的な拒否があれば拒否される'],
  },
  'principal-account': {
    label: 'Principal のアカウント指定', text: 'Principal 要素でルートユーザーの ARN を指定すると、アカウント全体への委任になります',
    factRef: 'iam.global-key-principalarn', evidence: ['Principal 要素ではアカウント全体への委任になる'],
  },
  'principal-org': {
    label: '組織に限った許可', text: 'リソースベースのポリシーで Principal を * にし、aws:PrincipalOrgID を StringEquals で比べると、許可の対象を指定した組織のメンバーのアカウントのプリンシパルに限れます',
    factRef: 'iam.principal-wildcard-orgid', evidence: ['許可の対象を指定した組織のメンバーのアカウントのプリンシパルに限れる'],
  },
  'cond-org-id': {
    label: '組織 ID の条件', text: 'aws:PrincipalOrgID は、組織に属するプリンシパルの要求にだけ含まれます',
    factRef: 'iam.global-key-principalorgid', evidence: ['組織に属するプリンシパルの要求にだけ含まれる'],
  },
  'cond-secure-transport': {
    label: 'TLS の条件', text: 'aws:SecureTransport は要求が TLS で送られたかを true か false で表し、常に要求に含まれます',
    factRef: 'iam.global-key-securetransport', evidence: ['要求が TLS で送られたかを true か false で表す', '常に要求に含まれる'],
  },
  'resource-policy-s3': {
    label: 'S3 のバケットポリシー', text: 'バケットポリシーは、バケットとその中のオブジェクトへのアクセスを許可・拒否するリソースベースのポリシーです',
    factRef: 's3.bucket-policy', evidence: ['アクセスを許可・拒否する JSON 形式のリソースベースポリシー'],
  },
  wildcard: {
    label: 'ワイルドカード', text: 'Resource の ARN の区画内では * が任意の文字列に一致し、Action でも複数の文字に一致する * を使えます',
    factRef: 'iam.policy-resource-element', evidence: ['* が任意の文字列に', '複数の文字に一致する *'],
  },
};

export const OUTPUT_KEYS = {
  evaluate: {
    decision: 'enum', allowed: 'boolean', blocker: 'enum', denyIn: 'array',
    missing: 'array', crossAccount: 'boolean', stages: 'array',
  },
};

const ACTION_WILDCARDS = true;
const TLS = 'aws:SecureTransport';
const ORG_ID = 'aws:PrincipalOrgID';
const ACCOUNT = /^\d{12}$/;
const NAME = /^[a-z0-9-]{1,32}$/;
const ORGANIZATION = /^o-[a-z0-9]{10,32}$/;
const ACTION = /^([a-z][a-z0-9]*):([A-Z][a-zA-Z0-9*]*|\*)$/;
const ARN = /^arn:aws:([a-z][a-z0-9]*):[a-z0-9-]*:(\d{12}|):[\s\S]+$/;
const PRINCIPAL_ARN = /^arn:aws:iam::(\d{12}):(?:root|(?:user|role)\/[a-z0-9-]{1,32})$/;
const SCP_LEVELS = ['root', 'ou', 'account'];
const NEGATED_KEYS = ['NotAction', 'NotResource', 'NotPrincipal', 'notAction', 'notResource', 'notPrincipal'];

const isRecord = (value) => Object.prototype.toString.call(value) === '[object Object]';
const isString = (value) => typeof value === 'string';
const isBool = (value) => typeof value === 'boolean';
const fits = (pattern, value) => isString(value) && pattern.test(value);
const objectOf = (value, keys) => isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
const arrayOf = (value, min, max, check) => Array.isArray(value) && value.length >= min && value.length <= max &&
  Array.from(value).every(check);
const hasStar = (value) => value.includes('*');

class InputError extends Error {
  constructor(code, message, field) {
    super(message);
    this.result = { ok: false, error: { code, message, ...(field && { field }) } };
  }
}

function requireInput(condition, code, message, field) {
  if (!condition) throw new InputError(code, message, field);
}

function requireShape(condition, field) {
  requireInput(condition, 'input', `${field} の項目、形式、個数を確認してください。`, field);
}

function checkSupportedText(value, field) {
  requireInput(!value.includes('?') && !value.includes('${'), 'unsupported', '? のワイルドカードとポリシー変数は扱いません。', field);
}

function readAction(value, field, { policy = false, actionWildcards = false } = {}) {
  checkSupportedText(value, field);
  requireInput(!policy || actionWildcards || !hasStar(value), 'unsupported', 'アクションのワイルドカードは無効です。', field);
  if (policy && value === '*') return;
  const action = ACTION.exec(value);
  requireInput(action && (policy || !hasStar(value)), 'format', 'アクションは s3:GetObject のように指定してください。', field);
  return action[1];
}

function readArn(value, field, policy = false) {
  checkSupportedText(value, field);
  if (policy && value === '*') return;
  const arn = ARN.exec(value);
  requireInput(arn && (policy || !hasStar(value)), 'format',
    'ARN は arn:aws:サービス:リージョン:アカウント:リソース の形で指定してください。', field);
  return arn;
}

const principalArn = ({ kind, name, account }) => `arn:aws:iam::${account}:${kind === 'root' ? 'root' : `${kind}/${name}`}`;
const accountRoot = (account) => principalArn({ kind: 'root', account });

function checkPolicyPrincipal(statement, config, field) {
  const { effect, condition, principal } = statement;
  const accounts = [config.principal.account, config.resource.account];
  if (isString(principal)) checkSupportedText(principal, field);
  if (principal !== '*') {
    requireShape(objectOf(principal, ['arn']) && isString(principal.arn), field);
    checkSupportedText(principal.arn, field);
    const arn = PRINCIPAL_ARN.exec(principal.arn);
    requireInput(arn, 'format', 'Principal には、IAM ユーザーかロールの ARN、またはアカウントのルートユーザーの ARN を指定してください。', field);
    requireInput(accounts.includes(arn[1]), 'unsupported', 'Principal にリクエストと無関係なアカウントの ARN は指定できません。', field);
  }
  if (effect !== 'Allow') return;
  requireInput(principal !== '*' || condition?.key === ORG_ID, 'unsupported',
    'Principal が * の Allow には aws:PrincipalOrgID の条件が必要です。', field);
  requireInput(accounts[0] !== accounts[1] || (principal !== '*' && principal.arn !== accountRoot(accounts[0])), 'unsupported',
    '同じアカウントの Allow では、ルートユーザーの ARN（アカウント全体）や * を Principal に指定できません。', field);
}

function checkStatements(statements, field, config, actionWildcards, { scp = false, resource = false } = {}) {
  requireShape(arrayOf(statements, field === 'identityPolicy' ? 0 : 1, 4, isRecord), field);
  for (const [index, statement] of statements.entries()) {
    const path = `${field}.${index}`;
    requireInput(!NEGATED_KEYS.some((key) => Object.hasOwn(statement, key)), 'unsupported',
      'NotAction、NotResource、NotPrincipal は扱いません。', path);
    const { effect, actions, resources, condition } = statement;
    requireShape(objectOf(statement, ['effect', 'actions', 'resources', 'principal', 'condition']) &&
      ['Allow', 'Deny'].includes(effect) && arrayOf(actions, 1, 4, isString) && arrayOf(resources, 1, 4, isString), path);
    for (const action of actions) readAction(action, `${path}.actions`, { policy: true, actionWildcards });
    for (const arn of resources) readArn(arn, `${path}.resources`, true);
    requireInput(!scp || (resources.length === 1 && resources[0] === '*'), 'combination',
      'SCP の Resource には * を 1 つだけ指定してください。', `${path}.resources`);
    requireInput(resource || !Object.hasOwn(statement, 'principal'), 'combination',
      'Principal はリソースベースのポリシーにだけ指定できます。', `${path}.principal`);
    if (Object.hasOwn(statement, 'condition')) {
      const conditionField = `${path}.condition`;
      requireShape(objectOf(condition, ['key', 'value']) && isString(condition.key), conditionField);
      requireInput([TLS, ORG_ID].includes(condition.key), 'unsupported',
        '条件キーは aws:SecureTransport と aws:PrincipalOrgID だけ扱います。', conditionField);
      requireInput(resource || condition.key !== ORG_ID, 'combination',
        'aws:PrincipalOrgID はリソースベースのポリシーにだけ指定できます。', conditionField);
      if (isString(condition.value)) checkSupportedText(condition.value, conditionField);
      requireShape(condition.key === TLS ? isBool(condition.value) : fits(ORGANIZATION, condition.value), conditionField);
    }
    if (resource) checkPolicyPrincipal(statement, config, `${path}.principal`);
  }
}

function checkConfig(config, actionWildcards) {
  const keys = ['op', 'principal', 'org', 'request', 'resource', 'scps', 'identityPolicy', 'boundary', 'resourcePolicy'];
  requireInput(objectOf(config, keys) && config.op === 'evaluate', 'input', 'IAM のポリシーの評価の設定を指定してください。');
  for (const key of keys) requireShape(Object.hasOwn(config, key), key);
  const { principal, org, request, resource, scps, identityPolicy, boundary, resourcePolicy } = config;
  requireShape(objectOf(principal, ['kind', 'name', 'account']) && fits(ACCOUNT, principal.account) &&
    (principal.kind === 'root' ? !Object.hasOwn(principal, 'name') : ['user', 'role'].includes(principal.kind) && fits(NAME, principal.name)), 'principal');
  requireShape(objectOf(org, ['membership', 'id']) &&
    (org.membership === 'none' ? !Object.hasOwn(org, 'id') : ['member', 'management'].includes(org.membership) && fits(ORGANIZATION, org.id)), 'org');
  requireShape(objectOf(request, ['action', 'tls']) && isString(request.action) && isBool(request.tls), 'request');
  requireShape(objectOf(resource, ['arn', 'account']) && isString(resource.arn) && fits(ACCOUNT, resource.account), 'resource');
  const service = readAction(request.action, 'request.action');
  requireInput(!['sts', 'kms'].includes(service), 'unsupported', 'STS と KMS のリクエストは扱いません。', 'request.action');
  const [, arnService, arnAccount] = readArn(resource.arn, 'resource.arn');
  requireInput(service === arnService, 'combination', 'アクションとリソースの ARN は同じサービスを指定してください。', 'resource.arn');
  requireInput(!arnAccount || arnAccount === resource.account, 'combination',
    'リソースの ARN のアカウントは resource.account とそろえてください。', 'resource.arn');

  checkStatements(identityPolicy, 'identityPolicy', config, actionWildcards);
  requireInput(principal.kind !== 'root' || (identityPolicy.length === 0 && boundary === null &&
    resourcePolicy === null && resource.account === principal.account), 'combination',
  'ルートユーザーは、SCP だけをポリシーに使い、同じアカウントのリソースを指定してください。', 'principal');
  requireInput(resourcePolicy === null || service === 's3', 'combination',
    'リソースベースのポリシーは S3 のリソースにだけ指定できます。', 'resourcePolicy');
  if (boundary !== null) checkStatements(boundary, 'boundary', config, actionWildcards);
  if (resourcePolicy !== null) checkStatements(resourcePolicy, 'resourcePolicy', config, actionWildcards, { resource: true });
  if (scps === null) return;
  requireInput(org.membership !== 'none', 'combination', 'SCP は組織に属するアカウントにだけ指定できます。', 'scps');
  requireShape(arrayOf(scps, 2, 3, (scp, index) => objectOf(scp, ['at', 'statements']) &&
    scp.at === (scps.length === 2 && index === 1 ? 'account' : SCP_LEVELS[index])), 'scps');
  for (const [index, { statements }] of scps.entries()) checkStatements(statements, `scps.${index}.statements`, config, actionWildcards, { scp: true });
}

function matches(pattern, value) {
  const [prefix, ...parts] = pattern.split('*');
  if (!parts.length) return value === prefix;
  const suffix = parts.pop();
  if (!value.startsWith(prefix) || !value.endsWith(suffix)) return false;
  const end = value.length - suffix.length;
  let position = prefix.length;
  for (const part of parts) {
    const index = value.indexOf(part, position);
    if (index === -1) return false;
    position = index + part.length;
  }
  return position <= end;
}

function scan(statements, policy, context) {
  const { config, arn, used, actionWildcards } = context;
  const { request, resource, principal, org } = config;
  const allow = [];
  const deny = [];
  let direct = false;
  for (const [index, statement] of (statements ?? []).entries()) {
    const { effect, actions, resources, principal: target, condition } = statement;
    if (actions.some(hasStar) || resources.some(hasStar)) used.add('wildcard');
    if (!actions.some((action) => actionWildcards ? matches(action, request.action) : action === request.action) ||
        !resources.some((pattern) => matches(pattern, resource.arn))) continue;
    if (condition?.key === ORG_ID) {
      used.add('cond-org-id');
      if (effect === 'Allow' && target === '*') used.add('principal-org');
    }
    const wholeAccount = target?.arn === accountRoot(principal.account);
    if (target && target !== '*' && !wholeAccount && target.arn !== arn) continue;
    if (condition?.key === TLS) {
      used.add('cond-secure-transport');
      if (request.tls !== condition.value) continue;
    }
    if (condition?.key === ORG_ID && org.id !== condition.value) continue;
    if (wholeAccount) used.add('principal-account');
    if (effect === 'Allow' && !wholeAccount && target?.arn === arn) direct = true;
    (effect === 'Allow' ? allow : deny).push({ policy, index, effect });
  }
  return { allow, deny, direct, state: allow.length ? 'allow' : statements?.length ? 'no-allow' : 'none' };
}

function buildStages({ root, crossAccount, deny, resourceDeny, scp, identity, boundary, resource, directUser, missing }) {
  const explicit = deny.length > 0 || resourceDeny.length > 0;
  const stage = (name, state, impact, matched, side) => ({
    stage: name, ...(side && { side }), state,
    impact: explicit && name !== 'deny' ? 'unused' : impact, matched,
  });
  const denyStage = (matched, side) =>
    stage('deny', matched.length ? 'deny' : 'clear', matched.length ? 'decides-deny' : 'unused', matched, side);
  const ceilingImpact = (state, bypassed = false) =>
    state === 'allow' ? 'passes' : state === 'no-allow' ? (bypassed ? 'bypassed' : 'blocks') : 'unused';
  const side = crossAccount ? 'principal' : undefined;
  const scpStage = stage('scp', scp.state, ceilingImpact(scp.state), scp.allow, side);
  if (root) return [denyStage(deny), scpStage];

  const identityImpact = identity.allow.length ? 'grants' : directUser ? 'bypassed' :
    crossAccount || missing.includes('no-allow') ? 'blocks' : 'unused';
  const identityStage = stage('identity', identity.state, identityImpact, identity.allow, side);
  const boundaryStage = stage('boundary', boundary.state, ceilingImpact(boundary.state, directUser), boundary.allow, side);
  const resourceStage = stage('resource', resource.state,
    resource.allow.length ? 'grants' : crossAccount ? 'blocks' : 'unused', resource.allow, crossAccount ? 'resource' : undefined);
  return crossAccount
    ? [denyStage(deny, 'principal'), scpStage, identityStage, boundaryStage, denyStage(resourceDeny, 'resource'), resourceStage]
    : [denyStage([...deny, ...resourceDeny]), scpStage, resourceStage, identityStage, boundaryStage];
}

function evaluate(config, actionWildcards) {
  const { principal, org, scps, identityPolicy, boundary, resourcePolicy } = config;
  const root = principal.kind === 'root';
  const crossAccount = principal.account !== config.resource.account;
  const used = new Set(root ? ['root-full-access'] : ['default-deny', 'identity-policy']);
  const context = { config, arn: principalArn(principal), used, actionWildcards };
  const levels = org.membership === 'member' ? scps ?? [] : [];
  const scpResults = levels.map(({ at, statements }) => scan(statements, `scp-${at}`, context));
  const scp = {
    state: scpResults.length ? (scpResults.every(({ allow }) => allow.length) ? 'allow' : 'no-allow') : scps ? 'exempt' : 'none',
    allow: scpResults.flatMap(({ allow }) => allow),
    deny: scpResults.flatMap(({ deny }) => deny),
  };
  const identity = scan(identityPolicy, 'identity', context);
  const limit = scan(boundary, 'boundary', context);
  const resource = scan(resourcePolicy, 'resource-policy', context);
  const deny = [...scp.deny, ...identity.deny, ...limit.deny];
  const denyIn = [...new Set([...deny, ...resource.deny].map(({ policy }) => policy))];
  const directUser = !crossAccount && principal.kind === 'user' && resource.direct;
  const missing = [];
  if (!denyIn.length) {
    if (scp.state === 'no-allow') missing.push('scp');
    if (!root && !directUser) {
      if (!identity.allow.length && (crossAccount || !resource.direct)) missing.push(crossAccount ? 'identity-side' : 'no-allow');
      if (limit.state === 'no-allow') missing.push('boundary');
      if (crossAccount && !resource.allow.length) missing.push('resource-side');
    }
  }
  const decision = denyIn.length ? 'explicit-deny' : missing.length ? 'implicit-deny' : 'allow';
  const blocker = denyIn.length ? 'explicit-deny' : missing.length > 1 ? 'multiple' : missing[0] ?? 'none';
  const stages = buildStages({ root, crossAccount, deny, resourceDeny: resource.deny, scp, identity,
    boundary: limit, resource, directUser, missing });

  if (crossAccount) used.add('cross-account-both');
  else if (identity.deny.length || limit.deny.length || resource.deny.length) used.add('explicit-deny');
  if (resourcePolicy) {
    used.add('resource-policy-s3');
    if (!crossAccount && !denyIn.length) used.add('same-account-union');
  }
  if (directUser && (!identity.allow.length || limit.state === 'no-allow')) used.add('boundary-user-direct');
  else if (boundary) used.add('boundary-ceiling');
  if (!crossAccount && principal.kind === 'role' && resource.direct && boundary) used.add('boundary-role-arn');
  if (levels.length) {
    used.add(root ? 'scp-root-user' : 'scp-ceiling');
    used.add('scp-every-level');
  }
  if (scp.deny.length) used.add('scp-deny');
  if (scp.state === 'exempt') used.add('scp-management');
  return {
    ok: true,
    output: { decision, allowed: decision === 'allow', blocker, denyIn, missing, crossAccount, stages },
    rules: Object.keys(RULES).filter((rule) => used.has(rule)),
  };
}

export function evaluateWith(config, { actionWildcards = ACTION_WILDCARDS } = {}) {
  try {
    checkConfig(config, actionWildcards);
  } catch (error) {
    if (error instanceof InputError) return error.result;
    throw error;
  }
  return evaluate(config, actionWildcards);
}

export function run(config) {
  return evaluateWith(config);
}

export function validateInput(config) {
  return evaluateWith(config);
}

export function buildPresetConfig({
  principal = 'user', action = 's3:GetObject', crossAccount = false, tls = true, membership = 'member',
  scp = 'none', identity = 'read', boundary = 'none', bucketPolicy = 'none',
} = {}) {
  const account = '111122223333';
  const orgId = 'o-exampleorgid';
  const bucket = 'arn:aws:s3:::example-reports';
  const actor = { kind: principal, account, ...(principal === 'root' ? {} : { name: principal === 'role' ? 'analytics-role' : 'hana' }) };
  const allow = (actions, resources = ['*']) => ({ effect: 'Allow', actions, resources });
  const readWrite = ['s3:GetObject', 's3:PutObject'];
  const named = { ...allow(readWrite, [`${bucket}/*`]), principal: { arn: principalArn(actor) } };
  const denyInsecure = {
    effect: 'Deny', actions: ['s3:*'], resources: [`${bucket}/*`], principal: '*', condition: { key: TLS, value: false },
  };
  const policies = {
    none: null,
    'allow-principal': [named],
    'allow-org': [{ ...allow(['s3:GetObject'], [`${bucket}/*`]), principal: '*', condition: { key: ORG_ID, value: orgId } }],
    'deny-insecure': [denyInsecure],
    'allow-principal-deny-insecure': [named, denyInsecure],
  };
  const scps = SCP_LEVELS.map((at) => ({
    at,
    statements: [allow(at === 'ou' && scp === 'ou-read-only' ? ['s3:Get*'] : ['*'])],
  }));
  if (scp === 'deny-delete') scps[2].statements.push({ effect: 'Deny', actions: ['s3:DeleteObject'], resources: ['*'] });
  const identities = {
    none: [], read: [allow(['s3:GetObject'], [`${bucket}/*`])], 'read-write': [allow(readWrite, [`${bucket}/*`])],
    all: [allow(['s3:*'])],
  };
  return {
    op: 'evaluate', principal: actor, org: { membership, ...(membership === 'none' ? {} : { id: orgId }) },
    request: { action, tls }, resource: { arn: `${bucket}/2026/q1.csv`, account: crossAccount && principal !== 'root' ? '444455556666' : account },
    scps: membership === 'none' || scp === 'none' ? null : scps,
    identityPolicy: principal === 'root' ? [] : identities[identity],
    boundary: principal === 'root' || boundary === 'none' ? null : [allow([boundary === 'read' ? 's3:Get*' : 's3:*'])],
    resourcePolicy: principal === 'root' ? null : policies[bucketPolicy],
  };
}

export const PRESET = buildPresetConfig();
