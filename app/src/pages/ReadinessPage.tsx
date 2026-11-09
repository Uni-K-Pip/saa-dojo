// 合格準備度: 4つの条件の達成度、ドメイン別の正答率と網羅率、保留模試の解放
import { use, useState } from 'react';
import { Link } from 'react-router';
import { loadBlueprint, loadQuestionIndex } from '../content/loader';
import { appendEvent } from '../db/repo';
import { domainName } from '../domain/blueprint';
import { percent } from '../domain/progress';
import { computeReadiness, type Condition } from '../domain/readiness';
import { useStudy } from '../state/study';

export function ConditionList({ conditions }: { conditions: Condition[] }) {
  return (
    <ul className="list">
      {conditions.map((c) => (
        <li key={c.id}>
          <div className="row-between">
            <span>
              <span className={`badge ${c.achieved ? 'ok' : 'pending'}`}>{c.achieved ? '達成' : '未達'}</span> {c.label}
            </span>
            <span className="small muted">{Math.round(c.progress * 100)}%</span>
          </div>
          <div className={`progress${c.achieved ? ' ok' : ''}`} role="progressbar" aria-label={c.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}>
            <span style={{ width: `${c.progress * 100}%` }} />
          </div>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {c.detail}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function ReadinessPage() {
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const { events, history, settings } = useStudy();
  const [confirming, setConfirming] = useState<'mockA' | 'mockB' | null>(null);
  const r = computeReadiness(events, index, history, blueprint);

  return (
    <div>
      <h1>合格準備度</h1>
      <p className="muted">
        換算スコアは根拠がないため表示しません。次の4つの条件がそろうことを、受験の目安にしてください。
      </p>
      <section className="card" aria-labelledby="cond-h">
        <h2 id="cond-h">
          条件の達成: {r.achievedCount} / {r.conditions.length}
        </h2>
        <ConditionList conditions={r.conditions} />
      </section>

      <section className="card" aria-labelledby="dom-h">
        <h2 id="dom-h">ドメイン別</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ドメイン</th>
                <th className="num">初回正答率</th>
                <th className="num">難易度2〜3</th>
                <th className="num">網羅率</th>
              </tr>
            </thead>
            <tbody>
              {r.domains.map((d) => (
                <tr key={d.domain}>
                  <td>
                    {d.domain}. {domainName(blueprint, d.domain)}
                  </td>
                  <td className="num">{d.allFirst.answered ? `${percent(d.allFirst.correct, d.allFirst.answered)}%（${d.allFirst.answered} 問）` : '—'}</td>
                  <td className="num">{d.hardFirst.answered ? `${percent(d.hardFirst.correct, d.hardFirst.answered)}%（${d.hardFirst.answered} 問）` : '—'}</td>
                  <td className="num">
                    {percent(d.items.covered, d.items.total)}%（{d.items.covered}/{d.items.total}）
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small">
          <Link to="/analysis">弱点分析で詳しく見る</Link>
        </p>
      </section>

      <section className="card" aria-labelledby="unlock-h">
        <h2 id="unlock-h">保留模試の解放</h2>
        <p className="small muted">
          保留模試 A・B は演習に出ない本番レベルの問題で、初回の結果だけが条件 1 の判定に使われます。ほかの条件が達成に近づいてから解放するのがおすすめです。
        </p>
        {r.mocks.map((m) => {
          const unlocked = m.kind === 'mockA' ? settings.unlockMockA : settings.unlockMockB;
          const name = m.kind === 'mockA' ? '保留模試 A' : '保留模試 B';
          return (
            <div key={m.kind} className="row-between" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span>
                <strong>{name}</strong>（{m.available} 問）{m.rate !== null && <span className="small muted"> 初回 {Math.round(m.rate * 100)}%</span>}
              </span>
              {unlocked ? (
                <Link className="btn small primary" to="/mock">
                  解放済み・模擬試験へ
                </Link>
              ) : confirming === m.kind ? (
                <span className="btn-row" style={{ margin: 0 }}>
                  <span className="small">解放しますか？</span>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => {
                      setConfirming(null);
                      void appendEvent({ type: 'setting', key: m.kind === 'mockA' ? 'unlockMockA' : 'unlockMockB', value: true });
                    }}
                  >
                    解放する
                  </button>
                  <button type="button" className="btn small" onClick={() => setConfirming(null)}>
                    やめる
                  </button>
                </span>
              ) : (
                <button type="button" className="btn small" onClick={() => setConfirming(m.kind)} disabled={m.available === 0}>
                  {m.available === 0 ? '準備中' : `🔒 ${name}を解放`}
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
