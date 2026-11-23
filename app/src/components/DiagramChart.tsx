import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { DecisionFlowNode, DecisionScene, DiagramShape, LayersScene, PositionScene, TimelineScene } from '../content/types';
import { arrowHead } from './Diagram';
import { DiagramFullscreen } from './DiagramFullscreen';
import './DiagramChart.css';

type Chart = DecisionScene | PositionScene | TimelineScene | LayersScene;
type ChartProps<S extends Chart> = { scene: S; caption?: string; altId?: string };

function Shape({ shape, dim }: { shape: DiagramShape; dim: boolean }) {
  const props = { className: `${shape.cls}${dim ? ' is-dim' : ''}`, 'data-owner': shape.owner };
  switch (shape.t) {
    case 'rect':
      return <rect {...props} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} />;
    case 'circle':
      return <circle {...props} cx={shape.cx} cy={shape.cy} r={shape.r} />;
    case 'line': {
      const points = shape.points.map(([x, y]) => `${x},${y}`).join(' ');
      if (!shape.arrow) return <polyline {...props} points={points} />;
      const end = shape.points.length - 1;
      return (
        <g {...props}>
          <polyline points={points} />
          <polygon className="dg-arrow" points={arrowHead(shape.points[end - 1], shape.points[end])} />
        </g>
      );
    }
    case 'text':
      return (
        <text {...props} x={shape.x} y={shape.y} fontSize={shape.size} fontWeight={shape.bold ? 700 : undefined} textAnchor={shape.anchor}>
          {shape.lines.map((line, i) => (
            <tspan key={i} x={shape.x} dy={i === 0 ? 0 : shape.size === 10 ? 13 : 14}>{line}</tspan>
          ))}
        </text>
      );
  }
}

export function ChartSvg({ scene, dimOwners, altId, full = false }: {
  scene: Chart;
  dimOwners?: Set<string>;
  altId?: string;
  full?: boolean;
}) {
  const titleId = useId();
  const ownAltId = useId();
  return (
    <>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={altId ?? ownAltId}
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        style={{ '--dg-w': scene.width } as CSSProperties}
        className={`dg-svg${full ? ' dg-svg--full' : ''}`}
      >
        <title id={titleId}>{scene.title}</title>
        {scene.shapes.map((shape, i) => (
          <Shape key={i} shape={shape} dim={!!shape.owner && !!dimOwners?.has(shape.owner)} />
        ))}
      </svg>
      {altId === undefined && <p id={ownAltId} className="visually-hidden">{scene.alt}</p>}
    </>
  );
}

function ChartFigure({ scene, caption, altId, dimOwners, extra }: ChartProps<Chart> & { dimOwners?: Set<string>; extra?: ReactNode }) {
  return (
    <figure className="dg">
      <DiagramFullscreen
        title={scene.title}
        controls={extra}
        renderFrame={(full, expand) => (
          <div className={`dg-frame${expand ? ' dg-frame-expandable' : ''}`} onClick={expand}>
            <ChartSvg scene={scene} dimOwners={dimOwners} altId={altId} full={full} />
          </div>
        )}
      />
      {caption && <figcaption className="dg-caption">{caption}</figcaption>}
    </figure>
  );
}

const question = (node: DecisionFlowNode) => `Q${node.number} ${node.text}`;

function Branch({ node, nodeFor }: { node: DecisionFlowNode; nodeFor: (id: string) => DecisionFlowNode }) {
  if (node.kind === 'result') {
    return <><strong>{node.text}</strong>{node.why && <p>{node.why}</p>}</>;
  }
  return (
    <>
      {question(node)}
      <ul>
        {node.choices.map(({ label, to }) => (
          <li key={to}>{label} → <Branch node={nodeFor(to)} nodeFor={nodeFor} /></li>
        ))}
      </ul>
    </>
  );
}

export function DecisionDiagram({ scene, ...props }: ChartProps<DecisionScene>) {
  const [following, setFollowing] = useState(false);
  const [path, setPath] = useState([scene.start]);
  const byId = new Map(scene.flow.map((node) => [node.id, node]));
  const nodeFor = (id: string) => byId.get(id)!;
  const current = nodeFor(path[path.length - 1]);
  const dimOwners = following ? new Set(scene.flow.map(({ id }) => id).filter((id) => !path.includes(id))) : undefined;
  return (
    <div>
      <div className="btn-row" role="group" aria-label="選択フローの表示">
        <button type="button" className={`btn small${following ? '' : ' primary'}`} aria-pressed={!following} onClick={() => setFollowing(false)}>全体</button>
        <button type="button" className={`btn small${following ? ' primary' : ''}`} aria-pressed={following} onClick={() => setFollowing(true)}>質問に答えてたどる</button>
      </div>
      {following && (
        <div className="dg-follow" aria-live="polite">
          {path.length > 1 && (
            <ul>
              {path.slice(0, -1).map((id, i) => {
                const node = nodeFor(id);
                const answer = node.choices.find(({ to }) => to === path[i + 1]);
                return <li key={id}>{question(node)} → {answer?.label}</li>;
              })}
            </ul>
          )}
          {current.kind === 'ask' ? (
            <>
              <p>{question(current)}</p>
              <div className="btn-row">
                {current.choices.map(({ label, to }) => (
                  <button key={to} type="button" className="btn small" onClick={() => setPath([...path, to])}>{label}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p><strong>結論: {current.text}</strong></p>
              {current.serviceName && current.serviceName !== current.text && <p className="small muted">サービス: {current.serviceName}</p>}
              <p>{current.why}</p>
              <div className="btn-row">
                <button type="button" className="btn small" onClick={() => setPath(path.slice(0, -1))}>1 つ戻る</button>
                <button type="button" className="btn small" onClick={() => setPath([scene.start])}>最初から</button>
              </div>
            </>
          )}
        </div>
      )}
      <ChartFigure scene={scene} {...props} dimOwners={dimOwners} />
      <details className="dg-all-steps">
        <summary>すべての分かれ道を文章で読む</summary>
        <ul><li><Branch node={nodeFor(scene.start)} nodeFor={nodeFor} /></li></ul>
      </details>
    </div>
  );
}

function PositionLegend({ scene }: { scene: PositionScene }) {
  return (
    <>
      <ol className="dg-position-legend" role="list">
        {scene.legend.map(({ id, n, label, note, category }) => (
          <li key={id}>
            <span className={`dg-position-number dg-cat-${category}`}>{n}</span>
            <span>{label}{note && <span className="small muted">（{note}）</span>}</span>
          </li>
        ))}
      </ol>
      <p className="small muted">位置は順位で、比率ではありません。</p>
    </>
  );
}

export function PositionDiagram({ scene, ...props }: ChartProps<PositionScene>) {
  // 番号だけで描いた項目があるので、全画面の表示にも凡例を出す
  return (
    <div>
      <ChartFigure scene={scene} {...props} extra={<PositionLegend scene={scene} />} />
      <PositionLegend scene={scene} />
    </div>
  );
}

export function TimelineDiagram(props: ChartProps<TimelineScene>) {
  return (
    <div>
      <ChartFigure {...props} />
      <p className="small muted">目盛りは等間隔で、時間の長さの比ではありません。</p>
    </div>
  );
}

export function LayersDiagram(props: ChartProps<LayersScene>) {
  return <ChartFigure {...props} />;
}
