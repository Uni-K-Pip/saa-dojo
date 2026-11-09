---
id: lesson-3.3-database-selection
title: データベースの種類・エンジン・配置の選び方
domain: 3
taskStatement: "3.3"
order: 30
knowledgeRefs:
  - 3.3-K1
  - 3.3-K6
  - 3.3-K8
  - 3.3-S2
  - 3.3-S3
  - 3.3-S4
services:
  - Amazon RDS
  - Amazon Aurora
  - Amazon Aurora Serverless
  - Amazon DynamoDB
  - Amazon Redshift
  - AWS Database Migration Service (AWS DMS)
  - AWS Schema Conversion Tool (AWS SCT)
estimatedMinutes: 15
createdBy: w2a
---

高性能なデータベースを選ぶ第一歩は、データの形とアクセスのパターンに合う「種類」と「エンジン」を決めることです。このレッスンでは、主なデータベースサービスの特徴、エンジンの選び方、リージョンをまたぐ配置、異種間の移行を学びます。

## 基礎

### データベースの種類

| 種類 | サービス | 得意なこと |
|---|---|---|
| リレーショナル | Amazon RDS、Amazon Aurora | テーブルと SQL、結合、トランザクション |
| キーバリュー／ドキュメント | Amazon DynamoDB | キーによる単純な読み書きを大規模に。1 桁ミリ秒 |
| データウェアハウス | Amazon Redshift | 大量データの集計・分析（列指向） |
| インメモリ | Amazon ElastiCache | キャッシュ、セッション、ランキング |
| グラフ | Amazon Neptune | つながりをたどる検索 |
| 時系列・ドキュメント・ワイドカラムなど | Timestream、DocumentDB、Keyspaces | 用途特化 |

### RDS と Aurora

- **Amazon RDS**: MySQL、PostgreSQL、MariaDB、Oracle、SQL Server、Db2 のマネージドサービス。
- **Amazon Aurora**: MySQL 互換と PostgreSQL 互換。ストレージが 3 つのアベイラビリティーゾーンに 6 つのコピーで保存され、自動で拡張される（最大 128 TiB）。リードレプリカ（Aurora レプリカ）は最大 15 台で、同じストレージを共有するのでレプリカラグが小さい。
- **Aurora Serverless v2**: 負荷に応じて Aurora キャパシティーユニット（ACU）が細かく自動で増減する。利用が変動するワークロード向け。

## 使い分け

### エンジンの選び方

| 状況 | 選択 |
|---|---|
| 既存のアプリケーションが MySQL／PostgreSQL | 同じ互換の RDS または Aurora（変更を最小限にできる） |
| PostGIS などの拡張機能が必要 | PostgreSQL 互換（RDS／Aurora PostgreSQL） |
| 商用エンジン（Oracle、SQL Server）のライセンス費用を減らしたい | Aurora などのオープンソース互換エンジンへ移行 |
| 最高の性能・スケーラビリティを RDB で | Aurora |

### グローバルな配置

| 要件 | 選択 |
|---|---|
| 複数のリージョンの両方で書き込み、低レイテンシー | DynamoDB グローバルテーブル（マルチリージョン、マルチアクティブ） |
| 別のリージョンに読み取り用のコピー、災害対策（RDB） | Aurora Global Database（書き込みはプライマリリージョンのみ、数秒以内のレプリケーション） |
| リージョン内の可用性 | マルチ AZ |

### 異種間の移行

エンジンが違う移行（例: Oracle → Aurora PostgreSQL）では、まず **AWS SCT** でスキーマとコードを変換し、**AWS DMS** でデータを移行します。DMS の全ロードに加えて、変更データキャプチャ（CDC）で継続的に同期し、切り替え時の停止時間を最小限にします。同種の移行は、ネイティブのツールや DMS で行えます。

### 分析用のデータ連携（zero-ETL）

Aurora や RDS のデータを Redshift で分析したいとき、ETL パイプラインを自分で作らなくても、**zero-ETL 統合**を使うと、ほぼリアルタイムにデータが Redshift へレプリケートされます。複数のクラスターのデータを 1 つの Redshift に集めて集計でき、トランザクション処理の性能にも影響しません。

## 設計パターン

- **変動が大きい負荷**: Aurora Serverless v2 や DynamoDB のオンデマンドモード。
- **分析用のデータ**: トランザクション用のデータベースから、Redshift（または S3＋Athena）へ移して分析クエリを分離する。
- **グローバルなゲーム・アプリ**: プレイヤーのデータを DynamoDB グローバルテーブルで複数リージョンに持つ。

## 試験のポイント

> **試験のポイント**
> 「複数のリージョンで書き込み」は DynamoDB グローバルテーブル、「書き込みは 1 つのリージョン、ほかは読み取り・災害対策」は Aurora Global Database です。

> **試験のポイント**
> 「異なるエンジンへの移行」は SCT＋DMS です。

> **試験のポイント**
> 「負荷の変動が大きく、MySQL 互換」は Aurora Serverless v2 です。

## ひっかけ注意

> **ひっかけ注意**
> 分析クエリのために RDS のインスタンスを大きくし続けるのは根本的な解決になりません。分析にはデータウェアハウス（Redshift）を使います。

> **ひっかけ注意**
> Aurora Serverless v1 は提供を終了しています。サーバーレスの Aurora は v2 を選びます。

> **ひっかけ注意**
> DMS だけではストアドプロシージャなどのコードの変換はできません。異種間の移行では SCT を使います。

## 確認問題

- `saa-3.3-g7-001`: 複数リージョンで書き込むデータベースを選ぶ問題
- `saa-3.3-g7-006`: Oracle から Aurora への移行方法を選ぶ問題
- `saa-3.3-g7-008`: 変動の大きい MySQL 互換データベースを選ぶ問題
- `saa-3.3-g7-010`: 複数の Aurora のデータを ETL なしで分析する構成を選ぶ問題
- `saa-3.3-g7-011`: PostGIS を使うデータベースの移行先を選ぶ問題
- `saa-3.3-g7-012`: キーによる読み書きを大規模に行うデータベースを選ぶ問題
