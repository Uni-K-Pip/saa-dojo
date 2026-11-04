---
id: cheatsheet-vpc-endpoints
title: VPC エンドポイント（ゲートウェイ型とインターフェイス型）
order: 60
taskStatements:
  - "1.2"
  - "3.4"
  - "4.4"
services:
  - VPC endpoints
  - AWS PrivateLink
  - Amazon VPC
  - NAT gateway
  - Amazon S3
  - Amazon DynamoDB
  - Elastic Load Balancing
createdBy: x
---

VPC エンドポイントを使うと、VPC の中のリソースが、インターネットゲートウェイや NAT ゲートウェイを通らずに、AWS のサービスへプライベートに接続できます。種類によって、対応するサービス、料金、オンプレミスから使えるかが違います。

## 比較表

| 観点 | ゲートウェイ型エンドポイント | インターフェイス型エンドポイント（AWS PrivateLink） |
|---|---|---|
| 対応するサービス | Amazon S3 と Amazon DynamoDB だけ | 多くの AWS のサービス、他社や自社のエンドポイントサービス（S3 と DynamoDB を含む） |
| しくみ | ルートテーブルに、サービス宛ての経路（プレフィックスリスト）を追加する | サブネットにプライベート IP アドレスを持つネットワークインターフェイス（ENI）を作る |
| 料金 | かからない | エンドポイントの時間料金と、処理したデータ量の料金 |
| アクセスの制御 | エンドポイントポリシー | エンドポイントポリシーとセキュリティグループ |
| オンプレミスからの利用（AWS Direct Connect・AWS Site-to-Site VPN 経由） | できない | できる |
| ピアリングした別の VPC からの利用 | できない | できる |
| DNS | サービスの通常の名前のまま使える | プライベート DNS を有効にすると、サービスの通常の名前がエンドポイントのプライベート IP アドレスに解決される |

このほか、通信を他社のファイアウォールなどのアプライアンスに通す、Gateway Load Balancer エンドポイントがあります。

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| プライベートサブネットの EC2 から S3 や DynamoDB へ、追加料金なしでプライベートに接続したい | ゲートウェイ型エンドポイント |
| NAT ゲートウェイを通る S3 への大量の通信の料金を下げたい | S3 のゲートウェイ型エンドポイント（NAT ゲートウェイのデータ処理料金がかからなくなる） |
| オンプレミスから Direct Connect 経由で S3 にプライベートに接続したい | S3 のインターフェイス型エンドポイント |
| プライベートサブネットから AWS Systems Manager、AWS Secrets Manager、Amazon SQS などの API を呼びたい | インターフェイス型エンドポイント |
| 自社のサービスを、ほかの VPC やアカウントにプライベートに公開したい（CIDR が重なっていてもよい） | AWS PrivateLink のエンドポイントサービス（Network Load Balancer の後ろにサービスを置く） |

## アクセスを絞る方法

- **エンドポイントポリシー**: エンドポイントを通して使えるサービスの操作やリソースを絞ります。例: 自社のバケットだけにアクセスを許す。
- **バケットポリシーの条件**: `aws:SourceVpce`（特定の VPC エンドポイント）や `aws:SourceVpc`（特定の VPC）を条件にして、そこからのアクセスだけを許します。
- **セキュリティグループ**: インターフェイス型エンドポイントの ENI に設定して、接続してよい送信元を絞ります。

> **試験のポイント**
> 「インターネットを経由せずに S3 に接続」「最もコスト効率が高い」なら、S3 のゲートウェイ型エンドポイントです。「オンプレミスから」と書かれていたら、ゲートウェイ型は使えないので、インターフェイス型を選びます。

> **試験のポイント**
> 「S3 バケットを、特定の VPC からしかアクセスできないようにしたい」は、VPC エンドポイントを作ることと、バケットポリシーで `aws:SourceVpce` を条件にすることの組み合わせです。

## ひっかけ注意

> **ひっかけ注意**
> ゲートウェイ型エンドポイントは、作った VPC の中からしか使えません。オンプレミス、ピアリングした VPC、AWS Transit Gateway の先からは使えません。

> **ひっかけ注意**
> ゲートウェイ型エンドポイントで接続できるのは、同じリージョンの S3 と DynamoDB だけです。別のリージョンのバケットにアクセスする通信には使えません。

> **ひっかけ注意**
> VPC ピアリングで VPC どうしをつなぐと、CIDR が重なっていると接続できません。サービスを 1 つだけ公開したいなら、CIDR が重なっていても使える AWS PrivateLink が向いています。

## 出典

- [AWS PrivateLink ガイド: VPC エンドポイントの概念](https://docs.aws.amazon.com/vpc/latest/privatelink/concepts.html)
- [ゲートウェイエンドポイント](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)
- [インターフェイス VPC エンドポイントを使用して AWS のサービスにアクセスする](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html)
- [AWS PrivateLink の料金](https://aws.amazon.com/privatelink/pricing/)
