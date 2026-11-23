import * as cidr from './cidr.mjs';

export const SIMULATORS = [{
  id: 'cidr',
  name: 'CIDR とサブネット',
  description: cidr.DESCRIPTION,
  engine: cidr,
}];
