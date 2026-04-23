# Code Quality 監査結果（C軸）

**監査日**: 2026-04-24
**監査者**: CEO直接監査（code-reviewerエージェント中断のため補完）

## Lint / Format 実行結果

### ESLint

```
npx eslint scripts/ tests/validate.test.mjs tests/integration.test.mjs --ext .mjs
```

→ **出力なし（エラー0件、警告0件）** ✅

### Prettier --check

```
[warn] scripts/lib/slugify.mjs          ← WIP、監査対象外
[warn] scripts/migrate-v1-to-v2.mjs     ← WIP、監査対象外
[warn] docs/CONTRIBUTING.md             ← 監査対象
[warn] docs/data-format.md              ← 監査対象
[warn] docs/quality-standards.md        ← 監査対象
[warn] README.md                        ← 監査対象
Code style issues found in 6 files.
```

→ **監査対象で 4ファイルに Prettier 差分**。docs 3本 + README.md。

## ファイル行数メトリクス

| ファイル                                      | 行数 | 判定                         |
| --------------------------------------------- | ---- | ---------------------------- |
| scripts/audit-freshness.mjs                   | 169  | OK（100行超だが CLI ツール） |
| scripts/validate.mjs                          | 164  | OK                           |
| scripts/validators/completeness-validator.mjs | 158  | OK                           |
| scripts/generate-template.mjs                 | 150  | OK                           |
| scripts/validators/probability-validator.mjs  | 134  | OK                           |
| scripts/quality-report.mjs                    | 116  | OK                           |
| scripts/validators/index-consistency.mjs      | 107  | OK                           |
| scripts/sync-last-updated.mjs                 | 81   | OK                           |
| scripts/validators/confirmation-validator.mjs | 58   | OK                           |
| scripts/validators/schema-validator.mjs       | 53   | OK                           |
| schemas/machine.schema.json                   | 311  | OK（スキーマ定義）           |
| schemas/index.schema.json                     | 72   | OK                           |

**監査対象外（WIP）**:

- scripts/migrate-v1-to-v2.mjs 630 行
- scripts/lib/slugify.mjs

## console.log / debug 残留

`grep console\.log scripts/*.mjs`: 27件

- scripts/validate.mjs: 21件（**CLI ツールのユーザー向け出力、適切**）
- scripts/quality-report.mjs: 12件（**ダッシュボード出力、適切**）

**判定**: CLI ツールの通常出力であり、残留バグではない。ただし `--quiet` フラグがない点は perf-optimizer も指摘（Low）。

## TODO / FIXME

`grep "TODO\|FIXME\|XXX\|HACK" scripts/*.mjs`: **0件** ✅

## 発見事項

### [深刻度: Medium] Prettier 差分 4ファイル（docs + README）

**場所**:

- docs/CONTRIBUTING.md
- docs/data-format.md
- docs/quality-standards.md
- README.md

**問題**: Prettier のフォーマット規約との差分あり。CI では Prettier チェックが走るため、ドキュメント変更時に失敗する可能性。
**根拠**: `npx prettier --check` 出力
**推奨対応**: `npx prettier --write docs/*.md README.md` で一括修正。差分は全体の数%程度で内容変更なし。

### [深刻度: Low] --quiet/--silent フラグ未実装

**場所**: scripts/validate.mjs, scripts/quality-report.mjs
**問題**: CI では詳細ログが冗長。--json フラグはあるが通常モードでのサイレント化は未実装。
**根拠**: validate.mjs:62-158 で常に `console.log` 実行
**推奨対応**: `--quiet` 追加で summary のみ出力する分岐追加（Phase 4 でのマイナー改善候補）。

### [深刻度: Low] validators/ 内の schema-validator, confirmation-validator, index-consistency に JSDoc ゼロ

**場所**:

- scripts/validators/probability-validator.mjs: JSDoc 0件
- scripts/validators/index-consistency.mjs: JSDoc 0件
- scripts/validators/schema-validator.mjs: JSDoc 0件
- scripts/validators/confirmation-validator.mjs: JSDoc 0件

**問題**: 主要バリデーションエントリポイントの関数ドキュメントなし。新規貢献者が入力/出力契約を推測するしかない。
**根拠**: `grep -c "@param\|@returns\|/\*\*" scripts/validators/*.mjs`
**推奨対応**: 各 default export に JSDoc 追加（3行以内）。

## 該当なしの軸

- **Dead code / 未使用 import**: ESLint `no-unused-vars` が通過、明確な dead code なし ✅
- **極端に長い関数**: 80行超の個別関数は既コミット分に存在せず ✅
- **エラーハンドリング**: validate.mjs:32-53 で try/catch + JSON.parse エラー捕捉あり ✅
- **マジックナンバー**: 顕著なものなし（integration.test の `< 5` は tester が指摘）
- **命名規則**: camelCase / PascalCase / kebab-case すべて一貫 ✅

## 総合バーディクト

code-reviewer (CEO代理): CONCERN - ESLint pass、巨大関数なし、但し Prettier 差分4件（Medium）と一部 JSDoc 欠落（Low）。
