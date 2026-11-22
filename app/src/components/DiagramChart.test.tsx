import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import type { AnyDiagramScene, DecisionFlowNode, DecisionScene, DiagramScene } from '../content/types';
import { DiagramView } from './DiagramView';

const common = {
  id: 'dg-test',
  title: '動作を確かめる図',
  alt: '番号順に項目を読み上げて、条件によって進む場所を示します。',
  width: 328, height: 120, status: 'pending',
} as const;

function ask(id: string, number: number, choices: DecisionFlowNode['choices']): DecisionFlowNode {
  return { id, kind: 'ask', number, text: number === 1 ? '保存しますか？' : 'すぐに読みますか？', why: null, service: null, serviceName: null, choices };
}

function result(id: string): DecisionFlowNode {
  return { id, kind: 'result', number: null, text: '保存先を選びます', why: '同じデータに何度もアクセスするためです。', service: 's3', serviceName: 'Amazon S3', choices: [] };
}

const decision: DecisionScene = {
  ...common, type: 'decision', start: 'q1',
  flow: [
    ask('q1', 1, [{ label: 'はい', to: 'q2' }, { label: 'いいえ', to: 'r3' }]),
    ask('q2', 2, [{ label: 'はい', to: 'r1' }, { label: 'いいえ', to: 'r2' }]),
    result('r1'), result('r2'), result('r3'),
  ],
  shapes: [
    { t: 'rect', x: 2, y: 2, w: 324, h: 24, rx: 6, cls: 'dg-c-ask', owner: 'q1' },
    { t: 'line', points: [[10, 26], [10, 40], [18, 40]], cls: 'dg-c-link', arrow: true, owner: 'q2' },
    { t: 'rect', x: 18, y: 35, w: 308, h: 24, rx: 6, cls: 'dg-c-ask', owner: 'q2' },
    { t: 'rect', x: 34, y: 67, w: 292, h: 24, rx: 6, cls: 'dg-c-result', owner: 'r1' },
    { t: 'rect', x: 34, y: 99, w: 292, h: 24, rx: 6, cls: 'dg-c-result', owner: 'r2' },
    { t: 'rect', x: 18, y: 99, w: 308, h: 24, rx: 6, cls: 'dg-c-result', owner: 'r3' },
  ],
};

const charts: Exclude<AnyDiagramScene, { type: 'architecture' }>[] = [
  decision,
  {
    ...common, type: 'position', oneAxis: true,
    shapes: [{ t: 'circle', cx: 50, cy: 40, r: 8, cls: 'dg-c-marker dg-cat-storage' }],
    legend: [{ n: 1, id: 'storage', label: '保管する', note: '補足です。', service: 's3', category: 'storage' }],
  },
  {
    ...common, type: 'timeline',
    shapes: [{ t: 'line', points: [[50, 40], [326, 40]], cls: 'dg-c-grid' }],
  },
  {
    ...common, type: 'layers', columns: [], legend: [{ key: 'you', label: '利用者', n: 1 }],
    shapes: [{ t: 'text', x: 50, y: 40, lines: ['利用者', 'が管理'], size: 10, anchor: 'middle', cls: 'dg-c-cell-text' }],
  },
];

it.each(charts.map((scene) => [scene.type, scene] as const))('%s に題、代替文、描画を付けます', (_type, scene) => {
  render(<DiagramView scene={scene} caption="使い方を示す図です。" />);
  const image = screen.getByRole('img', { name: scene.title });
  expect(image).toHaveAccessibleDescription(scene.alt);
  expect(image.querySelector('title')).toHaveTextContent(scene.title);
  expect(image).toHaveAttribute('viewBox', '0 0 328 120');
  expect(image.querySelector('.' + scene.shapes[0].cls.split(' ')[0])).not.toBeNull();
  expect(screen.getByText('使い方を示す図です。').tagName).toBe('FIGCAPTION');
  if (scene.type === 'position') {
    expect(screen.getByRole('listitem')).toHaveTextContent('1保管する（補足です。）');
    expect(screen.getByText('位置は順位で、比率ではありません。')).toBeVisible();
  }
  if (scene.type === 'timeline') expect(screen.getByText('目盛りは等間隔で、時間の長さの比ではありません。')).toBeVisible();
  if (scene.type === 'layers') expect(image.querySelector('tspan:last-child')).toHaveAttribute('dy', '13');
});

it('たどる表示で答えに応じて進み、道以外を薄くし、前の質問や最初に戻せます', async () => {
  const user = userEvent.setup();
  const { container } = render(<DiagramView scene={decision} />);
  expect(screen.getByRole('button', { name: '全体' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.is-dim')).toBeNull();
  const follow = screen.getByRole('button', { name: '質問に答えてたどる' });
  await user.click(follow);
  expect(follow).toHaveAttribute('aria-pressed', 'true');
  const live = within(container.querySelector<HTMLElement>('[aria-live="polite"]')!);
  expect(live.getByText('Q1 保存しますか？')).toBeVisible();
  expect(container.querySelector('[data-owner="q2"].dg-c-link')).toHaveClass('is-dim');
  await user.click(live.getByRole('button', { name: 'はい' }));
  expect(live.getByText('Q1 保存しますか？ → はい')).toBeVisible();
  expect(live.getByText('Q2 すぐに読みますか？')).toBeVisible();
  expect(container.querySelector('[data-owner="q2"].dg-c-link')).not.toHaveClass('is-dim');
  await user.click(live.getByRole('button', { name: 'はい' }));
  expect(live.getByText('結論: 保存先を選びます')).toBeVisible();
  expect(live.getByText('サービス: Amazon S3')).toBeVisible();
  expect(live.getByText('同じデータに何度もアクセスするためです。')).toBeVisible();
  expect(container.querySelector('[data-owner="r1"]')).not.toHaveClass('is-dim');
  expect(container.querySelector('[data-owner="r2"]')).toHaveClass('is-dim');
  await user.click(live.getByRole('button', { name: '1 つ戻る' }));
  await user.click(live.getByRole('button', { name: 'いいえ' }));
  await user.click(live.getByRole('button', { name: '最初から' }));
  expect(live.getByText('Q1 保存しますか？')).toBeVisible();
  expect(container.querySelector('[data-owner="q2"].dg-c-link')).toHaveClass('is-dim');
  await user.click(screen.getByRole('button', { name: '全体' }));
  expect(container.querySelector('.is-dim')).toBeNull();
  const summary = screen.getByText('すべての分かれ道を文章で読む');
  await user.click(summary);
  expect(summary.closest('details')?.querySelectorAll('li')).toHaveLength(5);
});

it('位置づけ図は、全画面の表示にも番号の凡例を出します', async () => {
  const user = userEvent.setup();
  render(<DiagramView scene={charts[1]} />);
  await user.click(screen.getByRole('button', { name: '図を画面いっぱいに広げる' }));
  const dialog = screen.getByRole('dialog', { name: common.title });
  expect(within(dialog).getByText('保管する')).toBeInTheDocument();
  expect(within(dialog).getByText('位置は順位で、比率ではありません。')).toBeInTheDocument();
});

it('図のクリックと広げるボタンで開き、閉じるボタンと Esc でフォーカスを戻します', async () => {
  const user = userEvent.setup();
  render(<DiagramView scene={charts[2]} altId="page-alt" />, {
    wrapper: ({ children }) => <>{children}<p id="page-alt">ページ側の代替文です。</p></>,
  });
  const expand = screen.getByRole('button', { name: '図を画面いっぱいに広げる' });
  await user.click(screen.getByRole('img'));
  const dialog = screen.getByRole('dialog', { name: common.title });
  expect(within(dialog).getByRole('img')).toHaveClass('dg-svg--full');
  expect(within(dialog).getByRole('img')).toHaveAccessibleDescription('ページ側の代替文です。');
  const close = within(dialog).getByRole('button', { name: '閉じる' });
  expect(close).toHaveFocus();
  await user.click(close);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(expand).toHaveFocus();
  await user.click(expand);
  expect(screen.getByRole('dialog')).toBeVisible();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(expand).toHaveFocus();
});

it('構成図は元の図の段階を全画面に引き継ぎ、全画面で進めた段階が閉じた後も残ります', async () => {
  const user = userEvent.setup();
  const scene: DiagramScene = {
    ...common, type: 'architecture', nodes: [], boxes: [], edges: [],
    steps: ['最初の経路です。', '次に切り替わる経路です。'].map((text) => ({ text, focus: [], edges: [], reveal: [], marks: [], badgeAt: null })),
  };
  render(<DiagramView scene={scene} />);
  await user.click(screen.getByRole('button', { name: '次へ' }));
  await user.click(screen.getByRole('button', { name: '図を画面いっぱいに広げる' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText('1 / 2')).toBeInTheDocument();
  await user.click(dialog.getByRole('button', { name: '次へ' }));
  expect(dialog.getByText('段階 2 / 全 2。次に切り替わる経路です。')).toBeVisible();
  await user.click(dialog.getByRole('button', { name: '閉じる' }));
  expect(screen.getByText('2 / 2')).toBeVisible();
  expect(screen.getByText('段階 2 / 全 2。次に切り替わる経路です。')).toBeVisible();
});

// DiagramChart.css と styles.css の --dg-* と同じ配色です。
const cell = { pale: '#e8f1fb', mid: '#667482', dark: '#101317', white: '#ffffff' };
const palettes = [
  {
    name: '明るい背景', bg: '#ffffff', text: '#1f2933', muted: '#52606d', outline: '#7b8794', line: '#1f2933',
    ask: '#ffffff', spanA: '#eaf6ee', spanB: '#e8f1fb', badge: '#1f2933', badgeText: '#ffffff',
    paleOutline: cell.mid, darkOutline: cell.dark,
    categories: ['#b4531c', '#8a6a00', '#2f7d4f', '#2a5fb0', '#6b4fbb', '#b3323f', '#a8327f', '#0f7286', '#52606d', '#17766b', '#5a6673'],
  },
  {
    name: '暗い背景', bg: '#191d23', text: '#e9ecf0', muted: '#b3bdc7', outline: '#8a96a3', line: '#d5dbe2',
    ask: '#1f242b', spanA: '#15291c', spanB: '#142236', badge: '#e9ecf0', badgeText: '#101317',
    paleOutline: cell.pale, darkOutline: cell.mid,
    categories: ['#f0a56e', '#e2c15a', '#7fcf9e', '#8db7f0', '#b9a4f0', '#f09aa2', '#ee9bcf', '#74cfe0', '#b3bdc7', '#6fd3c5', '#aab3bd'],
  },
];

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(color.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

it.each(palettes)('$nameで文字は 4.5:1、形の境目は 3:1 以上です', (c) => {
  function minimum(pairs: string[][], threshold: number) {
    for (const [a, b] of pairs) {
      const values = [luminance(a), luminance(b)];
      expect((Math.max(...values) + 0.05) / (Math.min(...values) + 0.05), `${a} ／ ${b}`).toBeGreaterThanOrEqual(threshold);
    }
  }
  minimum([
    ...[c.bg, c.ask, c.spanA, c.spanB].map((bg) => [c.text, bg]),
    [c.muted, c.bg], [c.muted, c.spanB], [c.badgeText, c.badge],
    ...c.categories.map((bg) => [c.badgeText, bg]),
    [cell.dark, cell.pale], [cell.white, cell.mid], [cell.white, cell.dark],
  ], 4.5);
  minimum([
    ...[c.bg, c.ask, c.spanA, c.spanB].map((bg) => [c.outline, bg]),
    [c.line, c.bg], [c.badge, c.bg], [c.badge, c.spanA], [c.badge, c.spanB],
    ...c.categories.flatMap((fill) => [[fill, c.bg], [fill, c.spanB]]),
    [cell.pale, cell.mid], [cell.mid, cell.dark], [cell.pale, cell.dark],
    [c.paleOutline, c.bg], [cell.mid, c.bg], [c.darkOutline, c.bg],
  ], 3);
});
