// 概念（blueprint の項目 ID）単位の復習スケジュール。
// 誤答、または自信度「勘」の回答で、その問題の概念のカードを作る。以降はその概念を含む問題への回答で更新する。
import type { QuestionMeta } from '../content/types';
import { compareEvents, type AnswerEvent, type AppEvent } from './events';
import type { History } from './history';
import { shuffle, type Rng } from './rng';
import { Rating, dueAt, newState, review, type Grade, type SrsState } from './srs';

export interface ConceptState extends SrsState {
  conceptId: string;
  /** 最後にこの概念で解いた問題 */
  lastQuestionId: string;
}

export function conceptGrade(e: Pick<AnswerEvent, 'correct' | 'confidence'>): Grade {
  if (!e.correct) return Rating.Again;
  if (e.confidence === 'guess') return Rating.Hard;
  if (e.confidence === 'sure') return Rating.Easy;
  return Rating.Good;
}

export function buildConceptSchedule(events: readonly AppEvent[], index: readonly QuestionMeta[]): Map<string, ConceptState> {
  const meta = new Map(index.map((m) => [m.id, m]));
  const map = new Map<string, ConceptState>();
  const answers = events.filter((e): e is AnswerEvent => e.type === 'answer').sort(compareEvents);
  for (const e of answers) {
    const q = meta.get(e.questionId);
    if (!q) continue;
    const grade = conceptGrade(e);
    for (const conceptId of new Set(q.knowledgeRefs)) {
      let st = map.get(conceptId);
      if (!st) {
        if (e.correct && e.confidence !== 'guess') continue;
        st = { ...newState(e.at), conceptId, lastQuestionId: e.questionId };
      }
      map.set(conceptId, { ...review(st, e.at, grade), conceptId, lastQuestionId: e.questionId });
    }
  }
  return map;
}

/** until までに期限が来る概念（期限の早い順） */
export function dueConcepts(schedule: Map<string, ConceptState>, until: number): ConceptState[] {
  return [...schedule.values()].filter((c) => dueAt(c) <= until).sort((a, b) => dueAt(a) - dueAt(b) || (a.conceptId < b.conceptId ? -1 : 1));
}

export interface ReviewPick {
  questionId: string;
  conceptId: string;
}

/**
 * 期限が来た概念ごとに 1 問を選ぶ。演習と基礎講座の問題だけを使い（保留模試は出さない）、
 * 前回その概念で解いた問題とは別の問題を優先する（丸暗記を防ぐ）。同じセッションで同じ問題は出さない。
 */
export function pickReviewQuestions(
  due: readonly ConceptState[],
  index: readonly QuestionMeta[],
  history: History,
  limit: number,
  rng: Rng,
): { picks: ReviewPick[]; noQuestion: string[] } {
  const usable = index.filter((q) => q.pool === 'practice' || q.pool === 'basics');
  const byConcept = new Map<string, QuestionMeta[]>();
  for (const q of usable) {
    for (const c of q.knowledgeRefs) {
      const list = byConcept.get(c) ?? [];
      list.push(q);
      byConcept.set(c, list);
    }
  }
  const used = new Set<string>();
  const picks: ReviewPick[] = [];
  const noQuestion: string[] = [];
  for (const c of due) {
    if (picks.length >= limit) break;
    const candidates = (byConcept.get(c.conceptId) ?? []).filter((q) => !used.has(q.id));
    if (candidates.length === 0) {
      if (!byConcept.has(c.conceptId)) noQuestion.push(c.conceptId);
      continue;
    }
    const ranked = shuffle(candidates, rng)
      .map((q, i) => {
        const h = history.questions.get(q.id);
        return { q, i, same: q.id === c.lastQuestionId ? 1 : 0, lastAt: h ? h.last.at : 0 };
      })
      .sort((a, b) => a.same - b.same || a.lastAt - b.lastAt || a.i - b.i);
    const chosen = ranked[0]!.q;
    used.add(chosen.id);
    picks.push({ questionId: chosen.id, conceptId: c.conceptId });
  }
  return { picks, noQuestion };
}
