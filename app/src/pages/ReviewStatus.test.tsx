import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Course } from '../content/course-types';
import type { DocEntry, FlashcardDeck, GlossaryEntry, LessonMeta } from '../content/types';
import { makeContentFiles } from '../test/fixtures';
import { renderApp, resetDb, useFakeContent } from '../test/render';

function makeLesson(id: string, title: string, status: LessonMeta['status'], domain = 1): LessonMeta {
  return {
    id,
    title,
    status,
    domain,
    taskStatement: domain === 0 ? 'basics' : '1.1',
    order: 1,
    knowledgeRefs: [domain === 0 ? 'basics-K1' : '1.1-K1'],
    services: [],
    estimatedMinutes: 5,
    questionIds: [],
    checkIds: [],
  };
}

const pendingLesson = makeLesson('lesson-1.1-roles', 'IAM ロール', 'pending');
const revisionLesson = makeLesson('lesson-1.1-policies', 'IAM ポリシー', 'needs-fix');
const rejectedLesson = makeLesson('lesson-1.1-trust', '信頼ポリシー', 'rejected');
const verifiedLesson = makeLesson('lesson-1.1-permissions', '最小権限', 'verified');
const lessonBody = 'アクセスに必要な権限を確認します。';

const pendingDoc: DocEntry = {
  id: 'cheatsheet-iam', kind: 'cheatsheet', title: 'IAM の早見表', order: 1,
  taskStatements: [], services: [], createdBy: 't', body: 'ロールとポリシーを比較します。', status: 'pending',
};
const revisionDoc: DocEntry = {
  id: 'guide-iam', kind: 'guide', title: 'IAM のガイド', order: 1,
  taskStatements: [], services: [], createdBy: 't', body: 'ロールの使い分けを説明します。', status: 'needs-fix',
};

const glossary: GlossaryEntry[] = [
  { term: 'サブネット', en: 'Subnet', definition: 'VPC の IP アドレス範囲を分けたもの。', services: [], related: [], status: 'pending' },
  { term: 'ルートテーブル', en: 'Route table', definition: '通信の行き先を決める表。', services: [], related: [], status: 'pending' },
  { term: 'ゲートウェイ', en: 'Gateway', definition: '異なるネットワークをつなぐ仕組み。', services: [], related: [], status: 'pending' },
];
const glossaryNotice = '用語の説明は、まだ内容の検証が済んでいません。';

async function findRow(title: string) {
  const link = await screen.findByRole('link', { name: title });
  return within(link.closest('li')!);
}

beforeEach(resetDb);

describe('レッスン本文の検証状態', () => {
  beforeEach(() => {
    const lessons = [pendingLesson, revisionLesson, rejectedLesson, verifiedLesson];
    const bodies = Object.fromEntries(lessons.map(({ id }) => [`lesson:${id}`, { id, body: lessonBody }]));
    useFakeContent(makeContentFiles([], { lessons, ...bodies }));
  });

  it('未検証のレッスンは未検証の札を表示する', async () => {
    renderApp(`/lessons/${pendingLesson.id}`);
    expect(await screen.findByText(lessonBody)).toBeVisible();
    expect(screen.getByText('未検証')).toBeVisible();
    expect(screen.queryByText('修正待ち')).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it.each([
    { label: '要修正', lesson: revisionLesson },
    { label: '却下', lesson: rejectedLesson },
  ])('$labelのレッスンは修正待ちの札と注意を出し、本文も表示する', async ({ lesson }) => {
    renderApp(`/lessons/${lesson.id}`);
    expect(await screen.findByText(lessonBody)).toBeVisible();
    const notice = screen.getByRole('note');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent('修正を待っています');
    expect(within(notice).getByText('修正待ち')).toBeVisible();
    const badges = screen.getAllByText('修正待ち').filter((element) => !notice.contains(element));
    expect(badges).toHaveLength(1);
    expect(badges[0]).toBeVisible();
  });

  it('検証済みのレッスンは検証状態の札や注意を出さない', async () => {
    renderApp(`/lessons/${verifiedLesson.id}`);
    expect(await screen.findByText(lessonBody)).toBeVisible();
    expect(screen.queryByText('未検証')).not.toBeInTheDocument();
    expect(screen.queryByText('修正待ち')).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('レッスン一覧の検証状態', () => {
  it.each([
    { label: 'ロードマップ', path: '/roadmap', pending: pendingLesson, revision: revisionLesson },
    {
      label: '基礎講座',
      path: '/basics',
      pending: makeLesson('lesson-basics-cloud', 'クラウドとは', 'pending', 0),
      revision: makeLesson('lesson-basics-regions', 'リージョンとは', 'needs-fix', 0),
    },
  ])('$labelの一覧では修正待ちの行にだけ検証状態の札を表示する', async ({ path, pending, revision }) => {
    useFakeContent(makeContentFiles([], { lessons: [pending, revision] }));
    renderApp(path);
    const pendingRow = await findRow(pending.title);
    const revisionRow = await findRow(revision.title);
    expect(pendingRow.queryByText('未検証')).not.toBeInTheDocument();
    expect(pendingRow.queryByText('修正待ち')).not.toBeInTheDocument();
    expect(revisionRow.getByText('修正待ち')).toBeVisible();
  });
});

describe('早見表・ガイドの検証状態', () => {
  beforeEach(() => {
    useFakeContent(makeContentFiles([], { docs: [pendingDoc, revisionDoc] }));
  });

  it('一覧では修正待ちの行にだけ検証状態の札を表示する', async () => {
    renderApp('/docs');
    const pendingRow = await findRow(pendingDoc.title);
    const revisionRow = await findRow(revisionDoc.title);
    expect(pendingRow.queryByText('未検証')).not.toBeInTheDocument();
    expect(pendingRow.queryByText('修正待ち')).not.toBeInTheDocument();
    expect(revisionRow.getByText('修正待ち')).toBeVisible();
  });

  it('未検証の早見表の本文画面に未検証の札を表示する', async () => {
    renderApp(`/docs/${pendingDoc.id}`);
    expect(await screen.findByText(pendingDoc.body)).toBeVisible();
    expect(screen.getByText('未検証')).toBeVisible();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('要修正のガイドは修正待ちの札と注意を出し、本文も表示する', async () => {
    renderApp(`/docs/${revisionDoc.id}`);
    expect(await screen.findByText(revisionDoc.body)).toBeVisible();
    const notice = screen.getByRole('note');
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent('修正を待っています');
    expect(within(notice).getByText('修正待ち')).toBeVisible();
    const badges = screen.getAllByText('修正待ち').filter((element) => !notice.contains(element));
    expect(badges).toHaveLength(1);
    expect(badges[0]).toBeVisible();
  });
});

it('コースのユニットでは修正待ちのレッスン項目にだけ検証状態の札を表示する', async () => {
  const lessons = [pendingLesson, revisionLesson];
  const course: Course = {
    stages: [{
      id: 1,
      title: '中心の部品',
      goal: 'アクセス制御を学びます。',
      units: [{
        id: 'u01',
        title: 'アクセス管理',
        stage: 1,
        items: lessons.map(({ id }) => ({ kind: 'lesson', ref: id })),
        practiceIds: [],
      }],
    }],
  };
  useFakeContent(makeContentFiles([], { course, lessons }));
  renderApp('/course/u01');
  expect(await screen.findByRole('heading', { name: 'U01 アクセス管理' })).toBeVisible();
  const pendingRow = await findRow(pendingLesson.title);
  const revisionRow = await findRow(revisionLesson.title);
  expect(pendingRow.queryByText('未検証')).not.toBeInTheDocument();
  expect(pendingRow.queryByText('修正待ち')).not.toBeInTheDocument();
  expect(revisionRow.getByText('修正待ち')).toBeVisible();
});

it('フラッシュカードでは未検証のカードにだけ未検証の札を表示する', async () => {
  const decks: FlashcardDeck[] = [{
    deck: 'storage', title: 'ストレージ', createdBy: 't', cards: [
      { id: 'fc-s3', front: 'S3 は何型？', back: 'オブジェクトストレージ', taskStatements: [], services: [], tags: [], status: 'pending' },
      { id: 'fc-ebs', front: 'EBS は何型？', back: 'ブロックストレージ', taskStatements: [], services: [], tags: [], status: 'verified' },
    ],
  }];
  useFakeContent(makeContentFiles([], { flashcards: decks }));
  const user = userEvent.setup();
  renderApp('/flashcards');
  expect(await screen.findByText('S3 は何型？')).toBeVisible();
  expect(screen.getByText('未検証')).toBeVisible();

  await user.click(screen.getByRole('button', { name: /答えを見る/ }));
  await user.click(screen.getByRole('button', { name: /普通/ }));
  expect(await screen.findByText('EBS は何型？')).toBeVisible();
  expect(screen.queryByText('未検証')).not.toBeInTheDocument();
});

describe('用語集の検証状態', () => {
  it('全語が未検証なら案内の行に札を一つだけ表示する', async () => {
    useFakeContent(makeContentFiles([], { glossary }));
    renderApp('/glossary');
    const notice = await screen.findByText(glossaryNotice);
    expect(notice).toBeVisible();
    expect(within(notice).getByText('未検証')).toBeVisible();
    expect(screen.getAllByText('未検証')).toHaveLength(1);
    for (const { term } of glossary) {
      expect(screen.getByText(term)).toBeVisible();
    }
  });

  it('一語が検証済みなら案内の行を出さず未検証の語にだけ札を表示する', async () => {
    const entries: GlossaryEntry[] = glossary.map((entry) => (
      entry.term === 'サブネット' ? { ...entry, status: 'verified' } : entry
    ));
    useFakeContent(makeContentFiles([], { glossary: entries }));
    renderApp('/glossary');
    expect(await screen.findByText('3 語')).toBeVisible();
    expect(screen.queryByText(glossaryNotice)).not.toBeInTheDocument();
    expect(screen.getAllByText('未検証')).toHaveLength(2);
    expect(within(screen.getByText('サブネット').closest('dt')!).queryByText('未検証')).not.toBeInTheDocument();
    for (const term of ['ルートテーブル', 'ゲートウェイ']) {
      expect(within(screen.getByText(term).closest('dt')!).getByText('未検証')).toBeVisible();
    }
  });
});
