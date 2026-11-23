import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import type { Course } from '../content/course-types';
import type { LessonMeta } from '../content/types';
import { db } from '../db/db';
import { event, makeContentFiles } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

const lesson = (over: Partial<LessonMeta> & { id: string; title: string }): LessonMeta => ({
  domain: 1, taskStatement: '1.1', order: 1, knowledgeRefs: [], services: [],
  estimatedMinutes: 5, questionIds: [], checkIds: ['c00000001', 'c00000002'], ...over,
});
const roadmap = lesson({ id: 'lesson-1.1-iam', title: 'アクセス管理' });
const otherRoadmap = lesson({ id: 'lesson-1.1-policies', title: 'ポリシー' });
const basics = lesson({ id: 'lesson-basics-cloud', title: 'クラウドの基本', domain: 0, taskStatement: 'basics' });
const otherBasics = lesson({ id: 'lesson-basics-regions', title: 'リージョン', domain: 0, taskStatement: 'basics' });
const lessons = [roadmap, otherRoadmap, basics, otherBasics];
const filter = '読み直すとよいレッスン';
const none = '読み直すとよいレッスンはありません（その場の確認で間違えたレッスンがここに出ます）';
const badge = (count: number) => `読み直し候補: その場の確認で ${count} 問間違えています`;
const answer = ({ id }: LessonMeta, checkId: string, correct: boolean) =>
  event('check-answer', { lessonId: id, checkId, correct, choice: correct ? 1 : 2 });
const pages = [['/roadmap', roadmap, otherRoadmap, basics], ['/basics', basics, otherBasics, roadmap]] as const;

beforeEach(async () => {
  await resetDb();
  useFakeContent(makeContentFiles([], { lessons }));
});

it.each(pages)('%s で候補に札を付け、候補だけに絞り込める', async (path, candidate, other) => {
  await db.events.bulkAdd([
    answer(candidate, 'c00000001', false), answer(candidate, 'c00000002', false),
    answer(other, 'c00000001', false), answer(other, 'c00000001', true),
    event('lesson-read', { lessonId: candidate.id }),
  ]);
  renderApp(path);
  const link = await screen.findByRole('link', { name: candidate.title });
  const row = within(link.closest('li')!);
  expect(row.getByText('読み直し').closest('.badge')).toHaveClass('pending');
  expect(row.getByText(badge(2))).toHaveClass('visually-hidden');
  expect(row.getByText('読了')).toBeInTheDocument();
  const otherLink = screen.getByRole('link', { name: other.title });
  expect(within(otherLink.closest('li')!).queryByText('読み直し')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: filter }));
  expect(screen.getByRole('link', { name: candidate.title })).toBeVisible();
  expect(screen.queryByRole('link', { name: other.title })).not.toBeInTheDocument();
  expect(screen.queryByText(none)).not.toBeInTheDocument();
  // 切り替えたときの件数は、常にある読み上げの領域に出る
  expect(screen.getByText(/^\s*1 本$/)).toHaveAttribute('aria-live', 'polite');
});

it.each(pages)('%s は回答がなくても入口を出し、絞り込むと 0 件の案内を出す', async (path, candidate) => {
  renderApp(path);
  await userEvent.click(await screen.findByRole('checkbox', { name: filter }));
  expect(screen.getByText(none)).toBeVisible();
  expect(screen.getByText(/^\s*0 本$/)).toHaveAttribute('aria-live', 'polite');
  expect(screen.queryByRole('link', { name: candidate.title })).not.toBeInTheDocument();
});

it.each(pages)('%s のレッスンにその場の確認がなければ入口を出さない', async (path, candidate, other, onOtherPage) => {
  useFakeContent(makeContentFiles([], { lessons: [
    { ...candidate, checkIds: [] }, { ...other, checkIds: [] }, onOtherPage,
  ] }));
  renderApp(path);
  expect(await screen.findByRole('link', { name: candidate.title })).toBeVisible();
  expect(screen.queryByRole('checkbox', { name: filter })).not.toBeInTheDocument();
});

it('学習コースのユニットでも候補のレッスンにだけ札を付ける', async () => {
  const course: Course = { stages: [{ id: 0, title: '土台', goal: '仕組みを学びます。', units: [{
    id: 'u00', title: 'アクセス管理を学ぶ', stage: 0, practiceIds: [],
    items: [roadmap, otherRoadmap].map(({ id }) => ({ kind: 'lesson', ref: id })),
  }] }] };
  useFakeContent(makeContentFiles([], { course, lessons }));
  await db.events.add(answer(roadmap, 'c00000001', false));
  renderApp('/course/u00');
  const link = await screen.findByRole('link', { name: roadmap.title });
  const row = within(link.closest('li')!);
  expect(row.getByText('読み直し')).toBeVisible();
  expect(row.getByText(badge(1))).toHaveClass('visually-hidden');
  const other = screen.getByRole('link', { name: otherRoadmap.title });
  expect(within(other.closest('li')!).queryByText('読み直し')).not.toBeInTheDocument();
});
