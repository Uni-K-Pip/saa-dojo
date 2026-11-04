// 問題ごとの回答履歴（イベントログから再計算）
import { compareEvents, type AppEvent, type AnswerEvent, type Confidence, type MissReason } from './events';

export interface QuestionHistory {
  attempts: number;
  correctCount: number;
  first: { correct: boolean; confidence?: Confidence; at: number; mode: AnswerEvent['mode'] };
  last: { correct: boolean; at: number; eventId: string; selected: string[] };
  /** 演習で付けた見直しフラグ（最後の操作） */
  flagged: boolean;
}

export interface History {
  questions: Map<string, QuestionHistory>;
  flags: Map<string, boolean>;
  /** 回答イベント ID → 誤答理由（最後に選んだもの） */
  missReasons: Map<string, MissReason>;
}

export function buildHistory(events: readonly AppEvent[]): History {
  const sorted = [...events].sort(compareEvents);
  const questions = new Map<string, QuestionHistory>();
  const flags = new Map<string, boolean>();
  const missReasons = new Map<string, MissReason>();
  for (const e of sorted) {
    if (e.type === 'answer') {
      const h = questions.get(e.questionId);
      if (!h) {
        questions.set(e.questionId, {
          attempts: 1,
          correctCount: e.correct ? 1 : 0,
          first: { correct: e.correct, confidence: e.confidence, at: e.at, mode: e.mode },
          last: { correct: e.correct, at: e.at, eventId: e.eventId, selected: e.selected },
          flagged: flags.get(e.questionId) ?? false,
        });
      } else {
        h.attempts++;
        if (e.correct) h.correctCount++;
        h.last = { correct: e.correct, at: e.at, eventId: e.eventId, selected: e.selected };
      }
    } else if (e.type === 'flag') {
      flags.set(e.questionId, e.flagged);
      const h = questions.get(e.questionId);
      if (h) h.flagged = e.flagged;
    } else if (e.type === 'miss-reason') {
      missReasons.set(e.answerEventId, e.reason);
    }
  }
  return { questions, flags, missReasons };
}

export function isFlagged(history: History, questionId: string): boolean {
  return history.flags.get(questionId) ?? false;
}
