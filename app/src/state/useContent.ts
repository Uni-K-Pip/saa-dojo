// コンテンツの読み込みを React の use() で待つための小さなフック群
import { use, useMemo } from 'react';
import { loadLessons } from '../content/loader';

export function useLessonTitles(): Map<string, string> {
  const lessons = use(loadLessons());
  return useMemo(() => new Map(lessons.map((l) => [l.id, l.title])), [lessons]);
}
