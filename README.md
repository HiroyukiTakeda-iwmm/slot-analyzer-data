# SlotAnalyzer 機種データ

SlotAnalyzerアプリで使用する機種データのコミュニティリポジトリです。

## 使い方

1. SlotAnalyzerアプリを開く
2. 機種一覧タブ → 本のアイコン（ライブラリ）をタップ
3. 「コミュニティ」タブを選択
4. 追加したい機種を選択して「追加」

## ファイル構造

```
machines/
├── index.json          # 機種一覧インデックス
├── juggler/            # ジャグラー系
│   ├── my-juggler-v.json
│   └── aim-juggler-ex.json
├── hokuto/             # 北斗系
│   └── hokuto-ken.json
└── hanabi/             # ハナビ系
    └── shin-hanabi.json
```

## データ形式

### index.json

```json
{
  "version": "1.0",
  "updatedAt": "2026-01-28T00:00:00Z",
  "machines": [
    {
      "id": "unique-id",
      "name": "機種名",
      "type": "A-type",
      "author": "コミュニティ",
      "version": "1.0",
      "file": "folder/filename.json",
      "tags": ["タグ1", "タグ2"],
      "description": "説明"
    }
  ]
}
```

### 機種データ

```json
{
  "name": "機種名",
  "type": "A-type",
  "roles": [
    {
      "name": "小役名",
      "probabilities": { "1": 0.15, "6": 0.16 },
      "hasSettingDiff": true
    }
  ],
  "confirmationEvents": [...],
  "zones": [...],
  "endScreenGroups": [...]
}
```

## 貢献方法

1. このリポジトリをフォーク
2. 機種データを追加
3. プルリクエストを送信

## ライセンス

MIT License
