// @vitest-environment node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIM_CONFIG_SCHEMAS } from '../../../scripts/lib/schema.mjs';
import { checkSimRules, simContext } from '../../../scripts/lib/sim.mjs';
import { SIMULATORS } from '../../../scripts/lib/sims/index.mjs';
import * as iam from '../../../scripts/lib/sims/iam.mjs';

const { PRESET, RULES, buildPresetConfig, evaluateWith, run, validateInput } = iam;
const A = '111122223333';
const B = '444455556666';
const C = '777788889999';
const ORG = 'o-exampleorgid';
const OTHER_ORG = 'o-anotherorgid';
const user = { kind: 'user', name: 'hana', account: A };
const role = { kind: 'role', name: 'analytics-role', account: A };
const root = { kind: 'root', account: A };
const namedUser = { arn: `arn:aws:iam::${A}:user/hana` };
const namedRole = { arn: `arn:aws:iam::${A}:role/analytics-role` };
const rootOf = (account) => ({ arn: `arn:aws:iam::${account}:root` });
const bucket = 'arn:aws:s3:::example-reports';
const object = `${bucket}/2026/q1.csv`;
const allObjects = `${bucket}/*`;
const otherBucket = 'arn:aws:s3:::other-reports';
const GET = 's3:GetObject';
const PUT = 's3:PutObject';
const DELETE = 's3:DeleteObject';
const tls = (value) => ({ key: 'aws:SecureTransport', value });
const org = (value = ORG) => ({ key: 'aws:PrincipalOrgID', value });
const statement = (effect, action = '*', arn = '*', extra) => ({
  effect, actions: Array.isArray(action) ? action : [action], resources: [arn], ...extra,
});
const allow = (action, arn, extra) => statement('Allow', action, arn, extra);
const deny = (action, arn, extra) => statement('Deny', action, arn, extra);
const level = (at, ...statements) => ({ at, statements });
const fullScps = () => [level('root', allow()), level('ou', allow()), level('account', allow())];
const config = (changes) => ({
  op: 'evaluate', principal: user, org: { membership: 'member', id: ORG },
  request: { action: GET, tls: true }, resource: { arn: object, account: A },
  scps: null, identityPolicy: [], boundary: null, resourcePolicy: null, ...changes,
});
const use = (action, arn = object, account = A) => ({ request: { action, tls: true }, resource: { arn, account } });
const explicit = (denyIn) => ({ decision: 'explicit-deny', blocker: 'explicit-deny', denyIn, missing: [] });
const implicit = (...missing) => ({
  decision: 'implicit-deny', blocker: missing.length === 1 ? missing[0] : 'multiple', missing, denyIn: [],
});
const permitted = { decision: 'allow', blocker: 'none', missing: [], denyIn: [] };
const seen = (policy, index, effect = 'Allow') => ({ policy, index, effect });
const stage = (stage, state, impact, matched = [], side) => ({ stage, ...(side && { side }), state, impact, matched });
const ruleIds = [
  'default-deny', 'root-full-access', 'explicit-deny', 'same-account-union', 'identity-policy',
  'boundary-ceiling', 'boundary-user-direct', 'boundary-role-arn', 'scp-ceiling', 'scp-every-level',
  'scp-deny', 'scp-root-user', 'scp-management', 'cross-account-both', 'principal-any', 'principal-account',
  'principal-org', 'cond-org-id', 'cond-secure-transport', 'resource-policy-s3', 'wildcard',
];

function check(value, outcome) {
  const result = run(value);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  expect(result.output).toMatchObject({ ...outcome, allowed: outcome.decision === 'allow' });
  expect(result.rules).toEqual(ruleIds.filter((id) => result.rules.includes(id)));
  return result;
}

describe('シナリオの最初の設定と切り替え', () => {
  it('sim-iam-implicit-deny', () => {
    const initial = config({ ...use(PUT), identityPolicy: [allow(GET, allObjects)] });
    check(initial, implicit('no-allow'));
    check({ ...initial, request: { action: GET, tls: true } }, permitted);
    check({ ...initial, resource: { arn: `${otherBucket}/2026/q1.csv`, account: A } }, implicit('no-allow'));
    check({ ...initial, resourcePolicy: [allow(PUT, allObjects, { principal: namedUser })] }, permitted);
  });

  it('sim-iam-explicit-deny', () => {
    const initial = config({
      request: { action: GET, tls: false }, identityPolicy: [allow([GET, PUT], allObjects)],
      resourcePolicy: [deny('s3:*', allObjects, { principal: '*', condition: tls(false) })],
    });
    expect(check(initial, explicit(['resource-policy'])).rules).toContain('principal-any');
    expect(check({ ...initial, request: { action: GET, tls: true } }, permitted).rules).toContain('principal-any');
    expect(check({ ...initial, identityPolicy: [allow()] }, explicit(['resource-policy'])).rules).toContain('principal-any');
    expect(check({ ...initial, resourcePolicy: null }, permitted).rules).not.toContain('principal-any');
  });

  it('sim-iam-boundary-ceiling', () => {
    const table = `arn:aws:dynamodb:ap-northeast-1:${A}:table/reports`;
    const instance = `arn:aws:ec2:ap-northeast-1:${A}:instance/i-123456789`;
    const initial = config({
      ...use('dynamodb:DeleteTable', table),
      identityPolicy: [allow(['s3:*', 'dynamodb:*'])], boundary: [allow(['s3:*', 'ec2:*'])],
    });
    check(initial, implicit('boundary'));
    check({ ...initial, ...use(GET) }, permitted);
    check({ ...initial, ...use('ec2:StartInstances', instance) }, implicit('no-allow'));
    check({ ...initial, boundary: null }, permitted);
  });

  it('sim-iam-scp-ceiling', () => {
    const initial = config({
      ...use('dynamodb:CreateTable', `arn:aws:dynamodb:ap-northeast-1:${A}:table/reports`),
      principal: { ...user, name: 'admin' }, identityPolicy: [allow()],
      scps: [level('root', allow()), level('ou', allow(['s3:*', 'ec2:*'])), level('account', allow())],
    });
    check(initial, implicit('scp'));
    check({ ...initial, ...use(GET) }, permitted);
    check({ ...initial, scps: fullScps() }, permitted);
    check({
      ...initial, scps: [level('root', allow(), deny('dynamodb:CreateTable')), ...initial.scps.slice(1)],
    }, explicit(['scp-root']));
    check({ ...initial, org: { membership: 'management', id: ORG } }, permitted);
  });

  it('sim-iam-scp-root-user', () => {
    const trail = `arn:aws:cloudtrail:ap-northeast-1:${A}:trail/audit`;
    const initial = config({
      ...use('cloudtrail:StopLogging', trail), principal: root,
      scps: [level('root', allow()), level('ou', allow(), deny('cloudtrail:StopLogging')), level('account', allow())],
    });
    check(initial, explicit(['scp-ou']));
    check({ ...initial, request: { action: 'cloudtrail:StartLogging', tls: true } }, permitted);
    check({ ...initial, principal: user }, explicit(['scp-ou']));
    check({ ...initial, org: { membership: 'management', id: ORG } }, permitted);
  });

  it('sim-iam-cross-account-bucket', () => {
    const initial = config({ ...use(GET, object, B), principal: role, identityPolicy: [allow(GET, allObjects)] });
    check(initial, implicit('resource-side'));
    check({ ...initial, resourcePolicy: [allow(GET, allObjects, { principal: namedRole })] }, permitted);
    check({ ...initial, resourcePolicy: [allow(GET, allObjects, { principal: '*', condition: org() })] }, permitted);
    check({ ...initial, resource: { arn: object, account: A } }, permitted);
  });

  it('sim-iam-cross-account-identity', () => {
    const initial = config({
      ...use(GET, object, B), identityPolicy: [allow(GET, `${otherBucket}/*`)],
      resourcePolicy: [allow(GET, allObjects, { principal: namedUser })],
    });
    check(initial, implicit('identity-side'));
    check({ ...initial, identityPolicy: [...initial.identityPolicy, allow(GET, allObjects)] }, permitted);
    check({ ...initial, resource: { arn: object, account: A } }, permitted);
    check({ ...initial, resourcePolicy: [allow(GET, allObjects, { principal: rootOf(A) })] }, implicit('identity-side'));
  });
});

describe('Action、Resource、Principal、Condition の照合', () => {
  it.each([
    ['*', GET, true], ['s3:*', GET, true], ['s3:Get*', GET, true], ['s3:Get*Object', GET, true],
    ['s3:G**Object', GET, true], ['s3:Get*Object', 's3:GetObjectTagging', false],
    ['s3:Get*', PUT, false], ['s3:ListBucket', GET, false], ['s3:Getobject', GET, false], ['ec2:*', GET, false],
  ])('Action %s と %s を照合する', (pattern, action, matched) => {
    check(config({ ...use(action), identityPolicy: [allow(pattern)] }), matched ? permitted : implicit('no-allow'));
  });

  it.each([
    ['*', object, true], [allObjects, object, true], [bucket, object, false], [bucket, bucket, true],
    [allObjects, bucket, false], [allObjects, `${bucket}/`, true],
    [`${bucket}/2026*q1.csv`, `${bucket}/2026/part:01/q1.csv`, true],
    [`${bucket}/2026*q1.csv`, `${bucket}/2026q1.csv`, true],
    [`${bucket}/2026*2026`, `${bucket}/2026`, false], [allObjects, `${otherBucket}/q1.csv`, false],
    [`${bucket}/q1.csv`, `${bucket}/q1Xcsv`, false], [`${bucket}/a+b[q].csv`, `${bucket}/a+b[q].csv`, true],
  ])('Resource %s と %s を照合する', (pattern, arn, matched) => {
    check(config({ ...use(GET, arn), identityPolicy: [allow(GET, pattern)] }), matched ? permitted : implicit('no-allow'));
  });

  it.each([
    [namedUser, true], [namedRole, false], [{ arn: `arn:aws:iam::${B}:user/hana` }, false],
    [rootOf(A), true], [rootOf(B), false],
  ])('別のアカウントへの許可で Principal %j を照合する', (principal, matched) => {
    const { rules } = check(config({
      ...use(GET, object, B), identityPolicy: [allow(GET)], resourcePolicy: [allow(GET, object, { principal })],
    }), matched ? permitted : implicit('resource-side'));
    expect(rules.includes('principal-account')).toBe(principal.arn === rootOf(A).arn);
  });

  it.each([
    ['member', ORG, true], ['management', ORG, true], ['member', OTHER_ORG, false], ['none', undefined, false],
  ])('Principal が * の許可で、所属 %s と組織 ID %s を照合する', (membership, id, matched) => {
    const value = config({
      ...use(GET, object, B), identityPolicy: [allow(GET)], org: { membership, ...(id && { id }) },
      resourcePolicy: [allow(GET, object, { principal: '*', condition: org() })],
    });
    expect(check(value, matched ? permitted : implicit('resource-side')).rules)
      .toEqual(['default-deny', 'identity-policy', 'cross-account-both', 'principal-any', 'principal-org',
        'cond-org-id', 'resource-policy-s3', 'wildcard']);
    value.resourcePolicy[0].actions = [PUT];
    const { rules } = check(value, implicit('resource-side'));
    expect(rules).not.toContain('principal-any');
    expect(rules).not.toContain('principal-org');
  });

  it('Action と Resource が合う Deny では、条件で外れても Principal の * を使った規則に入れる', () => {
    const value = config({ resourcePolicy: [deny(GET, object, { principal: '*', condition: tls(false) })] });
    expect(check(value, implicit('no-allow')).rules).toContain('principal-any');
  });

  it('Resource が合わない文では Principal の * を使った規則に入れない', () => {
    const value = config({ resourcePolicy: [deny(GET, `${otherBucket}/*`, { principal: '*' })] });
    expect(check(value, implicit('no-allow')).rules).not.toContain('principal-any');
  });

  it('条件を見た規則は、TLS の前に Principal、組織 ID の前に Action と Resource が合うことを確かめる', () => {
    const value = config({ identityPolicy: [allow(GET, object, { condition: tls(true) })] });
    expect(check(value, permitted).rules).toContain('cond-secure-transport');
    value.request.tls = false;
    expect(check(value, implicit('no-allow')).rules).toContain('cond-secure-transport');
    value.resourcePolicy = [deny(GET, object, { principal: namedRole, condition: tls(false) })];
    value.identityPolicy = [allow(GET, object)];
    expect(check(value, permitted).rules).not.toContain('cond-secure-transport');
    value.resourcePolicy[0].condition = org();
    expect(check(value, permitted).rules).toContain('cond-org-id');
    value.resourcePolicy[0].resources = [bucket];
    expect(check(value, permitted).rules).not.toContain('cond-org-id');
  });

  it('同じアカウントでも、ルートユーザーの ARN を指定した Deny はアカウント全体に当たる', () => {
    const value = config({ identityPolicy: [allow(GET)], resourcePolicy: [deny(GET, object, { principal: rootOf(A) })] });
    const result = check(value, explicit(['resource-policy']));
    expect(result.rules).toContain('principal-account');
    expect(result.output.stages.find(({ stage }) => stage === 'resource').state).toBe('no-allow');
  });

  it('アクションのワイルドカードを無効にしても Resource の * は使える', () => {
    const off = { actionWildcards: false };
    const value = config({ identityPolicy: [allow(GET, allObjects)] });
    expect(evaluateWith(value, off)).toEqual(run(value));
    value.identityPolicy[0].actions = ['s3:Getobject'];
    expect(evaluateWith(value, off)).toMatchObject({ ok: true, output: implicit('no-allow') });
    for (const pattern of ['*', 's3:*', 's3:Get*']) {
      value.identityPolicy[0].actions = [pattern];
      check(value, permitted);
      expect(evaluateWith(value, off)).toMatchObject({ ok: false, error: { code: 'unsupported', field: 'identityPolicy.0.actions' } });
    }
  });
});

describe('評価の段と使われる規則', () => {
  it('同じアカウントの IAM ユーザーは名指しの許可で境界とアイデンティティベースの暗黙の拒否を回避する', () => {
    const value = config({
      scps: [level('root', allow()), level('account', allow(GET, '*', { condition: tls(true) }))],
      resourcePolicy: [allow(GET, object, { principal: namedUser })], boundary: [allow(PUT, object)],
    });
    const { output, rules } = check(value, permitted);
    expect(output.stages).toEqual([
      stage('deny', 'clear', 'unused'),
      stage('scp', 'allow', 'passes', [seen('scp-root', 0), seen('scp-account', 0)]),
      stage('resource', 'allow', 'grants', [seen('resource-policy', 0)]),
      stage('identity', 'none', 'bypassed'),
      stage('boundary', 'no-allow', 'bypassed'),
    ]);
    expect(rules).toEqual(['default-deny', 'same-account-union', 'identity-policy', 'boundary-user-direct',
      'scp-ceiling', 'scp-every-level', 'cond-secure-transport', 'resource-policy-s3', 'wildcard']);
    value.identityPolicy = [allow(GET, object)];
    value.boundary = null;
    const withoutBoundary = check(value, permitted);
    expect(withoutBoundary.rules).not.toContain('boundary-user-direct');
    expect(withoutBoundary.output.stages.slice(-2)).toEqual([
      stage('identity', 'allow', 'grants', [seen('identity', 0)]), stage('boundary', 'none', 'unused'),
    ]);
  });

  it('同じアカウントの IAM ロールの名指しの許可には境界が効く', () => {
    const value = config({
      principal: role, resourcePolicy: [allow(GET, object, { principal: namedRole })], boundary: [allow(PUT, object)],
    });
    const { output, rules } = check(value, implicit('boundary'));
    expect(output.stages).toEqual([
      stage('deny', 'clear', 'unused'), stage('scp', 'none', 'unused'),
      stage('resource', 'allow', 'grants', [seen('resource-policy', 0)]),
      stage('identity', 'none', 'unused'), stage('boundary', 'no-allow', 'blocks'),
    ]);
    expect(rules).toEqual(['default-deny', 'same-account-union', 'identity-policy',
      'boundary-ceiling', 'boundary-role-arn', 'resource-policy-s3']);
    value.boundary.push(allow(GET, object));
    expect(check(value, permitted).output.stages.at(-1)).toEqual(stage('boundary', 'allow', 'passes', [seen('boundary', 1)]));
  });

  it('別のアカウントでは要る許可を全件と順に出す', () => {
    const value = config({
      ...use(GET, object, B), boundary: [allow(PUT, object)],
      scps: [level('root', allow()), level('ou', allow(PUT)), level('account', allow())],
    });
    const { output } = check(value, implicit('scp', 'identity-side', 'boundary', 'resource-side'));
    expect(output.crossAccount).toBe(true);
    expect(output.stages).toEqual([
      stage('deny', 'clear', 'unused', [], 'principal'),
      stage('scp', 'no-allow', 'blocks', [seen('scp-root', 0), seen('scp-account', 0)], 'principal'),
      stage('identity', 'none', 'blocks', [], 'principal'), stage('boundary', 'no-allow', 'blocks', [], 'principal'),
      stage('deny', 'clear', 'unused', [], 'resource'), stage('resource', 'none', 'blocks', [], 'resource'),
    ]);
    expect(check({ ...value, resource: { arn: object, account: A } }, implicit('scp', 'no-allow', 'boundary'))
      .output.stages.slice(-2)).toEqual([stage('identity', 'none', 'blocks'), stage('boundary', 'no-allow', 'blocks')]);
  });

  it('明示的な拒否は全ポリシーの当たった文を両側の deny に集める', () => {
    const value = config({
      ...use(GET, object, B), scps: ['root', 'ou', 'account'].map((at) => level(at, allow(), deny(GET))),
      identityPolicy: [allow(GET, object), deny(PUT, object), deny(GET, object), deny(GET, object)],
      boundary: [allow(GET, object), deny(GET, object)],
      resourcePolicy: [allow(GET, object, { principal: namedUser }), deny(GET, object, { principal: '*' })],
    });
    const denyIn = ['scp-root', 'scp-ou', 'scp-account', 'identity', 'boundary', 'resource-policy'];
    const { output, rules } = check(value, explicit(denyIn));
    expect(output.stages).toEqual([
      stage('deny', 'deny', 'decides-deny', [
        ...denyIn.slice(0, 3).map((policy) => seen(policy, 1, 'Deny')),
        seen('identity', 2, 'Deny'), seen('identity', 3, 'Deny'), seen('boundary', 1, 'Deny'),
      ], 'principal'),
      stage('scp', 'allow', 'unused', denyIn.slice(0, 3).map((policy) => seen(policy, 0)), 'principal'),
      stage('identity', 'allow', 'unused', [seen('identity', 0)], 'principal'),
      stage('boundary', 'allow', 'unused', [seen('boundary', 0)], 'principal'),
      stage('deny', 'deny', 'decides-deny', [seen('resource-policy', 1, 'Deny')], 'resource'),
      stage('resource', 'allow', 'unused', [seen('resource-policy', 0)], 'resource'),
    ]);
    expect(rules).toContain('cross-account-both');
    expect(rules).toContain('scp-deny');
    expect(rules).not.toContain('explicit-deny');
    value.resource.account = A;
    const same = check(value, explicit(denyIn));
    expect(same.output.stages[0].matched).toEqual([...output.stages[0].matched, ...output.stages[4].matched]);
    expect(same.rules).toContain('explicit-deny');
    expect(same.rules).not.toContain('same-account-union');
  });

  it('ルートユーザーには deny と scp だけを出し、管理アカウントの SCP を評価しない', () => {
    const value = config({ principal: root, scps: [level('root', deny(GET)), level('account', allow(PUT))] });
    const member = check(value, explicit(['scp-root']));
    expect(member.output.stages).toEqual([
      stage('deny', 'deny', 'decides-deny', [seen('scp-root', 0, 'Deny')]), stage('scp', 'no-allow', 'unused'),
    ]);
    expect(member.rules).toEqual(['root-full-access', 'scp-every-level', 'scp-deny', 'scp-root-user', 'wildcard']);
    value.org = { membership: 'management', id: ORG };
    const management = check(value, permitted);
    expect(management.output.stages).toEqual([stage('deny', 'clear', 'unused'), stage('scp', 'exempt', 'unused')]);
    expect(management.rules).toEqual(['root-full-access', 'scp-management']);
    value.scps = null;
    expect(check(value, permitted).output.stages[1]).toEqual(stage('scp', 'none', 'unused'));
  });
});

describe('入力と登録', () => {
  it.each([
    ['設定の型', null, 'input'], ['設定の未知の鍵', config({ extra: true }), 'input'],
    ['SCP の項目なし', (({ scps, ...value }) => value)(config({ org: { membership: 'none' } })), 'input'],
    ['ユーザーの名前なし', config({ principal: { kind: 'user', account: A } }), 'input'],
    ['名前の長さ', config({ principal: { ...user, name: 'a'.repeat(33) } }), 'input'],
    ['名前の文字', config({ principal: { ...user, name: 'Hana' } }), 'input'],
    ['ルートユーザーの名前', config({ principal: { ...root, name: 'hana' } }), 'input'],
    ['アカウントの桁数', config({ principal: { ...user, account: '123' } }), 'input'],
    ['所属なしの組織 ID', config({ org: { membership: 'none', id: ORG } }), 'input'],
    ['組織 ID なし', config({ org: { membership: 'management' } }), 'input'],
    ['組織 ID の形式', config({ org: { membership: 'member', id: 'o-short' } }), 'input'],
    ['TLS の型', config({ request: { action: GET, tls: 'true' } }), 'input'],
    ['文が多い', config({ identityPolicy: Array.from({ length: 5 }, () => allow()) }), 'input'],
    ['文が空の境界', config({ boundary: [] }), 'input'], ['文が空のリソース側', config({ resourcePolicy: [] }), 'input'],
    ['文の未知の鍵', config({ identityPolicy: [allow(GET, object, { extra: true })] }), 'input'],
    ['Effect の値', config({ identityPolicy: [statement('allow')] }), 'input'],
    ['Action の件数', config({ identityPolicy: [allow([])] }), 'input'],
    ['Resource の件数', config({ identityPolicy: [{ ...allow(), resources: Array(5).fill('*') }] }), 'input'],
    ['Condition の形', config({ identityPolicy: [allow(GET, object, { condition: { ...tls(true), extra: 1 } })] }), 'input'],
    ['Condition の値', config({ identityPolicy: [allow(GET, object, { condition: tls('false') })] }), 'input'],
    ['Principal なし', config({ resourcePolicy: [allow()] }), 'input'],
    ['Principal の未知の鍵', config({ resourcePolicy: [allow(GET, object, { principal: { account: A, arn: namedUser.arn } })] }), 'input'],
    ['SCP の階層不足', config({ scps: [level('root', allow())] }), 'input'],
    ['SCP の階層の順', config({ scps: [level('root', allow()), level('account', allow()), level('ou', allow())] }), 'input'],
    ['SCP の階層の重複', config({ scps: [level('root', allow()), level('root', allow()), level('account', allow())] }), 'input'],
    ['SCP の文なし', config({ scps: [level('root', allow()), level('account')] }), 'input'],
    ['リクエストの Action の形式', config(use('s3:getObject')), 'format'],
    ['リクエストの Action の *', config(use('s3:Get*')), 'format'],
    ['文の Action の形式', config({ identityPolicy: [allow('S3:GetObject')] }), 'format'],
    ['リソースの ARN の形式', config(use(GET, 'arn:aws:s3:::')), 'format'],
    ['リソースの ARN の *', config(use(GET, allObjects)), 'format'],
    ['文の ARN のリージョンの *', config({ identityPolicy: [allow(GET, 'arn:aws:s3:*::example-reports/*')] }), 'format'],
    ['文の ARN のアカウントの *', config({ identityPolicy: [allow(GET, 'arn:aws:s3::*:example-reports/*')] }), 'format'],
    ['Principal の ARN の形式', config({ resourcePolicy: [deny(GET, object, { principal: { arn: 'arn:aws:iam::123:role/a' } })] }), 'format'],
    ['STS', config(use('sts:AssumeRole')), 'unsupported'], ['KMS', config(use('kms:Encrypt')), 'unsupported'],
    ['Action の ?', config({ identityPolicy: [allow('s3:Get?bject')] }), 'unsupported'],
    ['Resource の ?', config({ identityPolicy: [allow(GET, `${bucket}/?.csv`)] }), 'unsupported'],
    ['ポリシー変数', config({ identityPolicy: [allow(GET, 'arn:aws:s3:::example-reports/${aws:username}')] }), 'unsupported'],
    ['条件のポリシー変数', config({ resourcePolicy: [deny(GET, object, { principal: '*', condition: org('${aws:PrincipalOrgID}') })] }), 'unsupported'],
    ...['NotAction', 'NotResource', 'NotPrincipal'].map((key) => [
      key, config({ identityPolicy: [allow(GET, object, { [key]: '*' })] }), 'unsupported',
    ]),
    ['未知の条件', config({ identityPolicy: [allow(GET, object, { condition: { key: 'aws:CurrentTime', value: true } })] }), 'unsupported'],
    ['第三者の ARN', config({ resourcePolicy: [deny(GET, object, { principal: { arn: `arn:aws:iam::${C}:user/hana` } })] }), 'unsupported'],
    ['公開の許可', config({ ...use(GET, object, B), resourcePolicy: [allow(GET, object, { principal: '*' })] }), 'unsupported'],
    ['TLS だけを条件とする公開の許可', config({ ...use(GET, object, B),
      resourcePolicy: [allow(GET, object, { principal: '*', condition: tls(true) })] }), 'unsupported'],
    ['同じアカウント全体への許可', config({ resourcePolicy: [allow(GET, object, { principal: rootOf(A) })] }), 'unsupported'],
    ['アカウント ID だけの Principal', config({ ...use(GET, object, B), resourcePolicy: [allow(GET, object, { principal: { account: A } })] }), 'input'],
    ['無関係なアカウントのルートユーザーの ARN', config({ ...use(GET, object, B),
      resourcePolicy: [allow(GET, object, { principal: rootOf(C) })] }), 'unsupported'],
    ['同じアカウントで Principal が * の許可', config({ resourcePolicy: [allow(GET, object, { principal: '*', condition: org() })] }), 'unsupported'],
    ['サービスの相違', config(use('ec2:StartInstances')), 'combination'],
    ['リソースのアカウントの相違', config(use(GET, `arn:aws:s3:ap-northeast-1:${B}:example-reports`)), 'combination'],
    ['ルートユーザーの別アカウントへの要求', config({ ...use(GET, object, B), principal: root }), 'combination'],
    ['ルートユーザーのアイデンティティベース', config({ principal: root, identityPolicy: [allow()] }), 'combination'],
    ['ルートユーザーの境界', config({ principal: root, boundary: [allow()] }), 'combination'],
    ['ルートユーザーのリソース側ポリシー', config({ principal: root, resourcePolicy: [deny(GET, object, { principal: '*' })] }), 'combination'],
    ['組織に属さないアカウントの SCP', config({ org: { membership: 'none' }, scps: fullScps() }), 'combination'],
    ['SCP の Resource', config({ scps: [level('root', allow(GET, object)), level('account', allow())] }), 'combination'],
    ['SCP の Resource が複数', config({ scps: [level('root', { ...allow(), resources: ['*', '*'] }), level('account', allow())] }), 'combination'],
    ['SCP の Principal', config({ scps: [level('root', allow(GET, '*', { principal: '*' })), level('account', allow())] }), 'combination'],
    ['SCP の組織 ID 条件', config({ scps: [level('root', allow(GET, '*', { condition: org() })), level('account', allow())] }), 'combination'],
    ['境界の組織 ID 条件', config({ boundary: [allow(GET, object, { condition: org() })] }), 'combination'],
    ['アイデンティティ側の Principal', config({ identityPolicy: [allow(GET, object, { principal: namedUser })] }), 'combination'],
    ['S3 以外のリソース側ポリシー', config({ ...use('ec2:StartInstances', 'arn:aws:ec2:::instance/i-123'),
      resourcePolicy: [deny(GET, '*', { principal: '*' })] }), 'combination'],
  ])('%s を拒否する', (_, value, code) => {
    const result = validateInput(value);
    expect(result).toMatchObject({ ok: false, error: { code, message: expect.stringMatching(/。$/) } });
    expect(run(value)).toEqual(result);
  });

  it('登録したスキーマがポリシーとネストした設定の形を検査する', () => {
    expect(SIMULATORS.find(({ id }) => id === 'iam')).toEqual({
      id: 'iam', name: 'IAM のポリシーの評価', description: iam.DESCRIPTION, engine: iam,
    });
    const schema = SIM_CONFIG_SCHEMAS.iam;
    expect(schema.parse(PRESET)).toEqual(buildPresetConfig());
    const value = buildPresetConfig({ crossAccount: true, scp: 'full', boundary: 'all', bucketPolicy: 'allow-org' });
    expect(schema.parse(value)).toEqual(value);
    expect(validateInput(value)).toEqual(run(value));
    expect(schema.safeParse({ ...value, request: { ...value.request, extra: true } }).success).toBe(false);
    expect(schema.safeParse({ ...value, scps: value.scps.toReversed() }).success).toBe(false);
    expect(schema.safeParse({ ...value, resourcePolicy: [allow()] }).success).toBe(false);
    expect(schema.safeParse({ ...value, boundary: [{ ...allow(), resources: [] }] }).success).toBe(false);
    expect(Object.keys(run(value).output)).toEqual(Object.keys(iam.OUTPUT_KEYS.evaluate));
  });

  it('シナリオの登録前でも、図鑑の本文と規則とレッスンのリンクを共通の検査に通す', () => {
    expect(Object.keys(RULES)).toEqual(ruleIds);
    const path = (rel) => new URL(`../../../content/saa-c03/${rel}`, import.meta.url);
    const read = (rel) => JSON.parse(readFileSync(path(rel), 'utf8'));
    const lessonIds = ['lesson-1.1-multi-account', 'lesson-1.1-roles-federation',
      'lesson-1.3-encryption-and-keys', 'lesson-1.1-iam-basics'];
    const lessons = lessonIds.filter((id) => existsSync(path(`lessons/d1/${id}.md`))).map((id) => ({ data: { id } }));
    const catalogEntries = ['iam', 'organizations', 's3'].map((id) => ({ data: read(`catalog/services/${id}.json`) }));
    const ctx = simContext({ lessons, catalogEntries, catalogStatus: read('catalog-status.json') });
    expect(checkSimRules(iam, ctx)).toEqual([]);
  });
});

const allSwitches = {
  principal: ['user', 'role', 'root'],
  action: [GET, PUT, DELETE],
  crossAccount: [false, true],
  tls: [true, false],
  membership: ['member', 'none', 'management'],
  scp: ['none', 'full', 'ou-read-only', 'deny-delete'],
  identity: ['read', 'none', 'read-write', 'all'],
  boundary: ['none', 'read', 'all'],
  bucketPolicy: ['none', 'allow-principal', 'allow-org', 'deny-insecure', 'allow-principal-deny-insecure'],
};
const combinations = Object.entries(allSwitches).reduce((rows, [key, values]) =>
  rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value }))), [{}]);

function reference(switches) {
  const { action, membership, scp, principal, identity, boundary, bucketPolicy, tls: secure } = switches;
  const isRoot = principal === 'root';
  const crossAccount = !isRoot && switches.crossAccount;
  const read = action === GET;
  const write = action === PUT;
  const memberScp = membership === 'member' && scp !== 'none';
  const denyIn = [];
  if (memberScp && scp === 'deny-delete' && action === DELETE) denyIn.push('scp-account');
  if (!isRoot && !secure && ['deny-insecure', 'allow-principal-deny-insecure'].includes(bucketPolicy)) denyIn.push('resource-policy');
  const scpAllowed = !memberScp || scp !== 'ou-read-only' || read;
  const identityAllowed = identity === 'all' || (identity === 'read' && read) || (identity === 'read-write' && (read || write));
  const boundaryAllowed = boundary !== 'read' || read;
  const namedAllowed = ['allow-principal', 'allow-principal-deny-insecure'].includes(bucketPolicy) && (read || write);
  const resourceAllowed = namedAllowed || (bucketPolicy === 'allow-org' && membership !== 'none' && read);
  const principalAny = !isRoot && (['deny-insecure', 'allow-principal-deny-insecure'].includes(bucketPolicy)
    || (bucketPolicy === 'allow-org' && read));
  const requirements = [['scp', scpAllowed]];
  if (crossAccount) {
    requirements.push(['identity-side', identityAllowed], ['boundary', boundaryAllowed], ['resource-side', resourceAllowed]);
  } else if (principal === 'role') {
    requirements.push(['no-allow', identityAllowed || namedAllowed], ['boundary', boundaryAllowed]);
  } else if (principal === 'user' && !namedAllowed) {
    requirements.push(['no-allow', identityAllowed], ['boundary', boundaryAllowed]);
  }
  const missing = denyIn.length ? [] : requirements.filter(([, satisfied]) => !satisfied).map(([key]) => key);
  const decision = denyIn.length ? 'explicit-deny' : missing.length ? 'implicit-deny' : 'allow';
  const blocker = denyIn.length ? 'explicit-deny' : missing.length > 1 ? 'multiple' : missing[0] ?? 'none';
  return { decision, allowed: decision === 'allow', blocker, denyIn, missing, crossAccount, principalAny };
}

it('自由に試すの 25,920 通りを 5.3 の条件の一覧と突き合わせ、全規則が出ることを確かめる', () => {
  assert.equal(combinations.length, 25920);
  const used = new Set();
  for (const switches of combinations) {
    const result = validateInput(buildPresetConfig(switches));
    const label = JSON.stringify(switches);
    if (!result.ok) {
      assert.ok(['unsupported', 'combination'].includes(result.error.code), label);
      continue;
    }
    const { stages, ...summary } = result.output;
    const { principalAny, ...expected } = reference(switches);
    assert.deepEqual(summary, expected, label);
    assert.equal(result.rules.includes('principal-any'), principalAny, label);
    assert.equal(stages.length, switches.principal === 'root' ? 2 : summary.crossAccount ? 6 : 5, label);
    assert.deepEqual(result.rules, ruleIds.filter((id) => result.rules.includes(id)), label);
    for (const id of result.rules) used.add(id);
  }
  // プリセットにはアカウント全体を指定する Principal がない
  const accountGrant = check(config({
    ...use(GET, object, B), identityPolicy: [allow(GET)], resourcePolicy: [allow(GET, object, { principal: rootOf(A) })],
  }), permitted);
  for (const id of accountGrant.rules) used.add(id);
  expect([...used].sort()).toEqual([...ruleIds].sort());
});

describe('評価の性質', () => {
  const samples = [
    config(), config({ identityPolicy: [allow(GET)] }), config({ ...use(GET, object, B), identityPolicy: [allow(GET)] }),
    config({ boundary: [allow(GET)], resourcePolicy: [allow(GET, object, { principal: namedUser })] }),
  ];
  it('当てはまる Deny をどのポリシーに足しても明示的な拒否になる', () => {
    for (const value of samples) {
      check({ ...value, identityPolicy: [...value.identityPolicy, deny(GET)] }, explicit(['identity']));
      check({ ...value, boundary: [...(value.boundary ?? []), deny(GET)] }, explicit(['boundary']));
      check({ ...value, resourcePolicy: [...(value.resourcePolicy ?? []), deny(GET, '*', { principal: '*' })] }, explicit(['resource-policy']));
      check({ ...value, scps: [level('root', allow()), level('account', allow(), deny(GET))] }, explicit(['scp-account']));
    }
  });

  it('上限を足しても拒否から許可には変わらず、上限だけでは許可されない', () => {
    const upperBounds = [{ scps: fullScps() }, { boundary: [allow()] }, { scps: fullScps(), boundary: [allow(PUT)] }];
    for (const value of [samples[0], samples[2], config({ identityPolicy: [deny(GET)] })]) {
      expect(run(value).output.allowed).toBe(false);
      for (const bound of upperBounds) expect(run({ ...value, ...bound }).output.allowed).toBe(false);
    }
    for (const value of [samples[1], samples[3]]) {
      const limits = { scps: fullScps(), boundary: [allow()] };
      check({ ...value, ...limits }, permitted);
      check({ ...value, ...limits, identityPolicy: [], resourcePolicy: null }, implicit('no-allow'));
    }
  });

  it('管理アカウントでは SCP によって判定や拒否の理由が変わらない', () => {
    const decisionFields = ({ decision, blocker, denyIn, missing }) => ({ decision, blocker, denyIn, missing });
    for (const sample of [...samples, config({ principal: root })]) {
      const value = { ...sample, org: { membership: 'management', id: ORG } };
      const changed = { ...value, scps: [level('root', deny(GET)), level('account', allow(PUT))] };
      expect(decisionFields(run(changed).output)).toEqual(decisionFields(run(value).output));
    }
  });

  it('blocker と missing、denyIn の関係は許可と拒否の全組み合わせで整合する', () => {
    for (const switches of combinations) {
      const result = run(buildPresetConfig(switches));
      if (!result.ok) continue;
      const { allowed, decision, blocker, missing, denyIn } = result.output;
      const label = JSON.stringify(switches);
      assert.equal(allowed, decision === 'allow', label);
      assert.equal(denyIn.length > 0, decision === 'explicit-deny', label);
      assert.equal(missing.length > 0, decision === 'implicit-deny', label);
      assert.equal(blocker, denyIn.length ? 'explicit-deny' : missing.length > 1 ? 'multiple' : missing[0] ?? 'none', label);
    }
  });
});
