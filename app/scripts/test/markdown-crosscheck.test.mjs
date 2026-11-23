// @vitest-environment node
import { expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { isInlineCheckBlockquote, parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
import { crosscheckMarkdown } from '../lib/markdown-crosscheck.mjs';

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

it.each([
  ['全角空白で区切った引用', `> 前置きです。\n　\n${check}`, 3, 6],
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

it('確認の外では引用内のタスクリストと本文の強調見出しだけを報告します', () => {
  const markdown = '- [x] 引用の外\n\n> - [ ] 引用の中\n> - [x] 引用の中\n\n文中の **その場の確認&#32;:** です。';
  expect(crosscheckMarkdown(markdown)).toEqual([
    { line: 3, message: taskMessage }, { line: 4, message: taskMessage }, { line: 6, message: headingMessage },
  ]);
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
  expect(crosscheckMarkdown(markdown)).toEqual([{ line, message: `${part}に図や画像、図へのリンクは書けません。` }]);
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
