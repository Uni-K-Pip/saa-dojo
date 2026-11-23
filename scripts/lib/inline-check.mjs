// レッスン・早見表・ガイドの「その場の確認」を行単位で読みます。
const HEAD = /^([ \t]*)>[ \t]*\*\*その場の確認([：:]?)\*\*(.*)$/;
const QUOTE = /^([ \t]*)>[ \t]?/;
const BLANK = /^[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const OPTION =/^[-*] \[([ xX])\][ \t]+(.+)$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const CHARACTER_REFERENCES = { amp: '&', lt: '<', gt: '>', quot: '"' };

function decodeCharacterReference(_match, reference) {
  if (reference[0] !== '#') return CHARACTER_REFERENCES[reference];
  const hex = reference[1].toLowerCase() === 'x';
  const code = Number.parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10);
  return code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff ? '\uFFFD' : String.fromCodePoint(code);
}

export function normalizeInlineCheckQuestion(question) {
  return question
    .replace(/!?\[((?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*)\]\((?:\\.|[^()\\]|\((?:\\.|[^()\\])*\))*\)/g, '$1')
    .replace(/<\/?[A-Za-z][\w:-]*(?:\s(?:"[^"]*"|'[^']*'|[^'">])*)?\/?>/g, '')
    .replace(/~~|[*`]/g, '')
    // 語の中のアンダースコアは名前の一部として残します。
    .replace(/(?<![\p{L}\p{M}\p{N}_])_+|_+(?![\p{L}\p{M}\p{N}_])/gu, '')
    .replace(/&(amp|lt|gt|quot|#\d+|#[xX][\da-fA-F]+);/g, decodeCharacterReference)
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInlineCheckBlockquote(node, check) {
  return node.type === 'blockquote' && node.position?.start.line === check.line
    && node.position.end.line >= check.endLine
    && node.children?.[0]?.type === 'paragraph' && node.children[0].children?.[0]?.type === 'strong';
}

function hasVisual(text) {
  return text.includes('![') || /\]\([ \t\n]*<?#\/(?:diagrams|artifacts)\//.test(text);
}

function questionHasBlock(question) {
  // 行単位の検査で分かる段落の区切りやブロックを拾います。表示との突き合わせでは remark で解析します。
  const lines = question.split('\n');
  return lines.some((line, index) => BLANK.test(line) || FENCE.test(line)
    || /^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|(?:[-+*]|1[.)])[ \t]+\S)/.test(line)
    || /^ {0,3}<(?:!--|\?|![A-Z]|!\[CDATA\[|\/?(?:script|pre|style|textarea|div|table|section)(?=[ \t>/]|$))/i.test(line)
    || (index === 0 && /^ {0,3}(?:(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)|\[[^\]]+\]:[ \t]*\S)/.test(line))
    || THEMATIC_BREAK.test(line) || (index > 0 && /^ {0,3}(?:-+|=+)[ \t]*$/.test(line))
    || (index > 0 && lines[index - 1].includes('|') && /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(line)));
}

export function parseInlineChecks(markdown) {
  const lines = markdown.split(/\r\n?|\n/);
  const checks = [];
  let fence = null; // コードフェンスの中（記法の例）は読まない
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]);
    if (f && (fence === null || f[1][0] === fence[0] && f[1].length >= fence.length)) {
      fence = fence === null ? f[1] : null;
      continue;
    }
    const heading = fence === null && HEAD.exec(lines[i]);
    if (!heading) continue;
    const line = i + 1;
    const problems = [];
    if (heading[2] || heading[3].trim()) {
      problems.push('見出しは `> **その場の確認**` だけの行にしてください。');
      checks.push({ line, endLine: line, questionLine: line + 1, question: '', questionKey: '', options: [], reason: '', reasonLines: [], problems });
      continue;
    }
    for (let previous = i - 1; previous >= 0 && !BLANK.test(lines[previous]) && !FENCE.test(lines[previous]); previous--) {
      if (QUOTE.test(lines[previous])) {
        problems.push('その場の確認は、前の引用と空行で分けてください。');
        break;
      }
    }
    const body = [];
    let indentMismatch = false;
    let quote;
    while ((quote = QUOTE.exec(lines[i + 1] ?? '')) && !HEAD.test(lines[i + 1])) {
      if (quote[1] !== heading[1]) indentMismatch = true;
      body.push(lines[++i].slice(quote[0].length));
    }
    if (indentMismatch) problems.push('確認の行の字下げを見出しの行とそろえてください。');
    const matches = body.map((value) => OPTION.exec(value.trim()));
    const first = matches.findIndex(Boolean);
    const last = matches.findLastIndex(Boolean);
    const questionBody = body.slice(0, first < 0 ? body.length : first);
    const questionLine = line + 1 + questionBody.findIndex((value) => value.trim());
    const question = questionBody.join('\n').trim();
    const reasonBody = last < 0 ? [] : body.slice(last + 1);
    // 理由は空の引用行を省いて表示するため、残る行の元の行番号を控えます。
    const reasonLines = reasonBody.flatMap((value, index) => value.trim() ? [line + last + 2 + index] : []);
    const reason = reasonBody.filter((value) => value.trim()).join('\n').trim();
    const options = matches.filter(Boolean).map(([, mark, text]) => ({ text, correct: mark.toLowerCase() === 'x' }));
    if (!question) problems.push('問いがありません。');
    if (questionBody.filter((value) => value.trim()).join('\n').trim().length > 120) problems.push('問いは 120 字までです。');
    if (hasVisual(question) && questionHasBlock(question)) problems.push('問いに図・実物・画像と、図や実物へのリンクは書けません。');
    if (options.length < 2 || options.length > 4) problems.push('選択肢は 2〜4 個にしてください。');
    if (options.filter(({ correct }) => correct).length !== 1) problems.push('正解（[x]）は 1 個にしてください。');
    if (options.some(({ text }) => hasVisual(text))) problems.push('選択肢に図・実物・画像と、図や実物へのリンクは書けません。');
    if (!reason) problems.push('理由がありません。');
    if (first >= 0 && matches.slice(first, last + 1).some((match) => !match)) {
      problems.push('選択肢の並びの途中に別の行があります。');
    }
    checks.push({ line, endLine: i + 1, questionLine, question, questionKey: normalizeInlineCheckQuestion(question), options, reason, reasonLines, problems });
  }
  return checks;
}
