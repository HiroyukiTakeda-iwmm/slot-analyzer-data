# slot-analyzer-data

パチスロ機種マスタデータ（JSON）リポジトリ。slot-analyzer Android/iOS が参照する機種データの**単一の真実のソース**。

## プロジェクト概要

| 項目 | 値 |
|------|-----|
| 種別 | データのみ（JSON 機種マスタ）。アプリコードは含まない |
| 消費側 | `slot-analyzer_android` / `slot-analyzer-ios`（QR/インポート経由） |
| 検証 | スキーマ整合・確率値の妥当性（small/big 役の分母など） |

## 役割

- 機種ごとの設定別小役確率・確定演出・ゲームゾーン定義を JSON で管理
- データ追加・修正時はスキーマ整合性とアプリ側の QR/インポート互換（v1/v3 形式）を維持する
- 大量データ作業時は `slot-analyzer-data-temp/` を一時フォルダとして使用

## 推奨ハーネス（Skill/MCP）

| 設定 | 状態・理由 |
|------|-----------|
| serena MCP | `.mcp.json` で **無効**（disabled）。コードシンボルを持たないデータのみ repo のため LSP 解析対象が存在せず、有効化はノイズになる |
| chrome-devtools MCP | `.mcp.json` で無効（データ repo に不要） |
| Skill / LSP プラグイン | 全プロジェクト自動有効。データ検証は `/swarm`（Standard）でスキーマ整合を Triple Verification 推奨 |

## 禁止事項

- スキーマを破壊する不可逆な一括変換（変換前に必ずバックアップ）
- アプリ側 QR 形式（v1/v3）との互換を壊す変更を検証なしでコミット
