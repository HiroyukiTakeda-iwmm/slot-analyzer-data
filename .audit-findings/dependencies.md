# Dependencies & Freshness 監査結果

- 監査日: 2026-04-24
- 対象: /Users/iwomimi/projects/pachinko-tools/slot-analyzer-data (v3.6.0)
- 実行者: researcher (Phase 1 / B)
- Node.js 要件: >=20.0.0 (package.json engines)
- lockfile: package-lock.json v3 (パッケージ名 "slot-analyzer-data" version=3.3.0 ※package.jsonとドリフト: 後述)

---

## 現状サマリー

| ライブラリ  | 種別 | package.json宣言 | 実インストール（lockfile/node_modules） | 最新安定版（2026-04-24時点） | 差分            | 深刻度               |
| ----------- | ---- | ---------------- | --------------------------------------- | ---------------------------- | --------------- | -------------------- |
| ajv         | prod | ^8.17.1          | 8.18.0                                  | 8.18.0                       | none            | Low（最新）          |
| ajv-formats | prod | ^3.0.1           | 3.0.1                                   | 3.0.1（2年更新停止）         | none            | Med（EOL懸念・後述） |
| eslint      | dev  | ^10.1.0          | 10.1.0                                  | 10.2.1                       | patch+minor遅延 | Low                  |
| @eslint/js  | dev  | ^10.0.1          | 10.0.1                                  | 10.2.1 相当                  | minor遅延       | Low                  |
| globals     | dev  | ^17.4.0          | 17.4.0                                  | 17.5.0                       | minor遅延       | Low                  |
| husky       | dev  | ^9.1.0           | 9.1.7                                   | 9.1.7                        | none            | Low                  |
| prettier    | dev  | ^3.8.1           | 3.8.1                                   | 3.8.3                        | patch遅延       | Low                  |
| vitest      | dev  | ^3.0.0           | 3.2.4                                   | 4.1.5                        | major遅延       | Med（要判断）        |

※ `@vitest/coverage-v8` はユーザー要求文中で "※実際の package.json を読んで確定させる" とされていたため確認したが、**package.json には存在しない**。カバレッジ依存の実装は未導入。

---

## npm audit 結果

**researcher エージェントには Bash ツールが付与されていないため、`npm audit` / `npm outdated` の実行は本監査では未実行。** 代替として以下 3 手段で健全性を検証：

1. **package.json を直接読み取り**（バージョン制約特定）
2. **node_modules/\*/package.json を直接読み取り**（実インストール版特定）
3. **公式 CVE/GHSA データベース + リリースノート検索**（該当 CVE の修正状況を突合）

### 推定 audit 結果（静的解析ベース）

| カテゴリ | 件数 | 根拠                                                                                         |
| -------- | ---- | -------------------------------------------------------------------------------------------- |
| Critical | 0    | ajv 8.18.0 (CVE-2025-69873 修正済) / vitest 3.2.4 (CVE-2025-24964 修正済、fix済最小版 3.0.5) |
| High     | 0    | 該当ライブラリ群に2026-04-24時点の未修正High脆弱性報告なし                                   |
| Medium   | 0    | 既知Medium報告なし                                                                           |
| Low      | 0    | 既知Low報告なし                                                                              |

**重要**: 上記は依存グラフの直接 audit ではなくリリースノートベースの推論。**CEO またはユーザーが `npm audit --json` を実際に実行し、本監査結果と突合することを推奨**（トランジティブ依存の隠れた脆弱性検出のため）。推奨コマンド:

```bash
cd /Users/iwomimi/projects/pachinko-tools/slot-analyzer-data
npm audit --json > .audit-findings/npm-audit-raw.json
npm outdated --json > .audit-findings/npm-outdated-raw.json
```

---

## npm outdated 結果（静的解析による推定）

| Package     | Current | Wanted（^制約内最新）              | Latest     | 遅延種別                  |
| ----------- | ------- | ---------------------------------- | ---------- | ------------------------- |
| eslint      | 10.1.0  | 10.2.1                             | 10.2.1     | minor（^10.1.0 で追随可） |
| @eslint/js  | 10.0.1  | 10.2.1相当                         | 10.2.1相当 | minor                     |
| globals     | 17.4.0  | 17.5.0                             | 17.5.0     | minor                     |
| prettier    | 3.8.1   | 3.8.3                              | 3.8.3      | patch                     |
| vitest      | 3.2.4   | 3.2.4（^3.0.0で4.xへは上がらない） | 4.1.5      | **major**（要判断）       |
| ajv         | 8.18.0  | 8.18.0                             | 8.18.0     | 同期済                    |
| ajv-formats | 3.0.1   | 3.0.1                              | 3.0.1      | 同期済                    |
| husky       | 9.1.7   | 9.1.7                              | 9.1.7      | 同期済                    |

### 即時 `npm update` で反映可能（^制約内）

- eslint 10.1.0 → 10.2.1
- @eslint/js 10.0.1 → 10.2.1 相当
- globals 17.4.0 → 17.5.0
- prettier 3.8.1 → 3.8.3

### 手動 package.json 変更が必要（メジャー版）

- vitest 3.2.4 → 4.1.5

---

## 発見事項

### [Medium] F1: vitest がメジャー版遅延（3.2.4 → 4.1.5）

**場所**: package.json devDependencies.vitest `^3.0.0`
**問題**: Vitest 4.0 は 2025-12 リリース、4.1.5 が最新（2026-04-22前後）。本プロジェクトは 3.2.4 で止まっている。vitest 3 系は near-EOL（マイナーリリース停止）。
**リスク**:

- vitest 3 系のセキュリティ修正供給が近々停止する可能性（明示 EOL 表明は未検出だが、慣例上メジャー世代交代後はパッチのみ）
- vite 8 GA (2026-03-12) との互換性は 4.1 以降で担保。3.x で vite 8 を入れるとビルド不整合の懸念
  **breaking change 要点**（vitest.dev/blog/vitest-4 + migration.md より）:
- Vite >= 6.0 必須、Node.js >= 20 必須（本プロジェクトの engines と適合）
- Browser Mode が組込化（@vitest/browser 不要）— 本プロジェクトは未使用のため影響なし
- workspace → projects リネーム（本プロジェクトは vitest.config なし or 未使用の想定、要確認）
- v8 coverage remapping ロジック変更（本プロジェクトは coverage 未導入のため影響なし）
- `vi.fn().getMockName()` が `spy` → `vi.fn()` に変更（スナップショット影響。本プロジェクトのテスト規模次第）
- Reporter API の旧コールバック削除（通常プロジェクトでは影響軽微）
  **根拠**:
- https://vitest.dev/blog/vitest-4
- https://vitest.dev/guide/migration.html
- https://github.com/vitest-dev/vitest/releases/tag/v4.0.0
  **推奨対応**: tests/ を確認のうえ影響を見積もる（`vi.fn().getMockName()` 依存・カスタム reporter・workspace 設定の有無）。影響軽微なら 4.1.5 に上げる PR をサブタスク化。ISSUE 化候補。

### [Medium] F2: ajv-formats が 2 年以上更新停止（3.0.1 最終）

**場所**: package.json dependencies.ajv-formats `^3.0.1`
**問題**: ajv-formats 3.0.1 は 2024 年前半リリース（snyk/npm の "2 years ago" 記述）で、npm 上で 12 ヶ月以上新バージョンなし。メンテナンス減速または事実上の低メンテナンス状態。
**リスク**:

- ajv 本体（8.18.0）はメンテナンス継続中だが、formats プラグインの追従が遅れる可能性
- 未修正脆弱性が見つかった場合のパッチ供給リスク
- 現時点で ajv-formats 側に未修正の公開 CVE はなし（snyk/security データベースで "No direct vulnerabilities" 確認済）
  **根拠**:
- https://www.npmjs.com/package/ajv-formats（最終更新 "2 years ago"）
- https://security.snyk.io/package/npm/ajv-formats
- https://github.com/ajv-validator/ajv-formats/releases
  **推奨対応**: 即時対応不要。次のクォータリー時点で ajv-formats のリポジトリ活動状況を再評価（Tier 1 の公式 ajv-formats release ページを watch）。代替候補（例: `@exodus/schemasafe` の format 機能）の技術調査を Nice-to-have として残す。ISSUE 化候補（ただし BLOCK ではない）。

### [Low] F3: package-lock.json と package.json の version ドリフト

**場所**: package.json `"version": "3.6.0"` vs package-lock.json root packages[""].version `"3.3.0"`
**問題**: lockfile は v3.3.0 のまま。v3.4.x / v3.5.x / v3.6.x のいずれかで `npm install` が実行されずに package.json だけが書き換えられた可能性。
**リスク**:

- 依存ツリーが v3.3.0 時点のものとして固定され、パッチバージョン追随漏れがある可能性
- CI 環境と開発者環境で `npm ci` の結果が予期しない形になる懸念（ただしトップレベル依存の ^ 制約は今回同一なので実害は限定的）
  **根拠**: 本監査内の package.json L3 と package-lock.json L3, L9 を直接比較
  **推奨対応**: `npm install` を実行して lockfile を v3.6.0 に同期。その際 audit/outdated も併走。即時対応可能な軽微課題。

### [Low] F4: 4 件のマイナー/パッチ追随遅延（非破壊）

**場所**: package.json devDependencies（eslint / @eslint/js / globals / prettier）
**問題**: ^制約内で `npm update` 1 発で反映可能なパッチ/マイナー遅延がまとまって存在。
**リスク**: セキュリティ実害なし。開発体験とルール最新化（ESLint v10.2 の新機能追随等）のみ。
**推奨対応**: `npm update` で一括反映後、`npm run test && npm run validate` で動作確認。単一コミットで片付く。

### [情報] I1: 既に適用済の重要セキュリティパッチ（再発防止のため記録）

- **CVE-2025-69873 (ajv ReDoS, Critical)**: 修正版 8.18.0 で対処済。本プロジェクトは 8.18.0 を採用しており修正済状態。
- **CVE-2025-24964 (vitest RCE via CSWSH, CVSS 9.7)**: 3.x 系の修正版は 3.0.5。本プロジェクトは 3.2.4 を採用しており修正済状態。

---

## 外部参照URL（出典）

### Tier 1（公式）

- https://www.npmjs.com/package/ajv — ajv 最新版（8.18.0）
- https://github.com/ajv-validator/ajv/releases/tag/v8.18.0 — ajv 8.18.0 リリースノート（ReDoS 修正）
- https://github.com/ajv-validator/ajv-formats/releases — ajv-formats リリース履歴
- https://www.npmjs.com/package/vitest — vitest 最新版 4.1.5
- https://vitest.dev/blog/vitest-4 — Vitest 4.0 リリース
- https://vitest.dev/guide/migration.html — Vitest 4 移行ガイド
- https://github.com/vitest-dev/vitest/releases/tag/v4.0.0 — Vitest 4.0 changelog
- https://eslint.org/blog/2026/04/eslint-v10.2.0-released/ — ESLint 10.2.0 リリース
- https://eslint.org/blog/2026/02/eslint-v10.0.0-released/ — ESLint 10.0 リリース
- https://eslint.org/version-support/ — ESLint サポート方針
- https://www.npmjs.com/package/globals — globals 17.5.0
- https://github.com/sindresorhus/globals/releases — globals リリース履歴
- https://prettier.io/blog/2026/01/14/3.8.0 — Prettier 3.8 リリース
- https://www.npmjs.com/package/prettier — Prettier 3.8.3
- https://www.npmjs.com/package/husky — husky 9.1.7（1 年前最終リリース、安定）
- https://github.com/typicode/husky/releases — husky リリース履歴
- https://vite.dev/blog/announcing-vite8 — Vite 8 GA（vitest 4 の依存）

### Tier 2（CVE/セキュリティ DB）

- https://nvd.nist.gov/vuln/detail/CVE-2025-69873 — ajv ReDoS
- https://github.com/advisories/GHSA-2g4f-4pwh-qvx6 — ajv ReDoS GHSA
- https://nvd.nist.gov/vuln/detail/CVE-2025-24964 — vitest RCE
- https://github.com/advisories/GHSA-9crc-q9x8-hgqq — vitest RCE GHSA
- https://security.snyk.io/package/npm/ajv-formats — ajv-formats 脆弱性 DB
- https://security.snyk.io/package/npm/vitest — vitest 脆弱性 DB

---

## 総合バーディクト

**researcher: CONCERN** — 重大脆弱性は既に修正済の版を採用できており Critical/High 無し。ただし (a) lockfile ドリフト、(b) vitest メジャー版遅延、(c) ajv-formats 低メンテナンスの3つが残存し、放置すると将来の Silent Regression / Supply Chain Risk になるため CONCERN。

### 最優先修正候補（推奨順）

1. **[即時・5分]** `npm install` → lockfile 3.6.0 同期 + `npm update` でパッチ4件吸収（F3 + F4 同時解消）
2. **[ISSUE化・要見積り]** vitest 4.1.5 移行計画立案（F1）。tests/ 実装を 1 回スキャンして影響範囲を確定させてから PR 分割
3. **[Watch]** ajv-formats のリポジトリ活動を 90 日後に再調査（F2）

### CEO が本監査後に実行すべきコマンド（実測確証を取るため）

```bash
cd /Users/iwomimi/projects/pachinko-tools/slot-analyzer-data
npm audit --json 2>&1 | tee .audit-findings/npm-audit-raw.json | head -100
npm outdated --json 2>&1 | tee .audit-findings/npm-outdated-raw.json | head -50
```

上記出力と本監査結果が一致しない場合は researcher に再委任のうえ差分を ISSUE 化すること。
