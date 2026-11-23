import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { parseMaterialRefs } from '../../../scripts/lib/diagram.mjs';
import { artifactRefOf, diagramRefOf, materialKindOf } from '../../../scripts/lib/diagram-refs.mjs';
import { inlineCheckId, isInlineCheckBlockquote, isInlineCheckHeading, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
import { headingsInSection, parseSections } from '../../../scripts/lib/lab-pattern.mjs';
import { calloutBodyChildren, calloutOf } from '../../src/components/markdown-callouts.mjs';

const unclosedFences = new WeakSet();
const fencedCode = new WeakSet();
const parser = unified().use(remarkParse).use(remarkGfm).use(function trackCodeFences() {
  // remark の解析で確定した開き・閉じの記号列を拾う。字下げや引用の中でも同じ判定になる。
  const data = this.data();
  (data.fromMarkdownExtensions ??= []).push({
    enter: {
      codeFencedFenceSequence() {
        const node = this.stack.findLast(({ type }) => type === 'code');
        fencedCode.add(node);
        if (!unclosedFences.delete(node)) unclosedFences.add(node);
      },
    },
  });
});

function walk(node, visit, inQuote = false, parent = undefined, grandparent = undefined) {
  if (visit(node, inQuote, parent, grandparent) === false) return;
  for (const child of node.children ?? []) walk(child, visit, inQuote || node.type === 'blockquote', node, parent);
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
    || (node.type === 'link' && materialKindOf(node.url) !== null)
    || (node.children ?? []).some(hasVisual);
}

function inspectInlineChecks(markdown, tree) {
  const checks = parseInlineChecks(markdown);
  const pending = new Map(checks.filter(({ problems }) => problems.length === 0).map((check) => [check.line, check]));
  const converted = new Map();
  const headings = new Set();
  const differences = checks.flatMap(({ followingCallout }) => followingCallout ? [followingCallout] : []);
  walk(tree, (node, inQuote, parent) => {
    const line = node.position.start.line;
    if (fencedCode.has(node)) {
      // フェンスの中の見出しはコードの検査で扱います。
      for (const checkLine of pending.keys()) {
        if (checkLine > line && checkLine <= node.position.end.line) pending.delete(checkLine);
      }
    }
    if (node.type === 'blockquote') {
      const check = pending.get(line);
      if (check && isInlineCheckBlockquote(node, check)) {
        pending.delete(line);
        // 囲み記事との区切りは、上で実際の見出しの行を報告している。
        if (check.followingCallout) return false;
        converted.set(node, check);
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

function imageParagraphs(tree) {
  const paragraphs = new Set();
  walk(tree, (node, _inQuote, parent, grandparent) => {
    if (node.type !== 'paragraph') return;
    if (parent?.type === 'listItem') {
      // 表示では、詰まったリストの項目から段落タグを外し、タスクの先頭段落にはチェック欄を足します。
      const loose = grandparent.spread || grandparent.children.some((item) => item.spread ?? item.children.length > 1);
      if (!loose || (typeof parent.checked === 'boolean' && parent.children[0] === node)) return;
    }
    const phrasing = parent?.type === 'blockquote' && parent.children[0] === node && calloutOf(parent)
      ? calloutBodyChildren(node) : node.children;
    const children = phrasing.filter(({ type }) => type !== 'html');
    if (children.length === 1 && children[0].type === 'image') paragraphs.add(children[0]);
  });
  return paragraphs;
}

function diagramRefDifferences(markdown, tree, converted) {
  const checked = parseMaterialRefs(markdown, { withLine: true });
  const hasReference = checked.some(({ reference }) => reference);
  const pending = new Map();
  for (const ref of checked) {
    const { href, reference } = ref;
    if (reference) continue;
    if (!pending.has(href)) pending.set(href, []);
    pending.get(href).push(ref);
  }
  const differences = [];
  const definitions = new Map();
  const displayed = [];
  function collect(node, line, paragraphs) {
    if (node.type === 'definition') {
      const id = node.identifier.toUpperCase();
      // 表示と同じく、同じ名前の定義は先に現れたものを使います。
      if (!definitions.has(id)) definitions.set(id, node.url);
    } else if (['image', 'link', 'imageReference', 'linkReference'].includes(node.type)) {
      displayed.push({ node, line, block: paragraphs.has(node) });
    }
  }
  const paragraphs = imageParagraphs(tree);
  function collectFrom(fragment, lineOf) {
    const fragmentParagraphs = imageParagraphs(fragment);
    walk(fragment, (part) => collect(part, lineOf(part.position.start.line), fragmentParagraphs));
  }
  walk(tree, (node) => {
    const check = converted.get(node);
    if (!check) {
      collect(node, node.position.start.line, paragraphs);
      return;
    }
    const question = parser.parse(check.question);
    if (question.children.length === 1 && question.children[0].type === 'paragraph') {
      collectFrom(question, (line) => check.questionLine + line - 1);
    } else if (hasVisual(question)) {
      differences.push({ line: check.questionLine, message: '問いに図・実物・画像と、図や実物へのリンクは書けません。' });
    }
    if (check.options.some(({ text }) => hasVisual(parser.parse(text)))) {
      differences.push({ line: check.line, message: '選択肢に図・実物・画像と、図や実物へのリンクは書けません。' });
    }
    collectFrom(parser.parse(check.reason), (line) => check.reasonLines[line - 1]);
    return false;
  });

  const unmatched = [];
  const report = (href, line) => {
    const [name, dir] = materialKindOf(href) === 'artifact' ? ['実物', 'artifacts'] : ['図', 'diagrams'];
    differences.push({
      line,
      message: `${name}の参照 ${href} を、検査と表示で違って読んでいます。` +
        `\`![キャプション](#/${dir}/<id>)\` の形で、コードの外に書いてください。`,
    });
  };
  const compareBlock = (ref, { block, line }) => {
    if (ref.block === block || !ref.image || !(diagramRefOf(ref.href) || artifactRefOf(ref.href))) return;
    const name = ref.kind === 'artifact' ? '実物' : '図';
    differences.push({
      line,
      message: ref.block
        ? `${name}の参照を、検査は画像だけの行と読みましたが、表示ではリンクになります。前後に空行を入れて、画像だけの段落にしてください。`
        : `${name}の参照を、表示は画像だけの段落と読みましたが、検査では画像だけの行になっていません。画像だけの行にしてください。`,
    });
  };
  for (const { node, line, block } of displayed) {
    if (node.type === 'imageReference' || node.type === 'linkReference') {
      const href = definitions.get(node.identifier.toUpperCase());
      if (!hasReference && href && materialKindOf(href) !== null) report(href, line);
    } else if ((node.type === 'image' || node.type === 'link') && materialKindOf(node.url) !== null) {
      const validated = pending.get(node.url);
      const image = node.type === 'image';
      const sameLine = validated?.findIndex((ref) => ref.line === line && ref.image === image) ?? -1;
      if (sameLine >= 0) compareBlock(validated.splice(sameLine, 1)[0], { block, line });
      else unmatched.push({ href: node.url, image, block, line });
    }
  }
  // 行の一致を先に使い、残りは href の出現回数で照合します。
  for (const match of unmatched) {
    const { href, image, block, line } = match;
    const validated = pending.get(href);
    const sameBlock = validated?.findIndex((ref) => ref.image === image && ref.block === block) ?? -1;
    const sameImage = sameBlock >= 0 ? sameBlock : validated?.findIndex((ref) => ref.image === image) ?? -1;
    if (sameImage >= 0) compareBlock(validated.splice(sameImage, 1)[0], match);
    else report(href, line);
  }
  for (const [href, refs] of pending) {
    for (const { line } of refs) report(href, line);
  }
  return differences;
}

function codeFenceErrors(markdown, tree) {
  const source = markdown.split(/\r\n?|\n/);
  const lastLine = source.findLastIndex((line) => /[^ \t]/.test(line)) + 1;
  const errors = [];
  walk(tree, (node) => {
    if (!fencedCode.has(node)) return;
    if (unclosedFences.has(node) && node.position.end.line >= lastLine) {
      errors.push({
        line: node.position.start.line,
        message: 'コードフェンスが閉じていません。開きと同じ記号で、同じ数以上の行で閉じてください。',
      });
      return;
    }
    if (node.lang === 'markdown' || node.lang === 'md') return;
    node.value.split('\n').forEach((code, index) => {
      const line = node.position.start.line + index + 1;
      if (isInlineCheckHeading(code) || isInlineCheckHeading(source[line - 1])) {
        errors.push({
          line,
          message: 'その場の確認の見出しがコードの中にあります。手前のコードフェンスを閉じ忘れていないか確かめてください（記法の例として載せるなら ```markdown で囲みます）。',
        });
      }
    });
  });
  return errors;
}

/** 本文を行単位の検査と表示で読み、判定が異なる箇所と表示する確認の ID を返します。 */
export function inspectMarkdown(markdown) {
  const tree = parser.runSync(parser.parse(markdown));
  const { converted, differences } = inspectInlineChecks(markdown, tree);
  return {
    differences: [...differences, ...diagramRefDifferences(markdown, tree, converted), ...codeFenceErrors(markdown, tree)]
      .sort((a, b) => a.line - b.line),
    checkIds: [...converted.values()].map(({ questionKey }) => inlineCheckId(questionKey)),
  };
}

export function crosscheckMarkdown(markdown) {
  return inspectMarkdown(markdown).differences;
}

/** 固定の見出しとミニラボの手順を、表示と同じ解析で確かめます。 */
export function crosscheckSections(markdown, { lab }) {
  const expected = parseSections(markdown);
  const displayed = [];
  walk(parser.runSync(parser.parse(markdown)), (node) => {
    if (node.type === 'heading') {
      displayed.push({ depth: node.depth, title: textOf(node).trim(), line: node.position.start.line });
    }
  });
  const relevant = (headings) => [
    ...headings.filter(({ depth }) => depth === 2),
    ...(lab ? headingsInSection(headings, '手順').filter(({ depth }) => depth === 3) : []),
  ].sort((a, b) => a.line - b.line);
  const left = relevant(expected);
  const right = relevant(displayed);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const a = left[i];
    const b = right[i];
    if (a?.line !== b?.line || a?.depth !== b?.depth || (a?.depth === 2 && a.title !== b?.title)) {
      return { line: Math.min(a?.line ?? Infinity, b?.line ?? Infinity), message: '見出しを、検査と表示で違って読んでいます。見出しは行頭に ## または ### を付けて書いてください。' };
    }
  }
  return null;
}
