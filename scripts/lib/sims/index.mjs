import * as cidr from './cidr.mjs';

export const SIMULATORS = [{
  id: 'cidr',
  name: 'CIDR とサブネット',
  description: 'プレフィックス長を変えて、アドレスの数、予約されるアドレス、範囲の重なりを確かめます。',
  engine: cidr,
}];
