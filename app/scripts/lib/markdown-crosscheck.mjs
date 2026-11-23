import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { parseDiagramRefs } from '../../../scripts/lib/diagram.mjs';
import { isInlineCheckBlockquote, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';

const parser = unified().use(remarkParse).use(remarkGfm);

function walk(node, visit) {
  if (visit(node) === false) return;
  for (const child of node.children ?? []) walk(child, visit);
}

function inlineCheckHeadingLine(node, lines) {
  const paragraph = node.children[0];
  const head = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
  if (head?.type !== 'strong' || head.children.length !== 1) return undefined;
  const title = head.children[0];
  if (title.type !== 'text' || title.value !== 'その場の確認') return undefined;
  const { start, end } = head.position;
  // 問いが同じ段落に続く場合でも、見出しは 1 行を占めます。
  if (start.line === end.line && !lines[end.line - 1].slice(end.column - 1).trim()) return start.line;
}

function inlineCheckDifferences(markdown, tree) {
  const pending = new Set(parseInlineChecks(markdown).filter(({ problems }) => problems.length === 0).map(({ line }) => line));
  const unconverted = new Set();
  const lines = markdown.split(/\r\n?|\n/);
  walk(tree, (node) => {
    if (node.type !== 'blockquote') return;
    const line = node.position.start.line;
    if (pending.has(line) && isInlineCheckBlockquote(node, line)) {
      pending.delete(line);
      // 表示プラグインは変換した引用の中をたどりません。
      return false;
    }
    const headingLine = inlineCheckHeadingLine(node, lines);
    if (headingLine !== undefined) unconverted.add(headingLine);
  });
  return [...new Set([...pending, ...unconverted])].map((line) => ({
    line,
    message: 'その場の確認が表示では確認として扱われません（コードブロック・HTML・前の引用とのつながりなど）。書き方を直してください。',
  }));
}

function diagramRefDifferences(markdown, tree) {
  const checked = parseDiagramRefs(markdown, { withLine: true });
  const hasReference = checked.some(({ reference }) => reference);
  const pending = new Map();
  for (const { href, line, reference } of checked) {
    if (reference) continue;
    if (!pending.has(href)) pending.set(href, []);
    pending.get(href).push(line);
  }
  const definitions = new Map();
  walk(tree, (node) => {
    if (node.type !== 'definition') return;
    const id = node.identifier.toUpperCase();
    // 表示と同じく、同じ名前の定義は先に現れたものを使います。
    if (!definitions.has(id)) definitions.set(id, node.url);
  });

  const differences = [];
  const unmatched = [];
  const report = (href, line) => differences.push({
    line,
    message: `図の参照 ${href} を、検査と表示で違って読んでいます。` +
      '`![キャプション](#/diagrams/<id>)` の形で、コードの外に書いてください。',
  });
  walk(tree, (node) => {
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const href = definitions.get(node.identifier.toUpperCase());
      if (!hasReference && href?.startsWith('#/diagrams/')) report(href, node.position.start.line);
    } else if ((node.type === 'image' || node.type === 'link') && node.url.startsWith('#/diagrams/')) {
      const line = node.position.start.line;
      const validated = pending.get(node.url);
      const sameLine = validated?.indexOf(line) ?? -1;
      if (sameLine >= 0) validated.splice(sameLine, 1);
      else unmatched.push({ href: node.url, line });
    }
  });
  // 行の一致を先に使い、残りは href の出現回数で照合します。
  for (const { href, line } of unmatched) {
    const validated = pending.get(href);
    if (validated?.length) validated.shift();
    else report(href, line);
  }
  for (const [href, lines] of pending) {
    for (const line of lines) report(href, line);
  }
  return differences;
}

/** 本文を行単位の検査と表示で読み、判定が異なる箇所を本文の行番号で返します。 */
export function crosscheckMarkdown(markdown) {
  const tree = parser.runSync(parser.parse(markdown));
  return [...inlineCheckDifferences(markdown, tree), ...diagramRefDifferences(markdown, tree)].sort((a, b) => a.line - b.line);
}
