// 本文の中の図（Markdown の `![キャプション](#/diagrams/<id>)`）。図が読めないときは何も出さず、本文は残す（設計書 1.2 の 5）。
import { Component, lazy, Suspense, use, useId, type ReactNode } from 'react';
import { loadDiagram } from '../content/loader';

const DiagramView = lazy(() => import('./DiagramView'));
type Props = { id: string; step?: number; caption?: string };

/** 図の取得や描画モジュールの読み込みの失敗を、この図の中だけに閉じ込める */
class DiagramBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadedDiagram({ id, step, caption }: Props) {
  const scene = use(loadDiagram(id));
  const altId = useId();
  if (!scene) return null;
  return (
    <>
      <DiagramView key={id} scene={scene} step={step} caption={caption} altId={altId} />
      <details className="dg-alt">
        <summary>図の内容を文章で読む</summary>
        <p id={altId}>{scene.alt}</p>
      </details>
    </>
  );
}

export function DiagramRef(props: Props) {
  return (
    <DiagramBoundary>
      <Suspense fallback={<p className="small muted">図を読み込んでいます…</p>}>
        <LoadedDiagram {...props} />
      </Suspense>
    </DiagramBoundary>
  );
}
