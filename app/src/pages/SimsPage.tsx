import { lazy, use } from 'react';
import { Link, useParams } from 'react-router';
import { loadSim, loadSimIndex } from '../content/loader';
import type { SimIndexEntry } from '../content/types';
import { compareEvents, type SimRunEvent } from '../domain/events';
import { useStudy } from '../state/study';
import './SimsPage.css';

const CidrScenario = lazy(() => import('../sims/cidr/CidrSimulator').then((m) => ({ default: m.CidrScenario })));
const CidrExplore = lazy(() => import('../sims/cidr/CidrSimulator').then((m) => ({ default: m.CidrExplore })));
const CidrLimitations = lazy(() => import('../sims/cidr/CidrSimulator').then((m) => ({ default: m.CidrLimitations })));

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
  const entry = use(loadSimIndex()).find(({ id, scenarios }) => id === sim && scenarios.length > 0);
  if (sim !== 'cidr') return <SimNotFound id={sim} />;
  if (!entry) return (
    <article className="sim">
      <h1>CIDR とサブネット</h1>
      <p>表示できるシナリオはまだありません。</p>
      <Link to="/sims">シミュレーターの一覧へ</Link>
    </article>
  );
  return (
    <article className="sim">
      <Link to="/sims">シミュレーターの一覧</Link>
      <h1>{entry.name}</h1>
      <p>{entry.description}</p>
      <section className="card">
        <h2>このシミュレーターが扱わないこと</h2>
        <CidrLimitations lines={entry.notCovered} />
      </section>
      <section className="card">
        <h2>シナリオ</h2>
        <ScenarioList entry={entry} />
      </section>
      <CidrExplore key={sim} />
    </article>
  );
}

export function SimScenarioPage() {
  const { sim = '', id = '' } = useParams();
  const entry = use(loadSimIndex()).find((entry) => entry.id === sim && entry.scenarios.some((scenario) => scenario.id === id));
  if (sim !== 'cidr' || !entry) return <SimNotFound id={id} parent={sim === 'cidr' ? sim : undefined} />;
  return <ScenarioContent key={id} entry={entry} id={id} />;
}

function ScenarioContent({ entry, id }: { entry: SimIndexEntry; id: string }) {
  const scenario = use(loadSim(id));
  if (!scenario || scenario.sim !== entry.id) return <SimNotFound id={id} parent={entry.id} />;
  return <CidrScenario entry={entry} scenario={scenario} />;
}
