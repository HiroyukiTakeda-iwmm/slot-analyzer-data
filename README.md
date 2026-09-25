# SlotAnalyzer 機種データ

SlotAnalyzerアプリで使用するパチスロ機種データのコミュニティリポジトリです。

**現在の登録台数: 149台** (v3.8.0, 2026-05-31更新)

| タイプ | 台数  |
| ------ | ----- |
| AT     | 112台 |
| A-type | 14台  |
| BT     | 12台  |
| A+AT   | 4台   |
| ART    | 4台   |
| A+RT   | 2台   |
| A+ART  | 1台   |

### 品質指標

`node scripts/quality-report.mjs` の実測値（2026-09-26 実行）。数値を手で書き換えず、
このスクリプトの出力を転記すること。

| 指標               | 達成率           |
| ------------------ | ---------------- |
| trialSuccessRates  | 100% (149/149台) |
| description        | 100% (149/149台) |
| source（項目の充足） | 100% (149/149台) ⚠️ 下記注記 |
| confirmationEvents | 100% (149/149台) |
| roles (非空)       | 98% (146/149台)  |
| endScreens (非空)  | 87% (129/149台)  |
| voiceCounts (非空) | 25% (37/149台)   |
| provenance（出典記録） | 0% (0/149台)     |

品質分類（**構造上の自動分類**）: Complete 146台 / Provisional 3台 / Incomplete 0台
（`npm run validate` エラー0・警告0）

> ⚠️ この分類は `scripts/validators/completeness-validator.mjs` が**フィールドの充填状況だけ**で
> 判定する。内容の確度は見ていないため、文書上は暫定登録（Provisional）の機種でも
> `roles` が非空なら Complete に数えられる。**146台の内容が完全であるという意味ではない。**

> 🔴 **`source` 100% は「全機種で出典を追試できる」という意味ではない**（2026-08-17 実測）。
>
> | 指標 | 実測 |
> |---|---|
> | `source` が空 | 0 / 149 |
> | **`source` に URL を含む** | **1 / 149**（`galfy` のみ） |
> | JSON のどこかに URL がある | **5 / 149**（残り4台は `notes` に記載） |
> | **`retrievedAt`（取得日）** | **0 / 149** |
>
> 大半は「一撃、なな徹」のようなサイト名の列挙で、**どのページを見たかが特定できない**。
> 取得日はどの機種にも無い。つまり**全149台について一貫して追試可能な状態ではない**。
>
> スキーマ上も `source` は **required ではない**（required は name / type / roles / author /
> version / lastUpdated の6つ）。恒久対策の案は `docs/data-provenance-proposal.md` を参照。
> 2026-09-26 から、出典は `provenance/` に項目ごとに記録する（段階的に全機種へ広げる）。

> ⚠️ **鮮度は上記とは別の軸**。品質指標は「項目が埋まっているか」であって「内容が最新か」ではない。
> 鮮度は `node scripts/audit-freshness.mjs` で確認する（2026-08-16 時点で全149台が31日以上未更新、
> うち147台が91日以上）。ただしこのスクリプトが測るのも `lastUpdated` からの**経過日数だけ**で、
> 内容の最新性を直接保証するものではない。追加予定の機種は `machines/FUTURE_ADDITIONS.md` を参照。

## 使い方

1. SlotAnalyzerアプリを開く
2. 機種一覧タブ → 本のアイコン（ライブラリ）をタップ
3. 「コミュニティ」タブを選択
4. 追加したい機種を選択して「追加」

## ファイル構造

```
slot-analyzer-data/
├── machines/
│   ├── index.json              # 機種一覧インデックス (v3.8.0)
│   ├── juggler/                # ジャグラー系
│   ├── hokuto/                 # 北斗系
│   ├── hanabi/                 # ハナビ系
│   └── {category}/{machine-id}.json # 各機種データ
├── provenance/
│   └── {machine-id}.json       # 出典記録（項目ごとの出典・取得日・値）
├── schemas/
│   ├── machine.schema.json     # 機種データJSONスキーマ
│   ├── index.schema.json       # インデックスJSONスキーマ
│   └── provenance.schema.json  # 出典記録JSONスキーマ
├── scripts/
│   ├── validate.mjs            # バリデーション実行
│   ├── check-against-base.mjs  # main と比べる検査（アプリが作るID・採否ルール）
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

| フィールド                   | 用途               |
| ---------------------------- | ------------------ |
| name, type                   | 機種情報表示       |
| roles[].probabilities        | 小役確率カウンター |
| confirmationEvents           | 確定演出チェッカー |
| zones                        | ゾーン別確率       |
| endScreenGroups              | 終了画面判別       |
| settings / availableSettings | 設定段階の決定     |

### iOS側で未使用（自由に変更可能）

`trialSuccessRates`, `voiceCounts`, `musicCounts`, `effectCounts`, `modeTransitions`, `specialSettings`, `notes`, `source`

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
npm run validate          # スキーマ・確率値・演出のバリデーション
npm run validate:schema   # スキーマチェックのみ
npm run validate:index    # index整合性チェックのみ
npm test                  # テスト実行（vitest）
npm run check:base        # main と比べる（アプリが作るID・採否ルール）
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
