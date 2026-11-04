#!/usr/bin/env node
// コンテンツをアプリ用の分割 JSON に変換する（npm run build の前に実行）。
//   node scripts/build-content.mjs [--content <dir>] [--out <dir>] [--quiet]
//     --content  content/saa-c03 のディレクトリ（既定: ../content/saa-c03）
//     --out      出力先（既定: public/data）
//     --quiet    警告を表示しない
// 検証はリポジトリ直下の scripts/lib/schema.mjs で行い、エラーがあれば終了コード 1 で止める。
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const repoRoot = path.resolve(appDir, '..');

// ルートの node_modules がなくても schema.mjs の zod を app/node_modules から読めるようにする
register('./lib/resolve-fallback.mjs', import.meta.url, {
  data: { fallbackParent: pathToFileURL(path.join(appDir, 'package.json')).href },
});

function parseArgs(argv) {
  const opts = {
    content: path.join(repoRoot, 'content', 'saa-c03'),
    out: path.join(appDir, 'public', 'data'),
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--content') opts.content = path.resolve(argv[++i] ?? '');
    else if (a === '--out') opts.out = path.resolve(argv[++i] ?? '');
    else if (a === '--quiet') opts.quiet = true;
    else {
      console.error(`不明なオプション: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const schema = await import(pathToFileURL(path.join(repoRoot, 'scripts', 'lib', 'schema.mjs')).href);
const { buildContent } = await import('./lib/content-build.mjs');

const result = buildContent({ contentDir: opts.content, outDir: opts.out, schema });
if (!opts.quiet && result.warnings.length) {
  console.warn(`警告 ${result.warnings.length} 件`);
  for (const w of result.warnings.slice(0, 30)) console.warn(`  - ${w}`);
  if (result.warnings.length > 30) console.warn(`  …ほか ${result.warnings.length - 30} 件`);
}
if (!result.ok) {
  console.error(`コンテンツの検証に失敗したため、ビルドを中止します（エラー ${result.errors.length} 件）`);
  for (const e of result.errors.slice(0, 50)) console.error(`  - ${e}`);
  if (result.errors.length > 50) console.error(`  …ほか ${result.errors.length - 50} 件`);
  process.exit(1);
}
const c = result.manifest.counts;
console.log(
  `コンテンツを書き出しました（${path.relative(process.cwd(), opts.out) || '.'}）: ` +
    `演習 ${c.questions.practice} 問 / 基礎 ${c.questions.basics} 問 / 模試A ${c.questions.mockA} 問 / 模試B ${c.questions.mockB} 問 / ` +
    `レッスン ${c.lessons + c.basicsLessons} 本 / カード ${c.flashcards} 枚 / 用語 ${c.glossary} 語 / ` +
    `早見表 ${c.cheatsheets} / ガイド ${c.guides}（除外: 要修正 ${c.excluded['needs-fix']}・却下 ${c.excluded.rejected}）`,
);
