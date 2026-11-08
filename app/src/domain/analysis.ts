// 弱点分析: タスク別・サービス別・判断軸別の正答率と、誤答理由の内訳（すべての回答から集計する）
import type { QuestionMeta } from '../content/types';
import type { AnswerEvent, AppEvent, MissReason } from './events';
import type { History } from './history';

export interface Bucket {
  key: string;
  attempts: number;
  correct: number;
  /** 0〜1 */
  rate: number;
}

export interface Analysis {
  attempts: number;
  correct: number;
  byTask: Bucket[];
  byService: Bucket[];
  byQualifier: Bucket[];
  missReasons: { reason: MissReason | 'unrecorded'; count: number }[];
  wrong: number;
}

function toBuckets(m: Map<string, { attempts: number; correct: number }>): Bucket[] {
  return [...m].map(([key, v]) => ({ key, ...v, rate: v.attempts ? v.correct / v.attempts : 0 }));
}

/** 正答率の低い順（回答数が少ないものは後ろ。同じなら回答の多い順） */
export function weakestFirst(buckets: readonly Bucket[], minAttempts = 3): Bucket[] {
  return [...buckets].sort(
    (a, b) =>
      Number(a.attempts < minAttempts) - Number(b.attempts < minAttempts) || a.rate - b.rate || b.attempts - a.attempts || (a.key < b.key ? -1 : 1),
  );
}

export function analyze(events: readonly AppEvent[], index: readonly QuestionMeta[], history: History): Analysis {
  const meta = new Map(index.map((m) => [m.id, m]));
  const task = new Map<string, { attempts: number; correct: number }>();
  const service = new Map<string, { attempts: number; correct: number }>();
  const qualifier = new Map<string, { attempts: number; correct: number }>();
  const add = (m: Map<string, { attempts: number; correct: number }>, key: string, ok: boolean) => {
    const v = m.get(key) ?? { attempts: 0, correct: 0 };
    v.attempts++;
    if (ok) v.correct++;
    m.set(key, v);
  };
  const reasons = new Map<MissReason | 'unrecorded', number>();
  let attempts = 0;
  let correct = 0;
  let wrong = 0;
  for (const e of events) {
    if (e.type !== 'answer') continue;
    const q = meta.get((e as AnswerEvent).questionId);
    if (!q) continue;
    attempts++;
    if (e.correct) correct++;
    add(task, q.taskStatement, e.correct);
    for (const s of new Set(q.services)) add(service, s, e.correct);
    add(qualifier, q.qualifier, e.correct);
    if (!e.correct) {
      wrong++;
      const r = history.missReasons.get(e.eventId) ?? 'unrecorded';
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
  }
  const order: (MissReason | 'unrecorded')[] = ['knowledge', 'misread', 'two-choice', 'timeout', 'unrecorded'];
  return {
    attempts,
    correct,
    byTask: toBuckets(task).sort((a, b) => (a.key === 'basics' ? -1 : b.key === 'basics' ? 1 : a.key < b.key ? -1 : 1)),
    byService: weakestFirst(toBuckets(service)),
    byQualifier: weakestFirst(toBuckets(qualifier), 1),
    missReasons: order.filter((r) => reasons.has(r)).map((reason) => ({ reason, count: reasons.get(reason)! })),
    wrong,
  };
}
