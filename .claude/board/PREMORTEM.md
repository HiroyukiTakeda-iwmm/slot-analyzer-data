# Pre-mortem Analysis - データ追加・品質強化

**日付**: 2026-04-09
**分析者**: failure-analyst

## 失敗シナリオ

| # | シナリオ名 | 失敗メカニズム | 影響度 | Kill Criteria |
|---|-----------|--------------|--------|--------------|
| FS-1 | 不正確データのサイレント混入 | 新台の速報値が後日修正→誤った設定推測→アプリ信頼性毀損 | Critical | 外部2サイト間で確率値5%以上乖離する機種あり |
| FS-2 | voiceCountsカバレッジ不均衡 | 新台追加で分母↑→27%→25%以下→UX品質低下 | High | voiceCounts 25%以下に低下 |
| FS-3 | index.jsonシンク崩壊 | 新台追加時のindex.json更新漏れ→アプリに配信不能 | High | index.json整合性エラー1件以上 |
| FS-4 | Provisional機種の永久放置 | 3台のProvisional→ユーザー困惑→低評価 | Medium | Provisional 5台以上 |
| FS-5 | スキーマ互換性破壊 | 新type/enum追加→iOS側未対応→クラッシュ | Critical(Black Swan) | schema.jsonのenum/required変更 |

## Kill Criteria 現在値

| KC-ID | 基準 | 現在値 | 判定 |
|-------|------|--------|------|
| KC-1 | 2サイト間確率値乖離5%以上 | 未測定 | WATCH |
| KC-2 | voiceCounts 25%以下 | 27% | WATCH |
| KC-3 | index.json整合性エラー | 0件 | GO |
| KC-4 | Provisional 5台以上 | 3台 | GO |
| KC-5 | スキーマenum変更 | 0回 | GO |

## 総合リスク評価

- **最大リスク**: FS-1（不正確データ混入）— 確率High × 影響Critical
- **推奨対策**: 新台データにnotes「速報値」明記、2サイトクロスチェック必須
- **GO/NO-GO推奨**: **CONDITIONAL GO**

## CEO判定

**CONDITIONAL GO を承認。以下の条件付き:**
1. 新台データにはnotesで「速報値」であることを明記
2. voiceCountsカバレッジ25%を割らない（新台追加と既存補完をセットで実施）
3. スキーマのenum/required変更は行わない
