# SlotAnalyzer 機種データ

SlotAnalyzerアプリが参照するパチスロ機種データです。

**現在の登録台数: 175台** (v3.11.0, 2026-09-30更新)

| タイプ | 台数 |
| --- | ---: |
| A-type | 14台 |
| AT | 134台 |
| A+RT | 2台 |
| A+AT | 4台 |
| ART | 4台 |
| A+ART | 2台 |
| BT | 15台 |

### 品質指標

`node scripts/quality-report.mjs --json` の2026-09-30実測値。

| 指標 | 件数 |
| --- | ---: |
| roles（非空） | 172/175 |
| confirmationEvents（キー） | 175/175 |
| endScreens（非空） | 150/175 |
| trialSuccessRates（非空） | 158/175 |
| description | 175/175 |
| source | 175/175 |
| voiceCounts（非空） | 37/175 |
| provenance（出典記録） | 26/175 |

構造上の分類: Complete 172台 / Provisional 3台 / Incomplete 0台。

この自動分類はフィールドの充填状況を測ります。値の確度や鮮度を保証するものではありません。今回追加・見直しした機種は `provenance/` に項目ごとのURL・取得日・採用根拠を保存しています。既存全機種の出典整備は別工程です。

出典の採否規則は `docs/data-format.md`、全件見直しの設計は `docs/superpowers/specs/2026-09-26-data-expansion-design.md` を参照してください。

## 使い方

1. SlotAnalyzerアプリを開く
2. 機種一覧タブ → 本のアイコン（ライブラリ）をタップ
3. 「コミュニティ」タブを選択
4. 追加したい機種を選択して「追加」

## ファイル構造

```
slot-analyzer-data/
├── machines/
│   ├── index.json              # 機種一覧インデックス
│   ├── juggler/                # ジャグラー系
│   ├── hokuto/                 # 北斗系
│   ├── hanabi/                 # ハナビ系
│   └── {category}/{machine-id}.json # 各機種データ
├── provenance/
│   └── {machine-id}.json       # 出典記録（項目ごとの出典・取得日・値）
├── config/
│   └── official-domains.json   # メーカーの公式ドメインの一覧（公式の出典の照合）
├── schemas/
│   ├── machine.schema.json     # 機種データJSONスキーマ
│   ├── index.schema.json       # インデックスJSONスキーマ
│   ├── provenance.schema.json  # 出典記録JSONスキーマ
│   ├── notes.schema.json       # 抜き出し・読み直しのメモのJSONスキーマ
│   └── official-domains.schema.json # 公式ドメインの一覧のJSONスキーマ
├── scripts/
│   ├── validate.mjs            # バリデーション実行
│   ├── check-against-base.mjs  # main と比べる検査（アプリが作るID・採否ルール）
│   ├── expand-patterns.mjs     # 終了画面の patterns をアプリが読む形に書き直す
│   ├── reread-compare.mjs      # 抜き出しと読み直しのメモの照合
│   ├── provenance-draft.mjs    # メモから出典記録の下書きと機種ファイルに書く値を作る
│   ├── generate-template.mjs   # 新機種テンプレート生成
│   ├── sync-last-updated.mjs   # lastUpdated同期
│   └── audit-freshness.mjs     # 鮮度チェック
├── tests/
│   └── validate.test.mjs       # テスト
└── docs/
    ├── CONTRIBUTING.md          # 貢献ガイド
    ├── data-format.md           # データ形式仕様
    └── quality-standards.md     # 品質基準
```

## データ形式

### index.json

構造の例（**値はプレースホルダー**。現行値は `machines/index.json` を直接見ること。
ここに実値を書くと、データ更新のたびに陳腐化して冒頭の台数表記と矛盾する）。

```json
{
  "version": "<semver 例: 3.8.0>",
  "updatedAt": "<ISO 8601 UTC 例: 2026-05-31T00:00:00Z>",
  "machines": [
    {
      "id": "unique-id",
      "name": "機種名",
      "type": "AT",
      "author": "community",
      "version": "1.2",
      "file": "folder/filename.json",
      "tags": ["6号機", "AT"],
      "description": "説明",
      "lastUpdated": "<YYYY-MM-DD>"
    }
  ]
}
```

### 機種データ

```json
{
  "name": "機種名",
  "type": "AT",
  "roles": [
    {
      "name": "小役名",
      "probabilities": { "1": 0.009174, "2": 0.009259, ... },
      "hasSettingDiff": true,
      "displayOrder": 1
    }
  ],
  "confirmationEvents": [
    {
      "name": "演出名",
      "confirmedSettings": ["6"],
      "excludedSettings": []
    }
  ],
  "zones": [],
  "endScreenGroups": [],
  "author": "community",
  "version": "1.2",
  "lastUpdated": "2026-04-19"
}
```

詳細な仕様は [docs/data-format.md](docs/data-format.md) を参照してください。

### 機種タイプ

| type   | 説明                           |
| ------ | ------------------------------ |
| A-type | ノーマルタイプ（ジャグラー等） |
| AT     | AT機（最も多い）               |
| ART    | ART機                          |
| BT     | ボーナストリガータイプ         |
| A+RT   | A-type + RT                    |
| A+AT   | A-type + AT                    |
| A+ART  | A-type + ART                   |

### 設定段階

多くの機種は6段階(1,2,3,4,5,6)ですが、以下の例外があります:

- **5段階 (1,2,4,5,6)**: ゴジエヴァ, シンフォギア, レヴュースタァライト, バーニングエクスプレス等
- **4段階 (1,2,5,6)**: 新ハナビ, スマスロハナビ, ディスクアップUR, アレックスブライト, スマスロサンダーV等
- **5段階 (1,2,3,4,V)**: ニューキングハナハナV

`availableSettings` フィールドで設定段階を指定します。省略時は6段階。

## iOS開発者向け

### データ取得方法

- `machines/index.json` → GitHub Raw URLで取得
- 各機種: `machines/{entry.file}` のパスでアクセス

### 互換性情報

- 変更履歴は [CHANGELOG.md](CHANGELOG.md) を参照
- **構造変更は行いません**（値の修正とエントリ追加のみ）
- 破壊的変更がある場合は CHANGELOG.md で明示します

### iOS側で使用するフィールド

| フィールド                             | 用途                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| name, type                             | 機種情報表示                                                                                                    |
| roles[].probabilities                  | 小役確率カウンター・設定推測                                                                                    |
| confirmationEvents                     | 確定演出チェッカー・設定推測                                                                                    |
| zones                                  | ゾーン別確率・設定推測                                                                                          |
| endScreens, endScreenGroups            | 終了画面判別・設定推測（`endScreens` の `patterns` は、パターンごとの終了画面に展開される）                     |
| trialSuccessRates                      | 試行成功率・設定推測                                                                                            |
| voiceCounts, musicCounts, effectCounts | 数えたときに設定推測に使う（ボイスの `patterns` は読み込み時に捨てられる。楽曲・演出の確定・否定の設定は使われない） |
| settings / availableSettings           | 設定段階の決定                                                                                                  |

推定に使う確率は、機種のすべての設定の値を持つ必要がある（1つでも欠けると、アプリの推定が止まる。`npm run validate` が確かめる）。

### iOS側で未使用（自由に変更可能）

`modeTransitions`, `specialSettings`, `notes`, `source`

## 貢献方法

1. このリポジトリをフォーク
2. 依存関係をインストール（Node.js 20 以上）:
   ```bash
   npm install
   ```
3. テンプレートを生成:
   ```bash
   node scripts/generate-template.mjs --name "機種名" --type AT --dir dirname --id machine-id
   ```
4. 生成されたテンプレートにデータを記入
5. `npm run validate` でエラー0件を確認
6. `npm test` でテスト通過を確認
7. プルリクエストを送信

詳細な手順は [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) を参照してください。

## バリデーション

```bash
npm run validate          # スキーマ・確率値・演出・出典記録のバリデーション
npm run validate:schema   # スキーマチェックのみ
npm run validate:index    # index整合性チェックのみ
npm test                  # テスト実行（vitest）
npm run check:base        # main と比べる（アプリが作るID・採否ルール）（先に git fetch origin し、作業ブランチに origin/main を取り込む。取り込まないと、main に後から入った機種や記録を消したと報告する）
npm run audit             # lastUpdated の鮮度チェック
```

### コード品質

```bash
npx eslint scripts/ tests/   # ESLint（スクリプト・テスト対象）
npx prettier --check .        # Prettier（フォーマットチェック）
```

ESLint と Prettier は devDependencies に含まれています。pre-commit フック（husky）によりコミット時に自動バリデーションが実行されます。

## 関連ドキュメント

| ドキュメント                                           | 内容                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)           | 貢献ガイド（環境構築、追加・修正手順、PRチェックリスト）              |
| [docs/data-format.md](docs/data-format.md)             | データ形式仕様（全フィールド詳細、実例）                              |
| [docs/quality-standards.md](docs/quality-standards.md) | 品質基準（Complete/Provisional/Incomplete定義、バリデーションルール） |
| [CHANGELOG.md](CHANGELOG.md)                           | 変更履歴（iOS互換性情報含む）                                         |

## ライセンス

MIT License
