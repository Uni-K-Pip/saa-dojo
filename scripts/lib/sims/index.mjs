import * as cidr from './cidr.mjs';
import * as trace from './trace.mjs';
import * as iam from './iam.mjs';

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
}, {
  id: 'iam',
  name: 'IAM のポリシーの評価',
  description: iam.DESCRIPTION,
  engine: iam,
}];
