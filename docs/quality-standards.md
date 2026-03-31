# 品質基準

slot-analyzer-data における機種データの品質基準とバリデーションルールを定義します。

## 品質レベル定義

各機種データは以下の3つの品質レベルに分類されます。

### Complete（完全）

全ての必須フィールドと主要な推奨フィールドが記入されている状態です。

**条件:**
- `name`, `type`, `roles` が存在する
- `roles` が空でない（小役データが1つ以上ある）
- `description` が記述されている
- `trialSuccessRates` が記述されている
- `endScreens` または `endScreenGroups` が記述されている（A-type/ジャグラー系は除外）

### Provisional（暫定）

一部のフィールドが欠落しているが、正当な理由が明示されている状態です。

**条件:**
- `name`, `type`, `roles` が存在する
- 欠落フィールドについて、`notes` または `description` に理由が記載されている
  - 許容される理由: `解析未公開`, `導入前`, `未公開`, `暫定`

**例:**
- 導入前の新機種で解析データがまだ公開されていない場合
- 解析途中で一部データのみ判明している場合

### Incomplete（不完全）

必須フィールドの欠落があり、理由も明示されていない状態です。

**対応:** データの補完または理由の記載が必要です。

## バリデーションルール

`npm run validate` で実行されるバリデーションは以下の4カテゴリに分かれます。

### Level 1: エラー（修正必須）

バリデーションエラーとして報告され、修正しない限りデータとして使用できません。

| ルール | 説明 | 検出元 |
|--------|------|--------|
| スキーマ準拠 | `machine.schema.json` に準拠しているか | schema-validator |
| 必須フィールド | `name`, `type`, `roles` が存在するか | schema-validator |
| 型制約 | `type` が有効な値（A-type, AT, ART, BT, A+RT, A+AT, A+ART）か | schema-validator |
| 確率範囲 | 確率値が 0〜1 の範囲内か | probability-validator |
| 確率一貫性 | 同一小役の確率が設定順で論理的に一貫しているか | probability-validator |
| index整合性 | `index.json` のエントリと実ファイルが一致するか | index-consistency |
| ファイル参照 | `index.json` の `file` パスに実ファイルが存在するか | index-consistency |
| ID一意性 | `index.json` 内で `id` が重複していないか | index-consistency |
| 設定キー整合 | `probabilities` のキーが `availableSettings` と一致するか | probability-validator |
| confirmedSettings/excludedSettings | 重複や矛盾がないか | confirmation-validator |

### Level 2: 警告（修正推奨）

バリデーション警告として報告されます。データとしては使用可能ですが、品質向上のため修正が推奨されます。

| ルール | 説明 | 検出元 |
|--------|------|--------|
| roles空 | `roles` 配列が空（小役データなし） | completeness-validator |
| endScreens未設定 | 終了画面データがない（A-type/ジャグラー除く） | completeness-validator |
| trialSuccessRates未設定 | 試行/成功率データがない | completeness-validator |
| description未記入 | 機種説明がない | completeness-validator |
| source未記入 | データソースが記載されていない | completeness-validator |
| バージョン古い | `version` が `0.x` のまま | completeness-validator |

### Level 3: 情報（参考）

品質統計として報告されます。修正は不要ですが、プロジェクト全体の品質を把握するための指標です。

| 指標 | 説明 |
|------|------|
| roles充填率 | 小役データが存在する機種の割合 |
| confirmationEvents存在率 | 確定演出データが存在する機種の割合 |
| endScreens充填率 | 終了画面データが存在する機種の割合 |
| trialSuccessRates充填率 | 試行/成功率データが存在する機種の割合 |
| description充填率 | 説明が記述されている機種の割合 |
| voiceCounts充填率 | ボイスデータが存在する機種の割合 |
| Complete/Provisional/Incomplete内訳 | 各品質レベルの機種数 |

## 機種タイプ別の例外ルール

一部の機種タイプでは、通常とは異なるバリデーション基準が適用されます。

### A-type / ジャグラー系

| ルール | 適用 | 理由 |
|--------|------|------|
| endScreens が空 | 正常 | ジャグラー系ノーマルタイプは終了画面による設定示唆がない |
| endScreenGroups が空 | 正常 | 同上 |
| confirmationEvents が空 | 警告（通常より軽度） | プレミアム演出がある機種もあるが必須ではない |

**ジャグラー系と判定されるパス:**
- `juggler/`
- `funkyjuggler/`
- `gogojuggler/`
- `happyjuggler/`
- `aimjuggler/`

### 暫定データ機種

`description` や `notes` に以下のキーワードが含まれる機種は、データ欠落に対する警告が軽減されます。

- `解析未公開`
- `導入前`
- `未公開`
- `暫定`

## 確率値の精度基準

| 項目 | 基準 |
|------|------|
| 小数精度 | 6桁以上を推奨（例: `0.009174`） |
| 許容誤差 | クロスチェック時 ±0.000005 |
| クロスチェック | 2サイト以上のソースで照合必須 |

### 確率の論理的一貫性

以下のパターンはエラーとして検出されます:

- **設定N > 設定N+1 かつ低設定が有利でない小役**: 通常、高設定ほど確率が高い（または同じ）小役で、低設定の方が確率が高い場合は誤りの可能性が高い
- **確率値が 0 または 1**: 0%や100%の確率は通常ありえないため警告

## 現在の品質指標 (v3.3)

| 指標 | 達成率 | 備考 |
|------|--------|------|
| trialSuccessRates | 100% (138/138台) | v3.3で達成 |
| description | 100% (138/138台) | v3.3で達成 |
| endScreens | 87% (120/138台) | A-type/ジャグラー除くとほぼ100% |
| roles（空でない） | 99% (136/138台) | 2台が暫定データ |
| source | 90%+ | 大半の機種で記載あり |
