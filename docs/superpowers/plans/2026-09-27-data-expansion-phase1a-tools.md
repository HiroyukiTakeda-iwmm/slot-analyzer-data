# 機種データ拡充 段階1a（記録の道具）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 段階1（新台25機種・暫定9機種）の出典記録を作るのに要る道具をそろえる。データ（`machines/`）は変えずに main へマージする。

**Architecture:** 段階0の `scripts/lib/provenance.mjs` の「値の比べ方」を、許容差から「丸めの幅が重なるか」に置き換える（採否ルールの関数はそのまま使う）。そのうえで、一部の設定だけの出典の扱い、`patterns` を普通の終了画面に書き直す道具、外した ID の台帳、公式ドメインの一覧、記録の下書きと読み直しの照合の CLI を足す。段階1b（データ）はこの道具で記録を作る。

**Tech Stack:** Node.js（ESM `.mjs`）、ajv 8 + ajv-formats、vitest 3、ESLint 9、Prettier。

## 本人の決定（2026-09-27）

| 論点 | 決定 |
|---|---|
| 段階1の範囲 | 新台25機種（解析ページが無い LBトリプルクラウンX‐300 を除く。解析が一部の13機種は「判明分だけ暫定登録」）と暫定9機種 |
| 丸め | 丸めの幅が重なるかで比べる。今の許容差（分母 0.1%・割合 0.1 ポイント）はやめる |
| 一部の設定だけの出典 | 新しく入れる値は全設定がそろった項目だけ。既存の値は、載っている設定がすべて合えば「残す」の裏づけに数える |
| `patterns` 形式 | アプリが読む形（パターンごとの普通の終了画面）に書き直す。明示の `id` で ID を固定し、アプリが読む形が前後で同じことをテストで確かめる |
| 外した ID の台帳 | 出典記録の `removed` に、外した項目の ID と出典の値を書き、検査で再利用を止める |
| 公式の出典 | メーカーの公式ドメインの一覧をリポジトリに置き、検証器で照合する |
| ブランチ保護 | 有効（validate 必須・マージ前に最新化。管理者は対象外）。2026-09-27 に設定済み |

根拠（アプリのコードで確かめたこと。slot-analyzer-ios）:
- 役・試行成功率・終了画面の確率に、機種の設定が1つでも欠けていると、推定全体が止まる（`utils/binomial.ts:172-176`・`:198-201`）。0 は「その設定では出ない」の意味
- 確定・否定の設定に設定番号でない値があると、推定全体が止まる（`utils/binomial.ts:114-130`）。3.9.0 で直し、validate で止めるようにした
- ボイスの `patterns` はアプリが読み込み時に捨てる（`schemas/index.ts:150-158`）。終了画面の `patterns` は、パターンごとの終了画面に展開される（`services/migrations/v1ToV2.ts:94-180`）

## Global Constraints

- 仕様: `docs/superpowers/specs/2026-09-26-data-expansion-design.md`（段階1の決定はこの計画の「本人の決定」。仕様の 5.4・5.5・5.7・5.8 を Task ごとに直す）
- 段階1a では `machines/` の中身を変えない。`machines/index.json` と `package.json` の version は 3.9.0 のまま
- 機種ファイル（`schemas/machine.schema.json`）と `index.json`（`schemas/index.schema.json`）のスキーマを変えない。出典記録のスキーマ（`schemas/provenance.schema.json`）は変えてよい（main の記録は0件）
- 保存する確率・割合は有効数字6桁（`Number(x.toPrecision(6))`）
- 出典キー `chonborista` の URL は `https://chonborista.com/` で始まり、kind は `analysis-site`
- zoneRole・endScreenGroupItem の項目名は `親の名前::子の名前`
- 新しい依存パッケージは入れない（既存の ajv・ajv-formats・vitest・eslint・prettier だけを使う）
- 既存のコードに合わせる: ESM、Prettier（singleQuote・semi・printWidth 100・trailingComma es5）、コメントとメッセージは日本語、検証器は `{ errors, warnings }` を返し、要素は `{ file, type, severity, message }`
- CI は Node 22、ローカルは Node 25（`fnm` に 24 もある）。どちらでもテストが通ること
- main へは PR からだけ入れる。強制 push しない。作業ブランチの upstream を main にしない。PR はマージ前に main の最新を取り込む（ブランチ保護）
- 作業場所: `~/.worktrees/slot-analyzer-data/data-expansion-p1`（ブランチ `feature/data-expansion-p1`。3.9.0 の修正をマージした後の main に載せ直してから始める）
- この環境では worktree が Bash サンドボックスの書き込み範囲の外にある。書き込み・git・npm を伴うコマンドはサンドボックスの外で実行する（読み取りは中でよい）
- 作業メモ（抜き出し・読み直しのメモ）は `~/.worktrees/slot-analyzer-data/notes/` に置く（git の外、second-brain の外）

---

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `scripts/lib/provenance.mjs` | 値の比較（丸めの幅）・変換・採否ルール | 変更（Task 1・2） |
| `scripts/validators/provenance-validator.mjs` | 出典記録の検証 | 変更（Task 1・4・5） |
| `scripts/lib/rules-against-base.mjs` | main と比べる採否ルール | 変更（Task 1・4） |
| `scripts/lib/derived-ids.mjs` | アプリが作る ID | 変更（Task 4） |
| `scripts/lib/expand-patterns.mjs` | `patterns` を普通の終了画面に書き直す | 新規（Task 3） |
| `scripts/expand-patterns.mjs` | 上の CLI | 新規（Task 3） |
| `config/official-domains.json` | メーカーの公式ドメインの一覧 | 新規（Task 5） |
| `schemas/official-domains.schema.json` | 上のスキーマ | 新規（Task 5） |
| `scripts/provenance-draft.mjs` | 抜き出しメモから、出典記録の下書きと保存値の表を作る | 新規（Task 6） |
| `scripts/reread-compare.mjs` | 抜き出しと読み直しのメモを照合する | 新規（Task 6） |
| `schemas/provenance.schema.json` | 出典記録 | 変更（Task 1・4） |
| `schemas/notes.schema.json` | 抜き出し・読み直しのメモ | 新規（Task 6） |
| `tests/*.test.mjs` | 各 Task のテスト | 追加 |
| `docs/data-format.md`・`docs/quality-standards.md`・`docs/CONTRIBUTING.md`・`README.md`・`CHANGELOG.md`・仕様 | 文書 | 変更（各 Task） |

---

### Task 1: 丸めの幅が重なるかで比べる

**Files:**
- Modify: `scripts/lib/provenance.mjs`、`schemas/provenance.schema.json`、`scripts/validators/provenance-validator.mjs`、`scripts/lib/rules-against-base.mjs`
- Test: `tests/provenance-lib.test.mjs`、`tests/provenance-rules.test.mjs`、`tests/provenance-validator.test.mjs`、`tests/rules-against-base.test.mjs`
- Docs: `docs/data-format.md`（値の書き方）、仕様 5.4

**Interfaces:**
- Produces（provenance.mjs の export）:
  - `STORED_MIN_DECIMALS = 6`
  - `decimalsOf(raw: number | string): number | null`
  - `parseShown(unit: 'denominator' | 'percent', raw: number | string | null): { zero: true } | { lo: number, hi: number } | null`
  - `storedInterval(p: number): { zero: true } | { lo: number, hi: number } | null`
  - `intervalsOverlap(a, b): boolean`
  - `storedMap(entry): Record<string, number> | null`（`probabilities ?? rates`。`listMachineItems` の entry を渡す）
  - `agreesWithStored(unit, value, stored, { partial = false } = {}): boolean`
  - `storedSupporters(unit, values, stored): string[]`
  - `toStoredFromShown(unit, raw): number`
- Changes: `shapeError`（文字列を受け付ける）、`valuesAgree`（幅の重なり）、`decideExistingItem({ ..., stored })`、`statusError(item, sourceKinds, { stored } = {})`
- Removes: `DENOMINATOR_TOLERANCE`・`PERCENT_TOLERANCE`（使っている所をすべて置き換える）

**比べ方（仕様 5.4 を置き換える）:**
- 出典の値は、表示の桁のまま書く。数（`295.2`）か、表示の桁を残す文字列（`"300.0"`）。% で表示されている値は `"3.1%"` と書く（項目の unit が分母でも書ける）。分母の `null` と割合の `0` は「確率 0」
- それぞれの値は、表示の最後の桁の半分だけ幅を持つ（`295.2` → 分母 295.15〜295.25、`"3.1%"` → 3.05〜3.15%）。幅は確率に直して比べる
- 機種ファイルの確率は、小数6桁より粗くないとみなす（`0.000076` → 0.0000755〜0.0000765。末尾の 0 は JSON で消えるので、表示の桁数では決めない）
- 2つの値は、すべての設定で幅が重なれば一致。確率 0 は確率 0 とだけ一致
- 採用値（`adopted`）と機種ファイルの値、「残す」の判断、main の値との比較は、機種ファイルの確率の幅（`storedInterval`）で比べる。分母に直した値（`1 ÷ 確率`）の桁では比べない

- [ ] **Step 1: 失敗するテストを書く（provenance-lib）**

```js
import {
  agreesWithStored,
  decimalsOf,
  intervalsOverlap,
  parseShown,
  storedInterval,
  storedSupporters,
  toStoredFromShown,
  valuesAgree,
} from '../scripts/lib/provenance.mjs';

describe('decimalsOf', () => {
  it('表示の桁数を数える（数・文字列・% 付き・指数表記）', () => {
    expect(decimalsOf(295.2)).toBe(1);
    expect(decimalsOf('300.0')).toBe(1);
    expect(decimalsOf('3.1%')).toBe(1);
    expect(decimalsOf(300)).toBe(0);
    expect(decimalsOf(0.000076)).toBe(6);
    expect(decimalsOf(1.5e-7)).toBe(8);
    expect(decimalsOf('abc')).toBeNull();
  });
});

describe('丸めの幅の重なり（valuesAgree）', () => {
  it('丸めだけの違いは一致する', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.24 })).toBe(true);
    expect(valuesAgree('denominator', { 1: 300 }, { 1: 300.4 })).toBe(true);
    expect(valuesAgree('denominator', { 1: '3.1%' }, { 1: 32.3 })).toBe(true);
  });

  it('丸めで説明できない違いは一致しない（今の 0.1% の許容差より厳しい所）', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.4 })).toBe(false);
    expect(valuesAgree('denominator', { 1: '300.0' }, { 1: 300.4 })).toBe(false);
    expect(valuesAgree('denominator', { 1: '3.1%' }, { 1: 33.0 })).toBe(false);
  });

  it('確率 0 は確率 0 とだけ一致する', () => {
    expect(valuesAgree('denominator', { 1: null }, { 1: null })).toBe(true);
    expect(valuesAgree('denominator', { 1: null }, { 1: 99999 })).toBe(false);
    expect(valuesAgree('percent', { 1: 0 }, { 1: '0.0%' })).toBe(true);
    expect(valuesAgree('percent', { 1: 0 }, { 1: 0.1 })).toBe(false);
  });

  it('設定の組が違えば一致しない', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 6: 277.7 }, { 1: 295.2 })).toBe(false);
  });
});

describe('機種ファイルの確率との比較', () => {
  it('小数6桁で保存した小さい確率は、出典の分母と一致する（I-4）', () => {
    expect(agreesWithStored('denominator', { 1: 13107.2 }, { 1: 0.000076 })).toBe(true);
  });

  it('末尾の 0 が消えた保存値でも、小数6桁の幅で比べる', () => {
    expect(agreesWithStored('denominator', { 1: 32.5 }, { 1: 0.031 })).toBe(false);
    expect(agreesWithStored('denominator', { 1: '3.1%' }, { 1: 0.03125 })).toBe(true);
  });

  it('partial: 載っている設定がすべて合えば一致（既存の値の裏づけ）', () => {
    const stored = { 1: 0.003388, 2: 0.003418, 5: 0.00351, 6: 0.003601 };
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 277.7 }, stored, { partial: true })).toBe(
      true
    );
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 277.7 }, stored)).toBe(false);
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 280 }, stored, { partial: true })).toBe(
      false
    );
    expect(agreesWithStored('denominator', { 3: 295.2 }, stored, { partial: true })).toBe(false);
  });

  it('storedSupporters は partial で数える', () => {
    const stored = { 1: 0.003388, 6: 0.003601 };
    const values = { nana: { 1: 295.2 }, other: { 1: 250 } };
    expect(storedSupporters('denominator', values, stored)).toEqual(['nana']);
  });
});

describe('区間の関数', () => {
  it('parseShown と storedInterval と intervalsOverlap', () => {
    expect(parseShown('denominator', null)).toEqual({ zero: true });
    expect(parseShown('percent', null)).toBeNull();
    expect(parseShown('denominator', 0.5)).toBeNull();
    expect(parseShown('denominator', '1/300')).toBeNull();
    expect(parseShown('percent', 101)).toBeNull();
    expect(storedInterval(0)).toEqual({ zero: true });
    expect(storedInterval(1.5)).toBeNull();
    expect(intervalsOverlap({ zero: true }, { zero: true })).toBe(true);
    expect(intervalsOverlap(null, { zero: true })).toBe(false);
  });
});

describe('toStoredFromShown', () => {
  it('表示の値を、機種ファイルに保存する確率（有効数字6桁）にする', () => {
    expect(toStoredFromShown('denominator', 295.2)).toBe(0.00338753);
    expect(toStoredFromShown('denominator', '300.0')).toBe(0.00333333);
    expect(toStoredFromShown('denominator', '3.1%')).toBe(0.031);
    expect(toStoredFromShown('denominator', null)).toBe(0);
    expect(toStoredFromShown('percent', 30.5)).toBe(0.305);
  });
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run tests/provenance-lib.test.mjs`
Expected: FAIL（`decimalsOf is not a function` など）

- [ ] **Step 3: 区間の関数を書く（provenance.mjs）**

`DENOMINATOR_TOLERANCE`・`PERCENT_TOLERANCE`・`denominatorsAgree`・`percentsAgree` を消し、次を足す（`FLOAT_EPSILON` は `OVERLAP_EPSILON` に置き換える）。

```js
/** 機種ファイルの確率は、小数6桁より粗くないとみなす（末尾の 0 は JSON で消えるため、表示の桁では決めない） */
export const STORED_MIN_DECIMALS = 6;

/** 区間の端がちょうど接するときに、浮動小数点の誤差で落ちないための余裕（確率の絶対値） */
const OVERLAP_EPSILON = 1e-12;

/** 出典の値として書ける文字列（表示の桁を残した数か、% 付きの割合） */
const SHOWN_TEXT = /^(0|[1-9]\d*)(\.\d+)?%?$/;

/**
 * 数や数の文字列の、小数点より下の桁数（表示の桁）。指数表記（1.5e-7 など）にも対応する。
 * @returns {number | null} 数として読めなければ null
 */
export function decimalsOf(raw) {
  const text = typeof raw === 'number' ? String(raw) : String(raw).replace(/%$/, '');
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;
  const fraction = match[2]?.length ?? 0;
  const exponent = Number(match[3] ?? 0);
  return Math.max(0, fraction - exponent);
}

/**
 * 出典に表示された値を、確率の幅にする（仕様 5.4）。表示の最後の桁の半分だけ幅を持たせる
 * （295.2 → 分母 295.15〜295.25、"3.1%" → 3.05〜3.15%）。確率 0 は幅を持たず、0 とだけ一致する。
 * "%" の付いた文字列は、項目の unit にかかわらず割合として読む。
 * @param {'denominator' | 'percent'} unit
 * @returns {{ zero: true } | { lo: number, hi: number } | null} 読めなければ null
 */
export function parseShown(unit, raw) {
  if (raw === null) return unit === 'denominator' ? { zero: true } : null;
  let form = unit;
  let text;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    text = String(raw);
  } else if (typeof raw === 'string' && SHOWN_TEXT.test(raw)) {
    if (raw.endsWith('%')) form = 'percent';
    text = raw.replace(/%$/, '');
  } else {
    return null;
  }
  const value = Number(text);
  const decimals = decimalsOf(text);
  if (decimals === null) return null;
  const half = 0.5 * 10 ** -decimals;
  if (form === 'percent') {
    if (!(value >= 0 && value <= 100)) return null;
    if (value === 0) return { zero: true };
    return { lo: Math.max(0, value - half) / 100, hi: Math.min(100, value + half) / 100 };
  }
  if (!(value >= 1)) return null;
  return { lo: 1 / (value + half), hi: Math.min(1, 1 / (value - half)) };
}

/**
 * 機種ファイルの確率（0〜1）の幅。
 * @returns {{ zero: true } | { lo: number, hi: number } | null} 確率として読めなければ null
 */
export function storedInterval(p) {
  if (typeof p !== 'number' || !(p >= 0 && p <= 1)) return null;
  if (p === 0) return { zero: true };
  const decimals = Math.max(decimalsOf(p) ?? 0, STORED_MIN_DECIMALS);
  const half = 0.5 * 10 ** -decimals;
  return { lo: Math.max(0, p - half), hi: Math.min(1, p + half) };
}

/** 2つの幅が重なるか。確率 0 は確率 0 とだけ重なる。読めない値（null）は重ならない */
export function intervalsOverlap(a, b) {
  if (a === null || b === null) return false;
  if (a.zero || b.zero) return Boolean(a.zero && b.zero);
  return a.lo <= b.hi + OVERLAP_EPSILON && b.lo <= a.hi + OVERLAP_EPSILON;
}
```

- [ ] **Step 4: 形と比較を書き換える（provenance.mjs）**

- `shapeError`:
  - `denominator`: 空でないオブジェクトで、すべての値が `parseShown('denominator', v) !== null`。説明は `'設定ごとに、1 以上の分母（数か、表示の桁を残した文字列）、% 付きの割合、または確率 0 を表す null が必要'`
  - `percent`: 空でないオブジェクトで、すべての値が `parseShown('percent', v) !== null`。説明は `'設定ごとに、0〜100 の割合（数か、表示の桁を残した文字列）が必要'`
- `valuesAgree` の `denominator`・`percent`: `sameKeys(a, b) && Object.keys(a).every((k) => intervalsOverlap(parseShown(unit, a[k]), parseShown(unit, b[k])))`
- `valuesEqual`: 変えない（値そのもの `===` で比べる。`"300.0"` と `300` は同じでない）
- 次を足す:

```js
/** 項目の確率（listMachineItems の entry を渡す。最上位の終了画面の distribution はそこで渡し直している） */
export function storedMap(entry) {
  return numericMap(entry);
}

/**
 * 出典などの値が、機種ファイルの確率と一致するか。partial では、値に載っている設定だけを比べる
 * （既存の値の「残す」の裏づけ。本人の決定 2026-09-27）。値の設定がすべて機種ファイルにあり、1つ以上あること。
 */
export function agreesWithStored(unit, value, stored, { partial = false } = {}) {
  if (shapeError(unit, value) !== null || stored === null || typeof stored !== 'object') return false;
  const keys = Object.keys(value);
  const keysOk = partial
    ? keys.length > 0 && keys.every((k) => Object.hasOwn(stored, k))
    : sameKeys(value, stored);
  return (
    keysOk && keys.every((k) => intervalsOverlap(parseShown(unit, value[k]), storedInterval(stored[k])))
  );
}

/** 機種ファイルの確率を裏づける出典のキー（partial で数える） */
export function storedSupporters(unit, values, stored) {
  return Object.keys(values).filter((key) =>
    agreesWithStored(unit, values[key], stored, { partial: true })
  );
}

/** 表示の値を、機種ファイルに保存する確率（有効数字6桁）にする */
export function toStoredFromShown(unit, raw) {
  if (raw === null) return 0;
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (text.endsWith('%') || unit === 'percent') return toStoredRate(Number(text.replace(/%$/, '')));
  return toStoredProbability(Number(text));
}
```

- `decideExistingItem({ unit, values, sourceKinds, reread, current, stored })`: 「残す」の判断を、数値の unit（`denominator`・`percent`）では `storedSupporters(unit, values, stored).length >= 1` にする。数値の unit で `stored` が無ければ `Error('数値の項目には stored（機種ファイルの確率）が必要')` を投げる。設定の組・有無は今のまま `supporters(unit, values, current)`
- `statusError(item, sourceKinds, { stored } = {})`: `kept-single-source` の裏づけを、数値の unit では `storedSupporters(unit, values, stored)` で数える（`stored` が無ければ `'kept-single-source の確かめには機種ファイルの確率が要る'` を返す）

- [ ] **Step 5: 検証器と main との比較を書き換える**

- `provenance-validator.mjs` の `checkItem`:
  - 機種ファイルの値と `adopted` の比較を、数値の unit では `agreesWithStored(item.unit, item.adopted, storedMap(target.entry))`（全設定）にする。設定の組・有無は今のまま（`valuesAgree(unit, machineValue(entry, unit), adopted)`）
  - `statusError(item, sourceKinds, { stored: storedMap(target.entry) })`
  - エラーの文面は今のまま（「機種ファイルの値と adopted が一致しない」など）
- `rules-against-base.mjs`: `provisional-chonborista` の「ちょんぼりすたの値が main の値と一致する」を、数値の unit では `agreesWithStored(unit, chonborista, storedMap(baseItem.entry), { partial: true })` にする（「残す」の判断と同じ数え方）。`kept-single-source` の完全一致の確かめ（`valuesEqual`）は変えない

- [ ] **Step 6: スキーマ（provenance.schema.json）**

`settingKeyedNumbers` の値を `{ "anyOf": [{ "type": ["number", "null"] }, { "type": "string", "pattern": "^(0|[1-9][0-9]*)(\\.[0-9]+)?%?$" }] }` にする。

- [ ] **Step 7: テストを足す（rules・validator・rules-against-base）**

- provenance-rules: `decideExistingItem` で、`current` と `stored` を渡したとき
  - 出典 `{ nana: { 1: 13107.2 } }`・`stored { 1: 0.000076 }`・`current { 1: 1 / 0.000076 }` → `kept-single-source`（I-4 が直る）
  - 出典 `{ nana: { 1: 295.2, 6: 277.7 } }`・4設定の `stored` → `kept-single-source`（一部の設定だけの出典を裏づけに数える）
  - 数値の unit で `stored` を渡さない → 例外
- provenance-validator: `"3.1%"` を採用値にした分母の項目（機種ファイル 0.031）が通る。採用値 `295.4` と機種ファイル 0.00338753（1/295.2）はエラー
- rules-against-base: main の値 `{ 1: 0.000076 }` に、ちょんぼりすた `{ 1: 13107.2 }` の provisional-chonborista → 「一致する（kept-single-source にする）」の報告

- [ ] **Step 8: 通す**

Run: `npx vitest run`（全体）・`npx eslint .`・`npx prettier --check "scripts/**/*.mjs" "tests/**/*.mjs" "*.mjs"`・`npm run validate`・`npm run -s check:base`
Expected: すべて通る。validate はエラー0・警告0

- [ ] **Step 9: 文書**

- `docs/data-format.md` の出典記録の節: 値の書き方（表示の桁のまま・末尾の 0 は文字列・% 表示は `"3.1%"`）と、比べ方（丸めの幅の重なり・機種ファイルの確率は小数6桁の幅）を書く。unit の表の説明から「0.1%」「0.1 ポイント」を消す
- 仕様 5.4: 「一致の条件」の表と、その下の段落（0.1% の理由）を、上の比べ方に書き換える。決定日（2026-09-27）を書く

- [ ] **Step 10: コミット**

```bash
git add scripts/lib/provenance.mjs scripts/validators/provenance-validator.mjs scripts/lib/rules-against-base.mjs schemas/provenance.schema.json tests/ docs/
git commit -m "feat(provenance): 丸めの幅が重なるかで値を比べる（許容差をやめる）"
```

---

### Task 2: 一部の設定だけの出典

**Files:**
- Modify: `scripts/lib/provenance.mjs`（`decideNewItem`）
- Test: `tests/provenance-rules.test.mjs`
- Docs: 仕様 5.5、`docs/data-format.md`

**Interfaces:**
- Changes: `decideNewItem({ unit, values, sourceKinds, reread, settings })`。`settings` は機種の設定（`availableSettings`、無ければ "1"〜"6"）。数値の unit で必須

**決まり:**
- 新しく入れる値: 採用する値が、機種のすべての設定の値を持つこと。持たなければ `{ outcome: 'candidate', reason: '全設定の値がそろわない（アプリは設定が1つでも欠けた確率があると推定が止まる）' }`
- 既存の値: Task 1 の `storedSupporters`（partial）で「残す」の裏づけに数える（Task 1 で済み。ここではテストで押さえ直す）
- 一致（2サイト・公式）の判定は、今のまま同じ設定の組どうしで比べる。一部の設定だけの出典は `values` に記録するが、新しい値の一致には数えない

- [ ] **Step 1: 失敗するテストを書く**

- `decideNewItem` で、ちょんぼりすた `{ 1: 295.2, 6: 277.7 }`・読み直し一致・`settings ['1','2','5','6']` → candidate（上の理由）
- 同じ値で `settings ['1','6']` → `provisional-chonborista`
- 2サイトが `{ 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 }` で一致・`settings ['1','2','5','6']` → confirmed
- 数値の unit で `settings` を渡さない → 例外 `'数値の項目には settings（機種の設定）が必要'`
- 設定の組・有無の unit では `settings` を見ない

- [ ] **Step 2: 実装**

`decideNewItem` の最後に、`outcome: 'adopt'` を返す前に、数値の unit では `sameKeys(adopted, Object.fromEntries(settings.map((s) => [s, true])))` を確かめる（そろわなければ candidate）。

- [ ] **Step 3: 通す・文書・コミット**

仕様 5.5 の「新しく入れる値」に1行（全設定がそろった項目だけ）、「既存の値」の規則2に1行（一部の設定だけの出典も、載っている設定がすべて合えば数える）を足す。`docs/data-format.md` に同じことを書く。

```bash
git commit -m "feat(provenance): 新しい値は全設定がそろった項目だけにする"
```

---

### Task 3: `patterns` を普通の終了画面に書き直す道具

**Files:**
- Create: `scripts/lib/expand-patterns.mjs`、`scripts/expand-patterns.mjs`
- Test: `tests/expand-patterns.test.mjs`
- Docs: `docs/data-format.md`、`docs/CONTRIBUTING.md`、仕様 5.4

**Interfaces:**
- Produces: `expandEndScreenPatterns(machine: object): { machine: object, expanded: Array<{ name: string, patterns: number }> }`
- CLI: `node scripts/expand-patterns.mjs <machines/ からのファイル>... [--write]`（`--write` が無ければ、書き直す内容を表示するだけ）

**決まり:**
- 最上位の `endScreens` のうち、空でない `patterns` を持つものを、アプリの移行処理（`scripts/migrate-v1-to-v2.mjs`。アプリの `services/migrations/v1ToV2.ts` の移植）が作るのと同じ終了画面に置き換える。並び順は変えない（親の位置に、パターンの順で並べる）
- 置き換えた終了画面は、移行処理が作る値そのものを持つ: `id`（明示の id として書く）・`name`・`type`・`hint`・`confirmedSettings`・`color`（親にあれば）
- 書き直した機種を移行処理に通した `endScreens` が、元の機種を通したものと完全に同じであること（キーの順は問わない）。同じでなければ例外を投げ、書き直さない
- `endScreenGroups` の中の `patterns` と、`voiceCounts` の `patterns` は対象外（アプリはボイスの `patterns` を捨てる。グループの中は展開しない）

- [ ] **Step 1: 失敗するテストを書く**

```js
import { readFileSync } from 'fs';
import { expandEndScreenPatterns } from '../scripts/lib/expand-patterns.mjs';
import { migrateV1ToV2 } from '../scripts/migrate-v1-to-v2.mjs';

const index = JSON.parse(readFileSync('machines/index.json', 'utf-8'));
const withPatterns = index.machines
  .map((entry) => ({ entry, machine: JSON.parse(readFileSync(`machines/${entry.file}`, 'utf-8')) }))
  .filter(({ machine }) => (machine.endScreens ?? []).some((s) => (s.patterns ?? []).length > 0));

describe('expandEndScreenPatterns', () => {
  it('実データで、patterns を持つ機種がある（17機種）', () => {
    expect(withPatterns.length).toBe(17);
  });

  it.each(withPatterns.map(({ entry, machine }) => [entry.id, machine]))(
    '%s: アプリが読む形が、書き直しの前後で同じ',
    (_id, machine) => {
      const { machine: expanded } = expandEndScreenPatterns(machine);
      expect(migrateV1ToV2(expanded).endScreens).toEqual(migrateV1ToV2(machine).endScreens);
      expect((expanded.endScreens ?? []).some((s) => (s.patterns ?? []).length > 0)).toBe(false);
    }
  );

  it('patterns が無ければ、同じオブジェクトを返す', () => {
    const machine = { name: 'x', endScreens: [{ name: 'a', confirmedSettings: ['6'] }] };
    expect(expandEndScreenPatterns(machine)).toEqual({ machine, expanded: [] });
  });

  it('展開した画面は明示の id を持つ', () => {
    const machine = {
      name: 'x',
      endScreens: [{ id: 'p', name: '親', patterns: [{ name: 'A', setting: '6' }, { name: 'B' }] }],
    };
    const { machine: expanded, expanded: list } = expandEndScreenPatterns(machine);
    expect(expanded.endScreens.map((s) => s.id)).toEqual(['p_1', 'p_2']);
    expect(expanded.endScreens[0].confirmedSettings).toEqual(['6']);
    expect(expanded.endScreens[1].confirmedSettings).toEqual([]);
    expect(list).toEqual([{ name: '親', patterns: 2 }]);
  });
});
```

（17 は 2026-09-27 の実データの数。3.9.0 の修正で `setting` を外したパターンも、展開すると確定する設定が空の終了画面になる）

- [ ] **Step 2: 実装**

```js
import { migrateV1ToV2 } from '../migrate-v1-to-v2.mjs';

function hasPatterns(screen) {
  return Array.isArray(screen.patterns) && screen.patterns.length > 0;
}

/** 移行処理がパターンから作る終了画面を、機種ファイルに書く形にする（パターンの経路が作るキーだけ） */
function toStandard(screen) {
  const result = {
    id: screen.id,
    name: screen.name,
    type: screen.type,
    hint: screen.hint,
    confirmedSettings: screen.confirmedSettings,
  };
  if (screen.color !== undefined) result.color = screen.color;
  return result;
}

/**
 * 最上位の終了画面の patterns を、アプリの移行処理と同じ終了画面に書き直す（本人の決定 2026-09-27）。
 * 書き直した後も、アプリが読む形（移行処理の結果）は元と同じ。同じでなければ例外を投げる。
 */
export function expandEndScreenPatterns(machine) {
  const screens = machine.endScreens ?? [];
  if (!screens.some(hasPatterns)) return { machine, expanded: [] };

  const migrated = migrateV1ToV2(machine).endScreens;
  const endScreens = [];
  const expanded = [];
  let cursor = 0;
  for (const screen of screens) {
    if (hasPatterns(screen)) {
      const count = screen.patterns.length;
      endScreens.push(...migrated.slice(cursor, cursor + count).map(toStandard));
      expanded.push({ name: screen.name, patterns: count });
      cursor += count;
    } else {
      endScreens.push(screen);
      cursor += 1;
    }
  }
  const result = { ...machine, endScreens };
  const before = JSON.stringify(sortKeysDeep(migrated));
  const after = JSON.stringify(sortKeysDeep(migrateV1ToV2(result).endScreens));
  if (before !== after) throw new Error(`書き直すと、アプリが読む終了画面が変わる: ${machine.name}`);
  return { machine: result, expanded };
}
```

`sortKeysDeep` はオブジェクトのキーを並べ替えて比べるための小さな関数（同じファイルに置く）。CLI は、引数のファイルを読み、`expandEndScreenPatterns` の結果を表示する。`--write` のときだけ、元と同じ整形（2スペース・末尾改行）で書き戻す。機種の version と `lastUpdated` は変えない（値もアプリが読む形も同じ。ただしアプリは中身の違いで「更新」を知らせる。2026-09-27 のレビューで分かったことを追記）。実装では、最上位の `endScreens` の配列の部分だけを差し替え、ほかは1バイトも変えない（元の改行に合わせ、想定外の欄があれば止める）。

- [ ] **Step 3: 通す・文書・コミット**

`docs/data-format.md`: `patterns` 形式は新しく使わず、見直す機種から `node scripts/expand-patterns.mjs <ファイル> --write` で書き直すこと。仕様 5.4 の `patterns` の段落を、この決まりに書き換える。`docs/CONTRIBUTING.md` の見直しの手順に1行。

```bash
git commit -m "feat(scripts): patterns を、アプリが読む形の終了画面に書き直す道具を足す"
```

---

### Task 4: 外した ID の台帳

**Files:**
- Modify: `schemas/provenance.schema.json`（`removed`）、`scripts/validators/provenance-validator.mjs`、`scripts/lib/rules-against-base.mjs`、`scripts/lib/derived-ids.mjs`（ID を作る種類の定数を使う）
- Test: `tests/provenance-validator.test.mjs`、`tests/rules-against-base.test.mjs`
- Docs: `docs/data-format.md`、仕様 5.7・5.8

**`removed` の形（すべて必須。`appId` は ID を作る種類だけ必須で、それ以外では書かない）:**

```json
{
  "kind": "role",
  "name": "中段チェリー",
  "unit": "denominator",
  "previous": { "name": "中段チェリー", "probabilities": { "1": 0.0001 }, "hasSettingDiff": false, "displayOrder": 7 },
  "values": { "chonborista": { "1": 12000 } },
  "appId": "chuudan_cherry_7",
  "reason": "今の値を裏づける出典なし"
}
```

- `previous`: 外す前の、機種ファイルの項目そのもの（オブジェクト）
- `values`: 調べた出典の値（見つからなければ `{}`）
- `appId`: main でアプリがその項目に作っていた ID（`collectDerivedIds` の値）

**検証（validate）:**
- `unit` が `allowedUnits(kind, previous)` のどれかでなければエラー（項目と同じ文面）
- `values` の形（`shapeError`）
- 外す条件（仕様 5.5 の既存の値の規則4）: `decideExistingItem({ unit, values, sourceKinds, current: machineValue(previous, unit), stored: storedMap(previous) })` が `remove` でなければ `${key}: 外す条件に合わない（${理由}）` のエラー。理由は、採否ルールが選んだ status（例: 「kept-single-source にできる」）
- ID を作る種類で `appId` が無い、それ以外で `appId` がある → エラー

**main と比べる検査（check:base）:**
- ID を作る種類の `removed` で、main にその項目があれば、`appId` が main の ID と同じでなければ `${機種ID}: ${key}: removed の appId が main の ID と違う（main: ${id}）`
- 比べる側で新しく足した項目（main に無い項目キー）の ID が、比べる側の記録のどれかの `removed[].appId` と同じ範囲（`idScope`）で同じなら `${機種ID}: ${key}: 外した項目の ID（${id}）を新しい項目が使っている（明示の id を付ける）`（PR をまたいだ引き継ぎも、記録が main に残るので見つかる）

- [ ] **Step 1: 失敗するテストを書く**（上の各規則に、エラーになる例と通る例を1つずつ）
- [ ] **Step 2: 実装**（スキーマ → 検証器 → check:base）
- [ ] **Step 3: 通す・文書・コミット**

仕様 5.8 の最後の箇条（「先の PR で外した項目の ID を…段階2で…仕組みを足す」）を、この仕組みの説明に書き換える。

```bash
git commit -m "feat(provenance): 外した項目の ID と出典の値を記録し、ID の再利用を止める"
```

---

### Task 5: 公式ドメインの一覧

**Files:**
- Create: `config/official-domains.json`、`schemas/official-domains.schema.json`
- Modify: `scripts/validators/provenance-validator.mjs`、`scripts/validate.mjs`（一覧の読み込み）
- Test: `tests/provenance-validator.test.mjs`
- Docs: `docs/CONTRIBUTING.md`、`docs/data-format.md`、仕様 5.7

**形:**

```json
{
  "domains": [
    {
      "domain": "sammy.co.jp",
      "maker": "サミー",
      "evidence": "https://www.sammy.co.jp/japanese/company/",
      "checkedAt": "2026-09-27"
    }
  ]
}
```

最初は空（`"domains": []`）で入れる。段階1b で公式の出典を初めて使うときに、その PR で足す。

**決まり:**
- `kind: "official"` の出典は、URL のサイト（登録ドメイン。`siteOf`）が一覧にあること。無ければ `公式の出典のドメインが一覧（config/official-domains.json）に無い: ${site}` のエラー
- 一覧の検証: スキーマ（`domain` は登録ドメインの形・重複なし・`evidence` は https の URL・`checkedAt` は日付）
- 一覧に足す手順（CONTRIBUTING）: メーカーの会社情報のページで、そのドメインがメーカーのものだと確かめ、そのページを `evidence` に書く。足した行は PR の差分で本人が見られる

- [ ] **Step 1: 失敗するテストを書く**（一覧にある公式は通る・無い公式はエラー・一覧の重複はエラー）
- [ ] **Step 2: 実装**
- [ ] **Step 3: 通す・文書・コミット**

```bash
git commit -m "feat(provenance): 公式の出典をメーカーのドメインの一覧で確かめる"
```

---

### Task 6: 記録の下書きと、読み直しの照合の道具

**Files:**
- Create: `scripts/provenance-draft.mjs`、`scripts/reread-compare.mjs`、`schemas/notes.schema.json`
- Test: `tests/provenance-draft.test.mjs`、`tests/reread-compare.test.mjs`
- Docs: `docs/CONTRIBUTING.md`（記録の手順）、`docs/data-format.md`（メモの形）

**抜き出しのメモ（`~/.worktrees/slot-analyzer-data/notes/<バッチ>/<機種ID>.extract.json`）:**

```json
{
  "machineId": "karakuri-circus2",
  "machineName": "Lパチスロ からくりサーカス2",
  "availableSettings": ["1", "2", "3", "4", "5", "6"],
  "sources": [
    { "key": "chonborista", "kind": "analysis-site", "url": "https://chonborista.com/slot/sankyo-slot/256699/", "retrievedAt": "2026-09-28" }
  ],
  "items": [
    { "kind": "role", "name": "弱チェリー", "unit": "denominator", "values": { "chonborista": { "1": 99.9, "6": 94.2 } } }
  ]
}
```

**読み直しのメモ（`<機種ID>.reread.json`）:** 抜き出しをしていない担当が、機種名・出典の URL・項目名だけを渡されて書く。

```json
{
  "machineId": "karakuri-circus2",
  "by": "reread-agent-2",
  "items": [
    { "kind": "role", "name": "弱チェリー", "source": "chonborista", "value": { "1": 99.9, "6": 94.2 } }
  ]
}
```

**`node scripts/provenance-draft.mjs <extract.json> [--reread <reread.json>]`:**
- メモをスキーマで確かめる
- 機種が `machines/index.json` に無ければ新台として、項目ごとに `decideNewItem`（`settings` はメモの `availableSettings`）で決める。ある機種なら、機種ファイルにある項目は `decideExistingItem`（`current`・`stored` は機種ファイルから）、無い項目は `decideNewItem`
- 読み直しのメモがあれば、ちょんぼりすたの値の読み直しを `reread` として渡す
- 出力: 出典記録の下書き（JSON。`items`・`candidates`・`removed`。`removed` には `previous` と、ID を作る種類なら `appId`）と、採用した項目の「機種ファイルに書く値」の表（`toStoredFromShown`）。機種ファイルは書き換えない
- 終了コード: 0 = 下書きを出した / 1 = メモが形に合わない / 2 = 読めない

**`node scripts/reread-compare.mjs <extract.json> <reread.json>`:**
- 読み直しのメモの各行を、抜き出しのメモの同じ項目・同じ出典の値と `valuesAgree` で比べる
- 食い違い・抜き出しにしか無い（読み直していない）項目と出典・読み直しにしか無い行を並べる
- 終了コード: 0 = すべて一致 / 1 = 食い違いか抜けがある、または照合する行が無い（比べた行が 0 件） / 2 = 照合できない（読めない・メモの形に合わない・抜き出しの値が unit の形に合わない・機種 ID が違う・同じ項目の行が重なる・引数の誤り）（2026-09-29 controller の決定で、実装に合わせて直した）

- [ ] **Step 1: 失敗するテストを書く**（新台・既存機種・読み直しあり・食い違いあり・形の誤り、の各場合。一時フォルダにメモを書いて子プロセスで実行し、出力と終了コードを確かめる）
- [ ] **Step 2: 実装**
- [ ] **Step 3: 通す・文書・コミット**

```bash
git commit -m "feat(scripts): 抜き出しメモから記録の下書きを作る道具と、読み直しの照合の道具を足す"
```

---

### Task 6b: 3.9.0 の検証の規則の残り（PR #22 のレビューの Minor）

**Files:** `scripts/validators/confirmation-validator.mjs`、`scripts/validators/probability-validator.mjs`、`tests/validate.test.mjs`（新しい共有の定数を置くなら `scripts/validators/app-impact.mjs`）

- [ ] **M1**: `patterns` が空でない最上位の終了画面では、親の `confirmedSettings`・`excludedSettings`・`probabilities`・`distribution` をアプリは使わない（移行処理が親を捨てる）。規則1・5 はこの親の欄を見ないか、末尾を「（アプリは使わない）」にする。テストを1つ足す
- [ ] **M2**: 楽曲・演出の「確定と否定の両方にある値」の末尾と、確定・否定の設定に文字列でない値を入れたときの「（アプリが機種を読み込めない）」を、テストで押さえる（`endsWith` を1行ずつ）
- [ ] **M3**: 末尾の文言の定数（検証器2つとテストに重複）を1か所にまとめる
- [ ] **M5（今後の規則）**: 次の3つを validate で止める。どれも今のデータには無い
  - 最上位の終了画面の `distribution` の値が 0〜1 の数でない（アプリは確率として使う）
  - パターンの `name` が無い・空（アプリは必須にしている。無いと機種を読み込めない）
  - 1つの項目だけで全設定を否定する書き方（確率がすべて 0、`excludedSettings` が全設定など。数えると全設定が除かれる）

```bash
git commit -m "fix(validate): 3.9.0 の検証の規則の文言とテストを直し、推定が止まる形を3つ足す"
```

---

### Task 7: 関門を通して PR を出し、マージする

**Files:** なし（検証・PR・マージ）

本人の承認（2026-09-25「検証後にマージまで任せる」）の範囲で行う。どれかで落ちたら直して、Step 1 からやり直す。

- [ ] **Step 1: CI と同じ検査**: `npm run -s validate`（エラー0・警告0）・`npx vitest run`・`npx eslint .`・`npx prettier --check "scripts/**/*.mjs" "tests/**/*.mjs" "*.mjs"`・`npm run -s quality`（`provenance (出典記録) 0/149`）・`git fetch origin && npm run -s check:base`（問題なし）
- [ ] **Step 2: Node 24 でもテスト**: `fnm exec --using 24 -- npx vitest run`
- [ ] **Step 3: データ不変**: `git diff --stat origin/main -- machines/` が空
- [ ] **Step 4: アプリの取り込みテスト**: `cd ~/second-brain/pachinko-tools/slot-analyzer-ios && SLOT_DATA_ROOT="$HOME/.worktrees/slot-analyzer-data/data-expansion-p1" npm run -s test:data-contract`（150 passed）
- [ ] **Step 5: push・PR**: `git push -u origin feature/data-expansion-p1`、PR の本文に Step 1〜4 の出力、決定の表、レビューの記録（同じベンダーかどうか）を書く
- [ ] **Step 6: CI を待つ**: アプリの PR 用ツール（ccd_pr）か `gh pr checks <番号> --watch` で待つ。validate ジョブが pass
- [ ] **Step 7: マージ**: `gh pr merge <番号> --merge`（ブランチ保護で、main の最新が取り込まれていないと止まる。止まったら `sync` して Step 1 から）
- [ ] **Step 8: 読み戻し**: origin/main がマージコミット、raw の `index.json` が `3.9.0 149`、main の CI が success（「直前の main との比較」も success）
- [ ] **Step 9: 記録と片付け**: `~/.harness/bin/ledger-note.sh` に1行。`.superpowers/sdd` を `~/.worktrees/slot-analyzer-data/.archive-<日付>/` へ退避してから worktree を外す（段階1b を同じ worktree で続けるなら外さない）

---

## 段階1b について

段階1b（データ）は別の計画（`2026-09-27-data-expansion-phase1b-machines.md`）に書く。この計画の道具（`provenance-draft`・`reread-compare`・`expand-patterns`）と、新台の洗い出しの結果（25機種）を使い、3つのバッチ（解析が多い12機種 → 3.10.0、解析が一部の13機種 → 3.11.0、暫定9機種 → 3.12.0）で PR を出す。
