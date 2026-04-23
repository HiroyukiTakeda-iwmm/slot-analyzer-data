# Documentation & DX 監査結果（E軸）

**監査日**: 2026-04-24
**監査者**: CEO直接監査（doc-updaterエージェント中断のため補完）

## ドキュメント棚卸し

| ファイル                    | 存在 | 行数  | 最新性                                              |
| --------------------------- | ---- | ----- | --------------------------------------------------- |
| README.md                   | ✅   | 203   | ❌ **v3.3 (138機種) のまま。現行 v3.6.0 (144機種)** |
| docs/CONTRIBUTING.md        | ✅   | 約100 | 未確認（要詳細レビュー）                            |
| docs/data-format.md         | ✅   | 約300 | 未確認                                              |
| docs/quality-standards.md   | ✅   | 約180 | 未確認                                              |
| CHANGELOG.md                | ⚠️   | -     | 初期偵察では確認されたがコミット有無不明            |
| .claude/skills/slot-data.md | ✅   | 97    | -                                                   |
| CONTRIBUTING.md (ルート)    | ❌   | -     | ルート直下にはなし（docs/ 内）                      |
| .env.example                | -    | -     | 不要（環境変数なし）                                |

## セットアップ手順再現性

README.md のセットアップ手順:

1. `git clone` - 明記
2. `npm install` - **明記なし**（直接書かれていない）
3. `npm run validate` - 明記
4. `npm test` - **明記なし**（README ではなく docs/CONTRIBUTING.md にある想定）

**メンタルシミュレーション結果**: 新規コントリビューターが README 単独で完全セットアップするには情報不足。package.json を見れば分かるが、README に明示的手順があるべき。

## 発見事項

### [深刻度: High] README.md がバージョン遅延

**場所**: `README.md:5` 付近
**問題**: 「現在の登録台数: 138台 (v3.3, 2026-03-27更新)」と表示。現行 package.json は v3.6.0、index.json は 144機種。バージョン番号が 3世代遅れ（v3.3 → v3.4 → v3.5 → v3.6）。
**根拠**:

- `README.md` 先頭: 「v3.3」「138台」
- `package.json`: "version": "3.6.0"
- `machines/index.json`: 144機種 (2026-04-19 更新)

**推奨対応**: README の「現在の登録台数」「品質指標」セクションを v3.6.0 に更新。機種数 144台、達成率は最新の quality-report.mjs 出力から取得。

### [深刻度: Medium] README に `npm install` 明示なし

**場所**: `README.md` 全体
**問題**: セットアップ手順セクションがなく、iOS アプリからの使い方のみ記載。開発者向け手順が docs/CONTRIBUTING.md に分散しており、README からリンクが辿りにくい。
**根拠**: `head -80 README.md` で「使い方」はあるが「開発セットアップ」セクションなし
**推奨対応**: README に「## 開発者向け」セクションを追加し、`npm install → npm run validate → npm test` の手順と docs/CONTRIBUTING.md へのリンクを明示。

### [深刻度: Low] 主要 validators の JSDoc 欠落

**場所**: scripts/validators/ 以下の 4ファイル（C軸と重複）
**問題**: C軸発見と同じ。public export 関数にドキュメントコメントがない。
**根拠**: `grep -c "@param\|@returns\|/\*\*" scripts/validators/*.mjs` → 多くが 0
**推奨対応**: Phase 4 で validators に最小限の JSDoc 追加。

### [深刻度: Low] package.json に `author` フィールドなし

**場所**: `package.json`
**問題**: `"author"` キーなし。OSS リポジトリとしてメタデータ不完全。
**根拠**: `cat package.json` 確認
**推奨対応**: `"author": "Hiroyuki Takeda (iWMM)"` 等を追加（OSS 公開前に必要）。

## 該当なしの軸

- **.env.example と実コード差分**: `grep process.env scripts/*.mjs` → 0件。環境変数不使用のため .env.example 不要 ✅
- **TODO/FIXME in docs**: docs/ と README に未解決コメントなし ✅
- **.claude/skills/slot-data.md**: 存在、ワークフロー記述あり ✅
- **package.json metadata**: name, version, description, keywords, repository, engines, license 設定済み（author 以外）

## 総合バーディクト

doc-updater (CEO代理): BLOCK - README が3世代遅れで機種数・バージョンが誤り。新規貢献者を誤誘導するレベル。最優先修正対象。
