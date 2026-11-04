# 問題・レッスンの作成基準

SAA Dojo のコンテンツ（問題、レッスン、フラッシュカード、用語集、早見表、ガイド）を作るときの基準です。形式は `scripts/lib/schema.mjs` が正で、`npm run validate` で検査します。例題は `content/saa-c03/questions/*/*/saa-*-ex-*.json` と `content/saa-c03/lessons/d4/lesson-4.1-s3-storage-classes.md` を参照してください。

## 1. 出題範囲と項目 ID

- 出題範囲は `content/saa-c03/blueprint.json` です。4ドメイン・14タスクの「知識（K）」「スキル（S）」の項目に ID（例 `1.1-K3`、`3.4-S2`）があり、問題の `knowledgeRefs` にはそのタスクの項目 ID を1〜4個入れます。
- 基礎講座（AWS 未経験者向け）の項目は `basics-K1`〜`basics-K14` です。
- `services` は blueprint の対象サービス一覧の正式名で書きます。対象外サービスは誤答の選択肢には使えますが、正解にはしません。

## 2. ファイルと ID

| 種類 | 置き場所 | ID |
|---|---|---|
| 問題 | `content/saa-c03/questions/d<ドメイン>/<タスク>/<id>.json`（基礎講座は `questions/basics/<id>.json`） | `saa-<タスク>-<作成者ID>-<3桁>`（例 `saa-3.4-g8-001`、`saa-basics-f-001`） |
| レッスン | `content/saa-c03/lessons/d<ドメイン>/<id>.md`（基礎講座は `lessons/basics/<id>.md`） | `lesson-<タスク>-<英小文字とハイフン>` |
| フラッシュカード | `content/saa-c03/flashcards/<deck>.json` | カードは `fc-<作成者ID>-<3桁>` |
| 用語集 | `content/saa-c03/glossary/<名前>.json` | — |
| 早見表・ガイド | `content/saa-c03/cheatsheets/<id>.md`・`content/saa-c03/guides/<id>.md` | `cheatsheet-…`・`guide-…` |

- 1問1ファイル。`createdBy` は ID の作成者IDと同じにし、連番は作成者ごとに 001 から振ります。
- 他の作成者のファイルは編集しません。

## 3. 問題の項目

| 項目 | 内容 |
|---|---|
| `exam` | `SAA-C03` |
| `domain` / `taskStatement` | タスクの番号（基礎講座は 0 / `basics`） |
| `qualifier` | 問題文の制約語が最優先しているもの。`cost` コスト、`operational` 運用負荷、`availability` 可用性・耐障害性、`performance` 性能、`security` セキュリティ、`minimal-change` 変更最小、`other` |
| `difficulty` | 1〜3（7章） |
| `type` / `selectCount` | `single` は選択肢4つで正解1つ。`multiple` は選択肢5つで正解2つ（まれに6つで3つ） |
| `stem` | 問題文。日本語で150〜350字 |
| `options` | `id` は a から順。`correct` と、その選択肢がなぜ正しい／誤りなのかを書く `rationale` |
| `explanation` | 正解の理由を仕組みで説明する総合解説 |
| `keyPoints` | 他の問題にも使える判断のコツ（1〜5個） |
| `references` | AWS 公式の実在 URL（1〜3個） |
| `lessonRefs` | 関連レッスンの ID |
| `pool` | `basics` 基礎講座、`practice` 演習、`mockA`・`mockB` 保留模試（演習には出ない） |
| `needsSourceCheck` | 公式ドキュメントで確認しきれなかった事実を含むとき `true` |

## 4. 問題文の作り方

1. AWS 公式ドキュメントで確かめた事実を出発点にし、独自のシナリオを作ります。
2. 会社や状況、満たすべき要件、制約（予算、期限、既存システム、規制など）を書き、最後に問いを置きます。
3. 正解を決める制約語をはっきり書きます。例:「最もコスト効率が高い」「運用上のオーバーヘッドが最も少ない」「既存アプリケーションの変更を最小限に」「高可用性」「最小権限」。
4. 文体はです・ます調。サービス名は英語の正式名（例 Amazon S3、AWS Lambda）。
5. 改名されたサービスは新しい名前を使い、解説の初出で旧称を併記します。例: Amazon Data Firehose（旧称 Amazon Kinesis Data Firehose）、AWS IAM Identity Center（旧称 AWS Single Sign-On）。

## 5. 選択肢

- 正解は1つ（`multiple` は `selectCount` 個）に決まるようにします。
- 誤答は「もっともらしいが、要件を1点だけ満たさない設計」にし、`rationale` でどの要件を満たさないかを書きます。
- アプリが選択肢をシャッフルするので、記号や位置で他の選択肢を指さない（「A と B」「上記の」「前者」などは使わない）。
- 正解だけが長い・詳しいといった偏りを作らない。「すべて正しい」「いずれでもない」は使わない。

## 6. 正確さ・最新性・独自性

- 2026年時点の仕様で書きます。提供終了や新規受付停止のサービスは正解にしません。既定値が変わった機能は、その既定値に依存する問題を作りません。
- 数値（上限、料金、日数など）は、公式ドキュメントで確認できた安定した値だけを使います。
- 公式のサンプル問題、他の出版社や講座の問題集、流出した試験問題を写したり言い換えたりしません。特徴的な言い回しも再利用しません。

### 6.1 最新性の注意（2026年11月時点）

- **正解にしない**（提供終了・新規受付停止）: Amazon Kinesis Data Analytics for SQL Applications、AWS App Mesh、EC2-Classic、EC2 Auto Scaling の起動設定（Launch Configuration。新しいアカウントでは作成できないので起動テンプレートを使う）、Amazon S3 Select、Amazon S3 Object Lambda、Amazon Glacier の独立サービス（ボールトと旧 API。S3 Glacier の各ストレージクラスは引き続き使える）、AWS WAF Classic、Amazon Aurora Serverless v1、AWS CloudTrail Lake、Amazon SNS のメッセージデータ保護。
- **AWS Snowball Edge**: 2025年11月から新規顧客の受付が止まっています。用途はレッスンやフラッシュカードで扱ってよいですが、問題の正解にする場合は解説で必ずこの点に触れます。
- **新旧の名前を併記する**: Amazon Data Firehose（旧称 Amazon Kinesis Data Firehose）、Amazon Managed Service for Apache Flink（旧称 Amazon Kinesis Data Analytics for Apache Flink）、Aurora Serverless v2 は「Aurora serverless」に改称、Aurora Global Database の計画的切り替え（Switchover）と障害時のフェイルオーバー（Failover）の区別、EventBridge のカスタムイベントバス（従来型の classic と新しい enhanced）。
- **既定値に依存する問題を作らない**: S3 の既定の暗号化（SSE-S3）、新しいバケットのブロックパブリックアクセスと ACL 無効化、S3 ライフサイクルで128 KB未満のオブジェクトを移行しない既定動作、Amazon Linux 2023 の IMDSv2 必須、STS のリージョンエンドポイントの扱い、RDS 延長サポートへの自動加入。

## 7. 難易度

| 難易度 | 目安 | 割合 |
|---|---|---|
| 1 | 1つのサービスの基本的な事実を短い状況に当てはめる | 20% |
| 2 | 本番と同程度。1〜2個の制約のもとで、もっともらしい2〜3案を比べる | 50% |
| 3 | 複数の制約、紛らわしい違い（例 CloudFront と Global Accelerator、ゲートウェイ型とインターフェイス型の VPC エンドポイント）、長めのシナリオ | 30% |

`multiple` は全体の約20%にします。保留模試（`mockA`・`mockB`）は難易度2〜3の本番レベルにし、演習問題と内容を重複させません。

## 8. 解説・要点・出典

- `explanation` は「なぜ正しいか」を仕組みで説明し、よく比べられる選択肢との違いにも触れます。
- `keyPoints` には再利用できるコツを書きます。例:「運用負荷を最小に → マネージドサービスやサーバーレスを優先」。
- `references` は docs.aws.amazon.com、aws.amazon.com、d1.awsstatic.com の実在するページだけです。推測で深いリンクを作らず、ユーザーガイドの概要ページや FAQ を優先します。

## 9. 網羅

- blueprint の各項目に、時間をかけて2問以上を用意します。
- 対象サービスはすべて、問題かフラッシュカードで1回以上扱います。
- `npm run coverage` で不足を確認できます。

## 10. レッスン

- front matter（YAML）: `id`、`title`、`domain`、`taskStatement`、`order`、`knowledgeRefs`、`services`、`estimatedMinutes`、`createdBy`。
- AWS を触ったことがない人でも読める構成にします: 基礎 → 使い分け → 設計パターン → 試験のポイント → ひっかけ注意 → 確認問題。
- 2,000〜5,000字。比較は表にします。
- 囲み記事は引用記法で書きます: `> **試験のポイント**`、`> **ひっかけ注意**`。

## 11. フラッシュカード・用語集・早見表・ガイド

- フラッシュカード: `{ "deck", "title", "createdBy", "cards": [{ "id", "front", "back", "taskStatements", "services", "tags" }] }`。表は問い、裏は短い答えと理由。
- 用語集: `{ "createdBy", "entries": [{ "term", "en", "definition", "services", "related" }] }`。
- 早見表・ガイド: Markdown。front matter は `id`、`title`、`order`、`taskStatements`、`services`、`createdBy`。

## 12. 検証状態

`content/saa-c03/review-status.json` に問題ごとの状態（`verified`、`pending`、`needs-fix`、`rejected`）と確認日を記録します。アプリは `needs-fix` と `rejected` の問題を出さず、記録のない問題は `pending`（未検証）として扱います。

## 13. コマンド

```bash
npm ci
npm run validate   # 形式の検査（エラーがあれば失敗）
npm run coverage   # 網羅状況の集計
```
