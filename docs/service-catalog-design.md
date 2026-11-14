# AWS サービス図鑑の設計書

SAA Dojo に「AWS サービス図鑑」（以下、図鑑）を追加するための設計です。形式の正本はこれまでどおり `scripts/lib/schema.mjs` で、この設計書はそこに足すものと、その理由・手順を決めます。

- 状態: 確定（2026-11-13 に U-2・U-6・U-7、2026-11-14 に U-3・U-4・U-8・U-10・U-11・U-12・U-13・U-14・U-15 を決定。決定済みの事項に基づく箇所には【決定 U-番号】と付けています。受け入れ基準の数値だけは、U-15 の決定どおり中間の監査のあとに決めます）
- 作成日: 2026-11-13
- 表記: 実物を読んで確かめたことには「（確認済み）」、読んでいないものや推測には「（推測）」と付けます。

## 0. 前提と、確かめたこと

### 0.1 読んだもの

- リポジトリ: `docs/app-spec.md`、`docs/content-guide.md`、`README.md`、`scripts/lib/schema.mjs`、`scripts/validate.mjs`、`scripts/coverage.mjs`、`app/scripts/build-content.mjs`、`app/scripts/lib/content-build.mjs`、`app/vite.config.ts`、`app/src/App.tsx`、`app/src/content/loader.ts`、`app/src/pages/GlossaryPage.tsx`、`app/src/pages/DocsPage.tsx`、`app/src/components/Layout.tsx` の画面一覧、`app/src/components/Markdown.tsx` のリンク処理、`app/src/domain/events.ts`・`selection.ts`・`links.ts`、`content/saa-c03/blueprint.json` の services と keyServices、教材の実例（`lesson-4.1-s3-storage-classes`、`cheatsheet-vpc-endpoints`、`x-cloud-network.json`、`w2c-services-a.json`、`saa-1.1-g1-001`）、`review-status.json`
- 一部だけ読んだもの: `LessonPage.tsx`（読了ボタンと本文の描画）、`AnswerFeedback.tsx`（要点・出典・関連レッスンの表示箇所）
- 監査の出力（読み取り専用）: `input-gap-report.md`、`input-gap-result.json` の形、`deterministic.json`、`audit-prep.mjs`、監査時に保存された公式の対象サービス一覧 `official-inscope.json`
- 初回制作時の場所: `C:\Users\kohei\work\saa-dojo-ops` の `runner/`（Codex CLI で問題を二重チェックするキュー）、`runner/schemas/pass2.schema.json`、ジョブのプロンプト（第1段のブラインド解答、第2段の詳細レビュー）、`out/fix-lists/`、`out/livecheck/skeptic/`（出典 URL の HTTP 状態の一覧など）。`.claude/projects/...app-features` には memory フォルダや Markdown のメモはなく、`custom-title.json` だけでした。
- 読んでいないもの: 監査の第2段・第3段のスクリプト（`audit-stage2.mjs`・`audit-stage3.mjs`）、レッスン本文の大半、`DrillPage`・`AnalysisPage` の中身。これらの中身は断定しません。

### 0.2 設計に効く事実（確認済み）

1. **正式名と略称が両方とも「完全一致」で登録されている。** `buildServiceIndex` は blueprint の `services.inScope`（長い正式名。例 `Amazon Simple Storage Service`）とタスクの `keyServices`（略称を含む表記。例 `Amazon S3`）の両方を対象サービスとして登録します。そのため `resolve()` はどちらの表記も `exact: true` で返し、表記ゆれの警告（`service-alias`）が出ません。今の `npm run validate` の警告は 19 件だけで、この 15 組はどれも検出されていません。
2. **重複はアプリの表示にも出ている。** 演習の条件のサービス一覧（`PracticeSetupPage` の `countBy(pool, q => q.services)`）と弱点分析のサービス別集計（`analysis.ts` の `add(service, s, …)`）は `services` の文字列をそのまま使うので、`Amazon S3` と `Amazon Simple Storage Service` が別の行になります。
3. **長い表記を使っているファイル**: 問題 213 問（うち保留模試 122 問）、レッスン 10 本、フラッシュカード 4 デッキの 48 枚。早見表と用語集は 0 件。問題の作成者別では w2m 122、w2a 34、w2c 23、g4 17、g5 7、g1 5、g8 3、g2 2 です（集計スクリプトで数えました）。
4. **公式の対象サービス一覧は略称で書かれている。** 監査時に保存された `official-inscope.json` では `Amazon S3`、`Amazon EC2`、`AWS DMS`、`AWS KMS`、`IAM`、`Elastic Load Balancing (ELB)` などの表記です（119 件）。リポジトリの `inScope` は長い正式名に書き直されています。この一覧がいつ取得されたかは確認していません。
5. **ビルドは未知のファイルを読み飛ばすだけ、validate はエラーにする。** `content-build.mjs` の `classify()` は規則外のファイルを警告して読み飛ばし、`validate.mjs` の `classify()` は `unexpected-file` のエラーにします。新しい種類のファイルを足すときは両方の分類を直す必要があります。
6. **スキーマの方針**: `schema.mjs` の冒頭に「項目の削除・必須化はしない（任意項目の追加のみ）」とあります。`ReviewStatusSchema` のキーは問題 ID の正規表現に限られています。
7. **オフライン**: `vite.config.ts` の Workbox は `data/**/*.json` をすべて事前キャッシュします（1ファイル 8 MB まで）。今のデータは合計で約 3.5 MB です（`app/public/data` の実測。レッスン本文 0.5 MB を含む）。
8. **学習履歴のイベント**: `isEventLike()` は `type` が 32 文字以下の文字列なら受け入れ、`history.ts` は知らない種類を無視します。新しい種類のイベントを足しても、古い版のアプリと同期して壊れることはありません（コードの読み取りによる判断で、実機では試していません）。
9. **Markdown のリンク**: `Markdown.tsx` は `http(s)://` 以外のリンクを普通の `<a href>` で出します。HashRouter なので、本文に `#/services/s3?f=access-points` のようなリンクを書けば画面内で移動できます（推測。描画の実験はしていません）。
10. **初回制作時の検証の流れ**（ops の runner から読み取り）: 第1段で別のモデルが正解を見ずに解き（ブラインド解答。参照してよいのは AWS 公式だけで、GitHub や公開サイトは禁止）、第2段で ok / fix / reject と指摘・修正案・根拠 URL を返す詳細レビューを行い、結果を `review-status.json` と作成者ごとの修正リストにまとめていました。出典 URL の HTTP 状態を一覧にする検査もありました。問題ファイルの内容が変わると自動で再チェックされる仕組みでした（`fix-lists/w2c.md` の記述）。

### 0.3 監査の数字（`input-gap-report.md` から）

- 模試 A・B の 160 問のうち、全選択肢に根拠がある問題は 46 問。誤答の一部に不足 35 問、正解の根拠が一部だけ 54 問、正解の根拠なし 25 問。
- 不足している知識は 219 件（タスク別: 1.1 が 32、1.2 が 27、1.3 が 19、2.1 が 33、2.2 が 16、3.1 が 3、3.2 が 15、3.3 が 14、3.4 が 10、3.5 が 4、4.1 が 12、4.2 が 5、4.3 が 18、4.4 が 11）。各件は `問題ID/選択肢ID`、正解か誤答か、「なし」か「一部」か、不足している知識の文で表されています。
- ほかに 13 件は、知識は教材にあるが、そのタスクのレッスンや `lessonRefs` からたどれないものです。
- 名寄せ後のサービスは 132 件。

## 1. 目的と範囲

### 1.1 図鑑が担うこと

図鑑は「サービスを引いて、機能・制約・数値・似たサービスとの違いを確かめる辞書」です。読む順番を前提にせず、問題の解説やレッスンから飛んできて1件だけ読む使い方を主にします。

- サービスごとに: 何をするか、選ばれる決め手、選ばれない条件、機能単位の知識（1件ずつ、出典 URL と確認日つき）、似たサービスとの比較へのリンク、関連する教材へのリンク
- 機能単位の知識（以下「事実」）の**正本**になる。例: S3 アクセスポイント、`aws:PrincipalOrgID`、Aurora のバックトラック、ElastiCache のグローバルデータストア、Lambda の並列化係数
- 監査で見つかった不足 219 件の受け皿になる

### 1.2 図鑑が担わないこと

- 学習の流れや設計パターンの説明（レッスンの役割）
- 試験の問題形式、解き方のコツ（ガイド・判断軸ドリルの役割）
- サービスに属さない一般的な概念の定義（例 RPO、CIDR。用語集の役割）
- 試験範囲外のサービスの解説（誤答の選択肢によく出るものも、範囲外のサービスはエントリを作らない。必要なら範囲内のサービスの事実の中で「〜とは違う」と触れる）
- 料金の金額（料金の仕組みは書くが、単価は書かない）

### 1.3 役割分担

| 教材 | 単位 | 主な使い方 | 図鑑との関係 |
|---|---|---|---|
| レッスン | タスク | 通読して理解する。なぜその設計か | 細かい機能は図鑑の事実へリンクし、本文では要点だけにする |
| 早見表 | テーマ（複数サービス） | 横断の比較表を見る | 図鑑の比較は早見表にない組だけを持ち、早見表がある組はリンクだけにする |
| 用語集 | 用語 | 語の意味を短く確かめる | サービス固有の機能は図鑑、サービスをまたぐ概念は用語集。用語集のバッジから図鑑へ移動できるようにする |
| 暗記カード | 問いと答え | 想起の練習 | 図鑑からは作らない（将来の拡張として、図鑑の事実からカードを作る余地は残す） |
| 判断軸ドリル | 制約語 | 制約語から設計を素早く選ぶ | 変更しない |
| **図鑑** | サービスと事実 | 引いて確かめる | 機能・制約・数値の正本 |

### 1.4 重複を避ける方法

1. **正本は1か所**: 機能単位の事実は図鑑だけが正本です。複数のサービスにまたがる事実は、その機能を提供するサービスのエントリに置きます（例: `aws:PrincipalOrgID` は IAM の条件キーなので IAM のエントリに置き、S3 のエントリからは参照だけする。3.6 の `seeAlso`）。
2. **比較は組ごとに1ファイル**: 似たサービスの比較はエントリの外に組単位で持ち、両方のエントリが同じ比較を表示します（3.7）。
3. **早見表と重なる比較は書かない**: 比較の組が既存の早見表で扱われていれば、比較ファイルは早見表へのリンクと「見分け方」の1〜3行だけにします。
4. **機械の検査**: 事実の本文と用語集の定義が似すぎていないかを、既存の `findNearDuplicates`（文字 3-gram の Jaccard 係数）と同じ方法で調べ、警告にします（4.1）。
5. **人の検査**: 検証の工程で、同じサービスを扱うレッスン・用語集・カードの抜粋を検証役に渡し、内容が食い違っていないかを確かめます（6.4）。食い違いが見つかったら、どちらが正しいかを確かめ、誤っている方を直す作業を別に起こします（図鑑の作業で既存教材を直接直さない）。

## 2. サービス台帳の整理

図鑑はサービスをキーにするので、先に「1つのサービスに1つの ID と1つの正規名」を決めます。

### 2.1 方針

- 新しく **サービス台帳** `content/saa-c03/services.json` を作ります。blueprint は公式の試験ガイドの写しとして今のまま残し、台帳がサービスの ID・正規名・別名を持ちます。【決定 U-3】
- 正規名は、タスクの `keyServices` の表記に合わせます（例 `Amazon S3`、`AWS Key Management Service (AWS KMS)`、`AWS Identity and Access Management (IAM)`、`AWS Database Migration Service (AWS DMS)`）。15 組のすべてに `keyServices` の表記があり、レッスン・早見表・用語集で多く使われている表記でもあります。括弧つきの表記からは、既存の `serviceNameForms()` が `AWS KMS`・`KMS` などの別表記を自動で作れます。`keyServices` が略称だけの表記（例 `Amazon S3`）のサービスは、その表記を正規名にします。【決定 U-2】
- 長い正式名（例 `Amazon Simple Storage Service`）は `aliases` に入れます。

### 2.2 台帳の形

```json
{
  "checkedAt": "2026-11-13",
  "services": [
    {
      "id": "s3",
      "name": "Amazon S3",
      "short": "S3",
      "aliases": ["Amazon Simple Storage Service"],
      "category": "ストレージ"
    },
    {
      "id": "ec2-spot",
      "name": "Amazon EC2 Spot Instances",
      "short": "スポットインスタンス",
      "aliases": [],
      "category": "コンピューティング",
      "hostedBy": "ec2"
    }
  ]
}
```

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | `^[a-z][a-z0-9-]{1,39}$`。ベンダー名を外した略称を小文字とハイフンにしたもの（`s3`、`ec2-auto-scaling`、`iam-identity-center`）。一度決めたら変えない。細則は下の「ID の付け方」 |
| `name` | 必須 | 正規名。`services` 欄にはこの表記を書く |
| `short` | 任意 | スマホの狭い表示に使う短い名前 |
| `aliases` | 必須（空配列可） | 同じサービスとみなす表記。括弧の分解やベンダー名の省略で導ける表記は書かなくてよい |
| `category` | 必須 | blueprint の `inScope` の分類名（keyServices にしかないものは、内容から分類を選ぶ） |
| `hostedBy` | 任意 | 独立したエントリを作らず、別のサービスのエントリの中で扱うときの、そのサービスの `id`【決定 U-8】 |
| `note` | 任意 | 改名の経緯など |

**ID の付け方**（2026-11-14 に利用者が確認して確定）:

1. 名前に AWS の略称があれば、それを使う（`kms`、`iam`、`acm`、`dms`、`elb`、`ecr`、`ram`、`cli`）。
2. なければ、ベンダー名（Amazon / AWS）を外した名前を、小文字とハイフンにする（`step-functions`、`iam-identity-center`）。
3. 改名で変わりやすい語は外す（`sagemaker`（SageMaker AI）、`opensearch`（OpenSearch Service）、`firehose`（Data Firehose））。
4. AWS が API や ARN で使う表記があれば、それに合わせる（`route53`、`xray`）。短い形が自然なものは短くする（`ec2-spot`）。
5. 長くても、AWS の略称に縮めない（`application-migration-service` を `mgn` にしない）。初学者に読めることを優先する。

- blueprint の `inScope` と全タスクの `keyServices` の名前は、どれも台帳のちょうど1つの `id` に解決できなければなりません（validate のエラー）。
- `outOfScope` は台帳に入れません（範囲外の判定は今のまま blueprint で行う）。

### 2.3 統合する組

1. **正式名と略称の 15 組**（`deterministic.json` の `duplicates`）: MSK、SNS、SQS、EC2、ECS、EKS、RDS、DMS、VPC、ACM、KMS、IAM、EBS、EFS、S3。それぞれ1つの `id` にまとめます。
2. **改名の疑いがある組**: blueprint の `inScope` に `Amazon Quick`、タスク 3.5 の `keyServices` に `Amazon QuickSight` があります。2026-11-13 に AWS の製品ページを確認したところ、Quick Sight は「Quick の中で提供される BI の機能」と説明されていて、改名とは書かれていませんでした（試験ガイドの改訂履歴にも記載なし）。そのため `quick` と `quicksight` を別の `id` のままにし、`quicksight` の `note` に経緯を書きました。
3. **親子関係にあるもの**: 次は別のサービスとして登録したまま、`hostedBy` で親のエントリにまとめます（2026-11-14 に台帳へ設定済み）。【決定 U-8】
   - `Amazon EC2 Spot Instances` → EC2
   - `Amazon Aurora Serverless` → Aurora
   - `Amazon ECS Anywhere` → ECS
   - `Amazon EKS Anywhere`、`Amazon EKS Distro` → EKS
   ほかの親子（Kinesis と Kinesis Data Streams、DynamoDB と DAX、RDS と RDS Proxy、S3 と S3 Glacier、VPC と NAT gateway・VPC endpoints）は、試験で独立した選択肢として比べられるので、それぞれエントリを作ります。`Amazon Kinesis` はファミリー名なので、区分 3 のエントリにして各サービスへの案内だけを書きます。
4. **台帳にない名前**: 今の validate の警告にある `Amazon Managed Service for Apache Flink` と `AWS Local Zones`（各 1 問）。前者は改名後の名前（content-guide 6.1 に記載）なので、台帳の `Amazon Kinesis` 系か独立の `id` かを決めて登録します。後者はサービスではなくインフラの種類なので、台帳に入れず、問題側の `services` から外すか、用語集で扱います。

統合後の `id` は 132 件（Quick と QuickSight を統合すれば 131 件）、そのうち `hostedBy` を除いたエントリは 127 件になる見込みです。

### 2.4 validate・coverage・ビルドの変更

- `buildServiceIndex(blueprint)` を `buildServiceIndex(blueprint, registry)` にし、`resolve(name)` が `{ kind, id, canonical, exact }` を返すようにします。`exact` は正規名と完全に一致したときだけ `true` です。
- 別名で書かれた `services` は `service-alias` の警告にします。ただし移行期間は数が多い（問題 213 問など）ので、ファイルごとではなく「表記 → 正規名（件数）」の1行ずつにまとめて出します。
- coverage のサービス別集計は `id` 単位にし、`hostedBy` のものは親にまとめて数えます。表には正規名を出します。
- ビルド（`content-build.mjs`）は、出力するすべての `services` を正規名に置き換えて重複を除きます。これで演習の条件と弱点分析の行が統合されます。台帳の要約（`id`、`name`、`short`、`aliases`、`category`、`hostedBy`）も出力します。
- アプリの演習画面の URL（`?services=…`）に古い表記が残っていても、`filterFromQuery` で台帳の別名から正規名に直します。学習履歴は問題 ID しか持たないので、影響はありません（確認済み: `AnswerEvent` に services はない）。

### 2.5 既存ファイルの扱いと移行手順

2026-11-13 の時点では、既存の問題・レッスン・カードの `services` 欄を書き換えず、ビルドと検査の側で正規化する方針でした。理由は、content-guide の「他の作成者のファイルは編集しません」という規則と、ops の仕組みで内容の変わった問題が自動で再チェックされることでした。

**2026-11-14 に利用者が方針を改め、既存ファイルを書き換えました。**【決定 U-2】

- 台帳の別名で書かれていた `services` 欄を、正規名に一括で置き換えた（問題 213・レッスン 10・フラッシュカードのデッキ 4、計 227 ファイル。置き換えたのは `services` 欄の文字列だけで、書式も保った）。作成者に関係なく行った例外として、1 コミットにまとめている。
- 置き換えの前後で、アプリ向けのビルド出力は完全に同じ（`manifest.json` の `contentHash` が一致）。学習履歴や同期への影響はない。
- validate の表記ゆれの警告（15 行）は解消した。ビルド側の正規化は、今後の表記ゆれへの備えとして残している。
- **ops の再チェックへの影響**: runner（`saa-dojo-ops/runner/queue.mjs`）は問題の内容全体からハッシュを作るため、書き換えた 213 問は内容が変わった扱いになる。runner が読むのは origin に push されたブランチ（develop と main を除く）なので、このブランチを push すると 213 問が再チェックの対象になる。
- **対応（2026-11-14）**: push の前に、ops 側で runner の結果を新しい版へ引き継いだ（`runner/carry-services-results.mjs`）。各問題の結果ファイルの履歴に、今の結果の写しを新しい版のハッシュで足し、runner の既存の「履歴にある版の結果を復元する」仕組みで引き継がせた。あわせて runner の批評回数の数え方を、同じジョブの批評を 1 回と数えるように直した。push 後の試運転で、452 問すべてがチェック済みのまま（再チェック待ち 0 問）であることを確かめた。

手順:

1. 台帳を作る（`deterministic.json` の名寄せと `audit-prep.mjs` の `LONG_TO_SHORT` を出発点に、スクリプトで下書きし、人が確認する）
2. スキーマ・validate・coverage・ビルドを台帳に対応させる（7章の T1〜T3）
3. content-guide の「`services` は blueprint の対象サービス一覧の正式名で書きます」を「サービス台帳の正規名で書きます」に改める
4. 新しく作る教材は正規名で書く。別名で書くと validate が表記ごとにまとめて警告する
5. 既存ファイルを正規名に一括で書き換える（2026-11-14 実施。上記）

## 3. エントリのデータ設計

### 3.1 置き場所と形式

| 種類 | 置き場所 | ID |
|---|---|---|
| サービス台帳 | `content/saa-c03/services.json` | サービス `id` |
| エントリ | `content/saa-c03/catalog/services/<id>.json`（1サービス1ファイル） | サービス `id` と同じ |
| 比較 | `content/saa-c03/catalog/comparisons/<id>.json`（1組1ファイル） | `cmp-<英小文字とハイフン>` |
| 検証状態 | `content/saa-c03/catalog-status.json` | エントリ `id` と事実 `id` |
| 不足の対応表 | `content/saa-c03/catalog-needs.json`（アプリには出さない） | `問題ID/選択肢ID` |

- 形式は JSON にします。事実を1件ずつ ID・出典・確認日つきで持ち、zod で検査するには、Markdown の本文より JSON が向いています。既存の問題と同じ扱いです。【決定 U-11】
- 1エントリ1ファイルにするのは、作成者の分担（同じファイルを2つのセッションで同時に編集しない）と、差分を見やすくするためです。

### 3.2 区分（3段階）

| 区分 | 名前 | 中身 | 目安 |
|---|---|---|---|
| 1 | 主要 | すべての欄。事実は 12〜30 件、比較 1 件以上 | 30 件前後 |
| 2 | 標準 | すべての欄。事実は 4〜12 件 | 55 件前後 |
| 3 | 概要 | 名前、用途（`summary`）、選ばれる決め手 1〜2 行、出典。事実は 0〜2 件 | 40 件前後 |

区分の決め方と案は 6.1 に書きます。区分 3 の事実を 0〜2 件まで許すのは、不足 219 件に区分 3 のサービスの知識が含まれていた場合の受け皿にするためです。

### 3.3 エントリのスキーマ

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | 台帳の `id`。ファイル名と同じ |
| `tier` | 必須 | `1` / `2` / `3` |
| `summary` | 必須 | 何をするか。40〜200 字 |
| `chooseWhen` | 区分 1・2 は必須、3 は任意 | 選ばれる決め手。1 項目 10〜120 字、1〜6 個 |
| `avoidWhen` | 区分 1・2 は必須、3 は任意 | 選ばれない条件（「〜なら別のサービス」）。1〜6 個。代わりのサービスがあれば `alternatives` に台帳 `id` を入れる |
| `facts` | 区分 1・2 は 1 件以上 | 事実の配列（3.4） |
| `seeAlso` | 任意 | 他のエントリにある事実の ID（最大 12）。このエントリに関係するが正本は別のサービスにあるもの |
| `lessonRefs` | 任意 | 特に関係の深いレッスン ID（最大 6）。同じサービスを `services` に持つレッスンはビルドで自動的にリンクするので、ここには書かなくてよい |
| `docRefs` | 任意 | 早見表・ガイドの ID（最大 6） |
| `references` | 必須 | エントリ全体の出典（ユーザーガイドの概要ページや FAQ。1〜3 個）。形は問題の `references` と同じ |
| `createdBy` / `createdAt` / `updatedAt` | 必須 / 必須 / 任意 | 問題と同じ規則 |

`chooseWhen` と `avoidWhen` の各項目は `{ "text": "…", "factRefs": ["s3.…"], "alternatives": ["efs"] }` の形にし、`factRefs` で根拠の事実を指せるようにします（任意）。

スキーマ（`CatalogEntrySchema`）では `chooseWhen`・`avoidWhen` を任意にし、区分 1・2 で欠けているときは validate の警告（`catalog-tier`）にします。第1波では区分 1 のエントリでも事実が目安より少ない状態で進めるので、作りかけのエントリでビルドを止めないためです。`facts` は区分 3 のために空の配列を許します。

### 3.4 事実のスキーマ

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | `<サービスid>.<スラッグ>`。スラッグは `^[a-z0-9][a-z0-9-]{1,39}$`。一度公開したら変えず、消した ID も再利用しない |
| `title` | 必須 | 機能名などの見出し。2〜60 字（例「S3 アクセスポイント」） |
| `kind` | 必須 | `feature` 機能 / `constraint` 制約・できないこと / `quota` 数値（上限・既定値・期間） / `pricing` 料金の仕組み / `integration` 他サービスとの連携 |
| `text` | 必須 | 事実の本文。それだけで意味が通るように書く。40〜400 字 |
| `examPoint` | 任意 | 試験での使われ方、決め手になる場面。1 行（最大 150 字） |
| `trap` | 任意 | ひっかけ（よくある誤解）。1 行（最大 150 字） |
| `depth` | 必須 | `core` 試験の水準 / `detail` 試験より細かい可能性がある（4.5） |
| `services` | 任意 | 一緒に出てくる他のサービスの正規名（最大 4） |
| `tags` | 任意 | 検索用の語（最大 6） |
| `sources` | 必須 | 出典（1〜3 個）。`{ title, url }`。`hostAllowed` で AWS 公式ドメインに限る |
| `checkedAt` | 必須 | 出典で内容を確かめた日 |

書き方の規則（content-guide に足す）:

- 1件に1つの事実だけを書きます。「AとBができる」のように別々に確かめる必要がある内容は分けます。
- 「できないこと」は、試験で誤答の決め手になる場合に限って `constraint` として書きます（不足 219 件のうち誤答側が多いため。例: 「IAM のパスワードポリシーでは MFA を必須にできない」）。
- 数値（`quota`）は、試験で問われるものに絞ります。上限が引き上げ可能か（Service Quotas で変えられるか）も書きます。仕様の変更が多いので、`checkedAt` が 180 日より古いものは coverage の再確認リストに出します（4.2）。
- 既定値に依存する事実（content-guide 6.1 の「既定値に依存する問題を作らない」に挙がっているもの）は、`text` に「〜の時点の既定値」と書き、試験の決め手にしない書き方にします。
- 提供終了・新規受付停止のサービスや機能（content-guide 6.1）は、`constraint` として「新規には選ばない」と書くだけにします。

### 3.5 ID の規則（まとめ）

- サービス: `s3`、`iam`、`elb`、`ec2-auto-scaling`、`iam-identity-center`
- 事実: `s3.access-points`、`iam.principal-org-id`、`aurora.backtrack`、`lambda.parallelization-factor`
- 比較: `cmp-config-cloudtrail`、`cmp-sqs-sns-eventbridge`
- どの ID も全教材で一意にします（validate の `duplicate-id` に登録する）。

### 3.6 他の教材からの参照

- **レッスン・早見表・ガイド（Markdown）**: 本文に `[S3 アクセスポイント](#/services/s3?f=access-points)` と書きます。validate が本文から `#/services/<id>` と `?f=<スラッグ>` を拾い、存在しない ID ならエラーにします。
- **問題**: `QuestionSchema` に任意項目 `factRefs`（事実 ID の配列、最大 6）を足します（任意項目の追加なので、schema の方針に合う）。ただし既存の問題に `factRefs` を書き足すのは、その問題を直す機会に合わせます（2.5 と同じ理由）。それまでは、問題の `services` からビルドで自動的にエントリへのリンクを作ります。
- **用語集**: スキーマは変えません。`services` のバッジを図鑑のエントリへのリンクにします（アプリ側）。
- **図鑑から他の教材へ**: 同じサービスを `services` に持つレッスン・早見表・用語・カードの数をビルドで求め、エントリに表示します。手で書く `lessonRefs`・`docRefs` は特に関係の深いものだけです。

### 3.7 比較のスキーマ

| 項目 | 必須 | 内容 |
|---|---|---|
| `id` | 必須 | `cmp-…`。ファイル名と同じ |
| `title` | 必須 | 例「AWS Config と AWS CloudTrail」 |
| `services` | 必須 | 台帳の `id`。2〜3 個（スマホで表にできる上限として 3） |
| `decide` | 必須 | 見分け方。1〜5 行（「〜なら X」の形） |
| `rows` | 任意 | 観点ごとの比較。`{ axis, values: { <id>: 文 }, factRefs? }`。`values` は `services` の全員分そろえる |
| `docRef` | 任意 | 同じ組を扱う早見表の ID。これがあるときは `rows` を書かない |
| `sources` / `checkedAt` | 必須 | 事実と同じ |
| `createdBy` | 必須 | |

- `rows` と `docRef` のどちらか一方は必須です。
- `rows` の各行は短い言い切りにし、詳しい内容は `factRefs` でエントリの事実を指します。比較ファイルの中で新しい事実を詳しく書かないことで、正本が1か所に保たれます。
- エントリは比較を持たず、ビルドが「このサービスを含む比較」を集めて表示します。区分 1 のサービスは比較が 1 件以上あることを coverage で確かめます。

### 3.8 記入例（主要サービス: Amazon S3）

> **注意**: 次の例は形を示すためのものです。中の AWS の事実は、既存の問題の出典にも使われている公式ドキュメントのページで確かめられる範囲にとどめていますが、この設計書の作成時にはページを開いて確かめていません（**未検証**）。図鑑に入れるときは 6.4 の工程を通します。

```json
{
  "id": "s3",
  "tier": 1,
  "summary": "データをオブジェクトとしてバケットに保存するストレージです。容量の上限を気にせずに使え、用途に応じてストレージクラスを選べます。",
  "chooseWhen": [
    { "text": "大量のファイルを、サーバーを管理せずに安く長期間保存したい", "alternatives": [] },
    { "text": "改ざんや削除を一定期間防ぐ（WORM）保存が必要", "factRefs": ["s3.object-lock"] }
  ],
  "avoidWhen": [
    { "text": "複数の EC2 インスタンスから POSIX 準拠のファイルシステムとしてマウントしたい", "alternatives": ["efs", "fsx"] },
    { "text": "1 台の EC2 インスタンスのブートボリュームや低レイテンシーのブロックストレージが必要", "alternatives": ["ebs"] }
  ],
  "facts": [
    {
      "id": "s3.access-points",
      "title": "S3 アクセスポイント",
      "kind": "feature",
      "text": "アクセスポイントは、バケットに作る名前つきの入口です。アクセスポイントごとに独自のアクセスポイントポリシーを持てるので、用途やチームごとに入口を分け、1 つの大きなバケットポリシーを管理せずに済みます。ネットワークの発信元を特定の VPC に限るアクセスポイントも作れます。",
      "examPoint": "共有バケットのポリシーが複雑になりすぎる、という状況の解決策として選ぶ",
      "depth": "core",
      "tags": ["アクセス制御", "共有バケット"],
      "sources": [{ "title": "Amazon S3 ユーザーガイド: アクセスポイント", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points.html" }],
      "checkedAt": "2026-11-13"
    },
    {
      "id": "s3.object-lock",
      "title": "S3 オブジェクトロック",
      "kind": "feature",
      "text": "オブジェクトロックは、オブジェクトを一定期間または無期限に削除・上書きできないようにする機能（WORM）です。保持モードにはガバナンスモードとコンプライアンスモードがあり、コンプライアンスモードでは保持期間中はルートユーザーを含めてだれも削除・上書きできません。バージョニングが有効なバケットで使います。",
      "trap": "ガバナンスモードは特別な権限があれば解除できるので、「だれも削除できない」要件にはコンプライアンスモードを選ぶ",
      "depth": "core",
      "sources": [{ "title": "Amazon S3 ユーザーガイド: オブジェクトロック", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html" }],
      "checkedAt": "2026-11-13"
    },
    {
      "id": "s3.replication-versioning",
      "title": "レプリケーションにはバージョニングが必要",
      "kind": "constraint",
      "text": "S3 のレプリケーション（同じリージョン内・リージョン間）を設定するには、送信元と送信先の両方のバケットでバージョニングを有効にしておく必要があります。",
      "depth": "core",
      "sources": [{ "title": "Amazon S3 ユーザーガイド: オブジェクトのレプリケーション", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html" }],
      "checkedAt": "2026-11-13"
    },
    {
      "id": "s3.requester-pays",
      "title": "リクエスタ支払い",
      "kind": "pricing",
      "text": "リクエスタ支払いを有効にしたバケットでは、リクエストとデータのダウンロードにかかる料金を、バケットの所有者ではなくリクエストした側が支払います。保存の料金は所有者が払います。匿名のアクセスはできません。",
      "examPoint": "データを他社に配布するが、取り出しの費用は相手に負担させたい",
      "depth": "core",
      "sources": [{ "title": "Amazon S3 ユーザーガイド: リクエスタ支払いバケット", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html" }],
      "checkedAt": "2026-11-13"
    },
    {
      "id": "s3.ia-minimum-billable-size",
      "title": "低頻度アクセス系クラスの最小課金サイズ",
      "kind": "quota",
      "text": "S3 Standard-IA、S3 One Zone-IA、S3 Glacier Instant Retrieval では、128 KB より小さいオブジェクトも 128 KB として課金されます。",
      "examPoint": "小さいオブジェクトが大量にあるとき、IA 系へ移すとかえって高くなることがある",
      "depth": "core",
      "sources": [{ "title": "Amazon S3 ユーザーガイド: ストレージクラス", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html" }],
      "checkedAt": "2026-11-13"
    }
  ],
  "seeAlso": ["iam.principal-org-id"],
  "lessonRefs": ["lesson-4.1-s3-storage-classes"],
  "docRefs": ["cheatsheet-s3-storage-classes"],
  "references": [{ "title": "Amazon S3 ユーザーガイド", "url": "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html" }],
  "createdBy": "sc1",
  "createdAt": "2026-11-13"
}
```

`seeAlso` が指す IAM 側の事実（同じく未検証の例）:

```json
{
  "id": "iam.principal-org-id",
  "title": "aws:PrincipalOrgID 条件キー",
  "kind": "feature",
  "text": "リソースベースのポリシーの Condition で aws:PrincipalOrgID に組織の ID を指定すると、AWS Organizations のその組織に属するアカウントのプリンシパルだけを許可できます。アカウントが増減しても、ポリシーにアカウント ID を書き足す必要はありません。",
  "trap": "aws:ResourceOrgID はリソースが属する組織を見る条件キーで、呼び出し元を組織で絞る用途には使わない",
  "depth": "core",
  "services": ["AWS Organizations", "Amazon S3"],
  "sources": [{ "title": "IAM ユーザーガイド: AWS グローバル条件コンテキストキー", "url": "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html" }],
  "checkedAt": "2026-11-13"
}
```

比較の例（未検証。既存の早見表に該当する組がないもの）:

```json
{
  "id": "cmp-config-cloudtrail",
  "title": "AWS Config と AWS CloudTrail",
  "services": ["config", "cloudtrail"],
  "decide": [
    "「だれが、いつ、どの API を呼んだか」→ CloudTrail",
    "「リソースの設定がどう変わったか、ルールに準拠しているか」→ Config"
  ],
  "rows": [
    { "axis": "記録するもの", "values": { "config": "リソースの設定とその変更の履歴", "cloudtrail": "API の呼び出し（操作の記録）" } },
    { "axis": "評価", "values": { "config": "ルールで設定の準拠・非準拠を判定できる", "cloudtrail": "記録が中心で、設定の準拠は判定しない" } }
  ],
  "sources": [
    { "title": "AWS Config デベロッパーガイド", "url": "https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html" },
    { "title": "AWS CloudTrail ユーザーガイド", "url": "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html" }
  ],
  "checkedAt": "2026-11-13",
  "createdBy": "sc1"
}
```

（比較の例の URL 2 件は、この設計書の作成時に存在を確かめていません。作成者 ID `sc1` も仮です。）

## 4. 検証と網羅

### 4.1 validate.mjs に足す検査

エラー（ビルドを止める）:

| コード | 内容 |
|---|---|
| `schema` | 台帳・エントリ・比較・検証状態・不足の対応表のスキーマ違反 |
| `path-mismatch` | ファイル名と `id` の不一致。事実 ID の接頭辞がエントリの `id` と違う |
| `unexpected-file` | `catalog/` の配下で規則外の場所・拡張子のファイル（`classify()` に新しい種類を足す） |
| `duplicate-id` | 事実・比較・エントリの ID の重複（既存の ID 登録に乗せる） |
| `registry` | blueprint の名前が台帳の `id` に解決できない、または2つ以上に解決できる。同じ別名が2つの `id` にある。`hostedBy` の先がない、または `hostedBy` が連鎖している |
| `catalog-ref` | 存在しない事実・エントリ・比較・レッスン・早見表を参照している（`seeAlso`、`factRefs`、`alternatives`、`lessonRefs`、`docRefs`、比較の `services`、問題の `factRefs`、Markdown 本文の `#/services/…` リンク） |
| `catalog-entry` | 台帳にない `id` のエントリ。`hostedBy` を持つサービスのエントリ |
| `review-status-key` | `catalog-status.json` に存在しない ID がある（既存の検査と同じ扱い） |

警告:

| コード | 内容 |
|---|---|
| `service-alias` | `services` が正規名でない（表記ごとにまとめて1行） |
| `catalog-tier` | 区分ごとの必須欄・事実の件数が 3.2 の目安から外れる |
| `catalog-stale-review` | 検証状態に記録したハッシュ（4.3）と今の内容が違う。内容が変わったのに検証し直していない |
| `catalog-old-check` | `quota`・`pricing` の事実の `checkedAt` が 180 日以上前、その他が 365 日以上前 |
| `out-of-scope-mention` | 事実の本文に試験範囲外のサービス名がある（既存の `outOfScopeMatchers` を流用） |
| `catalog-near-duplicate` | 事実の本文が用語集の定義やほかの事実と似すぎている（既存の `findNearDuplicates` を流用） |
| `catalog-needs` | 不足の対応表で、判断（4.4）が決まっていない項目がある |

`content-build.mjs` の `crossCheck()` にも、アプリが壊れる参照切れ（存在しない事実 ID など）だけはエラーとして足します。validate とビルドで同じ判定にするため、図鑑の参照の検査は `scripts/lib/` に共通の関数として置くことを検討します（今は validate とビルドが別々に検査を持っている。確認済み）。

### 4.2 coverage.mjs に足す集計

1. **エントリの網羅**: 台帳の全サービス（`hostedBy` は親に含める）について、エントリの有無、区分、事実の件数（`core` / `detail`）、比較の件数、検証状態の内訳。エントリのないサービスを分類ごとに挙げる。
2. **不足 219 件の対応**: `catalog-needs.json` を読み、タスク別に「対応する事実がすべて verified」「対応する事実がある（未検証を含む）」「対応なし」「対応しないと判断（理由つき）」の件数を出す。
3. **再確認リスト**: `checkedAt` が古い事実（4.1 の `catalog-old-check` と同じ基準）の一覧。
4. **問題との対応**: サービスごとの「問題での登場回数」と「事実の件数」を並べ、登場回数が多いのに事実が少ないサービスを挙げる（6.1 の区分の見直しに使う）。

### 4.3 検証状態の扱い

- 新しいファイル `content/saa-c03/catalog-status.json` に、エントリ ID（`summary`・`chooseWhen`・`avoidWhen` などエントリ本体の文章の状態）、事実 ID、比較 ID ごとに記録します。問題の `review-status.json` には混ぜません（キーの規則が問題 ID 専用で、ops の仕組みが問題専用に読み書きしているため）。【決定 U-4】

```json
{
  "s3": { "status": "verified", "checkedAt": "2026-11-20", "hash": "3f2a9c01b7de" },
  "s3.access-points": { "status": "verified", "checkedAt": "2026-11-20", "hash": "9b1c0e44a2f3" },
  "cmp-config-cloudtrail": { "status": "pending", "checkedAt": "2026-11-20", "hash": "07aa31d9c5e2" }
}
```

- `status` は問題と同じ4種類（`verified`、`pending`、`needs-fix`、`rejected`）です。
- `hash` は、検証した時点の内容の SHA-256 の先頭 12 桁です（`scripts/lib/catalog.mjs` の `catalogHash`。キー順をそろえた JSON から求める）。含める欄は次のとおりで、`services`・`tags`・`kind`・`tier`・`checkedAt` のような分類や記録の欄は含めません（表記の整理だけで検証が無効にならないように）。
  - エントリ本体: `summary`・`chooseWhen`・`avoidWhen`・`references`
  - 事実: `title`・`text`・`examPoint`・`trap`・`depth`・`sources`（`depth` は検証役が判定するので含める）
  - 比較: `title`・`decide`・`rows`・`docRef`・`sources`内容を変えるとハッシュが合わなくなり、validate が警告し、ビルドは `pending` として扱います。問題の検証では ops の仕組みが変更を見張っていましたが、図鑑にはその仕組みがないので、ファイルの中で変更を見分けられるようにします。
- ビルドは `needs-fix` と `rejected` の事実・比較を出力から除き、`pending` には「未検証」のバッジを出します（問題と同じ）。エントリ本体が `needs-fix` か `rejected` なら、そのエントリ全体を出しません。

### 4.4 不足 219 件の対応表と、監査の再実行を受け入れ基準にする方法

`content/saa-c03/catalog-needs.json` に、監査の不足 219 件をそのまま取り込みます。

```json
{
  "source": "input-gap 監査 2026-11-13",
  "items": [
    {
      "key": "saa-1.1-w2m-003/c",
      "task": "1.1",
      "side": "correct",
      "gap": "none",
      "knowledge": "S3 バケットポリシーで aws:PrincipalOrgID 条件を使うと、組織内のアカウントのプリンシパルだけを、アカウントの増減に追従して許可できる。",
      "decision": "fact",
      "factRefs": ["iam.principal-org-id"]
    }
  ]
}
```

- `decision` は `fact`（図鑑の事実で対応）、`lesson`（レッスンに足す方が適切。別の作業として起こす）、`question`（問題側の水準や表現を直すべき。4.5）、`skip`（対応しない。`note` に理由が必須）のいずれかです。
- `factRefs` は「この知識が書かれている事実」を指します。1件の不足に複数の事実を対応づけてもかまいません。
- このファイルはアプリに出しません（ビルドで読み飛ばす）。保留模試の問題 ID と、どの知識が決め手かを利用者に見せないためです。
- **事実は問題に合わせて書かない**: 不足の文は「どの粒度の知識が要るか」の見本として使い、事実は機能の説明として一般的に書きます。問題の状況や選択肢の言い回しを写しません。保留模試は合格準備度の判定に使う「取っておいた問題」なので、図鑑が模試の答えの抜き書きになると、模試の点数が実力を表さなくなります。【決定 U-6】

**受け入れ基準**（測り方は【決定 U-6】。数値は中間の監査のあとに決め、それまでは次の値を仮の目標にする【決定 U-15】）:

1. `catalog-needs.json` の全 219 件に `decision` があり、`fact` のものは対応する事実がすべて `verified`
2. 同じ監査を再実行し（教材の範囲に図鑑の事実を加える）、模試 A・B の 160 問で
   - 全選択肢に根拠ありが 130 問以上（今は 46 問）
   - 正解の根拠なしが 0 問（今は 25 問）
   - `decision: fact` の項目の 95% 以上が「あり」と判定される
3. **対照の監査**: 図鑑の作成に使っていない演習問題から同じ数（例 160 問）を選んで同じ監査を行い、作成前と作成後で「全選択肢に根拠あり」の割合が上がっていることを確かめる。模試だけが上がり、演習問題が上がらなければ、模試に合わせすぎていると判断する。

監査を再実行できるようにするための作業（7章の T9）:

- 監査のスクリプト（今はセッションの作業フォルダにある `audit-prep.mjs` と第2段・第3段）を ops の場所（`C:\Users\kohei\work\saa-dojo-ops`）に移し、手順を ops の README に残す。再監査の手順の概要は、リポジトリの content-guide か README にも書く【決定 U-13】。第2段・第3段は読んでいないので、移すときに中身を確かめる。
- 監査の教材の範囲（`audit-prep.mjs` の `candidates()`）に、問題の `services` と同じサービスのエントリの事実と、`seeAlso` で参照される事実を加える。**`catalog-needs.json` の対応づけは監査の入力に使わない**（使うと、対応づけたものが見つかるのは当たり前になり、測定にならない）。
- 監査はモデルの判定を含むので、結果は実行ごとに多少ぶれる（推測）。作成前の結果と比べるときは、同じ手順・同じモデルで、作成前の教材でも取り直した値と比べる。

### 4.5 試験の水準より細かい可能性がある知識

例: IAM Roles Anywhere、EKS Pod Identity、IAM ポリシーの `BoolIfExists`、Network Firewall のストリクト順序。

- 事実の `depth` を `detail` にして図鑑に書きます。アプリでは「発展」として折りたたんで表示し、区分の事実の件数（3.2）には数えません。
- `core` と `detail` の分け方:
  - `core`: blueprint の項目で名前が挙がっている、または項目の内容から直接必要になる。よく比べられるサービスの決定的な違いである。演習問題と模試の両方で決め手になっている
  - `detail`: 上のどれにも当たらない。または設定の細部（条件キーの演算子、設定項目の名前）を知らないと区別できない
- 起草役（Sonnet）が案を付け、検証役が同意しないものと、`detail` と判定されたうえで模試の正解の決め手になっているものは、上位モデルが判定します（6.3）。
- 模試の**正解**の決め手が `detail` の知識だけである問題は、問題の水準が試験より細かい疑いがあるので、`catalog-needs.json` で `decision: question` にし、問題の見直しの候補として別に挙げます（問題を直すかどうかは、この設計の範囲外）。見直し候補の一覧は coverage の「不足 219 件の対応」の集計に `decision: question` の項目として出します。【決定 U-7】

## 5. アプリ側

### 5.1 ルートと画面

`App.tsx` に次を足し、`NAV_ITEMS` の「調べる」グループに「サービス図鑑」を加えます（用語集の前）。

| ルート | 画面 | 内容 |
|---|---|---|
| `/services` | 一覧 | 検索欄、絞り込み、分類ごとのリスト |
| `/services/:id` | 詳細 | エントリ。`?f=<スラッグ>` で事実の位置へ移動して強調する |
| `/services/compare/:id` | 比較 | 比較の表と見分け方 |

`hostedBy` を持つサービスの `id`（例 `/services/ec2-spot`）を開いたら、親のエントリの該当する事実の位置へ移動します（親のエントリの事実に、子のサービス名を `services` に持つものがあればそこへ）。

### 5.2 一覧（スマホ優先）

- 上に検索欄（用語集と同じく `?q=` に保存）。検索の対象は、正規名、別名、`short`、`summary`、事実の `title` と `tags`。事実の本文まで探すと一覧用のデータが大きくなるので、本文は探しません（推奨。事実の本文まで探すかは実装時にデータの大きさを見て決める）。検索語が事実の見出しに当たったときは、サービス名の下に当たった見出しを出し、タップで `?f=` つきの詳細へ移動します。
- 絞り込みは横にスクロールするチップ: 区分（主要・標準・概要）、タスク（そのタスクの `keyServices` と、問題の `services` に出るサービス）、未読。
- リストは分類ごとの見出しの下に、1行目に名前（区分 1 は太字）、2行目に `summary` の先頭を出します。読了したエントリには既存の「読了」バッジと同じ表示を付けます。

### 5.3 詳細

上から順に:

1. パンくず（図鑑 › 分類）、名前、別名（小さく）、区分、「未検証」の事実の件数
2. `summary`
3. 選ばれる決め手 / 選ばれない条件（`alternatives` は他のエントリへのリンク）
4. 機能と制約: 事実を `kind` ごとにまとめ、`<details>` で折りたたむ（区分 1 は事実が多いので、見出しの一覧だけを最初に見せる）。各事実は見出し、本文、`examPoint`（「試験のポイント」と同じ色の枠）、`trap`（「ひっかけ注意」と同じ色の枠）、出典リンク、確認日、「未検証」バッジ。`detail` の事実は最後に「発展」としてまとめる
5. 関連する事実（`seeAlso`）
6. 比較（このサービスを含む比較へのリンク）
7. 関連: レッスン、早見表、用語（用語集の検索結果へのリンク）、「このサービスの問題を演習する」（`/practice?services=<正規名>`）
8. 「読んだ」ボタン（5.5）

### 5.4 比較

- 幅が広い画面では表（列がサービス）にします。スマホ（幅 600px 未満を目安）では、観点ごとに見出しを置き、その下にサービスごとの値を縦に並べます。CSS だけで切り替え、ライブラリは足しません。
- `docRef` だけの比較は、見分け方と早見表へのリンクを出します。

### 5.5 他の画面からのリンク

| 画面 | 変更 |
|---|---|
| 問題の採点後（`AnswerFeedback`） | 「サービス図鑑」の欄を足し、問題の `services` のエントリと、問題に `factRefs` があればその事実へのリンクを出す。保留模試の結果画面でも同じ表示にする（模試の問題 ID と事実の対応はアプリに持たないので、出すのは `services` から作るリンクと、問題自身の `factRefs` だけ） |
| レッスン・早見表 | 「扱うサービス」を図鑑へのリンクにする。本文の `#/services/…` リンクはそのまま動く（0.2 の9。動作は実装時に確かめる） |
| 用語集 | `services` のバッジを図鑑へのリンクにする |
| 弱点分析 | サービス別の行に図鑑へのリンクを足す |

### 5.6 学習履歴

- 新しいイベント `{ type: 'catalog-read', serviceId }` を足し、詳細の「読んだ」ボタンで記録します（レッスンの `lesson-read` と同じ作り。確認済み: レッスンはボタンで記録している）。【決定 U-10】
- 合格準備度の判定には使いません。一覧の「未読」の絞り込みと、読了バッジに使います。
- 古い版のアプリと同期しても、知らない種類のイベントとして無視されます（0.2 の8）。

### 5.7 ビルド出力とオフラインキャッシュ

`buildOutputs()` に次のファイルを足します（ハッシュつきの名前、`manifest.json` に登録）。

| キー | ファイル | 中身 |
|---|---|---|
| `services` | `services.<hash>.json` | 台帳の要約（2.4） |
| `catalog-index` | `catalog-index.<hash>.json` | 全エントリの `id`・区分・`summary`・事実の `id`・`title`・`kind`・`tags`・状態、比較の一覧、関連する教材の件数 |
| `catalog:<id>` | `catalog/<id>.<hash>.json` | エントリの全体（事実の本文を含む）。レッスン本文と同じく1件ずつ分ける |
| `catalog-compare` | `catalog-compare.<hash>.json` | 比較の全体（小さいので1ファイル） |

- `loader.ts` に `loadServices`、`loadCatalogIndex`、`loadCatalogEntry(id)`、`loadComparisons` を足します。`loadKey` はマニフェストにないキーのとき既定値を返すので、図鑑のデータがない古いマニフェストでも画面は空の表示で動きます（確認済み）。
- `manifest.counts` に `catalogEntries`、`catalogFacts`、`comparisons` と、事実の検証状態の内訳を足します。`FORMAT_VERSION` は変えません（キーの追加だけなので）。
- 量の見積もり: 事実 1 件を JSON で約 0.8〜1 KB（日本語の本文 150〜300 字と出典の URL）とすると、事実 1,000 件で約 1 MB、索引が 150〜250 KB です（推測）。今の約 3.5 MB に足して約 4.5〜5 MB になります。`data/**/*.json` はすべて事前キャッシュされるので、オフラインで使えます。1ファイルの上限 8 MB にも余裕があります。初回のキャッシュの量が増えるだけで、初期表示の JS（gzip 250 KB 以下の目安）には影響しません。
- 一覧の画面は `catalog-index` だけを読み、詳細を開いたときに `catalog/<id>` を読みます。

## 6. 制作計画

### 6.1 区分の決め方と区分案

**決め方**（機械的な案を作り、上位モデルが最終判定する）:

- 区分 1: 問題での登場回数（`deterministic.json` の `svcRows.questions`。問題の `services` か本文に出る、出題対象の全プールの問題数）が 20 以上、または監査の「不足のある問題数」が 4 以上
- 区分 2: 区分 1 でなく、登場回数が 3 以上、または不足のある問題数が 1 以上
- 区分 3: それ以外
- 手で上げる例外: 登場回数が少なくても、試験ガイドの項目で名前が挙がり、よく比べられる相手がいるサービス（下の「上げる候補」）

監査の報告書のサービス別の表は、不足のある問題数が 2 以上のサービスだけを載せているように見えます（最小値が 2）。不足が 1 問だけのサービスは区分の計算に入っていないので、`input-gap-result.json` から数え直してから確定します。

**計算した案**（上の規則をそのまま当てはめたもの。括弧は「登場回数, 不足のある問題数」）:

- 区分 1（30 件）: EC2 (214, 9)、S3 (170, 19)、Lambda (89, 8)、RDS (72, 8)、VPC (72, 11)、ELB (66, 6)、IAM (61, 12)、EBS (53, 5)、DynamoDB (47, 4)、CloudFront (38, 8)、SQS (35, 3)、EC2 Auto Scaling (34, 3)、ECS (34, 3)、CloudWatch (34, 3)、EFS (34, 2)、Organizations (31, 2)、EventBridge (29, 3)、Aurora (29, 4)、Direct Connect (29, 2)、Route 53 (29, 5)、KMS (28, 3)、SNS (26, 0)、CloudTrail (26, 4)、Fargate (24, 0)、Athena (21, 4)、ElastiCache (20, 3)、NAT gateway (20, 0)、API Gateway (15, 5)、Transit Gateway (15, 4)、WAF (14, 4)
- 区分 2（61 件）: Redshift、Glue、Kinesis、Kinesis Data Streams、Data Firehose、EMR、Lake Formation、MSK、MQ、Step Functions、Budgets、Cost and Usage Report、Cost Explorer、Savings Plans、Elastic Beanstalk、Outposts、Wavelength、ECR、EKS、Aurora Serverless、DocumentDB、Neptune、Comprehend、Polly、SageMaker AI、CLI、CloudFormation、Compute Optimizer、Config、Systems Manager、DataSync、DMS、Snow Family、Transfer Family、Client VPN、Global Accelerator、PrivateLink、Site-to-Site VPN、ACM、CloudHSM、Cognito、Directory Service、GuardDuty、IAM Identity Center、Inspector、Macie、Network Firewall、RAM、Secrets Manager、Security Hub、Shield、Backup、FSx、S3 Glacier、Storage Gateway、VPC endpoints、STS、Trusted Advisor、RDS Proxy、DAX、EC2 Spot Instances
- 区分 3（41 件）: Data Exchange、Data Pipeline、OpenSearch Service、Quick、QuickSight、AppFlow、Batch、Serverless Application Repository、VMware Cloud on AWS、ECS Anywhere、EKS Anywhere、EKS Distro、Keyspaces、X-Ray、Amplify、Device Farm、Lex、Rekognition、Textract、Transcribe、Translate、AWS Auto Scaling、Control Tower、Health Dashboard、License Manager、Managed Grafana、Managed Service for Prometheus、Management Console、Proton、Service Catalog、Well-Architected Tool、Kinesis Video Streams、Application Discovery Service、Application Migration Service、Artifact、Detective、Firewall Manager、Service Quotas、SCT、Elastic Disaster Recovery、Timestream

**見直しの候補**（上位モデルが判定する）:

- 区分 3 → 2 に上げる候補: Control Tower、Firewall Manager、Detective、X-Ray、Elastic Disaster Recovery、SCT、Batch、OpenSearch Service、Keyspaces、Timestream、Application Migration Service（どれも blueprint の `keyServices` か試験ガイドの項目に名前があるか、よく比べられる相手がいる）
- 区分 2 → 1 に上げる候補: Secrets Manager、GuardDuty、Config、CloudFormation、Global Accelerator、Redshift（不足や登場回数が区分 1 の境目に近く、比較の相手が多い）
- `hostedBy` にするもの（2.3）: EC2 Spot Instances、Aurora Serverless、ECS Anywhere、EKS Anywhere、EKS Distro。これでエントリは区分 1 が約 30、区分 2 が約 59、区分 3 が約 38 になる（Quick と QuickSight の扱いで1件変わる）

### 6.2 制作の順序

1. **土台**: 台帳と名寄せ（7章の T1〜T3）。図鑑の中身より先に終える
2. **第1波 — 不足の解消**: 不足 219 件に出てくるサービスのエントリを、不足の件数が多い順に作る（S3、IAM、VPC、EC2、RDS、CloudFront、Lambda、ELB、API Gateway、Route 53、EBS …）。この波では、そのサービスの不足を埋める事実と、エントリ本体（`summary`・`chooseWhen`・`avoidWhen`）を必ず書き、残りの事実は後回しにしてよい
3. **中間の監査**: 第1波のあとに 4.4 の再監査と対照の監査を一度行い、事実の粒度や書き方が効いているかを確かめる。効いていなければ書き方の規則を直してから先へ進む
4. **第2波 — 区分 1 の仕上げ**: 区分 1 の残りの事実と比較
5. **第3波 — 区分 2**
6. **第4波 — 区分 3**: 用途と決め手だけなので、まとめて作る
7. **最終の監査**と受け入れ判定

### 6.3 工程ごとの担当

| 工程 | 内容 | 担当 |
|---|---|---|
| 設計 | この設計書、スキーマ、規則の決定 | 上位モデル（Opus）と利用者 |
| 区分の確定 | 6.1 の案の判定 | 上位モデル |
| 準備 | エントリごとの入力の束を作る（台帳、blueprint の関係する項目、そのサービスの不足の項目、既存のレッスン・用語集・カードの該当箇所の抜粋、既存の問題の出典 URL の一覧） | スクリプト（モデルなし） |
| 起草 | エントリの JSON を書く | 下位モデル（Sonnet） |
| 機械の検査 | `npm run validate`、出典 URL の HTTP 状態の確認（ops の `docs-status` と同じ考え方） | スクリプト |
| 独立した検証 | 事実ごとに出典を開いて確かめる（6.4） | 下位モデル（Sonnet。起草とは別のセッション） |
| 修正 | 検証の指摘を直す | 下位モデル（起草と同じ役） |
| 最終判定 | 起草と検証の意見が分かれたもの、2回直しても `fix` のままのもの、`depth` の判定（4.5）、`decision: skip`・`question` の判定、無作為に選んだ `verified` の事実の抜き取り検査（各波で 1 割程度） | 上位モデル |
| 監査と受け入れ | 4.4 の再監査の実行はスクリプトと下位モデル、結果の解釈と受け入れの判定は上位モデル | — |

初回の制作では、問題の二重チェックに Codex CLI を使い、作成したモデルとは別系統のモデルに解かせていました（0.2 の10）。図鑑の検証役を同じ Sonnet にすると、起草と同じ思い込みを見逃す可能性があります。そのため、検証役は起草とは別のセッションの Sonnet で始め、第1波のあとに上位モデルが verified の事実を 1 割程度抜き取りで確かめます。見逃しが多ければ、検証役を ops の Codex キューに切り替えます。【決定 U-12】

### 6.4 1エントリの制作手順

1. **準備**（スクリプト）: 6.3 の入力の束を、ops の場所の作業フォルダ（例 `saa-dojo-ops/catalog-work/<id>/input.md`）に作る【決定 U-13】
2. **起草**（Sonnet）:
   - 参照してよいのは docs.aws.amazon.com と aws.amazon.com だけ（初回の制作と同じく、GitHub、このアプリの公開サイト、問題集サイトは参照しない）
   - 事実ごとに、実際に開いたページを `sources` に入れ、`checkedAt` をその日にする
   - 不足の項目は、問題の状況を写さず、機能の説明として一般的に書く（4.4）
   - 不足の各項目に、対応する事実の ID か、対応しない理由を返す（`catalog-needs.json` の下書き）
   - 出力は JSON だけ。validate を通るまで直す
3. **独立した検証**（Sonnet、別のセッション。起草の過程は渡さず、エントリの JSON と入力の束だけを渡す）。事実・比較・エントリ本体ごとに返す:
   - `verdict`: `ok` / `fix` / `reject`（ops の第2段と同じ）
   - 指摘の種類: `accuracy`（出典に書かれていない、または出典と食い違う）、`outdated`（古い仕様・名前）、`scope`（試験範囲外）、`depth`（`core` と `detail` の付け方）、`conflict`（既存のレッスン・用語集・カードと食い違う）、`japanese`（日本語）、`granularity`（1件に複数の事実がある、問題の写しになっている）
   - `evidenceUrls`: 確かめたページ
   - 出典のページに書かれていないことは、正しそうでも `fix` にする（「出典で確かめられる範囲だけを書く」を守るため）
4. **修正と再検証**: `fix` は起草役が直し、検証役がもう一度見る。2回で `ok` にならなければ上位モデルへ
5. **記録**: 判定をスクリプトで `catalog-status.json` に書く（`status`、`checkedAt`、`hash`）。`ok` → `verified`、上位モデルの判定待ち → `pending`、`fix` のまま → `needs-fix`、`reject` → `rejected`
6. **既存教材との食い違い**: `conflict` の指摘で既存教材の方が誤っていた場合は、その教材の作成者向けの修正リストに載せる（図鑑の作業では直さない）

作成者 ID は、図鑑の作業のセッションごとに新しく付けます（例 `sc1`、`sc2`）。同じエントリを2つのセッションで同時に編集しないよう、エントリ単位で担当を割り当てます。比較ファイルは、両方のエントリが `verified` になってから作ります。

### 6.5 分量の見積もり（推測）

| 区分 | エントリ数 | 事実の件数（1エントリ） | 事実の合計 |
|---|---:|---:|---:|
| 1 | 約 30 | 15〜25 | 450〜750 |
| 2 | 約 59 | 5〜10 | 300〜600 |
| 3 | 約 38 | 0〜2 | 〜40 |
| 計 | 約 127 | | 約 800〜1,400 |

- 比較: 40〜60 組（うち早見表へのリンクだけのものが 15 前後）
- 文字数: 事実 1 件 150〜300 字として 15〜35 万字。今のレッスン 47 本（1 本 2,000〜5,000 字）と同じかそれ以上の量になる
- 第1波（不足 219 件の解消）だけなら、事実は 250〜350 件の見込み（1件の不足に1件の事実がほぼ対応し、エントリ本体と周辺の事実を少し足す想定）
- モデルの作業量の目安: 起草と検証をそれぞれ1エントリ1回とすると、区分 1 は1エントリにつき起草 1 回・検証 1〜2 回。全体で起草約 130 回、検証約 200 回、上位モデルの判定は事実の 1〜2 割程度

## 7. 実装タスクの分解

| # | タスク | 触るファイル | 依存 | テスト |
|---|---|---|---|---|
| T1 | 台帳のスキーマと台帳の作成 | `scripts/lib/schema.mjs`（`ServiceRegistrySchema`）、`content/saa-c03/services.json`（新規。下書きはスクリプトで作り、人が確かめる） | なし | スキーマの単体テスト |
| T2 | validate の名寄せ | `scripts/validate.mjs`（`classify`、`loadContent`、`buildServiceIndex`、`checkServiceNames`、`registry` の検査、`service-alias` のまとめ表示） | T1 | 下記「テストの置き場所」 |
| T3 | coverage とビルドの名寄せ | `scripts/coverage.mjs`（サービス別を `id` 単位に）、`app/scripts/lib/content-build.mjs`（`classify`、`services` の正規化、`services` の出力）、`app/src/content/types.ts`、`app/src/content/loader.ts`、`app/src/domain/selection.ts`（URL の別名を正規名に） | T2 | `app/scripts/test/content-build.test.mjs` に正規化と出力の検査。`selection` の単体テスト |
| T4 | content-guide の改訂 | `docs/content-guide.md`（`services` の書き方、図鑑の節、作成手順）、`docs/app-spec.md`（画面とビルド出力） | T1 | — |
| T5 | 図鑑のスキーマ | `scripts/lib/schema.mjs`（エントリ、事実、比較、`CatalogStatusSchema`、`CatalogNeedsSchema`、問題の任意項目 `factRefs`） | T1 | スキーマの単体テスト |
| T6 | 図鑑の検査と集計 | `scripts/validate.mjs`（4.1 の検査）、`scripts/coverage.mjs`（4.2 の集計）、参照の検査を共通化するなら `scripts/lib/` に新しいモジュール | T2, T5 | fixture のコンテンツで、エラー・警告が出ることと出ないことを確かめる |
| T7 | ビルド出力 | `app/scripts/lib/content-build.mjs`（5.7 のファイル、`crossCheck`、状態での除外、`manifest.counts`）、`app/scripts/build-content.mjs`（件数の表示） | T5 | `content-build.test.mjs` |
| T8 | 画面 | `app/src/App.tsx`、`app/src/components/Layout.tsx`（`NAV_ITEMS`）、新規 `app/src/pages/CatalogPage.tsx`（一覧・詳細・比較）、`app/src/domain/search.ts`（`searchCatalog`）、`app/src/domain/events.ts`（`catalog-read`）、`app/src/domain/progress.ts`（読了の集計）、`app/src/styles.css`（比較の表のスマホ表示） | T7 | 画面のテスト（既存の `GlossaryDocs.test.tsx` に倣う）、検索の単体テスト、E2E に「図鑑を開いて事実へ移動する」を1本 |
| T9 | 相互リンク | `app/src/components/AnswerFeedback.tsx`、`app/src/pages/LessonPage.tsx`、`DocsPage.tsx`、`GlossaryPage.tsx`、`AnalysisPage.tsx` | T8 | 各画面のテストにリンクの有無 |
| T10 | 制作の道具 | 入力の束を作るスクリプト、検証結果を `catalog-status.json` に書くスクリプト、`catalog-needs.json` の取り込み。置き場所は ops（`C:\Users\kohei\work\saa-dojo-ops`）。ハッシュはリポジトリの `scripts/lib/catalog.mjs` の `catalogHash` を読み込んで使う【決定 U-13】 | T5, T6 | 小さな fixture での動作確認 |
| T11 | 監査の取り込み | ops の場所に置く監査のスクリプト（`audit-prep.mjs` ほか。教材の範囲に図鑑を加える） | T6 | 作成前の教材で、今の結果（46 問など）が再現することを確かめる |
| T12 | コンテンツの制作 | `content/saa-c03/catalog/**`、`catalog-status.json`、`catalog-needs.json` | T6, T10（画面がなくても進められる） | validate と coverage |

**テストの置き場所**: ルートの `scripts/` には今テストがありません（確認した範囲では、`app/vite.config.ts` の `include` が `app/scripts/**/*.test.mjs` だけを対象にしている）。T2・T6 のテストは、`app/scripts/test/` に置いて `scripts/validate.mjs` を `--root` に fixture を渡して呼ぶか、ルートに `node --test` の仕組みを足すかを実装時に決めます（ルートの `package.json` に依存を増やさずにできるのは後者）。

**順序**: T1 → T2 → T3（ここで名寄せの効果がアプリに出る。単独でリリースできる）→ T5 → T6 → T10 →（T12 の第1波を開始）→ T7 → T8 → T9 → T11。T4 は T1 と T5 のあとにそれぞれ更新します。T12 は T6 と T10 があれば画面と並行して進められます。

**進み具合**:

- 2026-11-14: T1〜T3 を develop にマージした。
- 同日: T5〜T9 を `feature/catalog` で実装した。図鑑の参照・状態の検査は `scripts/lib/catalog.mjs` に共通化し、validate・coverage・ビルドが同じ関数を使う。テストは `app/scripts/test/` に置いて Vitest で動かす。図鑑のコンテンツはまだないので、一覧は台帳の 127 サービスをすべて「準備中」で出し、詳細は関連する教材と演習への入口だけを出す。
- 同日: U-12〜U-15 を決めた。次は T10（制作の道具。ops の場所）と T11（監査の取り込み）を作り、T12 の第1波に入る。公開（main への反映）は第1波のあと【決定 U-14】。

## 8. 決定事項と未決事項

### 8.1 決定済み

利用者が推奨案で確定したものです（U-6・U-2・U-7 は 2026-11-13、U-3・U-8・U-4・U-11・U-10・U-15・U-12・U-13・U-14 は 2026-11-14）。本文では【決定 U-番号】と付けています。

#### U-6 保留模試との関係と、効果の測り方

- **決定**: 不足 219 件は粒度の見本として使い、事実は一般的な機能の説明として書く（問題の状況や選択肢の言い回しを写さない）。効果は模試 A・B の再監査に加え、図鑑の作成に使っていない演習問題で同じ監査（対照の監査）を行って測る（4.4）。
- 採らなかった案: 不足をそのまま書き模試の再監査だけで測る案 / 模試 A・B の一部を新しい問題に差し替える案。
- 受け入れの数値（130 問・0 問・95%）は決めていないので、U-15 に残す。

#### U-2 正規名の表記と、既存ファイルの扱い

- **決定（表記）**: 正規名は正式名に略称を併記した表記にする（例 `AWS Key Management Service (AWS KMS)`）。具体的にはタスクの `keyServices` の表記に合わせ、`keyServices` が略称だけの表記のサービス（例 `Amazon S3`）はその表記を使う（2.1）。
- **決定（既存ファイル）**: 2026-11-13 には書き換えない方針だったが、2026-11-14 に利用者が改め、既存の問題・レッスン・カードの `services` 欄を正規名に一括で書き換えた（2.5）。validate・coverage・ビルドの正規化はそのまま残す。
- 採らなかった案: 公式の対象サービス一覧の表記（`AWS KMS`、`IAM`）にする案。

#### U-7 試験の水準より細かい知識

- **決定**: `depth: detail` の事実として図鑑に書き、アプリでは「発展」として折りたたんで表示する。模試の正解の決め手が `detail` の知識だけである問題は、`catalog-needs.json` で `decision: question` にし、見直し候補として一覧にする（4.5）。
- 採らなかった案: 発展として書くだけで問題の一覧は作らない案 / 図鑑に書かず問題側を直す案。

#### U-3 サービス台帳の置き場所

- **決定**: 新しい `content/saa-c03/services.json` に置く（2.1）。blueprint は公式の試験ガイドの写しのまま保つ。T1 で実装済み。
- 採らなかった案: blueprint に任意項目を足す案 / 図鑑のエントリが台帳を兼ねる案。

#### U-8 下位のサービス（Spot、Aurora Serverless、ECS/EKS Anywhere、EKS Distro）

- **決定**: 親のエントリの中で扱う（台帳の `hostedBy`。2.3）。一覧には独立して出さず、名前で検索すると親のエントリが見つかるようにする。子の `id` で開いたときは親のエントリへ移動する（5.1）。
- 採らなかった案: それぞれ独立したエントリにする案。

#### U-4 検証状態の持ち方

- **決定**: 新しい `content/saa-c03/catalog-status.json` に、エントリ・事実・比較の単位で、内容のハッシュと一緒に記録する（4.3）。問題の `review-status.json` と ops には影響させない。
- 採らなかった案: `review-status.json` に混ぜる案 / エントリの JSON の中に状態を書く案。

#### U-11 エントリのファイル形式

- **決定**: JSON（3.1）。
- 採らなかった案: Markdown と front matter。

#### U-10 学習履歴への記録

- **決定**: エントリの「読んだ」だけを `catalog-read` イベントで記録する（5.6）。合格準備度には使わない。
- 採らなかった案: 事実ごとに「覚えた」を記録する案 / 記録しない案。

#### U-15 受け入れ基準の数値

- **決定**: 中間の監査（6.2 の3）の結果を見てから、模試と対照（演習問題）の両方の数値を決める。それまでは 4.4 の数値（模試 160 問のうち全選択肢に根拠ありが 130 問以上、正解の根拠なし 0 問、`decision: fact` の項目の 95% 以上が「あり」）を仮の目標にする。
- 採らなかった案: 4.4 の数値で今確定し、対照の監査は「上がっていること」だけを条件にする案。

#### U-12 検証役のモデル

- **決定**: 起草とは別のセッションの Sonnet で始める。第1波のあとに上位モデルが verified の事実を 1 割程度抜き取りで確かめ、見逃しが多ければ ops の Codex キューに切り替える（6.3）。
- 採らなかった案: 最初から別系統のモデル（ops の Codex キュー）で検証する案。

#### U-13 制作の道具と作業フォルダの置き場所

- **決定**: ops の場所（`C:\Users\kohei\work\saa-dojo-ops`）に置く。初回の制作と同じ場所で、公開されない。再監査の手順の概要は、リポジトリの content-guide か README に書く（4.4、6.4、7章の T10・T11）。
- 採らなかった案: リポジトリの `scripts/catalog/` と `scripts/audit/` に置く案。

#### U-14 制作の範囲

- **決定**: 第1波（不足の解消）が終わった時点で公開し、残りは順に足す。区分 2・3 の多くは「準備中」のまま公開される（6.2）。
- 採らなかった案: 全エントリを最後まで作ってから公開する案。

### 8.2 未決事項

なし（2026-11-14 にすべて決定）。受け入れ基準の具体的な数値は、U-15 のとおり中間の監査のあとに決めます。
