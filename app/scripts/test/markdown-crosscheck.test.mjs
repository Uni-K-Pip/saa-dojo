// @vitest-environment node
import { expect, it } from 'vitest';
import { parseInlineChecks } from '../../../scripts/lib/inline-check.mjs';
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
const diagramMessage = expect.stringContaining('図の参照 #/diagrams/dg-a を、検査と表示で違って読んでいます');

it.each([
  ['4 字下げした確認', check.split('\n').map((line) => `    ${line}`).join('\n'), 1],
  ['HTML ブロックに入った確認', `<div>\n${check}`, 2],
  ['フェンスに見える行の直後の確認', '```a`b\n' + check, 2],
])('%sのずれを本文の行で報告します', (_label, markdown, line) => {
  expect(crosscheckMarkdown(markdown)).toEqual([{ line, message: checkMessage }]);
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
])('%sの直後に置いた確認にはずれがありません', (_label, prefix) => {
  expect(crosscheckMarkdown(`${prefix}\n${check}`)).toEqual([]);
});
