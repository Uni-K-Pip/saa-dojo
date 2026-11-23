import { Link } from 'react-router';
import { NOT_COVERED_LINKS, run, type Config } from '../../../../scripts/lib/sims/trace.mjs';
import type { SimIndexEntry, SimScenario } from '../../content/types';
import { SimFlow } from '../SimFlow';
import { TraceResult, summarizeTrace, traceSettings, withStopLabel } from './TraceResult';
import './TraceSimulator.css';

export { TraceExplore } from './TraceExplore';

export function TraceLimitations({ lines }: { lines: string[] }) {
  return (
    <ul>
      {lines.map((line) => {
        const link = Object.hasOwn(NOT_COVERED_LINKS, line) ? NOT_COVERED_LINKS[line] : undefined;
        return (
          <li key={line}>
            {line}{link && <> <Link to={`/lessons/${link.lessonRef}`}>{link.label}</Link></>}
          </li>
        );
      })}
    </ul>
  );
}

function runTrace(config: Config) {
  const result = run(config);
  return result.ok ? { ...result, output: withStopLabel(config, result.output) } : result;
}

export function TraceScenario({ entry, scenario }: { entry: SimIndexEntry; scenario: SimScenario }) {
  return (
    <SimFlow entry={entry} scenario={scenario as SimScenario<Config>} run={runTrace}
      settings={traceSettings} summarize={summarizeTrace} Result={TraceResult}
      limitations={<TraceLimitations lines={entry.notCovered} />} />
  );
}
