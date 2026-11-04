---
id: lesson-1.2-app-protection
title: アプリケーションの保護（認証情報・利用者の認証・WAF・Shield・検出サービス）
domain: 1
taskStatement: "1.2"
order: 30
knowledgeRefs:
  - 1.2-K1
  - 1.2-K4
  - 1.2-K5
  - 1.2-K6
  - 1.2-S3
services:
  - AWS Secrets Manager
  - AWS Systems Manager
  - Amazon Cognito
  - Elastic Load Balancing
  - AWS IAM Identity Center
  - AWS WAF
  - AWS Shield
  - AWS Firewall Manager
  - Amazon GuardDuty
  - Amazon Macie
  - Amazon Inspector
  - Amazon Detective
  - AWS Security Hub
estimatedMinutes: 20
createdBy: g2
---

アプリケーションを守るには、ネットワークの設計に加えて「秘密の情報をどう扱うか」「利用者をどう確かめるか」「外からの攻撃をどう防ぐか」「異常にどう気づくか」を考える必要があります。このレッスンでは、それぞれに使う AWS のサービスと、その選び方を学びます。

## 基礎

### 認証情報を安全に扱う

パスワードやアクセスキーを、ソースコード、設定ファイル、EC2 のユーザーデータに書くのは避けます。リポジトリから漏れたり、インスタンスにアクセスできる人に読まれたりするためです。

- **AWS の API を呼ぶ権限**: IAM ロールで渡します。EC2 ならインスタンスプロファイル、AWS Lambda なら実行ロールを使うと、一時的な認証情報が自動で配られ、更新もされます。
- **データベースのパスワードや外部サービスの API キー**: AWS Secrets Manager に保存し、アプリケーションが実行時に取得します。

| 項目 | AWS Secrets Manager | AWS Systems Manager Parameter Store |
|---|---|---|
| 主な用途 | データベースの認証情報、API キーなどのシークレット | 設定値（エンドポイントの URL、AMI の ID など） |
| 暗号化 | AWS KMS で暗号化 | SecureString を選ぶと AWS KMS で暗号化 |
| 自動ローテーション | あり（RDS などとの連携機能あり） | なし |
| 料金 | シークレットごとの月額と API 呼び出しの料金 | 標準パラメータは追加料金なし |

### 利用者を確かめる

| 仕組み | 役割 |
|---|---|
| Amazon Cognito ユーザープール | アプリケーションの利用者のサインアップ・サインインを受け持つユーザーディレクトリ。外部の ID プロバイダー（SAML・OIDC・ソーシャル）との連携もできる |
| Amazon Cognito ID プール | IdP などのトークンを一時的な AWS 認証情報に交換し、アプリケーションから S3 などを直接呼び出せるようにする |
| ALB の認証アクション | HTTPS リスナーで、OIDC 準拠の IdP か Cognito ユーザープールによるサインインを必須にする。アプリケーションのコードは変更不要 |
| AWS IAM Identity Center | 従業員が、既存の ID プロバイダーのアカウントで複数の AWS アカウントやアプリケーションにシングルサインオンする |

### 外からの脅威と AWS WAF・AWS Shield

| 脅威 | 主な対策 |
|---|---|
| ネットワーク層・トランスポート層の DDoS 攻撃（SYN フラッドなど） | AWS Shield Standard（自動・追加料金なし） |
| HTTP リクエストのフラッド攻撃 | AWS WAF のレートベースのルール、Anti-DDoS マネージドルールグループ |
| SQL インジェクション、クロスサイトスクリプティング | AWS WAF のマネージドルールグループや検査用のルール |

AWS WAF は、HTTP リクエストのヘッダーや本文などをルールで検査して、許可・ブロック・カウントなどを決める Web アプリケーションファイアウォールです。ルールをまとめた「ウェブ ACL」を、Amazon CloudFront、Application Load Balancer、Amazon API Gateway の REST API、AWS AppSync、Amazon Cognito ユーザープールなどに関連付けて使います。

AWS Shield Advanced は有料の DDoS 対策で、保護対象のリソースについて、Shield Response Team（SRT）の支援、DDoS 攻撃による料金の急増の補填（コスト保護）などを追加します。SRT の利用にはビジネスサポートかエンタープライズサポートの契約が必要です。

### 異常に気づくサービス

| サービス | 見つけるもの |
|---|---|
| Amazon GuardDuty | CloudTrail、VPC フローログ、DNS ログなどを分析し、不審な通信や認証情報の悪用などの脅威を検出する |
| Amazon Macie | S3 バケットの中の個人情報などの機密データ |
| Amazon Inspector | EC2、コンテナイメージ、Lambda 関数のソフトウェアの脆弱性と、意図しないネットワークへの露出 |
| Amazon Detective | 検出結果をきっかけにした調査と根本原因の特定を助ける |
| AWS Security Hub | 各サービスの検出結果を集約・相関付けして優先順位を付ける（設定のチェックは Security Hub CSPM） |

## 使い分け

- 「シークレットを自動でローテーションする」→ Secrets Manager。「設定値を安く一元管理する」→ Parameter Store
- 「コードを変えずにサインインを必須にする」→ ALB の認証アクション。「モバイルアプリから S3 に直接アップロードさせる」→ Cognito ID プール
- 「SQL インジェクションを防ぐ」「特定の送信元からの大量のリクエストを止める」→ AWS WAF
- 「DDoS の専門チームの支援」「DDoS による料金の補填」→ Shield Advanced
- 「複数のアカウントに WAF や Shield Advanced の設定をまとめて適用する」→ AWS Firewall Manager

## 設計パターン

### 多層防御の Web アプリケーション

1. CloudFront と ALB に AWS WAF のウェブ ACL を関連付け、マネージドルールグループとレートベースのルールで攻撃を入り口で止めます。大きな DDoS 攻撃に備えるなら Shield Advanced で保護します。組織の複数のアカウントに同じ WAF や Shield Advanced の設定を適用するときは、Firewall Manager を使います。
2. 従業員向けのアプリケーションなら、ALB の認証アクションでサインインを必須にします。
3. アプリケーションは IAM ロールで Secrets Manager からデータベースの認証情報を取得します。
4. GuardDuty、Macie、Inspector を有効にし、検出結果を Security Hub に集めて対応の優先順位を決めます。

## 試験のポイント

> **試験のポイント**
> 「ハードコードされたパスワードをなくし、自動でローテーションする」は Secrets Manager です。Parameter Store にはローテーションの機能がありません。

> **試験のポイント**
> 「SQL インジェクション」「クロスサイトスクリプティング」「HTTP フラッド」はアプリケーション層の攻撃なので AWS WAF、「SRT」「コスト保護」は Shield Advanced です。

> **試験のポイント**
> 「S3 の個人情報を見つける」は Macie、「不審な通信や侵害されたインスタンスを検出する」は GuardDuty、「ソフトウェアの脆弱性」は Inspector です。

## ひっかけ注意

> **ひっかけ注意**
> Cognito ID プールは AWS の認証情報を発行する仕組みです。Web アプリケーションのサインイン画面を用意したいときは、ユーザープールか ALB の認証アクションを選びます。

> **ひっかけ注意**
> GuardDuty は検出のサービスで、通信を遮断しません。遮断が必要なら、AWS WAF やネットワーク ACL などの防御の仕組みと組み合わせます。

> **ひっかけ注意**
> セキュリティグループやネットワーク ACL は、IP アドレスやポートで判断するので、HTTP リクエストの中身（SQL インジェクションなど）は検査できません。

> **ひっかけ注意**
> HTTP フラッド対策の標準の方法は、2026 年 3 月から AWS WAF の Anti-DDoS マネージドルールグループになりました。Shield Advanced の従来のアプリケーション層の自動緩和機能は、これに置き換わっています。

## 確認問題

- `saa-1.2-g2-001`: データベースのパスワードを自動でローテーションする問題
- `saa-1.2-g2-004`: コードを変えずに社内の IdP でのサインインを必須にする問題
- `saa-1.2-g2-005`: 機密データの発見と脅威の検出に使うサービスを選ぶ問題
- `saa-1.2-g2-006`: SQL インジェクションと大量のリクエストを入り口で止める問題
- `saa-1.2-g2-009`: DDoS 対策の専門チームの支援と料金の補填を受ける問題
