// レッスンの読了と、問題群の進み具合（ロードマップ・基礎講座で使う）
import type { LessonMeta, QuestionMeta } from '../content/types';
import type { AppEvent } from './events';
import type { History } from './history';

/** レッスン ID → 最後に読了を記録した時刻 */
export function lessonReadMap(events: readonly AppEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'lesson-read') continue;
    const prev = m.get(e.lessonId);
    if (prev === undefined || e.at > prev) m.set(e.lessonId, e.at);
  }
  return m;
}

export interface Progress {
  total: number;
  /** 1回以上回答した問題 */
  answered: number;
  /** 最後の回答が正解の問題 */
  lastCorrect: number;
}

export function progressOf(questions: readonly Pick<QuestionMeta, 'id'>[], history: History): Progress {
  let answered = 0;
  let lastCorrect = 0;
  for (const q of questions) {
    const h = history.questions.get(q.id);
    if (!h) continue;
    answered++;
    if (h.last.correct) lastCorrect++;
  }
  return { total: questions.length, answered, lastCorrect };
}

export function percent(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

/** 基礎講座・本編それぞれの並び（ドメイン → タスク → order）での前後のレッスン */
export function neighbors(lessons: readonly LessonMeta[], id: string): { prev: LessonMeta | null; next: LessonMeta | null } {
  const cur = lessons.find((l) => l.id === id);
  if (!cur) return { prev: null, next: null };
  const track = lessons.filter((l) => (cur.domain === 0 ? l.domain === 0 : l.domain !== 0));
  const i = track.findIndex((l) => l.id === id);
  return { prev: track[i - 1] ?? null, next: track[i + 1] ?? null };
}

/**
 * 問題の関連レッスン。lessonRefs のうち現在あるレッスンを返し、1つもなければ同じタスクのレッスンを返す
 * （レッスンが後から増えても、問題ファイルを変えずに表示されるように）。
 */
export function relatedLessons(q: Pick<QuestionMeta, 'lessonRefs' | 'taskStatement'>, lessons: readonly LessonMeta[]): LessonMeta[] {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const direct = q.lessonRefs.map((id) => byId.get(id)).filter((l): l is LessonMeta => !!l);
  if (direct.length > 0) return direct;
  return lessons.filter((l) => l.taskStatement === q.taskStatement);
}

/** 回答したことのある問題が扱う blueprint の項目 ID（保留模試の回答も含む） */
export function answeredItems(index: readonly QuestionMeta[], history: History): Set<string> {
  const s = new Set<string>();
  for (const q of index) {
    if (!history.questions.has(q.id)) continue;
    for (const r of q.knowledgeRefs) s.add(r);
  }
  return s;
}
