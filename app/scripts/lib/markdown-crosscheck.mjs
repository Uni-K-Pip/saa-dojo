import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { parseDiagramRefs } from '../../../scripts/lib/diagram.mjs';
import { isInlineCheckBlockquote, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';

const parser = unified().use(remarkParse).use(remarkGfm);

function walk(node, visit, inQuote = false, parent = undefined) {
  if (visit(node, inQuote, parent) === false) return;
  for (const child of node.children ?? []) walk(child, visit, inQuote || node.type === 'blockquote', node);
}

function textOf(node) {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

const isCheckTitle = (node) => textOf(node).trim().replace(/[：:]$/, '').trimEnd() === 'その場の確認';

/** 強調より前の、同じ親の中身が空白と記号だけ（文字も数字もない）なら、段落の先頭とみなします。 */
function leadsParent(node, parent) {
  const before = parent?.children.slice(0, parent.children.indexOf(node)) ?? [];
  return !/[\p{L}\p{N}]/u.test(before.map(textOf).join(''));
}

/** 「その場の確認」の見出しに見えるもの: 見出し（`###` など）と、段落の先頭の強調 */
function looksLikeCheckTitle(node, parent) {
  if (node.type === 'heading') return isCheckTitle(node);
  const emphasis = (n) => n?.type === 'strong' || n?.type === 'emphasis';
  // `***…***` のような入れ子は、いちばん外側の強調で段落の先頭かを見ます。
  return emphasis(node) && !emphasis(parent) && isCheckTitle(node) && leadsParent(node, parent);
}

function hasVisual(node) {
  return node.type === 'image' || node.type === 'imageReference'
    || (node.type === 'link' && node.url.startsWith('#/diagrams/'))
    || (node.children ?? []).some(hasVisual);
}

function inspectInlineChecks(markdown, tree) {
  const pending = new Map(parseInlineChecks(markdown).filter(({ problems }) => problems.length === 0).map((check) => [check.line, check]));
  const converted = new Map();
  const headings = new Set();
  const differences = [];
  walk(tree, (node, inQuote, parent) => {
    const line = node.position.start.line;
    if (node.type === 'blockquote') {
      const check = pending.get(line);
      if (check && isInlineCheckBlockquote(node, check)) {
        converted.set(node, check);
        pending.delete(line);
        if (node.position.end.line > check.endLine) differences.push({
          line: check.endLine + 1,
          message: '確認の理由のあとに引用の続きがあります。確認と次の本文を空行で分けてください。',
        });
        // 表示プラグインは変換した引用の元の子をたどりません。
        return false;
      }
    }
    if (inQuote && node.type === 'listItem' && typeof node.checked === 'boolean') {
      differences.push({
        line,
        message: '確認として表示されない引用の中にタスクリストがあります（正解の印がそのまま見えます）。その場の確認の書き方を直してください。',
      });
    }
    if (looksLikeCheckTitle(node, parent)) headings.add(line);
  });
  for (const line of headings) differences.push({
    line,
    message: '『その場の確認』の見出しが確認として扱われていません。見出しは `> **その場の確認**` だけの行にしてください。',
  });
  for (const line of pending.keys()) if (!headings.has(line)) differences.push({
    line,
    message: 'その場の確認が表示では確認として扱われません（コードブロック・HTML・前の引用とのつながりなど）。書き方を直してください。',
  });
  return { converted, differences };
}

function diagramRefDifferences(markdown, tree, converted) {
  const checked = parseDiagramRefs(markdown, { withLine: true });
  const hasReference = checked.some(({ reference }) => reference);
  const pending = new Map();
  for (const { href, line, reference } of checked) {
    if (reference) continue;
    if (!pending.has(href)) pending.set(href, []);
    pending.get(href).push(line);
  }
  const differences = [];
  const definitions = new Map();
  const displayed = [];
  function collect(node, line) {
    if (node.type === 'definition') {
      const id = node.identifier.toUpperCase();
      // 表示と同じく、同じ名前の定義は先に現れたものを使います。
      if (!definitions.has(id)) definitions.set(id, node.url);
    } else if (['image', 'link', 'imageReference', 'linkReference'].includes(node.type)) {
      displayed.push({ node, line });
    }
  }
  walk(tree, (node) => {
    const check = converted.get(node);
    if (!check) {
      collect(node, node.position.start.line);
      return;
    }
    const question = parser.parse(check.question);
    if (question.children.length === 1 && question.children[0].type === 'paragraph') {
      walk(question, (part) => collect(part, check.questionLine + part.position.start.line - 1));
    } else if (hasVisual(question)) {
      differences.push({ line: check.questionLine, message: '問いに図や画像、図へのリンクは書けません。' });
    }
    if (check.options.some(({ text }) => hasVisual(parser.parse(text)))) {
      differences.push({ line: check.line, message: '選択肢に図や画像、図へのリンクは書けません。' });
    }
    walk(parser.parse(check.reason), (part) => collect(part, check.reasonLines[part.position.start.line - 1]));
    return false;
  });

  const unmatched = [];
  const report = (href, line) => differences.push({
    line,
    message: `図の参照 ${href} を、検査と表示で違って読んでいます。` +
      '`![キャプション](#/diagrams/<id>)` の形で、コードの外に書いてください。',
  });
  for (const { node, line } of displayed) {
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const href = definitions.get(node.identifier.toUpperCase());
      if (!hasReference && href?.startsWith('#/diagrams/')) report(href, line);
    } else if ((node.type === 'image' || node.type === 'link') && node.url.startsWith('#/diagrams/')) {
      const validated = pending.get(node.url);
      const sameLine = validated?.indexOf(line) ?? -1;
      if (sameLine >= 0) validated.splice(sameLine, 1);
      else unmatched.push({ href: node.url, line });
    }
  }
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
  const { converted, differences } = inspectInlineChecks(markdown, tree);
  return [...differences, ...diagramRefDifferences(markdown, tree, converted)].sort((a, b) => a.line - b.line);
}
