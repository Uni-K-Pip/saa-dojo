// レッスン・早見表・ガイドの「その場の確認」を行単位で読みます。
import { hashString } from './hash-string.mjs';

const HEAD = /^([ \t]*)>[ \t]*\*\*その場の確認([：:]?)\*\*(.*)$/;
const QUOTE = /^([ \t]*)>[ \t]?/;
const BLANK = /^[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const OPTION =/^[-*] \[([ xX])\][ \t]+(.+)$/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const CHARACTER_REFERENCES = { amp: '&', lt: '<', gt: '>', quot: '"' };

export const CALLOUT_KINDS = {
  試験のポイント: 'tip',
  ひっかけ注意: 'trap',
};

// コードスパンの外にある HTML のコメントとタグを除きます（表示では、これらの中の記号は強調になりません）。
const stripHtml = (text) => text.replace(/(`+)[\s\S]*?\1|<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z\d-]*(?:\s(?:"[^"]*"|'[^']*'|[^'">])*)?\/?>/g, (match, ticks) => (ticks ? match : ''));
// 取り消し線は、同じ本数（1〜2 本）の ~ で対になるものだけを外します。対にならない ~ は文字のままです。
const stripStrike = (text) => text.replace(/(?<!~)(~{1,2})(?!~)(?=\S)(.*?)(?<!~)\1(?!~)/g, '$2');

function isCalloutHeading(line) {
  // 行の先頭が強調の記号でなければ、見出しではありません（先頭の HTML のあとの強調は、表示でも見出しになりません）。
  const trimmed = line.trim();
  if (!/^([*_])\1/.test(trimmed)) return false;
  const strong = /^([*_])\1(?=\S)(.*?\S)\1\1(?!\1)/.exec(stripHtml(trimmed));
  if (!strong) return false;
  const [, marker, body] = strong;
  // 両端に同じ記号が奇数個余る場合は、強調が太字の外側に来ます。
  const leading = body.match(/^(?:\*+|_+)/)?.[0];
  const trailing = body.match(/(?:\*+|_+)$/)?.[0];
  if (leading?.[0] === marker && trailing?.[0] === marker && leading.length % 2 && trailing.length % 2) return false;
  // 表示は、見出しの中のリンク・取り消し線（~ が 1〜2 本）・HTML（タグとコメント）の中身の文字も見出しとして読みます。
  // 記号の偶奇は、リンク先や属性を除いたあとの文字で見ます。
  const plain = stripStrike(body
    .replace(/!?\[((?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*)\]\((?:\\.|[^()\\]|\((?:\\.|[^()\\])*\))*\)/g, '$1'))
    // バックスラッシュのエスケープも文字として読みます（強調の記号 * _ ` は、そのままにして数えます）。
    .replace(/\\([!-/:-@[\]^{-~])/g, (match, char) => ('*_`'.includes(char) ? match : char));
  if (['*', '_', '`'].some((symbol) => plain.split(symbol).length % 2 === 0)) return false;
  // 強調の記号を除いてから、文字参照（&#12398; など）を文字にします（文字参照の * などは強調ではなく文字です）。
  const title = plain.replace(/[*_`]/g, '').replace(/&(amp|lt|gt|quot|#\d+|#[xX][\da-fA-F]+);/g, decodeCharacterReference).trim().replace(/[：:]$/, '');
  return Object.hasOwn(CALLOUT_KINDS, title);
}

export const isInlineCheckHeading = (line) => HEAD.test(line);

export function inlineCheckId(questionKey) {
  return `c${hashString(questionKey).toString(16).padStart(8, '0')}`;
}

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
    || (index > 0 && lines[index - 1].includes('|') && /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*(?:\|[ \t]*)?$/.test(line)));
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
    while ((quote = QUOTE.exec(lines[i + 1] ?? '')) && !isInlineCheckHeading(lines[i + 1])) {
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
    const callout = reasonBody.findIndex(isCalloutHeading);
    const followingCallout = callout < 0 ? undefined : {
      line: line + last + 2 + callout,
      message: 'その場の確認と次の引用（囲み記事）は、空行で分けてください。',
    };
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
    checks.push({ line, endLine: i + 1, questionLine, question, questionKey: normalizeInlineCheckQuestion(question), options, reason, reasonLines, problems, followingCallout });
  }
  return checks;
}

/**
 * `markdown`・`md` のフェンスの中に、次のどちらかの形でその場の確認の見出しがあるものの行を返します。
 * - 見出し（`#`）が 2 つ以上ある、または確認のあとに見出しがあって、その後ろにまた確認の見出しがある。
 * - 中に、同じ記号で同じ数以上の、情報文字列つきの開きの行（後ろのコードブロックの開き）がある。
 * フェンスの閉じ忘れで、そのあとの本文ごと記法の例になっている疑いがあります（フェンスの中は確認として読みません）。
 * 見出しが 1 つだけの例（`# 題` と確認）は、正当な記法の例として警告しません。
 */
export function suspectMarkdownFences(markdown) {
  const lines = markdown.split(/\r\n?|\n/);
  const found = [];
  let fence = null;
  const finish = () => {
    // 閉じ忘れたフェンスは、後ろのコードブロックの開きを飲み込み、その閉じで閉じることが多い
    if (fence?.example && !fence.reported && fence.swallowedOpen && fence.firstCheck) found.push({ line: fence.line, checkLine: fence.firstCheck });
    fence = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]);
    const closes = f && fence !== null && f[1][0] === fence.marker[0] && f[1].length >= fence.marker.length && !lines[i].slice(f[0].length).trim();
    if (f && (fence === null || closes)) {
      if (fence === null) {
        const info = lines[i].slice(f[0].length).trim().split(/\s+/)[0].toLowerCase();
        fence = { marker: f[1], example: info === 'markdown' || info === 'md', line: i + 1, headings: 0, headingAfterCheck: false, firstCheck: 0, swallowedOpen: false, reported: false };
      } else {
        finish();
      }
      continue;
    }
    if (!fence?.example) continue;
    if (f && f[1][0] === fence.marker[0] && f[1].length >= fence.marker.length) fence.swallowedOpen = true;
    if (/^ {0,3}#{1,6}(?:[ \t]|$)/.test(lines[i])) {
      fence.headings++;
      if (fence.firstCheck) fence.headingAfterCheck = true;
    } else if (HEAD.test(lines[i])) {
      // 見出しが 1 つだけの例は、正当な記法の例です。
      if (!fence.reported && (fence.headingAfterCheck || fence.headings >= 2)) {
        fence.reported = true;
        found.push({ line: fence.line, checkLine: i + 1 });
      }
      fence.firstCheck ||= i + 1;
    }
  }
  finish();
  return found;
}
