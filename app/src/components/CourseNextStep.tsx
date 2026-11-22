import { Suspense, use } from 'react';
import { Link } from 'react-router';
import type { CourseItem, CourseUnit } from '../content/course-types';
import { loadCourse, loadDocs, loadLessons } from '../content/loader';
import type { DocEntry, LessonMeta } from '../content/types';
import { nextStep } from '../domain/course';
import { useStudy } from '../state/study';

const MOCK_TITLES = { random: 'ランダム模試', mockA: '保留模試 A', mockB: '保留模試 B' };

export function unitTitle(unit: CourseUnit): string {
  return `U${unit.id.slice(1)} ${unit.title}`;
}

export function courseItemDetails(
  item: CourseItem, unitId: string, lessons: LessonMeta[], docs: DocEntry[],
): { label: string; title: string; to: string; action: string; minutes?: number } {
  switch (item.kind) {
    case 'lesson': {
      const lesson = lessons.find((l) => l.id === item.ref);
      return { label: 'レッスン', title: lesson?.title ?? item.ref, to: `/lessons/${item.ref}`, action: 'レッスンを読む', minutes: lesson?.estimatedMinutes };
    }
    case 'doc': {
      const doc = docs.find((d) => d.id === item.ref);
      const label = (doc?.kind === 'guide' || item.ref.startsWith('guide-')) ? 'ガイド' : '早見表';
      return { label, title: doc?.title ?? item.ref, to: `/docs/${item.ref}`, action: `${label}を読む` };
    }
    case 'practice':
      return { label: 'ユニット演習', title: 'ユニット演習', to: `/course/${unitId}`, action: 'ユニット演習へ' };
    case 'drill':
      return { label: '判断軸ドリル', title: '判断軸ドリル', to: '/drill', action: '判断軸ドリルへ' };
    case 'analysis':
      return { label: '弱点分析', title: '弱点分析', to: '/analysis', action: '弱点分析へ' };
    case 'mock':
      return { label: '模擬試験', title: MOCK_TITLES[item.mock], to: '/mock', action: '模擬試験へ' };
  }
}

function NextStepCard({ showCourseLink }: { showCourseLink: boolean }) {
  const study = useStudy();
  const course = use(loadCourse());
  if (!course) return null;

  const next = nextStep(course, study);
  const lessons = next?.item.kind === 'lesson' ? use(loadLessons()) : [];
  const docs = next?.item.kind === 'doc' ? use(loadDocs()) : [];
  const details = next && courseItemDetails(next.item, next.unit.id, lessons, docs);

  return (
    <section className="card course-text" aria-labelledby="course-next-h">
      <h2 id="course-next-h">次にやること</h2>
      {next && details ? (
        <p><strong>{unitTitle(next.unit)}</strong><br />{details.title}</p>
      ) : <p>コースの項目はすべて済みです。</p>}
      <div className="btn-row">
        {details && <Link className="btn primary" to={details.to}>{details.action}</Link>}
        {showCourseLink && <Link className="btn" to="/course">コースを見る</Link>}
      </div>
    </section>
  );
}

export function CourseNextStep({ showCourseLink = true }: { showCourseLink?: boolean }) {
  return <Suspense fallback={null}><NextStepCard showCourseLink={showCourseLink} /></Suspense>;
}
