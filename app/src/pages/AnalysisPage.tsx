// 弱点分析: タスク別・サービス別・判断軸別の正答率と誤答理由の内訳。行から条件付きの演習を開ける
import { use, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { loadBlueprint, loadQuestionIndex } from '../content/loader';
import type { Qualifier } from '../content/types';
import { analyze, type Bucket } from '../domain/analysis';
import { taskIndex } from '../domain/blueprint';
import { MISS_REASON_LABELS, QUALIFIER_LABELS } from '../domain/labels';
import { percent } from '../domain/progress';
import { filterToQuery, type PracticeFilter } from '../domain/selection';
import { useStudy } from '../state/study';
import { catalogPath, type ServiceLinker } from '../domain/catalog';
import { useServiceLinker } from '../state/useContent';

function BucketTable({
  caption,
  rows,
  label,
  filter,
  extra,
}: {
  caption: string;
  rows: Bucket[];
  label: (k: string) => string;
  filter: (k: string) => Partial<PracticeFilter> | null;
  /** 行の末尾に足すリンク（サービス別の図鑑など） */
  extra?: (k: string) => ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th>{caption}</th>
            <th className="num">正答率</th>
            <th className="bar-cell" aria-hidden="true" />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const f = filter(r.key);
            return (
              <tr key={r.key}>
                <td>{label(r.key)}</td>
                <td className="num">
                  {Math.round(r.rate * 100)}%（{r.correct}/{r.attempts}）
                </td>
                <td className="bar-cell" aria-hidden="true">
                  <div className={`progress${r.rate >= 0.7 ? ' ok' : ''}`}>
                    <span style={{ width: `${r.rate * 100}%` }} />
                  </div>
                </td>
                <td>
                  {f && <Link to={`/practice?${filterToQuery(f)}`}>演習</Link>}
                  {extra?.(r.key)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalysisPage() {
  const index = use(loadQuestionIndex());
  const blueprint = use(loadBlueprint());
  const { events, history } = useStudy();
  const [showAllServices, setShowAllServices] = useState(false);
  const { link } = useServiceLinker();
  const a = useMemo(() => analyze(events, index, history), [events, index, history]);
  const tasks = taskIndex(blueprint);

  if (a.attempts === 0) {
    return (
      <div>
        <h1>弱点分析</h1>
        <div className="notice">まだ回答がありません。演習や模擬試験を解くと、ここに正答率が表示されます。</div>
        <Link className="btn primary" to="/practice">
          演習を始める
        </Link>
      </div>
    );
  }
  const services = showAllServices ? a.byService : a.byService.slice(0, 15);
  return (
    <div>
      <h1>弱点分析</h1>
      <p className="muted">
        すべての回答（解き直しを含む）から集計しています。全体の正答率は {percent(a.correct, a.attempts)}%（{a.correct}/{a.attempts}）です。
      </p>

      <section className="card" aria-labelledby="q-h">
        <h2 id="q-h">判断軸別</h2>
        <p className="small muted">問題文の制約語（「最もコスト効率が高い」など）が何を最優先しているか、の別です。</p>
        <BucketTable
          caption="判断軸"
          rows={a.byQualifier}
          label={(k) => QUALIFIER_LABELS[k as Qualifier] ?? k}
          filter={(k) => (k === 'other' ? null : { qualifiers: [k as Qualifier] })}
        />
        <p className="small">
          <Link to="/drill">判断軸ドリルで制約語と設計の対応を鍛える</Link>
        </p>
      </section>

      <section className="card" aria-labelledby="t-h">
        <h2 id="t-h">タスク別</h2>
        <BucketTable
          caption="タスク"
          rows={a.byTask}
          label={(k) => (k === 'basics' ? '基礎講座' : `${k} ${tasks.get(k)?.titleJa ?? ''}`)}
          filter={(k) => (k === 'basics' ? null : { tasks: [k] })}
        />
      </section>

      <section className="card" aria-labelledby="s-h">
        <h2 id="s-h">サービス別（正答率の低い順）</h2>
        <BucketTable caption="サービス" rows={services} label={(k) => k} filter={(k) => ({ services: [k] })} extra={(k) => <CatalogLink name={k} link={link} />} />
        {a.byService.length > 15 && (
          <button type="button" className="btn small" onClick={() => setShowAllServices((v) => !v)}>
            {showAllServices ? '上位 15 件だけ表示' : `すべて表示（${a.byService.length} 件）`}
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="m-h">
        <h2 id="m-h">誤答理由</h2>
        {a.wrong === 0 ? (
          <p>まだ間違えた問題はありません。</p>
        ) : (
          <table className="data">
            <tbody>
              {a.missReasons.map((r) => (
                <tr key={r.reason}>
                  <td>{r.reason === 'unrecorded' ? '未記録' : MISS_REASON_LABELS[r.reason]}</td>
                  <td className="num">
                    {r.count} 回（{percent(r.count, a.wrong)}%）
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="small muted">「読み落とし」が多いときは問題文の制約語に印を付ける練習を、「2択で迷った」が多いときは判断軸ドリルを試してください。</p>
      </section>
    </div>
  );
}

/** サービス別の行から図鑑へ。台帳にない名前には出さない */
function CatalogLink({ name, link }: { name: string; link: ServiceLinker }) {
  const id = link(name);
  return id ? (
    <>
      {' '}
      <Link to={catalogPath(id)} aria-label={`${name} の図鑑`}>
        図鑑
      </Link>
    </>
  ) : null;
}
