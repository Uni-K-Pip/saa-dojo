// Markdown の変換プラグイン。囲み記事（`> **試験のポイント**`・`> **ひっかけ注意**`）を色付きの枠にする。
import type { Blockquote, Parent, PhrasingContent, Root, RootContent } from 'mdast';

export const CALLOUT_KINDS: Record<string, 'tip' | 'trap'> = {
  試験のポイント: 'tip',
  ひっかけ注意: 'trap',
};

function textOf(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text' || n.type === 'inlineCode') return n.value;
      if ('children' in n) return textOf(n.children as PhrasingContent[]);
      return '';
    })
    .join('');
}

/** 引用の先頭が囲み記事の見出しなら、その種類と見出しを返す */
export function calloutOf(bq: Blockquote): { kind: 'tip' | 'trap'; title: string } | null {
  const first = bq.children[0];
  if (first?.type !== 'paragraph') return null;
  const head = first.children[0];
  if (head?.type !== 'strong') return null;
  const title = textOf(head.children).trim().replace(/[：:]$/, '');
  const kind = CALLOUT_KINDS[title];
  return kind ? { kind, title } : null;
}

function transform(bq: Blockquote): void {
  const c = calloutOf(bq);
  if (!c) return;
  const first = bq.children[0];
  if (first?.type !== 'paragraph') return;
  first.children.shift();
  // 見出しの直後の改行やコロンを取り除く
  while (first.children.length > 0) {
    const n = first.children[0]!;
    if (n.type === 'break') {
      first.children.shift();
      continue;
    }
    if (n.type === 'text') {
      n.value = n.value.replace(/^[\s:：]+/, '');
      if (!n.value) {
        first.children.shift();
        continue;
      }
    }
    break;
  }
  if (first.children.length === 0) bq.children.shift();
  bq.data = { ...(bq.data ?? {}), hName: 'aside', hProperties: { className: ['callout', c.kind], 'aria-label': c.title } } as Blockquote['data'];
  bq.children.unshift({
    type: 'paragraph',
    data: { hProperties: { className: ['callout-title'] } } as Blockquote['data'],
    children: [{ type: 'text', value: c.title }],
  });
}

function walk(node: Parent): void {
  for (const child of node.children as RootContent[]) {
    if (child.type === 'blockquote') transform(child);
    if ('children' in child) walk(child as Parent);
  }
}

export function remarkCallouts() {
  return (tree: Root) => {
    walk(tree);
  };
}

