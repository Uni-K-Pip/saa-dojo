import { Suspense, use } from 'react';
import { Link } from 'react-router';
import type { CourseItem, CourseUnit } from '../content/course-types';
import { loadCourse, loadDocs, loadLabIndex, loadLessons, loadPatternIndex, loadSimIndex } from '../content/loader';
import type { DocEntry, LabMeta, LessonMeta, PatternMeta, SimIndexEntry } from '../content/types';
import { nextStep } from '../domain/course';
import { useStudy } from '../state/study';

const MOCK_TITLES = { random: 'ランダム模試', mockA: '保留模試 A', mockB: '保留模試 B' };

export function unitTitle(unit: CourseUnit): string {
  return `U${unit.id.slice(1)} ${unit.title}`;
}

export function courseItemDetails(
  item: CourseItem, unitId: string, lessons: LessonMeta[], docs: DocEntry[],
  labs: LabMeta[] = [], patterns: PatternMeta[] = [], sims: SimIndexEntry[] = [],
): { label: string; title: string; to: string; action: string; minutes?: number; status?: LabMeta['status'] } {
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
    case 'lab': {
      const lab = labs.find((l) => l.id === item.ref);
      return { label: 'ミニラボ', title: lab?.title ?? item.ref, to: `/labs/${item.ref}`, action: 'ミニラボを読む', minutes: lab?.estimatedMinutes, status: lab?.status };
    }
    case 'pattern': {
      const pattern = patterns.find((p) => p.id === item.ref);
      return { label: '設計パターン', title: pattern?.title ?? item.ref, to: `/patterns/${item.ref}`, action: '設計パターンを読む', status: pattern?.status };
    }
    case 'sim': {
      const entry = sims.find(({ scenarios }) => scenarios.some(({ id }) => id === item.ref));
      const scenario = entry?.scenarios.find(({ id }) => id === item.ref);
      // 索引になくても、シナリオ ID の接頭辞を使って詳細画面の「見つかりません」へ案内する。
      const simId = entry?.id ?? item.ref.split('-')[1];
      return {
        label: 'シミュレーター', title: scenario?.title ?? item.ref, to: `/sims/${simId}/${item.ref}`,
        action: 'シミュレーターへ', status: scenario?.status,
      };
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
  const labs = next?.item.kind === 'lab' ? use(loadLabIndex()) : [];
  const patterns = next?.item.kind === 'pattern' ? use(loadPatternIndex()) : [];
  const sims = next?.item.kind === 'sim' ? use(loadSimIndex()) : [];
  const details = next && courseItemDetails(next.item, next.unit.id, lessons, docs, labs, patterns, sims);

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
