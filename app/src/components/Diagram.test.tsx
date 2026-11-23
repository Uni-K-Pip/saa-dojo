import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DiagramScene } from '../content/types';
import { Diagram, stepView } from './Diagram';

// レイアウト済みの小さな図（scripts/lib/diagram-layout.mjs の出力と同じ形）
const scene: DiagramScene = {
  id: 'dg-test',
  type: 'architecture',
  title: 'テスト用の構成図',
  alt: '利用者は本番のリージョンのアプリケーションを使います。本番が止まると、復旧先のアプリケーションへ切り替えます。',
  width: 200,
  height: 160,
  boxes: [
    { id: 'region-p', kind: 'region', label: '本番', x: 2, y: 60, w: 90, h: 70, depth: 1, parent: null, tag: { x: 54, y: 53, w: 30, h: 14 } },
    { id: 'region-d', kind: 'region', label: '復旧先', x: 108, y: 60, w: 90, h: 70, depth: 1, parent: null, tag: null },
  ],
  nodes: [
    { id: 'user', kind: 'actor', category: 'other', short: null, label: '利用者', x: 72, y: 2, w: 56, h: 42, parent: null, tag: null },
    { id: 'app-p', kind: 'ec2', category: 'compute', short: 'EC2', label: 'アプリ', x: 19, y: 75, w: 56, h: 42, parent: 'region-p', tag: null },
    { id: 'app-d', kind: 'ec2', category: 'compute', short: 'EC2', label: '復旧用', x: 125, y: 75, w: 56, h: 42, parent: 'region-d', tag: { x: 145, y: 68, w: 30, h: 14 } },
  ],
  edges: [
    { id: 'e1', kind: 'request', from: 'user', to: 'app-p', both: false, points: [[90, 44], [90, 52], [47, 52], [47, 75]], label: null, labelAt: null, labelBox: null },
    { id: 'e2', kind: 'request', from: 'user', to: 'app-d', both: false, points: [[110, 44], [110, 52], [153, 52], [153, 75]], label: '切り替え後', labelAt: [131.5, 45.5], labelBox: { x: 103.5, y: 39, w: 56, h: 13 } },
  ],
  steps: [
    { text: '平常時は、本番のリージョンのアプリケーションがリクエストを処理します。', focus: ['user', 'app-p'], edges: ['e1'], reveal: [], marks: [{ id: 'app-d', state: 'standby' }], badgeAt: [99, 48] },
    { text: '本番のリージョンが止まりました。復旧先へ切り替える準備をします。', focus: ['region-p'], edges: [], reveal: [], marks: [{ id: 'region-p', state: 'down' }], badgeAt: [80, 70] },
    { text: '復旧先のアプリケーションへ切り替え、利用者のリクエストを処理します。', focus: ['user', 'app-d'], edges: ['e2'], reveal: ['e2'], marks: [], badgeAt: [119, 48] },
  ],
  status: 'pending',
};

const edgeShown = (container: HTMLElement, id: string) => container.querySelector(`[data-edge-id="${id}"]`) !== null;

describe('Diagram', () => {
  it('題と代替文を SVG に付ける（代替文は 1 か所だけ。desc は使わない）', () => {
    render(<Diagram scene={scene} />);
    const img = screen.getByRole('img');
    expect(img.querySelector('title')?.textContent).toBe(scene.title);
    expect(img.querySelector('desc')).toBeNull();
    expect(img).toHaveAccessibleName(scene.title);
    expect(img).toHaveAccessibleDescription(scene.alt);
    expect(screen.getAllByText(scene.alt)).toHaveLength(1);
  });

  it('altId を渡すと、ページ側の代替文の要素を説明に使う', () => {
    render(
      <>
        <Diagram scene={scene} altId="page-alt" />
        <p id="page-alt">ページに出した代替文です。</p>
      </>,
    );
    expect(screen.getByRole('img')).toHaveAccessibleDescription('ページに出した代替文です。');
    expect(screen.queryByText(scene.alt)).not.toBeInTheDocument();
  });

  it('表示の倍率の上限に使う幅を CSS 変数で渡す', () => {
    render(<Diagram scene={scene} />);
    expect(screen.getByRole('img').style.getPropertyValue('--dg-w')).toBe('200');
  });

  it('「次へ」「前へ」で段階の説明と番号が変わる。すべての段階を文章で読める', async () => {
    const user = userEvent.setup();
    render(<Diagram scene={scene} />);
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    // 端の段階では aria-disabled（フォーカスは外れない。押しても動かない）
    const prev = screen.getByRole('button', { name: '前へ' });
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(prev).not.toBeDisabled();
    await user.click(prev);
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe(`段階 1 / 全 3。${scene.steps[0].text}`);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    // 段階 1 の印（待機）
    expect(screen.getByText('待機')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(live.textContent).toBe(`段階 2 / 全 3。${scene.steps[1].text}`);
    expect(screen.queryByText('待機')).not.toBeInTheDocument();
    // その段階だけの印（停止）の札が出る
    expect(screen.getByText('停止')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '前へ' }));
    expect(live.textContent).toBe(`段階 1 / 全 3。${scene.steps[0].text}`);
    expect(screen.queryByText('停止')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    await user.click(screen.getByRole('button', { name: '次へ' }));
    const next = screen.getByRole('button', { name: '次へ' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    await user.click(next);
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    const list = screen.getByText('すべての段階を文章で読む').closest('details')!;
    expect(list.querySelectorAll('li')).toHaveLength(3);
  });

  it('reveal の線は、その段階の前では出ない（段階 0 ではすべて見せる）', async () => {
    const user = userEvent.setup();
    const { container } = render(<Diagram scene={scene} />);
    expect(edgeShown(container, 'e2')).toBe(true);
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(edgeShown(container, 'e2')).toBe(false);
    expect(screen.queryByText('切り替え後')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(edgeShown(container, 'e2')).toBe(false);
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(edgeShown(container, 'e2')).toBe(true);
  });

  it('図にフォーカスがあるとき、左右キーで段階を移る', async () => {
    const user = userEvent.setup();
    render(<Diagram scene={scene} />);
    const frame = screen.getByRole('group', { name: `図: ${scene.title}` });
    expect(screen.getByText('図かボタンを選んでいるときは、左右のキーでも段階を移れます。')).toBeVisible();
    frame.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('step を指定すると、その段階で止めて操作を隠す', () => {
    const { container } = render(<Diagram scene={scene} step={1} />);
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(`段階 1 / 全 3。${scene.steps[0].text}`);
    expect(edgeShown(container, 'e2')).toBe(false);
  });

  it('段階 0 で止めた図は「全体を表示しています。」だけを出す', () => {
    render(<Diagram scene={scene} step={0} />);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('全体を表示しています。');
  });

  it('描く順: 入れ物 → 線 → 入れ物のラベル → 部品 → 線のラベル → 札 → 番号', async () => {
    const user = userEvent.setup();
    const { container } = render(<Diagram scene={scene} />);
    await user.click(screen.getByRole('button', { name: '次へ' }));
    const layers = [...container.querySelectorAll('svg > g')].map((g) => g.getAttribute('class'));
    expect(layers).toEqual([
      'dg-layer-boxes',
      'dg-layer-edges',
      'dg-layer-box-labels',
      'dg-layer-nodes',
      'dg-layer-edge-labels',
      'dg-layer-marks',
      'dg-layer-badges',
    ]);
    // 札はレイアウトが決めた矩形に出す
    const tag = container.querySelector('.dg-tag--standby rect')!;
    expect([tag.getAttribute('x'), tag.getAttribute('y')]).toEqual(['145', '68']);
  });

  it('focus 以外を薄くし、focus の入れ物の中身は薄くしない', () => {
    const v1 = stepView(scene, 1);
    expect(v1.dim.has('app-d')).toBe(true);
    expect(v1.dim.has('app-p')).toBe(false);
    expect(v1.dim.has('region-p')).toBe(false); // focus を含む入れ物
    expect(v1.active.has('e1')).toBe(true);
    const v2 = stepView(scene, 2);
    expect(v2.dim.has('app-p')).toBe(false); // focus の入れ物の中身
    expect(v2.dim.has('user')).toBe(true);
    expect(v2.marks.get('region-p')).toBe('down');
    expect(stepView(scene, 0).dim.size).toBe(0);
  });

  it('入れ物のラベルは、scene の labelBox の位置に描く（ない古いデータは左上）', () => {
    const moved: DiagramScene = {
      ...scene,
      boxes: [{ ...scene.boxes[0], labelBox: { x: 40, y: 61, w: 24, h: 13 } }, scene.boxes[1]],
    };
    const { container } = render(<Diagram scene={moved} step={0} />);
    const labels = container.querySelectorAll('.dg-box-label');
    expect(labels[0].getAttribute('x')).toBe('42');
    expect(labels[0].getAttribute('y')).toBe('71');
    expect(labels[1].getAttribute('x')).toBe('114');
    expect(labels[1].getAttribute('y')).toBe('71');
  });

  it('停止した部品の × は、部品の文字より先（後ろ）に描く', () => {
    const down: DiagramScene = {
      ...scene,
      steps: [{ ...scene.steps[0], marks: [{ id: 'app-p', state: 'down' }] }],
    };
    const { container } = render(<Diagram scene={down} step={1} />);
    const node = container.querySelector('[data-id="app-p"]')!;
    const kids = [...node.children].map((c) => c.getAttribute('class'));
    expect(node.getAttribute('class')).toContain('is-down');
    expect(kids.indexOf('dg-down-x')).toBeGreaterThan(-1);
    expect(kids.indexOf('dg-down-x')).toBeLessThan(kids.indexOf('dg-node-short'));
    expect(kids.indexOf('dg-down-x')).toBeLessThan(kids.indexOf('dg-node-label'));
  });
});
