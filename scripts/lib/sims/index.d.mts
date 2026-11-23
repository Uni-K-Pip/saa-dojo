import type { Engine as CidrEngine } from './cidr.mjs';

export const SIMULATORS: ({ name: string; description: string } & (
  { id: 'cidr'; engine: CidrEngine } | { id: 'trace'; engine: typeof import('./trace.mjs') }
))[];
