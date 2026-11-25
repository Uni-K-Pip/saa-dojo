import type { OutputKeyKind, Rule } from './cidr.mjs';

export type Principal = { account: string } & (
  { kind: 'user' | 'role'; name: string } | { kind: 'root'; name?: never }
);
export type Organization =
  { membership: 'member' | 'management'; id: string } | { membership: 'none'; id?: never };
export type PolicyPrincipal = '*' | { account: string } | { arn: string };
export type TransportCondition = { key: 'aws:SecureTransport'; value: boolean };
export type Condition = TransportCondition | { key: 'aws:PrincipalOrgID'; value: string };
export type Effect = 'Allow' | 'Deny';
export type Statement = {
  effect: Effect;
  actions: string[];
  resources: string[];
  principal?: never;
  condition?: TransportCondition;
};
export type ResourceStatement = Omit<Statement, 'principal' | 'condition'> & {
  principal: PolicyPrincipal;
  condition?: Condition;
};
export type ScpLevel = 'root' | 'ou' | 'account';
export type Scp = { at: ScpLevel; statements: (Statement & { resources: ['*'] })[] };
export type Config = {
  op: 'evaluate';
  principal: Principal;
  org: Organization;
  request: { action: string; tls: boolean };
  resource: { arn: string; account: string };
  scps: Scp[] | null;
  identityPolicy: Statement[];
  boundary: Statement[] | null;
  resourcePolicy: ResourceStatement[] | null;
};

export type Policy = `scp-${ScpLevel}` | 'identity' | 'boundary' | 'resource-policy';
export type Matched = { policy: Policy; index: number; effect: Effect };
export type Stage = {
  stage: 'deny' | 'scp' | 'resource' | 'identity' | 'boundary';
  side?: 'principal' | 'resource';
  state: 'deny' | 'clear' | 'allow' | 'no-allow' | 'none' | 'exempt';
  impact: 'decides-deny' | 'grants' | 'passes' | 'blocks' | 'bypassed' | 'unused';
  matched: Matched[];
};
export type Missing = 'scp' | 'no-allow' | 'boundary' | 'identity-side' | 'resource-side';
export type Output = {
  decision: 'allow' | 'explicit-deny' | 'implicit-deny';
  allowed: boolean;
  blocker: Missing | 'none' | 'explicit-deny' | 'multiple';
  denyIn: Policy[];
  missing: Missing[];
  crossAccount: boolean;
  stages: Stage[];
};
export type RunError = { code: 'input' | 'format' | 'unsupported' | 'combination'; message: string; field?: string };
export type RunResult = { ok: true; output: Output; rules: string[] } | { ok: false; error: RunError };

export type PresetSwitches = {
  principal?: Principal['kind'];
  action?: 's3:GetObject' | 's3:PutObject' | 's3:DeleteObject';
  crossAccount?: boolean;
  tls?: boolean;
  membership?: Organization['membership'];
  scp?: 'none' | 'full' | 'ou-read-only' | 'deny-delete';
  identity?: 'read' | 'none' | 'read-write' | 'all';
  boundary?: 'none' | 'read' | 'all';
  bucketPolicy?: 'none' | 'allow-principal' | 'allow-org' | 'deny-insecure' | 'allow-principal-deny-insecure';
};

export const DESCRIPTION: string;
export const NOT_COVERED: string[];
export const NOT_COVERED_LINKS: Record<string, { lessonRef: string; label: string }>;
export const RULES: Record<string, Rule>;
export const OUTPUT_KEYS: Record<Config['op'], Record<keyof Output, OutputKeyKind>>;
export const PRESET: Config;
export function buildPresetConfig(switches?: PresetSwitches): Config;
export function evaluateWith(config: unknown, options?: { actionWildcards?: boolean }): RunResult;
export function run(config: Config): RunResult;
export function validateInput(config: unknown): RunResult;
