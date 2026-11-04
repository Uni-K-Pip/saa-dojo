# SAA Dojo

AWS Certified Solutions Architect – Associate（SAA）に、このアプリだけで合格することを目指す非公式の学習アプリ（PWA）です。スマホと PC の両方で使え、オフラインでも動きます。

> 非公式の学習用アプリです。Amazon Web Services, Inc. およびその関連会社とは関係ありません。AWS および各サービス名は Amazon.com, Inc. またはその関連会社の商標です。問題はすべて独自に作成したもので、実際の試験問題ではありません。

## 構成

| パス | 内容 |
|---|---|
| `app/` | PWA 本体（Vite + React + TypeScript） |
| `content/saa-c03/` | 問題・レッスン・フラッシュカード・用語集・ガイド |
| `scripts/` | コンテンツの検証・集計スクリプト |
| `docs/` | アプリ仕様と問題の作成基準 |

## ブランチ

- `develop`: 統合用の既定ブランチ
- `main`: リリース専用。push すると GitHub Pages に公開される
