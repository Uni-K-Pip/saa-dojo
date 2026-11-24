import * as cidr from './cidr.mjs';
import * as trace from './trace.mjs';

export const SIMULATORS = [{
  id: 'cidr',
  name: 'CIDR とサブネット',
  description: cidr.DESCRIPTION,
  engine: cidr,
}, {
  id: 'trace',
  name: 'VPC の通信の追跡',
  description: trace.DESCRIPTION,
  engine: trace,
}];
