// レッスン本文（Markdown、表、囲み記事）と確認問題
import { use, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { loadBlueprint, loadLessonBody, loadLessons, loadQuestionIndex } from '../content/loader';
import type { LessonMeta } from '../content/types';
import { appendEvent } from '../db/repo';
import { domainName, taskIndex } from '../domain/blueprint';
import { lessonReadMap, neighbors, progressOf } from '../domain/progress';
import { randomRng } from '../domain/rng';
import { pickQuestions } from '../domain/selection';
import { Markdown } from '../components/Markdown';
import { createPracticeSession } from '../state/sessions';
import { ServiceLinkList } from '../components/ServiceLinks';
import { useServiceLinker } from '../state/useContent';
import { useStudy } from '../state/study';

export default function LessonPage() {
  const { id = '' } = useParams();
  const lessons = use(loadLessons());
  const lesson = lessons.find((l) => l.id === id);
  if (!lesson) {
    return (
      <div className="card">
        <h1>レッスンが見つかりません</h1>
        <p>指定されたレッスン（{id}）は現在のコンテンツにありません。</p>
        <Link className="btn" to="/roadmap">
          ロードマップへ
        </Link>
      </div>
    );
  }
  return <LessonView key={lesson.id} lesson={lesson} lessons={lessons} />;
}

function LessonView({ lesson, lessons }: { lesson: LessonMeta; lessons: LessonMeta[] }) {
  const body = use(loadLessonBody(lesson.id));
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const { events, history } = useStudy();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const readAt = lessonReadMap(events).get(lesson.id);
  const { link } = useServiceLinker();
  const isBasics = lesson.domain === 0;
  const quizIds = useMemo(() => {
    const known = new Set(index.map((q) => q.id));
    return lesson.questionIds.filter((qid) => known.has(qid));
  }, [index, lesson.questionIds]);
  const quizSet = useMemo(() => new Set(quizIds), [quizIds]);
  const progress = progressOf(
    quizIds.map((qid) => ({ id: qid })),
    history,
  );
  const { prev, next } = neighbors(lessons, lesson.id);
  const task = taskIndex(blueprint).get(lesson.taskStatement);

  async function start(ids: string[], title: string) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    try {
      const sid = await createPracticeSession({ mode: isBasics ? 'basics' : 'lesson', title, questionIds: ids });
      navigate(`/session/${sid}`);
    } finally {
      setBusy(false);
    }
  }

  const startQuiz = () => {
    const metas = index.filter((q) => quizSet.has(q.id));
    void start(pickQuestions(metas, history, metas.length, randomRng()), `確認問題: ${lesson.title}`);
  };

  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {isBasics ? (
          <Link to="/basics">基礎講座</Link>
        ) : (
          <>
            <Link to="/roadmap">ロードマップ</Link> › {domainName(blueprint, lesson.domain)} › タスク {lesson.taskStatement}
            {task ? ` ${task.titleJa}` : ''}
          </>
        )}
      </p>
      <h1>{lesson.title}</h1>
      <p className="meta-row">
        <span>約 {lesson.estimatedMinutes} 分</span>
        {quizIds.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>確認問題 {quizIds.length} 問</span>
          </>
        )}
        {readAt && <span className="badge ok">読了 {new Date(readAt).toLocaleDateString('ja-JP')}</span>}
      </p>
      {lesson.services.length > 0 && <p className="small muted">
          扱うサービス: <ServiceLinkList names={lesson.services} link={link} />
        </p>}

      <div className="card">
        {body ? (
          <Markdown
            renderQuestionRef={(qid) =>
              quizSet.has(qid) ? (
                <button type="button" className="link-button" onClick={() => void start([qid], `確認問題: ${lesson.title}`)} disabled={busy}>
                  {qid} を解く
                </button>
              ) : null
            }
          >
            {body.body}
          </Markdown>
        ) : (
          <p className="muted">本文を読み込めませんでした。</p>
        )}
      </div>

      <section className="card" aria-labelledby="quiz-h">
        <h2 id="quiz-h">確認問題</h2>
        {quizIds.length === 0 ? (
          <p className="muted">このレッスンの確認問題はまだありません。</p>
        ) : (
          <>
            <p>
              {quizIds.length} 問（回答済み {progress.answered} 問・最後の回答が正解 {progress.lastCorrect} 問）
            </p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={startQuiz} disabled={busy}>
                確認問題を解く（{quizIds.length} 問）
              </button>
            </div>
          </>
        )}
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={() => void appendEvent({ type: 'lesson-read', lessonId: lesson.id })}
            aria-pressed={!!readAt}
          >
            {readAt ? '✓ 読了済み（もう一度記録する）' : '読了にする'}
          </button>
          {!isBasics && (
            <Link className="btn" to={`/practice?tasks=${encodeURIComponent(lesson.taskStatement)}`}>
              タスク {lesson.taskStatement} を演習する
            </Link>
          )}
        </div>
      </section>

      <nav className="row-between" aria-label="前後のレッスン">
        {prev ? <Link to={`/lessons/${prev.id}`}>← {prev.title}</Link> : <span />}
        {next ? <Link to={`/lessons/${next.id}`}>{next.title} →</Link> : <span />}
      </nav>
    </article>
  );
}
