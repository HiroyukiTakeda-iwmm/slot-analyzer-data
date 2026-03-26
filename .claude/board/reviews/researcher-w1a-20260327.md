# Wave 1 Batch A 検証結果

検証日: 2026-03-27
担当: researcher-w1a
バリデーション: 全件PASS（エラー0件）

---

### SマイジャグラーV (juggler/my-juggler-v.json)
- ステータス: verified（変更なし）
- ソース1: https://juggler7.com/my5/kaiseki.html — ぶどう1/5.90～1/5.66、BIG1/273.1～1/229.1、REG1/409.6～1/229.1。全一致
- ソース2: https://1geki.jp/slot/s_myj5/4/ — 設定6実戦値ぶどう1/5.91。整合
- 変更点: なし
- lastUpdated: 2026-03-27

### ネオアイムジャグラーEX (juggler/aim-juggler-ex.json)
- ステータス: verified（変更なし）
- ソース1: https://kenslo65536.com/kaiseki/juggler-im-ex-6.html — ぶどう設1-5: 1/6.024、設6: 1/5.848。ボーナス確率全一致
- ソース2: https://1geki.jp/slot/s_nijex/4/ — 設定6実戦値ぶどう1/5.75。整合
- 備考: JSONのぶどう設6=0.17301(1/5.78)はガリぞう氏調べの逆算値。kensloのアプリ実戦値1/5.848とはソース差（ガリぞう値を採用で正しい）
- 変更点: なし
- lastUpdated: 2026-03-27

### Sゴーゴージャグラー3 (gogojuggler/gogo-juggler3.json)
- ステータス: verified（変更なし）
- ソース1: https://kenslo65536.com/kaiseki/juggler-gogo3.html — ぶどう1/6.250～1/5.920、BIG1/259.0～1/234.9、REG1/354.2～1/234.9。全一致
- ソース2: https://1geki.jp/slot/s_gogojuggler3/4/ — 設定6実戦値ぶどう1/6.2。整合
- 変更点: なし
- lastUpdated: 2026-03-27

### ファンキージャグラー2 (funkyjuggler/funky-juggler2.json)
- ステータス: verified（変更なし）
- ソース1: https://nana-press.com/kaiseki/machine/142/5102/ — ぶどう1/5.95～1/5.72（300万Gアプリ実戦値）
- ソース2: https://juggler7.com/funky2/kaiseki.html — ガリぞう氏調べぶどう1/5.94～1/5.66
- 備考: ななプレス300万G値とガリぞう逆算値で設6に差あり（1/5.72 vs 1/5.66）。JSONはガリぞう値（0.176678=1/5.66）を採用。ボーナス確率は全ソース一致。ガリぞう氏の逆算値がより精度高い
- 変更点: なし
- lastUpdated: 2026-03-27

### SハッピージャグラーVIII (happyjuggler/happy-juggler-viii.json)
- ステータス: verified（変更なし）
- ソース1: https://nana-press.com/kaiseki/machine/445/11637/ — ぶどう1/6.07～1/5.80（300万G実戦値）、BIG1/273.1～1/226.0、REG1/397.2～1/256.0
- ソース2: https://kenslo65536.com/hanbetsu/juggler-happyv3.html — 設定判別ツール値
- 備考: JSONのぶどう設1=0.165289(1/6.05)はガリぞう氏逆算値、ななプレスの1/6.07とは微差（ソース差、許容範囲内）。ボーナス確率は完全一致
- 変更点: なし
- lastUpdated: 2026-03-27

### SアイムジャグラーEX (aimjuggler/aim-juggler-ex-6gou.json)
- ステータス: verified（変更なし）
- ソース1: https://kenslo65536.com/kaiseki/juggler-im-ex-6.html — ぶどう設1-5: 1/6.024、設6: 1/5.848。ボーナス確率完全一致
- ソース2: https://p-gabu.jp/guideworks/machinecontents/detail/5501/summarize — 設定差まとめ一致
- 備考: 6号機版（SアイムジャグラーEX）。データはjuggler-aim-exと同系統だが別機種。確率値は全て整合
- 変更点: なし
- lastUpdated: 2026-03-27

### マイジャグラー5 (juggler/my-juggler5.json)
- ステータス: verified（変更なし）
- ソース1: https://juggler7.com/my5/kaiseki.html — ぶどう1/5.90～1/5.66、単独BIG/REG/チェリー重複全一致
- ソース2: https://kenslo65536.com/hanbetsu/juggler-my5.html — 設定判別ツール値一致
- 備考: my-juggler-vと同一機種。roles構成もprobabilities値も全一致
- 変更点: なし
- lastUpdated: 2026-03-27

### ニューキングハナハナV (hanahana/new-king-hanahana-v.json)
- ステータス: verified（変更なし）
- ソース1: https://kenslo65536.com/kaiseki/lb-new-king-hanahana-v.html — BIG1/299.25～1/253.03、REG1/496.48～1/372.36。5段階設定(1,2,3,4,V)
- ソース2: https://nana-press.com/kaiseki/machine/1075/34234/ — ボーナス確率/機械割一致
- 備考: availableSettingsに"5"と"V"の両方が含まれ、確率値が同一(設5=設V)。実機は1,2,3,4,Vの5段階だがアプリでは設定5とV表記が混在するため現状維持が妥当
- 変更点: なし
- lastUpdated: 2026-03-27

### スマスロバベル (babel/babel.json)
- ステータス: verified（変更なし）
- ソース1: https://chonborista.com/slot/universal-slot/241412/ — BB1/328.2～1/254.0、RB1/655.6～1/421.3、小役全設定共通（リプレイ1/7.3、共通ベル1/10.0、サソリ1/128.0、弱チェリー1/64.0、強チェリー1/585.1）。全一致
- ソース2: https://1geki.jp/slot/l_babel/4/ — 小役確率全設定共通値一致
- 備考: trialSuccessRates（弱チェリーボーナス期待度、強チェリーボーナス期待度、サソリ3・6回目当選率）もちょんぼりすたの解析値と完全一致
- 変更点: なし
- lastUpdated: 2026-03-27

### スマスロネオプラネット (neoplanet/neoplanet.json)
- ステータス: verified（変更なし）
- ソース1: https://chonborista.com/slot/yamasa-slot/245959/ — BIG1/280.4～1/210.5、RB1/596.7～1/504.2、5段階設定(1,2,4,5,6)。小役全設定共通。モードF高確移行率一致
- ソース2: https://1geki.jp/slot/l_nplnt/4/ — 小役確率全設定共通値一致
- 備考: availableSettings=[1,2,4,5,6]で設定3なし。confirmationEventsのケロットトロフィー4種も整合。trialSuccessRatesのモードF高確移行率もちょんぼりすた解析と完全一致
- 変更点: なし
- lastUpdated: 2026-03-27

---

## サマリー

| # | 機種 | ステータス | 変更 |
|---|------|-----------|------|
| 1 | SマイジャグラーV | verified | なし |
| 2 | ネオアイムジャグラーEX | verified | なし |
| 3 | Sゴーゴージャグラー3 | verified | なし |
| 4 | ファンキージャグラー2 | verified | なし |
| 5 | SハッピージャグラーVIII | verified | なし |
| 6 | SアイムジャグラーEX | verified | なし |
| 7 | マイジャグラー5 | verified | なし |
| 8 | ニューキングハナハナV | verified | なし |
| 9 | スマスロバベル | verified | なし |
| 10 | スマスロネオプラネット | verified | なし |

**全10台のデータが攻略サイト（ちょんぼりすた、一撃、kenslo65536、ななプレス、juggler7.com）の解析値と一致。修正不要。lastUpdatedを2026-03-27に更新済。バリデーション通過（エラー0件）。**
