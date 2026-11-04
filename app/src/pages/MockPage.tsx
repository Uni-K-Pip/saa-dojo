// 模擬試験: ランダム模試（演習プールから未回答を優先）と保留模試 A・B
import { use, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { loadQuestionIndex } from '../content/loader';
import { MOCK_SIZES, buildFixedMock, buildRandomMock, firstAttempt, formatDuration, mockResults, timeLimitMsFor } from '../domain/mock';
import { randomRng } from '../domain/rng';
import type { MockKind } from '../domain/events';
import { activeSessions, createMockSession } from '../state/sessions';
import { useStudy } from '../state/study';

const KIND_LABELS: Record<MockKind, string> = { random: 'ランダム模試', mockA: '保留模試 A', mockB: '保留模試 B' };

export default function MockPage() {
  const index = use(loadQuestionIndex());
  const { history, events, settings } = useStudy();
  const navigate = useNavigate();
  const [size, setSize] = useState<number>(65);
  const [busy, setBusy] = useState(false);
  const active = useLiveQuery(async () => (await activeSessions()).filter((s) => s.kind === 'mock'), []);
  const practiceCount = index.filter((q) => q.pool === 'practice').length;
  const results = mockResults(events);

  async function startRandom() {
    if (busy) return;
    setBusy(true);
    const ids = buildRandomMock(index, history, size, randomRng());
    const title = ids.length >= 65 ? 'ランダム模試（本番形式）' : `ランダム模試（${ids.length} 問）`;
    const id = await createMockSession({ mockKind: 'random', title, questionIds: ids, timeLimitMs: timeLimitMsFor(ids.length) });
    navigate(`/mock/session/${id}`);
  }

  async function startFixed(kind: 'mockA' | 'mockB') {
    if (busy) return;
    setBusy(true);
    const ids = buildFixedMock(index, kind, randomRng());
    const id = await createMockSession({ mockKind: kind, title: KIND_LABELS[kind], questionIds: ids, timeLimitMs: timeLimitMsFor(ids.length) });
    navigate(`/mock/session/${id}`);
  }

  const take = Math.min(size, practiceCount);
  return (
    <div>
      <h1>模擬試験</h1>
      {active && active.length > 0 && (
        <div className="notice warn">
          <p>途中の模擬試験があります。</p>
          <ul className="list">
            {active.map((s) => (
              <li key={s.id} className="row-between">
                <span>{s.title}</span>
                <Link className="btn small primary" to={`/mock/session/${s.id}`}>
                  再開
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="card" aria-labelledby="random-h">
        <h2 id="random-h">ランダム模試</h2>
        <p className="small muted">
          演習問題から、まだ解いていない問題を優先して出題します。本番形式はドメイン 1〜4 を 20・17・15・13 問、130 分で解きます。採点は提出後にまとめて行います。
        </p>
        <fieldset>
          <legend>問題数</legend>
          <div className="chips">
            {MOCK_SIZES.map((n) => (
              <label key={n} className="chip">
                <input type="radio" name="mock-size" checked={size === n} onChange={() => setSize(n)} />
                {n === 65 ? '本番形式 65 問' : `ミニ ${n} 問`}（{Math.round(timeLimitMsFor(n) / 60000)} 分）
              </label>
            ))}
          </div>
        </fieldset>
        {practiceCount < size && practiceCount > 0 && (
          <p className="notice warn small">演習問題が {practiceCount} 問しかないため、{take} 問で実施します。</p>
        )}
        <div className="btn-row">
          <button type="button" className="btn primary" disabled={take === 0 || busy} onClick={startRandom}>
            {take > 0 ? `${take} 問で始める` : '演習問題がありません'}
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="fixed-h">
        <h2 id="fixed-h">保留模試 A・B</h2>
        <p className="small muted">
          演習には出てこない本番レベルの問題です。初回の結果が合格準備度の判定に使われます。十分に準備してから、合格準備度の画面で解放してください。
        </p>
        {(['mockA', 'mockB'] as const).map((kind) => {
          const count = index.filter((q) => q.pool === kind).length;
          const unlocked = kind === 'mockA' ? settings.unlockMockA : settings.unlockMockB;
          const first = firstAttempt(events, kind);
          return (
            <div key={kind} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span>
                <strong>{KIND_LABELS[kind]}</strong>（{count} 問）
                {first && (
                  <span className="small muted">
                    {' '}
                    初回 {Math.round((first.correct / Math.max(1, first.total)) * 100)}%
                  </span>
                )}
              </span>
              {!unlocked ? (
                <Link className="btn small" to="/readiness">
                  🔒 合格準備度の画面で解放
                </Link>
              ) : count === 0 ? (
                <span className="small muted">準備中</span>
              ) : (
                <button type="button" className="btn small primary" disabled={busy} onClick={() => startFixed(kind)}>
                  {first ? 'もう一度解く' : '解く'}
                </button>
              )}
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="history-h">
        <h2 id="history-h">これまでの結果</h2>
        {results.length === 0 ? (
          <p className="muted">まだ模擬試験を受けていません。</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>種類</th>
                  <th className="num">正答率</th>
                  <th className="num">時間</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 20).map((r) => (
                  <tr key={r.eventId}>
                    <td>{new Date(r.at).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      {KIND_LABELS[r.kind]}（{r.total} 問）
                    </td>
                    <td className="num">
                      {Math.round((r.correct / Math.max(1, r.total)) * 100)}%（{r.correct}/{r.total}）
                    </td>
                    <td className="num">{formatDuration(r.elapsedMs)}</td>
                    <td>
                      <Link to={`/mock/result/${r.sessionId}`}>結果と解説</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
