# Research Log & Prioritization（Phase 2-3）

**作成日**: 2026-04-24

## Phase 2: Evidence & Research Gate

### 実測データ（2026-04-24 時点）

```
npm audit:
  vulnerabilities: high 1 (vite 7.3.1, fix available)
  total dependencies: 174

npm outdated:
  eslint:   10.1.0 → 10.2.1 (minor)
  globals:  17.4.0 → 17.5.0 (minor)
  prettier: 3.8.1  → 3.8.3 (patch)
  vitest:   3.2.4  → 4.1.5 (MAJOR)

Installed (not in outdated):
  ajv:         8.18.0 (^8.17.1 resolved to latest patch) ✅
  ajv-formats: 3.0.1 ✅

Lockfile self-version: 3.3.0（package.json: 3.6.0）→ drift
```

### vite 脆弱性の実質的影響

3 CVE ともに **Vite dev server 起動時のみ** 影響:

- GHSA-4w7w-66w2-5vf9: Optimized Deps `.map` Path Traversal（dev only）
- GHSA-v2wj-q39q-566r: server.fs.deny bypass（dev only）
- GHSA-p9ff-h696-f583: Dev Server WebSocket 経由 Arbitrary File Read（dev only）

本プロジェクトは **vitest の runner のみ使用し、vite dev server は起動しない**。実運用リスクは極めて低いが、CI で `npm audit` が High 警告を出すため、ベストプラクティスとして patch する。

### 外部参照URL（researcher + CEO 補完分）

- https://github.com/advisories/GHSA-4w7w-66w2-5vf9 (vite path traversal)
- https://github.com/advisories/GHSA-v2wj-q39q-566r (vite fs.deny bypass)
- https://github.com/advisories/GHSA-p9ff-h696-f583 (vite WebSocket file read)
- https://github.com/ajv-validator/ajv/releases/tag/v8.18.0 (ajv patch)
- https://nvd.nist.gov/vuln/detail/CVE-2025-69873 (ajv ReDoS)
- https://vitest.dev/guide/migration.html (vitest 4 migration)
- https://vitest.dev/blog/vitest-4 (vitest 4 release)
- https://eslint.org/blog/2026/04/eslint-v10.2.0-released/ (eslint 10.2 release)
- https://prettier.io/blog/2026/01/14/3.8.0 (prettier 3.8 blog)
- https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file (dependabot config)

## Phase 3: Prioritization

### スコアリング表

| #   | 発見                                                                                    | 軸  | Impact | Effort | Confidence | Score    | 判定                               |
| --- | --------------------------------------------------------------------------------------- | --- | ------ | ------ | ---------- | -------- | ---------------------------------- |
| 1   | README.md v3.3→v3.6 更新（機種数138→144、バージョン番号、quality指標）                  | E   | 4      | 1      | 5          | **20.0** | 実装                               |
| 2   | package-lock.json drift 解消（`npm install` で同期）                                    | B   | 3      | 1      | 5          | **15.0** | 実装                               |
| 3   | vite High CVE patch（`npm audit fix`）                                                  | A+B | 3      | 1      | 5          | **15.0** | 実装                               |
| 4   | Prettier --write（docs×3 + README）                                                     | C   | 2      | 1      | 5          | **10.0** | 実装                               |
| 5   | minor patch updates: eslint 10.2.1 / globals 17.5.0 / prettier 3.8.3                    | B   | 2      | 1      | 5          | **10.0** | 実装                               |
| 6   | @vitest/coverage-v8 追加（coverage 計測可能化）                                         | F   | 4      | 2      | 5          | **10.0** | 実装                               |
| 7   | .github/dependabot.yml 追加（自動依存更新）                                             | A   | 3      | 2      | 4          | **6.0**  | 実装                               |
| 8   | vitest.config.mjs で WIP テスト除外                                                     | F   | 3      | 2      | 4          | **6.0**  | 実装                               |
| 9   | package.json に `author` 追加                                                           | E   | 1      | 1      | 5          | **5.0**  | 実装                               |
| 10  | validators/ JSDoc 追加（4ファイル）                                                     | C+E | 2      | 3      | 4          | 2.7      | ISSUE                              |
| 11  | CLI scripts 3本の単体テスト追加（audit-freshness / quality-report / sync-last-updated） | F   | 3      | 4      | 4          | 3.0      | ISSUE                              |
| 12  | --quiet フラグ実装（validate, quality-report）                                          | D   | 2      | 3      | 3          | 2.0      | ISSUE                              |
| 13  | vitest 3 → 4 major migration                                                            | B   | 3      | 4      | 3          | -        | **ISSUE（メジャー、GUARD RAILS）** |
| 14  | integration.test のマジックナンバー `< 5` 修正                                          | C   | 1      | 1      | 4          | 4.0      | 実装（ついで）                     |

### 実装対象（9項目）

上位スコア順で 1 コミット = 1 項目で実装:

1. `fix(deps): npm install でlockfile同期`（内部バージョン 3.3.0→3.6.0）
2. `fix(deps): vite 高深刻度脆弱性を npm audit fix でパッチ`
3. `chore(deps): eslint 10.2.1 / globals 17.5.0 / prettier 3.8.3 に更新`
4. `feat(dev): @vitest/coverage-v8 追加（coverage 計測有効化）`
5. `chore(test): vitest.config.mjs で WIP テスト（migrate/slugify/fixtures）を除外`
6. `style: prettier --write で docs + README を整形`
7. `docs: README を v3.6.0・144機種仕様に更新`
8. `chore: .github/dependabot.yml 追加（npm weekly）`
9. `chore: package.json に author フィールド追加`

Optional（時間余裕あれば）: 10. `refactor(test): integration.test のマジックナンバー定数化`

### ISSUE化対象（5項目）

GUARD RAILS・低優先度のため実行せず GitHub Issue 化:

- Issue A: vitest 3 → 4 メジャー移行調査
- Issue B: validators/ 4ファイルに JSDoc 追加
- Issue C: CLI scripts 3本の単体テスト追加
- Issue D: `--quiet` フラグ実装
- Issue E: integration.test の閾値定数化

### 想定所要時間

- mechanical commits (1-6, 9): 各 2-5 分、合計 30 分
- README / docs （7, 10）: GAN Loop込みで 15 分
- dependabot.yml / config (8): 10 分
- Triple Verification + Perfection Loop: 20 分
- Report 執筆: 20 分
- **合計**: 約 1.5 時間

### GO/NO-GO 再判定

GO条件:

- [x] Critical発見なし → OK
- [x] メジャーバージョンアップはISSUE化のみ → OK
- [x] 破壊的変更なし → OK
- [x] 未コミットWIPに触れない → OK（明示スコープ制御）

**判定**: **GO**
