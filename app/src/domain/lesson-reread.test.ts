import { expect, it } from 'vitest';
import { event } from '../test/fixtures';
import { lessonRereadCounts } from './lesson-reread';

const lessons = [
  { id: 'lesson-a', checkIds: ['c01', 'c02', 'c03'] },
  { id: 'lesson-b', checkIds: ['c01'] },
];
const answer = (lessonId: string, checkId: string, correct: boolean, at: number) =>
  event('check-answer', { lessonId, checkId, correct, choice: correct ? 1 : 2 }, at);

it('誤答を数え、各確認にあとから正解すると候補から外す', () => {
  const missedFirst = answer('lesson-a', 'c01', false, 1);
  const missedSecond = answer('lesson-a', 'c02', false, 2);
  const correctFirst = answer('lesson-a', 'c01', true, 4);
  const correctSecond = answer('lesson-a', 'c02', true, 3);
  expect(lessonRereadCounts([missedFirst, missedSecond], lessons)).toEqual(new Map([['lesson-a', 2]]));
  expect(lessonRereadCounts([correctSecond, missedFirst, missedSecond], lessons)).toEqual(new Map([['lesson-a', 1]]));
  expect(lessonRereadCounts([correctSecond, missedFirst, correctFirst, missedSecond], lessons).size).toBe(0);
});

it('正解のあとに誤答すると、読了していても候補になる', () => {
  const events = [
    answer('lesson-a', 'c01', true, 1), answer('lesson-a', 'c01', false, 2),
    event('lesson-read', { lessonId: 'lesson-a' }, 3),
  ];
  expect(lessonRereadCounts(events, lessons)).toEqual(new Map([['lesson-a', 1]]));
});

it('今の本文にない確認を除き、同じ ID の確認でもレッスンごとに判定する', () => {
  const events = [
    answer('lesson-a', 'c-old', false, 1), answer('lesson-a', 'c01', true, 2),
    answer('lesson-b', 'c01', false, 3), answer('lesson-c', 'c01', false, 4),
  ];
  expect(lessonRereadCounts(events, lessons)).toEqual(new Map([['lesson-b', 1]]));
});

it('時刻が同じ記録はイベント ID 順で最後の回答を選ぶ', () => {
  const first = answer('lesson-a', 'c01', false, 1);
  const second = answer('lesson-a', 'c01', true, 1);
  expect(lessonRereadCounts([second, first], lessons).size).toBe(0);
});
