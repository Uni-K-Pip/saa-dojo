---
id: cheatsheet-block-file-storage
title: EBS・EFS・FSx・インスタンスストアの使い分け
order: 40
taskStatements:
  - "3.1"
  - "4.1"
services:
  - Amazon EBS
  - Amazon EFS
  - Amazon FSx
  - Amazon EC2
  - Amazon S3
createdBy: x
---

ストレージは、まず「ブロック（ディスク）」「ファイル（共有フォルダー）」「オブジェクト（HTTP で読み書きする）」のどれが必要かを決めます。次に、何台から同時に使うか、どの OS やプロトコルで使うかでサービスを選びます。

## 一言でいうと

| サービス | 種類 | 一言でいうと | 同時に使えるもの |
|---|---|---|---|
| インスタンスストア | ブロック | EC2 のホストに物理的についた一時的なディスク | その 1 台だけ |
| Amazon EBS | ブロック | EC2 インスタンスにつなぐネットワーク型のディスク | 原則 1 台（同じ AZ の中だけ） |
| Amazon EFS | ファイル | Linux 向けの、自動で容量が増える NFS のファイルシステム | 多数の EC2、コンテナ、Lambda（複数の AZ から） |
| Amazon FSx | ファイル | Windows File Server、Lustre、NetApp ONTAP、OpenZFS のマネージドなファイルシステム | 多数のクライアント |
| Amazon S3 | オブジェクト | 容量の上限を気にせず使えるオブジェクトストレージ | どこからでも（HTTP の API） |

## Amazon EBS のボリュームタイプ

| タイプ | 種類 | 向いている用途 |
|---|---|---|
| gp3 | 汎用 SSD | ほとんどのワークロード。容量に関係なく 3,000 IOPS・125 MiB/秒が基本で、IOPS とスループットを別々に追加できる |
| gp2 | 汎用 SSD（前の世代） | IOPS が容量に比例して増える。新しく作るなら gp3 |
| io2 Block Express・io1 | プロビジョンド IOPS SSD | 高い IOPS と低いレイテンシーが必要なデータベース |
| st1 | スループット最適化 HDD | 大きなファイルを順に読むビッグデータ、ログの処理 |
| sc1 | Cold HDD | あまり読まない大量のデータを最も安く |

- HDD のタイプ（st1、sc1）は起動ボリュームに使えません。
- スナップショットは増分で保存され、別の AZ や別のリージョンでボリュームを作り直すのに使います。

## Amazon FSx の 4 種類

| 種類 | プロトコル | 向いている用途 |
|---|---|---|
| Amazon FSx for Windows File Server | SMB | Windows のアプリケーション、Active Directory と連携した共有フォルダー |
| Amazon FSx for Lustre | Lustre | HPC、機械学習、動画の処理など、非常に高いスループットが必要な処理。S3 のデータと連携できる |
| Amazon FSx for NetApp ONTAP | NFS・SMB・iSCSI | オンプレミスの NetApp からの移行、複数のプロトコルを同時に使う |
| Amazon FSx for OpenZFS | NFS | オンプレミスの ZFS や Linux のファイルサーバーからの移行 |

## 選び方

| 問題文の要件 | 選ぶもの |
|---|---|
| 1 台の EC2 インスタンスのデータベースやアプリケーション用のディスク | Amazon EBS（gp3） |
| とても高い IOPS が必要なデータベース | EBS の io2 Block Express |
| 一時的なキャッシュやバッファで、消えてもよいが最も速くしたい | インスタンスストア |
| 複数の Linux の EC2 インスタンスやコンテナで、同じファイルを共有したい | Amazon EFS |
| Windows のサーバーで共有フォルダーを使いたい（SMB、Active Directory） | Amazon FSx for Windows File Server |
| HPC で、S3 にあるデータを高速に処理したい | Amazon FSx for Lustre |
| 画像や動画、バックアップを大量に、安く保存したい | Amazon S3 |

> **試験のポイント**
> 「複数の EC2 インスタンスから同時に読み書きする共有ファイルシステム」で、Linux なら Amazon EFS、Windows なら Amazon FSx for Windows File Server です。EBS はふつう 1 台にしかつなげません。

> **試験のポイント**
> EFS には Standard、低頻度アクセス（IA）、アーカイブのストレージクラスがあり、ライフサイクル管理で、しばらく読まれていないファイルを自動で安いクラスへ移せます。

## ひっかけ注意

> **ひっかけ注意**
> インスタンスストアのデータは、インスタンスを停止・終了すると消えます。残す必要があるデータは置けません。

> **ひっかけ注意**
> EBS ボリュームは 1 つの AZ の中にあります。別の AZ のインスタンスで使うには、スナップショットを取り、その AZ で新しいボリュームを作ります。複数のインスタンスにつなぐマルチアタッチは io1・io2 だけで、同じ AZ の中に限られます。

> **ひっかけ注意**
> Amazon EFS は Linux 向けで、Windows のインスタンスからは使えません。Windows で共有ファイルが必要なら FSx for Windows File Server です。

## 出典

- [Amazon EBS ボリュームタイプ](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-volume-types.html)
- [Amazon EC2 インスタンスストア](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/InstanceStorage.html)
- [Amazon EFS ユーザーガイド](https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html)
- [Amazon FSx](https://aws.amazon.com/fsx/)
