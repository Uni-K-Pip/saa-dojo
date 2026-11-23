import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Markdown } from '../components/Markdown';
import type { SimIndexEntry, SimScenario, SimToggle } from '../content/types';
import { appendEvent } from '../db/repo';
import type { NewEvent } from '../domain/events';

export type SettingRow = { key: string; label: string; value: string };

type RunResult<O> = { ok: true; output: O } | { ok: false; error: { message: string } };
type Initial<O> = { output: O; correctChoice: number; correct: boolean };
type Changed<C, O> = { id: string; config: C; output: O; change: string };

interface Props<C extends object, O extends object> {
  entry: SimIndexEntry;
  scenario: SimScenario<C>;
  run: (config: C) => RunResult<O>;
  settings: (config: C) => SettingRow[];
  summarize: (output: O) => string;
  Result: ComponentType<{ config: C; output: O }>;
  limitations: ReactNode;
}

export function SimFlow<C extends object, O extends object>({ entry, scenario, run, settings, summarize, Result, limitations }: Props<C, O>) {
  const { config, predict, toggles, explain } = scenario;
  const [choice, setChoice] = useState<number | null>(null);
  const [initial, setInitial] = useState<Initial<O> | null>(null);
  const [changed, setChanged] = useState<Changed<C, O> | null>(null);
  const [runError, setRunError] = useState('');
  const [saveError, setSaveError] = useState('');
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const firstToggle = useRef<HTMLButtonElement>(null);
  const rows = settings(config);
  useEffect(() => {
    if (initial) resultHeading.current?.focus();
  }, [initial]);

  const record = (event: Pick<Extract<NewEvent, { type: 'sim-run' }>, 'run' | 'choice' | 'correct'>) => {
    setSaveError('');
    void appendEvent({ type: 'sim-run', sim: entry.id, scenarioId: scenario.id, ...event })
      .catch(() => setSaveError('実行の記録を保存できませんでした。'));
  };

  const execute = () => {
    if (initial || choice === null) return;
    const result = run(config);
    if (!result.ok) {
      setRunError(result.error.message);
      return;
    }
    setRunError('');
    const answer = result.output[predict.key as keyof O];
    const correctChoice = predict.choices.findIndex(({ value }) => value === answer);
    const correct = choice === correctChoice;
    setInitial({ output: result.output, correctChoice, correct });
    record({ run: 'initial', choice: choice + 1, correct });
  };

  const toggle = ({ id, set }: SimToggle) => {
    const next = { ...config, ...set };
    const result = run(next);
    if (!result.ok) {
      setRunError(result.error.message);
      return;
    }
    setRunError('');
    const key = Object.keys(set)[0];
    const before = rows.find((row) => row.key === key);
    const after = settings(next).find((row) => row.key === key);
    const change = `${after?.label ?? before?.label ?? key}: ${before?.value ?? '指定なし'} → ${after?.value ?? '指定なし'}`;
    setChanged({ id, config: next, output: result.output, change });
    record({ run: id });
  };

  const resetChanged = () => {
    setChanged(null);
    setRunError('');
    firstToggle.current?.focus();
  };

  const reset = () => {
    setChoice(null);
    setInitial(null);
    setChanged(null);
    setRunError('');
    setSaveError('');
    title.current?.focus();
  };

  return (
    <article className="sim sim-flow">
      <Link to={`/sims/${entry.id}`}>{entry.name}のシナリオ一覧</Link>
      <h1 tabIndex={-1} ref={title}>{scenario.title}</h1>
      {scenario.status === 'pending' && <span className="badge pending">未検証</span>}
      <section className="card">
        <h2>状況</h2>
        <Markdown>{scenario.intro}</Markdown>
        <dl className="sim-settings" aria-label="最初の設定">
          {rows.map(({ key, label, value }) => <div key={key}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <details>
          <summary>このシミュレーターが扱わないこと</summary>
          {limitations}
        </details>
      </section>

      <section className="card inline-check" aria-labelledby="sim-predict">
        <h2 id="sim-predict">予想</h2>
        <Markdown>{predict.text}</Markdown>
        <ul>
          {predict.choices.map(({ text }, i) => (
            <li key={i}>
              <button type="button" className="btn inline-check-option" aria-pressed={choice === i}
                aria-disabled={!!initial || undefined} onClick={() => { if (!initial) setChoice(i); }}>
                {text}
                {choice === i && <span className="badge">あなたの予想</span>}
                {initial?.correctChoice === i && <span className="badge ok">正解</span>}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn primary" disabled={choice === null || !!initial} onClick={execute}>実行する</button>
      </section>

      <div aria-live="polite" aria-atomic="true" className="visually-hidden">
        {initial && (changed
          ? `${changed.change}。${summarize(changed.output)}`
          : `${initial.correct ? '予想どおり' : '予想と違う'}。${summarize(initial.output)}`)}
      </div>

      {initial && (
        <>
          <section className="card">
            <h2 ref={resultHeading} tabIndex={-1}>結果</h2>
            <p className={initial.correct ? 'badge ok' : 'badge ng'}>
              <span aria-hidden="true">{initial.correct ? '✓ ' : '× '}</span>
              {initial.correct ? '予想どおり' : '予想と違う'}
            </p>
            <p>正しい選択肢は「{predict.choices[initial.correctChoice]?.text}」です。</p>
            <Result config={config} output={initial.output} />
          </section>
          <section className="card">
            <h2>理由</h2>
            <Markdown>{explain.initial}</Markdown>
            {scenario.references.length > 0 && (
              <>
                <h3>裏づけ</h3>
                <ul>{scenario.references.map(({ href, title }) => (
                  <li key={href}><Link to={href.slice(1)}>{title}</Link></li>
                ))}</ul>
              </>
            )}
          </section>
          <section className="card">
            <h2>1 か所変えて、もう一度</h2>
            <div className="sim-toggles">
              {toggles.map((item, i) => (
                <button key={item.id} ref={i === 0 ? firstToggle : undefined} type="button" className="btn"
                  aria-pressed={changed?.id === item.id} onClick={() => toggle(item)}>{item.label}</button>
              ))}
            </div>
            {changed && (
              <>
                <p>{changed.change}</p>
                <div className="sim-comparison">
                  <section>
                    <h3>最初の結果</h3>
                    <Result config={config} output={initial.output} />
                  </section>
                  <section>
                    <h3>変更した結果</h3>
                    <Result config={changed.config} output={changed.output} />
                    <Markdown>{explain.toggles[changed.id] ?? ''}</Markdown>
                  </section>
                </div>
                <button type="button" className="btn" onClick={resetChanged}>最初の設定に戻す</button>
              </>
            )}
          </section>
        </>
      )}
      {runError && <p role="alert">{runError}</p>}
      {saveError && <p role="alert">{saveError}</p>}
      {choice !== null && <button type="button" className="btn" onClick={reset}>最初からやり直す</button>}
    </article>
  );
}
