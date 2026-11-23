// @vitest-environment node
// 構成図のレイアウト（scripts/lib/diagram-layout.mjs）。content/saa-c03/diagrams の見本 3 つで確かめる
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BADGE_R, DESIGN_WIDTH, arrowRects, boxLabelRect, layoutDiagram, layoutDiagramReport, nodeTextRects, sceneCollisions, textWidth,
} from '../../../scripts/lib/diagram-layout.mjs';
import { shortNameOf, categoryKeyOf } from '../../../scripts/lib/diagram.mjs';
import { buildServiceIndex } from '../../../scripts/lib/service-registry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contentDir = path.join(repoRoot, 'content', 'saa-c03');
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(contentDir, ...p), 'utf8'));
const serviceIndex = buildServiceIndex(readJson('blueprint.json'), readJson('services.json'));
const SAMPLES = ['dg-vpc-three-tier', 'dg-sns-sqs-fanout', 'dg-dr-pilot-light'];
const sample = (id) => readJson('diagrams', `${id}.json`);
const layout = (id) => layoutDiagram(sample(id), { serviceIndex });

const EPS = 0.05;
const overlaps = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const contains = (outer, inner) =>
  inner.x >= outer.x - EPS && inner.y >= outer.y - EPS && inner.x + inner.w <= outer.x + outer.w + EPS && inner.y + inner.h <= outer.y + outer.h + EPS;
const onBorder = ([x, y], r) => {
  const inX = x >= r.x - EPS && x <= r.x + r.w + EPS;
  const inY = y >= r.y - EPS && y <= r.y + r.h + EPS;
  const onV = Math.abs(x - r.x) < EPS || Math.abs(x - (r.x + r.w)) < EPS;
  const onH = Math.abs(y - r.y) < EPS || Math.abs(y - (r.y + r.h)) < EPS;
  return (onV && inY) || (onH && inX);
};

/** 入力の木から、親の id → 子の id（並べ枠は透明なので、その子を親の子として数える）と、兄弟の組を作る */
function treeOf(diagram) {
  const siblings = []; // 同じ並びの子（並べ枠の中も含めて、図に出るものの組）
  const parentOf = new Map();
  const visibleIds = (item) => (item.node !== undefined || item.box !== undefined ? [item.id] : (item.children ?? []).flatMap(visibleIds));
  const visit = (item, parentBox) => {
    const kids = item.children ?? [];
    siblings.push(kids.flatMap(visibleIds));
    for (const c of kids) {
      if (c.node !== undefined || c.box !== undefined) parentOf.set(c.id, parentBox);
      visit(c, c.box !== undefined ? c.id : parentBox);
    }
  };
  visit(diagram.root, null);
  return { siblings, parentOf };
}

describe.each(SAMPLES)('%s', (id) => {
  const diagram = sample(id);
  const scene = layout(id);
  const rects = new Map([...scene.boxes, ...scene.nodes].map((r) => [r.id, r]));
  const { siblings, parentOf } = treeOf(diagram);

  it('兄弟どうしの矩形が重ならない', () => {
    for (const group of siblings) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          expect(overlaps(rects.get(group[i]), rects.get(group[j])), `${group[i]} と ${group[j]}`).toBe(false);
        }
      }
    }
  });

  it('子が親の矩形に収まり、すべてが図の中に収まる', () => {
    for (const [child, parent] of parentOf) {
      if (parent) expect(contains(rects.get(parent), rects.get(child)), `${child} が ${parent} の外`).toBe(true);
      expect(contains({ x: 0, y: 0, w: scene.width, h: scene.height }, rects.get(child))).toBe(true);
    }
  });

  it('線の両端が端点の矩形の辺の上にあり、区間は縦か横', () => {
    for (const e of scene.edges) {
      expect(onBorder(e.points[0], rects.get(e.from)), `${e.id} の始点`).toBe(true);
      expect(onBorder(e.points[e.points.length - 1], rects.get(e.to)), `${e.id} の終点`).toBe(true);
      for (let i = 1; i < e.points.length; i++) {
        const [a, b] = [e.points[i - 1], e.points[i]];
        expect(a[0] === b[0] || a[1] === b[1], `${e.id} の区間 ${i}`).toBe(true);
      }
    }
  });

  it(`幅が ${DESIGN_WIDTH} 以下`, () => {
    expect(scene.width).toBeLessThanOrEqual(DESIGN_WIDTH);
  });

  it('同じ入力から同じ出力になる（数値は小数 1 桁まで）', () => {
    expect(layout(id)).toEqual(scene);
    expect(JSON.stringify(layoutDiagram(structuredClone(diagram), { serviceIndex }))).toBe(JSON.stringify(scene));
    const nums = JSON.stringify(scene).match(/-?\d+\.\d+/g) ?? [];
    for (const n of nums) expect(n.split('.')[1].length, n).toBeLessThanOrEqual(1);
  });

  it('線のラベル・札・番号・部品・入れ物のラベルの矩形が互いに交わらない（1px までは許す）', () => {
    const items = [
      ...scene.nodes.map((n) => ({ what: `部品 ${n.id}`, owner: n.id, r: n })),
      ...scene.boxes.map((b) => ({ what: `入れ物のラベル ${b.id}`, owner: b.id, r: b.labelBox })),
      ...scene.edges.filter((e) => e.labelBox).map((e) => ({ what: `線のラベル ${e.id}`, owner: e.id, r: e.labelBox })),
      ...[...scene.boxes, ...scene.nodes].filter((x) => x.tag).map((x) => ({ what: `札 ${x.id}`, owner: x.id, r: x.tag })),
      ...scene.steps.map((st, i) => ({ what: `番号 ${i + 1}`, owner: null, r: { x: st.badgeAt[0] - BADGE_R, y: st.badgeAt[1] - BADGE_R, w: 2 * BADGE_R, h: 2 * BADGE_R } })),
    ];
    const hit = (a, b) =>
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [a, b] = [items[i], items[j]];
        if (a.owner && a.owner === b.owner) continue; // 札と自分の部品
        expect(hit(a.r, b.r), `${a.what} と ${b.what}`).toBe(false);
      }
    }
    for (const x of items) expect(contains({ x: 0, y: 0, w: scene.width, h: scene.height }, x.r), x.what).toBe(true);
  });

  it('レイアウトの警告がない', () => {
    expect(layoutDiagramReport(diagram, { serviceIndex }).warnings).toEqual([]);
  });

  it('段階の数と番号の位置がそろっている', () => {
    expect(scene.steps).toHaveLength(diagram.steps.length);
    for (const s of scene.steps) expect(s.badgeAt).not.toBeNull();
    // 検証状態はレイアウトでは決めない（ビルドが material-status.json から足す）
    expect(scene).not.toHaveProperty('status');
  });
});

describe('dg-vpc-three-tier', () => {
  const scene = layout('dg-vpc-three-tier');
  const box = (id) => scene.boxes.find((b) => b.id === id);
  const edge = (id) => scene.edges.find((e) => e.id === id);

  it('ALB → アプリの線は直線', () => {
    for (const id of ['e4', 'e5']) {
      const e = edge(id);
      expect(e.points, id).toHaveLength(2);
      expect(e.points[0][0]).toBe(e.points[1][0]);
    }
  });

  it('2 つの AZ の高さが同じ', () => {
    expect(box('az-a').h).toBe(box('az-c').h);
    expect(box('az-a').y).toBe(box('az-c').y);
  });

  it('AZ の中の 3 つのサブネットの幅が同じ', () => {
    for (const az of ['a', 'c']) {
      const ws = ['pub', 'pri', 'iso'].map((k) => box(`${k}-${az}`).w);
      expect(new Set(ws).size, `AZ-${az}: ${ws}`).toBe(1);
    }
  });

  it('部品には短い名前と分類の色が付く', () => {
    const node = (id) => scene.nodes.find((n) => n.id === id);
    expect(node('alb-a')).toMatchObject({ short: 'ELB', label: 'ALB', category: 'network' });
    expect(node('nat-a')).toMatchObject({ short: 'NAT', category: 'network' });
    expect(node('igw')).toMatchObject({ short: 'IGW', label: '出入り口', category: 'network' });
    expect(node('internet')).toMatchObject({ short: null, label: 'インターネット', category: 'other' });
    expect(node('db-a')).toMatchObject({ short: 'RDS', category: 'database' });
    expect(box('pub-a').label).toBe('パブリック');
  });
});

describe('浮く要素の決め方', () => {
  it('番号は、前の段階の番号がまだ載っていない線に置く（ファンアウトの 3 と 4 は別の線）', () => {
    const scene = layout('dg-sns-sqs-fanout');
    const e = (id) => scene.edges.find((x) => x.id === id);
    const near = (b, edge) => edge.points.slice(1).some((p, i) => {
      const q = edge.points[i];
      const [x1, x2, y1, y2] = [Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1])];
      const dx = Math.max(x1 - b[0], 0, b[0] - x2);
      const dy = Math.max(y1 - b[1], 0, b[1] - y2);
      return Math.hypot(dx, dy) < 15; // 短い線では、矢じりの横（線から 14）に置く
    });
    expect(near(scene.steps[2].badgeAt, e('e5'))).toBe(true);
    expect(near(scene.steps[3].badgeAt, e('e7'))).toBe(true);
  });

  it('ラベルつきの線が隣どうしを結ぶとき、端の部品の間を「ラベルの幅 + 10」以上にする', () => {
    const scene = layout('dg-sns-sqs-fanout');
    const n = (id) => scene.nodes.find((x) => x.id === id);
    expect(n('topic').x - (n('order').x + n('order').w)).toBeGreaterThanOrEqual(textWidth('発行', 10) + 10);
    const dr = layout('dg-dr-pilot-light');
    const d = (id) => dr.nodes.find((x) => x.id === id);
    expect(d('db-d').x - (d('db-p').x + d('db-p').w)).toBeGreaterThanOrEqual(textWidth('常に複製', 10) + 10);
  });

  it('広げると幅が 328 を超えるときは広げず、diagram-crowded の警告にする', () => {
    const row = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, node: 'ec2' }));
    const d = { ...sample('dg-sns-sqs-fanout'), root: { dir: 'row', children: row }, edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'とても長いラベルです' }], steps: [] };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(scene.width).toBeLessThanOrEqual(DESIGN_WIDTH);
    expect(warnings.map((w) => w.code)).toContain('diagram-crowded');
  });

  it('札を出す入れ物は、ラベルと札が並ぶ幅を取り、札は右上で上の辺をまたぐ', () => {
    const scene = layout('dg-dr-pilot-light');
    const b = scene.boxes.find((x) => x.id === 'region-p');
    expect(b.tag).not.toBeNull();
    expect(b.tag.y).toBeLessThan(b.y);
    expect(b.tag.y + b.tag.h).toBeGreaterThan(b.y);
    const label = b.labelBox;
    expect(b.tag.x).toBeGreaterThanOrEqual(label.x + label.w);
    expect(b.tag.x + b.tag.w).toBeLessThanOrEqual(b.x + b.w);
    // 部品の札（standby・new）は 1 つの矩形に固定
    expect(scene.nodes.find((x) => x.id === 'app-d').tag).not.toBeNull();
  });

  it('同じ辺を指定した回り込みの線も、座標が 0 以上で図の中に収まる', () => {
    const d = {
      ...sample('dg-sns-sqs-fanout'),
      root: { dir: 'row', children: [{ id: 'a', node: 'ec2' }, { id: 'm', node: 'ec2' }, { id: 'b', node: 's3' }] },
      edges: [{ id: 'e1', from: 'a', to: 'b', fromSide: 'top', toSide: 'top', label: '上を回る' }],
      steps: [],
    };
    const scene = layoutDiagram(d, { serviceIndex });
    for (const [x, y] of scene.edges[0].points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(scene.width);
      expect(y).toBeLessThanOrEqual(scene.height);
    }
    const lb = scene.edges[0].labelBox;
    expect(lb.y).toBeGreaterThanOrEqual(0);
    for (const n of scene.nodes) expect(n.y).toBeGreaterThan(0);
  });

  it('同じすき間を通る線が多いときは、ずらす幅を抑えて、すき間の外へ出さない', () => {
    const top = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, node: 'ec2' }));
    const bot = Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, node: 's3' }));
    const edges = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j && edges.length < 12) edges.push({ id: `e${edges.length}`, from: `t${i}`, to: `b${j}` });
    const d = { ...sample('dg-sns-sqs-fanout'), root: { dir: 'col', children: [{ dir: 'row', children: top }, { dir: 'row', children: bot }] }, edges, steps: [] };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    const n = new Map(scene.nodes.map((x) => [x.id, x]));
    for (const e of scene.edges) {
      if (e.points.length < 3) continue;
      const mid = e.points[1][1];
      expect(mid, e.id).toBeGreaterThan(n.get(e.from).y + n.get(e.from).h);
      expect(mid, e.id).toBeLessThan(n.get(e.to).y);
    }
    expect(warnings.map((w) => w.code)).toContain('diagram-crowded');
  });

  it('使えない fromSide・toSide は既定の辺に戻し、diagram-side の警告を出す', () => {
    const d = {
      ...sample('dg-sns-sqs-fanout'),
      root: { dir: 'row', children: [{ id: 'a', node: 'ec2' }, { id: 'b', node: 's3' }] },
      edges: [{ id: 'e1', from: 'a', to: 'b', fromSide: 'left', toSide: 'right' }],
      steps: [],
    };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(warnings.map((w) => w.code)).toEqual(['diagram-side']);
    expect(scene.edges[0].points).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- 重なり（入れ物のラベル、札、線のラベル、番号）

const segRect = ([p, q]) => ({ x: Math.min(p[0], q[0]) - 0.75, y: Math.min(p[1], q[1]) - 0.75, w: Math.abs(p[0] - q[0]) + 1.5, h: Math.abs(p[1] - q[1]) + 1.5 });
const segs = (e) => e.points.slice(1).map((p, i) => [e.points[i], p]);
const grow = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
const cross = (a, b, tol = 0) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
const badgeBox = ([x, y]) => ({ x: x - BADGE_R, y: y - BADGE_R, w: 2 * BADGE_R, h: 2 * BADGE_R });
const borderLines = (b) => [
  { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: 2 }, { x: b.x - 1, y: b.y + b.h - 1, w: b.w + 2, h: 2 },
  { x: b.x - 1, y: b.y - 1, w: 2, h: b.h + 2 }, { x: b.x + b.w - 1, y: b.y - 1, w: 2, h: b.h + 2 },
];

describe.each(SAMPLES)('%s の重なり', (id) => {
  const scene = layout(id);

  it('線と矢じりが、入れ物のラベルを横切らず、2 より近くを通らない', () => {
    for (const b of scene.boxes) {
      const near = grow(b.labelBox, 2);
      for (const e of scene.edges) {
        for (const sg of segs(e)) expect(cross(near, segRect(sg)), `${e.id} と ${b.id} のラベル`).toBe(false);
        for (const a of arrowRects(e)) expect(cross(near, a), `${e.id} の矢じりと ${b.id} のラベル`).toBe(false);
      }
      // ラベルは自分の入れ物の帯の中
      expect(contains({ x: b.x, y: b.y, w: b.w, h: 15 }, b.labelBox), b.id).toBe(true);
    }
  });

  it('状態の札が、どの部品の文字（自分の部品の 2 行目を含む）にも重ならない', () => {
    for (const x of [...scene.boxes, ...scene.nodes].filter((y) => y.tag)) {
      for (const n of scene.nodes) for (const t of nodeTextRects(n)) expect(cross(x.tag, t, 1), `${x.id} の札と ${n.id} の文字`).toBe(false);
    }
  });

  it('線のラベルを、入れ物の枠が横切らない', () => {
    for (const e of scene.edges.filter((x) => x.labelBox)) {
      for (const b of scene.boxes) for (const l of borderLines(b)) expect(cross(e.labelBox, l), `${e.id} のラベルと ${b.id} の枠`).toBe(false);
    }
  });

  it('段階の番号が、入れ物の枠に乗らない', () => {
    scene.steps.forEach((st, i) => {
      for (const b of scene.boxes) for (const l of borderLines(b)) expect(cross(badgeBox(st.badgeAt), l), `番号 ${i + 1} と ${b.id} の枠`).toBe(false);
    });
  });

  it('段階の番号が、どの線の矢じりとも重ならない', () => {
    scene.steps.forEach((st, i) => {
      for (const e of scene.edges) for (const a of arrowRects(e)) expect(cross(badgeBox(st.badgeAt), grow(a, -1), 1), `番号 ${i + 1} と ${e.id} の矢じり`).toBe(false);
    });
  });

  it('重なりの検査（sceneCollisions）の警告がない', () => {
    expect(sceneCollisions(scene)).toEqual([]);
  });
});

describe('重なりの検査（sceneCollisions）', () => {
  const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'diagram-scenes-before');
  const before = (id) => JSON.parse(fs.readFileSync(path.join(fixtureDir, `${id}.json`), 'utf8'));
  const found = (id) => sceneCollisions(before(id)).map((w) => `${w.code} ${w.message}`);

  // 直す前のレイアウトで見本を描いた scene で、検証で指摘された重なりを見つける
  it('3 層の VPC: 線が入れ物のラベルを横切る、線のラベルを AZ の枠が横切る、短い線の番号が矢じりに重なる', () => {
    const w = found('dg-vpc-three-tier');
    expect(w).toContain('diagram-overlap 線 e10 が、入れ物 pub-a のラベル「パブリック」を横切るか、すぐそばを通ります');
    expect(w).toContain('diagram-overlap 線 e10 が、入れ物 vpc のラベル「VPC 10.0.0.0/16」を横切るか、すぐそばを通ります');
    expect(w).toContain('diagram-overlap 線 e5 が、入れ物 pri-c のラベル「プライベート」を横切るか、すぐそばを通ります');
    expect(w).toContain('diagram-crowded 線 e12 のラベル「同期」を、入れ物 az-a の枠が横切るか、枠に近すぎます');
    expect(w).toContain('diagram-crowded 段階 1 の番号が、線 e1 の矢じりに重なります');
  });

  it('パイロットライト: 線がリージョンのラベルを横切る、札が部品の 2 行目に重なる、線のラベルを枠が横切る', () => {
    const w = found('dg-dr-pilot-light');
    expect(w).toContain('diagram-overlap 線 e2 が、入れ物 region-p のラベル「本番のリージョン」を横切るか、すぐそばを通ります');
    expect(w).toContain('diagram-crowded app-d の状態の札が、部品 app-d の文字に重なります');
    expect(w).toContain('diagram-crowded db-d の状態の札が、部品 db-d の文字に重なります');
    expect(w).toContain('diagram-crowded 線 e4 のラベル「常に複製」を、入れ物 region-p の枠が横切るか、枠に近すぎます');
  });

  it('ファンアウト: 短い線の番号が矢じりに重なる', () => {
    expect(found('dg-sns-sqs-fanout')).toEqual([
      'diagram-crowded 段階 3 の番号が、線 e5 の矢じりに重なります',
      'diagram-crowded 段階 4 の番号が、線 e7 の矢じりに重なります',
    ]);
  });

  it('レイアウトの警告にも同じものが入る（validate はこの警告を出す）', () => {
    const d = {
      ...sample('dg-sns-sqs-fanout'),
      root: { dir: 'col', children: [{ id: 'u', node: 'actor' }, { id: 'r', box: 'region', label: 'とても長い名前のリージョン', children: [{ id: 'a', node: 'ec2' }] }] },
      edges: [{ id: 'e1', from: 'u', to: 'a' }],
      steps: [],
    };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    // まっすぐな線は動かさず、ラベルの横にも空きがないので、直せない重なりとして警告する
    expect(scene.edges[0].points).toHaveLength(2);
    expect(warnings).toContainEqual({ code: 'diagram-overlap', message: '線 e1 が、入れ物 r のラベル「とても長い名前のリージョン」を横切るか、すぐそばを通ります' });
  });

  it('線が入れ物の枠に沿って走ると diagram-overlap', () => {
    const scene = {
      boxes: [{ id: 'b', kind: 'group', label: 'まとまり', x: 0, y: 0, w: 100, h: 60, labelBox: { x: 4, y: 1, w: 44, h: 13 }, tag: null }],
      nodes: [],
      edges: [{ id: 'e1', kind: 'request', both: false, points: [[100.5, 20], [100.5, 58]], labelBox: null }],
      steps: [],
    };
    expect(sceneCollisions(scene).map((w) => w.message)).toContain('線 e1 が、入れ物の枠に沿って走ります');
  });

  // 札は段階 1 以降のその段階の印だけ、番号は全体の段階では全部、段階 k では k だけが出る（アプリの stepView）
  const tagScene = (marksAt) => ({
    boxes: [],
    nodes: [
      { id: 'a', x: 0, y: 60, w: 56, h: 42, label: null, parent: null, tag: { x: 30, y: 33, w: 30, h: 14 } },
      { id: 'b', x: 120, y: 60, w: 56, h: 42, label: null, parent: null, tag: { x: 50, y: 33, w: 30, h: 14 } },
    ],
    edges: [],
    steps: [
      { reveal: [], marks: marksAt === 1 ? [{ id: 'a', state: 'standby' }] : [], badgeAt: [100, 10] },
      { reveal: [], marks: [{ id: 'b', state: 'new' }, ...(marksAt === 2 ? [{ id: 'a', state: 'standby' }] : [])], badgeAt: [40, 40] },
    ],
  });

  it('同時に出ない札と番号・札どうしは、重なりにしない', () => {
    // 札 a は段階 1 だけ、番号 2 と札 b は段階 2 だけ
    expect(sceneCollisions(tagScene(1))).toEqual([]);
  });

  it('同じ段階に出る札と番号・札どうしの重なりは、diagram-crowded', () => {
    const w = sceneCollisions(tagScene(2)).map((x) => x.message);
    expect(w).toContain('a の状態の札が、段階 2 の番号に重なります');
    expect(w).toContain('a の状態の札が、b の札に重なります');
  });

  it('まだ出ていない要素とは、札の重なりを調べない', () => {
    const s = tagScene(2);
    // 札 b に重なる札 a を、段階 2 では隠す（段階 3 で出る）。札 a の印も段階 2 にあるが、部品が見えない
    s.steps[1].badgeAt = [150, 10];
    s.steps.push({ reveal: ['a'], marks: [], badgeAt: null });
    expect(sceneCollisions(s).map((x) => x.message).filter((m) => m.includes('b の札'))).toEqual([]);
  });

  it('番号が入れ物の枠に乗ると diagram-crowded', () => {
    const scene = {
      boxes: [{ id: 'g', kind: 'group', label: null, x: 0, y: 0, w: 100, h: 60, parent: null, tag: null }],
      nodes: [],
      edges: [],
      steps: [{ reveal: [], marks: [], badgeAt: [100, 30] }, { reveal: [], marks: [], badgeAt: [50, 30] }],
    };
    expect(sceneCollisions(scene).map((w) => w.message)).toEqual(['段階 1 の番号が、入れ物 g の枠に乗ります']);
  });
});

describe('重なりを避ける配置（境界の小さな図）', () => {
  const base = sample('dg-sns-sqs-fanout');

  it('置き場所のない線のラベルの diagram-crowded は 1 件だけ（重なりの検査の同じ要素の警告をまとめる）', () => {
    const box = (id, nid) => ({ id, box: 'region', label: id, children: [{ id: nid, node: 'ec2' }] });
    const d = {
      ...base,
      root: { dir: 'row', children: [box('r1', 'a'), box('r2', 'b'), box('r3', 'c'), box('r4', 'x')] },
      edges: [{ id: 'e2', from: 'a', to: 'x', label: 'とても長い線のラベルの文字' }],
      steps: [],
    };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(warnings.filter((w) => w.message.startsWith('線 e2 のラベル'))).toHaveLength(1);
    // 重なりの検査だけを回すと、同じラベルについて複数出る
    expect(sceneCollisions(scene).filter((w) => w.message.startsWith('線 e2 のラベル')).length).toBeGreaterThan(1);
  });

  it('隣どうしの入れ物の中の部品を結ぶラベルつきの線: 入れ物の間を広げ、ラベルは枠と枠の間に置く', () => {
    const box = (id, n) => ({ id, box: 'region', label: id === 'r1' ? '東' : '西', children: [{ id: n, node: 'rds' }] });
    const d = { ...base, root: { dir: 'row', children: [box('r1', 'a'), box('r2', 'b')] }, edges: [{ id: 'e1', from: 'a', to: 'b', kind: 'data', label: '常に複製' }], steps: [] };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(warnings).toEqual([]);
    const [r1, r2] = scene.boxes;
    const lb = scene.edges[0].labelBox;
    expect(r2.x - (r1.x + r1.w)).toBeGreaterThanOrEqual(textWidth('常に複製', 10) + 14);
    expect(lb.x).toBeGreaterThan(r1.x + r1.w);
    expect(lb.x + lb.w).toBeLessThan(r2.x);
  });

  it('入れ物のラベルを線が横切るときは、ラベルを帯の中で線の右へずらす', () => {
    const d = {
      ...base,
      root: { dir: 'col', children: [{ id: 'u', node: 'actor' }, { id: 'g', box: 'group', label: 'とても長いラベル', dir: 'row', children: [{ id: 'a', node: 'ec2' }, { id: 'b', node: 'ec2' }] }] },
      edges: [{ id: 'e1', from: 'u', to: 'a' }],
      steps: [],
    };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(warnings).toEqual([]);
    const g = scene.boxes[0];
    const x = scene.edges[0].points.at(-1)[0];
    expect(x).toBeGreaterThan(g.x + 6 + 2); // 左上の既定の位置なら、線がラベルを横切る
    expect(x).toBeLessThan(g.x + 6 + textWidth('とても長いラベル', 10));
    expect(g.labelBox.x).toBeGreaterThan(x);
  });

  it('2 行目の長い部品の札は、2 行目に重ならない位置を選ぶ', () => {
    const d = {
      ...base,
      root: { dir: 'col', children: [{ id: 'g', box: 'group', label: 'とても長い名前のまとまり', children: [{ id: 'a', node: 'ec2', label: 'アプリサーバー' }] }, { id: 'c', node: 's3' }] },
      edges: [{ id: 'e1', from: 'a', to: 'c' }],
      steps: [{ text: '部品が待機していることを示す段階の説明の文です。', focus: ['a'], edges: ['e1'], marks: [{ id: 'a', state: 'standby' }] }],
    };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(warnings).toEqual([]);
    const a = scene.nodes.find((n) => n.id === 'a');
    for (const t of nodeTextRects(a)) expect(cross(a.tag, t, 1)).toBe(false);
  });

  it('隣どうしをつなぐ短い両向きの線: 番号は矢じりの横に置く', () => {
    const d = {
      ...base,
      root: { dir: 'col', children: [{ id: 'a', node: 'internet' }, { id: 'b', node: 'igw' }] },
      edges: [{ id: 'e1', from: 'a', to: 'b', both: true }],
      steps: [{ text: '短い線の段階の番号の置き場所を確かめる説明です。', focus: ['a', 'b'], edges: ['e1'] }],
    };
    const { scene, warnings } = layoutDiagramReport(d, { serviceIndex });
    expect(warnings).toEqual([]);
    for (const a of arrowRects(scene.edges[0])) expect(cross(badgeBox(scene.steps[0].badgeAt), grow(a, -1), 1)).toBe(false);
  });
});

describe('短い名前と色の鍵', () => {
  it('台帳の short、上書き表、末尾の括弧の略称、先頭の Amazon・AWS を取った名前の順に決まる', () => {
    expect(shortNameOf({ id: 'x', name: 'Amazon X', short: 'XX' })).toBe('XX');
    expect(shortNameOf({ id: 'elb', name: 'Elastic Load Balancing' })).toBe('ELB');
    expect(shortNameOf({ id: 'kms', name: 'AWS Key Management Service (AWS KMS)' })).toBe('KMS');
    expect(shortNameOf({ id: 'iam', name: 'AWS Identity and Access Management (IAM)' })).toBe('IAM');
    expect(shortNameOf({ id: 'keyspaces', name: 'Amazon Keyspaces (for Apache Cassandra)' })).toBe('Keyspaces');
    expect(shortNameOf({ id: 's3', name: 'Amazon S3' })).toBe('S3');
  });

  it('分類と語彙から色の鍵を決める', () => {
    expect(categoryKeyOf('lambda', serviceIndex)).toBe('compute');
    expect(categoryKeyOf('sqs', serviceIndex)).toBe('integration');
    expect(categoryKeyOf('vpc-endpoints', serviceIndex)).toBe('network');
    expect(categoryKeyOf('kms', serviceIndex)).toBe('security');
    expect(categoryKeyOf('peering', serviceIndex)).toBe('network');
    expect(categoryKeyOf('key', serviceIndex)).toBe('security');
    expect(categoryKeyOf('actor', serviceIndex)).toBe('other');
  });

  it('文字幅は全角 1.0、それ以外は 0.6（太字 0.64）で見積もる', () => {
    expect(textWidth('あア漢（', 10)).toBe(40);
    expect(textWidth('ab', 10)).toBe(12);
    expect(textWidth('ab', 10, true)).toBeCloseTo(12.8);
  });
});
