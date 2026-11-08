// 判断軸ドリル: 問題の要点（keyPoints）のうち「制約 → 設計」の形のものから、制約を見て設計を選ぶ短い問題を作る
import type { Qualifier, Question } from '../content/types';
import { shuffle, type Rng } from './rng';

export interface DrillSource {
  /** 制約（矢印の左） */
  cue: string;
  /** 選ぶべき設計（矢印の右） */
  answer: string;
  qualifier: Qualifier;
  questionId: string;
}

export interface DrillItem extends DrillSource {
  /** 選択肢（answer を含む。並びはランダム） */
  choices: string[];
}

const ARROW = /\s*(?:→|⇒|->)\s*/;

/** 要点を「制約」と「設計」に分ける。矢印がなければ null */
export function splitKeyPoint(text: string): { cue: string; answer: string } | null {
  const parts = text.split(ARROW);
  if (parts.length !== 2) return null;
  const cue = parts[0]!.trim();
  const answer = parts[1]!.trim();
  if (cue.length < 3 || answer.length < 2) return null;
  return { cue, answer };
}

/** 演習の問題（保留模試は使わない）からドリルの素材を集める */
export function drillSources(questions: readonly Question[]): DrillSource[] {
  const out: DrillSource[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    if (q.pool !== 'practice' && q.pool !== 'basics') continue;
    for (const k of q.keyPoints) {
      const s = splitKeyPoint(k);
      if (!s) continue;
      const key = `${s.cue}|${s.answer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...s, qualifier: q.qualifier, questionId: q.id });
    }
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, '');

/**
 * count 問のドリルを作る。誤りの選択肢は別の問題の設計から選ぶ（同じ判断軸のものを優先して紛らわしくする）。
 * qualifiers を指定すると、その判断軸の素材だけを出題する。
 */
export function buildDrill(sources: readonly DrillSource[], count: number, rng: Rng, qualifiers: readonly Qualifier[] = [], choiceCount = 4): DrillItem[] {
  const pool = qualifiers.length ? sources.filter((s) => qualifiers.includes(s.qualifier)) : [...sources];
  const picked = shuffle(pool, rng).slice(0, count);
  const items: DrillItem[] = [];
  for (const s of picked) {
    const others = shuffle(
      sources.filter((o) => o.questionId !== s.questionId && norm(o.answer) !== norm(s.answer)),
      rng,
    ).sort((a, b) => (a.qualifier === s.qualifier ? 0 : 1) - (b.qualifier === s.qualifier ? 0 : 1));
    const distractors: string[] = [];
    for (const o of others) {
      if (distractors.length >= choiceCount - 1) break;
      if (distractors.some((d) => norm(d) === norm(o.answer))) continue;
      distractors.push(o.answer);
    }
    if (distractors.length < choiceCount - 1) continue;
    items.push({ ...s, choices: shuffle([s.answer, ...distractors], rng) });
  }
  return items;
}
