import { CALLOUT_KINDS } from '../../../scripts/lib/inline-check.mjs';

export function textOf(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text' || node.type === 'inlineCode') return node.value;
    return node.children ? textOf(node.children) : '';
  }).join('');
}

/** 引用の先頭が囲み記事の見出しなら、その種類と見出しを返します。 */
export function calloutOf(bq) {
  const first = bq.children[0];
  if (first?.type !== 'paragraph') return null;
  const head = first.children[0];
  if (head?.type !== 'strong') return null;
  const title = textOf(head.children).trim().replace(/[：:]$/, '');
  const kind = CALLOUT_KINDS[title];
  return kind ? { kind, title } : null;
}

/** 囲み記事の先頭段落から見出しと直後の改行やコロンを取り除きます。 */
export function calloutBodyChildren(paragraph) {
  const children = paragraph.children.slice(1);
  while (children.length > 0) {
    const node = children[0];
    if (node.type === 'break') {
      children.shift();
      continue;
    }
    if (node.type === 'text') {
      const value = node.value.replace(/^[\s:：]+/, '');
      if (!value) {
        children.shift();
        continue;
      }
      children[0] = { ...node, value };
    }
    break;
  }
  return children;
}
