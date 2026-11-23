// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, resolveConfig } from 'vite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { guardUnverifiedContent } from '../../vite.config.ts';

let root;
let manifest;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'saa-vite-build-'));
  const data = path.join(root, 'public', 'data');
  fs.mkdirSync(data, { recursive: true });
  manifest = path.join(data, 'manifest.json');
  vi.stubEnv('SAA_ALLOW_UNVERIFIED_BUILD', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

const resolve = (command, isPreview = false) => resolveConfig({
  configFile: false, root, plugins: [guardUnverifiedContent()],
}, command, undefined, undefined, isPreview);

it('未検証を含むコンテンツで Vite のビルドを止め、環境変数で解除できる', async () => {
  fs.writeFileSync(manifest, '{"includeUnverified":true}');
  await expect(resolve('build')).rejects.toThrow(/npm run content.*SAA_ALLOW_UNVERIFIED_BUILD=1/);
  vi.stubEnv('SAA_ALLOW_UNVERIFIED_BUILD', '1');
  await expect(resolve('build')).resolves.toBeDefined();
});

it.each([undefined, '{', '{}', '{"includeUnverified":false}'])('manifest が %s のときは Vite のビルドを止めない', async (text) => {
  if (text !== undefined) fs.writeFileSync(manifest, text);
  await expect(resolve('build')).resolves.toBeDefined();
});

it('開発サーバーと preview の設定では、未検証を含むコンテンツを許す', async () => {
  fs.writeFileSync(manifest, '{"includeUnverified":true}');
  await expect(resolve('serve')).resolves.toBeDefined();
  await expect(resolve('serve', true)).resolves.toBeDefined();
});

function buildWithExternalPublicDir() {
  const publicDir = path.join(root, 'external-public');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(publicDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'data', 'manifest.json'), '{"includeUnverified":true}');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'index.html'), '<!doctype html><title>検査用の画面</title>');
  return build({
    configFile: false, root: project, publicDir, plugins: [guardUnverifiedContent()],
    build: { write: false }, logLevel: 'silent',
  });
}

it('Vite の JS API で root の外に指定した publicDir の manifest でもビルドを止める', async () => {
  await expect(buildWithExternalPublicDir()).rejects.toThrow(/npm run content.*SAA_ALLOW_UNVERIFIED_BUILD=1/);
});

it('環境変数で root の外に指定した publicDir のガードも解除できる', async () => {
  vi.stubEnv('SAA_ALLOW_UNVERIFIED_BUILD', '1');
  await expect(buildWithExternalPublicDir()).resolves.toBeDefined();
});
