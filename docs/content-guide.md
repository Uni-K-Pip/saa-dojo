# 問題・レッスンの作成基準

SAA Dojo のコンテンツ（問題、レッスン、フラッシュカード、用語集、早見表、ガイド）を作るときの基準です。形式は `scripts/lib/schema.mjs` が正で、`npm run validate` で検査します。サービス図鑑は 12 章を参照してください。教材の体系、学習コース、網羅の基準は `docs/learning-design.md`、これから足す形式（図、実物を読む、ミニラボ、設計パターン、シミュレーター）の設計は `docs/visual-materials-design.md` にあります。どちらも未実装を含み、実装が済んだ形式からこの文書に移します。例題は `content/saa-c03/questions/*/*/saa-*-ex-*.json` と `content/saa-c03/lessons/d4/lesson-4.1-s3-storage-classes.md` を参照してください。

## 1. 出題範囲と項目 ID

- 出題範囲は `content/saa-c03/blueprint.json` です。4ドメイン・14タスクの「知識（K）」「スキル（S）」の項目に ID（例 `1.1-K3`、`3.4-S2`）があり、問題の `knowledgeRefs` にはそのタスクの項目 ID を1〜4個入れます。
- 基礎講座（AWS 未経験者向け）の項目は `basics-K1`〜`basics-K14` です。
- `services` はサービス台帳（`content/saa-c03/services.json`）の正規名（`name`）で書きます（例 `Amazon S3`、`AWS Key Management Service (AWS KMS)`）。台帳の別名（例 `Amazon Simple Storage Service`）で書くと、validate が表記ごとにまとめて警告します（ビルドは正規名にそろえて出力します）。対象外サービスは誤答の選択肢には使えますが、正解にはしません。

## 2. ファイルと ID

| 種類 | 置き場所 | ID |
|---|---|---|
| 問題 | `content/saa-c03/questions/d<ドメイン>/<タスク>/<id>.json`（基礎講座は `questions/basics/<id>.json`） | `saa-<タスク>-<作成者ID>-<3桁>`（例 `saa-3.4-g8-001`、`saa-basics-f-001`） |
| レッスン | `content/saa-c03/lessons/d<ドメイン>/<id>.md`（基礎講座は `lessons/basics/<id>.md`） | `lesson-<タスク>-<英小文字とハイフン>` |
| フラッシュカード | `content/saa-c03/flashcards/<deck>.json` | カードは `fc-<作成者ID>-<3桁>` |
| 用語集 | `content/saa-c03/glossary/<名前>.json` | — |
| 早見表・ガイド | `content/saa-c03/cheatsheets/<id>.md`・`content/saa-c03/guides/<id>.md` | `cheatsheet-…`・`guide-…` |
| 図鑑のエントリ | `content/saa-c03/catalog/services/<id>.json` | 台帳のサービス `id`（例 `s3`）。事実は `<サービスid>.<スラッグ>`（例 `s3.access-points`） |
| 図鑑の比較 | `content/saa-c03/catalog/comparisons/<id>.json` | `cmp-<英小文字とハイフン>`（例 `cmp-config-cloudtrail`） |
| 学習コース | `content/saa-c03/course.json`（1 ファイル） | ユニットは `u<2桁>`（例 `u01`）。15 章 |

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
| `references` | AWS 公式の実在 URL（1〜4個） |
| `lessonRefs` | 関連レッスンの ID |
| `factRefs` | 任意。決め手になる図鑑の事実の ID（最大6個）。既存の問題には、その問題を直す機会に書き足す |
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

- **正解にしない**（提供終了・新規受付停止）: Amazon Kinesis Data Analytics for SQL Applications、AWS App Mesh、EC2-Classic、EC2 Auto Scaling の起動設定（Launch Configuration。新しいアカウントでは作成できないので起動テンプレートを使う）、Amazon S3 Select、Amazon S3 Object Lambda、Amazon Glacier の独立サービス（ボールトと旧 API。S3 Glacier の各ストレージクラスは引き続き使える）、AWS WAF Classic、Amazon Aurora Serverless v1、AWS CloudTrail Lake、Amazon SNS のメッセージデータ保護、AWS Directory Service の Simple AD、Amazon FSx File Gateway、AWS Data Pipeline、AWS Proton、AWS Application Discovery Service。
- **AWS Snowball Edge**: 2025年11月から新規顧客の受付が止まっています。用途はレッスンやフラッシュカードで扱ってよいですが、問題の正解にする場合は解説で必ずこの点に触れます。
- **AWS Firewall Manager**: 置き換えていく別のサービスとして AWS Network Security Manager が出ています（改名ではなく別のサービスです。Firewall Manager の販売と提供の終了の日付は、2026年11月時点で発表されていません）。試験ガイドの範囲内のサービスの一覧は AWS Firewall Manager を載せているので、教材は Firewall Manager の名前のまま書き、問題の正解にしてかまいません。終了の日付が発表されたら、扱いを見直します。
- **AWS Application Migration Service**: 今の公式のページでの名前は AWS Transform MGN（旧称 AWS Application Migration Service）です。試験ガイドの範囲内のサービスの一覧は AWS Application Migration Service の名前で載せているので、教材はこの名前のまま書き、初出に今の公式の名前を併記します。
- **Amazon Quick と Amazon QuickSight**: 今の公式のページでの名前は AWS Quick と、Quick の中の機能の AWS Quick Sight（Amazon QuickSight から発展したもの）です。試験ガイドの範囲内のサービスの一覧は Amazon Quick の名前で載せているので、教材は台帳の名前（Amazon Quick、Amazon QuickSight）のまま書き、初出に今の公式の名前を併記します。
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

## 12. サービス図鑑

サービスを引いて、機能・制約・数値・似たサービスとの違いを確かめる辞書です。機能単位の知識（事実）の正本になります。設計の詳細は `docs/service-catalog-design.md` です。

- **エントリ**は台帳の1サービスにつき1ファイルです。台帳で `hostedBy` を持つサービス（例 EC2 スポットインスタンス）はエントリを作らず、親のエントリ（EC2）の事実として書きます。
- **区分**: 1 主要（core の事実 12〜30 件、比較 1 件以上）、2 標準（同 4〜12 件）、3 概要（`summary` と決め手だけ。事実 0〜2 件）。区分 1・2 は `chooseWhen` と `avoidWhen` を書きます。目安から外れると validate が警告します。
- **事実**は1件に1つだけ書き、それだけで意味が通るようにします（40〜400字）。1 エントリの事実は 60 件までです。`kind` は `feature`（機能）・`constraint`（制約・できないこと）・`quota`（数値）・`pricing`（料金の仕組み）・`integration`（連携）です。
  - 出典（`sources`）には実際に開いた AWS 公式のページを入れ、`checkedAt` を確かめた日にします。出典で確かめられないことは書きません。
  - `depth` は、試験の水準なら `core`、試験より細かい可能性があれば `detail`（アプリでは「発展」として折りたたむ）です。
  - 「できないこと」は、試験で誤答の決め手になるものだけを `constraint` にします。数値は試験で問われるものに絞り、Service Quotas で引き上げられるかも書きます。
  - 料金の金額は書きません（仕組みだけ）。既定値に依存する内容は「〜の時点の既定値」と書き、決め手にしません。提供終了のサービス・機能は「新規には選ばない」とだけ書きます（6.1）。
  - **確かめ直す周期**: 事実は、`checkedAt` から半年（180 日）ごとに出典で確かめ直します。既定値に依存する内容と、提供終了に関わる内容は 3 か月（90 日）ごとで、その事実に `recheck` を付けます。値は `default-value`（AWS が決めている既定値・既定の動作に依存する）か `end-of-life`（提供終了、新規受付の停止、サポートの終了、後継への置き換えに関わる）です。両方に当たるときは `end-of-life` にします。周期を過ぎた事実は、validate が警告し、coverage の再確認リストに出ます。
  - 一度公開した事実の ID は変えず、消した ID も再利用しません。
- **文体**は常体です（「〜する」「〜できる」「〜である」。体言止めも使えます）。事実の `text`・`examPoint`・`trap`、エントリの `summary`・`chooseWhen`・`avoidWhen`、比較の文が対象です。レッスン・解説・早見表など、ほかの教材は「です・ます」のままです。
- **他のエントリの事実**は書き写さず、`seeAlso` で ID を指します。比較は組ごとに1ファイルにし、既存の早見表と重なる組は `docRef` で早見表を指すだけにします。
- **本文からのリンク**: レッスン・早見表・ガイドの本文に `[S3 アクセスポイント](#/services/s3?f=access-points)` と書けます。存在しない ID は validate のエラーです。
- **保留模試の答えを写さない**: 監査で見つかった不足（`catalog-needs.json`）は、どの粒度の知識が要るかの見本として使い、事実は機能の一般的な説明として書きます。問題の状況や選択肢の言い回しを写しません。
- **検証状態**は `content/saa-c03/catalog-status.json` に、エントリ・事実・比較ごとに `status`・`checkedAt`・`hash` で記録します。記録したあとに内容が変わると、検証し直すまで未検証として扱います。

## 13. 検証状態

`content/saa-c03/review-status.json` に問題ごとの状態（`verified`、`pending`、`needs-fix`、`rejected`）と確認日を記録します。アプリは `needs-fix` と `rejected` の問題を出さず、記録のない問題は `pending`（未検証）として扱います。図鑑の検証状態は 12 章のとおり別のファイルに記録します。

## 14. コマンド

```bash
npm ci
npm run validate   # 形式の検査（エラーがあれば失敗）
npm run coverage   # 網羅状況の集計
```

## 15. 学習コース

前提知識の順に教材を並べる 1 つのデータです（`content/saa-c03/course.json`）。教材そのものは持たず、今ある教材の ID を指すだけです。考え方とユニットの割り当ては `docs/learning-design.md` の 5 章と付録 A にあります。形式は `scripts/lib/course.mjs` が正です。

- **形**: `stages`（ステージ 0〜4 を順に）→ `units`（`id` は `u00` から出現順に増える。`title`）→ `items`（ユニットの中の順）。ステージは `id`・`title`・`goal` を持ちます。
- **項目の種類**（`kind`）: `lesson`（`ref` にレッスンの ID）、`doc`（`ref` に早見表かガイドの ID）、`practice`（ユニット演習）、`drill`（判断軸ドリル）、`analysis`（弱点分析）、`mock`（`mock` に `random`・`mockA`・`mockB`）。どれも短い補足 `note`（60 字まで）を付けられます。
- **並べ方**: レッスン → 早見表 → ユニット演習の順にします。ユニット演習は、そのユニットのレッスンの `knowledgeRefs` と重なる問題（`pool` が `practice` か `basics`）から出ます。保留模試（`mockA`・`mockB`）の問題は入りません。
- **まだない教材は書きません**: ミニラボ・設計パターン・シミュレーター・図は、教材ができたときに種類を足してから項目に加えます（存在しない ID はエラーになるため）。
- **validate のエラー**: スキーマ違反、ステージの順の誤り、ユニットの ID の重複と順の誤り、同じユニットの中の項目の重複、存在しないレッスン・早見表・ガイド、2 つ以上のユニットに入るレッスン、どのユニットにも入らないレッスン、レッスンのないユニット演習、候補が 0 問のユニット演習（要修正・却下の問題を除いて数える）。早見表とガイドは、複数のユニットに入れてかまいません（例: ステージ 4 の総ざらい）。

## 16. 図

図は宣言的なデータで書き、アプリが SVG で描きます（座標は書きません）。記法（入れ物・部品・線の形と色）、構成図の書き方と段階表示、レイアウトの規則の詳細は `docs/visual-materials-design.md` の 2〜5 章です。AWS の公式アイコンは使いません。

- **置き場所**: 1 枚 1 ファイル。`content/saa-c03/diagrams/<id>.json`。ID は `dg-<英小文字とハイフン>`（ファイル名と同じ）。
- **共通の項目**: `id`、`type`、`title`（4〜60 字）、`alt`（代替文。40〜600 字。80 字未満は警告。図を見なくても同じ内容がわかるように書く）、`lessonRefs`・`factRefs`（裏づけ。合わせて 1 つ以上）、`createdBy`。
- **新しい事実を持ち込まない**: 図に描く内容（部品とつながり、選択の行き先と結論、順位、時間、担当）は、`lessonRefs` のレッスンの本文か、`factRefs` の図鑑の事実で裏づけます。数値は図鑑の事実を指し、料金の金額は書きません（高低は「高い・安い」などの段階で示す）。
- **なくても読める**: 図が表示されなくても、本文だけで意味が通るようにします。
- **幅 360px で読める**: レイアウトした幅が 328（設計の単位）を超えるとエラーです。部品の短い名前は台帳の `short`、なければ正規名から「Amazon」「AWS」を除いたものです。

| `type` | 名前 | 主な項目と上限 |
|---|---|---|
| `architecture` | 構成図 | `root`（入れ物 `box` と部品 `node` の木）、`edges`、`steps`（段階表示）。部品 14、入れ子 5、線 16、段階 8。詳細は設計書の 2.2〜2.5、4.2、5 章 |
| `decision` | 選択フロー | `start` と `nodes`。質問は `{ id, ask, choices: [{ label, to }] }`（選択肢 2〜4）、結論は `{ id, result, service?, why, factRefs? }`。質問 7、結論 8、深さ（道にある質問の数）4 まで。木にする（1 つのノードを 2 か所から指さない。同じ結論は別の id で書く）。質問の文は問題文の制約語と同じ言葉で書く。字数: `ask` 4〜60、`label` 10、`result` 24、`why` 10〜150。全体は縦に長くなってよい（高さの警告の対象外） |
| `position` | 位置づけ図 | `x`・`y`（`{ label, low, high }`。`y` を省くと 1 本の軸）、`items`（`{ id, label, service?, x, y?, note? }`。2〜10 個）。`x`・`y` は 1〜5 の順位で、比率ではない。字数: 軸の `label` 14、`low`・`high` 4、項目の `label` 30、`note` 40。丸の左右に名前が収まらない項目は、図には番号だけを描き、名前は図の下の番号つきの凡例で読ませる（警告は出ない。長い名前ほど図から消えるので、描いた図を目で確かめる） |
| `timeline` | 時間の図 | `ticks`（`{ at, label }`。2〜8 個。`at` は増える順）、`lanes`（1〜4 本。`{ label, spans?: [{ from, to, label }], marks?: [{ at, label }] }`）。`from`・`to`・`at` は目盛りの値を指す。目盛りは等間隔に描く（時間の比ではない）。字数: 目盛りの `label` 6、帯の `label` 10、`spans` の `label` 30（折り返す）、`marks` の `label` 6（帯の幅に収まらないと警告） |
| `layers` | 層の図 | `columns`（省くと 1 列。4 列まで）、`rows`（`{ label, cells }`。8 行まで。上から下へ）、`legend`（キー → ラベル。1〜3 種類）。`cells` は列の数だけ、凡例のキーで書く。字数: 列 14、行の `label` 16、凡例のラベル 8 |

字数の上限の正本は `scripts/lib/schema.mjs` です（上の表は写し）。

- 表で足りる比較は、今までどおり Markdown の表で書きます。
- **本文からの参照**: レッスン・早見表・ガイドの本文に、1 行で `![キャプション](#/diagrams/dg-vpc-three-tier)` と書くと、その位置に図が出ます。構成図は `?step=<番号>` で、その段階に止めた図を出せます。存在しない図と、段階の数を超える `step` は validate のエラーです。タイトルつき（`![キャプション](#/diagrams/<id> "題")`）も同じ扱いです。参照形式（`![キャプション][ref]` と `[ref]: #/diagrams/<id>`）は使えません（validate のエラー）。コードフェンスとインラインコードの中の参照は数えません。丸括弧のタイトル、2 段以上の入れ子の角括弧、4 字下げのコードの中など、validate と表示で読み方がずれる書き方は、アプリのビルドが止めます（下の 17 章の突き合わせと同じ）。
- **検証状態**: 図の検証状態を記録する仕組みはまだありません。今は、どの図も「未検証」として扱い、本文に埋め込んだ図にも「未検証」の札が出ます。既存のレッスンからは参照しません（設計書 11.2）。

## 17. その場の確認

レッスンの節の終わりに置く小問です。レッスンの Markdown の中に、囲み記事として書きます。

```markdown
> **その場の確認**
> パブリック IP アドレスを持つインスタンスが、インターネットゲートウェイへのルートがないサブネットにあります。このインスタンスはインターネットと通信できますか？
>
> - [ ] 通信できる
> - [x] 通信できない
>
> サブネットがパブリックかどうかは、ルートテーブルで決まります。パブリック IP アドレスがあっても、ルートがなければ届きません。
```

- 問いは 120 字まで。選択肢は 2〜4 個（`- [ ]`。`* [ ]` でも書ける）、正解（`- [x]`）は 1 個。選択肢の後ろの段落が理由で、必須です。形が違うと validate のエラーです。
- 選択肢は続けて書きます。選択肢の間に `>` だけの空行や別の行を入れるとエラーです。
- 見出しは `> **その場の確認**` だけの行にします。`**その場の確認：**` のようにコロンを付けたり、同じ行に問いを続けたりするとエラーです。
- 前の引用（囲み記事など）とは空行（半角の空白とタブだけの行。全角の空白だけの行は空行になりません）で分けます。見出しの直前から空行までに `>` で始まる行があると、前の引用とつながって確認として表示されないので、エラーです（`>` のない継続の行を挟んでも同じ）。
- 確認の行は、見出しの行と同じ字下げで書きます（リストの中なら、すべての `>` の前に同じ数の空白）。字下げが違うとエラーです。
- 選択肢に図・画像・図へのリンクは書けません（表示は選択肢を文字だけにするため）。問いを 2 段落以上に分けた場合も、問いは文字だけになるので、図は書けません。理由と 1 段落の問いに文と一緒に書いた図は、図ではなく「図: …」のリンクで表示します（理由が図だけなら図として描きます）。図そのものを見せたいときは、確認の外（直後の本文）に置きます。
- タスクリスト（`- [ ]`・`- [x]`）を引用の中に書くのは、その場の確認の選択肢だけにします。
- 同じ文書の中で、同じ問いの文を 2 回使うとエラーです（記録の `checkId` が問いの文から決まるため）。問いの文を直すと `checkId` が変わり、前の回答の記録とはつながらなくなります。
- 記法の例を本文に載せるときは、コードフェンス（```）で囲みます（フェンスの中は確認として読みません）。
- validate の検査は行単位で、表示（Markdown の解析）と細部が違います。アプリのビルド（`cd app && npm run content`、`npm run build`）は、本文ごとに表示と同じ解析をして、次のときに文書名と行を出して止まります。validate が通した確認が表示で確認にならない（4 字下げ、HTML の直後、前の引用とのつながりなど）、確認の引用が理由のあとも続く、確認にならない引用の中にタスクリストがある、確認の外に「その場の確認」の見出しに見えるものがある（`###` などの見出しと、段落の先頭の強調。文の途中の強調は止めません）、validate と表示で図の参照の読み方が違う（丸括弧のタイトル、2 段の入れ子の角括弧、引用の中の定義など）。
- その節の本文に書いてあることだけを問います。本番形式の問題（シナリオと制約語）にはしません。
- 1 レッスンに 3〜6 個が目安です（1〜2 個のレッスンは警告）。
- アプリは選ぶまで正解と理由を隠し、回答を記録します。記録は合格準備度と復習の予定には使いません。
