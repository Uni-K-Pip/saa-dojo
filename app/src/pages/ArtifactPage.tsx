// 実物の単独表示（/artifacts/:id）と、試作用の一覧（/artifacts）。メニューには出さない（URL で直接開く）。
// 公開のビルドは検証済みの実物だけを持つ。未検証の実物（「未検証」の札つき）は、開発用のビルド（npm run dev）でだけ見える。
import { use } from 'react';
import { Link, useParams } from 'react-router';
import { ArtifactView } from '../components/ArtifactView';
import { loadArtifact, loadArtifactIndex } from '../content/loader';

export function ArtifactsPage() {
  const list = use(loadArtifactIndex());
  return (
    <article>
      <h1>実物の一覧（試作）</h1>
      {list.length === 0 ? (
        <p>表示できる実物はまだありません。実物は、検証が済んだものから載せます。</p>
      ) : (
        <ul>
          {list.map((a) => (
            <li key={a.id}>
              <Link to={`/artifacts/${a.id}`}>{a.title}</Link> <span className="small muted">{a.kindLabel}</span>{' '}
              {a.status === 'pending' && <span className="badge pending">未検証</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export default function ArtifactPage() {
  const { id = '' } = useParams();
  const item = use(loadArtifact(id));
  if (!item) {
    return (
      <div className="card">
        <h1>見つかりません</h1>
        <p>指定された実物（{id}）は表示できません。実物がないか、まだ検証が済んでいない実物です。</p>
        <Link className="btn" to="/artifacts">
          実物の一覧へ
        </Link>
      </div>
    );
  }
  return (
    <article>
      <p className="small muted" style={{ marginBottom: 0 }}>
        <Link to="/artifacts">実物の一覧</Link>
      </p>
      <h1>{item.title}</h1>
      <ArtifactView key={item.id} item={item} />
    </article>
  );
}
