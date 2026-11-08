// 判断軸ドリル: 制約語から選ぶべき設計を素早く答える
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { loadQuestionMap } from '../content/loader';
import type { Qualifier } from '../content/types';
import { appendEvent } from '../db/repo';
import { buildDrill, drillSources, type DrillItem } from '../domain/drill';
import { uuid } from '../domain/events';
import { LETTERS } from '../domain/grading';
import { QUALIFIER_LABELS } from '../domain/labels';
import { formatDuration } from '../domain/mock';
import { randomRng } from '../domain/rng';

const FILES = ['practice-d1', 'practice-d2', 'practice-d3', 'practice-d4', 'basics'];
const COUNTS = [10, 20] as const;
const QUALIFIERS: Qualifier[] = ['cost', 'operational', 'availability', 'performance', 'security', 'minimal-change'];

interface Run {
  id: string;
  items: DrillItem[];
  index: number;
  picks: (string | null)[];
  startedAt: number;
}

export default function DrillPage() {
  const questions = use(loadQuestionMap(FILES));
  const sources = useMemo(() => drillSources([...questions.values()]), [questions]);
  const [qualifiers, setQualifiers] = useState<Qualifier[]>([]);
  const [count, setCount] = useState<number>(10);
  const [run, setRun] = useState<Run | null>(null);
  const available = qualifiers.length ? sources.filter((s) => qualifiers.includes(s.qualifier)).length : sources.length;

  function start() {
    const items = buildDrill(sources, count, randomRng(), qualifiers);
    if (items.length === 0) return;
    setRun({ id: uuid(), items, index: 0, picks: items.map(() => null), startedAt: Date.now() });
  }

  if (run) return <DrillRun run={run} setRun={setRun} onRestart={start} />;

  return (
    <div>
      <h1>判断軸ドリル</h1>
      <p className="muted">
        問題の要点から作った短い問題です。「運用負荷を最小に」「コストを抑えて」などの制約を見て、選ぶべき設計を素早く答えます。
      </p>
      {sources.length < 4 ? (
        <div className="notice warn">ドリルを作れる要点がまだ足りません。</div>
      ) : (
        <div className="card">
          <fieldset>
            <legend>判断軸（選ばなければすべて）</legend>
            <div className="chips">
              {QUALIFIERS.map((q) => (
                <label key={q} className="chip">
                  <input
                    type="checkbox"
                    checked={qualifiers.includes(q)}
                    onChange={() => setQualifiers((l) => (l.includes(q) ? l.filter((x) => x !== q) : [...l, q]))}
                  />
                  {QUALIFIER_LABELS[q]}（{sources.filter((s) => s.qualifier === q).length}）
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>問題数</legend>
            <div className="chips">
              {COUNTS.map((n) => (
                <label key={n} className="chip">
                  <input type="radio" name="drill-count" checked={count === n} onChange={() => setCount(n)} />
                  {n} 問
                </label>
              ))}
            </div>
          </fieldset>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={start} disabled={available === 0}>
              {available === 0 ? '該当なし' : `${Math.min(count, available)} 問で始める`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DrillRun({ run, setRun, onRestart }: { run: Run; setRun: (r: Run | null) => void; onRestart: () => void }) {
  const finished = run.index >= run.items.length;
  const recorded = useRef(false);
  const correct = run.items.filter((it, i) => run.picks[i] === it.answer).length;
  const elapsed = useRef(0);

  useEffect(() => {
    if (!finished || recorded.current) return;
    recorded.current = true;
    elapsed.current = Date.now() - run.startedAt;
    void appendEvent({ type: 'drill', sessionId: run.id, correct, total: run.items.length, durationMs: elapsed.current });
  }, [finished, correct, run]);

  if (finished) {
    const missed = run.items.filter((it, i) => run.picks[i] !== it.answer);
    return (
      <div>
        <h1>判断軸ドリルの結果</h1>
        <div className="card">
          <div className="stat">
            <span className="stat-value">
              {correct} / {run.items.length} 問正解
            </span>
            <span className="stat-label">
              所要時間 {formatDuration(elapsed.current || Date.now() - run.startedAt)}（1問あたり{' '}
              {Math.round((elapsed.current || Date.now() - run.startedAt) / 1000 / Math.max(1, run.items.length))} 秒）
            </span>
          </div>
        </div>
        {missed.length > 0 && (
          <section className="card" aria-labelledby="missed-h">
            <h2 id="missed-h">間違えた問題</h2>
            <ul className="list">
              {missed.map((it) => (
                <li key={`${it.questionId}|${it.cue}`}>
                  <span className="badge info">{QUALIFIER_LABELS[it.qualifier]}</span> {it.cue} → <strong>{it.answer}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={onRestart}>
            もう一度
          </button>
          <button type="button" className="btn" onClick={() => setRun(null)}>
            条件を変える
          </button>
          <Link className="btn" to="/analysis">
            弱点分析へ
          </Link>
        </div>
      </div>
    );
  }
  return <DrillStep key={run.index} run={run} setRun={setRun} />;
}

function DrillStep({ run, setRun }: { run: Run; setRun: (r: Run | null) => void }) {
  const item = run.items[run.index]!;
  const pick = run.picks[run.index] ?? null;
  const nextRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  const choose = (c: string) => {
    if (pick !== null) return;
    const picks = [...run.picks];
    picks[run.index] = c;
    setRun({ ...run, picks });
  };
  const next = () => setRun({ ...run, index: run.index + 1 });

  useEffect(() => {
    (pick === null ? firstRef : nextRef).current?.focus({ preventScroll: true });
  }, [pick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (pick === null && n >= 1 && n <= item.choices.length) {
        e.preventDefault();
        choose(item.choices[n - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div>
      <div className="row-between">
        <h1 style={{ margin: 0 }}>判断軸ドリル</h1>
        <span className="muted small">
          {run.index + 1} / {run.items.length} 問
        </span>
      </div>
      <div className="progress" aria-hidden="true" style={{ margin: '8px 0 12px' }}>
        <span style={{ width: `${(run.index / run.items.length) * 100}%` }} />
      </div>
      <div className="card">
        <p className="meta-row">
          <span className="badge info">判断軸 {QUALIFIER_LABELS[item.qualifier]}</span>
        </p>
        <p className="stem">{item.cue}</p>
        <p className="small muted">選ぶべき設計はどれですか。</p>
        <div className="options" role="group" aria-label="選択肢">
          {item.choices.map((c, i) => {
            const state = pick === null ? '' : c === item.answer ? ' is-correct' : c === pick ? ' is-wrong' : '';
            return (
              <button
                key={c}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                className={`option${state}`}
                onClick={() => choose(c)}
                aria-pressed={pick === c}
                disabled={pick !== null && c !== pick && c !== item.answer}
              >
                <span className="option-letter">{LETTERS[i]}.</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>
        {pick !== null && (
          <div className={`result-banner ${pick === item.answer ? 'ok' : 'ng'}`} role="status">
            <span aria-hidden="true">{pick === item.answer ? '◯' : '×'}</span>
            <span>{pick === item.answer ? '正解' : '不正解'}</span>
          </div>
        )}
        <div className="sticky-actions">
          <span className="hint">数字キー 1〜{item.choices.length} でも選べます</span>
          <button ref={nextRef} type="button" className="btn primary" onClick={next} disabled={pick === null}>
            {run.index + 1 >= run.items.length ? '結果を見る' : '次へ'}
          </button>
        </div>
      </div>
    </div>
  );
}
