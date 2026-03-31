# SlotAnalyzer 機種データ

SlotAnalyzerアプリで使用するパチスロ機種データのコミュニティリポジトリです。

**現在の登録台数: 138台** (v3.3, 2026-03-27更新)

| タイプ | 台数 |
|--------|------|
| AT | 104台 |
| A-type | 14台 |
| BT | 9台 |
| ART | 4台 |
| A+AT | 4台 |
| A+RT | 2台 |
| A+ART | 1台 |

### 品質指標

| 指標 | 達成率 |
|------|--------|
| trialSuccessRates | 100% (138/138台) |
| description | 100% (138/138台) |
| endScreens | 87% (120/138台) |

## 使い方

1. SlotAnalyzerアプリを開く
2. 機種一覧タブ → 本のアイコン（ライブラリ）をタップ
3. 「コミュニティ」タブを選択
4. 追加したい機種を選択して「追加」

## ファイル構造

```
slot-analyzer-data/
├── machines/
│   ├── index.json              # 機種一覧インデックス (v3.3)
│   ├── juggler/                # ジャグラー系
│   ├── hokuto/                 # 北斗系
│   ├── hanabi/                 # ハナビ系
│   └── {category}/{machine-id}.json # 各機種データ
├── schemas/
│   ├── machine.schema.json     # 機種データJSONスキーマ
│   └── index.schema.json       # インデックスJSONスキーマ
├── scripts/
│   ├── validate.mjs            # バリデーション実行
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

```json
{
  "version": "3.3",
  "updatedAt": "2026-03-27T00:00:00Z",
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
      "lastUpdated": "2026-03-27"
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
  "lastUpdated": "2026-03-27"
}
```

詳細な仕様は [docs/data-format.md](docs/data-format.md) を参照してください。

### 機種タイプ

| type | 説明 |
|------|------|
| A-type | ノーマルタイプ（ジャグラー等） |
| AT | AT機（最も多い） |
| ART | ART機 |
| BT | ボーナストリガータイプ |
| A+RT | A-type + RT |
| A+AT | A-type + AT |
| A+ART | A-type + ART |

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
| フィールド | 用途 |
|-----------|------|
| name, type | 機種情報表示 |
| roles[].probabilities | 小役確率カウンター |
| confirmationEvents | 確定演出チェッカー |
| zones | ゾーン別確率 |
| endScreenGroups | 終了画面判別 |
| settings / availableSettings | 設定段階の決定 |

### iOS側で未使用（自由に変更可能）
`trialSuccessRates`, `voiceCounts`, `musicCounts`, `effectCounts`, `modeTransitions`, `specialSettings`, `notes`, `source`

## 貢献方法

1. このリポジトリをフォーク
2. テンプレートを生成:
   ```bash
   node scripts/generate-template.mjs --name "機種名" --type AT --dir dirname --id machine-id
   ```
3. 生成されたテンプレートにデータを記入
4. `npm run validate` でエラー0件を確認
5. `npm test` でテスト通過を確認
6. プルリクエストを送信

詳細な手順は [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) を参照してください。

## バリデーション

```bash
npm run validate          # スキーマ・確率値・演出のバリデーション
npm run validate:schema   # スキーマチェックのみ
npm run validate:index    # index整合性チェックのみ
npm test                  # テスト実行（vitest）
npm run audit             # lastUpdated の鮮度チェック
```

### コード品質

```bash
npx eslint scripts/ tests/   # ESLint（スクリプト・テスト対象）
npx prettier --check .        # Prettier（フォーマットチェック）
```

ESLint と Prettier は devDependencies に含まれています。pre-commit フック（husky）によりコミット時に自動バリデーションが実行されます。

## 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | 貢献ガイド（環境構築、追加・修正手順、PRチェックリスト） |
| [docs/data-format.md](docs/data-format.md) | データ形式仕様（全フィールド詳細、実例） |
| [docs/quality-standards.md](docs/quality-standards.md) | 品質基準（Complete/Provisional/Incomplete定義、バリデーションルール） |
| [CHANGELOG.md](CHANGELOG.md) | 変更履歴（iOS互換性情報含む） |

## ライセンス

MIT License
