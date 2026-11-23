import { use } from 'react';
import { Link, useParams } from 'react-router';
import { MaterialBadges, MaterialReading, MissingMaterial } from '../components/MaterialReading';
import { loadCourse, loadLab, loadLabIndex } from '../content/loader';
import type { LabMeta, MaterialBody } from '../content/types';
import { labReadMap } from '../domain/progress';
import { useStudy } from '../state/study';

export function LabsPage() {
  const labs = use(loadLabIndex());
  const { events } = useStudy();
  const read = labReadMap(events);
  return (
    <article>
      <h1>ミニラボ</h1>
      {labs.length === 0 ? (
        <p>表示できるミニラボはまだありません。ミニラボは、検証が済んだものから載せます。</p>
      ) : (
        <ul className="list">
          {labs.map((lab) => (
            <li key={lab.id}>
              <Link to={`/labs/${lab.id}`}>{lab.title}</Link>
              <div className="meta-row">
                <span>{lab.unit.toUpperCase()}</span>
                <span>約 {lab.estimatedMinutes} 分</span>
                <MaterialBadges status={lab.status} readAt={read.get(lab.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function LabView({ lab, item }: { lab: LabMeta; item: MaterialBody }) {
  const course = use(loadCourse());
  const { events } = useStudy();
  const unitExists = course?.stages.some(({ units }) => units.some(({ id }) => id === lab.unit));
  return (
    <MaterialReading
      meta={lab}
      item={item}
      label="ミニラボ"
      to="/labs"
      details={(
        <>
          <span>約 {lab.estimatedMinutes} 分</span>
          {unitExists && <Link to={`/course/${lab.unit}`}>{lab.unit.toUpperCase()}</Link>}
        </>
      )}
      readAt={labReadMap(events).get(lab.id)}
      readEvent={{ type: 'lab-read', labId: lab.id }}
    />
  );
}

export default function LabPage() {
  const { id = '' } = useParams();
  const labs = use(loadLabIndex());
  const lab = labs.find((entry) => entry.id === id);
  const item = lab ? use(loadLab(id)) : null;
  return lab && item ? <LabView key={id} lab={lab} item={item} /> : <MissingMaterial id={id} label="ミニラボ" to="/labs" />;
}
