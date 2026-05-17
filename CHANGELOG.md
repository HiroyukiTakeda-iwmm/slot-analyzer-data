# Changelog

slot-analyzer-data の変更履歴。iOS SlotAnalyzer アプリとの互換性情報を含む。

## [3.7.2] - 2026-05-16 (第4弾 swarm)

### 誤データ是正（GREEN・最優先）
- **godzilla-vs-eva** v1.1→1.2: AT終了画面「エヴァ&ゴジラ」の設定示唆を `[4,5,6]（設定4以上濃厚）` → `[5,6]（設定5以上濃厚）` へ修正、excludedSettings `[1,2,4]`。nana-press + p-town.dmm の確度1独立2源一致、現値を裏付ける情報源ゼロ（AT/ボーナス終了画面取り違えの構造仮説と整合）。iOS判別エンジンの誤推測を是正

### Provisional値差替（YELLOW・5/11新台、Provisional維持）
- **takt-opus-destiny** v1.0→1.1: AT初当たり設定2-5を線形補間値→確度2解析メディア（nana-press/chonborista）公表値へ差替（設定4の+6.6%乖離を是正）。導入5日でホール検証僅少のため Provisional 維持、description に確度2・サンプル僅少を明記（正式値化せず）
- **biohazard-re3** v1.0→1.1: AT初当たり設定2-5を確度2解析値へ差替 + 小役共通役6種を `roles` 追加（`hasSettingDiff:false`）。Provisional 維持
- **bakemonogatari** v1.2→1.3: 「解呪ノ儀200G到達時CZ当選率」を `trialSuccessRates` に追加（設定1:10%→6:20%、設定2-5線形補間明記）。nana-press確度1 + 1geki確度2 傾向一致。300G値は単独ソースのため未採用（ISSUE化）

### main投入前 第6弾超詳細レビュー訂正（2026-05-17・researcher 独立2ソース裏取り）
- **bakemonogatari**: 「解呪ノ儀200G到達時CZ当選率」設定2-5を線形補間値（2:0.12/3:0.14/4:0.16/5:0.18）→ 実2ソース確認値（2:0.10/3:0.104/4:0.15/5:0.175）へ訂正。nana-press 確度1 / altema 独立系列 / 1geki で再確認。端値（設定1:0.10・設定6:0.20）は2ソース確認済で不変。description を実値ベースへ更新、roles[] 不変（KC-2維持）
- **biohazard-re3**: AT初当たり確率 設定3を 0.002682 → 0.002683（1/372.7、nana-press/altema/chonborista 3ソース完全一致への丸め精緻化）。他設定値・role構造は不変
- **super-rio-ace2**: 初当たり確率 設定2-5 を線形補間値 → 実3ソース値（一撃/ちょんぼりすた/なな徹 独立一致）へ訂正（設定2: 1/281.9・設定3: 1/268.0・設定4: 1/238.9・設定5: 1/230.0、bakemonogatari型乖離是正）。description/notes/roles description の「導入前・未公開・線形補間暫定」stale文言を実態（導入済・3ソース確定・線形補間破棄）へ訂正。ケロットトロフィー 銅(設定2以上)/銀(設定3以上)/金(設定4以上)/ケロット柄(設定5以上) を `confirmationEvents` に純追加（big-dream 5段階形式準拠、虹は不変）。ボーナス直撃確率（特大設定差・設定1: 1/53905.6→設定6: 1/4326.7）を端点のみ description に散文記載（設定2-5実値未公開のため補間せず Provisional 明記）。roles[] 不変（KC-2維持）
- **big-dream-golden-pusher**: CZ突入確率 設定2-5（設定2: 1/333.3・設定3: 1/326.6・設定4: 1/316.4・設定5: 1/311.4）/ AT初当たり確率 設定2-5（設定2: 1/615.3・設定3: 1/599.1・設定4: 1/562.6・設定5: 1/551.1）を線形補間値 → 実3ソース値（一撃/ちょんぼりすた/p-town 独立一致）へ訂正。description/notes の「導入前・未公開・線形補間暫定」stale文言を実態へ訂正。終了画面/トロフィー/ボイスの定性示唆は3ソース整合済のため文言据置、roles[] 据置（小役設定差未公開・正）

### 定性示唆追加（YELLOW・出現率数値なし）
- **super-rio-ace2**: 小役共通役 `roles` 登録 + 終了画面/ケロットトロフィー/ボイス示唆を定性追加（confirmed/excludedSettings のみ、出現率未判明明記）。初当たり/CZ中間値は変更なし
- **big-dream-golden-pusher**: 終了画面6種/サミートロフィー5段階/獲得枚数/エンディングボイスを定性示唆追加（同上）

### 見送り（保守原則の正常結論・採用ゼロ）
- 5/12〜5/16 新台導入なし（GALFY 5/25導入予定は設定判別「調査中」のため I7 維持）
- kaguya-sama 小役設定差は3媒体未公表 → roles空維持
- 5/11新台4機種の機械割・示唆出現率は導入5日でサンプル僅少 → 数値化せず（2026-05-25 再評価）

### 品質ゲート
- skeptical-evaluator GAN 5軸評価: **PASS**（平均 9.2/10、Correctness 9 / Design 9 / Craft 9 / Testability 10 / Security 9）
- AI Slop Scan: Critical/High/Medium 検出ゼロ（Clean）
- Triple Verification: Pass（Automated 130 tests/0 errors + Contract ALL-PASS + Regression 維持）
- critic 確度評価: GREEN 1 / YELLOW 6 / RED 5 / ISSUE化 6（FS-5循環参照チェック実施、researcher-B「メーカー公式確度1-2」誇張を是正）

### FUTURE_ADDITIONS 同期 / オープンISSUE更新
- からくりサーカス2 導入日「2026-07-06 確定（検定通過済）」へ更新
- ULTRAMAN最終決戦ME（オッケー・5/15検定通過）を追跡項目追加
- godzilla-vs-eva 構造再設計（モスラ/カヲル未登録、AT/ボーナス終了画面取り違え）を高優先ISSUE化
- 完全性バリデータの Provisional 分類限界（roles付与でComplete誤分類）を ISSUE化
- bakemonogatari 解呪300G値（単独ソース要追検証）を ISSUE化

### 品質指標
- 機種数: 148 維持（新規追加なし）/ エラー0件・警告0件（維持）/ 130 tests pass（維持）

## [3.7.1] - 2026-04-30 (第2弾 swarm)

### 改訂（既存2機種、新規追加なし）
- **animalslot-docchi** v1.0→1.1: ST終了画面 No.174/555/666 を `endScreens[]` に正式登録（GREEN G-1、3サイト一致）。チェリー・スイカ確率テーブル（設定1-6）を `notes` 内「【小役設定別テーブル】」として整理（YELLOW Y-1、Tier3 2媒体一致だが独立検証未確立のため roles 降格）。FS-5 循環参照リスク開示を全 description に明記
- **milliongod-kiseki** v1.0→1.1: ユニバプレート色（金/花火/虹）を `confirmationEvents[]` に追加（YELLOW Y-2、機械割クロスチェック成立）。銅・銀は独立検証未成立のため見送り（RED R-1）。GG当選率設定3-6 は3媒体「調査中」のため見送り（RED R-2）

### 品質ゲート
- skeptical-evaluator GAN 5軸評価: **PASS**（平均 9.2/10、Correctness 9 / Design 9 / Craft 8 / Testability 10 / Security 10）
- AI Slop Scan: Critical/High/Medium 検出ゼロ（Low 2件は意図的反復）
- Triple Verification: Pass（Automated + Contract + Regression すべて Pass）
- FS-5 既存値保持: Pass（確率値・description 削除0件）

### FUTURE_ADDITIONS 同期
- 「現在の登録台数」を 144 → 148 に更新
- BIRDIE WING を「中→高」に昇格（2026-06-08 導入確定）
- GALFY (5/25導入予定) を低→中に追加
- Lミリオンゴッド を「→ milliongod-kiseki として登録済み」に更新
- オープンISSUE 9件を新セクションで体系的追跡開始（I1, I2-residual, I3-residual, I4-residual, I5-residual, I7, I8, I9, C2-bis）

### 品質指標
- エラー0件/警告0件（維持）
- 機種数148（変動なし）
- Complete 143 / Provisional 5（biohazard-re3, big-dream-golden-pusher, super-rio-ace2, takt-opus-destiny, kaguya-sama）

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（endScreens / confirmationEvents の値追加と notes 整理のみ）

## [3.6] - 2026-04-19

### 改訂（4機種 + メタ更新、新規追加なし）
- **yormungandr** v1.2→1.3: endScreens に「REG中キャラ紹介 赤/金グループ」を追加。description/notes に筐体上部ランプ色示唆（紫=設定5以上/虹=設定6、要検証）と 450G 天井短縮抽選を追記
- **hokuto-tensei2** v1.3→1.4: modeTransitions に「朝一256G以内AT当選率」を追加（rates は未公開のため description のみ、設定6で50%以上）。notes で朝一AT当選優遇を補足
- **rezero2-pack-rem** v1.1→1.2: 死に戻り率の description に一撃・アルテマで報告された差異値（7%→19%）を要検証注記として記載。数値は据え置き。source にアルテマを追加
- **hokuto-ken** v1.2（notes 追記のみ、lastUpdated のみ更新）: BB終了後サブ液晶タッチでのキャラボイス示唆は一撃1ソースのみ情報のため未反映、2ソース目で検証後に反映予定

### FUTURE_ADDITIONS 同期
- ヘッダーを「138台 v3.3」→「144台 v3.6」に同期
- 呪術廻戦を「追加候補」→「除外理由」セクションに移動（2026-04時点で検定通過情報なし）
- からくりサーカス2 の導入日矛盾を「要検証（7月説 vs 4/13説）」に変更
- スマスロ BIRDIE WING を「2026-06-08 導入確定」に更新

### 品質指標
- エラー0件/警告0件（維持）
- 機種数144（変動なし）

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（confirmationEvents / endScreens / modeTransitions / notes の値追加のみ）

## [3.3] - 2026-03-27

### 追加 (2台: 136台→138台)
- **shinuchi-yoshimune** (L真打吉宗) — AT, 6段階（導入前暫定データ）
- **yormungandr** (スマスロヨルムンガンド) — AT, 6段階（解析未公開）

### 大規模品質改善
- **trialSuccessRates 100%達成**（全138台）
- **endScreens 87%達成**（120/138台）
- confirmationEvents追加（バベル・ニューパルサーBT・スターハナハナ）
- 既存機種補完（ToLOVEるダークネス、ヴァルヴレイヴ2、新ハナビ等）
- バージョン一括更新: v1.0/0.2の22台をv1.1/1.0に更新

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（値の修正とエントリ追加のみ）

## [3.2] - 2026-03-27

### 追加 (11台: 125台→136台)
- **nyanko-daisensou** (Lにゃんこ大戦争 超神速) — AT, 5段階(1,2,4,5,6)
- **hanagasa** (L花笠) — AT, 5段階(1,2,4,5,6)
- **magical-halloween-bt** (マジカルハロウィン ボーナストリガー) — BT, 4段階(1,2,5,6)
- **druaga** (SLOT ドルアーガの塔) — AT, 4段階(1,2,5,6)
- **sf5** (スマスロ ストリートファイターV) — AT, 6段階
- **sister-quest** (Lシスタークエスト) — AT, 6段階
- **nanatsu-no-tsurugi** (L七つの魔剣が支配する) — AT, 6段階
- **ushiotora-vh** (Lうしおととら 白面決戦VH) — AT, 6段階
- **kamen-rider-denoh** (L仮面ライダー電王) — AT, 5段階(1,2,4,5,6)
- **okisuro-amazing-live** (スマート沖スロ アメイジングライブ) — AT, 5段階(1,2,4,5,6)
- **1000chan-a** (LBパチスロ1000ちゃんA) — A+AT, 4段階(1,2,5,6)

### 品質改善 (既存8台)
- gineiden-dnt: roles追加 + description
- kaguya-sama: trialSuccessRates追加
- bofuri, persona5, keiji-sado, toaru-index, tate-no-yusha: description追加
- new-king-hanahana-v: 30パイ版notes追加

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（値の修正とエントリ追加のみ）

## [3.1] - 2026-03-27

### 検証済み
- **全122台のデータをクロス検証完了**（2ソース以上で照合）
- 検証ソース: 一撃、ちょんぼりすた、DMMぱちタウン、ななプレス、パチマガスロマガ、HAZUSE DATA、パイオニア公式PDF等
- 検証精度: 確率値の許容誤差 ±0.000005

### 追加 (3台: 122台→125台)
- **koukaku-sumaslo** (スマスロ攻殻機動隊) — AT, 6段階, サミー, 2026年2月導入
- **burning-express** (バーニングエクスプレス) — AT, 5段階(1,2,4,5,6), 北電子, 2025年12月導入
- **onepunchman** (Lワンパンマン) — AT, 6段階, ニューギン, 2024年8月導入

### 修正 (4台)
- **kabaneri-unato** (v1.3): チャンス目3種の確率値を修正（旧作6.5号機のデータ混入）+ 下段ベル追加
- **arifureta** (v1.3): 初当り合算確率の設定5を修正（設定5>設定6の論理矛盾）
- **seiya-meiou-fukkatsu** (v1.1): バージョン更新
- **fujiko-bt** (v1.3): 小役確率の精度を4桁→6桁に向上

### iOS互換性
- **破壊的変更: なし**
- 構造変更: なし（値の修正とエントリ追加のみ）
- 新フィールド: なし
- 全125台の lastUpdated を 2026-03-27 に更新
- availableSettings の新パターン: burning-express は ["1","2","4","5","6"]（5段階設定）

## [3.0] - 2026-03-26

### 追加 (10台: 112台→122台)
- koukaku-sac2045, godzilla-vs-eva, rezero2-pack-rem, symphogear, gundam-unicorn2
- bofuri, persona5, keiji-sado, toaru-index, tate-no-yusha

### iOS互換性
- 破壊的変更: なし
- 5段階設定(1,2,4,5,6)の機種が追加: godzilla-vs-eva, symphogear
- gundam-unicorn2 は v0.1 暫定データ（2026/4/20導入予定）

## [2.9] - 2026-03-25

### 追加
- smaslo-thunderv, darlifra, saki-choujou-kessen

## [2.5-2.8] - 2026-02

### 追加
- 93台→112台への段階的追加
- 全100台検証プロジェクト Phase 0-1 完了（13台検証）
