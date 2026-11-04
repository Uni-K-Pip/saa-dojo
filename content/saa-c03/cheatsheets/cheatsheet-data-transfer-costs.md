---
id: cheatsheet-data-transfer-costs
title: データ転送料金の考え方
order: 100
taskStatements:
  - "4.4"
services:
  - Amazon VPC
  - NAT gateway
  - VPC endpoints
  - Amazon CloudFront
  - AWS Direct Connect
  - AWS Site-to-Site VPN
  - AWS Transit Gateway
  - Amazon S3
createdBy: x
---

AWS では、データが「どこからどこへ」流れるかで料金が変わります。具体的な単価はリージョンや時期で変わるので、ここでは試験で問われる「料金がかかるか」「どちらが安いか」の考え方をまとめます。

## 基本のルール

| 通信の向き | 料金 |
|---|---|
| インターネットから AWS への受信 | かからない |
| AWS からインターネットへの送信 | かかる（量に応じた段階制） |
| 同じ AZ の中の、プライベート IP アドレスどうしの通信（EC2、RDS、ElastiCache など） | かからない |
| 同じリージョンの別の AZ への通信 | かかる（送る側と受ける側の両方向） |
| 同じリージョンでも、パブリック IP アドレスや Elastic IP アドレス宛ての通信 | かかる |
| 別のリージョンへの通信 | かかる（送り出す側のリージョンで課金） |
| AWS のオリジン（S3、EC2、ALB など）から Amazon CloudFront への通信 | かからない |
| 同じリージョンの Amazon S3 と EC2 の間の通信 | かからない |

## 通信の経路にかかる料金

| 経路・サービス | 料金のかかり方 |
|---|---|
| NAT ゲートウェイ | 時間あたりの料金と、通ったデータ量に応じたデータ処理料金（データ転送料金とは別） |
| ゲートウェイ型 VPC エンドポイント（S3、DynamoDB） | かからない |
| インターフェイス型 VPC エンドポイント | AZ ごとの時間料金と、処理したデータ量の料金 |
| VPC ピアリング | 接続そのものの料金はない。AZ をまたぐ通信にはデータ転送料金がかかる |
| AWS Transit Gateway | アタッチメントごとの時間料金と、処理したデータ量の料金 |
| AWS Site-to-Site VPN | 接続ごとの時間料金と、AWS から送信したデータ量の料金 |
| AWS Direct Connect | ポートの時間料金と、AWS から送信したデータ量の料金（インターネット経由の送信より単価が低い） |

このほか、パブリック IPv4 アドレスには、使っているかどうかにかかわらず時間あたりの料金がかかります。

## コストを下げる設計

| よくある状況 | 安くする方法 |
|---|---|
| プライベートサブネットの EC2 から、NAT ゲートウェイ経由で S3 に大量のデータを送っている | S3 のゲートウェイ型エンドポイントを使い、NAT ゲートウェイを通さない |
| 世界中の利用者に、S3 や EC2 から直接ファイルを配信している | CloudFront を使い、キャッシュで送信量とオリジンへのアクセスを減らす |
| オンプレミスとの間で、毎月大量のデータを送受信している | AWS Direct Connect を使う |
| 別の AZ の NAT ゲートウェイを使っている | AZ ごとに作る NAT ゲートウェイなら、各 AZ に置いて同じ AZ のものを使う（可用性も上がる）。AZ をまたいで自動で広がるリージョン NAT ゲートウェイを使う方法もある |
| アプリケーションのサーバーとキャッシュの間で、AZ をまたぐ通信が多い | 可用性の要件を満たす範囲で、よく通信するものを同じ AZ に置く |

> **試験のポイント**
> 「NAT ゲートウェイの料金が高い」「S3 への通信」なら、まずゲートウェイ型エンドポイントを考えます。追加料金なしで、NAT ゲートウェイのデータ処理料金をなくせます。

> **試験のポイント**
> 「データ転送のコストを下げたい」「世界中の利用者」なら CloudFront です。AWS のオリジンから CloudFront への転送には料金がかからず、キャッシュされた分はオリジンからの送信も減ります。

## ひっかけ注意

> **ひっかけ注意**
> 高可用性のために複数の AZ に分けると、AZ 間のデータ転送料金がかかります。それでも「高可用性」が要件なら、AZ をまとめてはいけません。コストは要件を満たした上で比べます。

> **ひっかけ注意**
> 受信は無料でも、送信には料金がかかります。「オンプレミスへ毎日大量のデータを戻す」構成では、送信の料金が大きくなります。

> **ひっかけ注意**
> S3 Transfer Acceleration は、アップロードを速くするための機能で、追加の料金がかかります。コストを下げる目的では使いません。

> **ひっかけ注意**
> 古い教材では、回線が細いときの大量のデータの移行に、デバイスを送る AWS Snowball Edge を勧めています。しかし Snowball Edge は新規の顧客の受け付けを終了しており、商用リージョンでのサポートは 2026 年 12 月 31 日で終わります。新しく設計するなら、AWS DataSync などで回線を使って送る方法を考えます。

## 出典

- [Amazon EC2 オンデマンド料金（データ転送）](https://aws.amazon.com/ec2/pricing/on-demand/)
- [Amazon VPC の料金（NAT ゲートウェイなど）](https://aws.amazon.com/vpc/pricing/)
- [Amazon CloudFront の料金](https://aws.amazon.com/cloudfront/pricing/)
- [AWS Direct Connect の料金](https://aws.amazon.com/directconnect/pricing/)
- [一般的なアーキテクチャのデータ転送コストの概要（AWS ブログ）](https://aws.amazon.com/blogs/architecture/overview-of-data-transfer-costs-for-common-architectures/)
- [AWS Snowball Edge デベロッパーガイド（提供状況のお知らせ）](https://docs.aws.amazon.com/snowball/latest/developer-guide/whatisedge.html)
