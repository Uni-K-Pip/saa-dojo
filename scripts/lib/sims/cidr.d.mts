export type TierKind = 'public' | 'private' | 'isolated';
export type Tier = { name: string; kind: TierKind };
export type SizeConfig = { op: 'size'; cidr: string; role: 'subnet' | 'vpc'; purpose?: 'alb'; inUse?: number };
export type OverlapConfig = { op: 'overlap'; a: string; b: string; context: 'peering' | 'subnets' };
export type SplitConfig = { op: 'split'; vpc: string; azs: number; tiers: Tier[]; prefix: number };
export type Config = SizeConfig | OverlapConfig | SplitConfig;
export type SizeOutput = {
  network: string; first: string; last: string; total: number; allowed: boolean;
  sizeIssue: 'none' | 'too-large' | 'too-small';
  reserved?: { address: string; use: string }[]; usable?: number; free?: number; albIssue?: 'none' | 'prefix' | 'free';
};
export type OverlapOutput = {
  relation: 'disjoint' | 'same' | 'a-contains-b' | 'b-contains-a'; overlaps: boolean; sharedCount: number;
  sizeIssueA: 'none' | 'too-large' | 'too-small'; sizeIssueB: 'none' | 'too-large' | 'too-small';
  peering?: 'can' | 'cannot' | 'size'; subnets?: 'can' | 'cannot' | 'size';
};
export type SplitOutput = {
  issue: 'none' | 'vpc-size' | 'subnet-size' | 'subnet-larger' | 'not-enough'; fits: boolean;
  needed: number; available: number; remaining?: number; usableTotal?: number;
  subnets: { cidr: string; az: number; tier: string; usable: number }[];
};
export type Output = SizeOutput | OverlapOutput | SplitOutput;
export type OutputKeyKind = 'number' | 'address' | 'enum' | 'boolean' | 'array';
export type Rule = { label: string; text: string } & ({ factRef: string; evidence: string[] } | { lessonRef: string });
export type Engine = {
  DESCRIPTION: string;
  NOT_COVERED_LINKS: Record<string, { lessonRef: string; label: string }>;
  RULES: Record<string, Rule>;
  NOT_COVERED: string[];
  OUTPUT_KEYS: Record<string, Record<string, OutputKeyKind>>;
  run: (config: Config) => RunResult;
  validateInput: (config: unknown) => RunResult;
};
export type RunError = { code: 'format' | 'ipv6' | 'not-network' | 'in-use' | 'input'; message: string; field?: string; fix?: string };
type Failure = { ok: false; error: RunError };
export type RunResult<T extends Output = Output> = { ok: true; output: T; rules: string[] } | Failure;
export const RULES: Record<string, Rule> & {
  'size-range': Rule & { value: { min: number; max: number } };
  reserved: Rule & { value: { head: number; tail: number } };
  'alb-subnet': Rule & { value: { maxPrefix: number; minFree: number } };
};
export const NOT_COVERED: string[];
export const DESCRIPTION: string;
export const NOT_COVERED_LINKS: Record<string, { lessonRef: string; label: string }>;
export const OUTPUT_KEYS: Record<Config['op'], Record<string, OutputKeyKind>>;
export function formatIpv4(address: number): string;
export function parseCidr(cidr: unknown): { ok: true; prefix: number; start: number; end: number; total: number } | Failure;
export function run(config: SizeConfig): RunResult<SizeOutput>;
export function run(config: OverlapConfig): RunResult<OverlapOutput>;
export function run(config: SplitConfig): RunResult<SplitOutput>;
export function run(config: Config): RunResult;
export function validateInput(config: unknown): RunResult;
