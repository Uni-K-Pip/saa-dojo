// 図の単独表示（/diagrams/:id）と、試作用の一覧（/diagrams）。メニューには出さない（URL で直接開く）。
// ?step=<番号> で、その段階に止めた図を出す（docs/visual-materials-design.md の 4.8）。
import { use } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DiagramView } from '../components/DiagramView';
import { loadDiagram, loadDiagramIndex } from '../content/loader';
import type { DiagramIndexEntry } from '../content/types';

const DIAGRAM_TYPE_LABELS: Record<DiagramIndexEntry['type'], string> = {
  architecture: '構成図',
  decision: '選択フロー',
  position: '位置づけ図',
  timeline: '時間の図',
  layers: '層の図',
};

export function DiagramsPage() {
  const list = use(loadDiagramIndex());
  return (
    <article>
      <h1>図の一覧（試作）</h1>
      {list.length === 0 ? (
        <p>図はまだありません。</p>
      ) : (
        <ul>
          {list.map((d) => (
            <li key={d.id}>
              <Link to={`/diagrams/${d.id}`}>{d.title}</Link>{' '}
              <span className="small muted">{DIAGRAM_TYPE_LABELS[d.type]}</span>{' '}
              <span className="small muted">{d.steps > 0 ? `段階 ${d.steps}` : '段階なし'}</span>{' '}
              {d.status === 'pending' && <span className="badge pending">未検証</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function DiagramPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const scene = use(loadDiagram(id));
  if (!scene) {
    return (
      <div className="card">
        <h1>見つかりません</h1>
        <p>指定された図（{id}）はありません。</p>
        <Link className="btn" to="/diagrams">
          図の一覧へ
        </Link>
      </div>
    );
  }
  const raw = params.get('step');
  const step = scene.type === 'architecture' && raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}>
        <Link to="/diagrams">図の一覧</Link>
      </p>
      <h1>{scene.title}</h1>
      <p className="meta-row">{scene.status === 'pending' && <span className="badge pending">未検証</span>}</p>
      <DiagramView key={scene.id} scene={scene} step={step} altId="dg-alt" />
      <section className="card" aria-labelledby="dg-alt-h">
        <h2 id="dg-alt-h">図の内容（代替文）</h2>
        <p id="dg-alt">{scene.alt}</p>
      </section>
    </article>
  );
}
