---
name: slot-data
description: slot-analyzer-data専用スキル。機種データの追加・検証・更新ワークフロー
---

# slot-analyzer-data ワークフロースキル

## データ追加ワークフロー

1. テンプレート生成
   ```bash
   node scripts/generate-template.mjs --name "機種名" --type AT --dir dirname --id machine-id
   ```

2. 参考サイトからデータ収集（brightdata MCP使用）
   - 一撃: `mcp__brightdata__scrape_as_markdown` で `https://1geki.jp/slot/{machine-slug}/`
   - ちょんぼりすた: `mcp__brightdata__scrape_as_markdown` で `https://chonborista.com/slot/{machine-slug}/settei-sabetsu/`
   - 2サイト以上でクロスチェック必須

3. JSONファイルにデータ入力
   - 確率値: 小数表記（例: 1/109.0 → 0.009174）、小数6桁精度
   - hasSettingDiff: 確率値が全設定同一なら `false`、異なれば `true`
   - availableSettings: 設定1-6以外の場合のみ指定
   - confirmationEvents: 空配列でもOK（Aタイプはほぼ空）
   - color: `#RRGGBB` 形式

4. バリデーション実行
   ```bash
   npm run validate
   ```

5. index.json にエントリ追加

6. 再度バリデーション → コミット

## データ検証ワークフロー

1. 全体チェック: `npm run validate`
2. エラー修正（hasSettingDiff不整合、availableSettings漏れ等）
3. 外部サイト照合（サンプリング）
   - `mcp__brightdata__scrape_as_markdown` で一撃/ちょんぼりすたをスクレイプ
   - JSONの確率値と照合
4. 差異があれば修正 → 再バリデーション

## JSON構造ルール

### 必須フィールド
- `name`: 機種名
- `type`: `"A-type"` | `"AT"` | `"ART"` | `"A+RT"` | `"A+AT"` | `"A+ART"` | `"BT"`
- `roles[]`: 小役データ（最低1件推奨）

### roles の構造
```json
{
  "name": "小役名",
  "probabilities": {"1": 0.009174, "2": 0.009346, ...},
  "hasSettingDiff": true,
  "displayOrder": 1,
  "color": "#4CAF50"
}
```

### 確率値変換
- 1/109.0 → `0.009174` (= 1÷109、小数6桁)
- 1/6.04 → `0.165563`
- 設定差なし → 全設定同じ値 + `hasSettingDiff: false`

### 設定パターン
| パターン | availableSettings | 例 |
|---------|-------------------|-----|
| 6段階(標準) | 省略 | ほとんどの機種 |
| 5段階(設定3なし) | `["1","2","4","5","6"]` | 北斗の拳 |
| 4段階 | `["1","2","5","6"]` | 新ハナビ |
| 設定L搭載 | `["L","2","3","4","5","6"]` | ToLOVEる |
| 設定V搭載 | `["1","2","3","4","5","V"]` | ニューキングハナハナV |

## 参考サイト

| サイト | URL | 特徴 |
|--------|-----|------|
| 一撃 | https://1geki.jp/slot/ | 網羅性が高い |
| ちょんぼりすた | https://chonborista.com/slot/ | 設定判別特化 |
| ななプレス | https://nana-press.com/slot/machine/ | 新台情報 |
| なな徹 | https://nana-tetsu.com/ | ランキング |
| P-WORLD | https://www.p-world.co.jp/ | 設置台数 |

## バリデーションチェック項目

| チェック | 説明 |
|---------|------|
| JSONスキーマ | schemas/machine.schema.json 準拠 |
| index整合性 | name/type/version/fileパスの一致 |
| 確率値範囲 | 0〜1の範囲内 |
| hasSettingDiff | 実際の確率値との整合性 |
| availableSettings | 非標準設定パターンでの設定必須 |
| confirmationEvents | confirmed/excludedの重複なし |
