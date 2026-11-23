// レッスン・早見表・ガイドの「その場の確認」を行単位で読みます。
const HEAD = /^\s*>\s*\*\*その場の確認\*\*\s*$/;
const QUOTE = /^[ \t]*>[ \t]?/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const OPTION =/^[-*] \[([ xX])\][ \t]+(.+)$/;

export function normalizeInlineCheckQuestion(question) {
  return question.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
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
    if (i > 0 && QUOTE.test(lines[i - 1])) {
      problems.push('その場の確認は、前の引用と空行で分けてください。');
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
