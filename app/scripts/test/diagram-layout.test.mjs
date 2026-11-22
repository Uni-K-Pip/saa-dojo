// @vitest-environment node
// 構成図のレイアウト（scripts/lib/diagram-layout.mjs）。content/saa-c03/diagrams の見本 3 つで確かめる
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BADGE_R, DESIGN_WIDTH, boxLabelRect, layoutDiagram, layoutDiagramReport, textWidth } from '../../../scripts/lib/diagram-layout.mjs';
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
      ...scene.boxes.map((b) => ({ what: `入れ物のラベル ${b.id}`, owner: b.id, r: boxLabelRect(b) })),
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
    expect(scene.status).toBe('pending');
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
      return Math.hypot(dx, dy) < 10;
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
    const label = boxLabelRect(b);
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
