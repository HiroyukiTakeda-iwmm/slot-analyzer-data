# Performance 監査結果

**対象**: slot-analyzer-data v3.6.0（データ集計パイプライン、Node.js ESM）
**機種数**: 144ファイル（合計 1,010,655 bytes、平均 7,018 B/file、最大 18,837 B）
**監査日**: 2026-04-24

---

## 実測

### npm run validate（`/usr/bin/time -l` で 3 回実行）

| 指標                      | 値                                   |
| ------------------------- | ------------------------------------ |
| real                      | **0.09s / 0.10s / 0.11s**（安定）    |
| user                      | 0.10s                                |
| sys                       | 0.01s                                |
| maximum resident set size | **68.1 MB**                          |
| peak memory footprint     | **34.1 MB**                          |
| page reclaims             | 4,380                                |
| page faults               | 75                                   |
| block I/O                 | 0（全ファイルは OS page cache 済み） |

### npm test -- --run（vitest）

| 指標                        | 値                                                  |
| --------------------------- | --------------------------------------------------- |
| real                        | **0.87s**                                           |
| user                        | 2.70s（並列テスト実行）                             |
| sys                         | 0.49s                                               |
| maximum resident set size   | 131 MB                                              |
| peak memory footprint       | 26.5 MB                                             |
| Test Files                  | 4 passed（130 tests）                               |
| Duration（vitest 内部計測） | 419ms（transform 71ms, collect 198ms, tests 212ms） |

### .husky/pre-commit（validate + test）

| 指標 | 値        |
| ---- | --------- |
| real | **0.93s** |
| user | 2.73s     |
| sys  | 0.47s     |

---

## 発見事項

### [INFO] 処理時間は既に極小で、最適化の実需なし

**場所**: プロジェクト全体
**観測**: 144 機種 × 5 バリデータ = 約 720 回の検証が **0.09 秒**で完了。pre-commit 全体で 0.93 秒。
**根拠**:

- `/usr/bin/time -l` 3 回の real 時間が 0.09/0.10/0.11 秒
- peak memory footprint 34 MB（Node.js 本体のベースラインと同程度）
- block input operations = 0（1.3MB 分のファイルは完全に OS page cache にヒット）
  **推奨対応**: 現状維持。後述の軽微な改善は「するに越したことはない」レベルで、数値改善は測定困難。

---

### [LOW] `validate.mjs` の I/O が同期・直列だが、現規模では問題化しない

**場所**: `scripts/validate.mjs:12-53`
**問題**:

- L12 `import { readFileSync, readdirSync } from 'fs'` — 全 I/O が同期版
- L32-53 `findMachineJsonFiles` が再帰ループ内で `readFileSync` + `JSON.parse` を逐次実行
- 144 ファイルを 1 スレッドで直列にロード（並列性ゼロ）

**根拠**:

- 実測 0.09s の大半はおそらく Node 起動 + ajv スキーマコンパイル 2 回。ファイル I/O は合計 1MB で、最新 Mac の SSD/page cache では数 ms オーダー
- 同期 I/O を `fs/promises` + `Promise.all` に置き換えても、この規模（144 ファイル、1MB）では有意な短縮は期待できない

**推奨対応**:

- **現時点では対応不要**。機種数が 500〜1,000 に増えた時点で再評価。
- もし変更するなら、`findMachineJsonFiles` を async 化して `Promise.all(entries.map(async e => ...))` にする。ただし保守コストとトレードオフ。

---

### [LOW] `probability-validator.mjs` のホットループで `JSON.stringify` を使った配列比較

**場所**: `scripts/validators/probability-validator.mjs:25`, `:121`
**問題**:

```js
if (JSON.stringify(sortedKeys) !== JSON.stringify(sortedExpected)) { ... }
```

配列の等値比較に `JSON.stringify` を使っている。設定キーは `['1','2','3','4','5','6']` 程度の小配列だが、**144 機種 × ロール数（平均 5〜10）× 2 箇所 = 数千回**呼ばれる可能性がある。

**根拠**:

- 小配列なので絶対時間は μs オーダー。全体 0.09s のうち数 ms 以下と推定
- `sortedKeys.length === sortedExpected.length && sortedKeys.every((k,i) => k === sortedExpected[i])` の方が正確かつ高速

**推奨対応**:

- `equalArrays(a, b)` ヘルパー関数を 1 つ用意して差し替え。ついでに「型安全性」も向上（`JSON.stringify([null])` と `JSON.stringify([])` の衝突回避など）
- 効果: 可読性・正確性向上。体感できる速度改善はない

---

### [LOW] 全バリデータが `--silent` 相当の出力抑制を持たない

**場所**: `scripts/validate.mjs` 全体（console.log 27 箇所 / L62-158）
**問題**:

- CI での実行時、成功ケースでも 20 行以上の進捗ログが常に出力される
- `--json` フラグは JSON レポートを追加出力するだけで、既存のログは抑制しない
- pre-commit で「テストが通った時はサマリのみ」にしたい場合の仕組みがない

**根拠**:

- L62-158 のうち少なくとも 10 行は「--- スキーマバリデーション ---」のような見出しで、CI ログでは冗長
- プロジェクト CLAUDE.md に「テスト: サマリーのみコンテキストに表示（`--silent | tail -5`）」という運用ルールあり

**推奨対応**:

- `--quiet` フラグを追加。`const quiet = args.includes('--quiet');` して `const log = quiet ? () => {} : console.log;` にラップ
- pre-commit hook で `npm run validate -- --quiet` を呼ぶように変更
- 効果: CI ログの視認性向上。性能への影響は微小（`console.log` はバッファリングされ TTY 判定あり）

---

### [INFO] ajv のスキーマコンパイルは適切にループ外で実施されている

**場所**: `scripts/validators/schema-validator.mjs:23, 37`
**観測**: `ajv.compile(indexSchema)` と `ajv.compile(machineSchema)` がそれぞれ 1 回のみ呼ばれ、ループ内で再コンパイルする設計ミスはない。`addSchema` は不要な規模（スキーマ 2 個のため）。
**根拠**: L23 と L37 で compile が 1 度ずつ、L38 以降のループでは `validateMachine(data)` のみ呼ぶ。

---

### [INFO] 対象外の軸（バンドルサイズ、UI レンダリング）

| 軸                     | 判定     | 理由                                                                            |
| ---------------------- | -------- | ------------------------------------------------------------------------------- |
| バンドルサイズ         | 該当なし | Webpack/Vite によるバンドル工程なし。配布物は JSON データと .mjs スクリプトのみ |
| 再レンダリング         | 該当なし | UI / React コンポーネント不在                                                   |
| ネットワークリクエスト | 該当なし | ローカル CLI のみ。外部 HTTP リクエストなし                                     |
| メモリリーク           | 該当なし | CLI は短命プロセス（0.09s で exit）。リークが問題化するライフサイクルを持たない |

---

## サマリ表

| 深刻度   | 件数 | 対応要否                                   |
| -------- | ---- | ------------------------------------------ |
| CRITICAL | 0    | —                                          |
| HIGH     | 0    | —                                          |
| MEDIUM   | 0    | —                                          |
| LOW      | 3    | 緊急性なし。リファクタ時に合わせて対応推奨 |
| INFO     | 2    | 参考情報                                   |

## 前提チャレンジ

本監査で投げかけるべき「暗黙の前提」:

1. **前提: 144 機種は今後も安定**
   → 500 機種、1,000 機種に増えた場合、現アーキテクチャ（同期 I/O + 直列ループ）は破綻しうる。閾値として **「300 機種超で再測定」** を推奨
2. **前提: pre-commit の 0.93 秒は体感として許容範囲**
   → ユーザーは Windows 11 環境での利用もあり、NTFS/WSL 環境では I/O が 2〜3 倍遅くなる可能性。**Windows 実機で同測定を 1 回だけ取る**のがベスト
3. **前提: ESLint/Prettier は pre-commit に含まれない**
   → 現 pre-commit は `validate + test` のみ。lint-staged が入ると pre-commit 時間は数秒増える可能性あり。追加時に再測定

---

## 総合バーディクト

**perf-optimizer: PASS** - 現規模（144 機種・1.3MB）では validate 0.09s / pre-commit 0.93s と極めて高速。Critical/High なし。機種数 300 超での再評価を推奨。
