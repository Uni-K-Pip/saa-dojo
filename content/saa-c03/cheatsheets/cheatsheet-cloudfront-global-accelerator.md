---
id: cheatsheet-cloudfront-global-accelerator
title: CloudFront と Global Accelerator の違い
order: 50
taskStatements:
  - "2.1"
  - "3.4"
  - "4.4"
services:
  - Amazon CloudFront
  - AWS Global Accelerator
  - Amazon Route 53
  - Elastic Load Balancing
  - AWS WAF
  - AWS Shield
createdBy: x
---

どちらも AWS のエッジロケーションと世界規模のネットワークを使って、遠くの利用者への通信を速くするサービスです。違いは「コンテンツをキャッシュするか」と「どんな通信を運ぶか」です。

## 一言でいうと

| サービス | 一言でいうと |
|---|---|
| Amazon CloudFront | コンテンツをエッジロケーションにキャッシュして配信する CDN（HTTP・HTTPS） |
| AWS Global Accelerator | 2 つの固定のエニーキャスト IP アドレスで受けた TCP・UDP の通信を、AWS のネットワーク経由で最適なリージョンのエンドポイントへ運ぶ |

## 比較表

| 観点 | Amazon CloudFront | AWS Global Accelerator |
|---|---|---|
| キャッシュ | する（静的なコンテンツに強い。動的なコンテンツの配信も速くできる） | しない（毎回エンドポイントまで届ける） |
| プロトコル | HTTP・HTTPS（WebSocket を含む） | TCP・UDP |
| 入口 | ディストリビューションのドメイン名（DNS） | 固定の IP アドレス 2 つ（エニーキャスト） |
| 送り先 | オリジン（Amazon S3、ALB、EC2、オンプレミスを含む任意の HTTP サーバー） | エンドポイント（ALB、NLB、EC2 インスタンス、Elastic IP アドレス） |
| 障害時の切り替え | オリジンフェイルオーバー（オリジングループ） | ヘルスチェックで、正常なエンドポイントやリージョンへすぐ切り替える |
| セキュリティ | AWS WAF、AWS Shield、署名付き URL・署名付き Cookie、地域による制限、オリジンアクセスコントロール（OAC） | AWS Shield。エンドポイントの手前で通信を受ける |
| 向いている用途 | Web サイト、画像・動画の配信、API の高速化 | ゲーム、IoT、音声通話（UDP）、固定 IP が必要な通信、複数リージョンへの素早いフェイルオーバー |

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| 世界中の利用者に、静的なコンテンツ（画像、動画、JavaScript）を低レイテンシーで届けたい | Amazon CloudFront |
| S3 バケットを公開せずに、CloudFront 経由でだけ配信したい | CloudFront とオリジンアクセスコントロール（OAC） |
| 有料コンテンツを、認証した利用者だけに配信したい | CloudFront の署名付き URL・署名付き Cookie |
| UDP を使うゲームや音声の通信を速く、安定させたい | AWS Global Accelerator |
| 取引先のファイアウォールに登録するため、固定の IP アドレスが必要 | AWS Global Accelerator（または NLB の Elastic IP アドレス） |
| 複数のリージョンのアプリケーションに、DNS のキャッシュに左右されずに素早く切り替えたい | AWS Global Accelerator |
| リージョンへの振り分けを DNS で決めたい（レイテンシー、地域） | Amazon Route 53 のルーティングポリシー |

> **試験のポイント**
> 「キャッシュ」「静的コンテンツ」「エッジでの配信」とあれば CloudFront、「固定 IP アドレス」「TCP・UDP」「非 HTTP」「すぐにフェイルオーバー」とあれば Global Accelerator です。

> **試験のポイント**
> CloudFront で S3 のコンテンツを配信するときは、OAC を使い、バケットポリシーで CloudFront からのアクセスだけを許します。利用者が S3 の URL に直接アクセスするのを防げます。

## ひっかけ注意

> **ひっかけ注意**
> Global Accelerator はコンテンツをキャッシュしません。「オリジンの負荷を下げたい」「同じ画像を何度も配信する」なら CloudFront です。

> **ひっかけ注意**
> Route 53 のフェイルオーバーは DNS で切り替えるため、利用者側の DNS のキャッシュ（TTL）が切れるまで古い送り先に通信が向かうことがあります。IP アドレスを変えずに切り替えたいなら Global Accelerator です。

> **ひっかけ注意**
> CloudFront で独自のドメイン名の HTTPS を使うとき、AWS Certificate Manager（ACM）の証明書は米国東部（バージニア北部）リージョンで発行したものを使います。

## 出典

- [Amazon CloudFront デベロッパーガイド](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html)
- [AWS Global Accelerator デベロッパーガイド](https://docs.aws.amazon.com/global-accelerator/latest/dg/what-is-global-accelerator.html)
- [AWS Global Accelerator のよくある質問](https://aws.amazon.com/global-accelerator/faqs/)
