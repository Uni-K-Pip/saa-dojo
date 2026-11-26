# シミュレーター「IAM のポリシーの評価」の設計書

`visual-materials-design.md` 10.2 の Sim1 を作るための設計です。実装する規則と裏づけ、入力と出力、扱わないこと、シナリオの一覧を決めます。共通の枠（シナリオの形、画面の流れ、検査、記録、検証状態）は `sims-design.md` にあります。書き方は `sim-cidr-design.md`・`sim-trace-design.md` にそろえます。

実装は済んでいます（2026-11-26）。シナリオの形式は `content-guide.md` 21 章、画面の仕様は `app-spec.md` に書いてあります。この文書は、規則と裏づけ、入力と出力、決めたことの理由を残すものです。

## 1. 学ぶこと

- 明示的な拒否（Deny）は、どのポリシーにあっても、許可より優先する
- 許可（Allow）がなければ拒否される（暗黙の拒否）。暗黙の拒否と明示的な拒否は別のもの
- SCP と権限の境界は上限で、それ自体は権限を与えない。許可するポリシーが別に要る
- 同じアカウントでは、アイデンティティベースのポリシーとリソースベースのポリシーのどちらかの許可で足りる。別のアカウントのリソースには、両方の許可が要る

学習コースでは、ステージ 1 の「アクセス管理」（u01。`lesson-1.1-iam-basics`、`lesson-1.1-roles-federation` のユニット）に置きます。

## 2. シミュレーターの id と置き場所

- id は `iam`。シナリオは `content/saa-c03/sims/iam/sim-iam-<…>.json`、エンジンは `scripts/lib/sims/iam.mjs`（型は `iam.d.mts`）、画面の部品は `app/src/sims/iam/`。
- 名前は「IAM のポリシーの評価」。一覧の 1 文（`DESCRIPTION`）は「だれが・何を・どのリソースに、を決めて、関係するポリシーから、リクエストが許可されるか拒否されるかを確かめます。」。
- 操作は 1 つ（`op: "evaluate"`）。

## 3. 公式の評価の流れ（英語版で 2026-11-25 に確かめた）

IAM ユーザーガイドの「How AWS enforcement code logic evaluates requests」（`reference_policies_evaluation-logic_policy-eval-denyallow.html`）の本文の並びは、明示的な拒否 → リソースコントロールポリシー（RCP）→ SCP → リソースベース → アイデンティティベース → 権限の境界 → セッションポリシー です。確かめたことと、設計に効くこと:

- 「By default, all requests are implicitly denied with the exception of the AWS account root user」「An explicit deny overrides an explicit allow」。当てはまる Deny が 1 つでもあれば、最終の判定は Deny
- SCP の段は、当てはまる Allow がなければ Deny。SCP の評価のページ（`orgs_manage_policies_scps_evaluation.html`）は、ルートから対象のアカウントまでのすべての階層に Allow が要ると述べる
- リソースベースの段: ほとんどのリソースでは、アイデンティティベースかリソースベースのどちらかの Allow で足りる。IAM ロールの信頼ポリシーと KMS のキーポリシーは例外で、そのポリシー自体がプリンシパルを許可する必要がある
- 同じアカウントで、リソースベースのポリシーが IAM ユーザーの ARN を直接許可していれば、アイデンティティベースのポリシーや境界の暗黙の拒否は結果を変えない。IAM ロールの ARN への許可は、境界とセッションポリシーの暗黙の拒否で絞られる
- 別のアカウント（`reference_policies_evaluation-logic-cross-account.html`）: 「AWS performs two evaluations」「The request is allowed only if both evaluations return a decision of Allow」
- **流れ図の並びは 1 つではない**。ロールの流れ図と本文は「アイデンティティベース → 境界」の順だが、IAM ユーザーの流れ図は「境界 → アイデンティティベース」の順で描いている。暗黙の拒否が「どの段で決まったか」は、資料によって言い方が変わる。このシミュレーターが「どの段で評価が終わったか」を言わない理由です（12 章の 1）
- 試験ガイド（SAA-C03。全ページを見た）: 「service control policies [SCPs]」「resource policies」「cross-account access」「access policies for encryption keys」は出る。「resource control」「session polic」「permissions boundar」の語は出ない

## 4. 実装する規則

規則は、エンジンの規則の表（`RULES`）に 1 つずつ置き、図鑑の検証済みの事実で裏づけます。規則の文は事実の文の範囲に収め、**エンジンがその規則を当てる相手と、規則の文の主語をそろえます**（下の表の「当てる相手」。実行の `rules` に入れる条件でもある）。事実の状態は 2026-11-26 の `catalog-status.json` で確かめました（どれも `verified`。`wildcard` の裏づけの事実には、Action の `*` を言う文を足す直しが残っています。11 章）。

| 規則の id | 内容 | 裏づけ | `evidence` | 当てる相手（`rules` に入れる条件） |
|---|---|---|---|---|
| `default-deny` | 既定ではすべてのリクエストが暗黙に拒否される。許可されるには、ポリシーの明示的な許可が要る | `iam.implicit-deny` | `既定ではすべてのリクエストが暗黙に拒否される`、`ポリシーで明示的に許可されている必要がある` | IAM ユーザーとロールの実行（ルートユーザーには当てない） |
| `root-full-access` | ルートユーザーは完全なアクセス権を持つ例外 | `iam.implicit-deny` | `ルートユーザーは完全なアクセス権を持つ例外` | ルートユーザーの実行 |
| `explicit-deny` | どのポリシーでも、明示的な拒否があれば、許可より優先して拒否される | `iam.policy-evaluation-allow-deny` | `どのポリシーでも明示的な拒否があれば、許可より優先して拒否される` | 同じアカウントで、アイデンティティベース・境界・リソースベースのどれかの Deny が当てはまった実行 |
| `same-account-union` | 同じアカウントでは、アイデンティティベースとリソースベースのどちらかが許可していれば許可される | `iam.policy-evaluation-allow-deny` | `どちらかが許可していれば許可される` | 同じアカウントの IAM ユーザーとロールで、リソースベースのポリシーがあり、明示的な拒否でない実行 |
| `identity-policy` | アイデンティティベースのポリシーは、その ID が何をどのリソースにどんな条件で実行できるかを決める | `iam.identity-policy-types` | `その ID が何をどのリソースにどんな条件で実行できるかを決める` | IAM ユーザーとロールの実行 |
| `boundary-ceiling` | 権限の境界は上限で、それ自体は権限を与えない。アイデンティティベースのポリシーと境界の両方が許可した操作だけが通る | `iam.boundary-basics` | `そのポリシーと境界の両方が許可する操作に限られる`、`境界自体は権限を付与しない` | 境界のある IAM ユーザーとロールの実行（`boundary-user-direct` を当てた実行を除く） |
| `boundary-user-direct` | 同じアカウントで、リソースベースのポリシーが IAM ユーザーの ARN に直接与えた許可は、アイデンティティベースのポリシーや境界の暗黙の拒否では絞られない | `iam.boundary-resource-policy` | `IAM ユーザーの ARN に直接許可を与えている場合`、`暗黙の拒否では制限されない` | 同じアカウントの IAM ユーザーで、その ARN を名指しした Allow が当てはまり、アイデンティティベースか境界に許可がない実行 |
| `boundary-role-arn` | IAM ロールの ARN への許可は、境界の暗黙の拒否で絞られる | `iam.boundary-resource-policy` | `IAM ロールの ARN への許可は、境界の暗黙の拒否で制限される` | 同じアカウントのロールで、その ARN を名指しした Allow が当てはまり、境界がある実行 |
| `scp-ceiling` | SCP は、組織内の IAM ユーザーやロールが使える権限の上限を定め、それ自体は権限を与えない | `organizations.scp-permission-ceiling` | `権限の上限を定める`、`SCP 自体は権限を付与せず` | SCP のあるメンバーアカウントの IAM ユーザーとロール |
| `scp-every-level` | SCP の評価で許可されるには、ルートから対象のアカウントまでのすべての階層に Allow が要る | `organizations.scp-allow-at-every-level` | `すべての階層でその操作を許可する Allow が必要` | SCP のあるメンバーアカウントの実行 |
| `scp-deny` | どの階層の SCP でも、明示的に拒否すると、その操作は拒否される | `organizations.scp-deny-inheritance` | `いずれかに付いた SCP が操作を明示的に拒否すると、その操作は拒否される` | メンバーアカウントで、SCP の Deny が当てはまった実行 |
| `scp-root-user` | SCP は、メンバーアカウントのルートユーザーが行う操作にも制限を適用する | `organizations.scp-member-root` | `メンバーアカウントのルートユーザーが行う操作にも制限を適用する` | SCP のあるメンバーアカウントのルートユーザー |
| `scp-management` | 管理アカウントの操作は、SCP で制限できない | `organizations.scp-management-exemption` | `管理アカウントの操作をその SCP で制限できない` | `scps` のある管理アカウントの実行（ユーザー・ロール・ルート） |
| `cross-account-both` | 別のアカウントのリソースには、プリンシパルの側のアイデンティティベースのポリシーと、リソースの側のリソースベースのポリシーの両方の許可が要る。どちらかの評価に明示的な拒否があれば拒否される | `iam.cross-account-both-policies` | `両方が許可していて初めて`、`どちらかのアカウントの評価で明示的な拒否があれば拒否される` | 別のアカウントの実行 |
| `principal-account` | ルートユーザーの ARN は、Principal 要素ではアカウント全体への委任になる | `iam.global-key-principalarn` | `Principal 要素ではアカウント全体への委任になる` | Principal がプリンシパルのアカウントのルートユーザーの ARN の文が当てはまった実行 |
| `principal-org` | Principal が `*` で、`aws:PrincipalOrgID` を `StringEquals` で比べる文は、指定した組織のアカウントのプリンシパルだけに当たる | `iam.principal-wildcard-orgid` | `許可の対象を指定した組織のメンバーのアカウントのプリンシパルに限れる` | その形の Allow の文で、アクションとリソースが当てはまった実行 |
| `cond-org-id` | `aws:PrincipalOrgID` は、組織に属するプリンシパルの要求にだけ含まれる | `iam.global-key-principalorgid` | `組織に属するプリンシパルの要求にだけ含まれる` | `aws:PrincipalOrgID` の条件を持つ文で、アクションとリソースが当てはまった実行 |
| `cond-secure-transport` | `aws:SecureTransport` は、要求が TLS で送られたかを表し、常に要求に含まれる | `iam.global-key-securetransport` | `要求が TLS で送られたかを true か false で表す`、`常に要求に含まれる` | `aws:SecureTransport` の条件を持つ文で、アクション・リソース・Principal が当てはまった実行 |
| `resource-policy-s3` | バケットポリシーは、バケットとその中のオブジェクトへのアクセスを許可・拒否するリソースベースのポリシー | `s3.bucket-policy` | `アクセスを許可・拒否する JSON 形式のリソースベースポリシー` | リソースベースのポリシーのある実行（リソースは S3 だけ） |
| `wildcard` | Resource の ARN の区画内では `*` が任意の文字列に当たり、Action でも複数の文字に当たる `*` を使える | `iam.policy-resource-element`（Action の `*` は 11 章の直しで足した） | `* が任意の文字列に`、`複数の文字に一致する *` | `*` を含む文を持つポリシーを見た実行 |

- 評価の順そのもの（どの段を先に見るか）は規則にしません（12 章の 1）。
- 事実で裏づけられない組み合わせは、入力で断ります（5.2）。
- 別のアカウントの実行では、明示的な拒否の規則は `cross-account-both`（アイデンティティベース・境界・リソースベースの Deny）と `scp-deny` が受け持ちます。

## 5. 入力と出力

### 5.1 設定（`config`）

toggle は最上位の項目を 1 つ変えるので、変えたい単位を最上位に分けます。

| 項目 | 形 | 内容 |
|---|---|---|
| `op` | `"evaluate"` | |
| `principal` | `{ kind: "user"｜"role"｜"root", name?, account }` | だれが。`name` は `user`・`role` で必須（英小文字・数字・ハイフン、1〜32 字）、`root` では書かない。`account` は 12 桁の数字。ARN は `arn:aws:iam::<account>:user/<name>`・`…:role/<name>`・`…:root` |
| `org` | `{ membership: "none"｜"member"｜"management", id? }` | プリンシパルのアカウントの、組織での立場。`id`（`o-` と英小文字・数字 10〜32 字）は、`none` 以外で必須、`none` では書かない |
| `request` | `{ action, tls }` | 何を。`action` は `<サービス>:<アクション名>`（例 `s3:GetObject`。ワイルドカードは書けない）。`tls` は真偽 |
| `resource` | `{ arn, account }` | どのリソースに。`arn` は 1 つのリソースの ARN（ワイルドカードは書けない）。`account` はリソースを持つアカウント（12 桁） |
| `scps` | `null` か `[{ at: "root"｜"ou"｜"account", statements }]` | 組織のルート・OU・アカウントに付いた SCP。`root` と `account` は必須、`ou` は 0〜1 つ。並びは `root`・`ou`・`account` の順。`statements` は文 1〜4 つ |
| `identityPolicy` | 文の配列（0〜4） | アイデンティティベースのポリシー（付いているポリシーを合わせた文の並び） |
| `boundary` | `null` か文の配列（1〜4） | 権限の境界 |
| `resourcePolicy` | `null` か文の配列（1〜4） | リソースベースのポリシー（S3 のバケットポリシー） |

文は `{ effect: "Allow"｜"Deny", actions: [..], resources: [..], principal?, condition? }`。

- `actions`（1〜4）: `*`、`<サービス>:*`、`<サービス>:<アクション名>`。アクション名の中に `*` を書ける（`s3:Get*`）。サービスは英小文字、アクション名は大文字で始める（AWS の一覧の書き方どおり。照合は大文字と小文字を区別する）
- `resources`（1〜4）: `*` か ARN。ARN では、最後の区画（5 つ目のコロンのあと）にだけ `*` を書ける。`*` は `/` を含む任意の文字列に当たる
- `principal`: リソースベースのポリシーの文だけに書く（必須）。`"*"` か `{ arn }`。`arn` は、IAM ユーザーかロールの ARN、またはアカウントのルートユーザーの ARN（`arn:aws:iam::<account>:root`。そのアカウント全体への委任として、そのアカウントのどのプリンシパルにも当たる）。アカウント ID だけの書き方は受けない（規則 `principal-account` の裏づけの事実が、ルートユーザーの ARN について述べているため）
- `condition`（任意、1 つ）: `{ key: "aws:SecureTransport", value: 真偽 }`（`Bool`。`request.tls` と等しいとき当たる）か `{ key: "aws:PrincipalOrgID", value: 組織 ID }`（`StringEquals`。プリンシパルのアカウントが組織に属し、その ID と等しいとき当たる。リソースベースのポリシーの文だけ）
- SCP・アイデンティティベース・境界の文に `principal` は書けない。SCP の文の `resources` は `*` だけ

文がリクエストに当てはまるのは、アクション、リソース、（あれば）Principal、（あれば）条件のすべてが当たるときです。

アクションのワイルドカードは、エンジンの 1 つの定数で切り替えられる形にします（裏づけの事実が検証を通らなかったとき、アクションを完全一致だけにするため）。

### 5.2 入力の検査（エラーにする組み合わせ）

- 形の違い、`?`、NotAction・NotResource・NotPrincipal、ポリシー変数（`${`）、決めた 2 種類以外の条件
- `request.action` のサービスと、`resource.arn` のサービスが違う。ARN にアカウント ID があるのに `resource.account` と違う
- サービスが `sts`・`kms` のリクエスト（ロールを引き受ける操作と信頼ポリシー、KMS のキーとキーポリシーは扱わない）
- ルートユーザーに、アイデンティティベース（空でない）・境界・リソースベースのポリシー、別のアカウントのリソース
- 組織に入っていないのに `scps` がある
- S3 以外のリソースに `resourcePolicy`
- 同じアカウントのリソースベースの **Allow** で、Principal がルートユーザーの ARN（アカウント全体）か `*`（IAM ユーザーかロールを名指しした ARN だけを扱う。Deny はどの形でもよい）
- Allow で Principal が `*` なのに `aws:PrincipalOrgID` の条件がない文（公開の許可は扱わない）
- リソースベースの文の `{ arn }` が、プリンシパルのアカウントでもリソースのアカウントでもないアカウントの ARN（関係のない第三者は扱わない）

### 5.3 評価（要る条件の一覧）

1. **明示的な拒否**: 当てはまる Deny が、SCP の各階層（メンバーアカウントのときだけ）、アイデンティティベース、境界、リソースベースのどれかにあれば、結果は明示的な拒否（`denyIn` に、当てはまったポリシーをすべて入れる）
2. 1 でなければ、次の条件をすべて満たすと許可。満たさない条件があれば暗黙の拒否で、満たしていない条件をすべて `missing` に入れる

| 場合 | 要る条件（満たさないときの `missing` の語） |
|---|---|
| SCP のあるメンバーアカウント（ユーザー・ロール・ルート） | すべての階層に当てはまる Allow（`scp`） |
| ルートユーザー | ほかに条件なし |
| 同じアカウントの IAM ユーザー | 「アイデンティティベースの Allow（`no-allow`）と、境界があれば境界の Allow（`boundary`）」。リソースベースのポリシーがその IAM ユーザーの ARN を名指しで Allow していれば、この 2 つは要らない |
| 同じアカウントのロール | 「アイデンティティベースの Allow か、リソースベースのポリシーがロールの ARN を名指しした Allow」（`no-allow`）と、境界があれば境界の Allow（`boundary`） |
| 別のアカウント | アイデンティティベースの Allow（`identity-side`）、境界があれば境界の Allow（`boundary`）、リソースベースの Allow（`resource-side`。Principal は、名指しの ARN、プリンシパルのアカウントのルートユーザーの ARN、`*` と `aws:PrincipalOrgID`） |

管理アカウントと、組織に入っていないアカウントでは、SCP を見ません。

### 5.4 出力（`OUTPUT_KEYS.evaluate`）

| 項目 | 形 | 内容 |
|---|---|---|
| `decision` | `allow`・`explicit-deny`・`implicit-deny` | 結果。予想の問いの多くはこの項目 |
| `allowed` | 真偽 | 許可されたか |
| `blocker` | `none`・`explicit-deny`・`scp`・`no-allow`・`boundary`・`identity-side`・`resource-side`・`multiple` | 拒否の決め手。許可なら `none`、明示的な拒否なら `explicit-deny`、満たしていない条件が 1 つならその語、2 つ以上なら `multiple` |
| `denyIn` | 配列 | Deny が当てはまったポリシー（`scp-root`・`scp-ou`・`scp-account`・`identity`・`boundary`・`resource-policy`） |
| `missing` | 配列 | 満たしていない条件のすべて（5.3 の語。明示的な拒否のときは空） |
| `crossAccount` | 真偽 | 別のアカウントか |
| `stages` | 配列 | 画面の段。下の形 |

`stages` の要素は `{ stage, side?, state, impact, matched }` です。

- `stage`: `deny`（明示的な拒否）・`scp`・`resource`（リソースベース）・`identity`（アイデンティティベース）・`boundary`。並びはこの順（公式の本文の並び）。別のアカウントでは `side`（`principal`・`resource`）を付け、プリンシパルの側（`deny`・`scp`・`identity`・`boundary`）、リソースの側（`deny`・`resource`）の順に並べる
- `state`: `deny`（当てはまる Deny がある）・`clear`（`deny` の段で、Deny がない）・`allow`（当てはまる Allow がある）・`no-allow`（ない）・`none`（ポリシーがない）・`exempt`（対象外。管理アカウントの SCP）
- `impact`: `decides-deny`（ここで拒否に決まる）・`grants`（許可を与えている）・`passes`（上限を満たす）・`blocks`（満たしていない条件）・`bypassed`（名指しの許可があるので、結果を変えない）・`unused`（結果に関わらない。明示的な拒否のときのほかの段、ポリシーのない段など）
- `matched`: 当てはまった文（`{ policy, index, effect }`。`policy` は `denyIn` と同じ語）

`rules` は、実行で使った規則を表の順に並べます（4 章の「当てる相手」）。シナリオの `factRefs`・`lessonRefs` は、それらの裏づけをすべて含みます。

## 6. 省くこと

- リソースコントロールポリシー（RCP）、セッションポリシー、ロールを引き受ける操作と信頼ポリシー、KMS のキーとキーポリシー（12 章、13 章）
- NotAction・NotResource・NotPrincipal、ポリシー変数、条件の演算子と条件キーの大半（2 種類だけ）、`?` のワイルドカード、大文字と小文字を区別しない照合
- サービスごとの例外（S3 の ACL とブロックパブリックアクセス、VPC エンドポイントのポリシー、S3 以外のリソースベースのポリシー）
- フェデレーションのユーザーのセッション、匿名のリクエスト、AWS のサービスからのリクエスト、サービスにリンクされたロール
- グループ、管理ポリシーとインラインポリシーの区別（アイデンティティベースのポリシーは、合わせた 1 つの文の並びとして入れる）
- 公開の許可（Principal が `*` で条件のない Allow）、同じアカウントで Principal がルートユーザーの ARN や `*` の Allow
- ルートユーザーへのリソースベースのポリシーの効き方

## 7. 画面に出す「扱わないこと」の文（`NOT_COVERED`）

1. リソースコントロールポリシー（RCP）は扱いません。組織のポリシーは SCP だけです。
2. ロールを引き受ける操作（sts:AssumeRole）と信頼ポリシーは扱いません。
3. KMS のキーとキーポリシーは扱いません。
4. セッションポリシー、フェデレーションのセッション、匿名のリクエストは扱いません。
5. NotAction などの否定の要素とポリシー変数は扱いません。条件キーは 2 種類だけです。
6. リソースベースのポリシーは S3 のバケットポリシーだけです。ACL などの例外は扱いません。

`NOT_COVERED_LINKS`: 1 にレッスン `lesson-1.1-multi-account`（組織のポリシー）、2 にレッスン `lesson-1.1-roles-federation`（ロールと信頼ポリシー）、3 にレッスン `lesson-1.3-encryption-and-keys`（KMS のキーポリシー）。

## 8. 画面

今ある 2 つのシミュレーターの枠（`SimFlow`、シナリオ・自由に試す・扱わないこと）を使います。幅 360px で 1 列、ボタンは 44px 以上、文字は 12px 以上、色は CSS の変数。

- **設定の表**: 最上位の項目ごとに 1 行（だれが／組織／何を／どのリソースに／SCP／アイデンティティベース／権限の境界／リソースベース）。値は短い要約（「Allow s3:GetObject → example-reports/*」。長いものは折り返す）
- **結果（`IamResult`）**: 1 列に、次の順で出す
  1. 要約の 1 行（`aria-live`）: 「許可されます」「拒否されます（明示的な拒否）」「拒否されます（暗黙の拒否）」と決め手（「権限の境界に許可がありません」など。`multiple` のときは満たしていない条件を並べる）
  2. 評価の流れの段のカード（公式の本文の並び。① 明示的な拒否 ② SCP ③ リソースベース ④ アイデンティティベース ⑤ 権限の境界）。各カードは、番号、段の名前、状態（「拒否あり」「拒否なし」「許可あり」「許可なし」「ポリシーなし」「対象外」。文字と印で示し、色だけにしない）、当てはまった文の要約、結果への効き方（「ここで拒否に決まります。ほかのポリシーの許可は結果を変えません。」「許可を与えています。」「上限を満たしています。」「ここに許可がないので、拒否になります。」「リソースベースのポリシーが IAM ユーザーを名指しで許可しているので、ここに許可がなくても結果は変わりません。」）。実行の直後に上から順に現れ、`prefers-reduced-motion` では一度に出す。ポリシーのない段は薄い 1 行。「許可を与えています。」は、結果が拒否のときにも、その段に当てはまる Allow があれば出す（足りない許可は、要約の 1 行と「ここに許可がないので、拒否になります。」の段が示す）
  3. 「ここで評価が終わる」とは書かない（明示的な拒否の「ここで拒否に決まります」だけ）
- 別のアカウントでは、「プリンシパルのアカウントの評価」「リソースのアカウントの評価」の 2 つの見出しに分け、「両方が許可して初めて通ります」を添える
- 閉じた `<details>`「ポリシーを見る」に、文のカード（Effect・Action・Resource・Principal・Condition）を出し、当てはまった文に印を付ける
- **自由に試す（`IamExplore`）**: 1 つのプリセット（同じアカウントの S3 のバケット）と、9 つの切り替え（だれが、何を、リソースのアカウント、TLS、組織での立場、SCP、アイデンティティベースのポリシー、権限の境界、バケットポリシー。エンジンの `buildPresetConfig`）。ルートユーザーのときはリソースのアカウント・アイデンティティベースのポリシー・権限の境界・バケットポリシーを、組織に入っていないときは SCP を選べなくする。設定はエンジンの入力の検査を通してから実行し、通らない組み合わせはエラーの文を出す（`expect` と `explain` はない。記録しない）

## 9. シナリオの一覧（7 件）

「答え」と「結果」は、エンジンが出すはずの値で、`expect` に書く値です。アカウントは A（`111122223333`）と B（`444455556666`）、組織は `o-exampleorgid`。toggle は最上位の項目を 1 つだけ変えるので、リクエストを変える toggle は、同じサービスの別の操作にします（別のサービスにするには `request` と `resource` の両方を変える必要があるため）。

1. `sim-iam-implicit-deny`: IAM ユーザーに `s3:GetObject`（`example-reports/*`）の Allow だけがある。リクエストは `s3:PutObject` → `implicit-deny`・`no-allow`。変えられる設定: リクエストを GetObject に（許可）／アイデンティティベースに、別のバケットへの PutObject の Allow を足す（暗黙の拒否のまま。アクションは当たるが、リソースが当たらない）／バケットポリシーでこのユーザーの ARN に PutObject を Allow（許可。同じアカウントではどちらかで足りる）。裏づけ: `iam.implicit-deny`、`iam.policy-evaluation-allow-deny`、`iam.identity-policy-types`、`iam.boundary-resource-policy`、`s3.bucket-policy`
2. `sim-iam-explicit-deny`: アイデンティティベースで Get と Put を Allow。バケットポリシーに、TLS でないリクエストの Deny。TLS なしで GetObject → `explicit-deny`（`denyIn` はリソースベース）。変えられる設定: TLS にする（許可）／アイデンティティベースをすべて Allow に（拒否のまま）／Deny の文を外す（許可）。裏づけ: `iam.policy-evaluation-allow-deny`、`iam.global-key-securetransport`、`s3.bucket-policy`
3. `sim-iam-boundary-ceiling`: アイデンティティベースは `s3:GetObject` と `s3:DeleteObject`、境界は `s3:GetObject` と `s3:PutObject`。リクエストは `s3:DeleteObject` → `implicit-deny`・`boundary`。変えられる設定: リクエストを GetObject に（許可。両方が許可）／リクエストを PutObject に（`no-allow`。境界は許可しているが、境界は権限を与えない）／境界を外す（許可）。裏づけ: `iam.boundary-basics`、`iam.implicit-deny`
4. `sim-iam-scp-ceiling`: メンバーアカウントの管理者（すべて Allow）。SCP は、ルートとアカウントがすべて Allow、OU が `s3:*` と `ec2:*` だけ。リクエストは `dynamodb:CreateTable` → `implicit-deny`・`scp`。変えられる設定: OU の SCP をすべて Allow に（許可）／すべての階層を Allow にして、ルートの SCP に `dynamodb:CreateTable` の Deny を足す（明示的な拒否。上位の Deny は下位の Allow で上書きできない）／管理アカウントにする（許可）。裏づけ: `organizations.scp-permission-ceiling`、`organizations.scp-allow-at-every-level`、`organizations.scp-deny-inheritance`、`organizations.scp-management-exemption`
5. `sim-iam-scp-root-user`: メンバーアカウントのルートユーザー。OU の SCP に `cloudtrail:StopLogging` の Deny → `explicit-deny`。変えられる設定: リクエストを `cloudtrail:GetTrailStatus` に（許可）／IAM ユーザーにする（拒否のまま）／管理アカウントにする（許可）。裏づけ: `organizations.scp-member-root`、`organizations.scp-deny-inheritance`、`organizations.scp-allow-at-every-level`、`iam.implicit-deny`、`organizations.scp-management-exemption`
6. `sim-iam-cross-account-bucket`: アカウント A のロールに、アカウント B のバケットへの Allow がある。バケットポリシーはない → `implicit-deny`・`resource-side`。変えられる設定: バケットポリシーでロールの ARN を Allow（許可）／`*` と `aws:PrincipalOrgID` で Allow（許可）／同じアカウントのバケットにする（許可）。裏づけ: `iam.cross-account-both-policies`、`iam.principal-wildcard-orgid`、`iam.global-key-principalorgid`
7. `sim-iam-cross-account-identity`: アカウント B のバケットポリシーが、アカウント A の IAM ユーザーの ARN を Allow。ユーザーの側のポリシーは自分のバケットだけ → `implicit-deny`・`identity-side`。変えられる設定: アイデンティティベースに足す（許可）／同じアカウントのバケットにする（許可。名指しの許可だけで足りる）／Principal をアカウント A のルートユーザーの ARN にする（暗黙の拒否のまま）。裏づけ: `iam.cross-account-both-policies`、`iam.boundary-resource-policy`、`iam.global-key-principalarn`

どのシナリオも、`*` を含む文を使うので、`wildcard` の裏づけを参照に含めます。

## 10. エンジンの単体テスト

- 照合: ワイルドカード（`*`、`s3:*`、`s3:Get*`、ARN の最後の区画、バケットの ARN とオブジェクトの ARN の違い）、2 種類の条件、Principal の 3 つの形
- ポリシーの種類ごとの Allow と Deny、5.3 の表の場合ごとの `decision`・`blocker`・`missing`・`denyIn`、`stages` の並びと `state`・`impact`
- 入力の検査（5.2）のすべてのエラー。`rules` が、4 章の「当てる相手」と合うこと
- 自由に試すのスイッチの組の総当たりを、別の書き方の参照の実装と突き合わせる（乱数は使わない）
- 性質: 当てはまる Deny を足すと必ず `explicit-deny`。上限（SCP・境界）を足して、拒否が許可に変わることはない。許可の出どころを外すと、上限が Allow でも許可にならない。管理アカウントでは SCP が結果を変えない。`blocker` と `missing`・`denyIn` が食い違わない

## 11. 図鑑の事実の直し（1 件）

規則 `wildcard` のうち、Action の `*` を言う事実が図鑑にありませんでした。`iam` のエントリは事実が上限（60 件）に達しているので、新しい事実を足さず、Resource 要素の事実 `iam.policy-resource-element` を、Resource 要素の ARN と、Action・Resource 要素のワイルドカードを述べる 1 件に広げました（2026-11-26。件数は 60 のまま。depth は detail のまま。広げたあとの文は検証済み）。

- 足した文: 「Action 要素では、複数の文字に一致する * と 1 文字に一致する ? のワイルドカードを、アクション名の一部にも使える。s3:* は Amazon S3 の全アクションに、iam:*AccessKey* は AccessKey を含む IAM の全アクションに一致する。」
- 出典（英語版）: IAM ユーザーガイド「IAM JSON policy elements: Action」の「You can use multi-character match wildcards (*) and single-character match wildcards (?) to give access to all the actions the specific AWS product offers.」「You can also use wildcards (* or ?) as part of the action name.」
- エンジンは、アクションのワイルドカードを定数 1 つで切れる形のままにしてあります（5.1。切ると、アクションは完全一致だけになる）

2026-11-26 に図鑑の文を読み直し、規則 `boundary-ceiling` の文と `evidence` を、直ったあとの `iam.boundary-basics` に合わせました。ポリシー文書の構成の事実 `iam.policy-json-document` は、規則の裏づけには足しません（`identity-policy` の裏づけは `iam.identity-policy-types` で足りる）。

## 12. 決めたこと（2026-11-25。比べた案とともに）

1. **評価の順の見せ方**: 「要る条件の一覧」として評価する（5.3）。明示的な拒否がどこかにあれば拒否。なければ、要る許可と上限をすべて満たせば許可、満たさないものがあれば暗黙の拒否とし、満たしていない条件をすべて出す。段のカードは公式の本文の並びで上から順に出すが、「ここで評価が終わる」とは言わない。今ある検証済みの事実だけで裏づき、試験で問われる結果の論理に合う。比べた案は、公式の順に段をたどり、最初に拒否と決まった段で止める形（評価の順を言う事実が図鑑になく、IAM ユーザーとロールで公式の流れ図の並びが違う。3 章）
2. **RCP**: 扱わない。試験ガイドに名前がなく、図鑑の事実は 1 件（`organizations.resource-control-policies`。評価の規則は述べていない）。`NOT_COVERED` とレッスンへのリンクで知らせる
3. **KMS のキーポリシー**: 今回は扱わない。`kms` のサービスのリクエストは入力で断り、`NOT_COVERED` とレッスンへのリンクで知らせる。次に足す候補（13 章）
4. **信頼ポリシー（`sts:AssumeRole`）**: 扱わない。ミニラボ `lab-cross-account-assume-role` が受け持つ
5. **セッションポリシー**: 省く。試験ガイドにもレッスンにも出ない。比べた案は、ロールだけの上限として入れる形（段と規則と入力の検査が 1 つずつ増える）
6. **Action の `*` の裏づけ**: 11 章の形（今ある事実を広げる）。比べた案は、ポリシー文書の構成の事実に 1 文足す形と、`iam` のエントリを整理して枠を空ける形
7. **ルートユーザー**: プリンシパルの種類に入れる。SCP がメンバーアカウントのルートユーザーにも効く論点（シナリオ 5）に要る。ルートユーザーの実行で見るのは SCP だけ
8. **シナリオ**: 7 件（9 章）
9. **リソースベースのポリシー**: S3 のバケットポリシーだけ。同じアカウントの Allow は名指しの ARN だけ（5.2）

## 13. 次に足す候補

- **KMS のキーポリシー**（試験ガイドのタスク 1.3 に鍵のアクセスポリシーがある）: 同じアカウントでも、キーポリシーの側の許可が要る。規則の案は、`kms-key-policy`（事実 `kms.iam-policy-enablement`。`キーポリシー側で IAM ポリシーの利用を明示的に許可する必要がある`）、`kms-cross-account`（事実 `kms.cross-account-authorization`）、`kms-account-principal`（図鑑に足りない事実）。足りない事実の文の案: 「キーポリシーの文の Principal が、キーを持つアカウントのプリンシパル（arn:aws:iam::アカウント ID:root）のとき、その文は IAM のプリンシパルに権限を直接は与えず、そのアカウントが IAM ポリシーで権限を委任できるようにする。」出典は KMS 開発者ガイド「Default key policy」の「When the principal in a key policy statement is the account principal, the policy statement doesn't give any IAM principal permission to use the KMS key. Instead, it allows the account to use IAM policies to delegate the permissions specified in the policy statement.」。シナリオの案: アイデンティティベースに `kms:Decrypt` の Allow があるが、キーポリシーは別のユーザーだけを Allow → 暗黙の拒否。アカウントの文を足す、名指しで Allow する、で許可に変わる
- **セッションポリシー**: ロールだけの上限（事実 `sts.session-policy-intersection`）
- **RCP**: 評価の規則（各階層の Allow など）の事実を `organizations` に足してから

## 14. 実装の大きさの見積もり

| もの | ファイル | 行数の目安 |
|---|---|---|
| エンジン | `scripts/lib/sims/iam.mjs`、`iam.d.mts` | 400、70 |
| 単体テスト | `app/scripts/test/sim-iam.test.mjs` | 450 |
| 登録 | `scripts/lib/sims/index.mjs`、`scripts/lib/schema.mjs` の `SIM_CONFIG_SCHEMAS.iam`、`app/src/pages/SimsPage.tsx` | 100 |
| 画面 | `app/src/sims/iam/`（結果、自由に試す、設定の要約、CSS）と画面のテスト | 800 |
| シナリオ | `content/saa-c03/sims/iam/*.json` 7 件 | 各 100〜150 |
| 文書 | `content-guide.md` 21 章、`app-spec.md`、設計書 13 章の W13 | 30 |
