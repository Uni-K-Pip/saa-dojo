import type { Qualifier } from '../content/types';
import type { Confidence, MissReason } from './events';

export const QUALIFIER_LABELS: Record<Qualifier, string> = {
  cost: 'コスト',
  operational: '運用負荷',
  availability: '可用性・耐障害性',
  performance: '性能',
  security: 'セキュリティ',
  'minimal-change': '変更最小',
  other: 'その他',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  sure: '確信',
  maybe: 'たぶん',
  guess: '勘',
};
export const CONFIDENCES: Confidence[] = ['sure', 'maybe', 'guess'];

export const MISS_REASON_LABELS: Record<MissReason, string> = {
  knowledge: '知識不足',
  misread: '読み落とし',
  'two-choice': '2択で迷った',
  timeout: '時間切れ',
};
export const MISS_REASONS: MissReason[] = ['knowledge', 'misread', 'two-choice', 'timeout'];

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '基本',
  2: '標準',
  3: '応用',
};

export const DOMAIN_SHORT: Record<number, string> = {
  0: '基礎',
  1: 'セキュア',
  2: '弾力性',
  3: '高性能',
  4: 'コスト最適化',
};
