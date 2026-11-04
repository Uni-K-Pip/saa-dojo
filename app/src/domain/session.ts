// 進行中のセッション（端末内だけに保存する。同期・書き出しの対象外）
import type { AnswerMode, Confidence, MockKind } from './events';

export interface PracticeResult {
  selected: string[];
  confidence: Confidence;
  correct: boolean;
  answerEventId: string;
  durationMs: number;
}

export interface PracticeSession {
  id: string;
  kind: 'practice';
  mode: Exclude<AnswerMode, 'mock' | 'mockA' | 'mockB'>;
  title: string;
  questionIds: string[];
  index: number;
  results: Record<string, PracticeResult>;
  /** 復習: 問題 ID → 復習している概念（blueprint の項目 ID） */
  concepts?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface MockSession {
  id: string;
  kind: 'mock';
  mockKind: MockKind;
  title: string;
  questionIds: string[];
  index: number;
  answers: Record<string, string[]>;
  confidence: Record<string, Confidence>;
  flags: Record<string, boolean>;
  /** 問題ごとの表示時間（ミリ秒） */
  timeSpent: Record<string, number>;
  startedAt: number;
  timeLimitMs: number;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export type SessionRecord = PracticeSession | MockSession;

export function isFinished(s: SessionRecord): boolean {
  return s.finishedAt !== undefined;
}
