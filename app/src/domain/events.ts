// 端末内の学習記録（追記専用のイベントログ）。統計・復習予定・設定はすべてここから再計算する。

export type Confidence = 'sure' | 'maybe' | 'guess';
export type MissReason = 'knowledge' | 'misread' | 'two-choice' | 'timeout';
export type AnswerMode = 'practice' | 'basics' | 'review' | 'lesson' | 'mock' | 'mockA' | 'mockB';
export type MockKind = 'random' | 'mockA' | 'mockB';
export type FlashcardRating = 1 | 2 | 3 | 4;

export interface EventBase {
  /** UUID */
  eventId: string;
  deviceId: string;
  /** 記録した時刻（エポックミリ秒） */
  at: number;
}

export interface AnswerEvent extends EventBase {
  type: 'answer';
  questionId: string;
  /** 選んだ選択肢の id（元の a〜f。表示順ではない） */
  selected: string[];
  correct: boolean;
  /** 自信度（模擬試験で選ばなかったときは記録しない） */
  confidence?: Confidence;
  mode: AnswerMode;
  sessionId: string;
  durationMs: number;
  /** 模擬試験で見直しフラグを付けていたか */
  flagged?: boolean;
}

export interface MissReasonEvent extends EventBase {
  type: 'miss-reason';
  questionId: string;
  answerEventId: string;
  reason: MissReason;
}

export interface FlagEvent extends EventBase {
  type: 'flag';
  questionId: string;
  flagged: boolean;
}

export interface FlashcardEvent extends EventBase {
  type: 'flashcard';
  cardId: string;
  rating: FlashcardRating;
  durationMs: number;
}

export interface SettingEvent extends EventBase {
  type: 'setting';
  key: string;
  value: unknown;
}

export interface MockResultEvent extends EventBase {
  type: 'mock-result';
  sessionId: string;
  kind: MockKind;
  questionIds: string[];
  answered: number;
  correct: number;
  total: number;
  startedAt: number;
  elapsedMs: number;
  timeLimitMs: number;
}

export interface LessonReadEvent extends EventBase {
  type: 'lesson-read';
  lessonId: string;
}

export interface DrillEvent extends EventBase {
  type: 'drill';
  sessionId: string;
  correct: number;
  total: number;
  durationMs: number;
}

export type AppEvent =
  | AnswerEvent
  | MissReasonEvent
  | FlagEvent
  | FlashcardEvent
  | SettingEvent
  | MockResultEvent
  | LessonReadEvent
  | DrillEvent;

type DistributiveOmit<T, K extends keyof EventBase> = T extends unknown ? Omit<T, K> : never;
/** 追記するときに渡す形（eventId・deviceId・時刻は自動で付ける。時刻は指定もできる） */
export type NewEvent = DistributiveOmit<AppEvent, 'eventId' | 'deviceId' | 'at'> & { at?: number };

/** 時刻順（同時刻は eventId 順）。端末をまたいでも同じ順序になる */
export function compareEvents(a: EventBase, b: EventBase): number {
  return a.at - b.at || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0);
}

export function sortEvents<T extends EventBase>(events: T[]): T[] {
  return [...events].sort(compareEvents);
}

export function isAnswer(e: AppEvent): e is AnswerEvent {
  return e.type === 'answer';
}

/** 未知の種類も含め、イベントとして最低限の形をしているか（読み込み・同期で使う） */
export function isEventLike(v: unknown): v is EventBase & { type: string } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.eventId === 'string' &&
    o.eventId.length >= 8 &&
    o.eventId.length <= 64 &&
    typeof o.deviceId === 'string' &&
    o.deviceId.length <= 64 &&
    typeof o.at === 'number' &&
    Number.isFinite(o.at) &&
    typeof o.type === 'string' &&
    o.type.length <= 32
  );
}

export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
