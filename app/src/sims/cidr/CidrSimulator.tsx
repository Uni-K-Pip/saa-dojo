import { Link } from 'react-router';
import { run, type Config } from '../../../../scripts/lib/sims/cidr.mjs';
import type { SimIndexEntry, SimScenario } from '../../content/types';
import { SimFlow } from '../SimFlow';
import { CidrResult, cidrSettings, summarizeCidr } from './CidrResult';
import './CidrSimulator.css';

export { CidrExplore } from './CidrExplore';

export function CidrLimitations({ lines }: { lines: string[] }) {
  return (
    <ul>
      {lines.map((line, index) => (
        <li key={line}>
          {line}{index === 2 && <> <Link to="/lessons/lesson-basics-ip-subnet-routing">プライベート IP アドレスの範囲</Link></>}
        </li>
      ))}
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
