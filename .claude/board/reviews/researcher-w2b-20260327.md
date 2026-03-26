# researcher-w2b 検証レポート (2026-03-27)

## 対象: AT機 12機種（Wave 2-B）

## 検証結果サマリー

| # | 機種 | ファイル | 結果 | 修正 |
|---|------|---------|------|------|
| 1 | ありふれた職業で世界最強 | arifureta.json | **差異あり** | 初当り合算確率 設定5修正 |
| 2 | 座キングBACHO | iza-bancho.json | OK | lastUpdatedのみ |
| 3 | デビルメイクライ5 | dmc5.json | OK | lastUpdatedのみ |
| 4 | シン・エヴァンゲリオン | shin-eva.json | OK | lastUpdatedのみ |
| 5 | ゴブリンスレイヤーII | goblinslayer2.json | OK | lastUpdatedのみ |
| 6 | ストライク・ザ・ブラッド | striketheblood.json | OK | lastUpdatedのみ |
| 7 | 渡る世間は鬼ばかり | watakon.json | OK | lastUpdatedのみ |
| 8 | シャーマンキング | shamanking.json | OK | lastUpdatedのみ |
| 9 | スーパーブラックジャック | blackjack.json | OK | lastUpdatedのみ |
| 10 | 東京喰種 | tokyoghoul.json | OK | lastUpdatedのみ |
| 11 | アイマス ミリオンライブ | idolmaster-million.json | OK | lastUpdatedのみ |
| 12 | 麻雀物語 | mahjongmonogatari.json | OK | lastUpdatedのみ |

## 検証方法

- 各機種につき最低2サイト（一撃、ちょんぼりすた等）と照合
- roles[].probabilities の各設定値を ±0.000005 の許容範囲で比較
- confirmationEvents の網羅性を確認
- endScreens の整合性を確認

## 差異詳細

### arifureta.json — 初当り合算確率 設定5

| 項目 | 修正前 | 修正後 | ソース |
|------|--------|--------|--------|
| 初当り合算確率 設定5 | 0.005181 (≈1/193) | 0.004717 (≈1/212) | 一撃 スペック表 |

**発見経緯**: 設定5 (0.005181) > 設定6 (0.005102) となっており、初当り合算確率で設定5が設定6を上回るのは論理的に矛盾。一撃のスペック表で設定5は1/212と確認。

**修正内容**:
- `roles[5].probabilities["5"]`: 0.005181 → 0.004717
- `version`: "1.2" → "1.3"
- `lastUpdated`: "2026-03-25" → "2026-03-27"

## 各機種の検証詳細

### iza-bancho.json
- 弱チェリー 1/79.9、共通ベルA 設定1: 1/74.9 → 一撃・ちょんぼりすたと一致
- confirmationEvents: 藤丸コイン系・獲得枚数系を確認 → 問題なし

### dmc5.json
- チャンス目合算 1/12.8 (全設定共通 0.07813) → ちょんぼりすたと一致
- AT確率・ボーナス確率の設定差 → 一撃と一致

### shin-eva.json
- 作戦目 1/5.6 (0.17857 全設定共通) → 一撃・ちょんぼりすたと一致
- 小役確率全設定共通 → 問題なし

### goblinslayer2.json
- CZ確率・AT確率に設定差 → ちょんぼりすた・DMMぱちタウンと一致
- 弱チェリー 1/60.0、スイカ 1/79.9 全設定共通 → 一致

### striketheblood.json
- 小役確率全設定共通 → 一撃と一致
- エピソードポイント50pt獲得率の設定差 → 確認OK

### watakon.json
- 小役確率全設定共通 → ちょんぼりすたと一致
- trialSuccessRatesの値 → 問題なし

### shamanking.json
- 共通ベルA 設定1: 1/48.0 (0.02083) → 一撃・ちょんぼりすたと一致
- 弱チェリー 1/95.7、強チェリー 1/327.7 全設定共通 → 一致

### blackjack.json
- 斜めスイカ 設定1: 1/100 (0.01001)、設定6: 1/84 (0.01192) → 一撃・altemaと一致
- ケロットトロフィー系confirmationEvents → 網羅性OK

### tokyoghoul.json
- 下段リプレイ 設定1: 1/1260 (0.000794) → 一撃と一致
- 弱チェリー 1/70.3、強チェリー 1/356 全設定共通 → 一致

### idolmaster-million.json
- チェリー/スイカ/チャンスベル 全て1/85.7 (0.01167) → ちょんぼりすた・一撃と一致
- ケロットトロフィー系・ボーナス終了画面系 → 網羅性OK

### mahjongmonogatari.json
- 小役確率 → 一撃・ちょんぼりすたと一致
- endScreens → 問題なし

## 統計

- 検証機種数: 12
- 差異検出: 1件（arifureta 初当り合算確率 設定5）
- 修正済み: 1件
- lastUpdated更新: 12件（全機種 → "2026-03-27"）
- バージョンアップ: 1件（arifureta "1.2" → "1.3"）
