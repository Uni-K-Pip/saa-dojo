---
id: cheatsheet-databases
title: RDS・Aurora・DynamoDB・ElastiCache の使い分け
order: 20
taskStatements:
  - "2.2"
  - "3.3"
  - "4.3"
services:
  - Amazon RDS
  - Amazon Aurora
  - Amazon Aurora Serverless
  - Amazon DynamoDB
  - Amazon DynamoDB Accelerator (DAX)
  - Amazon ElastiCache
  - Amazon RDS Proxy
  - Amazon Redshift
  - Amazon DocumentDB (with MongoDB compatibility)
  - Amazon Neptune
  - Amazon Keyspaces (for Apache Cassandra)
  - Amazon Timestream
createdBy: x
---

データベースは、まず「データの形（表、キーと値、グラフなど）」と「使い方（日々の取引か、集計・分析か、キャッシュか）」で種類を決め、次に可用性・性能・コストの要件で構成を決めます。

## 一言でいうと

| サービス | 種類 | 一言でいうと | 典型的な用途 |
|---|---|---|---|
| Amazon RDS | リレーショナル | MySQL、PostgreSQL、MariaDB、Oracle、SQL Server、Db2 のマネージドなデータベース | 既存の業務システム、取引処理（OLTP） |
| Amazon Aurora | リレーショナル | MySQL・PostgreSQL 互換の、クラウド向けに作られた高性能なデータベース | 高い性能と可用性が必要な取引処理、複数リージョンの構成 |
| Amazon DynamoDB | キーバリュー・ドキュメント | サーバーレスで、どんな規模でも 1 桁ミリ秒で応答する NoSQL | セッション、ショッピングカート、ゲーム、IoT、大量アクセスの Web アプリ |
| Amazon ElastiCache | インメモリ | Valkey、Redis OSS、Memcached のマネージドなキャッシュ | データベースの前のキャッシュ、セッションストア、ランキング |
| Amazon Redshift | データウェアハウス | 列指向で大量のデータを集計するデータベース | 分析、BI、レポート（OLAP） |

このほか、目的別のデータベースがあります。

| サービス | 向いているデータ |
|---|---|
| Amazon DocumentDB (with MongoDB compatibility) | JSON のドキュメント。MongoDB 互換のアプリケーション |
| Amazon Neptune | グラフ（つながり）。SNS の友人関係、レコメンド、不正検知 |
| Amazon Keyspaces (for Apache Cassandra) | Apache Cassandra 互換のワイドカラム |
| Amazon Timestream | 時系列データ。IoT のセンサー値、メトリクス |
| Amazon OpenSearch Service | 全文検索、ログの検索と分析 |

## 可用性とスケーリングの比較

| 観点 | Amazon RDS | Amazon Aurora | Amazon DynamoDB |
|---|---|---|---|
| 障害への備え | マルチ AZ 配置（別の AZ に同期でスタンバイを置き、障害時は自動で切り替え） | データを 3 つの AZ に 6 つ保存。障害時は Aurora レプリカへ自動で切り替え | リージョン内の複数の AZ に自動で保存 |
| 読み取りを増やす | リードレプリカ（非同期で複製） | Aurora レプリカ（最大 15 個。ストレージを共有するので遅延が小さい） | 自動で増減。読み取りを速くするなら DAX |
| 書き込みを増やす | より大きなインスタンスに変える（垂直スケーリング） | より大きなインスタンス。負荷が変わるなら Aurora Serverless v2 | オンデマンドモード、またはプロビジョンドモードと自動スケーリング |
| 別のリージョン | リージョンをまたぐリードレプリカ | Aurora Global Database（通常 1 秒未満の遅延で複製） | グローバルテーブル（複数のリージョンで読み書きできる） |
| バックアップ | 自動バックアップ（最大 35 日）とスナップショット。指定した時点への復元 | 自動バックアップとスナップショット。指定した時点への復元 | ポイントインタイムリカバリ（PITR）とオンデマンドバックアップ |

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| Oracle や SQL Server をそのまま移したい | Amazon RDS（同じエンジン） |
| MySQL・PostgreSQL で、高い性能と可用性、自動で増えるストレージが必要 | Amazon Aurora |
| 負荷が予測できない・断続的なリレーショナルのワークロード | Aurora Serverless v2 |
| 複数のリージョンにまたがる災害対策（RPO・RTO が小さい） | Aurora Global Database、DynamoDB のグローバルテーブル |
| キーで読み書きする大量のアクセス、スキーマが柔軟、運用負荷を最小に | Amazon DynamoDB |
| DynamoDB の読み取りをマイクロ秒にしたい | DynamoDB Accelerator（DAX） |
| 読み取りの多いリレーショナルデータベースの負荷を下げたい | ElastiCache（キャッシュ）か、リードレプリカ |
| 多数の AWS Lambda 関数から接続して、接続数があふれる | Amazon RDS Proxy（接続をプールして共有） |
| 大量のデータを集計・分析したい | Amazon Redshift |

> **試験のポイント**
> 「高可用性」「AZ の障害でも止めない」は、RDS のマルチ AZ 配置です。「読み取りの性能を上げる」は、リードレプリカかキャッシュです。目的が違うので、問題文がどちらを求めているかを先に確かめます。

> **試験のポイント**
> 「数百万人のユーザー」「予測できないトラフィック」「サーバーの管理なし」と書かれた、キーで引くデータなら DynamoDB のオンデマンドモードです。アクセスが安定して予測できるなら、プロビジョンドモードのほうが安くなることがあります。

> **試験のポイント**
> 「セッション情報を複数の EC2 インスタンスで共有したい」は、ElastiCache か DynamoDB に置きます。インスタンスのメモリに置くと、スケールインや障害でセッションが失われます。

## ひっかけ注意

> **ひっかけ注意**
> RDS のマルチ AZ 配置（DB インスタンス）のスタンバイは、読み取りに使えません。読み取りを分散したいならリードレプリカです。逆に、リードレプリカは非同期の複製なので、それだけでは障害時にデータを失わない構成になりません。

> **ひっかけ注意**
> DAX は DynamoDB 専用のキャッシュです。RDS や Aurora の前に置くキャッシュは ElastiCache です。

> **ひっかけ注意**
> ElastiCache for Memcached には複製や永続化の機能がありません。キャッシュが消えると困るデータや、自動で切り替える高可用性が必要なら、Valkey か Redis OSS を使い、マルチ AZ を有効にします。

> **ひっかけ注意**
> Amazon Redshift は分析用で、1 件ずつの取引処理（OLTP）には向きません。逆に、RDS で大量のデータを集計すると、本番の取引処理を遅くします。

## 出典

- [Amazon RDS ユーザーガイド](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html)
- [Amazon Aurora ユーザーガイド](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html)
- [Amazon DynamoDB デベロッパーガイド](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)
- [Amazon ElastiCache ユーザーガイド](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html)
- [Amazon Redshift 管理ガイド](https://docs.aws.amazon.com/redshift/latest/mgmt/welcome.html)
- [AWS のデータベース（目的別データベース）](https://aws.amazon.com/products/databases/)
