---
id: cheatsheet-load-balancers
title: ELB の 3 種類（ALB・NLB・GWLB）
order: 70
taskStatements:
  - "2.1"
  - "2.2"
  - "3.4"
services:
  - Elastic Load Balancing
  - Amazon EC2 Auto Scaling
  - AWS Global Accelerator
  - AWS PrivateLink
  - AWS WAF
  - AWS Certificate Manager (ACM)
  - Amazon Cognito
createdBy: x
---

Elastic Load Balancing（ELB）は、受け取った通信を複数のターゲット（EC2 インスタンス、コンテナ、IP アドレスなど）に分散し、ヘルスチェックで異常なターゲットを外します。どの層（レイヤー）で通信を見るかで、3 種類を使い分けます。

## 比較表

| 観点 | Application Load Balancer（ALB） | Network Load Balancer（NLB） | Gateway Load Balancer（GWLB） |
|---|---|---|---|
| 層 | レイヤー 7（アプリケーション） | レイヤー 4（トランスポート） | レイヤー 3（ネットワーク） |
| プロトコル | HTTP・HTTPS・gRPC（WebSocket を含む） | TCP・UDP・TLS | IP パケット（GENEVE でアプライアンスへ渡す） |
| 振り分けの条件 | パス、ホスト名、HTTP ヘッダー、クエリ文字列など | プロトコルとポート | すべての通信をアプライアンスへ通す |
| ターゲット | EC2 インスタンス、IP アドレス、AWS Lambda 関数 | EC2 インスタンス、IP アドレス、ALB | 他社のファイアウォールなどの仮想アプライアンス |
| 固定 IP アドレス | なし（DNS 名で使う） | AZ ごとに固定 IP。Elastic IP アドレスも割り当てられる | — |
| 特徴 | AWS WAF との連携、Amazon Cognito などによる認証、リダイレクト、固定の応答 | 非常に高いスループットと低いレイテンシー、送信元 IP アドレスの保持、AWS PrivateLink のエンドポイントサービス | ファイアウォールや侵入検知の装置を、通信の経路に透過的に挟む |
| 向いている用途 | Web アプリケーション、マイクロサービス、コンテナ | ゲーム、IoT、金融の取引、固定 IP が必要な通信 | 通信の検査、セキュリティアプライアンスの集約 |

Classic Load Balancer は前の世代のロードバランサーです。新しく設計するなら、上の 3 種類から選びます。

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| URL のパス（`/api`、`/images`）やホスト名で、別々のサービスに振り分けたい | ALB |
| 1 つのロードバランサーで、複数のコンテナやマイクロサービスへ振り分けたい | ALB |
| SQL インジェクションなどの Web の攻撃を防ぎたい | ALB と AWS WAF |
| 利用者のログインをロードバランサーで処理したい | ALB の認証機能（Amazon Cognito、OIDC） |
| 1 秒に数百万のリクエスト、非常に低いレイテンシー | NLB |
| UDP を使う、TCP のままで HTTP ではない | NLB |
| 取引先に固定の IP アドレスを伝える必要がある | NLB（Elastic IP アドレス）、または AWS Global Accelerator |
| 自社のサービスを AWS PrivateLink で別の VPC に公開したい | NLB |
| 他社のファイアウォールで、VPC に出入りする通信をすべて検査したい | GWLB |

## 一緒に使う機能

- **ヘルスチェック**: 異常なターゲットに通信を送らないようにします。Amazon EC2 Auto Scaling で ELB のヘルスチェックを使うと、異常なインスタンスを自動で置き換えます。
- **複数の AZ への配置**: ロードバランサーとターゲットを 2 つ以上の AZ に置くと、1 つの AZ が止まっても動き続けます。
- **HTTPS の終端**: AWS Certificate Manager（ACM）の証明書をリスナーに設定して、暗号化の処理をロードバランサーに任せます。
- **スティッキーセッション**: 同じ利用者の通信を同じターゲットへ送ります。ただし、セッションの情報は ElastiCache や DynamoDB に置くほうが、スケールに強くなります。
- **登録解除の遅延**: ターゲットを外すとき、処理中の通信が終わるまで待ちます（以前の名前は Connection Draining）。

> **試験のポイント**
> 「パス」「ホスト名」「HTTP ヘッダー」で振り分けるのは ALB、「固定 IP」「UDP」「超低レイテンシー」は NLB、「サードパーティーのアプライアンス」「通信の検査」は GWLB です。

## ひっかけ注意

> **ひっかけ注意**
> ALB には固定の IP アドレスがありません。「IP アドレスを許可リストに登録したい」という要件では、ALB だけでは足りません。前に Global Accelerator を置くか、NLB を使います。

> **ひっかけ注意**
> ロードバランサーを 1 つの AZ のサブネットだけに置くと、その AZ の障害で止まります。高可用性が必要なら、2 つ以上の AZ のサブネットを指定します。

## 出典

- [Elastic Load Balancing ユーザーガイド](https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/what-is-load-balancing.html)
- [Application Load Balancer とは](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html)
- [Network Load Balancer とは](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html)
- [Gateway Load Balancer とは](https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html)
- [Elastic Load Balancing の機能の比較](https://aws.amazon.com/elasticloadbalancing/features/)
