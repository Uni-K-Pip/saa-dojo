// 選択フロー・位置づけ図・時間の図・層の図の意味とレイアウトを検査します。
import { categoryKeyOf, serviceOf, shortNameOf } from './diagram.mjs';
import { DESIGN_WIDTH, textWidth } from './diagram-layout.mjs';

const MARGIN = 2;
const LINE_HEIGHT = { 10: 13, 11: 14 };
const r1 = (v) => Math.round(v * 10) / 10 || 0;

/** 全角は字ごとに、英数字は語ごとに折り返します。 */
export function wrapText(text, maxWidth, fontSize, bold = false, firstLineWidth = maxWidth) {
  const tokens = [];
  let word = '';
  function flushWord() {
    if (word) tokens.push(word);
    word = '';
  }
  for (const ch of text.trim()) {
    if (textWidth(ch, fontSize, bold) < fontSize && !/\s/u.test(ch)) {
      word += ch;
    } else {
      flushWord();
      if ('、。）'.includes(ch) && tokens.length > 0 && tokens.at(-1) !== ' ') {
        tokens[tokens.length - 1] += ch;
      } else if (!/\s/u.test(ch) || tokens.at(-1) !== ' ') {
        tokens.push(/\s/u.test(ch) ? ' ' : ch);
      }
    }
  }
  flushWord();

  const lines = [];
  let line = '';
  let space = '';
  let limit = firstLineWidth;
  const width = (value) => textWidth(value, fontSize, bold);
  function nextLine() {
    lines.push(line);
    line = '';
    space = '';
    limit = maxWidth;
  }
  for (const token of tokens) {
    if (token === ' ') {
      if (line) space = token;
      continue;
    }
    if (width(token) <= maxWidth) {
      if (width(line + space + token) > limit) nextLine();
      line += space + token;
    } else {
      const first = Array.from(token)[0];
      if (space) {
        if (width(line + space + first) <= limit) line += space;
        else nextLine();
      }
      for (const ch of token) {
        if (width(line + ch) > limit && (line ? !'、。）'.includes(ch) : limit !== maxWidth)) nextLine();
        line += ch;
      }
    }
    space = '';
  }
  lines.push(line);
  return lines;
}

const rect = (x, y, w, h, cls, extra = {}) => ({ t: 'rect', x: r1(x), y: r1(y), w: r1(w), h: r1(h), cls, ...extra });
const line = (points, cls, extra = {}) => ({ t: 'line', points: points.map(([x, y]) => [r1(x), r1(y)]), cls, ...extra });
const circle = (cx, cy, r, cls, owner) => ({ t: 'circle', cx: r1(cx), cy: r1(cy), r, cls, owner });
const text = (x, y, value, cls, extra = {}) => ({
  t: 'text', x: r1(x), y: r1(y), lines: Array.isArray(value) ? value : [value], size: 10, anchor: 'start', cls, ...extra,
});
const centeredBaseline = (cy, lines) => cy - (lines.length - 1) * LINE_HEIGHT[10] / 2 + 3.5;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const isAsk = (node) => node.ask !== undefined;

/** 描画する形の外接矩形を求めます。文字の大きさは推定値です。 */
export function shapeBounds({ shapes }) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  function include(x1, y1, x2 = x1, y2 = y1) {
    left = Math.min(left, x1);
    top = Math.min(top, y1);
    right = Math.max(right, x2);
    bottom = Math.max(bottom, y2);
  }
  for (const shape of shapes) {
    switch (shape.t) {
      case 'rect':
        include(shape.x, shape.y, shape.x + shape.w, shape.y + shape.h);
        break;
      case 'line':
        for (const [x, y] of shape.points) include(x, y);
        break;
      case 'circle':
        include(shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r);
        break;
      case 'text': {
        const { x, y, lines, size, bold, anchor } = shape;
        const width = Math.max(0, ...lines.map((line) => textWidth(line, size, bold)));
        const start = x - (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0);
        const lastBaseline = y + (lines.length - 1) * LINE_HEIGHT[size];
        include(start, y - size, start + width, lastBaseline + size / 4);
        break;
      }
    }
  }
  return left === Infinity ? { left: 0, top: 0, right: 0, bottom: 0 } : { left, top, right, bottom };
}

function layoutDecision(diagram, serviceIndex) {
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const links = [];
  const boxes = [];
  const labels = [];
  const flow = [];
  let top = MARGIN;
  let questionNumber = 0;

  function visit(id, depth, choice, parent) {
    const node = byId.get(id);
    const owner = { owner: id };
    const ask = isAsk(node);
    const number = ask ? ++questionNumber : null;
    const service = ask ? null : serviceOf(serviceIndex, node.service);
    const title = ask ? `Q${number} ${node.ask}` : node.result;
    const short = service ? shortNameOf(service) : null;
    const subtitle = short && !title.includes(short) ? short : null;
    const x = MARGIN + 16 * depth;
    const y = top;
    const w = DESIGN_WIDTH - MARGIN - x;
    const chipW = choice ? textWidth(choice, 10, true) + 8 : 0;
    const shift = choice ? chipW + 4 : 0;
    const lines = wrapText(title, w - 12, 11, !ask, w - 12 - shift);
    const h = 10 + lines.length * LINE_HEIGHT[11] + (subtitle ? LINE_HEIGHT[10] : 0);
    top += h + 8;
    if (parent) {
      const mid = y + h / 2;
      links.push(line([[parent.x + 8, parent.y + parent.h], [parent.x + 8, mid], [x, mid]], 'dg-c-link', { arrow: true, ...owner }));
    }
    boxes.push(rect(x, y, w, h, ask ? 'dg-c-ask' : 'dg-c-result', { rx: 6, ...owner }));
    if (!ask) {
      const category = node.service ? categoryKeyOf(node.service, serviceIndex) : 'other';
      boxes.push(rect(x, y, 4, h, `dg-c-band dg-cat-${category}`, { rx: 2, ...owner }));
    }
    if (choice) {
      boxes.push(rect(x + 6, y + 5, chipW, 14, 'dg-c-chip', { rx: 3, ...owner }));
      labels.push(text(x + 10, y + 15.5, choice, 'dg-c-chip-text', { bold: true, ...owner }));
    }
    labels.push(text(x + 6 + shift, y + 16, lines[0], 'dg-c-text', { size: 11, bold: !ask, ...owner }));
    if (lines.length > 1) labels.push(text(x + 6, y + 16 + LINE_HEIGHT[11], lines.slice(1), 'dg-c-text', { size: 11, bold: !ask, ...owner }));
    if (subtitle) labels.push(text(x + 6, y + 15 + lines.length * LINE_HEIGHT[11], subtitle, 'dg-c-muted', owner));
    const choices = ask ? node.choices : [];
    flow.push({
      id, kind: ask ? 'ask' : 'result', number, text: ask ? node.ask : node.result,
      why: ask ? null : node.why, service: node.service ?? null, serviceName: service?.name ?? null, choices,
    });
    for (const c of choices) visit(c.to, depth + 1, c.label, { x, y, h });
  }

  visit(diagram.start, 0, null, null);
  return { height: top - 8 + MARGIN, shapes: [...links, ...boxes, ...labels], start: diagram.start, flow };
}

function layoutPosition(diagram, serviceIndex) {
  const oneAxis = !diagram.y;
  const left = MARGIN + (oneAxis ? 4 : 44);
  const top = oneAxis ? 6 : 20;
  const right = DESIGN_WIDTH - MARGIN - (oneAxis ? 4 : 0);
  const w = right - left;
  const colW = w / 5;
  const rowH = oneAxis ? 24 : 40;
  const bottom = top + rowH * (oneAxis ? diagram.items.length : 5);
  const shapes = [rect(left, top, w, bottom - top, 'dg-c-frame')];
  for (let i = 1; i < 5; i++) {
    const x = left + i * colW;
    shapes.push(line([[x, top], [x, bottom]], 'dg-c-grid'));
    if (!oneAxis) {
      const y = top + i * rowH;
      shapes.push(line([[left, y], [right, y]], 'dg-c-grid'));
    }
  }
  if (!oneAxis) {
    shapes.push(text(left, 12, `↑ ${diagram.y.label}`, 'dg-c-muted', { bold: true }));
    shapes.push(text(left - 4, top + rowH / 2 + 3.5, diagram.y.high, 'dg-c-muted', { anchor: 'end' }));
    shapes.push(text(left - 4, bottom - rowH / 2 + 3.5, diagram.y.low, 'dg-c-muted', { anchor: 'end' }));
  }
  shapes.push(text(left, bottom + 13, diagram.x.low, 'dg-c-muted'));
  shapes.push(text(right, bottom + 13, diagram.x.high, 'dg-c-muted', { anchor: 'end' }));
  shapes.push(text(left + w / 2, bottom + 27, `${diagram.x.label} →`, 'dg-c-muted', { anchor: 'middle', bold: true }));

  const radius = 8;
  const markers = diagram.items.map((item, i) => {
    let cx = left + (item.x - 0.5) * colW;
    if (!oneAxis) {
      const peers = diagram.items.filter((other) => other.x === item.x && other.y === item.y);
      const spread = (peers.length - 1) * 9;
      // 端の升で丸が図から切れるときは、間隔を保ったまま内側へ寄せます。
      cx = Math.max(MARGIN + radius + spread, Math.min(DESIGN_WIDTH - MARGIN - radius - spread, cx));
      cx += peers.indexOf(item) * 18 - spread;
    }
    const cy = top + (oneAxis ? i + 0.5 : 5 - item.y + 0.5) * rowH;
    const category = item.service ? categoryKeyOf(item.service, serviceIndex) : 'other';
    return { item, n: i + 1, cx, cy, category };
  });
  const used = markers.map(({ cx, cy }) => ({ x: cx - radius, y: cy - radius, w: 2 * radius, h: 2 * radius }));
  for (const { item, n, cx, cy, category } of markers) {
    const owner = item.id;
    shapes.push(circle(cx, cy, radius, `dg-c-marker dg-cat-${category}`, owner));
    shapes.push(text(cx, cy + 3.5, String(n), 'dg-c-marker-text', { anchor: 'middle', bold: true, owner }));
    const labelW = textWidth(item.label, 10);
    const background = { y: cy - 6.5, w: labelW + 4, h: 13 };
    for (const side of ['start', 'end']) {
      const x = side === 'start' ? cx + 11 : cx - 11;
      const bounds = { ...background, x: side === 'start' ? x - 2 : x - labelW - 2 };
      if (bounds.x < left + 2 || bounds.x + bounds.w > right - 2 || used.some((r) => overlaps(bounds, r))) continue;
      used.push(bounds);
      shapes.push(rect(bounds.x, bounds.y, bounds.w, bounds.h, 'dg-c-label-bg', { owner }));
      shapes.push(text(x, cy + 3.5, item.label, 'dg-c-text', { anchor: side, owner }));
      break;
    }
  }
  const legend = markers.map(({ item, n, category }) => ({
    n, id: item.id, label: item.label, note: item.note ?? null, service: item.service ?? null, category,
  }));
  return { height: bottom + 27 + MARGIN, shapes, oneAxis, legend };
}

function columnHeadings(labels, left, colW, shapes) {
  const headings = labels.map((label) => wrapText(label, colW - 6, 10, true));
  headings.forEach((lines, i) => {
    shapes.push(text(left + (i + 0.5) * colW, MARGIN + 10, lines, 'dg-c-head', { anchor: 'middle', bold: true }));
  });
  return Math.max(...headings.map((lines) => lines.length)) * LINE_HEIGHT[10] + 6;
}

function layoutTimeline(diagram, warnings) {
  const shapes = [];
  const { lanes, ticks } = diagram;
  const tickW = Math.max(36, ...ticks.map((tick) => textWidth(tick.label, 10) + 10));
  const left = MARGIN + tickW;
  const right = DESIGN_WIDTH - MARGIN;
  const colW = (right - left) / lanes.length;
  const headerH = columnHeadings(lanes.map((lane) => lane.label), left, colW, shapes);
  const tickIndex = new Map(ticks.map((tick, i) => [tick.at, i]));
  const spans = lanes.map((lane) => (lane.spans ?? []).map((span) => ({
    from: tickIndex.get(span.from), to: tickIndex.get(span.to),
    lines: wrapText(span.label, colW - 10, 10),
  })));
  const intervalH = Math.ceil(Math.max(34, ...spans.flat().map(({ from, to, lines }) => (lines.length * LINE_HEIGHT[10] + 10) / (to - from))));
  const tickY = (i) => headerH + 8 + i * intervalH;
  const bottom = tickY(ticks.length - 1);
  ticks.forEach((tick, i) => {
    const y = tickY(i);
    shapes.push(text(left - 6, y + 3.5, tick.label, 'dg-c-muted', { anchor: 'end' }));
    shapes.push(line([[left, y], [right, y]], 'dg-c-grid'));
  });
  for (let i = 1; i < lanes.length; i++) {
    const x = left + i * colW;
    shapes.push(line([[x, tickY(0)], [x, bottom]], 'dg-c-grid'));
  }
  lanes.forEach((lane, i) => {
    const x = left + i * colW;
    const cx = x + colW / 2;
    const labelBounds = spans[i].map(({ from, to, lines }, j) => {
      const y = tickY(from) + 2;
      const h = tickY(to) - tickY(from) - 4;
      const cy = y + h / 2;
      const cls = j % 2 ? 'dg-c-span-b' : 'dg-c-span-a';
      shapes.push(rect(x + 4, y, colW - 8, h, cls, { rx: 4 }));
      shapes.push(text(cx, centeredBaseline(cy, lines), lines, 'dg-c-text', { anchor: 'middle' }));
      const w = Math.max(...lines.map((label) => textWidth(label, 10)));
      const labelH = lines.length * LINE_HEIGHT[10];
      return { x: cx - w / 2, y: cy - labelH / 2, w, h: labelH };
    });
    (lane.marks ?? []).forEach((mark, j) => {
      const y = tickY(tickIndex.get(mark.at));
      const w = textWidth(mark.label, 10, true) + 10;
      const bounds = { x: x + colW - 4 - w, y: y - 7, w, h: 14 };
      shapes.push(line([[x, y], [x + colW, y]], 'dg-c-mark-line'));
      shapes.push(rect(bounds.x, bounds.y, w, bounds.h, 'dg-c-mark', { rx: 7 }));
      shapes.push(text(bounds.x + w / 2, y + 3.5, mark.label, 'dg-c-mark-text', { anchor: 'middle', bold: true }));
      if (w > colW - 8) {
        warnings.push({ code: 'diagram-crowded', message: `lanes[${i}].marks[${j}]（${mark.label}）の札が帯の幅に収まりません。ラベルを短くするか、帯を減らしてください。` });
      } else if (labelBounds.some((label) => overlaps(label, bounds))) {
        warnings.push({ code: 'diagram-crowded', message: `lanes[${i}].marks[${j}]（${mark.label}）の札が帯のラベルと重なります。` });
      }
    });
  });
  return { height: bottom + 10, shapes };
}

function layoutLayers(diagram) {
  const shapes = [];
  const columns = diagram.columns ?? [];
  const count = diagram.columns?.length ?? 1;
  const rowW = count === 1 ? 140 : 108;
  const left = MARGIN + rowW;
  const colW = (DESIGN_WIDTH - 2 * MARGIN - rowW) / count;
  const legend = Object.entries(diagram.legend).map(([key, label], i) => ({ key, label, n: i + 1 }));
  const byKey = new Map(legend.map((entry) => [entry.key, entry]));
  let y = MARGIN + (columns.length ? columnHeadings(columns, left, colW, shapes) : 0);
  for (const row of diagram.rows) {
    const label = wrapText(row.label, rowW - 8, 10, true);
    const cells = row.cells.map((key) => wrapText(byKey.get(key).label, colW - 10, 10));
    const h = Math.max(28, Math.max(label.length, ...cells.map((lines) => lines.length)) * LINE_HEIGHT[10] + 10);
    const cy = y + h / 2;
    shapes.push(text(MARGIN + 4, centeredBaseline(cy, label), label, 'dg-c-text', { bold: true }));
    cells.forEach((lines, i) => {
      const x = left + i * colW;
      shapes.push(rect(x + 2, y + 2, colW - 4, h - 4, `dg-c-cell-${byKey.get(row.cells[i]).n}`, { rx: 3 }));
      shapes.push(text(x + colW / 2, centeredBaseline(cy, lines), lines, 'dg-c-cell-text', { anchor: 'middle' }));
    });
    y += h;
  }
  let x = MARGIN + 4;
  y += 6;
  for (const { label, n } of legend) {
    const w = 16 + textWidth(label, 10);
    if (x + w > DESIGN_WIDTH - MARGIN) {
      x = MARGIN + 4;
      y += 18;
    }
    shapes.push(rect(x, y, 12, 12, `dg-c-cell-${n}`, { rx: 2 }));
    shapes.push(text(x + 16, y + 9.5, label, 'dg-c-text'));
    x += w + 12;
  }
  return { height: y + 12 + MARGIN, shapes, legend, columns };
}

/** 意味の検査を通った図から描画用のデータを組み立てます。 */
export function layoutKindDiagram(diagram, { serviceIndex } = {}) {
  const { id, type, title, alt } = diagram;
  const warnings = [];
  let layout;
  switch (type) {
    case 'decision': layout = layoutDecision(diagram, serviceIndex); break;
    case 'position': layout = layoutPosition(diagram, serviceIndex); break;
    case 'timeline': layout = layoutTimeline(diagram, warnings); break;
    case 'layers': layout = layoutLayers(diagram); break;
  }
  return { scene: { id, type, title, alt, width: DESIGN_WIDTH, status: 'pending', ...layout }, warnings };
}

function checkService(item, where, { serviceIndex }, errors) {
  if (item.service && serviceIndex && !serviceOf(serviceIndex, item.service)) {
    errors.push(`${where}.service: サービス ${item.service} が台帳にありません。`);
  }
}

function checkDecision(diagram, ctx, errors, warnings) {
  const { nodes, start } = diagram;
  const byId = new Map();
  const incoming = new Set();
  const asks = nodes.filter(isAsk).length;
  const results = nodes.length - asks;
  if (asks > 7) errors.push(`質問が ${asks} 個あります（上限 7 個）。`);
  if (results > 8) errors.push(`結論が ${results} 個あります（上限 8 個）。`);
  if (results === 1) warnings.push({ code: 'diagram-single-result', message: '選択フローの結論が 1 つだけです。' });
  nodes.forEach((node, i) => {
    if (byId.has(node.id)) errors.push(`nodes[${i}]（${node.id}）: id が重複しています。`);
    byId.set(node.id, { node, i });
  });
  if (!byId.has(start)) errors.push(`start: ${start} が nodes にありません。`);
  nodes.forEach((node, i) => {
    const where = `nodes[${i}]（${node.id}）`;
    if (isAsk(node)) {
      const labels = new Set();
      node.choices.forEach(({ label, to }, j) => {
        const choice = `${where}.choices[${j}]`;
        if (labels.has(label)) errors.push(`${choice}: 選択肢の label ${label} が重複しています。`);
        labels.add(label);
        if (!byId.has(to)) {
          errors.push(`${choice}: 行き先のない選択肢です（${to}）。`);
          return;
        }
        if (incoming.has(to) || to === start) {
          errors.push(`${choice}: ${to} への分岐を木にしてください。同じ結論は別の id で書けます。`);
        }
        incoming.add(to);
      });
    } else {
      checkService(node, where, ctx, errors);
      for (const id of node.factRefs ?? []) {
        if (ctx.factIds && !ctx.factIds.has(id)) errors.push(`${where}.factRefs: 図鑑の事実 ${id} がありません。`);
      }
    }
  });

  const active = new Set();
  const depths = new Map();
  const reachable = new Set();
  function visit(id, fromStart) {
    const hit = byId.get(id);
    if (!hit) return -Infinity;
    if (fromStart) reachable.add(id);
    if (active.has(id)) {
      errors.push(`nodes[${hit.i}]（${id}）: 選択肢の行き先が循環しています。`);
      return -Infinity;
    }
    if (depths.has(id)) return depths.get(id);
    active.add(id);
    const depth = isAsk(hit.node) ? 1 + Math.max(...hit.node.choices.map(({ to }) => visit(to, fromStart))) : 0;
    active.delete(id);
    depths.set(id, depth);
    return depth;
  }
  const depth = visit(start, true);
  if (depth > 4) errors.push(`start（${start}）から結論までに質問が最大 ${depth} 個あります（深さの上限 4）。`);
  nodes.forEach(({ id }, i) => {
    if (!reachable.has(id)) errors.push(`nodes[${i}]（${id}）: start から届きません。`);
    visit(id, false);
  });
}

function checkPosition(diagram, ctx, errors, warnings) {
  const ids = new Set();
  const positions = new Map();
  diagram.items.forEach((item, i) => {
    const where = `items[${i}]（${item.id}）`;
    if (ids.has(item.id)) errors.push(`${where}: id が重複しています。`);
    ids.add(item.id);
    if (diagram.y && item.y === undefined) errors.push(`${where}: y 軸があるので y が要ります。`);
    if (!diagram.y && item.y !== undefined) errors.push(`${where}: y 軸がないので y は省いてください。`);
    checkService(item, where, ctx, errors);
    if (diagram.y && item.y !== undefined) {
      const key = `(${item.x}, ${item.y})`;
      const group = positions.get(key) ?? [];
      group.push(where);
      positions.set(key, group);
    }
  });
  for (const [key, group] of positions) {
    if (group.length > 1) warnings.push({ code: 'diagram-same-position', message: `${group.join('・')} が同じ位置 ${key} にあります。` });
  }
}

function checkTimeline(diagram, errors) {
  const { ticks, lanes } = diagram;
  const values = new Set(ticks.map(({ at }) => at));
  ticks.forEach(({ at }, i) => {
    if (i > 0 && at <= ticks[i - 1].at) errors.push(`ticks[${i}].at: 目盛りの値は前の目盛りより大きくしてください。`);
  });
  function checkValue(at, where) {
    if (!values.has(at)) errors.push(`${where}: 目盛りにない値 ${at} です。`);
  }
  lanes.forEach(({ spans = [], marks = [] }, i) => {
    const where = `lanes[${i}]`;
    if (spans.length + marks.length === 0) errors.push(`${where}: spans または marks が要ります。`);
    spans.forEach(({ from, to }, j) => {
      const span = `${where}.spans[${j}]`;
      checkValue(from, `${span}.from`);
      checkValue(to, `${span}.to`);
      if (from >= to) errors.push(`${span}: from は to より小さくしてください。`);
      if (from < to && spans.slice(0, j).some((s) => s.from < s.to && from < s.to && s.from < to)) {
        errors.push(`${span}: 同じ帯の別の span と重なります。`);
      }
    });
    const atValues = new Set();
    marks.forEach(({ at }, j) => {
      const mark = `${where}.marks[${j}].at`;
      checkValue(at, mark);
      if (atValues.has(at)) errors.push(`${mark}: 同じ帯で at が重複しています。`);
      atValues.add(at);
    });
  });
}

function checkLayers(diagram, errors) {
  const keys = new Set(Object.keys(diagram.legend));
  const count = diagram.columns?.length ?? 1;
  if (keys.size < 1 || keys.size > 3) errors.push('legend のキーは 1〜3 個にしてください。');
  diagram.rows.forEach(({ label, cells }, i) => {
    const where = `rows[${i}]（${label}）.cells`;
    if (cells.length !== count) errors.push(`${where}: 列と cells の数の不一致です（列 ${count}、cells ${cells.length}）。`);
    cells.forEach((key, j) => {
      if (!keys.has(key)) errors.push(`${where}[${j}]: ${key} が legend にありません。`);
    });
  });
}

export function checkKindDiagram(diagram, ctx) {
  const errors = [];
  const warnings = [];
  switch (diagram.type) {
    case 'decision': checkDecision(diagram, ctx, errors, warnings); break;
    case 'position': checkPosition(diagram, ctx, errors, warnings); break;
    case 'timeline': checkTimeline(diagram, errors); break;
    case 'layers': checkLayers(diagram, errors); break;
  }
  return { errors, warnings };
}
