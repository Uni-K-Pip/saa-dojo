// 構成図の描画と段階表示（docs/visual-materials-design.md の 2章・5章・12.2）。
// レイアウトはビルドで済んでいる（scripts/lib/diagram-layout.mjs）。ここは位置の決まった scene を SVG で描くだけ。
// 色は styles.css の --dg-… の変数で、明るい背景と暗い背景の両方に対応する。
import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { DiagramBox, DiagramEdge, DiagramMarkState, DiagramNode, DiagramPoint, DiagramRect, DiagramScene } from '../content/types';

export const MARK_LABELS: Record<DiagramMarkState, string> = { down: '停止', off: '切り離し', standby: '待機', new: '新規', promoted: '昇格' };

const ARROW_LEN = 8;
const ARROW_HALF = 4.5;
const BADGE_R = 7.5;
const EDGE_LABEL_FONT = 10; // scripts/lib/diagram-layout.mjs の EDGE_LABEL_FONT と合わせる

// ---------------------------------------------------------------- 段階ごとの見え方

export interface StepView {
  /** 隠す部品・入れ物・線 */
  hidden: Set<string>;
  /** 薄くする部品・入れ物・線 */
  dim: Set<string>;
  /** 強調する線 */
  active: Set<string>;
  marks: Map<string, DiagramMarkState>;
}

/** 段階 step（0 は全体）での見え方。reveal の要素はその段階より前では隠し、marks はその段階だけに効く */
export function stepView(scene: DiagramScene, step: number): StepView {
  const view: StepView = { hidden: new Set(), dim: new Set(), active: new Set(), marks: new Map() };
  const s = step > 0 ? scene.steps[step - 1] : undefined;
  if (!s) return view;

  const parent = new Map<string, string | null>();
  for (const b of scene.boxes) parent.set(b.id, b.parent);
  for (const n of scene.nodes) parent.set(n.id, n.parent);
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    for (let p = parent.get(id) ?? null; p; p = parent.get(p) ?? null) out.push(p);
    return out;
  };
  const shapes = [...scene.boxes.map((b) => b.id), ...scene.nodes.map((n) => n.id)];

  // 隠す: その段階より後の reveal にあるもの、隠れた入れ物の中身、隠れたものにつながる線
  const revealAt = new Map<string, number>();
  scene.steps.forEach((st, i) => {
    for (const id of st.reveal) if (!revealAt.has(id)) revealAt.set(id, i + 1);
  });
  for (const [id, at] of revealAt) if (at > step) view.hidden.add(id);
  for (const id of shapes) if (ancestors(id).some((a) => view.hidden.has(a))) view.hidden.add(id);
  for (const e of scene.edges) if (view.hidden.has(e.from) || view.hidden.has(e.to)) view.hidden.add(e.id);

  // 薄くする: focus（と、focus の入れ物の中身）以外。focus を含む入れ物は薄くしない
  if (s.focus.length > 0) {
    const focus = new Set(s.focus);
    const lit = new Set<string>();
    for (const id of shapes) {
      const up = ancestors(id);
      if (focus.has(id) || up.some((a) => focus.has(a))) {
        lit.add(id);
        for (const a of up) lit.add(a);
      }
    }
    for (const id of shapes) if (!lit.has(id)) view.dim.add(id);
  }
  for (const e of scene.edges) {
    if (s.edges.includes(e.id)) view.active.add(e.id);
    else view.dim.add(e.id);
  }
  for (const m of s.marks) view.marks.set(m.id, m.state);
  return view;
}

// ---------------------------------------------------------------- 線の形

type P = DiagramPoint;
const dirOf = (a: P, b: P): P => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 折れ線の端を len だけ縮める（矢じりや × を置く場所を空ける） */
function trim(points: P[], atStart: number, atEnd: number): P[] {
  const pts = points.map((p) => [...p] as P);
  if (atEnd > 0 && pts.length >= 2) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const d = dirOf(a, b);
    const len = Math.min(atEnd, Math.hypot(b[0] - a[0], b[1] - a[1]) - 1);
    pts[pts.length - 1] = [b[0] - d[0] * len, b[1] - d[1] * len];
  }
  if (atStart > 0 && pts.length >= 2) {
    const a = pts[1];
    const b = pts[0];
    const d = dirOf(a, b);
    const len = Math.min(atStart, Math.hypot(b[0] - a[0], b[1] - a[1]) - 1);
    pts[0] = [b[0] - d[0] * len, b[1] - d[1] * len];
  }
  return pts;
}

const pathOf = (pts: P[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(p[0])},${r1(p[1])}`).join(' ');

function arrowHead(from: P, tip: P): string {
  const d = dirOf(from, tip);
  const base: P = [tip[0] - d[0] * ARROW_LEN, tip[1] - d[1] * ARROW_LEN];
  const n: P = [-d[1], d[0]];
  const pts: P[] = [tip, [base[0] + n[0] * ARROW_HALF, base[1] + n[1] * ARROW_HALF], [base[0] - n[0] * ARROW_HALF, base[1] - n[1] * ARROW_HALF]];
  return pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
}

function EdgeShape({ edge, className }: { edge: DiagramEdge; className: string }) {
  const pts = edge.points;
  const last = pts.length - 1;
  const blocked = edge.kind === 'blocked';
  const line = trim(pts, edge.both ? ARROW_LEN - 1 : 0, ARROW_LEN - 1);
  const d = pathOf(line);
  const end = line[line.length - 1];
  return (
    <g className={className} data-edge-id={edge.id}>
      {edge.kind === 'data' ? (
        <>
          <path d={d} className="dg-line dg-line-outer" />
          <path d={d} className="dg-line dg-line-inner" />
        </>
      ) : (
        <path d={d} className="dg-line" />
      )}
      {blocked ? (
        <path className="dg-blocked-x" d={`M${r1(end[0] - 4)},${r1(end[1] - 4)} L${r1(end[0] + 4)},${r1(end[1] + 4)} M${r1(end[0] - 4)},${r1(end[1] + 4)} L${r1(end[0] + 4)},${r1(end[1] - 4)}`} />
      ) : (
        <polygon className="dg-arrow" points={arrowHead(pts[last - 1], pts[last])} />
      )}
      {edge.both && <polygon className="dg-arrow" points={arrowHead(pts[1], pts[0])} />}
    </g>
  );
}

// ---------------------------------------------------------------- 印（marks）

// 札の矩形はレイアウトが決める（段階が変わっても動かさない）。文字は札の中央に置く
function MarkTag({ tag, state }: { tag: DiagramRect; state: DiagramMarkState }) {
  return (
    <g className={`dg-tag dg-tag--${state}`}>
      <rect x={tag.x} y={tag.y} width={tag.w} height={tag.h} rx={tag.h / 2} />
      <text x={r1(tag.x + tag.w / 2)} y={r1(tag.y + tag.h / 2 + 3.5)}>
        {MARK_LABELS[state]}
      </text>
    </g>
  );
}

function DownCross({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  // 停止した部品に × を重ねる（色だけに頼らない。入れ物は破線の枠と札で示す）
  const [x1, y1, x2, y2] = [x + 6, y + 8, x + w - 6, y + h - 4];
  return <path className="dg-down-x" d={`M${r1(x1)},${r1(y1)} L${r1(x2)},${r1(y2)} M${r1(x1)},${r1(y2)} L${r1(x2)},${r1(y1)}`} />;
}

// ---------------------------------------------------------------- 本体

export interface DiagramProps {
  scene: DiagramScene;
  /** 段階を固定する（0 は全体）。指定すると操作を隠す */
  step?: number;
  /** 図の下に出す短い説明 */
  caption?: string;
  /** 代替文を出している要素の id（ページ側で出すとき）。なければ図の中に見えない形で代替文を置く */
  altId?: string;
}

export function Diagram({ scene, step: fixedStep, caption, altId }: DiagramProps) {
  const uid = useId();
  const total = scene.steps.length;
  const [current, setCurrent] = useState(0);
  const fixed = fixedStep !== undefined;
  const step = Math.max(0, Math.min(total, fixedStep ?? current));
  const view = stepView(scene, step);
  const go = (n: number) => setCurrent(Math.max(0, Math.min(total, n)));
  const titleId = `${uid}-t`;
  const ownAltId = `${uid}-alt`;
  const hintId = `${uid}-hint`;
  const interactive = !fixed && total > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(step - 1);
    }
  };

  const cls = (id: string, base: string) => {
    const c = [base];
    if (view.dim.has(id)) c.push('is-dim');
    const m = view.marks.get(id);
    if (m) c.push(`is-${m}`);
    return c.join(' ');
  };
  const visible = <T extends { id: string }>(list: T[]) => list.filter((x) => !view.hidden.has(x.id));
  const boxes = [...visible(scene.boxes)].sort((a, b) => a.depth - b.depth);
  const nodes = visible(scene.nodes);
  const edges = visible(scene.edges);
  const marked = [...boxes, ...nodes].filter((x) => view.marks.has(x.id) && x.tag) as (DiagramBox | DiagramNode)[];
  const badges = scene.steps
    .map((s, i) => ({ n: i + 1, at: s.badgeAt }))
    .filter((b) => b.at && (step === 0 || b.n === step)) as { n: number; at: P }[];
  const stepText =
    step === 0
      ? fixed
        ? '全体を表示しています。'
        : `段階 0 / 全 ${total}。全体を表示しています。「次へ」で ${total} つの段階を順に見られます。`
      : `段階 ${step} / 全 ${total}。${scene.steps[step - 1].text}`;

  const atStart = step === 0;
  const atEnd = step === total;

  return (
    <figure className="dg">
      <div
        className="dg-frame"
        role="group"
        aria-label={`図: ${scene.title}`}
        aria-describedby={interactive ? hintId : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={onKeyDown}
      >
        <svg
          className="dg-svg"
          role="img"
          aria-labelledby={titleId}
          aria-describedby={altId ?? ownAltId}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          style={{ '--dg-w': scene.width } as CSSProperties}
        >
          <title id={titleId}>{scene.title}</title>

          {/* 1. 入れ物 */}
          <g className="dg-layer-boxes">
            {boxes.map((b) => (
              <g key={b.id} className={cls(b.id, `dg-box dg-box--${b.kind}`)} data-id={b.id}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.kind === 'region' || b.kind === 'edge' ? 8 : 5} />
                {b.kind === 'asg' && (
                  <text className="dg-asg-mark" x={b.x + b.w - 8} y={b.y + 11}>
                    ±
                  </text>
                )}
              </g>
            ))}
          </g>

          {/* 2. 線 */}
          <g className="dg-layer-edges">
            {edges.map((e) => (
              <EdgeShape
                key={e.id}
                edge={e}
                className={`dg-edge dg-edge--${e.kind}${view.active.has(e.id) ? ' is-active' : ''}${view.dim.has(e.id) ? ' is-dim' : ''}`}
              />
            ))}
          </g>

          {/* 3. 入れ物のラベル（入れ物の地の色で縁取り、線がラベルの後ろで切れて見えるようにする） */}
          <g className="dg-layer-box-labels">
            {boxes.map((b) => (
              <text key={b.id} className={cls(b.id, `dg-box-label dg-box-label--${b.kind}`)} x={b.x + 6} y={b.y + 11}>
                {b.label}
              </text>
            ))}
          </g>

          {/* 4. 部品 */}
          <g className="dg-layer-nodes">
            {nodes.map((n) => (
              <g key={n.id} className={cls(n.id, `dg-node dg-cat-${n.category}`)} data-id={n.id}>
                <rect className="dg-node-body" x={n.x} y={n.y} width={n.w} height={n.h} rx={6} />
                <rect className="dg-node-band" x={n.x} y={n.y} width={n.w} height={5} rx={2} />
                {n.short ? (
                  <>
                    <text className="dg-node-short" x={n.x + n.w / 2} y={n.y + 21}>
                      {n.short}
                    </text>
                    {n.label && (
                      <text className="dg-node-label" x={n.x + n.w / 2} y={n.y + 34}>
                        {n.label}
                      </text>
                    )}
                  </>
                ) : (
                  <text className="dg-node-short" x={n.x + n.w / 2} y={n.y + 27}>
                    {n.label}
                  </text>
                )}
                {view.marks.get(n.id) === 'down' && <DownCross x={n.x} y={n.y} w={n.w} h={n.h} />}
              </g>
            ))}
          </g>

          {/* 5. 線のラベル（背面の矩形つき） */}
          <g className="dg-layer-edge-labels">
            {edges
              .filter((e) => e.label && e.labelBox)
              .map((e) => (
                <g key={e.id} className={`dg-edge-label${view.dim.has(e.id) ? ' is-dim' : ''}`} data-label-for={e.id}>
                  <rect x={e.labelBox!.x} y={e.labelBox!.y} width={e.labelBox!.w} height={e.labelBox!.h} rx={3} />
                  <text x={r1(e.labelBox!.x + e.labelBox!.w / 2)} y={r1(e.labelBox!.y + e.labelBox!.h / 2 + EDGE_LABEL_FONT * 0.35)}>
                    {e.label}
                  </text>
                </g>
              ))}
          </g>

          {/* 6. 状態の札 */}
          <g className="dg-layer-marks">
            {marked.map((x) => (
              <MarkTag key={x.id} tag={x.tag!} state={view.marks.get(x.id)!} />
            ))}
          </g>

          {/* 7. 段階の番号 */}
          <g className="dg-layer-badges">
            {badges.map((b) => (
              <g key={b.n} className="dg-badge">
                <circle cx={b.at[0]} cy={b.at[1]} r={BADGE_R} />
                <text x={b.at[0]} y={b.at[1] + 3.6}>
                  {b.n}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {altId === undefined && (
        <p id={ownAltId} className="visually-hidden">
          {scene.alt}
        </p>
      )}
      {caption && <figcaption className="dg-caption">{caption}</figcaption>}

      {interactive && (
        <>
          <div className="dg-controls" onKeyDown={onKeyDown}>
            <button type="button" className="btn small" aria-disabled={atStart} onClick={() => !atStart && go(step - 1)}>
              前へ
            </button>
            <span className="dg-count">
              {step} / {total}
            </span>
            <button type="button" className="btn small" aria-disabled={atEnd} onClick={() => !atEnd && go(step + 1)}>
              次へ
            </button>
          </div>
          <p id={hintId} className="dg-hint small muted">
            図かボタンを選んでいるときは、左右のキーでも段階を移れます。
          </p>
        </>
      )}
      {total > 0 && (
        <p className="dg-step-text" aria-live="polite">
          {stepText}
        </p>
      )}
      {total > 0 && (
        <details className="dg-all-steps">
          <summary>すべての段階を文章で読む</summary>
          <ol>
            {scene.steps.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ol>
        </details>
      )}
    </figure>
  );
}
