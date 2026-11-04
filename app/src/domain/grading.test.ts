import { describe, expect, it } from 'vitest';
import { isCorrectSelection, lettersFor, optionOrder } from './grading';
import { makeQuestion } from '../test/fixtures';

describe('採点', () => {
  const single = makeQuestion({ id: 'saa-1.1-t-001' });
  const multiple = makeQuestion({
    id: 'saa-1.1-t-002',
    type: 'multiple',
    selectCount: 2,
    options: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, text: `選択肢 ${id}`, correct: id === 'b' || id === 'e', rationale: '理由の説明です。十分な長さ。' })),
  });

  it('択一は正解の1つだけを選んだときに正解', () => {
    expect(isCorrectSelection(single, ['a'])).toBe(true);
    expect(isCorrectSelection(single, ['b'])).toBe(false);
    expect(isCorrectSelection(single, [])).toBe(false);
  });

  it('複数選択は正解をちょうどすべて選んだときだけ正解（部分点なし）', () => {
    expect(isCorrectSelection(multiple, ['e', 'b'])).toBe(true);
    expect(isCorrectSelection(multiple, ['b'])).toBe(false);
    expect(isCorrectSelection(multiple, ['b', 'e', 'a'])).toBe(false);
    expect(isCorrectSelection(multiple, ['b', 'b'])).toBe(false);
  });

  it('選択肢の順序はセッションごとに変わり、同じセッションでは同じ', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 30; i++) orders.add(optionOrder(`session-${i}`, single).join(''));
    expect(orders.size).toBeGreaterThan(5);
    expect(optionOrder('fixed', single)).toEqual(optionOrder('fixed', single));
    expect([...optionOrder('x', single)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('表示順の記号に直す', () => {
    expect(lettersFor(['c', 'a', 'd', 'b'], ['a'])).toBe('B');
    expect(lettersFor(['c', 'a', 'd', 'b'], ['b', 'c'])).toBe('A, D');
  });
});
