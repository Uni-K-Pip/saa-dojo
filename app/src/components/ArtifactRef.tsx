// 本文の中の実物（Markdown の `![キャプション](#/artifacts/<id>)`）。実物が読めない・出力から除かれたときは何も出さず、本文は残す（設計書 1.2 の 5）。
import { Component, lazy, Suspense, use, type ReactNode } from 'react';
import { loadArtifact } from '../content/loader';

const ArtifactView = lazy(() => import('./ArtifactView'));
type Props = { id: string; caption?: string };

/** 実物の取得や表示モジュールの読み込みの失敗を、この実物の中だけに閉じ込める */
class ArtifactBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadedArtifact({ id, caption }: Props) {
  const item = use(loadArtifact(id));
  if (!item) return null;
  return (
    <figure className="ar-ref">
      <figcaption>{caption || item.title}</figcaption>
      {caption && caption !== item.title && <p className="small muted">{item.title}</p>}
      <ArtifactView key={item.id} item={item} />
    </figure>
  );
}

export function ArtifactRef(props: Props) {
  return (
    <ArtifactBoundary>
      <Suspense fallback={<p className="small muted">実物を読み込んでいます…</p>}>
        <LoadedArtifact {...props} />
      </Suspense>
    </ArtifactBoundary>
  );
}
