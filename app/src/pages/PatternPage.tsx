import { use } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { MaterialBadges, MaterialReading, MissingMaterial } from '../components/MaterialReading';
import { loadPattern, loadPatternIndex } from '../content/loader';
import type { PatternMeta } from '../content/types';
import { QUALIFIER_LABELS } from '../domain/labels';
import { patternReadMap } from '../domain/progress';
import { useStudy } from '../state/study';

type PatternQualifier = PatternMeta['qualifiers'][number];
const qualifiers = (Object.keys(QUALIFIER_LABELS) as (PatternQualifier | 'other')[])
  .filter((key) => key !== 'other');

function PatternDetails({ pattern }: { pattern: PatternMeta }) {
  return (
    <>
      {pattern.qualifiers.map((q) => <span className="badge info" key={q}>{QUALIFIER_LABELS[q]}</span>)}
      <span>タスク {pattern.taskStatements.join('、')}</span>
    </>
  );
}

export function PatternsPage() {
  const patterns = use(loadPatternIndex());
  const { events } = useStudy();
  const read = patternReadMap(events);
  const [params, setParams] = useSearchParams();
  const tasks = [...new Set(patterns.flatMap((pattern) => pattern.taskStatements))].sort();
  const services = [...new Set(patterns.flatMap((pattern) => pattern.services))].sort((a, b) => a.localeCompare(b, 'ja'));
  // 選択肢にない URL の値（教材が外れたあとのブックマークなど）は、表示と絞り込みの両方で未指定として扱う
  const pick = (key: string, options: readonly string[]) => {
    const value = params.get(key) ?? '';
    return options.includes(value) ? value : '';
  };
  const qualifier = pick('q', qualifiers);
  const task = pick('task', tasks);
  const service = pick('service', services);
  const filtered = patterns.filter((pattern) =>
    (!qualifier || pattern.qualifiers.some((q) => q === qualifier)) &&
    (!task || pattern.taskStatements.includes(task)) &&
    (!service || pattern.services.includes(service)));

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <article>
      <h1>設計パターン</h1>
      <div className="meta-row">
        <label>判断軸{' '}
          <select value={qualifier} onChange={(event) => updateFilter('q', event.target.value)}>
            <option value="">すべて</option>
            {qualifiers.map((q) => <option key={q} value={q}>{QUALIFIER_LABELS[q]}</option>)}
          </select>
        </label>
        <label>タスク{' '}
          <select value={task} onChange={(event) => updateFilter('task', event.target.value)}>
            <option value="">すべて</option>
            {tasks.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>サービス{' '}
          <select value={service} onChange={(event) => updateFilter('service', event.target.value)}>
            <option value="">すべて</option>
            {services.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <p className="small muted" aria-live="polite">{filtered.length} 件</p>
      {patterns.length === 0 && <p>表示できる設計パターンはまだありません。設計パターンは、検証が済んだものから載せます。</p>}
      {patterns.length > 0 && filtered.length === 0 && <p>条件に当てはまる設計パターンはありません。</p>}
      {filtered.length > 0 && (
        <ul className="list">
          {filtered.map((pattern) => (
            <li key={pattern.id}>
              <Link to={`/patterns/${pattern.id}`}>{pattern.title}</Link>
              <div className="meta-row">
                <PatternDetails pattern={pattern} />
                <MaterialBadges status={pattern.status} readAt={read.get(pattern.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function PatternPage() {
  const { id = '' } = useParams();
  const patterns = use(loadPatternIndex());
  const { events } = useStudy();
  const pattern = patterns.find((entry) => entry.id === id);
  const item = pattern ? use(loadPattern(id)) : null;
  if (!pattern || !item) return <MissingMaterial id={id} label="設計パターン" to="/patterns" />;
  return (
    <MaterialReading
      key={id}
      meta={pattern}
      item={item}
      label="設計パターン"
      to="/patterns"
      details={<PatternDetails pattern={pattern} />}
      readAt={patternReadMap(events).get(id)}
      readEvent={{ type: 'pattern-read', patternId: id }}
    />
  );
}
