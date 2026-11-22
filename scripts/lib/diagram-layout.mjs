// 構成図のレイアウト（docs/visual-materials-design.md の 2章・4.2・12.2）。
// 書く人は入れ子と並びだけを書き、座標はここで決める。validate の警告とアプリのビルドの両方が使う。依存パッケージなし。
// 同じ入力からは常に同じ出力になる（乱数や Map の挿入順以外の順序に頼らない）。
import { BOX_KINDS, MARK_LABELS, boxLabelOf, categoryKeyOf, nodeTextOf } from './diagram.mjs';

// ---------------------------------------------------------------- 定数（調整はここで）

/** 基準の幅。幅 360px の画面から左右 16px を引いた値。この幅で等倍に描いて文字が読めることを目標にする */
export const DESIGN_WIDTH = 328;
/** 図の外周の余白（枠の線が切れないように） */
const MARGIN = 2;

// 文字幅の見積もり（全角は fontSize × 1.0、それ以外は × 0.6、太字は × 0.64）
const NARROW = 0.6;
const NARROW_BOLD = 0.64;

// 部品
const NODE_H = 42;
const NODE_MIN_W = 56;
const NODE_MAX_W = 104;
const NODE_TEXT_PAD = 10;
const NODE_SHORT_FONT = 11;
const NODE_LABEL_FONT = 10;

// 入れ物
const BOX_PAD = 6;
const BOX_LABEL_H = 15;
const BOX_LABEL_FONT = 10;
const BOX_LABEL_PAD = 12;
const BOX_LABEL_X = 6; // ラベルの左端（入れ物の左の辺から）

// 並べ方の間隔
const GAP_PLAIN = 6;
const GAP_LINKED = 20;
const GAP_PER_EDGE = 5;
const GAP_MAX = 40;

// 線
const CHANNEL_STEP = 5; // 同じすき間を通る線の中間の区間をずらす幅
const STRAIGHTEN_TOLERANCE = 12; // これ未満のずれは、ポートを動かして直線にする
const PORT_EDGE_INSET = 3; // ポートを動かすとき、辺の端からこれだけ内側に収める
const MAX_PERMUTE = 6; // 中間の区間の並びを総当たりで決める本数の上限

// 浮く要素（app/src/components/Diagram.tsx の文字の大きさと合わせる）
const OVERLAP_TOLERANCE = 1; // これ以下の重なりは許す
export const EDGE_LABEL_FONT = 10;
const EDGE_LABEL_H = 13;
const EDGE_LABEL_PAD = 6; // ラベルの背面の矩形の左右の余白の合計
const EDGE_LABEL_GAP = 3; // 線とラベルの間
const LABEL_SPAN_PAD = 10; // 隣どうしを結ぶラベルつきの線で、端の部品どうしに空ける「ラベルの幅 + これ」
export const TAG_FONT = 10;
const TAG_H = 14;
const TAG_PAD = 10;
const TAG_OUT = 6; // 部品の札が角から外へはみ出す量
export const BADGE_R = 7.5;
const BADGE_OFFSET = 9; // 線から番号の中心まで
const BADGE_TIP_GAP = 16; // 矢じりの先から番号の位置まで（矢じり 8px + 8px）

// ---------------------------------------------------------------- 小物

const WIDE_CHAR = /[ᄀ-ᅟ⺀-〾぀-㏿㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏＀-｠￠-￦]/;

/** 文字列の幅の見積もり */
export function textWidth(text, fontSize, bold = false) {
  let w = 0;
  for (const ch of String(text ?? '')) w += WIDE_CHAR.test(ch) ? fontSize : fontSize * (bold ? NARROW_BOLD : NARROW);
  return w;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10 || 0;
const pt = ([x, y]) => [r1(x), r1(y)];
const isVertSide = (s) => s === 'top' || s === 'bottom';
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const cx = (r) => r.x + r.w / 2;
const cy = (r) => r.y + r.h / 2;

// ---------------------------------------------------------------- 木

function buildTree(diagram, serviceIndex) {
  let frameNo = 0;
  const build = (item, parentBox, depth) => {
    if (item.node !== undefined) {
      const text = nodeTextOf(item.node, item.label, serviceIndex);
      const lines = text.short
        ? [textWidth(text.short, NODE_SHORT_FONT, true), text.label ? textWidth(text.label, NODE_LABEL_FONT) : 0]
        : [textWidth(text.label, NODE_SHORT_FONT, true)];
      return {
        type: 'node',
        id: item.id,
        kind: item.node,
        category: categoryKeyOf(item.node, serviceIndex),
        short: text.short,
        label: text.label,
        parentBox,
        w: clamp(Math.max(...lines) + NODE_TEXT_PAD, NODE_MIN_W, NODE_MAX_W),
        h: NODE_H,
      };
    }
    const isBox = item.box !== undefined;
    const d = isBox ? depth + 1 : depth;
    const id = item.id ?? `#frame-${frameNo++}`;
    const el = {
      type: isBox ? 'box' : 'frame',
      id,
      kind: item.box ?? null,
      family: isBox ? (BOX_KINDS[item.box]?.family ?? item.box) : null,
      label: isBox ? boxLabelOf(item.box, item.label) : null,
      dir: item.dir ?? 'col',
      align: item.align ?? 'center',
      depth: d,
      parentBox,
      children: [],
    };
    el.children = (item.children ?? []).map((c) => build(c, isBox ? id : parentBox, d));
    for (const c of el.children) c.up = el;
    return el;
  };
  return build({ children: diagram.root.children, dir: diagram.root.dir, align: diagram.root.align, id: '#root' }, null, 0);
}

function forEachEl(el, fn) {
  fn(el);
  for (const c of el.children ?? []) forEachEl(c, fn);
}

/** el の部分木にある部品・入れ物の id（el 自身を含む。並べ枠の id は含めない） */
function subtreeIds(el, cache) {
  if (cache.has(el)) return cache.get(el);
  const set = new Set();
  if (el.type !== 'frame') set.add(el.id);
  for (const c of el.children ?? []) for (const id of subtreeIds(c, cache)) set.add(id);
  cache.set(el, set);
  return set;
}

// ---------------------------------------------------------------- 間隔と大きさ

function computeGaps(tree, edges) {
  const cache = new Map();
  forEachEl(tree, (el) => {
    if (el.type === 'node') return;
    const sets = el.children.map((c) => subtreeIds(c, cache));
    const indexOf = (id) => sets.findIndex((s) => s.has(id));
    const count = new Array(Math.max(0, el.children.length - 1)).fill(0);
    for (const e of edges) {
      const a = indexOf(e.from);
      const b = indexOf(e.to);
      if (a < 0 || b < 0 || a === b) continue;
      for (let i = Math.min(a, b); i < Math.max(a, b); i++) count[i]++;
    }
    el.gaps = count.map((n) => (n === 0 ? GAP_PLAIN : Math.min(GAP_MAX, GAP_LINKED + GAP_PER_EDGE * (n - 1))));
  });
  // 同じ親の中の同じ種類の入れ物で、並べ方と子の数が同じなら、間隔をそろえる（2 つの AZ の中のサブネットの段をそろえる）
  forEachEl(tree, (el) => {
    if (el.type === 'node') return;
    const groups = new Map();
    for (const c of el.children) {
      if (c.type !== 'box') continue;
      const key = `${c.family}|${c.dir}|${c.children.length}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const merged = list[0].gaps.map((_, i) => Math.max(...list.map((c) => c.gaps[i])));
      for (const c of list) c.gaps = [...merged];
    }
  });
}

function measure(el) {
  if (el.type === 'node') return;
  for (const c of el.children) measure(c);
  const row = el.dir === 'row';
  const main = row ? 'w' : 'h';
  const cross = row ? 'h' : 'w';
  // 同じ種類の入れ物は、交差軸の大きさをそろえる
  const groups = new Map();
  for (const c of el.children) {
    if (c.type !== 'box') continue;
    if (!groups.has(c.family)) groups.set(c.family, []);
    groups.get(c.family).push(c);
  }
  for (const list of groups.values()) {
    const max = Math.max(...list.map((c) => c[cross]));
    for (const c of list) c[cross] = max;
  }
  const contentMain = el.children.reduce((s, c) => s + c[main], 0) + el.gaps.reduce((s, g) => s + g, 0);
  const contentCross = Math.max(0, ...el.children.map((c) => c[cross]));
  el.contentW = row ? contentMain : contentCross;
  el.contentH = row ? contentCross : contentMain;
  if (el.type === 'box') {
    el.w = Math.max(el.contentW + 2 * BOX_PAD, textWidth(el.label, BOX_LABEL_FONT) + BOX_LABEL_PAD, el.minW ?? 0);
    el.h = el.contentH + BOX_LABEL_H + BOX_PAD;
  } else {
    el.w = el.contentW;
    el.h = el.contentH;
  }
}

function place(el, x, y) {
  el.x = x;
  el.y = y;
  if (el.type === 'node') return;
  const inset = el.type === 'box' ? { l: BOX_PAD, t: BOX_LABEL_H, r: BOX_PAD, b: BOX_PAD } : { l: 0, t: 0, r: 0, b: 0 };
  const ix = x + inset.l;
  const iy = y + inset.t;
  const iw = el.w - inset.l - inset.r;
  const ih = el.h - inset.t - inset.b;
  const row = el.dir === 'row';
  const alignOffset = (space) => (el.align === 'start' ? 0 : el.align === 'end' ? space : space / 2);
  // 子のまとまりは、主軸は中央、交差軸は align で置く
  let cursor = row ? ix + (iw - el.contentW) / 2 : iy + (ih - el.contentH) / 2;
  el.children.forEach((c, i) => {
    if (row) place(c, cursor, iy + alignOffset(ih - c.h));
    else place(c, ix + alignOffset(iw - c.w), cursor);
    cursor += (row ? c.w : c.h) + (el.gaps[i] ?? 0);
  });
}

// ---------------------------------------------------------------- 線

// 2 つを含む、いちばん内側の並び（入れ物か並べ枠）
function commonParent(a, b) {
  const seen = new Set();
  for (let p = a; p; p = p.up) seen.add(p);
  for (let p = b; p; p = p.up) if (seen.has(p) && p.type !== 'node') return p;
  return null;
}

// 縦に離れていれば上下の辺、そうでなければ左右の辺。
// 縦にも横にも離れているときは、2 つを含むいちばん内側の並びの向きに合わせる（row なら左右、col なら上下）
function defaultSides(a, b) {
  const below = a.y + a.h <= b.y;
  const above = b.y + b.h <= a.y;
  const right = a.x + a.w <= b.x;
  const left = b.x + b.w <= a.x;
  const vertical = (below || above) && !((right || left) && commonParent(a, b)?.dir === 'row');
  if (vertical) return below ? ['bottom', 'top'] : ['top', 'bottom'];
  if (right) return ['right', 'left'];
  if (left) return ['left', 'right'];
  return cx(a) <= cx(b) ? ['right', 'left'] : ['left', 'right'];
}

function sideCenter(r, side) {
  return isVertSide(side) ? cx(r) : cy(r);
}

function portPoint(r, side, pos) {
  if (side === 'top') return [pos, r.y];
  if (side === 'bottom') return [pos, r.y + r.h];
  if (side === 'left') return [r.x, pos];
  return [r.x + r.w, pos];
}

// 向かい合う辺で、from から to へ外向きに進めるか
function facing(a, s1, b, s2) {
  if (s1 === 'bottom' && s2 === 'top') return a.y + a.h <= b.y;
  if (s1 === 'top' && s2 === 'bottom') return b.y + b.h <= a.y;
  if (s1 === 'right' && s2 === 'left') return a.x + a.w <= b.x;
  if (s1 === 'left' && s2 === 'right') return b.x + b.w <= a.x;
  return false;
}

const inside = (r, [x, y]) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

// 直角の辺の L 字の角。角が両方の矩形の外にあり、どちらの辺からも外向きに出入りできるときだけ返す
function lCorner(a, s1, p1, b, s2, p2) {
  if (isVertSide(s1) === isVertSide(s2)) return null;
  const corner = isVertSide(s1) ? [p1[0], p2[1]] : [p2[0], p1[1]];
  const out = (side, p) =>
    (side === 'top' && corner[1] < p[1]) ||
    (side === 'bottom' && corner[1] > p[1]) ||
    (side === 'left' && corner[0] < p[0]) ||
    (side === 'right' && corner[0] > p[0]);
  if (!out(s1, p1) || !out(s2, p2)) return null;
  if (inside(a, corner) || inside(b, corner)) return null;
  return corner;
}

// 線の中間の区間を置くすき間を探す。orient 'h' は横の区間（y を決める）、'v' は縦の区間（x を決める）
function findChannel(orient, lo, hi, spanLo, spanHi, scene) {
  const blocked = [];
  const h = orient === 'h';
  for (const n of scene.nodes) {
    const overlap = h ? n.x < spanHi + 1 && n.x + n.w > spanLo - 1 : n.y < spanHi + 1 && n.y + n.h > spanLo - 1;
    if (overlap) blocked.push(h ? [n.y, n.y + n.h] : [n.x, n.x + n.w]);
  }
  for (const b of scene.boxes) {
    const overlap = h ? b.x < spanHi && b.x + b.w > spanLo : b.y < spanHi && b.y + b.h > spanLo;
    if (!overlap) continue;
    if (h) {
      blocked.push([b.y - 1, b.y + BOX_LABEL_H]);
      blocked.push([b.y + b.h - 1, b.y + b.h + 1]);
    } else {
      blocked.push([b.x - 1, b.x + 1]);
      blocked.push([b.x + b.w - 1, b.x + b.w + 1]);
    }
  }
  const clipped = blocked
    .map(([s, e]) => [Math.max(s, lo), Math.min(e, hi)])
    .filter(([s, e]) => e > s)
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const free = [];
  let cur = lo;
  for (const [s, e] of clipped) {
    if (s > cur) free.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (hi > cur) free.push([cur, hi]);
  let best = null;
  for (const f of free) if (!best || f[1] - f[0] > best[1] - best[0] + 1e-9) best = f;
  const [a, b] = best ?? [lo, hi];
  return { key: `${orient}:${r1(a)}:${r1(b)}`, mid: (a + b) / 2, width: b - a };
}

function segmentsOf(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push([points[i - 1], points[i]]);
  return out;
}

// 2 つの折れ線の交差の数（直交する区間の交わり。重なって走る区間は 2 と数える）
function crossings(pa, pb) {
  let n = 0;
  const eps = 0.01;
  for (const [a1, a2] of segmentsOf(pa)) {
    for (const [b1, b2] of segmentsOf(pb)) {
      const aH = a1[1] === a2[1];
      const bH = b1[1] === b2[1];
      if (aH !== bH) {
        const [h1, h2, v1, v2] = aH ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
        const x = v1[0];
        const y = h1[1];
        if (x > Math.min(h1[0], h2[0]) + eps && x < Math.max(h1[0], h2[0]) - eps && y > Math.min(v1[1], v2[1]) + eps && y < Math.max(v1[1], v2[1]) - eps) n++;
      } else if (aH && Math.abs(a1[1] - b1[1]) < 0.5) {
        const ov = Math.min(Math.max(a1[0], a2[0]), Math.max(b1[0], b2[0])) - Math.max(Math.min(a1[0], a2[0]), Math.min(b1[0], b2[0]));
        if (ov > 0.5) n += 2;
      } else if (!aH && Math.abs(a1[0] - b1[0]) < 0.5) {
        const ov = Math.min(Math.max(a1[1], a2[1]), Math.max(b1[1], b2[1])) - Math.max(Math.min(a1[1], a2[1]), Math.min(b1[1], b2[1]));
        if (ov > 0.5) n += 2;
      }
    }
  }
  return n;
}

function permutations(n) {
  const out = [];
  const rec = (prefix, rest) => {
    if (rest.length === 0) out.push(prefix);
    rest.forEach((v, i) => rec([...prefix, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  rec([], [...Array(n).keys()]);
  return out;
}

function zPoints(r) {
  const { p1, p2, orient, mid } = r;
  return orient === 'h' ? [p1, [p1[0], mid], [p2[0], mid], p2] : [p1, [mid, p1[1]], [mid, p2[1]], p2];
}

function routeEdges(diagram, scene, rects, warn) {
  const edges = diagram.edges ?? [];
  // 1. 辺を決める
  const routes = edges.map((e, index) => {
    const a = rects.get(e.from);
    const b = rects.get(e.to);
    const def = defaultSides(a, b);
    let s1 = e.fromSide ?? def[0];
    let s2 = e.toSide ?? def[1];
    if (e.fromSide || e.toSide) {
      const p1 = portPoint(a, s1, sideCenter(a, s1));
      const p2 = portPoint(b, s2, sideCenter(b, s2));
      const ok = s1 === s2 || (isVertSide(s1) === isVertSide(s2) ? facing(a, s1, b, s2) : Boolean(lCorner(a, s1, p1, b, s2, p2)));
      if (!ok) {
        // 手がかりの辺では外向きに出入りできない
        warn('diagram-side', `線 ${e.id} の fromSide・toSide（${e.fromSide ?? '-'}・${e.toSide ?? '-'}）では外向きに出入りできないので、既定の辺（${def[0]}・${def[1]}）にしました`);
        [s1, s2] = def;
      }
    }
    return { e, index, a, b, s1, s2 };
  });

  // 2. ポート: 辺ごとに、相手の位置の順に等間隔で並べる
  const ends = new Map();
  for (const r of routes) {
    for (const [which, rect, side, partner] of [['from', r.a, r.s1, r.b], ['to', r.b, r.s2, r.a]]) {
      const key = `${which === 'from' ? r.e.from : r.e.to}|${side}`;
      if (!ends.has(key)) ends.set(key, { rect, side, list: [] });
      ends.get(key).list.push({ r, which, order: sideCenter(partner, side) });
    }
  }
  for (const key of [...ends.keys()].sort()) {
    const { rect, side, list } = ends.get(key);
    list.sort((p, q) => p.order - q.order || p.r.index - q.r.index || (p.which < q.which ? -1 : 1));
    const start = isVertSide(side) ? rect.x : rect.y;
    const len = isVertSide(side) ? rect.w : rect.h;
    list.forEach((x, i) => {
      x.r[x.which === 'from' ? 'pos1' : 'pos2'] = start + (len * (i + 1)) / (list.length + 1);
      x.r[x.which === 'from' ? 'n1' : 'n2'] = list.length;
    });
  }

  // 3. ほぼ一直線の線は、線が 1 本だけの側のポートを動かして直線にする
  const withinSide = (rect, side, pos) => {
    const [lo, hi] = isVertSide(side) ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
    return pos >= lo + PORT_EDGE_INSET && pos <= hi - PORT_EDGE_INSET;
  };
  for (const r of routes) {
    if (!facing(r.a, r.s1, r.b, r.s2)) continue;
    const d = Math.abs(r.pos1 - r.pos2);
    if (d === 0 || d >= STRAIGHTEN_TOLERANCE) continue;
    if (r.n1 === 1 && withinSide(r.a, r.s1, r.pos2)) r.pos1 = r.pos2;
    else if (r.n2 === 1 && withinSide(r.b, r.s2, r.pos1)) r.pos2 = r.pos1;
  }

  // 4. 経路
  for (const r of routes) {
    r.p1 = portPoint(r.a, r.s1, r.pos1);
    r.p2 = portPoint(r.b, r.s2, r.pos2);
    if (r.s1 === r.s2) {
      // 同じ向きの辺どうし（手がかりで指定したとき）: 外へ出て回り込む
      const out = { top: Math.min(r.a.y, r.b.y) - 10, bottom: Math.max(r.a.y + r.a.h, r.b.y + r.b.h) + 10, left: Math.min(r.a.x, r.b.x) - 10, right: Math.max(r.a.x + r.a.w, r.b.x + r.b.w) + 10 }[r.s1];
      r.points = isVertSide(r.s1) ? [r.p1, [r.p1[0], out], [r.p2[0], out], r.p2] : [r.p1, [out, r.p1[1]], [out, r.p2[1]], r.p2];
    } else if (isVertSide(r.s1) === isVertSide(r.s2)) {
      const vert = isVertSide(r.s1);
      const aligned = vert ? r.p1[0] === r.p2[0] : r.p1[1] === r.p2[1];
      if (aligned) r.points = [r.p1, r.p2];
      else {
        r.orient = vert ? 'h' : 'v';
        const [lo, hi] = vert ? [Math.min(r.p1[1], r.p2[1]), Math.max(r.p1[1], r.p2[1])] : [Math.min(r.p1[0], r.p2[0]), Math.max(r.p1[0], r.p2[0])];
        const [sLo, sHi] = vert ? [Math.min(r.p1[0], r.p2[0]), Math.max(r.p1[0], r.p2[0])] : [Math.min(r.p1[1], r.p2[1]), Math.max(r.p1[1], r.p2[1])];
        const ch = findChannel(r.orient, lo, hi, sLo, sHi, scene);
        r.channel = ch.key;
        r.mid = ch.mid;
        r.channelWidth = ch.width;
        r.points = zPoints(r);
      }
    } else {
      const corner = lCorner(r.a, r.s1, r.p1, r.b, r.s2, r.p2);
      if (corner) r.points = [r.p1, corner, r.p2];
      else {
        // 角が矩形の中に入る: 既定の辺の Z 字に戻す
        const [s1, s2] = defaultSides(r.a, r.b);
        if (r.e.fromSide || r.e.toSide) warn('diagram-side', `線 ${r.e.id} の fromSide・toSide では角が部品の中に入るので、既定の辺（${s1}・${s2}）にしました`);
        r.s1 = s1;
        r.s2 = s2;
        r.p1 = portPoint(r.a, s1, sideCenter(r.a, s1));
        r.p2 = portPoint(r.b, s2, sideCenter(r.b, s2));
        const vert = isVertSide(s1);
        if (vert ? r.p1[0] === r.p2[0] : r.p1[1] === r.p2[1]) r.points = [r.p1, r.p2];
        else {
          r.orient = vert ? 'h' : 'v';
          r.mid = vert ? (r.p1[1] + r.p2[1]) / 2 : (r.p1[0] + r.p2[0]) / 2;
          r.points = zPoints(r);
        }
      }
    }
  }

  // 5. 同じすき間を通る中間の区間を 5px ずつずらす。並びは交差が最も少ないものを選ぶ
  const channels = new Map();
  for (const r of routes) {
    if (!r.channel) continue;
    if (!channels.has(r.channel)) channels.set(r.channel, []);
    channels.get(r.channel).push(r);
  }
  for (const key of [...channels.keys()].sort()) {
    const group = channels.get(key);
    if (group.length < 2) continue;
    const base = group[0].mid;
    // ずらす幅は min(5, すき間の幅 / (本数 + 1))。足りなければ警告
    const room = group[0].channelWidth / (group.length + 1);
    const step = Math.min(CHANNEL_STEP, room);
    if (room < CHANNEL_STEP) warn('diagram-crowded', `線 ${group.map((r) => r.e.id).join('・')} が同じ狭いすき間を通ります。部品の間を広げるか、線を減らしてください`);
    const offsets = group.map((_, k) => (k - (group.length - 1) / 2) * step);
    const others = routes.filter((r) => !group.includes(r));
    const orders = group.length <= MAX_PERMUTE ? permutations(group.length) : [[...group.keys()]];
    let best = null;
    for (const order of orders) {
      const pts = group.map((r, i) => zPoints({ ...r, mid: base + offsets[order[i]] }));
      let n = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) n += crossings(pts[i], pts[j]);
        for (const o of others) n += crossings(pts[i], o.points);
      }
      if (!best || n < best.n) best = { n, pts };
    }
    group.forEach((r, i) => {
      r.points = best.pts[i];
    });
  }
  return routes;
}

// ---------------------------------------------------------------- 浮く要素（線のラベル・状態の札・段階の番号）の配置

const rect = (x, y, w, h) => ({ x, y, w, h });
const centered = (cxv, cyv, w, h) => rect(cxv - w / 2, cyv - h / 2, w, h);

// 重なりの面積。1px までの重なりは許す
function overlapArea(a, b) {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix <= OVERLAP_TOLERANCE || iy <= OVERLAP_TOLERANCE ? 0 : ix * iy;
}

// 図の範囲からはみ出す面積（1px までは許す）
function outsideArea(r, bounds) {
  const ix = Math.max(0, Math.min(r.x + r.w, bounds.x + bounds.w) - Math.max(r.x, bounds.x));
  const iy = Math.max(0, Math.min(r.y + r.h, bounds.y + bounds.h) - Math.max(r.y, bounds.y));
  const out = r.w * r.h - ix * iy;
  return r.w - ix <= OVERLAP_TOLERANCE && r.h - iy <= OVERLAP_TOLERANCE ? 0 : out;
}

/**
 * 候補の矩形を順に試し、障害物と交わらない最初のものを採る。
 * hard（部品・ラベルなど）と交わらず soft（線）とも交わらない候補 → hard とだけ交わらない候補 → hard との重なりが最小の候補、の順。
 * 戻り値: { cand, ok }（ok=false は、どの候補も hard と交わった）
 */
function chooseSpot(cands, hard, soft, bounds) {
  const hardArea = (r) => hard.reduce((s, o) => s + overlapArea(r, o), 0) + outsideArea(r, bounds);
  const softHit = (r) => soft.some((o) => overlapArea(r, o) > 0);
  let firstHardFree = null;
  let best = null;
  for (const c of cands) {
    const a = hardArea(c.rect);
    if (a === 0) {
      if (!softHit(c.rect)) return { cand: c, ok: true };
      if (!firstHardFree) firstHardFree = c;
    }
    if (!best || a < best.a - 1e-9) best = { a, c };
  }
  if (firstHardFree) return { cand: firstHardFree, ok: true };
  return { cand: best.c, ok: false };
}

// 線の区間を、ごく細い矩形にする（soft の障害物）
function lineRects(points) {
  return segmentsOf(points).map(([a, b]) => rect(Math.min(a[0], b[0]) - 1, Math.min(a[1], b[1]) - 1, Math.abs(a[0] - b[0]) + 2, Math.abs(a[1] - b[1]) + 2));
}

// 長い区間から順（同じ長さなら前から）
function segmentsByLength(points) {
  return segmentsOf(points)
    .map((s, i) => ({ s, i, len: Math.abs(s[0][0] - s[1][0]) + Math.abs(s[0][1] - s[1][1]) }))
    .sort((p, q) => q.len - p.len || p.i - q.i)
    .map((x) => x.s);
}

/** 入れ物のラベルの矩形（描画の位置と合わせる） */
export function boxLabelRect(b) {
  return rect(b.x + BOX_LABEL_X - 2, b.y + 1, textWidth(b.label, BOX_LABEL_FONT) + 4, BOX_LABEL_H - 2);
}

/** 状態の札の幅 */
export const tagWidth = (state) => textWidth(MARK_LABELS[state], TAG_FONT, true) + TAG_PAD;

function placeFloats(scene, diagram, warn) {
  const steps = diagram.steps ?? [];
  const nodes = scene.nodes;
  const bounds = scene.bounds;
  const nodeRects = nodes.map((n) => ({ id: n.id, r: rect(n.x, n.y, n.w, n.h) }));
  // (1) 入れ物のラベル（固定）。あとのものは、先に決まったもの全部を障害物にする
  const placed = scene.boxes.filter((b) => b.label).map((b) => boxLabelRect(b));
  const hardFor = (exceptNode = null) => [...nodeRects.filter((x) => x.id !== exceptNode).map((x) => x.r), ...placed];
  const linesOf = (exceptEdge = null) => scene.edges.filter((e) => e.id !== exceptEdge).flatMap((e) => lineRects(e.points));

  // (2) 線のラベル: 長い区間から順に、横の区間なら中央の上・下、縦の区間なら中央の右・左。線から 3px 離す
  for (const e of scene.edges) {
    if (!e.label) continue;
    const w = textWidth(e.label, EDGE_LABEL_FONT) + EDGE_LABEL_PAD;
    const h = EDGE_LABEL_H;
    const cands = [];
    for (const [a, b] of segmentsByLength(e.points)) {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (a[1] === b[1]) {
        cands.push({ rect: centered(m[0], m[1] - EDGE_LABEL_GAP - h / 2, w, h) });
        cands.push({ rect: centered(m[0], m[1] + EDGE_LABEL_GAP + h / 2, w, h) });
      } else {
        cands.push({ rect: centered(m[0] + EDGE_LABEL_GAP + w / 2, m[1], w, h) });
        cands.push({ rect: centered(m[0] - EDGE_LABEL_GAP - w / 2, m[1], w, h) });
      }
    }
    const pick = chooseSpot(cands, hardFor(), linesOf(e.id), bounds);
    if (!pick.ok) warn('diagram-crowded', `線 ${e.id} のラベル「${e.label}」を置く場所が空いていません。ラベルを短くするか、線の両端の部品の間を広げてください`);
    e.labelBox = pick.cand.rect;
    e.labelAt = [pick.cand.rect.x + w / 2, pick.cand.rect.y + h / 2];
    placed.push(pick.cand.rect);
  }

  // (3) 状態の札。入れ物は右上で上の辺をまたぐ位置に固定。部品は右上 → 右下 → 左上 → 左下（全部そろえられる角があればそろえる）
  const tagW = marksWidth(diagram);
  for (const b of scene.boxes) {
    if (!tagW.has(b.id)) continue;
    const tw = tagW.get(b.id);
    b.tag = rect(b.x + b.w - tw - BOX_PAD, b.y - TAG_H / 2, tw, TAG_H);
    const hit = hardFor().reduce((s, o) => s + overlapArea(b.tag, o), 0) + outsideArea(b.tag, bounds);
    if (hit > 0) warn('diagram-crowded', `入れ物 ${b.id} の状態の札が、ほかのラベルや部品と重なります。入れ物の上に間を空けるか、ラベルを短くしてください`);
    placed.push(b.tag);
  }
  const marked = nodes.filter((n) => tagW.has(n.id));
  const corner = (n, c) => {
    const tw = tagW.get(n.id);
    const x = c[1] === 'R' ? n.x + n.w - tw + TAG_OUT : n.x - TAG_OUT;
    const y = c[0] === 'T' ? n.y - TAG_H / 2 : n.y + n.h - TAG_H / 2;
    return rect(x, y, tw, TAG_H);
  };
  const CORNERS = ['TR', 'BR', 'TL', 'BL'];
  const uniform = CORNERS.find((c) => {
    const rs = marked.map((n) => corner(n, c));
    return marked.every((n, i) => {
      const others = rs.filter((_, j) => j !== i);
      return [...hardFor(n.id), ...others].every((o) => overlapArea(rs[i], o) === 0) && outsideArea(rs[i], bounds) === 0;
    });
  });
  for (const n of marked) {
    const cands = (uniform ? [uniform] : CORNERS).map((c) => ({ rect: corner(n, c) }));
    const pick = chooseSpot(cands, hardFor(n.id), [], bounds);
    if (!pick.ok) warn('diagram-crowded', `部品 ${n.id} の状態の札を置く場所が空いていません。隣の部品との間を広げてください`);
    n.tag = pick.cand.rect;
    placed.push(n.tag);
  }

  // (4) 段階の番号: 前の段階の番号がまだ載っていない最初の線。長い区間の 50%・30%・70% の両側。矢じりの端から離す
  const edgesById = new Map(scene.edges.map((e) => [e.id, e]));
  const used = new Set();
  const badgeCands = (e) => {
    const tips = [e.points[e.points.length - 1], ...(e.both ? [e.points[0]] : [])];
    const near = [];
    const far = [];
    for (const [a, b] of segmentsByLength(e.points)) {
      for (const t of [0.5, 0.3, 0.7]) {
        const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const sides = a[0] === b[0] ? [[BADGE_OFFSET, 0], [-BADGE_OFFSET, 0]] : [[0, -BADGE_OFFSET], [0, BADGE_OFFSET]];
        const ok = tips.every((p) => Math.hypot(p[0] - m[0], p[1] - m[1]) >= BADGE_TIP_GAP);
        for (const [dx, dy] of sides) (ok ? near : far).push({ rect: centered(m[0] + dx, m[1] + dy, 2 * BADGE_R, 2 * BADGE_R), own: e.id });
      }
    }
    return [...near, ...far];
  };
  const shapeById = new Map([...scene.boxes, ...scene.nodes].map((x) => [x.id, x]));
  return steps.map((s, i) => {
    const ids = (s.edges ?? []).filter((id) => edgesById.has(id));
    const firstId = ids.find((id) => !used.has(id)) ?? ids[0];
    let cands = [];
    if (firstId) {
      cands = badgeCands(edgesById.get(firstId));
      for (const id of ids) if (id !== firstId) cands.push(...badgeCands(edgesById.get(id)));
    } else {
      // 線のない段階: 最初の focus の要素の角（右上 → 右下 → 左下 → 左上。内側を先に）
      const f = (s.focus ?? []).map((id) => shapeById.get(id)).find(Boolean);
      if (f) {
        const inset = BADGE_R + 3;
        const pts = [
          [f.x + f.w - inset, f.y + inset], [f.x + f.w, f.y],
          [f.x + f.w - inset, f.y + f.h - inset], [f.x + f.w, f.y + f.h],
          [f.x + inset, f.y + f.h - inset], [f.x, f.y + f.h],
          [f.x + inset, f.y + inset], [f.x, f.y],
        ];
        cands = pts.map(([x, y]) => ({ rect: centered(x, y, 2 * BADGE_R, 2 * BADGE_R), own: null }));
      }
    }
    if (cands.length === 0) return null;
    const pick = chooseSpot(cands, hardFor(), linesOf(null), bounds);
    if (!pick.ok) warn('diagram-crowded', `段階 ${i + 1} の番号を置く場所が空いていません。その段階の線を長くするか、まわりの部品の間を広げてください`);
    if (pick.cand.own) used.add(pick.cand.own);
    placed.push(pick.cand.rect);
    return [pick.cand.rect.x + BADGE_R, pick.cand.rect.y + BADGE_R];
  });
}

/** 要素 id → その要素に出る状態の札の最大の幅 */
function marksWidth(diagram) {
  const tagW = new Map();
  for (const s of diagram.steps ?? []) for (const m of s.marks ?? []) tagW.set(m.id, Math.max(tagW.get(m.id) ?? 0, tagWidth(m.state)));
  return tagW;
}

// ---------------------------------------------------------------- 本体

// 2 つの端点が、同じ行で隣り合う兄弟（またはその子孫）なら、その行と間隔の番号
function adjacentInRow(a, b) {
  const lca = commonParent(a, b);
  if (!lca || lca.dir !== 'row') return null;
  const childOf = (el) => {
    let p = el;
    while (p && p.up !== lca) p = p.up;
    return p;
  };
  const ia = lca.children.indexOf(childOf(a));
  const ib = lca.children.indexOf(childOf(b));
  if (ia < 0 || ib < 0 || Math.abs(ia - ib) !== 1) return null;
  return { row: lca, gap: Math.min(ia, ib) };
}

// 大きさを決めて置く。ラベルつきの線が同じ行の隣どうしを横に結ぶときは、端の部品どうしの距離を「ラベルの幅 + 10」以上にする
function layoutTree(tree, diagram, warn) {
  measure(tree);
  place(tree, MARGIN, MARGIN);
  const rects = new Map();
  forEachEl(tree, (el) => {
    if (el.type !== 'frame') rects.set(el.id, el);
  });
  const skipped = new Set();
  for (let iter = 0; iter < 8; iter++) {
    let changed = false;
    for (const e of diagram.edges ?? []) {
      if (!e.label || skipped.has(e.id)) continue;
      const a = rects.get(e.from);
      const b = rects.get(e.to);
      if (!a || !b || a.y >= b.y + b.h || b.y >= a.y + a.h) continue;
      const adj = adjacentInRow(a, b);
      if (!adj) continue;
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      const need = textWidth(e.label, EDGE_LABEL_FONT) + LABEL_SPAN_PAD;
      const deficit = need - (r.x - (l.x + l.w));
      if (deficit <= 0.01) continue;
      if (tree.w + 2 * MARGIN + deficit > DESIGN_WIDTH) {
        skipped.add(e.id);
        warn('diagram-crowded', `線 ${e.id} のラベル「${e.label}」が両端の部品の間に入りません。広げると幅が ${DESIGN_WIDTH} を超えるので、ラベルを短くするか、行を列に替えてください`);
        continue;
      }
      adj.row.gaps[adj.gap] += deficit;
      changed = true;
      measure(tree);
      place(tree, MARGIN, MARGIN);
    }
    if (!changed) break;
  }
  return rects;
}

/**
 * 構成図をレイアウトし、scene と、レイアウトで分かった警告（{ code, message }）を返す。
 * scene: { id, type, title, alt, width, height,
 *   boxes: [{ id, kind, label, x, y, w, h, depth, parent, tag }],
 *   nodes: [{ id, kind, category, short, label, x, y, w, h, parent, tag }]（tag は状態の札の矩形か null）,
 *   edges: [{ id, kind, from, to, both, points, label, labelAt, labelBox }],
 *   steps: [{ text, focus, edges, reveal, marks, badgeAt }], status }
 */
export function layoutDiagramReport(diagram, { serviceIndex = null } = {}) {
  const warnings = [];
  const warn = (code, message) => {
    if (!warnings.some((w) => w.code === code && w.message === message)) warnings.push({ code, message });
  };
  const edges = diagram.edges ?? [];
  const tree = buildTree(diagram, serviceIndex);
  computeGaps(tree, edges);
  // 状態の札を出す入れ物は、ラベルと札が並ぶ幅を確保する
  const tagW = marksWidth(diagram);
  forEachEl(tree, (el) => {
    if (el.type === 'box' && tagW.has(el.id)) el.minW = BOX_LABEL_X + textWidth(el.label, BOX_LABEL_FONT) + 6 + tagW.get(el.id) + BOX_PAD;
  });
  const rects = layoutTree(tree, diagram, warn);

  const scene = {
    id: diagram.id,
    type: diagram.type,
    title: diagram.title,
    alt: diagram.alt,
    width: tree.w + 2 * MARGIN,
    height: tree.h + 2 * MARGIN,
    boxes: [],
    nodes: [],
    edges: [],
    steps: [],
    status: 'pending',
  };
  forEachEl(tree, (el) => {
    if (el.type === 'box') scene.boxes.push({ id: el.id, kind: el.kind, label: el.label, x: el.x, y: el.y, w: el.w, h: el.h, depth: el.depth, parent: el.parentBox, tag: null });
    else if (el.type === 'node') scene.nodes.push({ id: el.id, kind: el.kind, category: el.category, short: el.short, label: el.label, x: el.x, y: el.y, w: el.w, h: el.h, parent: el.parentBox, tag: null });
  });

  const routes = routeEdges(diagram, scene, rects, warn);
  scene.edges = routes.map(({ e, points }) => ({
    id: e.id,
    kind: e.kind ?? 'request',
    from: e.from,
    to: e.to,
    both: Boolean(e.both),
    points,
    label: e.label ?? null,
    labelAt: null,
    labelBox: null,
  }));

  // 線が図の外へ回り込んだら、その分だけ範囲を広げる（浮く要素はこの範囲の中に置く）
  const ext = [...scene.boxes, ...scene.nodes].map((r) => [r.x, r.y, r.x + r.w, r.y + r.h]);
  for (const e of scene.edges) for (const [x, y] of e.points) ext.push([x, y, x, y]);
  const bx = Math.min(0, ...ext.map((a) => a[0] - MARGIN));
  const by = Math.min(0, ...ext.map((a) => a[1] - MARGIN));
  scene.bounds = rect(bx, by, Math.max(scene.width, ...ext.map((a) => a[2] + MARGIN)) - bx, Math.max(scene.height, ...ext.map((a) => a[3] + MARGIN)) - by);

  const badges = placeFloats(scene, diagram, warn);
  delete scene.bounds;
  scene.steps = (diagram.steps ?? []).map((s, i) => ({
    text: s.text,
    focus: [...(s.focus ?? [])],
    edges: [...(s.edges ?? [])],
    reveal: [...(s.reveal ?? [])],
    marks: (s.marks ?? []).map((m) => ({ id: m.id, state: m.state })),
    badgeAt: badges[i],
  }));

  // 全体を平行移動して、すべてを 0 以上に収め、幅と高さを広げる（回り込みの線や、はみ出した札のため）
  for (const x of [...scene.boxes, ...scene.nodes]) if (x.tag) ext.push([x.tag.x, x.tag.y, x.tag.x + x.tag.w, x.tag.y + x.tag.h]);
  for (const e of scene.edges) if (e.labelBox) ext.push([e.labelBox.x, e.labelBox.y, e.labelBox.x + e.labelBox.w, e.labelBox.y + e.labelBox.h]);
  for (const b of badges) if (b) ext.push([b[0] - BADGE_R, b[1] - BADGE_R, b[0] + BADGE_R, b[1] + BADGE_R]);
  const dx = Math.max(0, -Math.min(...ext.map((a) => a[0])));
  const dy = Math.max(0, -Math.min(...ext.map((a) => a[1])));
  const needW = Math.max(...ext.map((a) => a[2])) + dx;
  const needH = Math.max(...ext.map((a) => a[3])) + dy;
  const move = (r) => {
    if (r) {
      r.x += dx;
      r.y += dy;
    }
  };
  for (const x of [...scene.boxes, ...scene.nodes]) {
    move(x);
    move(x.tag);
  }
  for (const e of scene.edges) {
    e.points = e.points.map(([x, y]) => [x + dx, y + dy]);
    if (e.labelAt) e.labelAt = [e.labelAt[0] + dx, e.labelAt[1] + dy];
    move(e.labelBox);
  }
  for (const s of scene.steps) if (s.badgeAt) s.badgeAt = [s.badgeAt[0] + dx, s.badgeAt[1] + dy];
  scene.width = Math.max(scene.width + dx, needW);
  scene.height = Math.max(scene.height + dy, needH);

  // 丸める
  const roundRect = (r) => (r ? { x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h) } : null);
  scene.width = r1(scene.width);
  scene.height = r1(scene.height);
  for (const list of [scene.boxes, scene.nodes]) {
    for (const b of list) {
      for (const k of ['x', 'y', 'w', 'h']) b[k] = r1(b[k]);
      b.tag = roundRect(b.tag);
    }
  }
  for (const e of scene.edges) {
    e.points = e.points.map(pt);
    if (e.labelAt) e.labelAt = pt(e.labelAt);
    e.labelBox = roundRect(e.labelBox);
  }
  for (const s of scene.steps) if (s.badgeAt) s.badgeAt = pt(s.badgeAt);
  return { scene, warnings };
}

/** 構成図をレイアウトして、アプリが描く scene を返す（数値は小数 1 桁まで。形は layoutDiagramReport を参照） */
export function layoutDiagram(diagram, opts = {}) {
  return layoutDiagramReport(diagram, opts).scene;
}
