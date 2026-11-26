import { lazy, use } from 'react';
import { Link, useParams } from 'react-router';
import { loadSim, loadSimIndex } from '../content/loader';
import type { SimIndexEntry } from '../content/types';
import { compareEvents, type SimRunEvent } from '../domain/events';
import { useStudy } from '../state/study';
import './SimsPage.css';

// 画面の部品だけを持つ。シミュレーターの名前と説明は、読み込んだ一覧（scripts/lib/sims/index.mjs の SIMULATORS から作る）から取る
const simulators = {
  cidr: {
    Scenario: lazy(() => import('../sims/cidr/CidrSimulator').then((m) => ({ default: m.CidrScenario }))),
    Explore: lazy(() => import('../sims/cidr/CidrSimulator').then((m) => ({ default: m.CidrExplore }))),
    Limitations: lazy(() => import('../sims/cidr/CidrSimulator').then((m) => ({ default: m.CidrLimitations }))),
  },
  trace: {
    Scenario: lazy(() => import('../sims/trace/TraceSimulator').then((m) => ({ default: m.TraceScenario }))),
    Explore: lazy(() => import('../sims/trace/TraceSimulator').then((m) => ({ default: m.TraceExplore }))),
    Limitations: lazy(() => import('../sims/trace/TraceSimulator').then((m) => ({ default: m.TraceLimitations }))),
  },
  iam: {
    Scenario: lazy(() => import('../sims/iam/IamSimulator').then((m) => ({ default: m.IamScenario }))),
    Explore: lazy(() => import('../sims/iam/IamSimulator').then((m) => ({ default: m.IamExplore }))),
    Limitations: lazy(() => import('../sims/iam/IamSimulator').then((m) => ({ default: m.IamLimitations }))),
  },
};

type Simulator = (typeof simulators)[keyof typeof simulators];

function getSimulator(id: string): Simulator | undefined {
  return Object.hasOwn(simulators, id) ? simulators[id as keyof typeof simulators] : undefined;
}

export default function SimsPage() {
  const entries = use(loadSimIndex()).filter(({ scenarios }) => scenarios.length);
  return (
    <article className="sim">
      <h1>シミュレーター</h1>
      {entries.length ? (
        <ul className="list">
          {entries.map(({ id, name, description, scenarios }) => (
            <li key={id}>
              <Link to={`/sims/${id}`}>{name}</Link>
              <p>{description}（シナリオ {scenarios.length} 件）</p>
            </li>
          ))}
        </ul>
      ) : <p>表示できるシミュレーターはまだありません。</p>}
    </article>
  );
}

function SimNotFound({ id, parent }: { id: string; parent?: string }) {
  return (
    <div className="card sim">
      <h1>見つかりません</h1>
      <p>指定された教材（{id}）は表示できません。教材がないか、まだ検証が済んでいないシナリオです。</p>
      <Link className="btn" to={parent ? `/sims/${parent}` : '/sims'}>一覧へ</Link>
    </div>
  );
}

function ScenarioList({ entry }: { entry: SimIndexEntry }) {
  const { events } = useStudy();
  const last = new Map<string, SimRunEvent>();
  const ids = new Set(entry.scenarios.map(({ id }) => id));
  for (const event of events) {
    if (event.type !== 'sim-run' || event.sim !== entry.id || event.run !== 'initial' || !ids.has(event.scenarioId)) continue;
    const previous = last.get(event.scenarioId);
    if (!previous || compareEvents(previous, event) < 0) last.set(event.scenarioId, event);
  }
  return (
    <ul className="list">
      {entry.scenarios.map(({ id, title, status }) => {
        const event = last.get(id);
        return (
          <li key={id}>
            <Link to={`/sims/${entry.id}/${id}`}>{title}</Link>{' '}
            {status === 'pending' && <span className="badge pending">未検証</span>}{' '}
            {event && <span className="badge">実行済み{typeof event.correct === 'boolean' && `（前回は${event.correct ? '予想どおり' : '予想と違う'}）`}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function SimulatorPage() {
  const { sim = '' } = useParams();
  const entry = use(loadSimIndex()).find(({ id }) => id === sim);
  const simulator = getSimulator(sim);
  if (!simulator) return <SimNotFound id={sim} />;
  if (!entry?.scenarios.length) return (
    <article className="sim">
      <h1>{entry?.name ?? 'シミュレーター'}</h1>
      <p>表示できるシナリオはまだありません。</p>
      <Link to="/sims">シミュレーターの一覧へ</Link>
    </article>
  );
  const { Explore, Limitations } = simulator;
  return (
    <article className="sim">
      <Link to="/sims">シミュレーターの一覧</Link>
      <h1>{entry.name}</h1>
      <p>{entry.description}</p>
      <section className="card">
        <h2>このシミュレーターが扱わないこと</h2>
        <Limitations lines={entry.notCovered} />
      </section>
      <section className="card">
        <h2>シナリオ</h2>
        <ScenarioList entry={entry} />
      </section>
      <Explore key={sim} />
    </article>
  );
}

export function SimScenarioPage() {
  const { sim = '', id = '' } = useParams();
  const entry = use(loadSimIndex()).find((entry) => entry.id === sim && entry.scenarios.some((scenario) => scenario.id === id));
  const simulator = getSimulator(sim);
  if (!simulator || !entry) return <SimNotFound id={id} parent={simulator ? sim : undefined} />;
  return <ScenarioContent key={id} entry={entry} id={id} Scenario={simulator.Scenario} />;
}

function ScenarioContent({ entry, id, Scenario }: { entry: SimIndexEntry; id: string; Scenario: Simulator['Scenario'] }) {
  const scenario = use(loadSim(id));
  if (!scenario || scenario.sim !== entry.id) return <SimNotFound id={id} parent={entry.id} />;
  return <Scenario entry={entry} scenario={scenario} />;
}
