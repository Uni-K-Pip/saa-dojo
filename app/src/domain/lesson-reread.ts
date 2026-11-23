import type { LessonMeta } from '../content/types';
import { compareEvents, type AppEvent, type CheckAnswerEvent } from './events';

/** 候補のレッスンを、その場の確認で最後の回答が誤答だった問の数とともに返します。 */
export function lessonRereadCounts(events: readonly AppEvent[], lessons: readonly Pick<LessonMeta, 'id' | 'checkIds'>[]): Map<string, number> {
  const latest = new Map(lessons.map(({ id, checkIds }) =>
    [id, new Map<string, CheckAnswerEvent | undefined>((checkIds ?? []).map((checkId) => [checkId, undefined]))] as const,
  ));
  for (const event of events) {
    if (event.type !== 'check-answer') continue;
    const checks = latest.get(event.lessonId);
    if (!checks?.has(event.checkId)) continue;
    const previous = checks.get(event.checkId);
    if (!previous || compareEvents(previous, event) < 0) checks.set(event.checkId, event);
  }
  const counts = new Map<string, number>();
  for (const [lessonId, checks] of latest) {
    const count = [...checks.values()].filter((event) => event?.correct === false).length;
    if (count > 0) counts.set(lessonId, count);
  }
  return counts;
}
