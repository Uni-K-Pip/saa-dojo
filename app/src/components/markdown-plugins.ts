// Markdown の変換プラグイン。囲み記事（`> **試験のポイント**`・`> **ひっかけ注意**`）を色付きの枠にする。
import type { Blockquote, Parent, PhrasingContent, Root, RootContent } from 'mdast';
import type { Plugin } from 'unified';
import { isInlineCheckBlockquote, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
import { hashString } from '../domain/rng';

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
  if (bq.data?.hName) return;
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

function walk(node: Parent, visit: (bq: Blockquote) => RootContent[] | void): void {
  const children = node.children as RootContent[];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const after = child.type === 'blockquote' ? visit(child) : undefined;
    if (after) {
      children.splice(i + 1, 0, ...after);
      i += after.length;
      continue;
    }
    if ('children' in child) walk(child as Parent, visit);
  }
}

export function remarkCallouts() {
  return (tree: Root) => {
    walk(tree, transform);
  };
}

function plainText(node: RootContent | Root): string {
  if (node.type === 'paragraph' || node.type === 'heading') return textOf(node.children);
  if ('children' in node) return (node.children as RootContent[]).map(plainText).join(' ');
  if ('value' in node) return node.value;
  return '';
}

export const remarkInlineChecks: Plugin<[], Root> = function () {
  return (tree: Root, file: { toString(): string }) => {
    const markdown = file.toString();
    const checks = new Map(parseInlineChecks(markdown).filter((c) => !c.problems.length).map((c) => [c.line, c]));
    if (!checks.size) return;
    const source = markdown.split(/\r\n?|\n/);
    const parse = (value: string) => this.parse(value) as Root;
    const blocks = (value: string) => parse(value).children.filter(
      (node): node is Blockquote['children'][number] => node.type !== 'yaml',
    );
    walk(tree, (bq) => {
      const position = bq.position;
      const check = checks.get(position?.start.line ?? 0);
      if (!check || !position || !isInlineCheckBlockquote(bq, check)) return;
      const questionBlocks = blocks(check.question);
      const questionText = questionBlocks.map(plainText).join(' ').replace(/\s+/g, ' ').trim();
      const question = questionBlocks.length === 1 && questionBlocks[0].type === 'paragraph'
        ? questionBlocks[0] : { type: 'paragraph' as const, children: [{ type: 'text' as const, value: questionText }] };
      const checkId = `c${hashString(check.questionKey).toString(16).padStart(8, '0')}`;
      bq.data = {
        hName: 'section',
        hProperties: {
          className: ['callout', 'inline-check'], 'aria-label': 'その場の確認',
          dataCheckId: checkId, dataCorrectChoice: check.options.findIndex(({ correct }) => correct) + 1,
        },
      };
      bq.children = [
        {
          type: 'paragraph', data: { hProperties: { className: ['callout-title'] } },
          children: [{ type: 'text', value: 'その場の確認' }],
        },
        question,
        {
          type: 'list', ordered: false, spread: false,
          children: check.options.map(({ text }, i) => ({
            type: 'listItem', spread: false, data: { hProperties: { dataCheckChoice: i + 1 } },
            children: [{
              type: 'paragraph',
              children: [{ type: 'text', value: plainText(parse(text)) }],
            }],
          })),
        },
        {
          type: 'blockquote', data: { hName: 'div', hProperties: { dataCheckReason: true } },
          children: blocks(check.reason),
        },
      ];
      // Markdown が引用に続く行を取り込んだ場合は、引用の外へ戻します。
      const continuation = source.slice(check.endLine, position.end.line);
      const firstOutside = continuation.findIndex((line) => !/^[ \t]*>/.test(line));
      return firstOutside < 0 ? [] : blocks(continuation.slice(firstOutside).join('\n'));
    });
  };
};

