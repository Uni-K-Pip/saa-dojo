// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DiagramSchema } from '../../../scripts/lib/schema.mjs';
import { checkDiagram, layoutAnyDiagram, shortNameOf } from '../../../scripts/lib/diagram.mjs';
import { layoutKindDiagram, wrapText } from '../../../scripts/lib/diagram-kinds.mjs';
import { DESIGN_WIDTH, textWidth } from '../../../scripts/lib/diagram-layout.mjs';
import { buildServiceIndex } from '../../../scripts/lib/service-registry.mjs';
import { architecture, ask, decision, layers, lessonId, position, result, timeline } from './diagram-fixtures.mjs';

const read = (rel) => JSON.parse(readFileSync(new URL(`../../../content/saa-c03/${rel}`, import.meta.url), 'utf8'));
const registry = read('services.json');
const ctx = {
  lessonIds: new Set([lessonId]),
  factIds: new Set(['s3.versioning']),
  serviceIndex: buildServiceIndex(read('blueprint.json'), registry),
};
const sceneOf = (diagram) => layoutAnyDiagram(diagram, ctx);
const errorsOf = (diagram) => checkDiagram(diagram, ctx).errors.join('\n');
const warningsOf = (diagram) => checkDiagram(diagram, ctx).warnings.map(({ code }) => code);

it.each([
  ['選択フロー', decision], ['位置づけ図', position], ['時間の図', timeline], ['層の図', layers],
])('%sはスキーマと意味の検査を通り、幅 328 以内の決まったレイアウトになります', (_label, fixture) => {
  const diagram = DiagramSchema.parse(fixture());
  expect(checkDiagram(diagram, ctx)).toEqual({ errors: [], warnings: [] });
  const scene = sceneOf(diagram);
  expect(scene.width).toBeLessThanOrEqual(DESIGN_WIDTH);
  expect(scene).toEqual(sceneOf(structuredClone(diagram)));
  expect(DiagramSchema.safeParse({ ...diagram, extra: true }).success).toBe(false);
});

it('全角を字ごとに折り返し、句読点から行を始めません', () => {
  expect(wrapText('あい、うえお', 30, 10)).toEqual(['あい、', 'うえお']);
  expect(wrapText('あいうえ', 20, 10)).toEqual(['あい', 'うえ']);
});

it('英単語は 1 行に入る限り切らず、狭い先頭行と行頭の空白を扱います', () => {
  expect(wrapText('  Q1   Amazon S3', 38, 10, false, 16)).toEqual(['Q1', 'Amazon', 'S3']);
  expect(wrapText('Amazon', 18, 10)).toEqual(['Ama', 'zon']);
  expect(wrapText('Amazon', 18, 10, false, 12)).toEqual(['Am', 'azo', 'n']);
  expect(wrapText('Amazon S3', 38, 10, false, 18)).toEqual(['', 'Amazon', 'S3']);
});

it('構成図も短い代替文を警告し、4 種類の図にも裏づけが要ります', () => {
  expect(warningsOf({ ...architecture(), alt: 'あ'.repeat(79) })).toContain('diagram-alt-short');
  expect(warningsOf({ ...architecture(), alt: 'あ'.repeat(80) })).not.toContain('diagram-alt-short');
  for (const fixture of [decision, position, timeline, layers]) {
    expect(errorsOf({ ...fixture(), lessonRefs: [] })).toContain('裏づけ');
    expect(errorsOf({ ...fixture(), lessonRefs: ['lesson-1.1-unknown'], factRefs: ['s3.unknown'] })).toMatch(/lessonRefs:.*\n.*factRefs:/);
  }
});

describe('選択フロー', () => {
  it.each([
    ['id の重複', (d) => d.nodes.push(result('first')), 'id が重複'],
    ['start の不在', (d) => { d.start = 'missing'; }, 'start: missing が nodes にありません'],
    ['行き先の不在', (d) => { d.nodes[1].choices[0].to = 'missing'; }, '行き先のない選択肢'],
    ['行き先の共有', (d) => { d.nodes[1].choices[0].to = 'last'; }, '木にしてください'],
    ['start を指す選択肢', (d) => { d.nodes[1].choices[0].to = 'root'; }, 'root への分岐を木にしてください'],
    ['循環', (d) => { d.nodes[1].choices[0].to = 'next'; }, '行き先が循環'],
    ['届かないノード', (d) => { d.nodes.push(result('orphan')); }, 'nodes[5]（orphan）: start から届きません'],
    ['ラベルの重複', (d) => { d.nodes[1].choices[1].label = 'はい'; }, '選択肢の label はい が重複'],
    ['質問数の上限', (d) => { for (let i = 0; i < 6; i++) d.nodes.push(ask(`q${i}`, 'first', 'second')); }, '質問が 8 個'],
    ['結論数の上限', (d) => { for (let i = 0; i < 6; i++) d.nodes.push(result(`r${i}`)); }, '結論が 9 個'],
    ['未知のサービス', (d) => { d.nodes[4].service = 'unknown'; }, 'サービス unknown が台帳にありません'],
    ['未知の事実', (d) => { d.nodes[4].factRefs = ['s3.unknown']; }, '図鑑の事実 s3.unknown がありません'],
  ])('%sはエラーになります', (_label, change, message) => {
    const d = decision();
    change(d);
    expect(errorsOf(d)).toContain(message);
  });

  it('深さは start から結論までの道にある質問を数えます', () => {
    const d = decision();
    d.start = 'q0';
    d.nodes = [0, 1, 2, 3, 4].flatMap((i) => [ask(`q${i}`, i === 4 ? 'end' : `q${i + 1}`, `r${i}`), result(`r${i}`)]).concat(result('end'));
    expect(errorsOf(d)).toMatch(/質問が最大 5 個/);
    d.nodes = d.nodes.slice(2);
    d.start = 'q1';
    expect(errorsOf(d)).toBe('');
  });

  it('結論が 1 個のときに警告し、台帳や事実の一覧がない場合は存在の検査を省きます', () => {
    const d = decision();
    d.nodes = [ask('root', 'end', 'end'), result('end')];
    expect(warningsOf(d)).toEqual(['diagram-single-result']);
    const other = decision();
    other.nodes[4].service = 'unspecified';
    other.nodes[4].factRefs = ['s3.unknown'];
    expect(checkDiagram(other).errors).toEqual([]);
  });

  it('深さ優先で質問に番号を振って箱を字下げし、選択肢とサービスの短い名前を描きます', () => {
    const { flow, shapes } = sceneOf(decision());
    expect(flow.map(({ id, number }) => [id, number])).toEqual([
      ['root', 1], ['next', 2], ['first', null], ['second', null], ['last', null],
    ]);
    expect(shapes.filter(({ cls }) => ['dg-c-ask', 'dg-c-result'].includes(cls)).map(({ x }) => x)).toEqual([2, 18, 34, 34, 18]);
    expect(shapes[0]).toMatchObject({ t: 'line', cls: 'dg-c-link', arrow: true, owner: 'next' });
    expect(shapes.find(({ owner, cls }) => owner === 'first' && cls === 'dg-c-muted')?.lines).toEqual(['S3']);
    expect(flow[2].serviceName).toBe('Amazon S3');
  });

  it('選択フローが 440 を超えても高さを警告しません', () => {
    const d = decision();
    d.nodes[1].choices[0].to = 'deep';
    d.nodes.push(ask('deep', 'first', 'new'), result('new'));
    d.nodes[3].choices[1].to = 'branch';
    d.nodes.push(ask('branch', 'last', 'other'), result('other'));
    for (const node of d.nodes) {
      if (node.ask) node.ask = '質問'.repeat(30);
      else Object.assign(node, { service: 's3', result: '結論'.repeat(12) });
    }
    expect(errorsOf(d)).toBe('');
    expect(sceneOf(d).height).toBeGreaterThan(440);
    expect(warningsOf(d)).not.toContain('diagram-height');
  });
});

describe('位置づけ図', () => {
  it.each([
    [(d) => { d.items[1].id = 'first'; }, 'id が重複'],
    [(d) => { delete d.y; }, 'y 軸がないので y は省いて'],
    [(d) => { delete d.items[1].y; }, 'y 軸があるので y が要ります'],
    [(d) => { d.items[1].service = 'unknown'; }, 'サービス unknown が台帳にありません'],
  ])('項目または軸の誤りを検査します（%#）', (change, message) => {
    const d = position();
    change(d);
    expect(errorsOf(d)).toContain(message);
  });

  it('2 軸だけ同じ位置を警告し、同じ升の丸を横にずらします', () => {
    const d = position();
    d.items[1].y = d.items[0].y;
    expect(warningsOf(d)).toEqual(['diagram-same-position']);
    const markers = sceneOf(d).shapes.filter(({ t }) => t === 'circle');
    expect(markers[1].cx - markers[0].cx).toBe(18);
    delete d.y;
    d.items.forEach((item) => { delete item.y; });
    expect(warningsOf(d)).toEqual([]);
    expect(sceneOf(d).shapes.filter(({ t }) => t === 'circle').map(({ cy }) => cy)).toEqual([18, 42]);
  });

  it('左右に収まらない名前は凡例だけに出します', () => {
    const { shapes, legend } = sceneOf(position());
    expect(shapes.find(({ cls, owner }) => cls === 'dg-c-text' && owner === 'first')).toBeUndefined();
    expect(shapes.find(({ cls, owner }) => cls === 'dg-c-text' && owner === 'second')?.lines).toEqual(['短い名前']);
    expect(legend[0].label).toBe(position().items[0].label);
  });

  it('端の升に丸が集中しても 18 の間隔で図の内側に収めます', () => {
    const d = position();
    d.items = Array.from({ length: 10 }, (_, i) => ({ id: `item${i}`, label: `項目${i}`, x: 5, y: 3 }));
    const markers = sceneOf(d).shapes.filter(({ t }) => t === 'circle');
    expect(markers).toHaveLength(10);
    expect(markers[9].cx + markers[9].r).toBeLessThanOrEqual(DESIGN_WIDTH - 2);
    expect(markers.slice(1).every(({ cx }, i) => cx - markers[i].cx === 18)).toBe(true);
  });
});

describe('時間の図', () => {
  it.each([
    [(d) => { d.ticks[1].at = 0; }, '前の目盛りより大きく'],
    [(d) => { d.lanes[0].spans[0].from = 1; }, 'spans[0].from: 目盛りにない値'],
    [(d) => { d.lanes[0].spans[0].to = 1; }, 'spans[0].to: 目盛りにない値'],
    [(d) => { d.lanes[0].marks[0].at = 1; }, 'marks[0].at: 目盛りにない値'],
    [(d) => { d.lanes[0].spans[0].from = 90; }, 'from は to より小さく'],
    [(d) => { d.lanes[0].spans.push({ from: 7, to: 90, label: '別の区間' }); }, '別の span と重なります'],
    [(d) => { d.lanes[0] = { label: '空の帯', marks: [], spans: [] }; }, 'spans または marks が要ります'],
    [(d) => { d.lanes[0].marks.push({ at: 90, label: '印' }); }, '同じ帯で at が重複'],
  ])('目盛りまたは帯の誤りを検査します（%#）', (change, message) => {
    const d = timeline();
    change(d);
    expect(errorsOf(d)).toContain(message);
  });

  it('目盛りを等間隔に置き、内部の札と帯の名前が重なると警告します', () => {
    const d = timeline();
    d.lanes.push(...Array.from({ length: 3 }, () => ({ label: '確認', marks: [{ at: 7, label: '確認' }] })));
    d.lanes[0].marks[0] = { at: 7, label: '確認する時点' };
    const { scene, warnings } = layoutKindDiagram(d, ctx);
    const ys = scene.shapes.filter(({ cls, t }) => cls === 'dg-c-grid' && t === 'line')
      .filter(({ points }) => points[0][1] === points[1][1]).map(({ points }) => points[0][1]);
    expect(ys[2] - ys[1]).toBe(ys[1] - ys[0]);
    expect(warnings.map(({ code }) => code)).toEqual(['diagram-crowded']);
    expect(warningsOf(d)).toEqual(['diagram-crowded']);
  });

  it('帯の幅に収まらない札を警告します', () => {
    const d = timeline();
    d.lanes = Array.from({ length: 4 }, () => ({ label: '帯', marks: [{ at: d.ticks[1].at, label: 'あいうえおか' }] }));
    expect(DiagramSchema.safeParse(d).success).toBe(true);
    const { warnings } = layoutKindDiagram(d, ctx);
    expect(warnings.map(({ code }) => code)).toEqual(Array(4).fill('diagram-crowded'));
    expect(warnings[0].message).toContain('帯の幅に収まりません');
  });

  it('レイアウトした高さが 440 を超えると警告します', () => {
    const d = timeline();
    d.ticks = Array.from({ length: 8 }, (_, at) => ({ at, label: '長い目盛り名' }));
    d.lanes = Array.from({ length: 4 }, () => ({ label: '長い帯のラベル', spans: [{ from: 0, to: 1, label: 'あ'.repeat(20) }] }));
    expect(DiagramSchema.safeParse(d).success).toBe(true);
    expect(sceneOf(d).height).toBeGreaterThan(440);
    expect(warningsOf(d)).toEqual(['diagram-height']);
  });
});

describe('層の図', () => {
  it.each([
    [(d) => { d.legend = {}; }, 'legend のキーは 1〜3 個'],
    [(d) => { d.rows[0].cells.pop(); }, '列と cells の数の不一致'],
    [(d) => { delete d.columns; }, '列と cells の数の不一致'],
    [(d) => { d.rows[0].cells[0] = 'undefined-key'; }, 'undefined-key が legend にありません'],
  ])('列、セル、凡例の誤りを検査します（%#）', (change, message) => {
    const d = layers();
    change(d);
    expect(errorsOf(d)).toContain(message);
  });

  it('列のある図と省いた図でセルの数だけ文字を描き、凡例は記載順です', () => {
    const d = layers();
    const scene = sceneOf(d);
    expect(scene.shapes.filter(({ cls }) => cls === 'dg-c-cell-text')).toHaveLength(4);
    expect(scene.legend.map(({ key, n }) => [key, n])).toEqual([['you', 1], ['cloud', 2]]);
    delete d.columns;
    d.rows.forEach((row) => { row.cells = row.cells.slice(0, 1); });
    expect(errorsOf(d)).toBe('');
    expect(sceneOf(d).columns).toEqual([]);
    expect(sceneOf(d).shapes.filter(({ cls }) => cls === 'dg-c-cell-text')).toHaveLength(2);
  });
});

it('サービス台帳の短い名前がすべて幅 104 の部品に収まります', () => {
  for (const service of registry.services) {
    const short = shortNameOf(service);
    expect(textWidth(short, 11, true) + 10, `${service.id}（${short}）`).toBeLessThanOrEqual(104);
  }
});
