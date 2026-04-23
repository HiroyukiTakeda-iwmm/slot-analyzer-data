# データ形式仕様

slot-analyzer-data で使用するJSONデータの詳細仕様です。

## index.json 仕様

機種一覧のインデックスファイルです。iOS SlotAnalyzerアプリがこのファイルを最初に取得し、利用可能な機種を表示します。

スキーマ: `schemas/index.schema.json`

### フィールド一覧

| フィールド  | 型     | 必須 | 説明                                                       |
| ----------- | ------ | ---- | ---------------------------------------------------------- |
| `version`   | string | はい | インデックスバージョン（例: `"3.3"`）                      |
| `updatedAt` | string | はい | 最終更新日時（ISO 8601形式、例: `"2026-03-27T00:00:00Z"`） |
| `machines`  | array  | はい | 機種エントリの配列                                         |

### machines[] エントリ

| フィールド    | 型     | 必須   | 説明                                                           |
| ------------- | ------ | ------ | -------------------------------------------------------------- |
| `id`          | string | はい   | 一意識別子（kebab-case、ドット許可、例: `"koukaku-sumaslo"`）  |
| `name`        | string | はい   | 機種の表示名（例: `"スマスロ攻殻機動隊"`）                     |
| `type`        | string | はい   | 機種タイプ（後述）                                             |
| `author`      | string | はい   | データ作成者（例: `"community"`, `"コミュニティ"`）            |
| `version`     | string | はい   | データバージョン（例: `"1.2"`）                                |
| `file`        | string | はい   | JSONファイルの相対パス（例: `"koukaku/koukaku-sumaslo.json"`） |
| `tags`        | array  | いいえ | 検索用タグ（例: `["6号機", "AT"]`）                            |
| `description` | string | いいえ | 設定差の概要説明                                               |
| `lastUpdated` | string | いいえ | データの最終更新日（`YYYY-MM-DD`形式）                         |

## 機種データ仕様

各機種の設定推測データです。

スキーマ: `schemas/machine.schema.json`

### 必須フィールド

| フィールド | 型     | 説明                                                             |
| ---------- | ------ | ---------------------------------------------------------------- |
| `name`     | string | 機種名                                                           |
| `type`     | string | 機種タイプ: `A-type`, `AT`, `ART`, `BT`, `A+RT`, `A+AT`, `A+ART` |
| `roles`    | array  | 小役データの配列                                                 |

### 推奨フィールド

| フィールド           | 型     | 説明             |
| -------------------- | ------ | ---------------- |
| `confirmationEvents` | array  | 設定確定演出     |
| `endScreens`         | array  | 終了画面データ   |
| `endScreenGroups`    | array  | 終了画面グループ |
| `trialSuccessRates`  | array  | CZ/AT当選率等    |
| `voiceCounts`        | array  | ボイス示唆       |
| `description`        | string | 機種の概要説明   |

### オプションフィールド

| フィールド          | 型     | 説明                                |
| ------------------- | ------ | ----------------------------------- |
| `availableSettings` | array  | 利用可能な設定段階（省略時は6段階） |
| `zones`             | array  | ゾーン定義                          |
| `musicCounts`       | array  | 楽曲カウント                        |
| `effectCounts`      | array  | 演出カウント                        |
| `modeTransitions`   | array  | モード移行率                        |
| `specialSettings`   | object | 特殊設定データ                      |
| `notes`             | string | 補足メモ                            |
| `author`            | string | データ作成者                        |
| `version`           | string | データバージョン                    |
| `lastUpdated`       | string | 最終更新日（`YYYY-MM-DD`形式）      |
| `source`            | string | データソース                        |

## roles（小役データ）

設定差のある小役確率のデータです。

### フィールド

| フィールド       | 型      | 必須   | 説明                                         |
| ---------------- | ------- | ------ | -------------------------------------------- |
| `name`           | string  | はい   | 小役名（例: `"ベル"`、`"チェリー"`）         |
| `probabilities`  | object  | はい   | 設定別確率（後述）                           |
| `hasSettingDiff` | boolean | はい   | 設定差があるか                               |
| `displayOrder`   | integer | はい   | 表示順序（1始まり）                          |
| `id`             | string  | いいえ | 一意識別子                                   |
| `color`          | string  | いいえ | 表示色（`#RRGGBB`形式）                      |
| `description`    | string  | いいえ | 説明                                         |
| `incrementValue` | number  | いいえ | カウント増分値（デフォルト: 1）              |
| `icon`           | string  | いいえ | アイコン名                                   |
| `category`       | string  | いいえ | カテゴリ（`"role"` または `"confirmation"`） |

### probabilities（確率オブジェクト）

設定値をキー、確率値（0〜1の小数）を値とするオブジェクトです。

```json
{
  "1": 0.009174,
  "2": 0.009259,
  "3": 0.009346,
  "4": 0.009434,
  "5": 0.009524,
  "6": 0.009615
}
```

キーとして使用できる値: `"1"`, `"2"`, `"3"`, `"4"`, `"5"`, `"6"`, `"L"`, `"V"`

## confirmationEvents（設定確定演出）

特定の設定を確定または除外する演出データです。

### フィールド

| フィールド          | 型     | 必須   | 説明                                         |
| ------------------- | ------ | ------ | -------------------------------------------- |
| `name`              | string | はい   | 演出名（例: `"設定6確定画面"`）              |
| `confirmedSettings` | array  | はい   | この演出で確定する設定（例: `["6"]`）        |
| `excludedSettings`  | array  | はい   | この演出で除外される設定（例: `["1", "2"]`） |
| `id`                | string | いいえ | 一意識別子                                   |
| `description`       | string | いいえ | 説明                                         |
| `color`             | string | いいえ | 表示色                                       |

### 使い方の例

```json
{
  "name": "エンディング後に「6」表示",
  "confirmedSettings": ["6"],
  "excludedSettings": []
}
```

```json
{
  "name": "偶数示唆セリフ",
  "confirmedSettings": [],
  "excludedSettings": ["1", "3", "5"]
}
```

## endScreens（終了画面）

ボーナスやAT終了時に表示される画面データです。設定示唆として使用されます。

### 標準形式

| フィールド          | 型     | 必須   | 説明                                                |
| ------------------- | ------ | ------ | --------------------------------------------------- |
| `name`              | string | はい   | 画面名（例: `"キャラA 夕方背景"`）                  |
| `id`                | string | いいえ | 一意識別子                                          |
| `type`              | string | いいえ | 画面タイプ（下表参照）                              |
| `hint`              | string | いいえ | 設定示唆ヒント（例: `"高設定示唆"`, `"設定6確定"`） |
| `description`       | string | いいえ | 詳細説明                                            |
| `confirmedSettings` | array  | いいえ | 確定設定                                            |
| `excludedSettings`  | array  | いいえ | 除外設定                                            |
| `color`             | string | いいえ | 表示色                                              |
| `probabilities`     | object | いいえ | 設定別出現確率                                      |
| `patterns`          | array  | いいえ | 設定別パターン（レガシー形式）                      |
| `distribution`      | object | いいえ | 設定別分布（レガシー形式）                          |

### type の種類

| type        | 説明             |
| ----------- | ---------------- |
| `bonus_end` | ボーナス終了画面 |
| `at_end`    | AT終了画面       |
| `bt_start`  | BT開始画面       |
| `st_end`    | ST終了画面       |
| `big_end`   | BIG終了画面      |
| `bonus`     | ボーナス中       |
| `other`     | その他           |

### endScreenGroups（終了画面グループ）

複数の終了画面をグループ化します。

| フィールド     | 型      | 必須   | 説明                                    |
| -------------- | ------- | ------ | --------------------------------------- |
| `name`         | string  | はい   | グループ名（例: `"AT終了画面"`）        |
| `endScreens`   | array   | はい   | このグループに含まれる endScreen の配列 |
| `id`           | string  | いいえ | 一意識別子                              |
| `description`  | string  | いいえ | 説明                                    |
| `displayOrder` | integer | いいえ | 表示順序                                |
| `color`        | string  | いいえ | 表示色                                  |

## trialSuccessRates（試行/成功率）

CZ突入率やAT当選率など、設定差のある確率データです。

### フィールド

| フィールド      | 型      | 必須   | 説明                                       |
| --------------- | ------- | ------ | ------------------------------------------ |
| `name`          | string  | はい   | 項目名（例: `"CZ当選率"`、`"初当り合算"`） |
| `probabilities` | object  | はい   | 設定別確率                                 |
| `id`            | string  | いいえ | 一意識別子                                 |
| `description`   | string  | いいえ | 説明                                       |
| `triggerName`   | string  | いいえ | トリガー名（例: `"規定ゲーム数到達"`）     |
| `targetName`    | string  | いいえ | 対象名（例: `"AT突入"`）                   |
| `color`         | string  | いいえ | 表示色                                     |
| `displayOrder`  | integer | いいえ | 表示順序                                   |

### 例

```json
{
  "name": "初当り合算",
  "description": "ボーナス+AT初当り合算確率",
  "probabilities": {
    "1": 0.003205,
    "2": 0.003367,
    "3": 0.003534,
    "4": 0.003876,
    "5": 0.004237,
    "6": 0.004739
  },
  "displayOrder": 1
}
```

## voiceCounts（ボイスカウント）

設定示唆に使用されるボイスデータです。

### フィールド

| フィールド          | 型     | 必須   | 説明                                |
| ------------------- | ------ | ------ | ----------------------------------- |
| `name`              | string | はい   | ボイス名（例: `"設定6確定セリフ"`） |
| `id`                | string | いいえ | 一意識別子                          |
| `hint`              | string | いいえ | 設定示唆ヒント                      |
| `description`       | string | いいえ | 詳細説明                            |
| `confirmedSettings` | array  | いいえ | 確定設定                            |
| `excludedSettings`  | array  | いいえ | 除外設定                            |
| `probabilities`     | object | いいえ | 設定別出現確率                      |
| `patterns`          | array  | いいえ | 設定別パターン                      |
| `color`             | string | いいえ | 表示色                              |

## availableSettings のパターン一覧

`availableSettings` フィールドで、その機種で使用される設定段階を指定します。省略時はデフォルトの6段階設定です。

| パターン            | 値                          | 代表機種                                                         |
| ------------------- | --------------------------- | ---------------------------------------------------------------- |
| 6段階（デフォルト） | `["1","2","3","4","5","6"]` | 大半の機種（省略可）                                             |
| 5段階（設定3なし）  | `["1","2","4","5","6"]`     | ゴジエヴァ, シンフォギア, バーニングエクスプレス, にゃんこ大戦争 |
| 4段階               | `["1","2","5","6"]`         | 新ハナビ, スマスロハナビ, ディスクアップUR, ドルアーガ           |
| 5段階（設定4なし）  | `["1","2","3","5","6"]`     | 沖ドキ系                                                         |
| L設定               | `["L","2","3","4","5","6"]` | L設定搭載機                                                      |
| V設定               | `["1","2","3","4","5","V"]` | ニューキングハナハナV                                            |

## 実例: 完全な機種データ

以下は全フィールドが適切に記入された機種データの例です。

```json
{
  "name": "スマスロ攻殻機動隊",
  "type": "AT",
  "roles": [
    {
      "name": "弱チェリー",
      "probabilities": {
        "1": 0.009174,
        "2": 0.009259,
        "3": 0.009346,
        "4": 0.009434,
        "5": 0.009524,
        "6": 0.009615
      },
      "hasSettingDiff": true,
      "displayOrder": 1,
      "color": "#E91E63"
    },
    {
      "name": "スイカ",
      "probabilities": {
        "1": 0.015385,
        "2": 0.015385,
        "3": 0.015625,
        "4": 0.015625,
        "5": 0.015873,
        "6": 0.016129
      },
      "hasSettingDiff": true,
      "displayOrder": 2,
      "color": "#4CAF50"
    }
  ],
  "confirmationEvents": [
    {
      "name": "エンディング後に「6」表示",
      "confirmedSettings": ["6"],
      "excludedSettings": []
    },
    {
      "name": "偶数設定示唆演出",
      "confirmedSettings": [],
      "excludedSettings": ["1", "3", "5"]
    }
  ],
  "trialSuccessRates": [
    {
      "name": "初当り合算",
      "description": "ボーナス+AT初当り合算確率",
      "probabilities": {
        "1": 0.003205,
        "2": 0.003367,
        "3": 0.003534,
        "4": 0.003876,
        "5": 0.004237,
        "6": 0.004739
      },
      "displayOrder": 1
    }
  ],
  "endScreens": [
    {
      "name": "通常画面A",
      "type": "at_end",
      "hint": "デフォルト"
    },
    {
      "name": "特殊画面",
      "type": "at_end",
      "hint": "高設定示唆",
      "confirmedSettings": [],
      "excludedSettings": ["1", "2"]
    }
  ],
  "endScreenGroups": [
    {
      "name": "AT終了画面",
      "endScreens": [
        {
          "name": "通常画面A",
          "type": "at_end",
          "hint": "デフォルト"
        }
      ],
      "displayOrder": 1
    }
  ],
  "voiceCounts": [
    {
      "name": "設定6確定セリフ",
      "hint": "設定6確定",
      "confirmedSettings": ["6"],
      "excludedSettings": []
    }
  ],
  "author": "コミュニティ",
  "version": "1.2",
  "lastUpdated": "2026-03-27",
  "source": "一撃, ちょんぼりすた",
  "description": "弱チェリーとスイカに設定差あり。初当り合算で大きな差が出る。高設定ほど偶数示唆演出の出現率が高い。"
}
```
