# 貢献ガイド

slot-analyzer-data への貢献方法について説明します。

## 環境構築

### 前提条件

- Node.js 20.0.0 以上
- npm

### セットアップ

```bash
git clone https://github.com/HiroyukiTakeda-iwmm/slot-analyzer-data.git
cd slot-analyzer-data
npm install
```

### 動作確認

```bash
npm run validate   # バリデーション実行（エラー0件を確認）
npm test           # テスト実行（全テスト通過を確認）
```

## 新機種の追加手順

### 1. テンプレート生成

```bash
node scripts/generate-template.mjs \
  --name "機種名" \
  --type AT \
  --dir category-name \
  --id machine-id \
  --settings 1,2,3,4,5,6
```

**パラメータ:**

| パラメータ   | 必須   | 説明                                | 例                                                   |
| ------------ | ------ | ----------------------------------- | ---------------------------------------------------- |
| `--name`     | はい   | 機種の正式名称                      | `"スマスロ攻殻機動隊"`                               |
| `--type`     | はい   | 機種タイプ                          | `AT`, `A-type`, `BT`, `ART`, `A+AT`, `A+RT`, `A+ART` |
| `--dir`      | はい   | カテゴリディレクトリ名              | `koukaku`, `juggler`                                 |
| `--id`       | はい   | 機種ID（kebab-case）                | `koukaku-sumaslo`                                    |
| `--settings` | いいえ | 設定段階（デフォルト: 1,2,3,4,5,6） | `1,2,4,5,6`                                          |

### 2. データ記入

生成されたテンプレート（`machines/{dir}/{id}.json`）を編集し、以下のデータを記入します。

**必須データ:**

- `roles` — 小役確率（全設定分）
- `description` — 機種の設定差概要

**推奨データ:**

- `confirmationEvents` — 設定確定演出
- `endScreens` / `endScreenGroups` — 終了画面・示唆演出
- `trialSuccessRates` — CZ/AT当選率
- `voiceCounts` — ボイス示唆

**データ収集チェックリスト:**

- [ ] 小役確率（全設定）を2サイト以上でクロスチェック
- [ ] 設定確定演出を収集
- [ ] 終了画面/示唆演出を収集
- [ ] CZ/AT当選率を収集
- [ ] ボイス示唆を収集
- [ ] description を記述

### 3. index.json にエントリ追加

テンプレート生成時にコンソールに出力されるエントリを `machines/index.json` の `machines` 配列に追加します。

### 4. バリデーション

```bash
npm run validate   # スキーマ・確率値・演出のバリデーション
npm test           # テスト実行
```

エラー0件、テスト全通過を確認してください。

### 5. コミット・PR

```bash
git add machines/{dir}/{id}.json machines/index.json
git commit -m "feat(machines): {機種名}を追加"
```

## データ修正手順

既存の機種データを修正する場合は、以下のルールに従ってください。

### version の更新ルール

| 変更内容                 | バージョン更新    | 例        |
| ------------------------ | ----------------- | --------- |
| 確率値の修正（誤り訂正） | パッチ（0.0.1）   | 1.2 → 1.3 |
| 新フィールドの追加       | パッチ（0.0.1）   | 1.2 → 1.3 |
| 大幅なデータ改訂         | マイナー（0.1.0） | 1.2 → 2.0 |

### lastUpdated の更新ルール

データを変更した場合は必ず `lastUpdated` を更新してください。

```json
{
  "version": "1.3",
  "lastUpdated": "2026-04-01"
}
```

`index.json` 側の `version` と `lastUpdated` も同期させてください。同期スクリプトを使用できます:

```bash
npm run sync   # index.json の lastUpdated を機種ファイルから同期
```

## コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に従い、日本語で記述します。

| タイプ            | 用途             | 例                                             |
| ----------------- | ---------------- | ---------------------------------------------- |
| `feat(machines)`  | 新機種追加       | `feat(machines): スマスロ攻殻機動隊を追加`     |
| `fix(machines)`   | データ修正       | `fix(machines): カバネリ チャンス目確率を修正` |
| `docs`            | ドキュメント更新 | `docs: READMEを更新`                           |
| `chore(machines)` | メンテナンス     | `chore(machines): lastUpdatedを一括更新`       |
| `feat(scripts)`   | スクリプト追加   | `feat(scripts): 鮮度チェックスクリプトを追加`  |
| `fix(scripts)`    | スクリプト修正   | `fix(scripts): バリデーションの誤検出を修正`   |

## PRチェックリスト

プルリクエスト作成前に以下を確認してください。

### 新機種追加の場合

- [ ] `npm run validate` がエラー0件
- [ ] `npm test` が全テスト通過
- [ ] `index.json` にエントリが追加されている
- [ ] `description` が記述されている
- [ ] 確率値を2サイト以上でクロスチェック済み
- [ ] `lastUpdated` が正しい日付になっている
- [ ] コミットメッセージが `feat(machines): 機種名を追加` の形式

### データ修正の場合

- [ ] `npm run validate` がエラー0件
- [ ] `npm test` が全テスト通過
- [ ] `version` が更新されている
- [ ] `lastUpdated` が更新されている
- [ ] `index.json` の `version` と `lastUpdated` が同期している
- [ ] 修正理由がコミットメッセージに記述されている

### ドキュメント修正の場合

- [ ] 内容が正確である
- [ ] 台数やバージョン番号が最新値になっている
