# Swarm PROGRESS - 最新台データ収集と設定情報反映

**開始日時**: 2026-04-30
**トラック**: Standard
**発動コマンド**: /swarm 最新台のデータ収集と最新発覚した設定データなどを調査してデータに反映してください
**親ブランチ**: audit/2026-04-24（前回監査の改善を継承）
**作業ブランチ**: feature/data-update-2026-04-30
**ultrathink**: 有効（情報源確度評価を厳格化）

---

## 目標

過去2-4週間の業界動向に基づき、以下を達成する:

1. **暫定追加機種の正式化**: animalslot-docchi（4/20導入）, milliongod-kiseki（4/20導入）の実機データ反映
2. **Provisional機種の解消**: kaguya-sama（rolesが空、解析公開待ち）の正式化検討
3. **新台追加**: 4月後半〜5月初旬の新規導入機種で確度が高いもの
4. **既存機種の設定情報更新**: 直近で新たに発覚した設定差・確定演出（既存144機種の精度向上）

---

## 現状

| 項目 | 値 |
|------|-----|
| 既存機種数 | 144 |
| Complete | 143 |
| Provisional | 1 (kaguya-sama: rolesが空) |
| Incomplete | 0 |
| バリデーション | 0 errors / 0 warnings |
| テスト | 130 passed (4 files) |
| index.json updatedAt | 2026-04-19 |
| 監査基盤 | npm audit 0 vulnerabilities, dependabot 設定済み |

---

## ultrathink: 情報源確度評価フレームワーク

「最新発覚した設定データ」を反映する際の**情報源優先順位**:

| 優先 | 情報源タイプ | 確度 | 具体例 |
|------|-------------|------|--------|
| 1 | メーカー公式 | 最高 | 公式サイト、機種紹介ページ、プレスリリース |
| 2 | 業界専門メディア | 高 | パチスロ関連メディアの公式解析記事 |
| 3 | 大手攻略サイト（実機解析） | 中-高 | サイト名+情報源URLが明記されている解析 |
| 4 | ホール検証データ（複数サイト一致） | 中 | 異なる2サイト以上で同一値の場合のみ採用 |
| 5 | 個人ブログ・ユーザー投稿 | 低 | 採用しない（参考のみ） |

**ultrathink 判断基準**:
- 確度1-2のみ → 即時反映（implementer に委譲）
- 確度3 → 単独情報源なら Provisional 扱い、2サイト以上で一致 → Complete
- 確度4 → 必ず "description" フィールドに「ホール検証ベース、サンプル数注意」を明記
- 確度5 → 採用せず、ISSUE化のみ

**保守戦略**: 不確実な情報を入れて 144機種データの信頼性を毀損するくらいなら、**何も追加しない方が安全**。プロジェクトの存在価値は「設定推測精度」であり、誤情報の混入は致命的。

---

## スコープ制御

### 監査対象
- 既コミットコード（feature/data-update-2026-04-30 ベース）
- machines/ 144機種のJSONデータ（本タスクで更新）
- index.json（machines数増減時）

### 監査対象外（前回監査と同じ、WIP のため触れない）
- scripts/migrate-v1-to-v2.mjs
- scripts/lib/
- tests/migrate-v1-to-v2.test.mjs, tests/slugify.test.mjs, tests/fixtures/
- .claude/agent-memory/

---

## Execution Plan（タスク分解）

### Smart Selection（5体起動予定）

| エージェント | 担当 | 出力先 |
|------------|------|--------|
| researcher (Track A) | 4/21〜5/上旬 新台情報リサーチ | `.claude/board/reviews/researcher-track-a-20260430.md` |
| researcher (Track B) | 暫定3機種の最新解析情報 | `.claude/board/reviews/researcher-track-b-20260430.md` |
| researcher (Track C) | 既存144機種の最新発覚設定差 | `.claude/board/reviews/researcher-track-c-20260430.md` |
| critic | 各researcherの情報確度評価 | `.claude/board/reviews/critic-20260430.md` |
| implementer | JSON データ更新（critic承認後） | data コミット群 |
| skeptical-evaluator | GAN 5軸評価 | `.claude/board/reviews/skeptical-evaluator-20260430.md` |

### 確定タスク

| # | タスク | 担当 | 依存 | 完了基準（Sprint Contract） |
|---|--------|------|------|----------------------------|
| 1 | 4月後半〜5月新台の調査 | researcher-A | なし | (1) 候補機種リスト出力 (2) 各候補に情報源URL付与 (3) 確度評価（1-5）付与 |
| 2 | 暫定3機種の正式情報調査 | researcher-B | なし | (1) animalslot-docchi の設定差確定情報 (2) milliongod-kiseki の同上 (3) kaguya-sama の roles 情報、いずれも URL 必須 |
| 3 | 既存144機種の最新設定差発覚調査 | researcher-C | なし | (1) 直近1ヶ月で発覚した変化の候補リスト (2) 影響機種ID + 変更内容 + URL |
| 4 | researcher 出力の確度評価 | critic | 1,2,3 | (1) 確度1-2のみリストに含む採用判定 (2) 採用しないものを ISSUE化候補に分類 |
| 5 | データ更新実装 | implementer | 4 | (1) JSON更新 (2) ajv schema validation pass (3) index.json と整合 (4) 既存テスト 130 pass 維持 |
| 6 | GAN 5軸評価 | skeptical-evaluator | 5 | (1) 全軸 7以上 (2) AI Slop検出 0件 (3) PASS バーディクト |

### Carlini 品質チェック

各完了基準が **Observable / Binary / Independent** を満たすか:
- (1) 「候補機種リスト出力」→ ファイル出力で観測可能 ✅
- (2) 「URL付与」→ URL が含まれているか grep で判定 ✅
- (3) 「確度評価付与」→ 数値1-5があるか確認 ✅
- (5)「JSON更新」→ git diff で変更検証 ✅
- (5)「schema validation pass」→ npm run validate exitcode 0 ✅
- (6) 「全軸 7以上」→ 数値スコアで Binary 判定 ✅

---

## Risks（Pre-mortem統合）

| # | リスク | Kill Criteria | 対策 |
|---|--------|-------------|------|
| 1 | researcher が確度の低い情報を採用してしまう | critic が確度1-2以外を全て弾く前に implementer が動く | implementer は critic 承認後のみ起動。順序厳守 |
| 2 | 4/20導入機種の解析が10日では不十分 | ホール検証サンプル数 < 5万G | description に「サンプル数 X G 時点の暫定値」明記、Provisional 維持 |
| 3 | 設定差データに誤りがあり iOS アプリで誤推測される | implementer が情報源URLを description に書かない | 各更新の description に「情報源: URL」を必須化 |
| 4 | 144機種JSONの誤った一括変更 | 機種データが意図せず複数変更 | 1コミット = 1機種または1論理的グループ。git diff で精査 |
| 5 | スキーマ変更が必要な情報発覚 | ajv バリデーションで新フィールド要求 | スキーマ変更は本タスクの範囲外。新フィールドが必要なら ISSUE化のみ |

GO/NO-GO: **CONDITIONAL-GO**（リスク1はワークフロー順序で対応、その他対策あり）

---

## Review Verdicts（Phase 1 結果、エージェントが追記）

<!-- researcher / critic 起動後に追記 -->

---

## Completed（実行結果）

- [2026-04-30] (CEO) Step 1 環境把握: ブランチ作成、現状確認、144機種ベースライン
- [2026-04-30] (researcher×3) Step 2/4 並列調査: Track A/B/C
- [2026-04-30] (CEO+critic) Step 3/4 確度評価: GREEN 4 / YELLOW 4 / RED 5 / ISSUE化 8
- [2026-04-30] (CEO) コミット 6401e85: animalslot-docchi 表記更新 + REGキャラ示唆3件追加
- [2026-04-30] (CEO) コミット 68f2d3e: milliongod-kiseki notes に小役7種追記
- [2026-04-30] (CEO) コミット e5d09ce: kaguya-sama description に CZ期待度追記
- [2026-04-30] (CEO) コミット 2593e7b: v3.7.0 - 5/11新台4機種追加
- [2026-04-30] (skeptical-evaluator) GAN 5軸 PASS: 平均 9.4/10、AI Slop 0件
- [2026-04-30] (CEO) Triple Verification 全通過
- [2026-04-30] (CEO) GitHub Issues #7-#10 作成（4件、follow-up タスク）

### 結果サマリー
- 機種数: 144 → **148** (+4)
- バージョン: 3.6.0 → **3.7.0**
- Complete: 143 / Provisional: 5 (kaguya-sama + 新4機種) / Incomplete: 0
- npm test: 130/130 pass
- npm run validate: 0 errors / 0 warnings
- npm audit: 0 vulnerabilities (前回監査の状態を維持)

---

## Failed Approaches

<!-- 失敗時に追記 -->

---

## QA Results（Phase 5 Triple Verification 後）

### Verification 1: Automated
- npm test: 130/130 pass (4 files) ✅
- npm run validate: エラー 0件 / 警告 0件 ✅
- npx eslint: エラー 0件 ✅
- npx prettier: 監査対象ファイル全て pass（WIP 2ファイルは対象外）✅
- npm audit: 0 vulnerabilities ✅

### Verification 2: Contract（全 6 完了基準充足）
- [x] 4 commits 作成（順序通り）
- [x] npm run validate エラー 0
- [x] npm test 全通過
- [x] quality report で 148機種 / Provisional 5件
- [x] id 衝突なし（事前 grep 確認 + 実コミット成功）
- [x] 既存 source 値の保持（FS-5 対策、git diff で確認）

### Verification 3: Regression
Pre-task baseline（130 tests, 0 errors, 144機種）維持。新規4機種追加で機種数 +4、テスト破壊ゼロ。

## GAN 評価結果

- skeptical-evaluator: **PASS**
- Correctness 9 / Design 9 / Craft 10 / Testability 10 / Security 9
- 平均: **9.4 / 10**
- AI Slop Scan: **0件検出**
- ULTRATHINK 評価: 保守戦略 10/10、FS-5対策 10/10、確度評価 10/10、iOS連携 9/10
- 詳細: `.claude/board/reviews/skeptical-evaluator-20260430.md`

---

# 第2弾 swarm: Track C / I2-I5 完遂 (2026-04-30)

**開始日時**: 2026-04-30（v3.7.0 直後）
**トラック**: Standard（保守バイアス強）
**作業ブランチ**: feature/data-update-2026-04-30-pt2
**親ブランチ**: feature/data-update-2026-04-30
**起動コマンド**: /swarm 最新台のデータ収集と最新発覚した設定データなどを調査してデータに反映してください
**ultrathink**: 有効

## 目標
前回 swarm で中断された Track C（既存148機種の最新発覚設定差調査）の完遂と、ISSUE化された I2-I5（animalslot-docchi / milliongod-kiseki 細部補完）の反映。

## ユーザー判断（AskUserQuestion 結果）
- BIRDIE WING (6/8): 今は追加せず FUTURE_ADDITIONS のみ更新（推奨案）
- ジャグラー系7機種: 別swarmに分離（推奨案）
- I8 URL統一: 別ISSUE維持（推奨案）

## Execution Plan
| # | タスク | 担当 | 結果 |
|---|--------|------|------|
| T1 | Track C 残り機種の設定差調査 | researcher-C2 | 採用ゼロ（保守原則） |
| T2 | I2-I5 細部補完情報調査 | researcher-B2 | I2/I3/I5 採用候補、I4 見送り |
| T3 | critic 確度評価 + FS-5 違反チェック | critic | CONCERN: I2 roles 降格、I5 銅銀除外 |
| T4 | implementer JSONデータ更新 | implementer | 2コミット (f1689c5, 71359cb) |
| T5 | FUTURE_ADDITIONS / ISSUES 更新 | CEO | 1コミット (302f346)、ISSUE 9件記録 |
| T6 | GAN 5軸評価 + Triple Verification | skeptical-evaluator + tester | PASS 平均 9.2/10、All Verification Pass |
| T7 | v3.7.0→v3.7.1 bump + CHANGELOG | CEO | 進行中 |

## Completed（実行結果・第2弾）
- [2026-04-30] (CEO) Step 1 環境把握: feature/data-update-2026-04-30-pt2 ブランチ作成
- [2026-04-30] (researcher-B2) Track B2: I2 採用、I3 部分採用、I5 採用、I4 見送り
- [2026-04-30] (researcher-C2) Track C2: 6機種すべて見送り（保守原則）
- [2026-04-30] (critic) GREEN 1 / YELLOW 2 / RED 3 / ISSUE 5、I5 銅銀の独立性疑義で除外、I2 roles 降格
- [2026-04-30] (implementer) コミット f1689c5: animalslot-docchi - ST終了画面3パターン追加 + チェリー/スイカtable notes整理
- [2026-04-30] (implementer) コミット 71359cb: milliongod-kiseki - ユニバプレート確定演出3色追加（銅銀除外）
- [2026-04-30] (CEO) コミット 302f346: FUTURE_ADDITIONS.md - BIRDIE WING優先度高昇格 + オープンISSUE 9件記録
- [2026-04-30] (skeptical-evaluator) GAN 5軸 PASS: 平均 9.2/10
- [2026-04-30] (tester) Triple Verification 全通過、FS-5 削除行数（許容外）0件

### 結果サマリー（第2弾）
- 機種数: 148 維持
- バージョン: 3.7.0 → **3.7.1** (T7で bump)
- Complete: 143 / Provisional: 5 (変動なし)
- 反映: animalslot-docchi (endScreens 3件追加 + notes整理)、milliongod-kiseki (confirmationEvents 3件追加)
- 採用ゼロ実績: Track C2 で6機種すべて見送り（保守原則の正常完了状態）
- 新規ISSUE記録: 9件（I1, I2-residual, I3-residual, I4-residual, I5-residual, I7, I8, I9, C2-bis）

### Failed Approaches（第2弾）
- **researcher-C2 第1版（agentId a8ffd23df94cc68e5）**: 元 Track C と同じ「全148機種を網羅探索」プロンプトで呼ぶと既登録チェックに時間を消費し、ファイル出力前に終了する傾向。第2版で「6機種に絞って深掘り」に変更してから完遂。
  - **学習**: researcher を広範囲に投げず、5-7機種にスコープを絞り「採用ゼロも成功」を明示すべき

## GAN 評価結果（第2弾）
- skeptical-evaluator: **PASS**（平均 9.2/10）
- Correctness 9 / Design 9 / Craft 8 / Testability 10 / Security 10
- AI Slop Scan: Critical/High/Medium 0件、Low 2件（FS-5リスク開示の意図的反復、許容範囲）
- ULTRATHINK 評価: 保守原則 10/10、FS-5対策 10/10、確度評価 9/10、iOS連携 9/10
- 詳細: `.claude/board/reviews/skeptical-evaluator-second-20260430.md`
