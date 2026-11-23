// @vitest-environment node
import { expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { isInlineCheckBlockquote, parseInlineChecks, suspectMarkdownFences } from '../../../scripts/lib/inline-check.mjs';
import { crosscheckMarkdown } from '../lib/markdown-crosscheck.mjs';
import { calloutOf } from '../../src/components/markdown-callouts.mjs';

const check = [
  '> **その場の確認**',
  '> 問いですか？',
  '>',
  '> - [ ] いいえ',
  '> - [x] はい',
  '>',
  '> 理由です。',
].join('\n');
const image = '![図](#/diagrams/dg-a)';
const checkMessage = expect.stringContaining('その場の確認が表示では確認として扱われません');
const headingMessage = '『その場の確認』の見出しが確認として扱われていません。見出しは `> **その場の確認**` だけの行にしてください。';
const taskMessage = '確認として表示されない引用の中にタスクリストがあります（正解の印がそのまま見えます）。その場の確認の書き方を直してください。';
const diagramMessage = expect.stringContaining('図の参照 #/diagrams/dg-a を、検査と表示で違って読んでいます');
const fenceMessage = 'コードフェンスが閉じていません。開きと同じ記号で、同じ数以上の行で閉じてください。';
const parser = unified().use(remarkParse).use(remarkGfm);
const indent = (value, spaces = 2) => value.replace(/^/gm, ' '.repeat(spaces));

it.each([
  ['4 字下げした確認', check.split('\n').map((line) => `    ${line}`).join('\n'), 1],
  ['HTML ブロックに入った確認', `<div>\n${check}`, 2],
])('%sのずれを本文の行で報告します', (_label, markdown, line) => {
  expect(crosscheckMarkdown(markdown)).toEqual([{ line, message: checkMessage }]);
});

it.each([
  ['選択肢から', 3, 5],
  ['理由だけ', 6, 8],
])('リストの中の確認で%s字下げを忘れると引用が確認の終わりを覆いません', (_label, indented, quoteEnd) => {
  const lines = check.split('\n');
  const markdown = ['- 項目', '', indent(lines.slice(0, indented).join('\n')), ...lines.slice(indented)].join('\n');
  const [parsed] = parseInlineChecks(markdown);
  const quote = parser.parse(markdown).children[0].children[0].children[1];
  expect(quote.position.end.line).toBe(quoteEnd);
  expect(parsed.endLine).toBe(9);
  expect(isInlineCheckBlockquote(quote, parsed)).toBe(false);
  expect(crosscheckMarkdown(markdown)).toEqual([
    { line: 3, message: headingMessage }, { line: 6, message: taskMessage }, { line: 7, message: taskMessage },
  ]);
});

it('全角空白で区切った引用は、前置きと同じ段落になるのでタスクリストの行で止めます', () => {
  expect(crosscheckMarkdown(`> 前置きです。\n　\n${check}`)).toEqual([
    { line: 6, message: taskMessage }, { line: 7, message: taskMessage },
  ]);
});

it.each([
  ['全角コロン付きの見出し', check.replace('確認**', '確認：**'), 1, 4],
  ['見出しと問いを同じ行に書いた確認', check.replace('**\n> 問い', '** 問い'), 1, 3],
  ['フェンスに見える行の直後の確認', '```a`b\n' + check, 2, 5],
  ['下線で強調した見出し', check.replaceAll('**', '__'), 1, 4],
  ['図を書いた選択肢', check.replace('[x] はい', `[x] ${image}`), 1, 4],
])('%sでは見出しとタスクリストの行を報告します', (_label, markdown, headingLine, taskLine) => {
  expect(crosscheckMarkdown(markdown)).toEqual([
    { line: headingLine, message: headingMessage },
    { line: taskLine, message: taskMessage },
    { line: taskLine + 1, message: taskMessage },
  ]);
});

it('確認の外では引用内のタスクリストと段落の先頭の強調見出しだけを報告します', () => {
  const markdown = '- [x] 引用の外\n\n> - [ ] 引用の中\n> - [x] 引用の中\n\n**その場の確認&#32;:** は読みながら答えます。';
  expect(crosscheckMarkdown(markdown)).toEqual([
    { line: 3, message: taskMessage }, { line: 4, message: taskMessage }, { line: 6, message: headingMessage },
  ]);
});

it.each([
  ['引用なしの ### 見出しとタスクリスト', '### その場の確認\n問いですか？\n\n- [ ] いいえ\n- [x] はい\n\n理由です。', [1]],
  ['引用の中の ### 見出し', '> ### その場の確認\n> 問いですか？\n>\n> - [ ] いいえ\n> - [x] はい\n>\n> 理由です。', [1, 4, 5]],
  ['* の強調', '> *その場の確認*\n> 問いですか？\n>\n> - [ ] いいえ\n> - [x] はい\n>\n> 理由です。', [1, 4, 5]],
  ['文の頭の強調', '**その場の確認** は、読みながら答える小問です。', [1]],
  ['全角の ＞ のあとの強調', '＞ **その場の確認**\n＞ 問いですか？', [1]],
])('確認の外の見出しに見えるもの（%s）を報告します', (_label, markdown, lines) => {
  const headings = crosscheckMarkdown(markdown).filter(({ message }) => message === headingMessage).map(({ line }) => line);
  expect(headings).toEqual([lines[0]]);
  expect(crosscheckMarkdown(markdown).map(({ line }) => line)).toEqual(lines);
});

it.each([
  ['本文の **その場の確認** は、読みながら答える小問です。'],
  ['> 本文の ***その場の確認*** は、読みながら答える小問です。'],
  ['- 項目の __その場の確認__ は選択肢から答えます。'],
])('文の途中で「その場の確認」を強調した説明は報告しません（%s）', (markdown) => {
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each([
  ['末尾に空の引用行', '\n> ', 8, 8],
  ['直後に空行', '\n\n次の段落です。', 7, 7],
  ['直後に半角空白とタブだけの行', '\n \t \n次の段落です。', 7, 7],
  ['理由のあとに遅延継続', '\n続きです。', 7, 8],
])('%sがあるときの引用の終わりと突き合わせを確かめます', (_label, suffix, endLine, quoteEnd) => {
  const markdown = check + suffix;
  expect(parser.parse(markdown).children[0].position.end.line).toBe(quoteEnd);
  expect(parseInlineChecks(markdown)).toMatchObject([{ endLine, problems: [] }]);
  expect(crosscheckMarkdown(markdown)).toEqual(endLine === quoteEnd ? [] : [{
    line: endLine + 1,
    message: '確認の理由のあとに引用の続きがあります。確認と次の本文を空行で分けてください。',
  }]);
});

it('遅延継続で前の囲み記事とつながる確認を検査で止めます', () => {
  const markdown = `> **試験のポイント**\n> 大事な点です。\n続きの行です。\n${check}`;
  expect(parseInlineChecks(markdown)).toMatchObject([{
    line: 4,
    problems: ['その場の確認は、前の引用と空行で分けてください。'],
  }]);
});

it.each([
  '**試験のポイント**', '__ひっかけ注意：__', '**試験のポイント：**',
  '**試験のポイント** は大事', '**試験の*ポイント***', '__`ひっかけ`注意__ は大事',
  '***試験の*ポイント**', '**_試験のポイント_**', '__*ひっかけ注意*__',
  '**[試験のポイント](#x)**', '**~~試験のポイント~~**', '__[ひっかけ](#x)注意__', '**<b>試験のポイント</b>**',
  '**[試験のポイント](https://docs.aws.amazon.com/a_b.html)**', '**[試験のポイント](#a*b)**', '**[試験のポイント](#a`b)**',
  '**<span title="a_b">試験のポイント</span>**', '**~試験のポイント~**', '**試験の<!-- c -->ポイント**',
  '**&#35430;験のポイント**', '**試験のポイント\\:**',
])('直後に囲み記事の見出し %s が続くと、その行を報告します', (title) => {
  expect(calloutOf(parser.parse(`> ${title}`).children[0])).not.toBeNull();
  const markdown = `${check}\n> ${title}\n> 注意点です。`;
  const issue = { line: 8, message: 'その場の確認と次の引用（囲み記事）は、空行で分けてください。' };
  expect(parseInlineChecks(markdown)[0].followingCallout).toEqual(issue);
  expect(crosscheckMarkdown(markdown)).toEqual([issue]);
});

it.each([
  '\n\n> **試験のポイント**\n> 注意点です。',
  '\n> **大切な理由**\n> 選択の根拠です。',
  '\n> 本文には **ひっかけ注意** と書かれています。',
])('空行で分けた囲み記事や、理由の普通の太字は通ります（%s）', (suffix) => {
  const markdown = check + suffix;
  expect(parseInlineChecks(markdown)[0].followingCallout).toBeUndefined();
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each(['*試験のポイント*', '***試験のポイント***', '**試験の*ポイント**', '**大切な理由**'])('囲み記事にならない強調 %s は理由に続けて書けます', (title) => {
  expect(calloutOf(parser.parse(`> ${title}`).children[0])).toBeNull();
  const markdown = `${check}\n> ${title}`;
  expect(parseInlineChecks(markdown)[0].followingCallout).toBeUndefined();
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each(['|---|---|', ':--:', '| :-- | --: ', '--|--|', '-- | :--:'])('問いの表の区切り行 %s を従来どおり検出します', (delimiter) => {
  const markdown = check.replace('問いですか？', `${image} | 題\n> ${delimiter}`);
  expect(parseInlineChecks(markdown)[0].problems).toEqual(['問いに図・実物・画像と、図や実物へのリンクは書けません。']);
});

it('長い空白のあとに別の文字が続く行は速やかに判定し、表の区切り行として扱いません', () => {
  const markdown = check.replace('問いですか？', `${image} | 題\n> | --${' '.repeat(32000)}文字`);
  const start = performance.now();
  const [parsed] = parseInlineChecks(markdown);
  const elapsed = performance.now() - start;
  expect(parsed.problems).toEqual(['問いは 120 字までです。']);
  expect(elapsed).toBeLessThan(50);
});

it.each([
  ['丸括弧のタイトル', '![図](#/diagrams/dg-a (題))', 1],
  ['2 段の入れ子の角括弧', '![図 [注 [さらに]]](#/diagrams/dg-a)', 1],
  ['引用の中に画像参照の定義', '> [r]: #/diagrams/dg-a\n\n![図][r]', 3],
  ['引用の中にリンク参照の定義', '[図][R]\n\n> [r]: #/diagrams/dg-a', 1],
  ['引用の空段落をまたぐバッククォート', '> 記号 ` を使う。\n>\n> ![図](#/diagrams/dg-a) と ` です。', 3],
])('図の参照に%sがあるときのずれを本文の行で報告します', (_label, markdown, line) => {
  expect(crosscheckMarkdown(markdown)).toEqual([{ line, message: diagramMessage }]);
});

it('同じ図の参照が複数あるときも検査だけが拾う余分な参照の行を報告します', () => {
  const markdown = ['```', image, '```', '', `    ${image}`, '', image].join('\r\n');
  expect(crosscheckMarkdown(markdown)).toEqual([{ line: 5, message: diagramMessage }]);
});

it('図の参照の数が同じでも href が異なればずれを報告します', () => {
  expect(crosscheckMarkdown('![図](#/diagrams/dg-&#97;)')).toEqual([
    { line: 1, message: diagramMessage },
    { line: 1, message: expect.stringContaining('図の参照 #/diagrams/dg-&#97; を、検査と表示で違って読んでいます') },
  ]);
});

it('参照形式を検査がすでに拾うときはずれを報告しません', () => {
  expect(crosscheckMarkdown('![図][r] と [図][r]\n\n[r]: #/diagrams/dg-a')).toEqual([]);
});

it('正しい確認 3 個と図への画像・リンクにはずれがありません', () => {
  const checks = ['保存できますか？', '読み取れますか？', '処理できますか？'].map((question) => check.replace('問いですか？', question));
  expect(crosscheckMarkdown([image, '文中の [図へ](#/diagrams/dg-a?step=2) を見ます。', ...checks].join('\n\n'))).toEqual([]);
});

it.each(['![図](#/diagrams/dg-test)', '![実物](#/artifacts/ar-test)'])('画像だけの行が文と同じ段落になると報告します（%s）', (ref) => {
  for (const markdown of [`前の文です。\n${ref}`, `> 前の文です。\n> ${ref}`, `- 前の文です。\n  ${ref}`]) {
    expect(crosscheckMarkdown(markdown)).toEqual([
      { line: 2, message: expect.stringContaining('検査は画像だけの行と読みましたが、表示ではリンクになります') },
    ]);
  }
  expect(crosscheckMarkdown(`${ref}\n後ろの文です。`)).toEqual([{ line: 1, message: expect.stringContaining('表示ではリンクになります') }]);
});

it.each(['![図](#/diagrams/dg-test)', '![実物](#/artifacts/ar-test)'])('引用やリストでも空行で分けた画像の段落は通ります（%s）', (ref) => {
  for (const markdown of [`前の文です。\n\n${ref}`, `> 前の文です。\n>\n> ${ref}`, `- 前の文です。\n\n  ${ref}`]) {
    expect(crosscheckMarkdown(markdown)).toEqual([]);
  }
  expect(crosscheckMarkdown(`- ${ref}\n- 次の項目です。`)).toEqual([]);
  expect(crosscheckMarkdown(`> **試験のポイント**\n> ${ref}`)).toEqual([]);
});

it('空行のあるリストで項目の印に続けた画像が段落になると逆向きのずれを報告します', () => {
  expect(crosscheckMarkdown('- ![図](#/diagrams/dg-test)\n\n- 次の項目です。')).toEqual([
    { line: 1, message: expect.stringContaining('表示は画像だけの段落と読みましたが、検査では画像だけの行になっていません') },
  ]);
});

it('一段落の問いと理由の図・リンクは表示される参照として照合します', () => {
  const markdown = check.replace('問いですか？', `問いですか？\n> ${image}`)
    .replace('理由です。', '理由です。\n>\n> [図へ](#/diagrams/dg-a?step=2)');
  expect(parseInlineChecks(markdown)[0].problems).toEqual([]);
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it('元の引用ではコードになった図も、組み立て直した理由で表示する場合は照合します', () => {
  const markdown = check.replace('理由です。', `理由です。\n>\n>     ${image}`);
  expect(parser.parse(markdown).children[0].children.at(-1).type).toBe('code');
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each([
  ['選択肢', check.replace('[x] はい', '[x] [図](&#35;/diagrams/dg-a)'), 1],
  ['問い', check.replace('問いですか？', '# [図](&#35;/diagrams/dg-a)'), 2],
])('文字だけで表示する%sの図リンクは文字参照で書いても突き合わせが報告します', (part, markdown, line) => {
  expect(parseInlineChecks(markdown)).toMatchObject([{ problems: [] }]);
  expect(crosscheckMarkdown(markdown)).toEqual([{ line, message: `${part}に図・実物・画像と、図や実物へのリンクは書けません。` }]);
});

it('確認を組み立て直した後の図の参照のずれを元の行で報告します', () => {
  const markdown = check.replace('理由です。', '理由です。\n>\n> ![図](#/diagrams/dg-&#97;)');
  expect(crosscheckMarkdown(markdown)).toEqual([
    { line: 9, message: diagramMessage },
    { line: 9, message: expect.stringContaining('図の参照 #/diagrams/dg-&#97; を、検査と表示で違って読んでいます') },
  ]);
});

it('コードフェンスの記法の例とインラインコードの中の図の参照にはずれがありません', () => {
  const markdown = ['```markdown', check, image, '```', '', `記法は \`${image}\` です。`].join('\n');
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each([
  ['```js\nコードの行\n\n', check, '\n```', 4],
  ['- 項目\n\n  ~~~text\n  コードの行\n', indent(check), '\n  ~~~', 5],
  ['> ```js\n> コードの行\n', check.replace(/^/gm, '> '), '\n> ```', 3],
])('後ろのフェンスまでコードに入った確認を見出しの行で報告します（%s）', (before, body, after, line) => {
  expect(crosscheckMarkdown(before + body + after)).toEqual([
    { line, message: expect.stringContaining('その場の確認の見出しがコードの中にあります') },
  ]);
});

it.each(['markdown', 'md'])('%s のコードフェンスに書いた記法の例は通ります', (lang) => {
  expect(crosscheckMarkdown(['```' + lang, check, '```'].join('\n'))).toEqual([]);
  expect(crosscheckMarkdown('10. 項目\n\n' + indent(['```' + lang, check, '```'].join('\n'), 4))).toEqual([]);
});

it('本文末までフェンスが閉じず確認も入った場合は、開きの行だけを報告します', () => {
  expect(crosscheckMarkdown('```js\nコードの行\n' + check)).toEqual([{ line: 1, message: fenceMessage }]);
});

it.each([
  '~~~markdown\n```',
  '````markdown\n```',
  '~~~markdown\n    ~~~',
  '> ~~~markdown\n> ```',
  '~~~',
])('本文末まで閉じていないコードフェンスを開きの行で報告します（%s）', (source) => {
  expect(crosscheckMarkdown(`前置きです。\n\n${source}\r\n\r\n`)).toEqual([{ line: 3, message: fenceMessage }]);
});

it.each([
  '~~~text\n本文です。\n~~~~ \t',
  '````markdown\n```text\n本文です。\n```\n````',
  '> ~~~text\n> 本文です。\n> ~~~',
  '- 項目\n\n  ~~~text\n  本文です。\n  ~~~',
  '    ~~~text\n    本文です。',
])('正しく閉じたフェンスや字下げのコードブロックは通ります（%s）', (markdown) => {
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each([
  ['段落', '前の段落です。'],
  ['見出し', '## 節'],
  ['リスト', '- 項目です。'],
  ['表', '| a | b |\n|---|---|\n| 1 | 2 |'],
  ['空白だけの行で分けた引用', '> 前置きです。\n続きの行です。\n \t '],
  ['引用記号を含むコードフェンス', '```text\n> 例です。\n```'],
])('%sの直後に置いた確認にはずれがありません', (_label, prefix) => {
  const markdown = `${prefix}\n${check}`;
  expect(parseInlineChecks(markdown)).toMatchObject([{ problems: [] }]);
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it.each([
  ['トップレベル', check],
  ['リストの中', `- 項目\n\n${indent(check)}`],
  ['番号付きリストの中', `1. 項目\n\n${indent(check, 3)}`],
])('%sに正しく書いた確認は検査と突き合わせを通ります', (_label, markdown) => {
  expect(parseInlineChecks(markdown)).toMatchObject([{ problems: [] }]);
  expect(crosscheckMarkdown(markdown)).toEqual([]);
});

it('閉じ忘れた markdown のフェンスの中の確認を、見出しのあとにあるものだけ警告する', () => {
  const example = '> **その場の確認**\n> 問い\n> - [x] 正\n> - [ ] 誤\n>\n> 理由';
  // 閉じ忘れ: フェンスの中に次の見出しと本文の確認が入る
  expect(suspectMarkdownFences(`## 例\n\n\`\`\`markdown\n${example}\n\n## 次の節\n\n${example.replace('問い', '別の問い')}\n\`\`\`\n`))
    .toEqual([{ line: 3, checkLine: 13 }]);
  // 記法の例だけ（見出しなし）、markdown 以外のフェンス、閉じたあとの確認は警告しない
  expect(suspectMarkdownFences(`\`\`\`markdown\n${example}\n\`\`\`\n\n## 次の節\n\n${example}\n`)).toEqual([]);
  expect(suspectMarkdownFences(`\`\`\`text\n## 見出し\n${example}\n\`\`\`\n`)).toEqual([]);
});
