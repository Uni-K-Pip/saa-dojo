import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadDiagram } from '../content/loader';
import type { DiagramScene } from '../content/types';
import { Markdown } from './Markdown';

vi.mock('../content/loader', () => ({ loadDiagram: vi.fn() }));

const html = (md: string) => renderToStaticMarkup(createElement(Markdown, null, md));

describe('Markdown の囲み記事', () => {
  it('試験のポイント・ひっかけ注意を色付きの枠にする', () => {
    const out = html('> **試験のポイント**\n> 本文です。\n\n> **ひっかけ注意**\n> 注意です。\n\n> ふつうの引用');
    expect(out).toMatch(/<aside class="callout tip" aria-label="試験のポイント">\s*<p class="callout-title">試験のポイント<\/p>\s*<p>本文です。<\/p>/);
    expect(out).toMatch(/<aside class="callout trap" aria-label="ひっかけ注意">\s*<p class="callout-title">ひっかけ注意<\/p>\s*<p>注意です。<\/p>/);
    expect(out).toContain('<blockquote>');
  });

  it('見出しだけの段落と、コロン付きの見出しも扱う', () => {
    const out = html('> **ひっかけ注意：**\n>\n> 段落が分かれた本文');
    expect(out).toMatch(/<p class="callout-title">ひっかけ注意<\/p>\s*<p>段落が分かれた本文<\/p>/);
  });

  it('表を描画し、生の HTML は描画しない', () => {
    const out = html('| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script><b>太字</b>');
    expect(out).toContain('<table>');
    expect(out).toContain('<td>1</td>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<b>');
  });

  it('外部リンクは新しいタブで開く', () => {
    const out = html('[AWS](https://docs.aws.amazon.com/)');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe('Markdown の図の参照', () => {
  const scene: DiagramScene = {
    id: 'dg-test', type: 'architecture', title: '表示する構成図', alt: '図の代替文です。',
    width: 328, height: 100, status: 'pending', boxes: [], nodes: [], edges: [],
    steps: [{ text: '段階の説明です。', focus: [], edges: [], marks: [], reveal: [], badgeAt: null }],
  };

  it('段落の画像 1 つを図、キャプション、指定の段階に置き換えます', async () => {
    const data = Promise.resolve(scene);
    vi.mocked(loadDiagram).mockReturnValue(data);
    await act(async () => {
      render(createElement(Markdown, null, '![図のキャプション](#/diagrams/dg-test?step=1)'));
    });
    const image = await screen.findByRole('img', { name: scene.title });
    expect(image).toHaveAccessibleDescription(scene.alt);
    expect(image.closest('figure')?.parentElement?.tagName).toBe('DIV');
    expect(screen.getByText('図のキャプション').tagName).toBe('FIGCAPTION');
    expect(screen.getByText('段階 1 / 全 1。段階の説明です。')).toBeVisible();
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeInTheDocument();
    expect(loadDiagram).toHaveBeenCalledWith('dg-test');
  });

  it('文の途中の図の画像だけをリンクにし、ほかの画像も出します', () => {
    render(createElement(Markdown, null, '次の ![構成を見る](#/diagrams/dg-test?step=1) と ![別の画像](example.png) を見ます。'));
    expect(screen.getByRole('link', { name: '図: 構成を見る' })).toHaveAttribute('href', '#/diagrams/dg-test?step=1');
    expect(screen.getByRole('img', { name: '別の画像' })).toHaveAttribute('src', 'example.png');
  });

  it('図がなければ本文だけを表示します', async () => {
    const missing = Promise.resolve(null);
    vi.mocked(loadDiagram).mockReturnValue(missing);
    await act(async () => {
      render(createElement(Markdown, null, '本文です。\n\n![省かれた図](#/diagrams/dg-missing)'));
    });
    expect(screen.getByText('本文です。')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('図を読み込んでいます…')).not.toBeInTheDocument();
    expect(screen.queryByText('省かれた図')).not.toBeInTheDocument();
  });

  it('図の読み込みに失敗しても、図だけを省いて本文を残します', async () => {
    const failed = Promise.reject(new Error('通信できません'));
    failed.catch(() => undefined);
    vi.mocked(loadDiagram).mockReturnValue(failed);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      render(createElement(Markdown, null, '本文です。\n\n![読めない図](#/diagrams/dg-broken)\n\n続きの本文です。'));
    });
    spy.mockRestore();
    expect(screen.getByText('本文です。')).toBeVisible();
    expect(screen.getByText('続きの本文です。')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('埋め込んだ図の代替文を、図の下で開いて読めます', async () => {
    vi.mocked(loadDiagram).mockReturnValue(Promise.resolve(scene));
    await act(async () => {
      render(createElement(Markdown, null, '![図](#/diagrams/dg-test)'));
    });
    await screen.findByRole('img', { name: scene.title });
    expect(screen.getByText('図の内容を文章で読む').tagName).toBe('SUMMARY');
    expect(screen.getByText(scene.alt).closest('details')).not.toBeNull();
  });
});

describe('Markdown のその場の確認', () => {
  const example = [
    '> **その場の確認**',
    '> **保存**できますか？',
    '>',
    '> - [ ] できません',
    '> * [X] できます',
    '>',
    '> 保存する仕組みがあるからです。',
  ].join('\n');

  it('選んだ後だけ答えと理由を出し、回答を渡して、もう一度選べます', async () => {
    const user = userEvent.setup();
    const onCheckAnswer = vi.fn();
    const { rerender, unmount } = render(createElement(Markdown, { onCheckAnswer, children: example }));
    const check = within(screen.getByRole('region', { name: 'その場の確認' }));
    expect(check.getByText('保存', { selector: 'strong' })).toBeVisible();
    expect(check.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(check.queryByText('正解')).not.toBeInTheDocument();
    expect(check.queryByText('保存する仕組みがあるからです。')).not.toBeInTheDocument();
    await user.click(check.getByRole('button', { name: 'できません' }));
    expect(check.getByText('あなたの答え')).toBeVisible();
    expect(check.getByText('正解')).toBeVisible();
    expect(check.getByText('不正解です。')).toBeVisible();
    expect(check.getByText('保存する仕組みがあるからです。')).toBeVisible();
    expect(check.getByRole('button', { name: /できません/ })).toBeDisabled();
    expect(check.getByRole('button', { name: /^できます/ })).toBeDisabled();
    expect(onCheckAnswer).toHaveBeenNthCalledWith(1, { checkId: 'c5e320e13', choice: 1, correct: false });
    rerender(createElement(Markdown, { onCheckAnswer: (a) => onCheckAnswer(a), children: example }));
    expect(check.getByText('不正解です。')).toBeVisible();
    await user.click(check.getByRole('button', { name: 'もう一度' }));
    expect(check.queryByText('保存する仕組みがあるからです。')).not.toBeInTheDocument();
    await user.click(check.getByRole('button', { name: 'できます' }));
    expect(check.getByText('正解です。')).toBeVisible();
    expect(onCheckAnswer).toHaveBeenNthCalledWith(2, { checkId: 'c5e320e13', choice: 2, correct: true });
    unmount();
    render(createElement(Markdown, { onCheckAnswer, children: example }));
    expect(screen.queryByText('正解です。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'できます' })).toBeEnabled();
  });

  it.each([
    example.replace('[X]', '[ ]'),
    example.replace('> 保存する仕組みがあるからです。', ''),
    example.replace('> * [X]', '> 別の行です。\n> * [X]'),
  ])('形の崩れた確認はふつうの引用を残します（%#）', (markdown) => {
    const { container } = render(createElement(Markdown, null, markdown));
    expect(screen.queryByRole('region', { name: 'その場の確認' })).not.toBeInTheDocument();
    expect(container.querySelector('blockquote')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('引用記号のない直後の行は回答前も本文に表示します', () => {
    render(createElement(Markdown, null, `${example}\n引用の外にある本文です。`));
    expect(screen.getByText('引用の外にある本文です。')).toBeVisible();
    expect(screen.queryByText('保存する仕組みがあるからです。')).not.toBeInTheDocument();
  });
});
