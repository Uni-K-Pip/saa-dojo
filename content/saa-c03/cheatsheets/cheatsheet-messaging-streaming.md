---
id: cheatsheet-messaging-streaming
title: SQS・SNS・EventBridge・Kinesis の使い分け
order: 10
taskStatements:
  - "2.1"
  - "3.5"
services:
  - Amazon SQS
  - Amazon SNS
  - Amazon EventBridge
  - Amazon Kinesis Data Streams
  - Amazon Data Firehose
  - Amazon MQ
  - AWS Step Functions
  - Amazon MSK
createdBy: x
---

システムを疎結合にするサービスは、メッセージを「1 つの処理に渡す」のか、「多数に配る」のか、「イベントの内容で振り分ける」のか、「流れ続けるデータを順番に何度も読む」のかで選びます。

## 一言でいうと

| サービス | 一言でいうと | 受け取り方 | 典型的な用途 |
|---|---|---|---|
| Amazon SQS | メッセージをためておくキュー | 受信側が取りに行く（プル） | 処理の待ち行列、急な負荷の吸収、処理の分離 |
| Amazon SNS | 1 つのメッセージを多数に配るトピック | 送り先へ届ける（プッシュ） | ファンアウト、メールや SMS での通知 |
| Amazon EventBridge | イベントを内容で振り分けるイベントバス | ルールに合った送り先へ届ける（プッシュ） | AWS のサービスや SaaS のイベントへの反応、スケジュール実行 |
| Amazon Kinesis Data Streams | 順番に並んだデータの流れを保存するストリーム | 複数の受信側がそれぞれ読む | リアルタイムの分析、クリックストリーム、ログの収集 |
| Amazon Data Firehose（旧称 Amazon Kinesis Data Firehose） | ストリームのデータを保存先へ届ける | 自動で配信する | Amazon S3、Amazon Redshift、Amazon OpenSearch Service への取り込み |
| Amazon MQ | Apache ActiveMQ と RabbitMQ のマネージドなブローカー | プロトコルによる | 既存のメッセージングを使うアプリケーションの移行 |

## 比較表

| 観点 | SQS 標準キュー | SQS FIFO キュー | SNS | EventBridge | Kinesis Data Streams |
|---|---|---|---|---|---|
| 届く相手 | 1 つの受信側が処理して削除 | 1 つの受信側が処理して削除 | すべてのサブスクライバー | ルールに合ったターゲット（1 ルールに 5 つまで） | 複数の受信側がそれぞれ読む |
| 順序 | ベストエフォート（入れ替わることがある） | メッセージグループ内で保証 | FIFO トピックなら保証 | 保証しない | シャード内（同じパーティションキー）で保証 |
| 重複 | まれに重複して届く（少なくとも 1 回） | 重複を排除する | FIFO トピックなら排除 | 少なくとも 1 回 | 受信側で考慮が必要 |
| データの保存 | 1 分〜14 日（既定 4 日） | 1 分〜14 日（既定 4 日） | 基本は届けたら終わり | アーカイブと再生の機能あり | 24 時間（既定）〜365 日 |
| 読み直し | できない（処理したら削除） | できない | — | アーカイブから再生 | 保存期間内なら何度でも |
| スループット | ほぼ無制限 | 1 秒あたり 300 件（API ごと、バッチで 3,000 件。高スループットモードでさらに増やせる） | 非常に高い | 非常に高い | オンデマンドは自動で増減。プロビジョンドはシャード 1 つで書き込み 1 MB/秒 |

SQS のメッセージは最大 1 MiB です。可視性タイムアウト（受信したメッセージをほかの受信側から隠しておく時間）は既定 30 秒・最大 12 時間、配信を遅らせる遅延キューは最大 15 分です。

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| 処理を分離したい、急に増えるリクエストを取りこぼさず順に処理したい | SQS 標準キュー |
| 注文の順序を守りたい、二重に処理したくない | SQS FIFO キュー |
| 1 つのイベントを複数のシステムに同時に届けたい（ファンアウト） | SNS のトピックに複数の SQS キューをサブスクライブ |
| AWS のサービスや SaaS のイベントを、内容で振り分けたい | EventBridge のルール |
| 決まった時刻や間隔で処理を起動したい | EventBridge Scheduler（EventBridge のスケジュール） |
| 大量のデータをリアルタイムに、複数のアプリケーションで読みたい。読み直したい | Kinesis Data Streams |
| ストリームのデータを、コードを書かずに S3 や Redshift に保存したい | Amazon Data Firehose |
| JMS や AMQP、MQTT を使う既存のアプリケーションを、変更を少なく移したい | Amazon MQ |
| Apache Kafka を使い続けたい | Amazon MSK |
| 複数の手順を順番に実行し、失敗時の再試行や分岐を管理したい | AWS Step Functions |

> **試験のポイント**
> 「疎結合」「負荷の急増を吸収」「処理が追いつかなくてもリクエストを失わない」は SQS の典型です。受信側の Amazon EC2 Auto Scaling は、キューにたまったメッセージ数をもとに増減させます。

> **試験のポイント**
> 「1 つのメッセージを複数の処理に届け、それぞれが自分のペースで処理する」は、SNS と SQS を組み合わせたファンアウトです。SNS だけでは、受信側が止まっている間のメッセージをためておけません。

> **試験のポイント**
> 「リアルタイム」「複数の受信側」「読み直し」なら Kinesis Data Streams、「ほぼリアルタイムで S3 などに保存」「運用負荷を最小に」なら Amazon Data Firehose です。Firehose はデータをいったんバッファにためてから届けるため、ミリ秒単位の処理には向きません。

## ひっかけ注意

> **ひっかけ注意**
> SQS 標準キューは、まれに同じメッセージを 2 回届け、順序も入れ替わることがあります。順序と重複排除が要件なら FIFO キューです。既存の標準キューを FIFO キューに変えることはできず、新しく作ります（名前は `.fifo` で終わる）。

> **ひっかけ注意**
> 処理に時間がかかるのに可視性タイムアウトが短いと、処理中のメッセージがほかの受信側にも見えて、二重に処理されます。可視性タイムアウトは処理時間より長くします。AWS Lambda で SQS を処理するときは、関数のタイムアウトの 6 倍以上が推奨されています。

> **ひっかけ注意**
> 何度も処理に失敗するメッセージは、デッドレターキュー（DLQ）に移して調べます。失敗し続けるメッセージがキューに残り続けると、ほかのメッセージの処理を妨げます。

## 出典

- [Amazon SQS デベロッパーガイド](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
- [Amazon SQS のメッセージのクォータ](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html)
- [Amazon SNS デベロッパーガイド](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)
- [Amazon EventBridge ユーザーガイド](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)
- [Amazon Kinesis Data Streams のクォータと制限](https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html)
- [Amazon Data Firehose デベロッパーガイド](https://docs.aws.amazon.com/firehose/latest/dev/what-is-this-service.html)
