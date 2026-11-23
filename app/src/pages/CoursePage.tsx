import { use, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CourseNextStep, courseItemDetails, unitTitle } from '../components/CourseNextStep';
import { MaterialBadges } from '../components/MaterialReading';
import type { CourseUnit } from '../content/course-types';
import { loadCourse, loadDocs, loadLabIndex, loadLessons, loadPatternIndex, loadQuestionIndex, loadSimIndex } from '../content/loader';
import { appendEvent } from '../db/repo';
import { answeredUnitPracticeCount, courseProgress, pickUnitPractice, unitPracticeCandidates, unitProgress } from '../domain/course';
import { randomRng } from '../domain/rng';
import { createPracticeSession } from '../state/sessions';
import { useStudy } from '../state/study';

const PRACTICE_COUNT = 10;
const LONG_PRACTICE_COUNT = 15;

export default function CoursePage() {
  const study = useStudy();
  const course = use(loadCourse());
  const progress = course && courseProgress(course, study);

  return (
    <div className="course-text">
      <h1>学習コース</h1>
      <p className="muted">
        前提知識の順に学べます。知っているユニットは飛ばせます。試験ガイドの順で見るには<Link to="/roadmap">ロードマップ</Link>を開いてください。
      </p>
      <CourseNextStep showCourseLink={false} />
      {!progress && <p className="notice">学習コースはまだありません。</p>}
      {progress?.stages.map(({ stage, units }) => (
        <section key={stage.id} className="card" aria-labelledby={`course-stage-${stage.id}`}>
          <h2 id={`course-stage-${stage.id}`}>ステージ {stage.id} {stage.title}</h2>
          <p className="muted">{stage.goal}</p>
          <ul className="list">
            {units.map(({ unit, done, total }) => (
              <li key={unit.id}>
                <div className="row-between">
                  <Link to={`/course/${unit.id}`}>{unitTitle(unit)}</Link>
                  <span className="small muted">済み {done} / {total}</span>
                </div>
                {total > 0 && <div className="progress" aria-hidden="true"><span style={{ width: `${100 * done / total}%` }} /></div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function UnitItems({ unit }: { unit: CourseUnit }) {
  const study = useStudy();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasKind = (kind: CourseUnit['items'][number]['kind']) => unit.items.some((item) => item.kind === kind);
  const lessons = hasKind('lesson') ? use(loadLessons()) : [];
  const docs = hasKind('doc') ? use(loadDocs()) : [];
  const labs = hasKind('lab') ? use(loadLabIndex()) : [];
  const patterns = hasKind('pattern') ? use(loadPatternIndex()) : [];
  const sims = hasKind('sim') ? use(loadSimIndex()) : [];
  const index = hasKind('practice') ? use(loadQuestionIndex()) : [];
  const { items } = unitProgress(unit, study);
  const candidates = unitPracticeCandidates(unit, index).length;
  const answered = answeredUnitPracticeCount(unit, study.history);

  async function startPractice(count: number) {
    const questionIds = pickUnitPractice(unit, index, study.history, count, randomRng());
    if (questionIds.length === 0) return;
    setError('');
    setBusy(true);
    try {
      const id = await createPracticeSession({ mode: 'unit', unitId: unit.id, title: `ユニット演習: ${unitTitle(unit)}`, questionIds });
      navigate(`/session/${id}`);
    } catch {
      setError('ユニット演習を始められませんでした。もう一度お試しください。');
      setBusy(false);
    }
  }

  async function toggleCheck(itemKey: string, done: boolean) {
    setError('');
    setBusy(true);
    try {
      await appendEvent({ type: 'course-check', unitId: unit.id, itemKey, done: !done });
    } catch {
      setError('進み具合を記録できませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {error && <p className="notice warn" role="alert">{error}</p>}
      <ol className="list" role="list">
        {items.map(({ item, key, done }) => {
          const details = courseItemDetails(item, unit.id, lessons, docs, labs, patterns, sims);
          const manual = item.kind === 'doc' || item.kind === 'analysis';
          return (
            <li key={key}>
              <div className="meta-row">
                <span className="badge">{details.label}</span>
                {details.status && <MaterialBadges status={details.status} />}
                {done && <span className="badge ok">済み</span>}
              </div>
              {item.kind !== 'practice' && (
                <div>
                  <Link to={details.to}>{details.title}</Link>
                  {details.minutes !== undefined && <span className="small muted">（約 {details.minutes} 分）</span>}
                </div>
              )}
              {item.note && <div className="small muted">{item.note}</div>}
              {manual && (
                <div className="btn-row">
                  <button className="btn small" type="button" aria-pressed={done} disabled={busy} onClick={() => void toggleCheck(key, done)}>
                    {done ? '済みを外す' : '済みにする'}
                  </button>
                </div>
              )}
              {item.kind === 'practice' && (
                <>
                  <div className="small muted">候補 {candidates} 問・回答済み {answered} 問</div>
                  {candidates > 0 && (
                    <div className="btn-row">
                      <button className="btn primary" type="button" disabled={busy} onClick={() => void startPractice(PRACTICE_COUNT)}>
                        ユニット演習を始める（{Math.min(PRACTICE_COUNT, candidates)} 問）
                      </button>
                      {candidates >= LONG_PRACTICE_COUNT && (
                        <button className="btn" type="button" disabled={busy} onClick={() => void startPractice(LONG_PRACTICE_COUNT)}>{LONG_PRACTICE_COUNT} 問で始める</button>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function UnitPage() {
  const { unitId } = useParams();
  const course = use(loadCourse());
  const units = course?.stages.flatMap((stage) => stage.units.map((unit) => ({ stage, unit }))) ?? [];
  const position = units.findIndex(({ unit }) => unit.id === unitId);
  const current = units[position];
  if (!current) {
    return (
      <div className="card">
        <h1>ユニットが見つかりません</h1>
        <Link className="btn" to="/course">学習コースへ</Link>
      </div>
    );
  }
  const { stage, unit } = current;
  const previous = units[position - 1]?.unit;
  const next = units[position + 1]?.unit;

  return (
    <article className="course-text">
      <p className="small muted"><Link to="/course">学習コース</Link> › ステージ {stage.id} {stage.title}</p>
      <h1>{unitTitle(unit)}</h1>
      <UnitItems key={unit.id} unit={unit} />
      <nav className="btn-row" aria-label="前後のユニット">
        {previous && <Link className="btn" to={`/course/${previous.id}`}>‹ {unitTitle(previous)}</Link>}
        {next && <Link className="btn" to={`/course/${next.id}`}>{unitTitle(next)} ›</Link>}
      </nav>
    </article>
  );
}
