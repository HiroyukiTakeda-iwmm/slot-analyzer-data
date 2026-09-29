# 貢献ガイド

slot-analyzer-data への貢献方法について説明します。

## 環境構築

### 前提条件

- Node.js 20.0.0 以上
- npm

### セットアップ

```bash
git clone https://github.com/HiroyukiTakeda-iwmm/slot-analyzer-data.git
cd slot-analyzer-data
npm install
```

### 動作確認

```bash
npm run validate   # バリデーション実行（エラー0件を確認）
npm test           # テスト実行（全テスト通過を確認）
```

## 新機種の追加手順

### 1. テンプレート生成

```bash
node scripts/generate-template.mjs \
  --name "機種名" \
  --type AT \
  --dir category-name \
  --id machine-id \
  --settings 1,2,3,4,5,6
```

**パラメータ:**

| パラメータ   | 必須   | 説明                                | 例                                                   |
| ------------ | ------ | ----------------------------------- | ---------------------------------------------------- |
| `--name`     | はい   | 機種の正式名称                      | `"スマスロ攻殻機動隊"`                               |
| `--type`     | はい   | 機種タイプ                          | `AT`, `A-type`, `BT`, `ART`, `A+AT`, `A+RT`, `A+ART` |
| `--dir`      | はい   | カテゴリディレクトリ名              | `koukaku`, `juggler`                                 |
| `--id`       | はい   | 機種ID（kebab-case）                | `koukaku-sumaslo`                                    |
| `--settings` | いいえ | 設定段階（デフォルト: 1,2,3,4,5,6） | `1,2,4,5,6`                                          |

### 2. データ記入

生成されたテンプレート（`machines/{dir}/{id}.json`）を編集し、以下のデータを記入します。

**必須データ:**

- `roles` — 小役確率（全設定分）
- `description` — 機種の設定差概要

**推奨データ:**

- `confirmationEvents` — 設定確定演出
- `endScreens` / `endScreenGroups` — 終了画面・示唆演出
- `trialSuccessRates` — CZ/AT当選率
- `voiceCounts` — ボイス示唆

**データ収集チェックリスト:**

- [ ] 小役確率（全設定）を2サイト以上でクロスチェック
- [ ] 設定確定演出を収集
- [ ] 終了画面/示唆演出を収集
- [ ] CZ/AT当選率を収集
- [ ] ボイス示唆を収集
- [ ] description を記述

### 3. index.json にエントリ追加

テンプレート生成時にコンソールに出力されるエントリを `machines/index.json` の `machines` 配列に追加します。

### 3-2. 出典記録を作る

`provenance/{id}.json` に、出典（URL と取得日）と項目ごとの値を記録します。記録を置く機種では、機種ファイルのすべての項目を `items` に書きます（1項目でも欠けると validate が止めます）。形は [data-format.md](data-format.md) の「provenance（出典記録）」、採否の基準は [quality-standards.md](quality-standards.md) の「出典と採否の基準」を見てください。

#### 記録の手順（抜き出し → 読み直し → 照合 → 下書き）

出典の値は、先に作業メモ（リポジトリの外。形は [data-format.md](data-format.md) の「抜き出し・読み直しのメモ」）に写し、道具で採否を決めてから記録にします。

1. 抜き出し: 出典のページから、項目ごとに出典ごとの値を `<機種ID>.extract.json` に写す。既存の機種では、機種ファイルのすべての項目を書く（どの出典にも無かった項目は `values: {}`）
2. 読み直し: 抜き出しをしていない担当が、機種名・出典の URL・項目名だけを渡されて `<機種ID>.reread.json` を書く
3. 照合: `node scripts/reread-compare.mjs <抜き出しのメモ> <読み直しのメモ>` が終了コード 0 になるまで、食い違った項目のページを読み、どちらの読み違いかを決めてメモを直す
4. 下書き: `node scripts/provenance-draft.mjs <抜き出しのメモ> --reread <読み直しのメモ>`。終了コード 0 のとき、標準出力の `record` が出典記録の下書き、`machineValues` が機種ファイルに書く値。標準エラーの候補（採用しない項目）・外す項目・注意・読めなかったページを確かめる
   - 終了コード 1 のときは下書きを出さない。標準エラーの理由を直して作り直す（止めるときの一覧は [data-format.md](data-format.md) の「記録の下書き」）。たとえば、ちょんぼりすたの読み直しが抜き出しと合わない（先に手順3を終了コード 0 にする）、出典の確かめに合わない、既存の機種でメモが機種ファイルと合わない（`patterns` のある終了画面は、先に下の「データ修正手順」のとおり書き直す）、外す項目があるのに読み直しが要る、読めなかったページがあるのに外す項目がある（読めてから作り直す。読めなかった出典の値を「無い」として外さない）
   - 注意（外した ID の台帳の ID を使うことになりそうな項目）では止まらない。その項目を機種ファイルに足すときは、台帳に無い明示の別の `id` を付ける（最後の判断は validate）
5. 機種ファイルに `machineValues` の値を書く。`value` の形は unit で決まり、書く欄は次のとおり
   - 数値（`denominator`・`percent`）: `value` は設定ごとの確率（0〜1。確定・暫定は採用値を有効数字6桁にした値、`kept-single-source` は今の値のまま）。項目の `probabilities` に書く。モード移行は `rates`、最上位の終了画面で今 `distribution` を使っている項目は `distribution` に書く（`probabilities` を足さない。validate はどちらも確率として読む）
   - 設定の組（`settings`）: `value` は `{ confirmed, excluded }`。`confirmed` を `confirmedSettings` に、`excluded` を `excludedSettings` に書く
   - 有無（`presence`）: `value` は `true`。書く値は無い（項目を機種ファイルに置くだけ）
   - 役・ゾーンの役の `hasSettingDiff` は確率に合わせる: 全設定が同じ確率なら `false`、違えば `true`（合わないと validate が止めます）
   - 外す項目は消し、新しく足す確定演出などには明示の `id` を付ける。`record` を `provenance/{id}.json` に置く（`reviewedAt` は PR の日付に合わせる）

終了コードの 1 と 2 の範囲は2つの道具で違います。

- `reread-compare`: 0 = すべて一致、1 = 食い違いか抜けがある（照合する行が無いときも）、2 = 照合できない（メモを読めない・形に合わない、抜き出しの値が unit の形に合わない、抜き出しの `values` の出典キーが `sources` に無い（`sources` に同じキーが2つある）、機種 ID が違う、同じ項目の行が2つある、引数の誤り）
- `provenance-draft`: 0 = 下書きを出した、1 = 下書きを出さない（手順4の「終了コード 1」。メモの形の誤りもここ）、2 = 読めない・道具の誤り（メモ・`index.json`・機種ファイル・今の出典記録・公式ドメインの一覧を読めない、今の出典記録が形に合わないか `machineId` が違う、公式ドメインの一覧に問題がある、引数の誤り、下書きが出典記録の形に合わないなどの道具の誤り）

#### 公式ドメインの一覧に足す

メーカー公式（`kind: "official"`）の出典は、URL のサイト（登録ドメイン）が `config/official-domains.json` にあるときだけ使えます（無ければ validate が止めます）。一覧に無いメーカーの公式ページを初めて出典にするときは、同じ PR で一覧に足します。

1. メーカーの会社情報のページ（会社概要など）を開き、そのドメインがメーカーのものだと確かめる（出典のページのドメインと、会社情報のページのドメインが同じメーカーのものか）
2. `domains` に1行足す: `domain` は登録ドメインそのもの（小文字。`www.`・サブドメインを付けない。`https://www.sammy.co.jp/...` なら `sammy.co.jp`）、`maker` はメーカー名、`evidence` は確かめた会社情報のページの URL（https）、`checkedAt` は確かめた日
   - 共有のドメイン（`github.io`・`hatenablog.com` などのブログ・ホスティングのサービス）は足さない。サイトは登録ドメインで数えるので、足すとそのサービスのすべてのページが公式になる。メーカーのページがそこにしか無ければ、公式の出典にしない
   - `evidence` の URL に日本語などが入るときは、パーセントエンコードした形で書く（ブラウザのアドレス欄から写した形。スキーマの `format: uri` は、日本語をそのまま書いた URL を通さない）
3. `npm run validate` の「公式ドメインの一覧」の節がエラー0件になることを確かめる（重複・`www.` 付き・形の誤りは止まります）

足した行は PR の差分に出るので、本人がマージ前に `evidence` のページを見て確かめられます。形は [data-format.md](data-format.md) の「メーカーの公式ドメインの一覧」を見てください。

### 4. バリデーション

```bash
npm run validate   # スキーマ・確率値・演出・出典記録のバリデーション
npm test           # テスト実行
npm run check:base # main と比べる（アプリが作る ID・採否ルール）（先に git fetch origin で main を最新にする）
```

エラー0件、テスト全通過を確認してください。

### 5. コミット・PR

```bash
git add machines/{dir}/{id}.json machines/index.json provenance/{id}.json
git commit -m "feat(machines): {機種名}を追加"
```

## データ修正手順

既存の機種データを修正する場合は、以下のルールに従ってください。

出典記録（`provenance/{id}.json`）がある機種で値を変えたら、記録も直します（機種ファイルと記録が食い違うと validate が止めます）。記録がまだ無い機種は、段階2の見直しで記録を作るまでは、記録なしで直してかまいません（全機種で必須にするのは段階3）。項目を外すときは、記録の有無にかかわらず、その機種の出典記録（全項目）を作ってから `removed` に書きます（外した項目が `removed` に無いと `npm run check:base` が止めます）。ID を持つ項目（[data-format.md](data-format.md) の「外した項目（removed）と外した ID の台帳（retiredIds）」）を外すときは、`removed` の `appId` と同じ行を `retiredIds` に足します。`retiredIds` は消しません（外した項目を足し直すときも残し、足し直す項目には明示の別の `id` を付けます。`removed` からは消します）。既存の項目の名前と `displayOrder` は変えないでください（アプリが作る ID が変わり、利用者の記録とのつながりが切れます）。確定演出・試行成功率・ボイス・楽曲・演出・モード移行を足すときは明示の `id` を付け、今ある `id` は変えないでください（アプリはこの `id` で利用者の記録を結びます。詳しくは [data-format.md](data-format.md) の「アプリの ID（ID を持つ項目）」）。

終了画面に `patterns`（レガシー形式）がある機種を見直すときは、先に `node scripts/expand-patterns.mjs machines/{dir}/{id}.json --write` で普通の終了画面に書き直します（値もアプリが読む形も同じなので、この書き直しだけでは `version` と `lastUpdated` を変えません（版は上げない）。ただしアプリはファイルの中身の違いで「更新」を知らせます（取り込み直しても推定の結果は同じ）。詳しくは [data-format.md](data-format.md) の「patterns 形式（レガシー）」）。書き直しと値の見直しは同じ PR でかまいません（`npm run check:base` は main の `patterns` を同じ計算で書き直してから比べるので、書き直した終了画面を外す・残すこともできます。`patterns` の親をそのまま外すことはできません）。ボイスの `patterns` は記録できません（扱いは段階2で決めます）。

### version の更新ルール

| 変更内容                 | バージョン更新    | 例        |
| ------------------------ | ----------------- | --------- |
| 確率値の修正（誤り訂正） | パッチ（0.0.1）   | 1.2 → 1.3 |
| 新フィールドの追加       | パッチ（0.0.1）   | 1.2 → 1.3 |
| 大幅なデータ改訂         | マイナー（0.1.0） | 1.2 → 2.0 |

### lastUpdated の更新ルール

データを変更した場合は必ず `lastUpdated` を更新してください。

```json
{
  "version": "1.3",
  "lastUpdated": "2026-04-01"
}
```

`index.json` 側の `version` と `lastUpdated` も同期させてください。同期スクリプトを使用できます:

```bash
npm run sync   # index.json の lastUpdated を機種ファイルから同期
```

## main に不正な出典記録が入ったとき

`npm run check:base` は、main の出典記録を main のスキーマと main の `index.json` に照らしてから使い、合わない記録があれば確かめられない（終了コード 2）として止まります（[quality-standards.md](quality-standards.md) の「main と比べる検査」）。main に不正な記録が入ると、直すまでどの PR もこの検査を通りません。

main のブランチ保護は、最新の main に追いついたブランチだけをマージできる設定（strict）です。PR の CI で確かめた中身がそのまま main になるので、古いブランチのまま続けてマージされて不正な記録ができる（先に入ったスキーマや `index.json` の変更と、あとから入る記録が合わない）ことは起きにくいです。ただし管理者はブランチ保護の対象外なので、管理者の権限でマージしたときは起こりえます。

**症状:** その記録に関係ない PR も含めて、`npm run check:base` と CI の「基準（main）との比較（PR のみ）」の段が `main の出典記録が不正: <パス>: <理由>` を出し、終了コード 2 で止まります（JSON として読めない記録なら `main の出典記録を読めない: <パス>: <理由>`）。

**直し方:**

1. 不正な記録を直すだけの PR を作る（その PR の CI では main と比べる検査が働かないので、ほかの変更を混ぜない）
2. その PR の CI の「基準（main）との比較（PR のみ）」の段は、main が不正なので終了コード 2 で落ちる（仕様どおり）。ほかの段（バリデーション・テスト・ESLint・Prettier・品質レポート）が通ることを確かめる
3. その PR のブランチで `node scripts/check-against-base.mjs --base <最後の正しい main のコミット>` を実行し、終了コード 0 になることを確かめる（最後の正しい main のコミットは、main を不正にしたマージの1つ前。`git log --first-parent origin/main` でたどれる）
4. 2 と 3 を確かめてから、管理者の権限でその PR だけをマージする（`gh pr merge <番号> --merge --admin`）。管理者のマージはブランチ保護を飛ばすので、ブランチが最新の main に追いついていることも先に確かめる
5. マージの push の CI の「直前の main との比較（main への push のみ）」の段も、比べる相手（`github.event.before`）が直す前の main なので、同じ理由で終了コード 2 になる
6. 止まっていたほかの PR は、直した main を取り込んでから CI をやり直す。次に main へ入る push（どの変更でもよい）の CI で、すべての段が通ることを確かめる

この手順を、ほかの失敗を通す理由に使わないでください。管理者の権限でマージするのは、この節の状況で、ほかの段がすべて通り、手元の比べが終了コード 0 のときだけです。

## コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に従い、日本語で記述します。

| タイプ            | 用途             | 例                                             |
| ----------------- | ---------------- | ---------------------------------------------- |
| `feat(machines)`  | 新機種追加       | `feat(machines): スマスロ攻殻機動隊を追加`     |
| `fix(machines)`   | データ修正       | `fix(machines): カバネリ チャンス目確率を修正` |
| `docs`            | ドキュメント更新 | `docs: READMEを更新`                           |
| `chore(machines)` | メンテナンス     | `chore(machines): lastUpdatedを一括更新`       |
| `feat(scripts)`   | スクリプト追加   | `feat(scripts): 鮮度チェックスクリプトを追加`  |
| `fix(scripts)`    | スクリプト修正   | `fix(scripts): バリデーションの誤検出を修正`   |

## PRチェックリスト

プルリクエスト作成前に以下を確認してください。

### 新機種追加の場合

- [ ] `npm run validate` がエラー0件
- [ ] `npm test` が全テスト通過
- [ ] `index.json` にエントリが追加されている
- [ ] `description` が記述されている
- [ ] 確率値を2サイト以上でクロスチェック済み
- [ ] `provenance/{id}.json` があり、出典記録バリデーションがエラー0件
- [ ] メーカー公式の出典を使うなら、そのドメインが `config/official-domains.json` にある（無ければ会社情報のページで確かめて足した）
- [ ] `npm run check:base` が問題なし
- [ ] `lastUpdated` が正しい日付になっている
- [ ] コミットメッセージが `feat(machines): 機種名を追加` の形式

### データ修正の場合

- [ ] `npm run validate` がエラー0件
- [ ] `npm test` が全テスト通過
- [ ] `version` が更新されている
- [ ] `lastUpdated` が更新されている
- [ ] `index.json` の `version` と `lastUpdated` が同期している
- [ ] 修正理由がコミットメッセージに記述されている
- [ ] 出典記録がある機種は `provenance/{id}.json` も更新し、出典記録バリデーションがエラー0件
- [ ] `npm run check:base` が問題なし

### ドキュメント修正の場合

- [ ] 内容が正確である
- [ ] 台数やバージョン番号が最新値になっている
