// レッスン・早見表・ガイドの「その場の確認」を行単位で読みます。
const HEAD = /^\s*>\s*\*\*その場の確認\*\*\s*$/;
const QUOTE = /^[ \t]*>[ \t]?/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const OPTION =/^[-*] \[([ xX])\][ \t]+(.+)$/;
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
    .replace(/<\/?[A-Za-z][\w:-]*(?:\s+(?:"[^"]*"|'[^']*'|[^'">])*)?\s*\/?>/g, '')
    .replace(/~~|[*`]/g, '')
    // 語の中のアンダースコアは名前の一部として残します。
    .replace(/(?<![\p{L}\p{M}\p{N}_])_+|_+(?![\p{L}\p{M}\p{N}_])/gu, '')
    .replace(/&(amp|lt|gt|quot|#\d+|#[xX][\da-fA-F]+);/g, decodeCharacterReference)
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInlineCheckBlockquote(node, line) {
  return node.type === 'blockquote' && node.position?.start.line === line
    && node.children?.[0]?.type === 'paragraph' && node.children[0].children?.[0]?.type === 'strong';
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
    if (fence !== null || !HEAD.test(lines[i])) continue;
    const line = i + 1;
    const problems = [];
    for (let previous = i - 1; previous >= 0 && lines[previous].trim(); previous--) {
      if (QUOTE.test(lines[previous])) {
        problems.push('その場の確認は、前の引用と空行で分けてください。');
        break;
      }
    }
    const body = [];
    while (i + 1 < lines.length && QUOTE.test(lines[i + 1]) && !HEAD.test(lines[i + 1])) {
      body.push(lines[++i].replace(QUOTE, ''));
    }
    const matches = body.map((value) => OPTION.exec(value.trim()));
    const first = matches.findIndex(Boolean);
    const last = matches.findLastIndex(Boolean);
    const joined = (values) => values.filter((value) => value.trim()).join('\n').trim();
    const question = joined(body.slice(0, first < 0 ? body.length : first));
    const reason = last < 0 ? '' : joined(body.slice(last + 1));
    const options = matches.filter(Boolean).map(([, mark, text]) => ({ text, correct: mark.toLowerCase() === 'x' }));
    if (!question) problems.push('問いがありません。');
    if (question.length > 120) problems.push('問いは 120 字までです。');
    if (options.length < 2 || options.length > 4) problems.push('選択肢は 2〜4 個にしてください。');
    if (options.filter(({ correct }) => correct).length !== 1) problems.push('正解（[x]）は 1 個にしてください。');
    if (!reason) problems.push('理由がありません。');
    if (first >= 0 && matches.slice(first, last + 1).some((match) => !match)) {
      problems.push('選択肢の並びの途中に別の行があります。');
    }
    checks.push({ line, question, questionKey: normalizeInlineCheckQuestion(question), options, reason, problems });
  }
  return checks;
}
