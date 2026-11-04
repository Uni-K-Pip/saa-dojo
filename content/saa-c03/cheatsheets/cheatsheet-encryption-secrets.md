---
id: cheatsheet-encryption-secrets
title: KMS・CloudHSM・Secrets Manager・Parameter Store・ACM の使い分け
order: 120
taskStatements:
  - "1.3"
  - "1.2"
services:
  - AWS Key Management Service (AWS KMS)
  - AWS CloudHSM
  - AWS Secrets Manager
  - AWS Systems Manager
  - AWS Certificate Manager (ACM)
  - Amazon S3
  - Amazon EBS
  - Amazon RDS
createdBy: x
---

データを守る仕組みは、「暗号化の鍵を管理する」「パスワードなどの秘密情報を保管する」「通信を暗号化する証明書を管理する」の 3 つに分けて考えます。

## 一言でいうと

| サービス | 一言でいうと | 典型的な用途 |
|---|---|---|
| AWS KMS | 暗号化の鍵を作り、管理し、使った記録を残すマネージドなサービス | S3、EBS、RDS などの保存時の暗号化、鍵の利用の監査 |
| AWS CloudHSM | 自分だけが使える専用のハードウェアセキュリティモジュール（HSM） | 鍵を自分だけで管理する規制への対応、TLS の処理の肩代わり、データベースの透過的暗号化 |
| AWS Secrets Manager | データベースのパスワードや API キーを保管し、自動でローテーションする | アプリケーションの認証情報の管理 |
| AWS Systems Manager Parameter Store | 設定値や秘密情報を階層的に保管する | 設定値、接続先、暗号化した文字列（SecureString） |
| AWS Certificate Manager（ACM） | SSL/TLS 証明書を発行し、自動で更新する | ELB、CloudFront、API Gateway の HTTPS |

## KMS と CloudHSM

| 観点 | AWS KMS | AWS CloudHSM |
|---|---|---|
| HSM | AWS が管理する、複数の利用者で共有するサービス | 自分の VPC にある、1 つの利用者専用の HSM |
| 鍵の管理 | AWS が運用し、利用者はキーポリシーと IAM で利用を制御する | 利用者が HSM のユーザーと鍵を管理する。AWS は鍵にアクセスできない |
| AWS のサービスとの連携 | 多くのサービスと連携している | 主にアプリケーションから標準の API（PKCS #11 など）で使う。KMS のカスタムキーストアとして使うこともできる |
| 運用の手間 | 少ない | 多い（クラスターの構成、ユーザーの管理、可用性の設計） |

KMS の鍵には、AWS が自分のサービスのために持つ AWS 所有のキー、サービスが利用者のアカウントに作る AWS マネージドキー、利用者が作って管理するカスタマーマネージドキーがあります。キーポリシーやローテーションを自分で決めたいなら、カスタマーマネージドキーです。

## Secrets Manager と Parameter Store

| 観点 | AWS Secrets Manager | Parameter Store |
|---|---|---|
| 主な用途 | 秘密情報（パスワード、API キー） | 設定値と秘密情報 |
| 自動ローテーション | 組み込みの機能がある（RDS などのデータベースの認証情報に対応） | 組み込みの機能はない |
| 別のリージョンへの複製 | できる | — |
| 料金 | 秘密情報の数と API の呼び出しに応じてかかる | 標準のパラメータは追加料金なし |

## S3 の保存時の暗号化

| 方式 | 鍵を管理するもの | 特徴 |
|---|---|---|
| SSE-S3 | Amazon S3 | 既定の暗号化。設定や管理の手間がない |
| SSE-KMS | AWS KMS | キーポリシーでアクセスを制御でき、鍵の利用が AWS CloudTrail に記録される。S3 バケットキーで KMS へのリクエストの料金を減らせる |
| DSSE-KMS | AWS KMS | 2 層で暗号化する。規制で多層の暗号化が求められる場合 |
| SSE-C | 利用者（リクエストごとに鍵を渡す） | 鍵を AWS に保管したくない場合 |
| クライアント側の暗号化 | 利用者 | S3 に送る前にアプリケーションで暗号化する |

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| 鍵の利用を監査したい、鍵へのアクセスを細かく制御したい | KMS のカスタマーマネージドキー（S3 なら SSE-KMS） |
| 「シングルテナントの HSM」「鍵を AWS にも触らせない」が規制の要件 | AWS CloudHSM |
| データベースのパスワードを、コードに書かずに、自動でローテーションしたい | AWS Secrets Manager |
| アプリケーションの設定値を、追加の料金をかけずに一元管理したい | Parameter Store |
| ALB や CloudFront で、証明書の更新の手間なく HTTPS を使いたい | ACM |
| S3 への通信を HTTPS だけに限りたい | バケットポリシーで `aws:SecureTransport` が false のリクエストを拒否する |

> **試験のポイント**
> 「パスワードの自動ローテーション」とあれば Secrets Manager です。Parameter Store には組み込みのローテーションがありません。

> **試験のポイント**
> 「暗号化されていない既存の EBS ボリュームや RDS の DB インスタンスを暗号化したい」は、スナップショットを取り、暗号化を指定してコピーし、そこから復元します。既存のものを直接暗号化に切り替えることはできません。

## ひっかけ注意

> **ひっかけ注意**
> CloudHSM は鍵を完全に自分で管理できますが、運用の手間が大きくなります。「運用上のオーバーヘッドを最小に」と書かれていて、専用の HSM が要件でないなら KMS です。

> **ひっかけ注意**
> KMS の鍵はリージョンごとのリソースです。別のリージョンで同じ鍵を使いたい場合は、マルチリージョンキーを使います。

> **ひっかけ注意**
> CloudFront で使う ACM の証明書は、米国東部（バージニア北部）リージョンで発行します。ALB で使う証明書は、ALB と同じリージョンで発行します。

## 出典

- [AWS KMS デベロッパーガイド](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html)
- [AWS CloudHSM ユーザーガイド](https://docs.aws.amazon.com/cloudhsm/latest/userguide/introduction.html)
- [AWS Secrets Manager ユーザーガイド](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- [AWS Certificate Manager ユーザーガイド](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html)
- [Amazon S3 のサーバー側の暗号化](https://docs.aws.amazon.com/AmazonS3/latest/userguide/serv-side-encryption.html)
