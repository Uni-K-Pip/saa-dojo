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

/** 復習で出題できる概念（演習・基礎講座の問題が扱う項目）。保留模試だけが扱う概念は出題できない */
export function reviewableConcepts(index: readonly QuestionMeta[]): Set<string> {
  const s = new Set<string>();
  for (const q of index) if (q.pool === 'practice' || q.pool === 'basics') for (const c of q.knowledgeRefs) s.add(c);
  return s;
}

/**
 * 概念ごとの復習スケジュール。出題できない概念のカードは作らない。
 * 模擬試験のように同じセッション・同じ時刻にまとめて記録された回答は、概念ごとに最も悪い評価を1回だけ反映する
 * （記録の順序で結果が変わらないように）。
 */
export function buildConceptSchedule(events: readonly AppEvent[], index: readonly QuestionMeta[]): Map<string, ConceptState> {
  const meta = new Map(index.map((m) => [m.id, m]));
  const usable = reviewableConcepts(index);
  const map = new Map<string, ConceptState>();
  const answers = events.filter((e): e is AnswerEvent => e.type === 'answer').sort(compareEvents);
  // 同じ時刻・同じセッションの回答をまとめる（時刻順なので、同じ時刻の回答は並んでいる）
  const groups: AnswerEvent[][] = [];
  const open = new Map<string, AnswerEvent[]>();
  let openAt: number | null = null;
  for (const e of answers) {
    if (e.at !== openAt) {
      open.clear();
      openAt = e.at;
    }
    let g = open.get(e.sessionId);
    if (!g) {
      g = [];
      open.set(e.sessionId, g);
      groups.push(g);
    }
    g.push(e);
  }
  for (const g of groups) {
    const worst = new Map<string, { grade: Grade; questionId: string }>();
    for (const e of g) {
      const q = meta.get(e.questionId);
      if (!q) continue;
      const grade = conceptGrade(e);
      for (const conceptId of new Set(q.knowledgeRefs)) {
        if (!usable.has(conceptId)) continue;
        const w = worst.get(conceptId);
        if (!w || grade < w.grade) worst.set(conceptId, { grade, questionId: e.questionId });
      }
    }
    const at = g[0]!.at;
    for (const [conceptId, { grade, questionId }] of worst) {
      let st = map.get(conceptId);
      if (!st) {
        // 誤答（Again）か「勘」（Hard）のときだけカードを作る
        if (grade > Rating.Hard) continue;
        st = { ...newState(at), conceptId, lastQuestionId: questionId };
      }
      map.set(conceptId, { ...review(st, at, grade), conceptId, lastQuestionId: questionId });
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
