import { Link } from 'react-router';
import { NOT_COVERED_LINKS, run, type Config } from '../../../../scripts/lib/sims/cidr.mjs';
import type { SimIndexEntry, SimScenario } from '../../content/types';
import { SimFlow } from '../SimFlow';
import { CidrResult, cidrSettings, summarizeCidr } from './CidrResult';
import './CidrSimulator.css';

export { CidrExplore } from './CidrExplore';

export function CidrLimitations({ lines }: { lines: string[] }) {
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

export function CidrScenario({ entry, scenario }: { entry: SimIndexEntry; scenario: SimScenario }) {
  return (
    <SimFlow entry={entry} scenario={scenario as SimScenario<Config>} run={run}
      settings={cidrSettings} summarize={summarizeCidr} Result={CidrResult}
      limitations={<CidrLimitations lines={entry.notCovered} />} />
  );
}
