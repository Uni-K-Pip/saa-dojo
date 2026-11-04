---
id: cheatsheet-hybrid-connectivity
title: VPN・Direct Connect・Transit Gateway・VPC ピアリングの使い分け
order: 110
taskStatements:
  - "1.2"
  - "3.4"
  - "4.4"
services:
  - AWS Site-to-Site VPN
  - AWS Direct Connect
  - AWS Client VPN
  - AWS Transit Gateway
  - Amazon VPC
  - AWS PrivateLink
  - AWS Resource Access Manager
createdBy: x
---

ネットワークの接続は、「何と何をつなぐか（オンプレミスと VPC、VPC どうし、利用者の端末と VPC）」と、「性能・暗号化・準備にかけられる時間・コスト」の要件で選びます。

## オンプレミスと AWS をつなぐ

| 観点 | AWS Site-to-Site VPN | AWS Direct Connect |
|---|---|---|
| 経路 | インターネット上の IPsec の暗号化トンネル | 専用の物理回線（Direct Connect ロケーション経由） |
| 暗号化 | IPsec で暗号化される | 既定では暗号化されない。MACsec（対応する専用接続）か、Direct Connect の上に VPN を張って暗号化する |
| 性能 | インターネットの状況で変わる | 帯域が大きく、レイテンシーが安定している |
| 準備の時間 | すぐに作れる | 回線の手配に時間がかかる（数週間かかることがある） |
| 冗長性 | 1 つの接続に 2 本のトンネルがある | 1 本の回線は単一障害点。複数の回線・複数のロケーションで冗長化する |
| コスト | 安い | 高いが、AWS からのデータ送信の単価は低い |
| AWS 側の接続先 | 仮想プライベートゲートウェイか、AWS Transit Gateway | 仮想インターフェイスを通して、仮想プライベートゲートウェイ、Direct Connect ゲートウェイ、Transit Gateway へ |

Direct Connect の仮想インターフェイスには、VPC に接続するプライベート仮想インターフェイス、Transit Gateway に接続するトランジット仮想インターフェイス、Amazon S3 などの AWS のパブリックなサービスに接続するパブリック仮想インターフェイスがあります。

## VPC どうしをつなぐ

| 観点 | VPC ピアリング | AWS Transit Gateway | AWS PrivateLink |
|---|---|---|---|
| つなぎ方 | 2 つの VPC を 1 対 1 でつなぐ | 多数の VPC とオンプレミスを、中央のハブでつなぐ | 1 つのサービスだけを、ほかの VPC に公開する |
| 推移的な経路 | ない（A–B、B–C をつないでも A と C は通信できない） | ある（ハブを通して通信できる） | 利用する側から公開する側への一方向だけ |
| CIDR の重なり | 重なっていると接続できない | 重なっている VPC どうしは通信させられない | 重なっていても使える |
| 料金 | 時間料金なし。AZ をまたぐ通信は転送料金がかかる | アタッチメントの時間料金と、データ処理料金 | エンドポイントの時間料金と、データ処理料金 |
| 向いている規模 | 少数の VPC | 数十〜数千の VPC | サービスの提供者と利用者 |

## 利用者の端末をつなぐ

AWS Client VPN は、在宅勤務の社員などの端末から、VPC やオンプレミスのネットワークに接続するマネージドなリモートアクセス VPN です。Site-to-Site VPN は拠点のネットワークどうしを、Client VPN は個々の端末をつなぎます。

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| すぐに、安く、暗号化してオンプレミスとつなぎたい | Site-to-Site VPN |
| 大量のデータを、安定した帯域とレイテンシーで送りたい | Direct Connect |
| Direct Connect の通信を暗号化したい | MACsec か、Direct Connect の上の Site-to-Site VPN |
| Direct Connect の障害に安く備えたい | バックアップとして Site-to-Site VPN を用意する |
| Direct Connect を最も高い可用性にしたい | 2 つのロケーションに、それぞれ複数の接続を用意する |
| 1 本の Direct Connect から、複数のリージョンの VPC に接続したい | Direct Connect ゲートウェイ |
| 多数の VPC とオンプレミスを、管理しやすくつなぎたい | Transit Gateway（アカウントをまたぐなら AWS Resource Access Manager で共有） |
| 2 つの VPC だけを、低コストでつなぎたい | VPC ピアリング |
| 社員の PC から VPC 内のリソースに接続したい | Client VPN |

> **試験のポイント**
> 「数日以内に接続したい」なら Direct Connect は間に合わないので Site-to-Site VPN です。「一貫したネットワーク性能」「専用線」なら Direct Connect です。

> **試験のポイント**
> 「VPC の数が増えて、ピアリングの管理が複雑になった」は Transit Gateway に置き換える典型です。VPC ピアリングは VPC の組み合わせの数だけ接続が必要になります。

## ひっかけ注意

> **ひっかけ注意**
> VPC ピアリングは推移的ではありません。A と B、B と C をピアリングしても、A から C へは通信できません。また、B のインターネットゲートウェイや NAT ゲートウェイ、VPN 接続を A から借りることもできません。

> **ひっかけ注意**
> Direct Connect は専用回線ですが、それだけでは通信は暗号化されません。「転送中のデータの暗号化」が要件なら、暗号化の方法を組み合わせます。

## 出典

- [AWS Site-to-Site VPN ユーザーガイド](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html)
- [AWS Direct Connect ユーザーガイド](https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html)
- [AWS Transit Gateway ガイド](https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html)
- [VPC ピアリングガイド](https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html)
- [AWS Client VPN 管理者ガイド](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/what-is.html)
- [ネットワーク間接続のオプション（ホワイトペーパー）](https://docs.aws.amazon.com/whitepapers/latest/aws-vpc-connectivity-options/introduction.html)
