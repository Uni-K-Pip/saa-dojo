# SAA Dojo

AWS Certified Solutions Architect – Associate（SAA）に、このアプリだけで合格することを目指す非公式の学習アプリ（PWA）です。スマホと PC の両方で使え、オフラインでも動きます。

> 非公式の学習用アプリです。Amazon Web Services, Inc. およびその関連会社とは関係ありません。AWS および各サービス名は Amazon.com, Inc. またはその関連会社の商標です。問題はすべて独自に作成したもので、実際の試験問題ではありません。

## 構成

| パス | 内容 |
|---|---|
| `app/` | PWA 本体（Vite + React + TypeScript） |
| `content/saa-c03/` | 問題・レッスン・フラッシュカード・用語集・ガイド |
| `scripts/` | コンテンツの検証・集計スクリプト |
| `docs/` | 設計書、アプリ仕様、教材の作成基準 |

## ドキュメント

| 文書 | 内容 |
|---|---|
| `docs/learning-design.md` | 全体の設計。目標、教材の体系、学習コース、網羅と受け入れの基準、計画（未実装を含む） |
| `docs/visual-materials-design.md` | 図解・操作型教材の設計（未実装を含む） |
| `docs/service-catalog-design.md` | サービス図鑑の設計 |
| `docs/sims-design.md` | シミュレーターの共通の枠の設計 |
| `docs/sim-cidr-design.md` | シミュレーター「CIDR とサブネット」の設計 |
| `docs/sim-trace-design.md` | シミュレーター「VPC の通信の追跡」の設計 |
| `docs/content-guide.md` | 実装済みの教材の形式と書き方の規則 |
| `docs/app-spec.md` | 実装済みのアプリの仕様 |

## ブランチ

- `develop`: 統合用の既定ブランチ
- `main`: リリース専用。push すると GitHub Pages に公開される
