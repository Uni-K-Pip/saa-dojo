import type { OutputKeyKind, Rule, TierKind } from './cidr.mjs';

export type Ports = 'all' | { from: number; to: number };
export type Route = { dest: string; target: 'igw' | `nat:${string}` | 'vpce-s3' };
export type NaclRule = { rule: number; action: 'allow' | 'deny'; ports: Ports; cidr: string };
export type Nacl = 'default' | { inbound: NaclRule[]; outbound: NaclRule[] };
export type SecurityGroupRule = { ports: Ports; peer: string };
export type SecurityGroup = { inbound: SecurityGroupRule[]; outbound?: SecurityGroupRule[] };
export type Subnet = { id: string; label: string; cidr: string; routeTable: string; nacl: string };
export type Host = { id: string; label: string; subnet: string; ip: string } & (
  { kind: 'instance' | 'alb' | 'rds'; sg: string } | { kind: 'nat-gateway'; sg?: never }
);
export type External = { id: string; label: string } & (
  { kind: 'internet'; ip: string } | { kind: 's3'; ip?: never }
);
export type Flow = { from: string; to: string; port: number; clientPort: number };
export type Config = {
  op: 'trace';
  vpc: { cidr: string; igw: boolean };
  subnets: Subnet[];
  routeTables: Record<string, Route[]>;
  nacls: Record<string, Nacl>;
  securityGroups: Record<string, SecurityGroup>;
  hosts: Host[];
  publicIps: Record<string, string>;
  externals: External[];
  flow: Flow;
};

export type Gate = 'sg-out' | 'nacl-out' | 'route' | 'igw' | 'nat' | 'vpce' | 'nacl-in' | 'sg-in' | 'arrive';
export type Stage = {
  gate: Gate;
  at: string;
  verdict: 'pass' | 'stop';
  basis: 'rule' | 'stateful' | 'default-out' | 'final-deny' | 'no-sg' | 'route';
  rule?: string;
  route?: Route | { dest: string; target: 'local' };
  translate?: { from: string; to: string };
};
export type Reason = 'sg-no-match' | 'nacl-deny' | 'nacl-no-match' | 'no-route' | 'no-igw' | 'no-public-ip' | 'nat-inbound';
export type Output = {
  delivered: boolean;
  stop: 'none' | `${'forward' | 'return'}-${Gate}`;
  stopAt?: string;
  reason?: Reason;
  routeTarget?: 'local' | 'igw' | 'nat' | 'vpce' | 'none';
  seenSource?: string;
  forward: Stage[];
  return: Stage[];
  subnetKinds: { subnet: string; kind: TierKind }[];
};
export type RunError = {
  code: 'input' | 'format' | 'ipv6' | 'vpc-size' | 'subnet-range' | 'host-address' | 'unknown-ref' | 'route' | 'flow';
  message: string;
  field?: string;
};
export type RunResult = { ok: true; output: Output; rules: string[] } | { ok: false; error: RunError };

export type PresetEndpoint = 'alb' | 'nat' | 'app' | 'db' | 'client' | 'update' | 's3';
export type PresetSwitches = {
  from?: Exclude<PresetEndpoint, 'nat' | 's3'>;
  to?: PresetEndpoint;
  port?: 443 | 80 | 22 | 3306;
  igw?: boolean;
  appRoute?: 'none' | 'nat' | 'igw';
  s3Endpoint?: boolean;
  appPublicIp?: boolean;
  natSubnet?: 'pub' | 'app';
  appNacl?: 'default' | 'https' | 'ephemeral';
  appInbound?: 'alb' | 'any' | 'none';
};

export const DESCRIPTION: string;
export const NOT_COVERED: string[];
export const NOT_COVERED_LINKS: Record<string, { lessonRef: string; label: string }>;
export const RULES: Record<string, Rule>;
export const OUTPUT_KEYS: Record<Config['op'], Record<keyof Output, OutputKeyKind>>;
export const PRESET: Config;
export function buildPresetConfig(switches?: PresetSwitches): Config;
export function run(config: Config): RunResult;
export function validateInput(config: unknown): RunResult;
