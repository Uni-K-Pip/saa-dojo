import { Link } from 'react-router';
import { NOT_COVERED_LINKS, run, type Config } from '../../../../scripts/lib/sims/iam.mjs';
import type { SimIndexEntry, SimScenario } from '../../content/types';
import { SimFlow } from '../SimFlow';
import { IamResult, iamSettings, summarizeIam } from './IamResult';
import './IamSimulator.css';

export { IamExplore } from './IamExplore';

export function IamLimitations({ lines }: { lines: string[] }) {
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

export function IamScenario({ entry, scenario }: { entry: SimIndexEntry; scenario: SimScenario }) {
  return (
    <SimFlow entry={entry} scenario={scenario as SimScenario<Config>} run={run}
      settings={iamSettings} summarize={summarizeIam} Result={IamResult}
      limitations={<IamLimitations lines={entry.notCovered} />} />
  );
}
