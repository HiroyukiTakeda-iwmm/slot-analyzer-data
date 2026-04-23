# Test Health 監査結果

**対象**: /Users/iwomimi/projects/pachinko-tools/slot-analyzer-data
**実行日**: 2026-04-24
**担当**: tester (Phase 1 F. Test Health)
**ベース**: vitest 3.0.0 (実体 3.2.4) / ESM / Node >=20

## テスト実行結果

| 項目           | 値                                                 |
| -------------- | -------------------------------------------------- |
| テストファイル | 4 passed (4)                                       |
| 合計テスト数   | **130 passed (0 failed / 0 skipped)**              |
| 実行時間       | 494ms (transform 71ms, collect 204ms, tests 239ms) |
| Flaky 兆候     | 無し（2回連続実行でも同結果、所要時間安定）        |
| skip/only/todo | **0件**（`grep -rn` で検出なし）                   |

監査スコープ注記では `migrate-v1-to-v2.test.mjs` と `slugify.test.mjs` は WIP として対象外指定されていたが、vitest 設定はこれらを除外しておらず CI 実行対象に含まれ、いずれも PASS している。以下では **触らずに** 現状の挙動のみ記録する。

| テストファイル                  | テスト数 | 行数 | 扱い                   | 結果                |
| ------------------------------- | -------- | ---- | ---------------------- | ------------------- |
| tests/validate.test.mjs         | 19       | 327  | 既コミット（監査対象） | ✓                   |
| tests/integration.test.mjs      | 9        | 111  | 既コミット（監査対象） | ✓                   |
| tests/migrate-v1-to-v2.test.mjs | 48       | 356  | WIP（対象外）          | ✓（実行されている） |
| tests/slugify.test.mjs          | 54       | 294  | WIP（対象外）          | ✓（実行されている） |

## カバレッジ

**計測不能（実行時エラー）**

```
$ npm test -- --run --coverage
 MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

`vitest.config.mjs` は `coverage.provider: 'v8'` と閾値 (statements/lines 80, branches 70, functions 80) を宣言しているが、対応するプロバイダパッケージ `@vitest/coverage-v8` が `package.json` の devDependencies に記載されていない。`node_modules/@vitest/` にも存在を確認済み（`expect, mocker, pretty-format, runner, snapshot, spy, utils` のみインストール）。

| メトリック | 現在         | 閾値 | 判定 |
| ---------- | ------------ | ---- | ---- |
| Statements | **計測不能** | 80%  | —    |
| Branches   | **計測不能** | 70%  | —    |
| Functions  | **計測不能** | 80%  | —    |
| Lines      | **計測不能** | 80%  | —    |

結果として、README 等で「カバレッジ 80/70/80 を満たしている」と主張できる状態にない。v3.6.0 リリース時点でこの設定が verify されていない可能性がある。

## 実装ファイルとテストの対応表

| scripts/\*.mjs                        | 行数 | 対応テスト                                     | 間接カバー                                                        | 判定                                                                |
| ------------------------------------- | ---- | ---------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| validate.mjs                          | 164  | **なし**                                       | integration.test.mjs が validators を通してエンドツーエンドで実行 | CLI固有ロジック（argパース / exit code / 出力整形）は未カバー       |
| validators/schema-validator.mjs       | 53   | validate.test.mjs (3件) + integration.test.mjs | —                                                                 | 最低限のカバーあり                                                  |
| validators/probability-validator.mjs  | 134  | validate.test.mjs (4件) + integration.test.mjs | —                                                                 | 主要分岐をカバー                                                    |
| validators/confirmation-validator.mjs | 58   | validate.test.mjs (2件) + integration.test.mjs | —                                                                 | 最低限のカバーあり                                                  |
| validators/index-consistency.mjs      | 107  | validate.test.mjs (3件) + integration.test.mjs | —                                                                 | コメント（165行目）が「ファイル存在依存は統合テストでカバー」と明言 |
| validators/completeness-validator.mjs | 158  | validate.test.mjs (7件) + integration.test.mjs | —                                                                 | 比較的厚くカバー                                                    |
| audit-freshness.mjs                   | 169  | **なし**                                       | なし                                                              | **未カバー**                                                        |
| generate-template.mjs                 | 150  | **なし**                                       | なし                                                              | coverage exclude 済（意図的除外）                                   |
| quality-report.mjs                    | 116  | **なし**                                       | なし                                                              | **未カバー**                                                        |
| sync-last-updated.mjs                 | 81   | **なし**                                       | なし                                                              | **未カバー**（npm script `sync` で日次利用）                        |
| migrate-v1-to-v2.mjs                  | 630  | migrate-v1-to-v2.test.mjs (48件)               | —                                                                 | WIP 扱いだが実質厚くカバー                                          |
| lib/slugify.mjs                       | 299  | slugify.test.mjs (54件)                        | —                                                                 | WIP 扱いだが実質厚くカバー                                          |

## テスト品質評価

### AAA パターン

- `validate.test.mjs`: describe で validator ごとに分割、it 内で `const bad = {...}` → `validateXxx(...)` → `expect(...)` の AAA 構造が明瞭。
- `integration.test.mjs`: fixture ローダ (`loadJsonFile`, `findMachineJsonFiles`) を先頭で共通化し、各 it は実データに対する期待値検証のみ。Arrange がファイル読み込みに集約されている。
- モック使用ゼロ。全テストが実モジュール/実ファイルベース。モック過剰の問題なし。

### fixture / factory

- `validate.test.mjs` は `validMachine` / `validIndex` をモジュールスコープの base fixture として定義し、スプレッド構文 (`{ ...validMachine, type: 'INVALID' }`) でバリアントを生成。factory 関数化されていないがシンプルな用途には十分。

### 必須ケースのカバー

| 観点             | validate.test.mjs                                    | integration.test.mjs                                   |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| 正常系           | ○（各 describe に「正常なデータでエラーなし」）      | ○（実データで errors zero 期待）                       |
| 異常系           | ○（type 不正、hasSettingDiff ミスマッチ、重複ID 等） | △（実データが clean 前提、異常系は validate 側に委譲） |
| 境界値           | △（`Incompleteが5未満` だけが閾値判定）              | △（同上）                                              |
| null / undefined | ✕                                                    | ✕                                                      |

### 観察された良い点

- 設定可能キーの欠落（endScreensキー欠落 + AT機 vs ジャグラー）といった **ドメイン依存の分岐** を明示的にテスト化。
- `completeness-validator` の summary.stats 集計テストで複数ファイル入力を扱うことでアグリゲーションの正しさを検証。
- `integration.test.mjs` は 138 機種の実データに対して全 validator を通す「本番相当」スモークで、単体テストでは拾えない実データ起因の regression を検出できる設計。

## 発見事項

### [High] Coverage 計測が実行時エラーで不可能（MISSING DEPENDENCY）

**場所**: `package.json` devDependencies / `vitest.config.mjs` L5-15
**問題**: `vitest.config.mjs` は `coverage.provider: 'v8'` と閾値を宣言しているが、対応する `@vitest/coverage-v8` が devDependencies に登録されておらず、`npm test -- --coverage` が `MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'` で即終了する。
**根拠**: 実コマンド実行結果・`node_modules/@vitest/` のディレクトリ列挙で確認。
**影響**: プロジェクトが v3.6.0 として公開されているにもかかわらず、設定された閾値（80/70/80）を**誰も verify できない**。CHANGELOG で coverage を語る根拠がない。
**推奨対応**: `npm install -D @vitest/coverage-v8@^3.0.0` を追加し、package.json scripts に `"test:coverage": "vitest run --coverage"` を追加。CI で coverage 計測を常設化する。

### [High] CLI エントリ `validate.mjs` (164行) に直接テストなし

**場所**: `scripts/validate.mjs`
**問題**: `npm run validate` / `validate:schema` / `validate:index` として公開されている CLI エントリが直接テストされていない。validators は個別に十分テストされているが、以下の CLI 固有ロジックはどのテストも通らない:

- `--schema-only` / `--index-only` のフラグ解釈
- `process.exit(code)` の正しい exit code 発行
- エラー / 警告 / 情報の集計と stdout 整形
- 複数 validator の合成・順序
  **根拠**: `grep -l "validate\.mjs" tests/*.mjs` で 0 件ヒット。integration.test.mjs は validator 関数を直接 import しており、`validate.mjs` の main 処理は通過しない。
  **影響**: CLI の exit code 退行（例: 警告でも exit 1 してしまう / エラーでも exit 0 を返す）があっても検出できない。CI で `npm run validate` を信頼する運用が崩れる。
  **推奨対応**: `tests/cli.test.mjs` を新規作成し、`child_process.spawnSync('node', ['scripts/validate.mjs', '--schema-only'])` で stdout/stderr/exit code を検証するスモークを追加。

### [High] 3 つの運用スクリプトが完全未カバー

**場所**: `scripts/audit-freshness.mjs` (169行), `scripts/quality-report.mjs` (116行), `scripts/sync-last-updated.mjs` (81行)
**問題**: いずれも `npm run` script として公開され実運用に使われているが、テストが一つも存在しない。

- `sync-last-updated.mjs`: ファイルの `lastUpdated` を Git mtime と同期（書き込みを伴う）
- `audit-freshness.mjs`: `--stale 30` など CLI 引数を解釈、データ鮮度評価
- `quality-report.mjs`: JSON / テキスト出力、`--json` フラグ
  **根拠**: `grep -l` で 0 件ヒット。行数は十分テスト価値あり。
  **影響**: データ書き込みを伴う `sync-last-updated.mjs` の退行は最もリスクが高い（誤った lastUpdated を一括上書きする可能性）。
  **推奨対応**: 少なくとも `sync-last-updated.mjs` と `quality-report.mjs --json` の出力形状について単体テスト追加。fixtures ディレクトリが既に存在するため流用可能。

### [Medium] 監査スコープで WIP とされたテストが実行対象に混在

**場所**: `tests/migrate-v1-to-v2.test.mjs`, `tests/slugify.test.mjs`
**問題**: ユーザー指示では WIP・監査対象外とされているが、`vitest.config.mjs` に include/exclude 指定がなくデフォルトで `tests/**/*.test.mjs` を全て拾う。現状 102 件（48 + 54）が毎回実行され全 PASS している。
**根拠**: `vitest.config.mjs` に `test.include` / `test.exclude` の記述なし。直近の `npm test` 出力でも 4 ファイル 130 件実行を確認。
**影響**:

- (a) 仮に WIP テストが意図的に不完全（例: fixture 未整備）ならば PASS していること自体が fixture の過剰モックを示唆するが、中身を読まないのでここでは判断保留。
- (b) CI で通っている以上、WIP テストは事実上「正式テスト」として機能しており、壊れたときのブロッキング範囲が不明瞭。
  **推奨対応**: 「WIP テスト」の境界を明示化する。選択肢:
  1. `vitest.config.mjs` で `test.exclude: ['**/migrate-v1-to-v2.test.mjs', '**/slugify.test.mjs']` として明示除外し、`test:wip` script を別立て。
  2. もしくは WIP ラベルを外し正式テストに昇格させる（既に 102 件 PASS しているので現実的）。
     現状の「実行されているが WIP」の曖昧さは監査のたびにスコープ判定を必要とし、コストが高い。

### [Medium] `integration.test.mjs` の閾値テストが将来脆化しうる

**場所**: `tests/integration.test.mjs` L97-100

```mjs
it('完全性チェック: Incompleteが5未満', () => {
  const result = validateCompleteness(machineFiles);
  expect(result.summary.incomplete).toBeLessThan(5);
});
```

**問題**: マジックナンバー `5` が anchor なしで埋め込まれている。138 機種中「Incomplete が 5 件以上」で失敗する設計だが、何故 5 が上限なのかの根拠がコードにもコメントにもない。データ追加時に閾値を都度調整する必要があり、テストが「変更を記憶しない」サインになる。
**根拠**: ファイル該当行。近傍にコメント無し。
**影響**: (a) データ追加時にテストが fail → 安易に閾値を引き上げてテストを意味のないものにする誘惑、(b) 逆に閾値 4 件以下でも放置される（改善インセンティブ喪失）。
**推奨対応**: 定数化 + コメントで根拠を明示。例: `const MAX_INCOMPLETE = 5; // 解析途中の暫定機種の許容上限。増加時は PR で理由を議論。` さらに「Incomplete 一覧を stdout に print してから assert」に変えると、fail 時に即原因が分かる。

### [Low] integration.test.mjs の try/if ログ出力が verbose

**場所**: `tests/integration.test.mjs` L55-94（全 4 箇所）
**問題**: 各バリデーションで `if (result.errors.length > 0) console.log(...)` を入れている。失敗時の診断性は高いが、本来 vitest の `expect(result.errors).toHaveLength(0)` の diff 出力で表示されるメッセージと重複。
**根拠**: 該当行。
**影響**: 可読性低下。PASS 時は害なし。
**推奨対応**: `expect(result.errors, JSON.stringify(result.errors, null, 2)).toHaveLength(0);` のように assertion message に寄せる、もしくは onFailure hook に移す。優先度は低い。

### [Low] null / undefined 入力の防御的テスト不在

**場所**: `tests/validate.test.mjs`
**問題**: 「不正なtypeでエラー」「ID重複」等のドメイン異常系は充実だが、`validateSchemas(null, validIndex)` / `validateProbabilities(undefined)` / `{ roles: null }` のような **型違反入力** に対する挙動テストがない。Ajv 由来のスキーマ検証で捕捉される前提だが、ガード漏れがあると NullPointerException 相当のクラッシュを起こす可能性がある。
**根拠**: ファイル全スキャン（1〜327行）で `null` / `undefined` を引数に渡すテストが存在せず。
**影響**: 想定外入力で throw するとバッチ実行（CI）全体が止まる。
**推奨対応**: 各 validator につき 1 件、`expect(() => validateXxx(null)).not.toThrow()` または `expect(() => validateXxx(null)).toThrow(/期待メッセージ/)` を追加。

## 総合バーディクト

**tester: CONCERN**

- 既存テスト 130/130 PASS かつ 494ms で高速、AAA構造も明確、skip/only/flakyなし — ここは強い。
- 一方で、coverage が **依存欠落で計測不能** (High) + CLI エントリ `validate.mjs` 未テスト (High) + 運用スクリプト3本完全未カバー (High) が致命的なギャップ。
- 「vitest.config.mjs に閾値は書いてあるが実際は計測できない」という状態は品質ガバナンス上の嘘になりうるため、少なくとも `@vitest/coverage-v8` 追加と 1 本以上の CLI スモークは Phase 2 で着手すべき。
