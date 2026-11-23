// Markdown の変換プラグイン。囲み記事（`> **試験のポイント**`・`> **ひっかけ注意**`）を色付きの枠にする。
import type { Blockquote, Parent, Root, RootContent } from 'mdast';
import type { Plugin } from 'unified';
import { inlineCheckId, isInlineCheckBlockquote, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
import { calloutBodyChildren, calloutOf, textOf } from './markdown-callouts.mjs';

function transform(bq: Blockquote): void {
  if (bq.data?.hName) return;
  const c = calloutOf(bq);
  if (!c) return;
  const first = bq.children[0];
  if (first?.type !== 'paragraph') return;
  first.children = calloutBodyChildren(first);
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
    const checks = new Map(parseInlineChecks(markdown).filter((c) => !c.problems.length && !c.followingCallout).map((c) => [c.line, c]));
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
      bq.data = {
        hName: 'section',
        hProperties: {
          className: ['callout', 'inline-check'], 'aria-label': 'その場の確認',
          dataCheckId: inlineCheckId(check.questionKey), dataCorrectChoice: check.options.findIndex(({ correct }) => correct) + 1,
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

