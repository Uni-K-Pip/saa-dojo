// 模擬試験の結果: ドメイン別の正答率、1問あたりの時間、全問の解説
import { use, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { appendEvent } from '../db/repo';
import { fileKeysFor, loadBlueprint, loadQuestionIndex, loadQuestionMap } from '../content/loader';
import type { QuestionMeta } from '../content/types';
import { optionOrder } from '../domain/grading';
import { firstAttempt, formatDuration, mockReport, type MockReport } from '../domain/mock';
import { AnswerFeedback } from '../components/AnswerFeedback';
import { useStudy } from '../state/study';
import { loadLessons } from '../content/loader';

const KIND_LABELS = { random: 'ランダム模試', mockA: '保留模試 A', mockB: '保留模試 B' } as const;

export default function MockResultPage() {
  const { id = '' } = useParams();
  const { events } = useStudy();
  const index = use(loadQuestionIndex());
  const report = useMemo(() => mockReport(events, id, index), [events, id, index]);
  if (!report) {
    return (
      <div className="card">
        <h1>結果が見つかりません</h1>
        <Link className="btn" to="/mock">
          模擬試験へ
        </Link>
      </div>
    );
  }
  return <MockResultView report={report} index={index} />;
}

type Filter = 'all' | 'wrong' | 'flagged' | 'unanswered';

function MockResultView({ report, index }: { report: MockReport; index: QuestionMeta[] }) {
  const { result } = report;
  const { events, history } = useStudy();
  const blueprint = use(loadBlueprint());
  const questions = use(loadQuestionMap(fileKeysFor(result.questionIds, index)));
  const lessons = use(loadLessons());
  const [filter, setFilter] = useState<Filter>('all');
  const pct = Math.round((result.correct / Math.max(1, result.total)) * 100);
  const domainName = (d: number) => blueprint?.domains.find((x) => x.id === d)?.nameJa ?? (d === 0 ? '基礎' : `ドメイン ${d}`);
  const isFirst = result.kind !== 'random' && firstAttempt(events, result.kind)?.sessionId === result.sessionId;

  const rows = report.questions
    .map((r, i) => ({ ...r, i }))
    .filter((r) => {
      if (filter === 'wrong') return !!r.answer && !r.correct;
      if (filter === 'flagged') return !!r.answer?.flagged;
      if (filter === 'unanswered') return !r.answer;
      return true;
    });
  const FILTERS: [Filter, string][] = [
    ['all', `すべて（${report.questions.length}）`],
    ['wrong', `不正解（${report.questions.filter((r) => r.answer && !r.correct).length}）`],
    ['flagged', `フラグ（${report.questions.filter((r) => r.answer?.flagged).length}）`],
    ['unanswered', `未回答（${report.questions.filter((r) => !r.answer).length}）`],
  ];

  return (
    <div>
      <h1>{KIND_LABELS[result.kind]}の結果</h1>
      <section className="card">
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">{pct}%</span>
            <span className="stat-label">
              正答率（{result.correct} / {result.total} 問）
            </span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {result.answered} / {result.total}
            </span>
            <span className="stat-label">回答した問題</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatDuration(result.elapsedMs)}</span>
            <span className="stat-label">かかった時間（制限 {formatDuration(result.timeLimitMs)}）</span>
          </div>
          <div className="stat">
            <span className="stat-value">{formatDuration(report.averageMs)}</span>
            <span className="stat-label">1問あたりの平均時間</span>
          </div>
        </div>
        {result.kind !== 'random' && (
          <p className="small">
            {isFirst
              ? `初回の結果として合格準備度に反映されます（基準は 80% 以上）。${pct >= 80 ? '基準を満たしました。' : '基準に届きませんでした。'}`
              : '2回目以降の結果は合格準備度の判定には使いません。'}
          </p>
        )}
        <p className="small muted">本番の換算スコアとは異なります。正答率は目安として使ってください。</p>
      </section>

      <section className="card" aria-labelledby="domain-h">
        <h2 id="domain-h">ドメイン別</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ドメイン</th>
                <th className="num">正解</th>
                <th className="num">正答率</th>
                <th className="bar-cell" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {report.byDomain.map((d) => {
                const p = Math.round((d.correct / Math.max(1, d.total)) * 100);
                return (
                  <tr key={d.domain}>
                    <td>
                      {d.domain}. {domainName(d.domain)}
                    </td>
                    <td className="num">
                      {d.correct} / {d.total}
                    </td>
                    <td className="num">{p}%</td>
                    <td className="bar-cell" aria-hidden="true">
                      <div className={`progress ${p >= 70 ? 'ok' : ''}`}>
                        <span style={{ width: `${p}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="all-h">
        <h2 id="all-h">全問の解説</h2>
        <div className="chips" role="group" aria-label="表示する問題">
          {FILTERS.map(([f, label]) => (
            <label key={f} className="chip">
              <input type="radio" name="result-filter" checked={filter === f} onChange={() => setFilter(f)} />
              {label}
            </label>
          ))}
        </div>
        {rows.length === 0 && <p className="muted">該当する問題はありません。</p>}
        {rows.map(({ questionId, answer, correct, i }) => {
          const q = questions.get(questionId);
          if (!q) {
            return (
              <div key={questionId} className="card small muted">
                問 {i + 1}: この問題（{questionId}）は現在のコンテンツにありません。
              </div>
            );
          }
          const order = optionOrder(result.sessionId, q);
          const flagged = history.flags.get(q.id) ?? false;
          return (
            <details key={questionId} className="card">
              <summary className="row-between" style={{ cursor: 'pointer' }}>
                <span>
                  <span className={`badge ${correct ? 'ok' : 'ng'}`}>{answer ? (correct ? '正解' : '不正解') : '未回答'}</span> 問 {i + 1}{' '}
                  <span className="small muted">タスク {q.taskStatement}</span>
                  {answer?.flagged && <span aria-label="見直しフラグ"> ⚑</span>}
                </span>
                <span className="small muted">{answer ? formatDuration(answer.durationMs) : '—'}</span>
              </summary>
              <AnswerFeedback
                q={q}
                order={order}
                selected={answer?.selected ?? []}
                correct={correct}
                unanswered={!answer}
                {...(answer
                  ? {
                      missReason: history.missReasons.get(answer.eventId) ?? null,
                      onMissReason: (reason) =>
                        void appendEvent({ type: 'miss-reason', questionId: q.id, answerEventId: answer.eventId, reason }),
                    }
                  : {})}
                flagged={flagged}
                onToggleFlag={q.pool === 'practice' ? () => void appendEvent({ type: 'flag', questionId: q.id, flagged: !flagged }) : undefined}
                lessons={lessons}
              />
            </details>
          );
        })}
      </section>
      <div className="btn-row">
        <Link className="btn" to="/mock">
          模擬試験へ戻る
        </Link>
        <Link className="btn" to="/">
          ホームへ
        </Link>
      </div>
    </div>
  );
}
