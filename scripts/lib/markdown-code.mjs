// Markdown の本文から、コード（フェンスで囲んだブロックと、バッククォートで囲んだ文中のコード）を除きます。
// 本文の参照（図・実物、図鑑へのリンク）を読む検査で共用します。コードの中の参照は、表示ではリンクにならないので読みません。
// 行の数と位置は変えません（フェンスの中の行は空行に、文中のコードは同じ長さの NUL に置き換える）。行単位の近似で、
// 字下げだけのコードブロックは除きません。
export function withoutCode(markdown) {
  let fence;
  let listDepth = 0;
  const listIndents = [0];
  const text = markdown.split(/\r\n?|\n/).map((line) => {
    const quote = /^(?: {0,3}>[ \t]?)+/.exec(line)?.[0] ?? '';
    const quoteMarks = quote.match(/ {0,3}>[ \t]?/g) ?? [];
    const depth = quoteMarks.length;
    const content = line.slice(quote.length);
    if (fence) {
      const code = line.slice(quoteMarks.slice(0, fence.depth).join('').length);
      if (depth >= fence.depth && (!code.trim() || /^ */.exec(code)[0].length >= fence.indent)) {
        const end = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(code.slice(fence.indent))?.[1];
        if (end && end[0] === fence.mark[0] && end.length >= fence.mark.length) fence = undefined;
        return '';
      }
      fence = undefined;
    }

    if (depth !== listDepth) {
      listDepth = depth;
      listIndents.length = 1;
    }
    if (!content.trim()) return line;
    // リスト内では項目の本文の字下げを起点にフェンスを読みます。
    const indent = /^ */.exec(content)[0].length;
    while (listIndents.at(-1) > indent) listIndents.pop();
    const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)]) {1,4}(?=\S)/.exec(content.slice(listIndents.at(-1)));
    if (list) listIndents.push(listIndents.at(-1) + list[0].length);
    const start = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content.slice(listIndents.at(-1)));
    if (start && (start[1][0] === '~' || !start[2].includes('`'))) {
      fence = { mark: start[1], depth, indent: listIndents.at(-1) };
    }
    return fence ? '' : line;
  }).join('\n');
  // 空行をまたがず、同じ数のバッククォートで閉じたコードを検査から除きます。
  return text.split(/(\n[ \t]*\n)/).map((block) =>
    block.replace(/(?<![\\`])(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, (span) => span.replace(/[^\n]+/g, '\0')),
  ).join('');
}
