import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Markdown } from './Markdown';

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
