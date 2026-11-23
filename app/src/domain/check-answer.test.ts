import { expect, it } from 'vitest';
import { answer, event, makeBlueprint, makeQuestion, metaOf } from '../test/fixtures';
import { analyze } from './analysis';
import { buildHistory } from './history';
import { computeReadiness } from './readiness';
import { buildConceptSchedule } from './review';

it('その場の確認の回答を混ぜても、合格準備度・復習・履歴・弱点分析は変わりません', () => {
  const question = makeQuestion({ id: 'saa-1.1-t-001', knowledgeRefs: ['1.1-K1'] });
  const index = [metaOf(question)];
  const bp = makeBlueprint();
  const events = [answer(question.id, false, { at: 1000 }), answer(question.id, true, { at: 2000 })];
  const check = event('check-answer', { lessonId: 'lesson-1.1-test', checkId: 'c12345678', choice: 1, correct: true }, 1500);
  const mix = [...events, check];
  const history = buildHistory(events);
  const mixedHistory = buildHistory(mix);
  expect(mixedHistory).toEqual(history);
  expect(computeReadiness(mix, index, mixedHistory, bp)).toEqual(computeReadiness(events, index, history, bp));
  expect(buildConceptSchedule(mix, index)).toEqual(buildConceptSchedule(events, index));
  expect(analyze(mix, index, mixedHistory)).toEqual(analyze(events, index, history));
});
