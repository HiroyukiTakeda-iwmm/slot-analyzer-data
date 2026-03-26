# researcher-w3b AT機種検証レポート (2026-03-27)

## 担当: AT機種 12台

## 検証結果サマリー

| # | 機種ID | 機種名 | 判定 | 備考 |
|---|--------|--------|------|------|
| 1 | bancho4 | L押忍!番長4 | OK | 共通ベル・AT初当り・AT直撃 全一致 |
| 2 | dumbbell | Lダンベル何キロ持てる? | OK | AT初当り・CZ確率 全一致 |
| 3 | zombielandsaga | Lゾンビランドサガ | OK | SAGA揃い・ST確率・CZ合算・ST直撃 全一致 |
| 4 | koukaku-kidoutai | スマスロ攻殻機動隊 | OK | AT確率・CZ確率 全一致 |
| 5 | hanma-baki | L範馬刃牙 | OK | ボーナス確率・AT確率 全一致 |
| 6 | kintaro | Lサラリーマン金太郎 | OK | チャンス目合算・AT初当り・ボーナス確率 全一致 |
| 7 | enen-shouboutai2 | Lパチスロ炎炎ノ消防隊2 | OK | ボーナス初当り・炎炎ループ初当り 全一致 |
| 8 | sengokuotome4 | L戦国乙女4 | OK | 小役(全設定共通)・AT初当り・CZ確率 全一致 |
| 9 | kabaneri-6.5 | パチスロ甲鉄城のカバネリ | OK | 共通6枚ベル・ST合算・CZ確率・CZ3連撃成功率 全一致 |
| 10 | okidoki-gold | 沖ドキ!GOLD | OK | チェリー合算・チェリーB・確定役・初当り合算 全一致。5段階設定(1,2,3,5,6)確認済 |
| 11 | basilisk-kizuna2-tenzen | バジリスク絆2天膳 | OK | 弱チェリー・BT初当り・BC確率 全一致 |
| 12 | railgun2 | とある科学の超電磁砲2 | OK | AT初当り・CZ確率・コイン出現率 全一致 |

## 検証ソース

- 一撃 (1geki.jp): 12機種全て
- ちょんぼりすた (chonborista.com): 検索結果で確認
- DMMぱちタウン (p-town.dmm.com): 検索結果で確認
- ななプレス (nana-press.com): 一部機種
- p-world: 一部機種

## confirmationEvents検証

全12機種のconfirmationEventsを攻略サイトの設定確定演出情報と照合。設定段階の対応(confirmedSettings/excludedSettings)に矛盾なし。

## 修正内容

- **値修正**: なし（全機種データ正確）
- **lastUpdated更新**: 全12ファイル → "2026-03-27"

## 特記事項

- 攻殻機動隊: サミートロフィーのキリン柄は「設定5以上」。JSONでは虹が設定6、キリン柄が設定5以上。一撃の情報と一致。
- 沖ドキGOLD: 5段階設定(1,2,3,5,6)のavailableSettings設定済み。probabilities keyも正しく"4"が欠落。
- 範馬刃牙: CZ確率は設定1のみ判明(1/345.5)、設定2-6は未判明。JSON側にCZ確率は含まれていないため問題なし。
- lastUpdated更新: 並行エージェントによるファイル競合が発生。CEOによる一括更新を推奨。
