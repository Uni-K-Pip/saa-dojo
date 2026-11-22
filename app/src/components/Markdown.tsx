// Markdown の安全な表示（生の HTML は描画しない）。表（GFM）と囲み記事に対応する。
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { diagramRefOf } from '../../../scripts/lib/diagram-refs.mjs';
import { DiagramRef } from './DiagramRef';
import { CheckAnswerContext, InlineCheck, InlineCheckOption, InlineCheckReason, type CheckAnswer } from './InlineCheck';
import { remarkCallouts, remarkInlineChecks } from './markdown-plugins';

const QUESTION_ID = /^saa-(?:basics|[1-4]\.[1-5])-[a-z][a-z0-9]{0,5}-\d{3}$/;

interface Props {
  children: string;
  /** 本文中の問題 ID（`saa-…`）を差し替えて表示する（null を返せばそのまま） */
  renderQuestionRef?: (id: string) => ReactNode | null;
  onCheckAnswer?: (answer: CheckAnswer) => void;
}

function isExternal(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

const paragraph: Components['p'] = ({ node, children, ...props }) => {
  const image = node?.children.length === 1 ? node.children[0] : undefined;
  if (image?.type === 'element' && image.tagName === 'img' && typeof image.properties.src === 'string') {
    const ref = diagramRefOf(image.properties.src);
    if (ref) return <DiagramRef {...ref} caption={String(image.properties.alt ?? '')} />;
  }
  return <p {...props}>{children}</p>;
};

const image: Components['img'] = ({ node: _node, src, alt, ...props }) =>
  typeof src === 'string' && diagramRefOf(src) ? <a href={src}>図: {alt}</a> : <img src={src} alt={alt} {...props} />;

export function Markdown({ children, renderQuestionRef, onCheckAnswer }: Props) {
  const components: Components = {
    p: paragraph,
    img: image,
    section: InlineCheck,
    li: InlineCheckOption,
    div: InlineCheckReason,
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
      <CheckAnswerContext.Provider value={onCheckAnswer}>
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkInlineChecks, remarkCallouts]} components={components} skipHtml>
          {children}
        </ReactMarkdown>
      </CheckAnswerContext.Provider>
    </div>
  );
}
