// Markdown の安全な表示（生の HTML は描画しない）。表（GFM）と囲み記事に対応する。
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkCallouts } from './markdown-plugins';

const QUESTION_ID = /^saa-(?:basics|[1-4]\.[1-5])-[a-z][a-z0-9]{0,5}-\d{3}$/;

interface Props {
  children: string;
  /** 本文中の問題 ID（`saa-…`）を差し替えて表示する（null を返せばそのまま） */
  renderQuestionRef?: (id: string) => ReactNode | null;
}

function isExternal(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

export function Markdown({ children, renderQuestionRef }: Props) {
  const components: Components = {
    a: ({ href, children: c }) =>
      isExternal(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {c}
        </a>
      ) : (
        <a href={href}>{c}</a>
      ),
    code: ({ className, children: c }) => {
      const text = typeof c === 'string' ? c : Array.isArray(c) && c.length === 1 && typeof c[0] === 'string' ? c[0] : null;
      if (renderQuestionRef && text && QUESTION_ID.test(text)) {
        const node = renderQuestionRef(text);
        if (node) return <>{node}</>;
      }
      return <code className={className}>{c}</code>;
    },
    table: ({ children: c }) => (
      <div className="table-wrap">
        <table>{c}</table>
      </div>
    ),
  };
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkCallouts]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
