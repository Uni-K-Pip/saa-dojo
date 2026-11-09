---
id: lesson-3.1-hybrid-storage
title: ハイブリッドストレージとデータ移行・転送
domain: 3
taskStatement: "3.1"
order: 20
knowledgeRefs:
  - 3.1-K1
  - 3.1-K2
services:
  - AWS Storage Gateway
  - AWS DataSync
  - AWS Transfer Family
  - Amazon FSx
  - Amazon S3
  - Amazon EFS
  - AWS Snow Family
  - AWS Direct Connect
estimatedMinutes: 15
createdBy: w2c
---

すべてのシステムを一度にクラウドへ移せるとは限りません。オンプレミスの環境を使い続けながら、データの置き場所を AWS に広げる構成を「ハイブリッドストレージ」と呼びます。このレッスンでは、AWS のストレージを使い続けるサービスと、データを運ぶサービスを、要件から選び分けられるようにします。

## 基礎

### まず2つの目的を分ける

問題が次のどちらを求めているかで、答えがほぼ決まります。

- **使い続ける**: オンプレミスのアプリケーションが、これまでと同じ方法（ファイル共有、ブロックディスク、テープ）で AWS のストレージを読み書きし続ける。
- **運ぶ**: データを AWS へ移す、または AWS との間で定期的に同期する。作業が終われば役目を終える。

前者が AWS Storage Gateway、後者が AWS DataSync や AWS Transfer Family です。

NFS は主に Linux、SMB は主に Windows のファイル共有、iSCSI はネットワーク越しのディスクを使うための接続方法です。ここでは「アプリケーションが話すプロトコル」を手がかりに選びます。

### AWS Storage Gateway

Storage Gateway は、オンプレミスに置くゲートウェイ（仮想マシンなど）と AWS 側のサービスを組み合わせたものです。アプリケーションからはローカルのストレージに見えますが、データは AWS にあります。頻繁に使うデータはゲートウェイのローカルキャッシュに置かれるので、読み取りは低レイテンシーです。ゲートウェイは、オンプレミスの仮想マシンのほか、Amazon EC2 上でも動かせます。

| ゲートウェイ | アプリケーションからの見え方 | データの置き場所 |
|---|---|---|
| S3 File Gateway | NFS／SMB のファイル共有 | Amazon S3 のオブジェクト（1 ファイル 1 オブジェクト） |
| Volume Gateway（キャッシュ型） | iSCSI のブロックボリューム | プライマリは S3。よく使うデータだけローカルにキャッシュ |
| Volume Gateway（保管型） | iSCSI のブロックボリューム | プライマリはオンプレミス。変更分を非同期に AWS へバックアップ |
| Tape Gateway | iSCSI の仮想テープライブラリ | 仮想テープ。アーカイブすると S3 Glacier Flexible Retrieval または S3 Glacier Deep Archive |

> **FSx File Gateway について**: SMB のファイル共有から Amazon FSx for Windows File Server を使う Amazon FSx File Gateway は、2024 年 10 月 28 日以降、新しいお客様は利用できません。既存の利用者は引き続き使えます。新しい設計では、FSx for Windows File Server に直接つなぐ構成を考えます。

**S3 File Gateway** は、書き込まれたファイルをそのまま S3 のオブジェクトにします。そのため、同じデータを AWS 上の分析ツールや他のサービスが S3 から直接読めます。S3 のライフサイクルやバージョニングも使えます。

**Volume Gateway** はブロックストレージを提供し、スナップショットを Amazon EBS のスナップショットとして保存します。キャッシュ型ではボリュームのデータは S3 に保存されますが、S3 の API やコンソールから直接は見えません。「S3 のオブジェクトとして読みたい」なら Volume Gateway ではなく S3 File Gateway です。

**Tape Gateway** は、物理テープに書き出す既存のバックアップソフトウェアを変えずに、保管先だけを AWS に置き換えます。アーカイブしたテープから復元するには、読み出す前にテープを取り出す操作が必要です。

### AWS DataSync

DataSync は、オンプレミスのストレージ（NFS、SMB、HDFS、オブジェクトストレージ）や他社クラウドのストレージと、S3、Amazon EFS、Amazon FSx の各種ファイルシステムとの間でデータを転送するマネージドサービスです。

- オンプレミス側には **エージェント**（仮想マシン）を置きます。転送の元と先を「ロケーション」、転送の設定を「タスク」として登録します。
- タスクには、**スケジュール実行、帯域の上限、変更分だけの転送、転送後の整合性の検証** を設定できます。
- 経路は、インターネットのほか、VPC エンドポイントを使って公衆インターネットを通らずに転送できます。AWS Direct Connect と組み合わせると、大きな移行の信頼性と速度が上がります。

### AWS Transfer Family

Transfer Family は、**SFTP、FTPS、FTP、AS2** といったファイル転送プロトコルでファイルを受け付けるマネージドサービスです。保存先は S3 または Amazon EFS です。取引先の SFTP クライアントや設定を変えずに、サーバーの運用だけを AWS に任せられるので、外部のパートナーがプロトコルを指定してファイルを送ってくる場面で選びます。

### Amazon FSx for NetApp ONTAP

オンプレミスで NetApp ONTAP を使っている場合、**Amazon FSx for NetApp ONTAP** が移行先になります。NFS、SMB、iSCSI、NVMe で同じデータにアクセスでき、スナップショット、SnapMirror によるレプリケーション、ONTAP の CLI や REST API による管理が使えます。アクセス頻度の低いデータは低コストの階層へ自動的に移ります。

### AWS Snowball Edge

AWS Snowball Edge は、物理デバイスで大容量データを運ぶサービスです。ただし 2025 年 11 月から新規のお客様の受け付けが止まっています。AWS は、オンラインの転送には DataSync、物理的な持ち込みには AWS Data Transfer Terminal やパートナーのソリューション、エッジでの計算には AWS Outposts を勧めています。

## 使い分け

| 要件のキーワード | 選ぶサービス |
|---|---|
| アプリを変えず NFS／SMB のまま S3 に保存し、S3 のオブジェクトとしても使いたい | S3 File Gateway |
| iSCSI のディスクを維持。全データをローカルに置き、AWS にバックアップ | Volume Gateway（保管型） |
| iSCSI のディスクを維持。ローカル容量を増やしたくない | Volume Gateway（キャッシュ型） |
| 物理テープ前提のバックアップソフトウェアを変えず、保管先を AWS に | Tape Gateway |
| 大量のファイルを移行し、スケジュール、帯域制限、検証が必要 | DataSync |
| 取引先が SFTP／FTPS／FTP で送ってくる | Transfer Family |
| NetApp の運用（SnapMirror、ONTAP CLI）と NFS／SMB 同時利用をそのまま移す | FSx for NetApp ONTAP |

迷ったら、「運ぶだけか使い続けるか」「アプリケーションのプロトコル」「S3 のオブジェクトとして読みたいか」「全データをローカルに置く必要があるか」の順に問います。

## 設計パターン

### NAS の容量不足を S3 で解消する

NAS の NFS 共有が満杯に近い場合は、S3 File Gateway を立てて、アプリケーションの保存先をゲートウェイの共有に変えます。最近使ったファイルはローカルキャッシュから読めます。

### 既存データの一括移行と、切り替えまでの差分同期

まず DataSync で全データをコピーし、切り替えの日まで毎晩、変更分だけを同期します。帯域の上限を設定して業務の回線を圧迫せず、転送後の検証も有効にします。

### テープバックアップのクラウド化

バックアップソフトウェアが iSCSI のテープライブラリにしか書き出せない場合は、Tape Gateway を接続先にします。ほとんど読み出さない長期保管なら、仮想テープのアーカイブ先に S3 Glacier Deep Archive を選ぶと保管料が最も低くなります。読み出すときは、取り出しの待ち時間が必要です。

### 回線が止まっても動かす

WAN が止まってもオンプレミスのデータベースを動かし続けたい場合は、Volume Gateway の保管型で全データをローカルに置き、変更分を EBS スナップショットとして AWS にバックアップします。

## 試験のポイント

> **試験のポイント**
> 「アプリケーションの改修なしに NFS／SMB で S3 を使う」は S3 File Gateway、「大量データの移行、定期同期、帯域制限、整合性の検証」は DataSync です。

> **試験のポイント**
> 「全データにローカルで低レイテンシー、かつ AWS にバックアップ」は Volume Gateway の保管型、「ローカルのディスクを減らしたい」はキャッシュ型です。

> **試験のポイント**
> 「NFS と SMB の両方」「SnapMirror」は FSx for NetApp ONTAP、「取引先が SFTP で送る」は Transfer Family です。

## ひっかけ注意

> **ひっかけ注意**
> Volume Gateway のデータは S3 のオブジェクトとして直接読めません。クラウド側のサービスから S3 の API で読む要件なら S3 File Gateway を選びます。

> **ひっかけ注意**
> DataSync はコピーするサービスで、ローカルキャッシュを持ちません。元のデータも残るので、「NAS の容量不足を解消するため保存先そのものを変える」要件には向きません。S3 File Gateway も一括移行の道具ではありません。

> **ひっかけ注意**
> 新規受付が止まったサービスは正解にしません。AWS Snowball Edge と Amazon FSx File Gateway は、新しいお客様は利用できません。ネットワーク経由で移行するなら DataSync（必要なら Direct Connect と組み合わせ）です。

## 確認問題

- `saa-3.1-g6-001`: NFS の NAS の保存先を、アプリを変えずに S3 に移して S3 のオブジェクトとしても使う
- `saa-3.1-w2c-001`: テープ前提のバックアップソフトウェアのまま、長期保管先を AWS に移す
- `saa-3.1-w2c-002`: iSCSI のデータベースを全データローカルで動かしつつ、AWS にバックアップを持つ
- `saa-3.1-w2c-003`: NFS の大量データを EFS へ移行し、帯域を制限しながら差分を同期する
- `saa-3.1-w2c-008`: NetApp の NFS／SMB 環境を、複製や運用を変えずに AWS へ移す
