# Changelog

slot-analyzer-data の変更履歴。iOS SlotAnalyzer アプリとの互換性情報を含む。

## [3.3] - 2026-03-27

### 追加 (2台: 136台→138台)
- **shinuchi-yoshimune** (L真打吉宗) — AT, 6段階（導入前暫定データ）
- **yormungandr** (スマスロヨルムンガンド) — AT, 6段階（解析未公開）

### 大規模品質改善
- **trialSuccessRates 100%達成**（全138台）
- **endScreens 87%達成**（120/138台）
- confirmationEvents追加（バベル・ニューパルサーBT・スターハナハナ）
- 既存機種補完（ToLOVEるダークネス、ヴァルヴレイヴ2、新ハナビ等）
- バージョン一括更新: v1.0/0.2の22台をv1.1/1.0に更新

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（値の修正とエントリ追加のみ）

## [3.2] - 2026-03-27

### 追加 (11台: 125台→136台)
- **nyanko-daisensou** (Lにゃんこ大戦争 超神速) — AT, 5段階(1,2,4,5,6)
- **hanagasa** (L花笠) — AT, 5段階(1,2,4,5,6)
- **magical-halloween-bt** (マジカルハロウィン ボーナストリガー) — BT, 4段階(1,2,5,6)
- **druaga** (SLOT ドルアーガの塔) — AT, 4段階(1,2,5,6)
- **sf5** (スマスロ ストリートファイターV) — AT, 6段階
- **sister-quest** (Lシスタークエスト) — AT, 6段階
- **nanatsu-no-tsurugi** (L七つの魔剣が支配する) — AT, 6段階
- **ushiotora-vh** (Lうしおととら 白面決戦VH) — AT, 6段階
- **kamen-rider-denoh** (L仮面ライダー電王) — AT, 5段階(1,2,4,5,6)
- **okisuro-amazing-live** (スマート沖スロ アメイジングライブ) — AT, 5段階(1,2,4,5,6)
- **1000chan-a** (LBパチスロ1000ちゃんA) — A+AT, 4段階(1,2,5,6)

### 品質改善 (既存8台)
- gineiden-dnt: roles追加 + description
- kaguya-sama: trialSuccessRates追加
- bofuri, persona5, keiji-sado, toaru-index, tate-no-yusha: description追加
- new-king-hanahana-v: 30パイ版notes追加

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（値の修正とエントリ追加のみ）

## [3.1] - 2026-03-27

### 検証済み
- **全122台のデータをクロス検証完了**（2ソース以上で照合）
- 検証ソース: 一撃、ちょんぼりすた、DMMぱちタウン、ななプレス、パチマガスロマガ、HAZUSE DATA、パイオニア公式PDF等
- 検証精度: 確率値の許容誤差 ±0.000005

### 追加 (3台: 122台→125台)
- **koukaku-sumaslo** (スマスロ攻殻機動隊) — AT, 6段階, サミー, 2026年2月導入
- **burning-express** (バーニングエクスプレス) — AT, 5段階(1,2,4,5,6), 北電子, 2025年12月導入
- **onepunchman** (Lワンパンマン) — AT, 6段階, ニューギン, 2024年8月導入

### 修正 (4台)
- **kabaneri-unato** (v1.3): チャンス目3種の確率値を修正（旧作6.5号機のデータ混入）+ 下段ベル追加
- **arifureta** (v1.3): 初当り合算確率の設定5を修正（設定5>設定6の論理矛盾）
- **seiya-meiou-fukkatsu** (v1.1): バージョン更新
- **fujiko-bt** (v1.3): 小役確率の精度を4桁→6桁に向上

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（値の修正とエントリ追加のみ）
- 新フィールド: なし
- 全125台の lastUpdated を 2026-03-27 に更新
- availableSettings の新パターン: burning-express は ["1","2","4","5","6"]（5段階設定）

## [3.0] - 2026-03-26

### 追加 (10台: 112台→122台)
- koukaku-sac2045, godzilla-vs-eva, rezero2-pack-rem, symphogear, gundam-unicorn2
- bofuri, persona5, keiji-sado, toaru-index, tate-no-yusha

### iOS互換性
- 破壊的変更: なし
- 5段階設定(1,2,4,5,6)の機種が追加: godzilla-vs-eva, symphogear
- gundam-unicorn2 は v0.1 暫定データ（2026/4/20導入予定）

## [2.9] - 2026-03-25

### 追加
- smaslo-thunderv, darlifra, saki-choujou-kessen

## [2.5-2.8] - 2026-02

### 追加
- 93台→112台への段階的追加
- 全100台検証プロジェクト Phase 0-1 完了（13台検証）
