---
id: lesson-3.5-transfer-and-transform
title: データ転送とデータ変換
domain: 3
taskStatement: "3.5"
order: 52
knowledgeRefs:
  - 3.5-K3
  - 3.5-K4
  - 3.5-K6
  - 3.5-S3
  - 3.5-S5
  - 3.5-S7
services:
  - AWS DataSync
  - AWS Storage Gateway
  - AWS Glue
  - Amazon EMR
  - AWS Snow Family
estimatedMinutes: 15
createdBy: w2a
---

オンプレミスのデータを AWS へ運ぶ「転送」と、分析しやすい形に整える「変換」は、データ基盤づくりの前半の作業です。このレッスンでは、AWS DataSync と AWS Storage Gateway の使い分け、AWS Glue と Amazon EMR の使い分けを学びます。

## 基礎

### 転送サービスの役割

| サービス | 役割 |
|---|---|
| AWS DataSync | オンプレミスや他のクラウドと AWS のストレージの間のデータ転送を、自動化・高速化する |
| AWS Storage Gateway | オンプレミスのアプリケーションが、AWS のストレージをファイル／ボリューム／テープとして使い続ける |
| AWS Transfer Family | SFTP／FTPS／FTP で S3 や EFS にファイルを転送する |
| AWS Snow Family | 大容量データを専用の物理デバイスで運ぶ |
| Amazon AppFlow | Salesforce などの SaaS と AWS サービスの間で、コードを書かずにデータを転送する |

> AWS Snowball Edge は 2025 年 11 月から新規のお客様の受け付けが止まっています。新しい設計では、ネットワーク経由の転送を基本に考えます。

### AWS DataSync

- オンプレミスの NFS／SMB／HDFS、他のクラウドのストレージから、S3、EFS、FSx へ転送します。
- 設定で **スケジュール実行、帯域制限、フィルター、転送データの整合性の検証** ができ、2 回目以降は変更分だけを転送します。
- オンプレミスにエージェントを置きます。経路はインターネット、Direct Connect、VPC エンドポイントから選べます。

### AWS Storage Gateway の種類

| ゲートウェイ | 見え方 | 保存先 |
|---|---|---|
| S3 File Gateway | NFS／SMB の共有 | S3 のオブジェクト |
| FSx File Gateway | SMB の共有 | Amazon FSx for Windows File Server |
| ボリュームゲートウェイ | iSCSI のブロック | S3 上のボリューム（スナップショットは EBS スナップショット） |
| テープゲートウェイ | 仮想テープライブラリー | S3、S3 Glacier |

頻繁に読むデータはゲートウェイのローカルキャッシュに置かれます。

## 使い分け

### DataSync と Storage Gateway

- **移行・定期的な同期**（一括転送、スケジュール、帯域制限）→ DataSync
- **アプリケーションが引き続き NFS／SMB／iSCSI／テープとして AWS を使う**（ローカルキャッシュあり）→ Storage Gateway

### Glue と EMR

| 観点 | AWS Glue | Amazon EMR |
|---|---|---|
| 形態 | サーバーレスの ETL | マネージドなクラスター（Spark、Hive、Presto など） |
| 運用 | クラスターの管理なし | クラスターの構成を細かく制御できる |
| 向く用途 | 定期的な変換、スキーマの登録、Parquet への変換 | 独自の Hadoop 設定、独自ソフトの導入、幅広いフレームワーク |

運用負荷を減らしたいなら Glue、クラスターレベルのカスタマイズが必要なら EMR です。

## 設計パターン

### 形式の変換

CSV や JSON は、列指向の **Parquet** や **ORC** に変換すると、Athena などのスキャン量が減り、速く安くなります。Glue のクローラーでスキーマを Data Catalog に登録し、ETL ジョブで変換して、日付でパーティション分割して S3 に書き出すのが定番です。Firehose の形式変換機能でも、JSON を Parquet や ORC に変換できます。

### EMR のコスト削減

- ジョブの間だけ起動する **一時的（transient）クラスター**
- データは HDFS ではなく **S3（EMRFS）** に置き、クラスターを終了してもデータを残す
- 中断されてもよいタスクノードに **Spot インスタンス** を使う（マスター／コアノードはオンデマンド）

## 試験のポイント

> **試験のポイント**
> 「大量データを AWS へ移行、スケジュール、帯域制限、整合性の検証、スクリプトを書きたくない」は DataSync です。

> **試験のポイント**
> 「アプリケーションを変えずに NFS／SMB のまま S3 へ」は S3 File Gateway です。

> **試験のポイント**
> 「サーバーレスの ETL」「スキーマの自動登録」は Glue、「Hadoop／Spark の細かい設定とカスタマイズ」は EMR です。

## ひっかけ注意

> **ひっかけ注意**
> S3 File Gateway は一括移行のツールではありません。移行や定期同期には DataSync を選びます。

> **ひっかけ注意**
> ボリュームゲートウェイは iSCSI のブロックストレージで、ファイルを S3 のオブジェクトとして保存する NFS／SMB の用途には合いません。

> **ひっかけ注意**
> Lambda は実行時間（最大 15 分）とメモリに上限があり、大規模なデータの変換には向きません。

## 確認問題

- `saa-3.5-w2a-005`: NFS の大量データを S3 に移行して同期する方法を選ぶ問題
- `saa-3.5-w2a-006`: NFS のまま S3 に保存するゲートウェイを選ぶ問題
- `saa-3.5-w2a-007`: CSV を Parquet に変換する夜間バッチの方法を選ぶ問題
- `saa-3.5-w2a-010`: Spark／Hive の夜間処理を低コストで実行する構成を選ぶ問題
- `saa-3.5-w2a-016`: 物理テープの代わりにバックアップソフトを使い続ける方法を選ぶ問題
- `saa-3.5-w2a-018`: SaaS のデータをコードなしで S3 に取り込む問題
- `saa-3.5-w2a-019`: パートナーの SFTP アップロードを受ける方法を選ぶ問題
