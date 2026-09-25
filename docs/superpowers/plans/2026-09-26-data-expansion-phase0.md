# 機種データ拡充 段階0（出典記録の仕組み）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 出典記録（provenance）の形・値の比較・採否ルール・検証と、main と比べる検査（アプリが名前から作る ID・見直し前の値が要る採否ルール）を slot-analyzer-data に入れる。データは変えずに main へマージする。

**Architecture:** 純粋関数の `scripts/lib/provenance.mjs`（値の比較・変換・採否ルール）と `scripts/lib/derived-ids.mjs`（ID の収集と比較）を土台にする。その上に、既存の検証器と同じ形の `scripts/validators/provenance-validator.mjs` を置き、`validate.mjs` の6番目の検査として呼ぶ。出典記録は機種ファイルとは別の `provenance/<機種ID>.json` に置く。validate は main を読まないので、ID の安定性と、見直し前の値が要る採否ルール（`scripts/lib/rules-against-base.mjs`）は `scripts/check-against-base.mjs` で main と比べ、PR の CI でも実行する。

**Tech Stack:** Node.js（ESM `.mjs`）、ajv 8 + ajv-formats、vitest 3、ESLint 9、Prettier。

## Global Constraints

- 仕様: `docs/superpowers/specs/2026-09-26-data-expansion-design.md`（特に5章）
- 段階0では `machines/` の中身を変えない。`machines/index.json` と `package.json` の version は `3.8.0` のまま
- 機種ファイル（`schemas/machine.schema.json`）と `index.json`（`schemas/index.schema.json`）のスキーマを変えない
- 一致の判定: 分母は `|a−b| ÷ 大きい方 ≤ 0.001`（0.1%）、割合は差が 0.1 ポイント以内、設定の組は完全一致
- 保存する確率・割合は有効数字6桁（`Number(x.toPrecision(6))`）
- 出典キー `chonborista` の URL は `https://chonborista.com/` で始まる
- zoneRole・endScreenGroupItem の項目名は `親の名前::子の名前`
- 新しい依存パッケージは入れない（既存の ajv・ajv-formats・vitest・eslint・prettier だけを使う）
- 既存のコードに合わせる: ESM、Prettier（singleQuote・semi・printWidth 100・trailingComma es5）、コメントとメッセージは日本語、検証器は `{ errors, warnings }` を返し、要素は `{ file, type, severity, message }`
- CI は Node 22、ローカルは Node 25（`fnm` に 24 もある）。どちらでもテストが通ること
- main へは PR からだけ入れる。強制 push しない。作業ブランチの upstream を main にしない
- 作業場所: `~/.worktrees/slot-analyzer-data/data-expansion-p0`（ブランチ `feature/data-expansion-p0-provenance`。main `14fb3c7` から作成済みで、upstream は外してある）
- この環境では worktree が Bash サンドボックスの書き込み範囲の外にある。書き込み・git・npm を伴うコマンドはサンドボックスの外で実行する（読み取りは中でよい）
- 以下のコマンドは、特に断りがなければ worktree のルートで実行する

---

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `scripts/lib/provenance.mjs` | 値の比較・変換・項目の列挙・採否ルール（純粋関数） | 新規 |
| `scripts/lib/load-provenance.mjs` | `provenance/*.json` の読み込み | 新規 |
| `scripts/lib/derived-ids.mjs` | アプリが作る ID の収集・比較・全機種チェック | 新規 |
| `scripts/lib/rules-against-base.mjs` | 採否ルールのうち、見直し前の値（main）が要るものを確かめる | 新規 |
| `scripts/validators/provenance-validator.mjs` | 出典記録の検証（スキーマと機種ファイルとの整合） | 新規 |
| `scripts/check-against-base.mjs` | main と比べる検査（ID の安定性・採否ルール）の CLI | 新規 |
| `schemas/provenance.schema.json` | 出典記録の JSON Schema | 新規 |
| `provenance/README.md` | 置き場所の説明 | 新規 |
| `scripts/validate.mjs` | 6番目の検査として出典記録を検証。`--require-provenance` | 変更 |
| `scripts/quality-report.mjs` | 出典記録のある機種数を出す | 変更 |
| `package.json` | `check:base` スクリプト | 変更 |
| `.github/workflows/validate.yml` | PR で main と比べる検査を実行する | 変更 |
| `tests/provenance-lib.test.mjs` | Task 1 のテスト | 新規 |
| `tests/provenance-rules.test.mjs` | Task 2 のテスト | 新規 |
| `tests/provenance-validator.test.mjs` | Task 3 のテスト | 新規 |
| `tests/load-provenance.test.mjs` | Task 4 のテスト | 新規 |
| `tests/derived-ids.test.mjs` | Task 5 のテスト（ID） | 新規 |
| `tests/rules-against-base.test.mjs` | Task 5 のテスト（採否ルール） | 新規 |
| `tests/integration.test.mjs` | 実データでの確認を追加 | 変更 |
| `docs/data-format.md` ほか文書 | 出典記録と ID の規則 | 変更 |

---

### Task 1: 値の比較と変換、機種ファイルの項目の列挙

**Files:**
- Create: `scripts/lib/provenance.mjs`
- Test: `tests/provenance-lib.test.mjs`

**Interfaces:**
- Consumes: なし
- Produces（後のタスクが使う）:
  - 定数 `CHONBORISTA_KEY = 'chonborista'`、`NAME_SEPARATOR = '::'`、`DENOMINATOR_TOLERANCE = 0.001`、`PERCENT_TOLERANCE = 0.1`
  - `itemKey(kind: string, name: string): string` … `"kind::name"`
  - `shapeError(unit: string, value: unknown): string | null`
  - `valuesAgree(unit: string, a: unknown, b: unknown): boolean`
  - `toStoredProbability(denominator: number): number` / `toStoredRate(percent: number): number`
  - `machineValue(entry: object, unit: string): object | true | null`（空の probabilities も null）
  - `createNameDisambiguator(): (kind: string, name: string) => string` … 同じ種類で同じ名前が2つ目以降に出たとき、名前に `#2`、`#3` を付けて返す（実データの tekken5・valvrave2 に同名の終了画面がある）
  - `listMachineItems(machine: object): Array<{ kind: string, name: string, entry: object }>`（同名の項目は `createNameDisambiguator` で区別した名前）

- [ ] **Step 1: 失敗するテストを書く**

`tests/provenance-lib.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  createNameDisambiguator,
  itemKey,
  listMachineItems,
  machineValue,
  shapeError,
  toStoredProbability,
  toStoredRate,
  valuesAgree,
} from '../scripts/lib/provenance.mjs';

describe('valuesAgree: denominator（分母）', () => {
  it('差が 0.1% 以内なら一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 6: 277.7 }, { 1: 295.24, 6: 277.7 })).toBe(true);
  });

  it('差が 0.1% を超えると不一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.6 })).toBe(false);
  });

  it('設定の並びが違えば不一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 2: 292.6 }, { 1: 295.2 })).toBe(false);
  });

  it('形が合わない値は不一致', () => {
    expect(valuesAgree('denominator', true, true)).toBe(false);
  });

  it('差がちょうど 0.1% なら一致（境界を含む）', () => {
    expect(valuesAgree('denominator', { 1: 8192 }, { 1: 8183.808 })).toBe(true);
  });

  it('空・NaN・1 未満を含む値は不一致', () => {
    expect(valuesAgree('denominator', {}, {})).toBe(false);
    expect(valuesAgree('denominator', { 1: Number.NaN }, { 1: Number.NaN })).toBe(false);
    expect(valuesAgree('denominator', { 1: 0.5 }, { 1: 0.5 })).toBe(false);
  });
});

describe('valuesAgree: percent（割合）', () => {
  it('差が 0.1 ポイント以内なら一致', () => {
    expect(valuesAgree('percent', { 1: 10, 6: 20 }, { 1: 10.05, 6: 20 })).toBe(true);
  });

  it('差がちょうど 0.1 ポイントなら一致（境界を含む）', () => {
    expect(valuesAgree('percent', { 1: 20 }, { 1: 20.1 })).toBe(true);
  });

  it('差が 0.1 ポイントを超えると不一致', () => {
    expect(valuesAgree('percent', { 1: 10 }, { 1: 10.2 })).toBe(false);
  });
});

describe('valuesAgree: settings / presence', () => {
  it('設定の組は順番に関係なく同じなら一致', () => {
    expect(
      valuesAgree(
        'settings',
        { confirmed: ['4', '5', '6'], excluded: [] },
        { confirmed: ['6', '5', '4'], excluded: [] }
      )
    ).toBe(true);
  });

  it('設定の組が違えば不一致', () => {
    expect(
      valuesAgree(
        'settings',
        { confirmed: ['4', '5', '6'], excluded: [] },
        { confirmed: ['5', '6'], excluded: [] }
      )
    ).toBe(false);
  });

  it('presence は両方 true なら一致', () => {
    expect(valuesAgree('presence', true, true)).toBe(true);
    expect(valuesAgree('presence', true, false)).toBe(false);
  });

  it('未知の unit は不一致', () => {
    expect(valuesAgree('unknown', { 1: 1 }, { 1: 1 })).toBe(false);
  });
});

describe('shapeError', () => {
  it('正しい形なら null', () => {
    expect(shapeError('denominator', { 1: 295.2 })).toBeNull();
    expect(shapeError('percent', { 1: 0, 6: 100 })).toBeNull();
    expect(shapeError('settings', { confirmed: ['6'], excluded: [] })).toBeNull();
    expect(shapeError('presence', true)).toBeNull();
  });

  it('形が合わなければ説明を返す', () => {
    expect(shapeError('denominator', { 1: 0 })).toContain('分母');
    expect(shapeError('percent', { 1: 120 })).toContain('割合');
    expect(shapeError('settings', { confirmed: ['6'] })).toContain('excluded');
    expect(shapeError('presence', false)).toContain('true');
    expect(shapeError('unknown', true)).toContain('未知の unit');
  });
});

describe('toStoredProbability / toStoredRate（有効数字6桁）', () => {
  it('分母から確率へ', () => {
    expect(toStoredProbability(295.2)).toBe(0.00338753);
    expect(toStoredProbability(65536)).toBe(0.0000152588);
    expect(toStoredProbability(8192)).toBe(0.00012207);
  });

  it('割合から 0〜1 へ', () => {
    expect(toStoredRate(12.34)).toBe(0.1234);
    expect(toStoredRate(0)).toBe(0);
    expect(toStoredRate(100)).toBe(1);
  });

  it('範囲外は RangeError', () => {
    expect(() => toStoredProbability(0)).toThrow(RangeError);
    expect(() => toStoredProbability(-1)).toThrow(RangeError);
    expect(() => toStoredProbability(0.5)).toThrow(RangeError);
    expect(() => toStoredProbability(Number.NaN)).toThrow(RangeError);
    expect(() => toStoredRate(101)).toThrow(RangeError);
    expect(() => toStoredRate(-1)).toThrow(RangeError);
    expect(() => toStoredRate(Number.NaN)).toThrow(RangeError);
  });
});

describe('machineValue', () => {
  it('denominator: probabilities を分母にする', () => {
    const value = machineValue({ probabilities: { 1: 0.00338753, 6: 0.00360101 } }, 'denominator');
    expect(value[1]).toBeCloseTo(295.2, 1);
    expect(value[6]).toBeCloseTo(277.7, 1);
  });

  it('denominator: 確率 0 を含むと表せない（null）', () => {
    expect(machineValue({ probabilities: { 1: 0, 6: 0.1 } }, 'denominator')).toBeNull();
  });

  it('percent: probabilities と rates を割合にする', () => {
    expect(machineValue({ probabilities: { 1: 0.1 } }, 'percent')[1]).toBeCloseTo(10, 6);
    expect(machineValue({ rates: { 1: 0.3 } }, 'percent')[1]).toBeCloseTo(30, 6);
  });

  it('settings: confirmedSettings / excludedSettings を組にする', () => {
    expect(machineValue({ confirmedSettings: ['6'] }, 'settings')).toEqual({
      confirmed: ['6'],
      excluded: [],
    });
    expect(machineValue({ hint: '示唆' }, 'settings')).toBeNull();
  });

  it('presence は常に true、数値の無い項目の分母・割合は null', () => {
    expect(machineValue({ hint: '示唆' }, 'presence')).toBe(true);
    expect(machineValue({ hint: '示唆' }, 'denominator')).toBeNull();
    expect(machineValue({ hint: '示唆' }, 'percent')).toBeNull();
  });
});

describe('listMachineItems', () => {
  it('対象の項目を決まった順と名前で並べる', () => {
    const machine = {
      roles: [{ name: 'BIG' }],
      zones: [{ name: 'CZ', roles: [{ name: 'ベル' }] }],
      confirmationEvents: [{ name: '金トロフィー' }],
      endScreens: [{ name: '青' }],
      endScreenGroups: [{ name: 'AT終了', endScreens: [{ name: '赤' }] }],
      voiceCounts: [{ name: 'ボイスA' }],
      musicCounts: [{ name: '楽曲A' }],
      effectCounts: [{ name: '演出A' }],
      trialSuccessRates: [{ name: 'CZ成功率' }],
      modeTransitions: [{ name: '高確移行' }],
      specialSettings: { note: 'x' },
    };
    expect(listMachineItems(machine).map((item) => itemKey(item.kind, item.name))).toEqual([
      'role::BIG',
      'zoneRole::CZ::ベル',
      'confirmationEvent::金トロフィー',
      'endScreen::青',
      'endScreenGroupItem::AT終了::赤',
      'voiceCount::ボイスA',
      'musicCount::楽曲A',
      'effectCount::演出A',
      'trialSuccessRate::CZ成功率',
      'modeTransition::高確移行',
      'specialSettings::specialSettings',
    ]);
  });

  it('空の specialSettings や無い配列は項目にしない', () => {
    expect(listMachineItems({ roles: [], specialSettings: {} })).toEqual([]);
  });

  it('同じ種類で同じ名前の項目は、2つ目から #2 を付けて区別する', () => {
    const machine = {
      roles: [{ name: '仁' }],
      endScreens: [{ name: '仁' }, { name: '仁' }, { name: '仁' }],
    };
    expect(listMachineItems(machine).map((item) => itemKey(item.kind, item.name))).toEqual([
      'role::仁',
      'endScreen::仁',
      'endScreen::仁#2',
      'endScreen::仁#3',
    ]);
  });

  it('親子の名前（ゾーン内の役）でも、同じ名前は #2 で区別する', () => {
    const machine = { zones: [{ name: 'CZ', roles: [{ name: 'ベル' }, { name: 'ベル' }] }] };
    expect(listMachineItems(machine).map((item) => itemKey(item.kind, item.name))).toEqual([
      'zoneRole::CZ::ベル',
      'zoneRole::CZ::ベル#2',
    ]);
  });

  it('区別した名前が「#数字」を含む名前と重なったら例外を投げる', () => {
    const machine = { endScreens: [{ name: '仁' }, { name: '仁#2' }, { name: '仁' }] };
    expect(() => listMachineItems(machine)).toThrow('項目の名前を区別できない');
  });
});

describe('createNameDisambiguator', () => {
  it('種類ごとに数え、1つ目はそのまま、2つ目から #n を付ける', () => {
    const disambiguate = createNameDisambiguator();
    expect(disambiguate('endScreen', '青')).toBe('青');
    expect(disambiguate('role', '青')).toBe('青');
    expect(disambiguate('endScreen', '青')).toBe('青#2');
  });
});

describe('machineValue: 空の probabilities', () => {
  it('分母・割合とも表せない（null）', () => {
    expect(machineValue({ probabilities: {} }, 'denominator')).toBeNull();
    expect(machineValue({ probabilities: {} }, 'percent')).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run tests/provenance-lib.test.mjs`
Expected: FAIL（`Failed to load url ../scripts/lib/provenance.mjs` などモジュールが無いエラー）

- [ ] **Step 3: 実装する**

`scripts/lib/provenance.mjs`:

```js
/**
 * 出典記録（provenance）の判定に使う純粋関数。
 *
 * 仕様: docs/superpowers/specs/2026-09-26-data-expansion-design.md の5章。
 *
 * 値の表し方（unit）:
 *   - denominator: 設定ごとの分母（1/x の x）。小役・ボーナスなどの確率
 *   - percent: 設定ごとの割合（0〜100）。試行成功率・移行率など
 *   - settings: 確定・否定する設定の組 { confirmed: [...], excluded: [...] }
 *   - presence: 数値を持たない項目。出典に載っていること自体を確かめる（値は true）
 *
 * 項目の種類（kind）と unit の一覧は schemas/provenance.schema.json が正本。
 */

/** ちょんぼりすたの出典キー。単独の値を暫定で採用できるのはこの出典だけ（仕様 5.5） */
export const CHONBORISTA_KEY = 'chonborista';

/** zoneRole・endScreenGroupItem の名前で、親と子を区切る文字列 */
export const NAME_SEPARATOR = '::';

/** 分母の相対差の上限（0.1%）。サイトごとの丸めの違い（1/295.2 と 1/295.24 など）を許す */
export const DENOMINATOR_TOLERANCE = 0.001;

/** 割合の差の上限（0.1 ポイント） */
export const PERCENT_TOLERANCE = 0.1;

/** 境界ちょうどの値が浮動小数点の誤差で落ちないための余裕 */
const FLOAT_EPSILON = 1e-9;

/** 保存する確率・割合の有効数字（小数6桁ではない。仕様 5.6） */
const STORED_SIGNIFICANT_DIGITS = 6;

export function itemKey(kind, name) {
  return `${kind}${NAME_SEPARATOR}${name}`;
}

function isNumberMap(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/**
 * 値が unit の形に合っているかを確かめる。
 * @returns {string | null} 合わないときの説明。合っていれば null
 */
export function shapeError(unit, value) {
  switch (unit) {
    case 'denominator':
      return isNumberMap(value) && Object.values(value).every((v) => v >= 1)
        ? null
        : '設定ごとの 1 以上の分母が必要（確率が 1 を超えないように）';
    case 'percent':
      return isNumberMap(value) && Object.values(value).every((v) => v >= 0 && v <= 100)
        ? null
        : '設定ごとの 0〜100 の割合が必要';
    case 'settings':
      return value !== null &&
        typeof value === 'object' &&
        isStringArray(value.confirmed) &&
        isStringArray(value.excluded)
        ? null
        : 'confirmed と excluded の配列が必要';
    case 'presence':
      return value === true ? null : 'true が必要';
    default:
      return `未知の unit: ${unit}`;
  }
}

function sameKeys(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

function sameSet(a, b) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * 2つの値が一致するか（仕様 5.4）。形が unit に合わない値は一致しないとみなす。
 */
export function valuesAgree(unit, a, b) {
  if (shapeError(unit, a) !== null || shapeError(unit, b) !== null) return false;
  switch (unit) {
    case 'denominator':
      return (
        sameKeys(a, b) &&
        Object.keys(a).every(
          (k) =>
            Math.abs(a[k] - b[k]) / Math.max(a[k], b[k]) <= DENOMINATOR_TOLERANCE + FLOAT_EPSILON
        )
      );
    case 'percent':
      return (
        sameKeys(a, b) &&
        Object.keys(a).every((k) => Math.abs(a[k] - b[k]) <= PERCENT_TOLERANCE + FLOAT_EPSILON)
      );
    case 'settings':
      return sameSet(a.confirmed, b.confirmed) && sameSet(a.excluded, b.excluded);
    case 'presence':
      return true;
    default:
      return false;
  }
}

/** 分母（1/x の x）を、保存する確率（有効数字6桁）にする */
export function toStoredProbability(denominator) {
  if (typeof denominator !== 'number' || !Number.isFinite(denominator) || denominator < 1) {
    throw new RangeError(`分母は 1 以上の有限数が必要: ${denominator}`);
  }
  return Number((1 / denominator).toPrecision(STORED_SIGNIFICANT_DIGITS));
}

/** 割合（0〜100）を、保存する 0〜1 の値（有効数字6桁）にする */
export function toStoredRate(percent) {
  if (typeof percent !== 'number' || !(percent >= 0 && percent <= 100)) {
    throw new RangeError(`割合は 0〜100 が必要: ${percent}`);
  }
  return Number((percent / 100).toPrecision(STORED_SIGNIFICANT_DIGITS));
}

function numericMap(entry) {
  return entry.probabilities ?? entry.rates ?? null;
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

/**
 * 機種ファイルの項目の値を、出典記録と同じ unit の形にする。
 * @returns {object | true | null} unit で表せないときは null
 */
export function machineValue(entry, unit) {
  switch (unit) {
    case 'denominator': {
      const map = numericMap(entry);
      if (!map || Object.keys(map).length === 0 || Object.values(map).some((p) => !(p > 0))) {
        return null;
      }
      return mapValues(map, (p) => 1 / p);
    }
    case 'percent': {
      const map = numericMap(entry);
      return map && Object.keys(map).length > 0 ? mapValues(map, (p) => p * 100) : null;
    }
    case 'settings':
      if (entry.confirmedSettings === undefined && entry.excludedSettings === undefined) {
        return null;
      }
      return { confirmed: entry.confirmedSettings ?? [], excluded: entry.excludedSettings ?? [] };
    case 'presence':
      return true;
    default:
      return null;
  }
}

/**
 * 同じ種類で同じ名前が2つ目以降に出たとき、名前に `#2`、`#3` を付けて区別する関数を作る。
 * 並び順で数えるので、項目を並べ替えないこと（仕様 5.8）。
 * 区別した名前が、もともと「#数字」を含む名前と重なったときは、黙って結び付けずに例外を投げる。
 * @returns {(kind: string, name: string) => string}
 */
export function createNameDisambiguator() {
  const counts = new Map();
  const issued = new Set();
  return (kind, name) => {
    const key = itemKey(kind, name);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    const unique = count === 1 ? name : `${name}#${count}`;
    const uniqueKey = itemKey(kind, unique);
    if (issued.has(uniqueKey)) {
      throw new Error(`項目の名前を区別できない: ${uniqueKey}（名前に「#数字」を含む項目と重なった）`);
    }
    issued.add(uniqueKey);
    return unique;
  };
}

/**
 * 機種ファイルの中で、出典記録の対象になる項目を並べる（仕様 5.4）。
 * 同じ種類で同じ名前の項目は、createNameDisambiguator で `#2` などを付けた名前にする。
 */
export function listMachineItems(machine) {
  const items = [];
  const disambiguate = createNameDisambiguator();
  const add = (kind, name, entry) => items.push({ kind, name: disambiguate(kind, name), entry });
  const child = (parent, name) => `${parent}${NAME_SEPARATOR}${name}`;

  for (const r of machine.roles ?? []) add('role', r.name, r);
  for (const z of machine.zones ?? []) {
    for (const r of z.roles ?? []) add('zoneRole', child(z.name, r.name), r);
  }
  for (const e of machine.confirmationEvents ?? []) add('confirmationEvent', e.name, e);
  for (const s of machine.endScreens ?? []) add('endScreen', s.name, s);
  for (const g of machine.endScreenGroups ?? []) {
    for (const s of g.endScreens ?? []) add('endScreenGroupItem', child(g.name, s.name), s);
  }
  for (const v of machine.voiceCounts ?? []) add('voiceCount', v.name, v);
  for (const m of machine.musicCounts ?? []) add('musicCount', m.name, m);
  for (const e of machine.effectCounts ?? []) add('effectCount', e.name, e);
  for (const t of machine.trialSuccessRates ?? []) add('trialSuccessRate', t.name, t);
  for (const t of machine.modeTransitions ?? []) add('modeTransition', t.name, t);
  if (machine.specialSettings && Object.keys(machine.specialSettings).length > 0) {
    add('specialSettings', 'specialSettings', machine.specialSettings);
  }
  return items;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run tests/provenance-lib.test.mjs`
Expected: PASS（30 tests）

- [ ] **Step 5: 整形と lint**

Run: `npx prettier --write scripts/lib/provenance.mjs tests/provenance-lib.test.mjs && npx eslint scripts/lib/provenance.mjs tests/provenance-lib.test.mjs`
Expected: eslint が何も出力せず終了コード 0

- [ ] **Step 6: コミット**

```bash
git add scripts/lib/provenance.mjs tests/provenance-lib.test.mjs
git commit -m "feat(scripts): 出典記録の値の比較・変換・項目の列挙を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 採否ルールと status の検査

**Files:**
- Modify: `scripts/lib/provenance.mjs`（末尾に追記）
- Test: `tests/provenance-rules.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `CHONBORISTA_KEY`、`valuesAgree`
- Produces:
  - `valuesEqual(unit: string, a: unknown, b: unknown): boolean`（許容差なしの完全一致。採用値が選んだ出典の値そのものかを見る）
  - `preferenceOrder(values: Record<string, unknown>, sourceKinds: Record<string, string>): string[]`
  - `supporters(unit: string, values: Record<string, unknown>, value: unknown): string[]`
  - `decideNewItem({ unit, values, sourceKinds, reread? }): { outcome: 'adopt', status, adopted } | { outcome: 'candidate', reason }`
  - `decideExistingItem({ unit, values, sourceKinds, reread?, current }): { outcome: 'adopt', status, adopted } | { outcome: 'remove', reason }`
  - `statusError(item: { unit, status, values, adopted, reread? }, sourceKinds): string | null`
  - `sourceKinds` は `{ 出典キー: 'analysis-site' | 'official' }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/provenance-rules.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  decideExistingItem,
  decideNewItem,
  preferenceOrder,
  statusError,
  valuesEqual,
} from '../scripts/lib/provenance.mjs';

const DEN = 'denominator';
const KINDS = {
  chonborista: 'analysis-site',
  'nana-press': 'analysis-site',
  '1geki': 'analysis-site',
  'p-town-dmm': 'analysis-site',
  maker: 'official',
};

describe('valuesEqual（許容差なしの完全一致）', () => {
  it('denominator / percent は、許容差の中でも違えば false', () => {
    expect(valuesEqual(DEN, { 1: 295.2, 6: 277.7 }, { 6: 277.7, 1: 295.2 })).toBe(true);
    expect(valuesEqual(DEN, { 1: 295.2 }, { 1: 295.24 })).toBe(false);
    expect(valuesEqual('percent', { 1: 10 }, { 1: 10 })).toBe(true);
    expect(valuesEqual('percent', { 1: 10 }, { 1: 10.05 })).toBe(false);
  });

  it('settings は組として比べる（並び順と重なりは見ない）', () => {
    const a = { confirmed: ['6', '5'], excluded: ['1'] };
    expect(valuesEqual('settings', a, { confirmed: ['5', '6', '6'], excluded: ['1'] })).toBe(true);
    expect(valuesEqual('settings', a, { confirmed: ['6'], excluded: ['1'] })).toBe(false);
  });

  it('presence は true どうしなら true', () => {
    expect(valuesEqual('presence', true, true)).toBe(true);
    expect(valuesEqual('presence', true, false)).toBe(false);
  });

  it('形が unit に合わない値・設定の欠け・未知の unit は false', () => {
    expect(valuesEqual(DEN, null, null)).toBe(false);
    expect(valuesEqual(DEN, { 1: 0.5 }, { 1: 0.5 })).toBe(false);
    expect(valuesEqual(DEN, { 1: 295.2 }, { 1: 295.2, 2: 292.6 })).toBe(false);
    expect(valuesEqual('unknown', { 1: 1 }, { 1: 1 })).toBe(false);
  });
});

describe('preferenceOrder', () => {
  it('公式 → ちょんぼりすた → 記録順', () => {
    const values = { 'nana-press': {}, chonborista: {}, '1geki': {}, maker: {} };
    expect(preferenceOrder(values, KINDS)).toEqual(['maker', 'chonborista', 'nana-press', '1geki']);
  });
});

describe('decideNewItem（新しく入れる値）', () => {
  it('2サイトで一致 → confirmed。採用値はちょんぼりすた', () => {
    const values = { 'nana-press': { 1: 295.24 }, chonborista: { 1: 295.2 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('公式があれば、ほかと食い違っても公式の値で confirmed', () => {
    const values = { chonborista: { 1: 300 }, maker: { 1: 295.2 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('ちょんぼりすただけ＋読み直しが一致 → provisional-chonborista', () => {
    const values = { chonborista: { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread: { 1: 8192 } })).toEqual({
      outcome: 'adopt',
      status: 'provisional-chonborista',
      adopted: { 1: 8192 },
    });
  });

  it('ちょんぼりすただけで、読み直しが無い・一致しない → candidate', () => {
    const values = { chonborista: { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS }).outcome).toBe('candidate');
    expect(
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread: { 1: 4096 } }).outcome
    ).toBe('candidate');
  });

  it('ちょんぼりすた以外の1サイトだけ → candidate', () => {
    const values = { 'nana-press': { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: 'ちょんぼりすた以外の1サイトのみ',
    });
  });

  it('2サイトが食い違う → candidate', () => {
    const values = { chonborista: { 1: 300 }, 'nana-press': { 1: 400 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('別々の値でそれぞれ2サイトが一致 → candidate', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('出典なし → candidate', () => {
    expect(decideNewItem({ unit: DEN, values: {}, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: '出典なし',
    });
  });

  it('公式が2つあって食い違う → candidate', () => {
    const kinds = { ...KINDS, 'maker-site': 'official' };
    const values = { maker: { 1: 295.2 }, 'maker-site': { 1: 300 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: kinds })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('形が unit に合わない値は例外にする', () => {
    const values = { maker: { 1: 0.5 } };
    expect(() => decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toThrow(
      '形に合わない'
    );
  });
});

describe('decideExistingItem（既存の値の見直し）', () => {
  it('2サイトで一致した値が今の値と違えば、その値へ直す', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.24 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: { 1: 295.2 } });
  });

  it('今の値を1サイトだけが裏づける → kept-single-source', () => {
    const values = { 'nana-press': { 1: 295.2 }, '1geki': { 1: 310 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 295.2 } })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 295.2 } });
  });

  it('食い違いがあっても今の値に裏づけがあれば残す', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 300 } });
  });

  it('裏づけが無く、ちょんぼりすただけが別の値＋読み直し一致 → provisional-chonborista', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 300 },
        reread: { 1: 295.2 },
      })
    ).toEqual({ outcome: 'adopt', status: 'provisional-chonborista', adopted: { 1: 295.2 } });
  });

  it('裏づけが無く、読み直しも無い → remove', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'remove', reason: '今の値を裏づける出典なし' });
  });

  it('出典なし → remove', () => {
    expect(
      decideExistingItem({ unit: DEN, values: {}, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'remove', reason: '出典なし' });
  });

  it('presence: 2サイトに載っていれば confirmed', () => {
    const values = { chonborista: true, 'nana-press': true };
    expect(
      decideExistingItem({ unit: 'presence', values, sourceKinds: KINDS, current: true })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: true });
  });

  it('公式があれば、今の値に関係なく公式の値で confirmed', () => {
    const values = { 'nana-press': { 1: 300 }, maker: { 1: 295.2 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: { 1: 295.2 } });
  });

  it('ちょんぼりすただけが今の値と一致 → 暫定より先に kept-single-source', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 295.2 },
        reread: { 1: 295.2 },
      })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 295.2 } });
  });

  it('食い違いがあり、今の値の裏づけも無い → 理由つきで remove', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 500 } })
    ).toEqual({ outcome: 'remove', reason: 'サイト間で食い違い、今の値を裏づける出典なし' });
  });
});

describe('statusError（記録の status と値の関係）', () => {
  const item = (overrides) => ({ unit: DEN, adopted: { 1: 295.2 }, ...overrides });

  it('confirmed: 採用値と一致する出典が2つ → null', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toBeNull();
  });

  it('confirmed: 公式が1つ → null', () => {
    const values = { maker: { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toBeNull();
  });

  it('confirmed: 出典が1つだけ → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toContain('confirmed には');
  });

  it('provisional-chonborista: 条件を満たす → null', () => {
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS)
    ).toBeNull();
  });

  it('provisional-chonborista: ほかの出典がある → エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 310 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS)
    ).toContain('ちょんぼりすただけ');
  });

  it('provisional-chonborista: 読み直しが無い → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(statusError(item({ status: 'provisional-chonborista', values }), KINDS)).toContain(
      '読み直し'
    );
  });

  it('provisional-chonborista: 読み直しがあっても、ちょんぼりすたの値と一致しない → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 310 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS)
    ).toContain('読み直し');
  });

  it('kept-single-source: 一致が1つ → null、0 → エラー', () => {
    const one = { '1geki': { 1: 295.2 } };
    const none = { '1geki': { 1: 310 } };
    expect(statusError(item({ status: 'kept-single-source', values: one }), KINDS)).toBeNull();
    expect(statusError(item({ status: 'kept-single-source', values: none }), KINDS)).toContain(
      'kept-single-source には'
    );
  });

  it('confirmed: 別の値で2サイトが一致する組がある → エラー', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 300 } }), KINDS)
    ).toContain('confirmed には');
  });

  it('confirmed: 公式があるのに公式でない値を採用している → エラー', () => {
    const values = { chonborista: { 1: 300 }, 'nana-press': { 1: 300 }, maker: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 300 } }), KINDS)
    ).toContain('confirmed には');
  });

  it('kept-single-source: 2サイト一致の値があるなら confirmed にすべき → エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'kept-single-source', values }), KINDS)).toContain(
      'confirmed にする'
    );
  });

  it('confirmed: 採用値が選んだ出典の値そのものでない（許容差の中でも）→ エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.24 } };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 294.92 } }), KINDS)
    ).toContain('confirmed には');
  });

  it('provisional-chonborista: 採用値がちょんぼりすたの値と違う → エラー', () => {
    const values = { chonborista: { 1: 1000 } };
    const reread = { by: 'verifier', value: { 1: 1000 } };
    expect(
      statusError(
        item({ status: 'provisional-chonborista', values, reread, adopted: { 1: 1000.95 } }),
        KINDS
      )
    ).toContain('同じでない');
  });

  it('未知の status → エラー', () => {
    expect(statusError(item({ status: 'guess', values: {} }), KINDS)).toContain('未知の status');
  });
});

describe('採否と検査の一貫性', () => {
  const cases = [
    { unit: DEN, values: { 'nana-press': { 1: 295.24 }, chonborista: { 1: 295.2 } } },
    { unit: DEN, values: { chonborista: { 1: 300 }, maker: { 1: 295.2 } } },
    { unit: DEN, values: { chonborista: { 1: 8192 } }, reread: { 1: 8192 } },
    {
      unit: DEN,
      values: { 'nana-press': { 1: 295.2 }, '1geki': { 1: 310 } },
      current: { 1: 295.2 },
    },
    {
      unit: DEN,
      values: { chonborista: { 1: 295.2 } },
      current: { 1: 300 },
      reread: { 1: 295.2 },
    },
    { unit: 'presence', values: { chonborista: true, 'nana-press': true }, current: true },
  ];

  it('decideNewItem / decideExistingItem が採用した記録は、すべて statusError を通る', () => {
    let adopted = 0;
    for (const c of cases) {
      const results = [decideNewItem({ ...c, sourceKinds: KINDS })];
      if (c.current !== undefined) results.push(decideExistingItem({ ...c, sourceKinds: KINDS }));
      for (const result of results.filter((r) => r.outcome === 'adopt')) {
        const record = {
          unit: c.unit,
          status: result.status,
          values: c.values,
          adopted: result.adopted,
          ...(c.reread ? { reread: { by: 'verifier', value: c.reread } } : {}),
        };
        expect(statusError(record, KINDS)).toBeNull();
        adopted += 1;
      }
    }
    expect(adopted).toBe(8);
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run tests/provenance-rules.test.mjs`
Expected: FAIL（`decideNewItem is not a function` など、まだ無い関数のエラー）

- [ ] **Step 3: 実装する（`scripts/lib/provenance.mjs` の末尾に追記）**

```js
// ================================================================
// 採否ルール（仕様 5.5）
// ================================================================

function rank(key, sourceKinds) {
  if (sourceKinds[key] === 'official') return 0;
  if (key === CHONBORISTA_KEY) return 1;
  return 2;
}

/**
 * 採用する値を選ぶ順（公式 → ちょんぼりすた → 記録順）。
 */
export function preferenceOrder(values, sourceKinds) {
  return Object.keys(values)
    .map((key, index) => ({ key, index }))
    .sort((a, b) => rank(a.key, sourceKinds) - rank(b.key, sourceKinds) || a.index - b.index)
    .map(({ key }) => key);
}

/**
 * 2つの値が完全に同じか（許容差なし）。採用値が、選んだ出典の値そのものかを確かめるのに使う。
 * 形が unit に合わない値は同じとみなさない。
 */
export function valuesEqual(unit, a, b) {
  if (shapeError(unit, a) !== null || shapeError(unit, b) !== null) return false;
  switch (unit) {
    case 'denominator':
    case 'percent':
      return sameKeys(a, b) && Object.keys(a).every((k) => a[k] === b[k]);
    case 'settings':
      return sameSet(a.confirmed, b.confirmed) && sameSet(a.excluded, b.excluded);
    case 'presence':
      return true;
    default:
      return false;
  }
}

/** value と一致する値を出している出典のキー */
export function supporters(unit, values, value) {
  return Object.keys(values).filter((key) => valuesAgree(unit, values[key], value));
}

/** adopted と違う値で、2つの出典が一致しているか（＝別の値を支持する組がある） */
function hasRivalPair(unit, values, adopted) {
  const others = Object.keys(values).filter((key) => !valuesAgree(unit, values[key], adopted));
  return others.some((a, i) =>
    others.slice(i + 1).some((b) => valuesAgree(unit, values[a], values[b]))
  );
}

/**
 * 公式の値、または2サイト以上で一致する値を探す。
 * 公式どうしが食い違うとき、または別の値で2サイトが一致する組があるときは、食い違い（conflict）とする。
 * @returns {{ adopted: unknown } | { conflict: true } | null}
 */
function findConfirmed(unit, values, sourceKinds) {
  const order = preferenceOrder(values, sourceKinds);
  const officials = order.filter((key) => sourceKinds[key] === 'official');
  if (officials.length > 0) {
    const first = values[officials[0]];
    return officials.every((key) => valuesAgree(unit, values[key], first))
      ? { adopted: first }
      : { conflict: true };
  }
  for (const key of order) {
    if (supporters(unit, values, values[key]).length >= 2) {
      return hasRivalPair(unit, values, values[key]) ? { conflict: true } : { adopted: values[key] };
    }
  }
  return null;
}

/** 採否を決める前に、出典の値と読み直しの値の形を確かめる。形が合わなければ例外を投げる */
function assertShapes(unit, values, reread) {
  for (const [key, value] of Object.entries(values)) {
    const problem = shapeError(unit, value);
    if (problem) throw new Error(`values.${key} が unit=${unit} の形に合わない（${problem}）`);
  }
  if (reread !== undefined) {
    const problem = shapeError(unit, reread);
    if (problem) throw new Error(`reread が unit=${unit} の形に合わない（${problem}）`);
  }
}

function isChonboristaOnly(values) {
  const keys = Object.keys(values);
  return keys.length === 1 && keys[0] === CHONBORISTA_KEY;
}

function rereadAgrees(unit, values, reread) {
  return reread !== undefined && valuesAgree(unit, values[CHONBORISTA_KEY], reread);
}

/**
 * 新しく入れる値の採否（仕様 5.5 前半）。
 * @param {{ unit: string, values: Record<string, unknown>,
 *   sourceKinds: Record<string, string>, reread?: unknown }} input
 * @returns {{ outcome: 'adopt', status: string, adopted: unknown }
 *   | { outcome: 'candidate', reason: string }}
 */
export function decideNewItem({ unit, values, sourceKinds, reread }) {
  assertShapes(unit, values, reread);
  const found = findConfirmed(unit, values, sourceKinds);
  if (found?.conflict) return { outcome: 'candidate', reason: 'サイト間で食い違い' };
  if (found) return { outcome: 'adopt', status: 'confirmed', adopted: found.adopted };
  if (isChonboristaOnly(values)) {
    return rereadAgrees(unit, values, reread)
      ? { outcome: 'adopt', status: 'provisional-chonborista', adopted: values[CHONBORISTA_KEY] }
      : { outcome: 'candidate', reason: 'ちょんぼりすたのみで、読み直しが無いか一致しない' };
  }
  const count = Object.keys(values).length;
  if (count === 0) return { outcome: 'candidate', reason: '出典なし' };
  if (count === 1) return { outcome: 'candidate', reason: 'ちょんぼりすた以外の1サイトのみ' };
  return { outcome: 'candidate', reason: 'サイト間で食い違い' };
}

/**
 * 既存の値の採否（仕様 5.5 後半）。current は今の機種ファイルの値（unit の形）。
 * @returns {{ outcome: 'adopt', status: string, adopted: unknown }
 *   | { outcome: 'remove', reason: string }}
 */
export function decideExistingItem({ unit, values, sourceKinds, reread, current }) {
  assertShapes(unit, values, reread);
  const found = findConfirmed(unit, values, sourceKinds);
  if (found && !found.conflict) {
    return { outcome: 'adopt', status: 'confirmed', adopted: found.adopted };
  }
  if (supporters(unit, values, current).length >= 1) {
    return { outcome: 'adopt', status: 'kept-single-source', adopted: current };
  }
  if (!found && isChonboristaOnly(values) && rereadAgrees(unit, values, reread)) {
    return { outcome: 'adopt', status: 'provisional-chonborista', adopted: values[CHONBORISTA_KEY] };
  }
  if (found?.conflict) {
    return { outcome: 'remove', reason: 'サイト間で食い違い、今の値を裏づける出典なし' };
  }
  if (Object.keys(values).length === 0) return { outcome: 'remove', reason: '出典なし' };
  return { outcome: 'remove', reason: '今の値を裏づける出典なし' };
}

/**
 * 出典記録の項目で、status と値の関係が仕様どおりかを確かめる。
 * 採否ルール（decideNewItem / decideExistingItem）と同じ findConfirmed で確定値を求め直し、
 * 採用値がその値（または選んだ出典の値）と完全に同じかを比べる。
 * このため、採否ルールでは採用されない記録（食い違い・公式を無視した採用・出典に無い値）は通らない。
 *
 * ここで確かめられないこと（見直し前の値を知らないため）: kept-single-source の採用値が見直し前の値そのものか、
 * 見直し前の値を裏づける出典があるのに provisional-chonborista にしていないか。
 * これらは main と比べる検査（scripts/lib/rules-against-base.mjs の checkRulesAgainstBase）が確かめる。
 * 形が unit に合わない値は、呼ぶ前に shapeError で弾いておくこと
 * （scripts/validators/provenance-validator.mjs はそうする）。
 *
 * @param {{ unit: string, status: string, values: Record<string, unknown>, adopted: unknown,
 *   reread?: { by: string, value: unknown } }} item reread は記録の形（{ by, value }）。
 *   decideNewItem / decideExistingItem の reread は値そのもの
 * @param {Record<string, string>} sourceKinds
 * @returns {string | null} 問題の説明。問題なければ null
 */
export function statusError(item, sourceKinds) {
  const { unit, status, values, adopted, reread } = item;
  const found = findConfirmed(unit, values, sourceKinds);
  const confirmedValue = found && !found.conflict ? found.adopted : undefined;
  switch (status) {
    case 'confirmed':
      return confirmedValue !== undefined && valuesEqual(unit, confirmedValue, adopted)
        ? null
        : 'confirmed には、公式の値、または別の値で一致する組の無い2サイト以上の一致が必要（採用値は選んだ出典の値そのもの。公式があれば公式の値）';
    case 'provisional-chonborista':
      if (!isChonboristaOnly(values)) {
        return 'provisional-chonborista は、ちょんぼりすただけにある値に使う';
      }
      if (!valuesEqual(unit, values[CHONBORISTA_KEY], adopted)) {
        return '採用値がちょんぼりすたの値と同じでない';
      }
      if (!reread || !valuesAgree(unit, values[CHONBORISTA_KEY], reread.value)) {
        return '読み直し（reread）が無いか、ちょんぼりすたの値と一致しない';
      }
      return null;
    case 'kept-single-source':
      if (confirmedValue !== undefined) {
        return 'kept-single-source は、公式の値や2サイト一致の値が無いときだけ使う（confirmed にする）';
      }
      return supporters(unit, values, adopted).length >= 1
        ? null
        : 'kept-single-source には、採用値と一致する出典が1つ以上必要';
    default:
      return `未知の status: ${status}`;
  }
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run tests/provenance-rules.test.mjs tests/provenance-lib.test.mjs`
Expected: PASS（provenance-rules 40 tests、provenance-lib 30 tests）

- [ ] **Step 5: 整形と lint**

Run: `npx prettier --write scripts/lib/provenance.mjs tests/provenance-rules.test.mjs && npx eslint scripts/lib/provenance.mjs tests/provenance-rules.test.mjs`
Expected: eslint が何も出力せず終了コード 0

- [ ] **Step 6: コミット**

```bash
git add scripts/lib/provenance.mjs tests/provenance-rules.test.mjs
git commit -m "feat(scripts): 出典記録の採否ルールと status の検査を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 出典記録のスキーマと検証器

**Files:**
- Create: `schemas/provenance.schema.json`
- Create: `scripts/validators/provenance-validator.mjs`
- Test: `tests/provenance-validator.test.mjs`

**Interfaces:**
- Consumes: Task 1・2 の `CHONBORISTA_KEY`、`itemKey`、`listMachineItems`、`machineValue`、`shapeError`、`statusError`、`valuesAgree`
- Produces:
  - `validateProvenance(machineFiles, indexData, provenanceFiles, options?): { errors, warnings }`
    - `machineFiles`: `Array<{ path: 'machines/<file>', data }>`（`validate.mjs` と同じ形）
    - `provenanceFiles`: `Array<{ path: 'provenance/<id>.json', data: object | null, parseError?: string }>`
    - `options.requireAll`: `true` なら出典記録の無い機種をエラーにする（段階3で使う）
    - エラーの `type` は `'provenance'`、`file` は出典記録のパス

- [ ] **Step 1: 失敗するテストを書く**

`tests/provenance-validator.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';
import { toStoredProbability } from '../scripts/lib/provenance.mjs';

const machine = {
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  lastUpdated: '2026-09-26',
  availableSettings: ['1', '6'],
  roles: [
    {
      name: 'BIG',
      probabilities: { 1: toStoredProbability(295.2), 6: toStoredProbability(277.7) },
      hasSettingDiff: true,
      displayOrder: 1,
    },
  ],
  confirmationEvents: [{ name: '金トロフィー', confirmedSettings: ['6'], excludedSettings: ['1'] }],
};

const index = {
  version: '3.8.0',
  updatedAt: '2026-09-26T00:00:00Z',
  machines: [
    {
      id: 'test-machine',
      name: 'テスト機種',
      type: 'AT',
      author: 'コミュニティ',
      version: '1.0',
      file: 'test/test-machine.json',
    },
  ],
};

const machineFiles = [{ path: 'machines/test/test-machine.json', data: machine }];

const BIG = { 1: 295.2, 6: 277.7 };
const GOLD = { confirmed: ['6'], excluded: ['1'] };

function record(overrides = {}) {
  return {
    machineId: 'test-machine',
    machineFile: 'test/test-machine.json',
    reviewedAt: '2026-09-26',
    sources: [
      {
        key: 'chonborista',
        kind: 'analysis-site',
        url: 'https://chonborista.com/slot/test/',
        retrievedAt: '2026-09-26',
      },
      {
        key: 'nana-press',
        kind: 'analysis-site',
        url: 'https://nana-press.com/kaiseki/machine/1/',
        retrievedAt: '2026-09-26',
      },
    ],
    items: [
      {
        kind: 'role',
        name: 'BIG',
        status: 'confirmed',
        unit: 'denominator',
        values: { chonborista: BIG, 'nana-press': BIG },
        adopted: BIG,
      },
      {
        kind: 'confirmationEvent',
        name: '金トロフィー',
        status: 'confirmed',
        unit: 'settings',
        values: { chonborista: GOLD, 'nana-press': GOLD },
        adopted: GOLD,
      },
    ],
    candidates: [],
    removed: [],
    ...overrides,
  };
}

function run(rec, { path = 'provenance/test-machine.json', files = machineFiles } = {}) {
  return validateProvenance(files, index, [{ path, data: rec }]);
}

function messages(result) {
  return result.errors.map((e) => e.message).join('\n');
}

describe('validateProvenance', () => {
  it('正しい記録ならエラーなし', () => {
    expect(run(record()).errors).toEqual([]);
  });

  it('記録の無い機種は、requireAll でなければエラーにしない', () => {
    expect(validateProvenance(machineFiles, index, []).errors).toEqual([]);
  });

  it('requireAll では記録の無い機種をエラーにする', () => {
    const result = validateProvenance(machineFiles, index, [], { requireAll: true });
    expect(messages(result)).toContain('全機種必須');
  });

  it('JSON が壊れていればエラー', () => {
    const result = validateProvenance(machineFiles, index, [
      { path: 'provenance/test-machine.json', data: null, parseError: 'Unexpected token' },
    ]);
    expect(messages(result)).toContain('JSON パースエラー');
  });

  it('スキーマ違反（出典に url が無い）はエラー', () => {
    const rec = record();
    delete rec.sources[1].url;
    expect(messages(run(rec))).toContain('スキーマ違反');
  });

  it('ファイル名が機種IDと違えばエラー', () => {
    expect(messages(run(record(), { path: 'provenance/other.json' }))).toContain('ファイル名');
  });

  it('index.json に無い機種IDはエラー', () => {
    const rec = record({ machineId: 'unknown' });
    expect(messages(run(rec, { path: 'provenance/unknown.json' }))).toContain(
      'index.json に無い機種ID'
    );
  });

  it('machineFile が index.json と違えばエラー', () => {
    expect(messages(run(record({ machineFile: 'test/other.json' })))).toContain('machineFile');
  });

  it('機種ファイルの項目に記録が無ければエラー', () => {
    const rec = record();
    rec.items = rec.items.filter((item) => item.kind !== 'confirmationEvent');
    expect(messages(run(rec))).toContain('confirmationEvent::金トロフィー: 出典記録がない項目');
  });

  it('機種ファイルに無い項目の記録はエラー', () => {
    const rec = record();
    rec.items.push({ ...rec.items[0], name: 'REG' });
    expect(messages(run(rec))).toContain('role::REG: 機種ファイルに無い項目の記録');
  });

  it('機種ファイルの値が採用値と違えばエラー', () => {
    const other = { 1: 300, 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: other, 'nana-press': other },
      adopted: other,
    };
    expect(messages(run(rec))).toContain('role::BIG: 機種ファイルの値が採用値と一致しない');
  });

  it('confirmed なのに出典が1つだけならエラー', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], values: { chonborista: BIG } };
    expect(messages(run(rec))).toContain('confirmed には');
  });

  it('provisional-chonborista は読み直しが無ければエラー、あれば通る', () => {
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      status: 'provisional-chonborista',
      values: { chonborista: BIG },
    };
    expect(messages(run(rec))).toContain('読み直し');
    rec.items[0].reread = { by: 'verifier', value: BIG };
    expect(run(rec).errors).toEqual([]);
  });

  it('sources に無い出典キーはエラー', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], values: { ...rec.items[0].values, '1geki': BIG } };
    expect(messages(run(rec))).toContain('sources に無い出典キー: 1geki');
  });

  it('chonborista の URL が別のサイトならエラー', () => {
    const rec = record();
    rec.sources[0] = { ...rec.sources[0], url: 'https://example.com/slot/test/' };
    expect(messages(run(rec))).toContain('chonborista の URL');
  });

  it('出典キーの重複はエラー', () => {
    const rec = record();
    rec.sources.push({ ...rec.sources[0] });
    expect(messages(run(rec))).toContain('出典キーの重複');
  });

  it('記録の項目の重複はエラー', () => {
    const rec = record();
    rec.items.push({ ...rec.items[0] });
    expect(messages(run(rec))).toContain('出典記録の項目が重複');
  });

  it('候補（未採用）の項目が機種ファイルにあればエラー', () => {
    const rec = record({
      candidates: [
        { kind: 'role', name: 'BIG', unit: 'denominator', values: {}, reason: '食い違い' },
      ],
    });
    expect(messages(run(rec))).toContain('候補（未採用）なのに機種ファイルにある');
  });

  it('外した項目が機種ファイルに残っていればエラー', () => {
    const rec = record({
      removed: [{ kind: 'role', name: 'BIG', previous: BIG, reason: '出典なし' }],
    });
    expect(messages(run(rec))).toContain('外したはずの項目が機種ファイルにある');
  });

  it('unit と値の形が合わなければ、形のエラーだけを出す', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], unit: 'percent' };
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::BIG: adopted が unit=percent の形に合わない（設定ごとの 0〜100 の割合が必要）',
      'role::BIG: values.chonborista が unit=percent の形に合わない（設定ごとの 0〜100 の割合が必要）',
      'role::BIG: values.nana-press が unit=percent の形に合わない（設定ごとの 0〜100 の割合が必要）',
    ]);
  });

  it('unit は機種ファイルの項目の中身に合わせる（数値・設定の組の項目を presence にするとエラー）', () => {
    const rec = record();
    rec.items = rec.items.map((item) => ({
      ...item,
      unit: 'presence',
      values: { chonborista: true, 'nana-press': true },
      adopted: true,
    }));
    const result = messages(run(rec));
    expect(result).toContain(
      'role::BIG: unit=presence は使えない（機種ファイルの項目に合わせて denominator か percent にする）'
    );
    expect(result).toContain(
      'confirmationEvent::金トロフィー: unit=presence は使えない（機種ファイルの項目に合わせて settings にする）'
    );
  });

  it('数値も設定の組も無い項目は presence だけ', () => {
    const hintOnly = { ...machine, endScreens: [{ name: '青', hint: '示唆' }] };
    const files = [{ path: 'machines/test/test-machine.json', data: hintOnly }];
    const rec = record();
    rec.items.push({
      kind: 'endScreen',
      name: '青',
      status: 'confirmed',
      unit: 'settings',
      values: { chonborista: GOLD, 'nana-press': GOLD },
      adopted: GOLD,
    });
    expect(messages(run(rec, { files }))).toContain(
      'endScreen::青: unit=settings は使えない（機種ファイルの項目に合わせて presence にする）'
    );
    rec.items[2] = {
      ...rec.items[2],
      unit: 'presence',
      values: { chonborista: true, 'nana-press': true },
      adopted: true,
    };
    expect(run(rec, { files }).errors).toEqual([]);
  });

  it('機種ファイルを読めなければエラー', () => {
    expect(messages(run(record(), { files: [] }))).toContain(
      '機種ファイルを読めない: machines/test/test-machine.json'
    );
  });

  it('requireAll でも、正しい記録がある機種はエラーにしない', () => {
    const provenanceFiles = [{ path: 'provenance/test-machine.json', data: record() }];
    expect(
      validateProvenance(machineFiles, index, provenanceFiles, { requireAll: true }).errors
    ).toEqual([]);
  });

  it('requireAll で、壊れた記録の機種に「出典記録がない」を重ねて出さない', () => {
    const provenanceFiles = [
      { path: 'provenance/test-machine.json', data: null, parseError: 'Unexpected token' },
    ];
    const result = validateProvenance(machineFiles, index, provenanceFiles, { requireAll: true });
    expect(result.errors.map((e) => e.message)).toEqual(['JSON パースエラー: Unexpected token']);
  });

  it('確率 0 を含む項目は分母で表せないのでエラー', () => {
    const zero = {
      ...machine,
      roles: [{ ...machine.roles[0], probabilities: { 1: 0, 6: toStoredProbability(277.7) } }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: zero }];
    expect(messages(run(record(), { files }))).toContain('で表せない');
  });

  it('機種ファイルの項目名を区別できないときは、落ちずにエラーとして報告する', () => {
    const clash = {
      ...machine,
      endScreens: [{ name: '仁' }, { name: '仁#2' }, { name: '仁' }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: clash }];
    expect(messages(run(record(), { files }))).toContain('項目の名前を区別できない');
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run tests/provenance-validator.test.mjs`
Expected: FAIL（`provenance-validator.mjs` が無いエラー）

- [ ] **Step 3: スキーマを書く**

`schemas/provenance.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "provenance.schema.json",
  "title": "Machine Data Provenance",
  "description": "機種データの出典記録（仕様: docs/superpowers/specs/2026-09-26-data-expansion-design.md 5章）",
  "type": "object",
  "required": ["machineId", "machineFile", "reviewedAt", "sources", "items", "candidates", "removed"],
  "additionalProperties": false,
  "properties": {
    "machineId": { "type": "string", "minLength": 1 },
    "machineFile": { "type": "string", "pattern": "^[^/].*\\.json$" },
    "reviewedAt": { "$ref": "#/definitions/date" },
    "sources": { "type": "array", "minItems": 1, "items": { "$ref": "#/definitions/source" } },
    "items": { "type": "array", "items": { "$ref": "#/definitions/item" } },
    "candidates": { "type": "array", "items": { "$ref": "#/definitions/candidate" } },
    "removed": { "type": "array", "items": { "$ref": "#/definitions/removed" } }
  },
  "definitions": {
    "date": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "sourceKey": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
    "kind": {
      "type": "string",
      "enum": [
        "role",
        "zoneRole",
        "confirmationEvent",
        "endScreen",
        "endScreenGroupItem",
        "voiceCount",
        "musicCount",
        "effectCount",
        "trialSuccessRate",
        "modeTransition",
        "specialSettings"
      ]
    },
    "unit": { "type": "string", "enum": ["denominator", "percent", "settings", "presence"] },
    "source": {
      "type": "object",
      "required": ["key", "kind", "url", "retrievedAt"],
      "additionalProperties": false,
      "properties": {
        "key": { "$ref": "#/definitions/sourceKey" },
        "kind": { "type": "string", "enum": ["analysis-site", "official"] },
        "url": { "type": "string", "pattern": "^https://" },
        "retrievedAt": { "$ref": "#/definitions/date" }
      }
    },
    "settingKeyedNumbers": {
      "type": "object",
      "minProperties": 1,
      "patternProperties": { "^[1-6LV]$": { "type": "number" } },
      "additionalProperties": false
    },
    "settingList": {
      "type": "array",
      "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[1-6LV]$" }
    },
    "settingSets": {
      "type": "object",
      "required": ["confirmed", "excluded"],
      "additionalProperties": false,
      "properties": {
        "confirmed": { "$ref": "#/definitions/settingList" },
        "excluded": { "$ref": "#/definitions/settingList" }
      }
    },
    "value": {
      "anyOf": [
        { "$ref": "#/definitions/settingKeyedNumbers" },
        { "$ref": "#/definitions/settingSets" },
        { "const": true }
      ]
    },
    "valuesBySource": {
      "type": "object",
      "propertyNames": { "$ref": "#/definitions/sourceKey" },
      "additionalProperties": { "$ref": "#/definitions/value" }
    },
    "item": {
      "type": "object",
      "required": ["kind", "name", "status", "unit", "values", "adopted"],
      "additionalProperties": false,
      "properties": {
        "kind": { "$ref": "#/definitions/kind" },
        "name": { "type": "string", "minLength": 1 },
        "status": {
          "type": "string",
          "enum": ["confirmed", "provisional-chonborista", "kept-single-source"]
        },
        "unit": { "$ref": "#/definitions/unit" },
        "values": { "allOf": [{ "$ref": "#/definitions/valuesBySource" }, { "minProperties": 1 }] },
        "adopted": { "$ref": "#/definitions/value" },
        "reread": {
          "type": "object",
          "required": ["by", "value"],
          "additionalProperties": false,
          "properties": {
            "by": { "type": "string", "minLength": 1 },
            "value": { "$ref": "#/definitions/value" }
          }
        }
      }
    },
    "candidate": {
      "type": "object",
      "required": ["kind", "name", "unit", "values", "reason"],
      "additionalProperties": false,
      "properties": {
        "kind": { "$ref": "#/definitions/kind" },
        "name": { "type": "string", "minLength": 1 },
        "unit": { "$ref": "#/definitions/unit" },
        "values": { "$ref": "#/definitions/valuesBySource" },
        "reason": { "type": "string", "minLength": 1 }
      }
    },
    "removed": {
      "type": "object",
      "required": ["kind", "name", "previous", "reason"],
      "additionalProperties": false,
      "properties": {
        "kind": { "$ref": "#/definitions/kind" },
        "name": { "type": "string", "minLength": 1 },
        "previous": {},
        "reason": { "type": "string", "minLength": 1 }
      }
    }
  }
}
```

- [ ] **Step 4: 検証器を書く**

`scripts/validators/provenance-validator.mjs`:

```js
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { basename, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CHONBORISTA_KEY,
  itemKey,
  listMachineItems,
  machineValue,
  shapeError,
  statusError,
  valuesAgree,
} from '../lib/provenance.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CHONBORISTA_URL_PREFIX = 'https://chonborista.com/';

function error(file, message) {
  return { file, type: 'provenance', severity: 'error', message };
}

/**
 * 出典記録（provenance/*.json）を検証する（仕様 5.7）。
 *
 * @param {Array<{ path: string, data: object }>} machineFiles machines/ 配下の機種ファイル
 * @param {object} indexData machines/index.json の中身
 * @param {Array<{ path: string, data: object | null, parseError?: string }>} provenanceFiles
 * @param {{ requireAll?: boolean }} [options] requireAll: 全機種に出典記録を求める（段階3）
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function validateProvenance(machineFiles, indexData, provenanceFiles, options = {}) {
  const { requireAll = false } = options;
  const errors = [];
  const warnings = [];

  const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas/provenance.schema.json'), 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);

  const entries = indexData.machines ?? [];
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const machineByPath = new Map(machineFiles.map((file) => [file.path, file.data]));
  const recordedIds = new Set();

  for (const { path, data, parseError } of provenanceFiles) {
    // 壊れた記録も「記録はある」と数える（requireAll で「出典記録がない」を重ねて出さない）
    recordedIds.add(basename(path, '.json'));
    if (parseError) {
      errors.push(error(path, `JSON パースエラー: ${parseError}`));
      continue;
    }
    if (!validateSchema(data)) {
      for (const e of validateSchema.errors) {
        errors.push(error(path, `スキーマ違反 ${e.instancePath} ${e.message}`));
      }
      continue;
    }

    const expectedPath = `provenance/${data.machineId}.json`;
    if (path !== expectedPath) {
      errors.push(error(path, `ファイル名は ${expectedPath} にする`));
    }
    const entry = entryById.get(data.machineId);
    if (!entry) {
      errors.push(error(path, `index.json に無い機種ID: ${data.machineId}`));
      continue;
    }
    if (entry.file !== data.machineFile) {
      errors.push(
        error(path, `machineFile が index.json と違う: ${data.machineFile}（index: ${entry.file}）`)
      );
    }
    const machine = machineByPath.get(`machines/${entry.file}`);
    if (!machine) {
      errors.push(error(path, `機種ファイルを読めない: machines/${entry.file}`));
      continue;
    }
    recordedIds.add(data.machineId);
    errors.push(...checkRecord(path, data, machine));
  }

  if (requireAll) {
    for (const entry of entries) {
      if (!recordedIds.has(entry.id)) {
        errors.push(error(`provenance/${entry.id}.json`, '出典記録がない（全機種必須）'));
      }
    }
  }

  return { errors, warnings };
}

function collectSourceKinds(path, sources, errors) {
  const sourceKinds = {};
  for (const source of sources) {
    if (source.key in sourceKinds) {
      errors.push(error(path, `出典キーの重複: ${source.key}`));
    }
    sourceKinds[source.key] = source.kind;
    if (source.key === CHONBORISTA_KEY && !source.url.startsWith(CHONBORISTA_URL_PREFIX)) {
      errors.push(error(path, `chonborista の URL は ${CHONBORISTA_URL_PREFIX} で始める`));
    }
  }
  return sourceKinds;
}

/**
 * 機種ファイルの項目の中身から、記録に使える unit を決める（仕様 5.4）。
 * 数値（probabilities / rates）があれば denominator か percent、無くて設定の組があれば settings、
 * どちらも無ければ presence。数値と設定の組の両方がある項目は、数値の側で照合する。
 * 記録する側が unit を選べると、presence にして値の照合を外せてしまうため。
 */
function allowedUnits(entry) {
  if (machineValue(entry, 'percent') !== null) return ['denominator', 'percent'];
  if (machineValue(entry, 'settings') !== null) return ['settings'];
  return ['presence'];
}

function checkItem(path, item, sourceKinds, machineItems) {
  const errors = [];
  const key = itemKey(item.kind, item.name);

  for (const sourceKey of Object.keys(item.values)) {
    if (!(sourceKey in sourceKinds)) {
      errors.push(error(path, `${key}: sources に無い出典キー: ${sourceKey}`));
    }
  }

  const labelled = [
    ['adopted', item.adopted],
    ...Object.entries(item.values).map(([sourceKey, value]) => [`values.${sourceKey}`, value]),
    ...(item.reread ? [['reread', item.reread.value]] : []),
  ];
  const shapeProblems = labelled
    .map(([label, value]) => [label, shapeError(item.unit, value)])
    .filter(([, problem]) => problem !== null);
  for (const [label, problem] of shapeProblems) {
    errors.push(error(path, `${key}: ${label} が unit=${item.unit} の形に合わない（${problem}）`));
  }
  if (shapeProblems.length > 0) return errors;

  const statusProblem = statusError(item, sourceKinds);
  if (statusProblem) errors.push(error(path, `${key}: ${statusProblem}`));

  const target = machineItems.get(key);
  if (!target) {
    errors.push(error(path, `${key}: 機種ファイルに無い項目の記録`));
    return errors;
  }
  const allowed = allowedUnits(target.entry);
  if (!allowed.includes(item.unit)) {
    errors.push(
      error(
        path,
        `${key}: unit=${item.unit} は使えない（機種ファイルの項目に合わせて ${allowed.join(' か ')} にする）`
      )
    );
    return errors;
  }
  const actual = machineValue(target.entry, item.unit);
  if (actual === null) {
    errors.push(error(path, `${key}: 機種ファイルの値を unit=${item.unit} で表せない`));
  } else if (!valuesAgree(item.unit, actual, item.adopted)) {
    errors.push(error(path, `${key}: 機種ファイルの値が採用値と一致しない`));
  }
  return errors;
}

function checkRecord(path, record, machine) {
  const errors = [];
  const sourceKinds = collectSourceKinds(path, record.sources, errors);

  // 同じ名前の項目は listMachineItems が #2 などを付けて区別するので、キーは重ならない。
  // 区別できない名前（「#数字」を含む名前との重なり）は例外になるので、エラーとして報告する
  let machineItems;
  try {
    machineItems = new Map(
      listMachineItems(machine).map((item) => [itemKey(item.kind, item.name), item])
    );
  } catch (e) {
    errors.push(error(path, e.message));
    return errors;
  }

  const recorded = new Set();
  for (const item of record.items) {
    const key = itemKey(item.kind, item.name);
    if (recorded.has(key)) {
      errors.push(error(path, `${key}: 出典記録の項目が重複`));
      continue;
    }
    recorded.add(key);
    errors.push(...checkItem(path, item, sourceKinds, machineItems));
  }

  for (const key of machineItems.keys()) {
    if (!recorded.has(key)) errors.push(error(path, `${key}: 出典記録がない項目`));
  }
  for (const candidate of record.candidates) {
    const key = itemKey(candidate.kind, candidate.name);
    if (machineItems.has(key)) {
      errors.push(error(path, `${key}: 候補（未採用）なのに機種ファイルにある`));
    }
  }
  for (const removed of record.removed) {
    const key = itemKey(removed.kind, removed.name);
    if (machineItems.has(key)) {
      errors.push(error(path, `${key}: 外したはずの項目が機種ファイルにある`));
    }
  }
  return errors;
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run tests/provenance-validator.test.mjs`
Expected: PASS（27 tests）

- [ ] **Step 6: 整形と lint**

Run: `npx prettier --write scripts/validators/provenance-validator.mjs tests/provenance-validator.test.mjs && npx eslint scripts/validators/provenance-validator.mjs tests/provenance-validator.test.mjs`
Expected: eslint が何も出力せず終了コード 0

- [ ] **Step 7: コミット**

```bash
git add schemas/provenance.schema.json scripts/validators/provenance-validator.mjs tests/provenance-validator.test.mjs
git commit -m "feat(scripts): 出典記録のスキーマと検証器を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 読み込みと validate.mjs への組み込み

**Files:**
- Create: `scripts/lib/load-provenance.mjs`
- Create: `provenance/README.md`
- Modify: `scripts/validate.mjs`
- Modify: `tests/integration.test.mjs`
- Test: `tests/load-provenance.test.mjs`

**Interfaces:**
- Consumes: Task 3 の `validateProvenance`
- Produces:
  - `loadProvenanceFiles(dir: string): Array<{ path: 'provenance/<name>.json', data: object | null, parseError?: string }>`（名前順。フォルダが無ければ `[]`）
  - `node scripts/validate.mjs [--require-provenance]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/load-provenance.test.mjs`:

```js
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadProvenanceFiles } from '../scripts/lib/load-provenance.mjs';

let dir;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('loadProvenanceFiles', () => {
  it('フォルダが無ければ空配列', () => {
    expect(loadProvenanceFiles(join(tmpdir(), 'no-such-provenance-dir-for-test'))).toEqual([]);
  });

  it('JSON ファイルだけを名前順に読み、壊れたものには parseError を付ける', () => {
    dir = mkdtempSync(join(tmpdir(), 'provenance-'));
    writeFileSync(join(dir, 'b.json'), '{"machineId":"b"}');
    writeFileSync(join(dir, 'a.json'), '{"machineId":"a"}');
    writeFileSync(join(dir, 'README.md'), '# 説明');
    writeFileSync(join(dir, 'broken.json'), '{');
    mkdirSync(join(dir, 'folder.json'));

    const files = loadProvenanceFiles(dir);

    expect(files.map((file) => file.path)).toEqual([
      'provenance/a.json',
      'provenance/b.json',
      'provenance/broken.json',
    ]);
    expect(files[0].data).toEqual({ machineId: 'a' });
    expect(files[2].data).toBeNull();
    expect(files[2].parseError).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run tests/load-provenance.test.mjs`
Expected: FAIL（`load-provenance.mjs` が無いエラー）

- [ ] **Step 3: 読み込みを実装する**

`scripts/lib/load-provenance.mjs`:

```js
import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * provenance/ 配下の出典記録を名前順に読む。フォルダが無ければ空配列。
 *
 * @param {string} dir provenance フォルダの絶対パス
 * @returns {Array<{ path: string, data: object | null, parseError?: string }>}
 */
export function loadProvenanceFiles(dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  return names.map((name) => {
    const path = `provenance/${name}`;
    try {
      return { path, data: JSON.parse(readFileSync(resolve(dir, name), 'utf-8')) };
    } catch (e) {
      return { path, data: null, parseError: e.message };
    }
  });
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run tests/load-provenance.test.mjs`
Expected: PASS（2 tests）

- [ ] **Step 5: `provenance/README.md` を作る**

```markdown
# provenance（出典記録）

機種ごとの出典記録を `<機種ID>.json`（`machines/index.json` の id）の名前で置く。機種ファイルには何も足さない。

- 形: `docs/data-format.md` の「provenance（出典記録）」
- スキーマ: `schemas/provenance.schema.json`
- 採否の基準: `docs/quality-standards.md` の「出典と採否の基準」
- 検証: `npm run validate`（出典記録バリデーション）
```

- [ ] **Step 6: `scripts/validate.mjs` を変える**

(a) 冒頭の Usage コメントの `--index-only` の行の下に1行足す:

```js
 *   node scripts/validate.mjs --index-only  # index整合性チェックのみ
 *   node scripts/validate.mjs --require-provenance # 出典記録を全機種に求める（段階3）
```

(b) import の最後（`import { validateCompleteness } from './validators/completeness-validator.mjs';` の次）に足す:

```js
import { validateProvenance } from './validators/provenance-validator.mjs';
import { loadProvenanceFiles } from './lib/load-provenance.mjs';
```

(c) `const MACHINES_DIR = resolve(ROOT, 'machines');` の次に足す:

```js
const PROVENANCE_DIR = resolve(ROOT, 'provenance');
```

(d) 完全性チェックの末尾と「結果出力」の間に、6番目の検査を足す。置き換える前:

```js
    console.log(`  警告: ${comp.warnings.length}件 / 情報: ${comp.info.length}件\n`);
  }

  // --- 結果出力 ---
```

置き換えた後:

```js
    console.log(`  警告: ${comp.warnings.length}件 / 情報: ${comp.info.length}件\n`);
  }

  // 6. 出典記録バリデーション（段階3までは、記録がある機種だけを検証する）
  if (!schemaOnly && !indexOnly) {
    console.log('--- 出典記録バリデーション ---');
    const provenanceFiles = loadProvenanceFiles(PROVENANCE_DIR);
    const prov = validateProvenance(validFiles, indexData, provenanceFiles, {
      requireAll: args.includes('--require-provenance'),
    });
    allErrors.push(...prov.errors);
    allWarnings.push(...prov.warnings);
    console.log(
      `  記録: ${provenanceFiles.length}件 / エラー: ${prov.errors.length}件 / 警告: ${prov.warnings.length}件\n`
    );
  }

  // --- 結果出力 ---
```

- [ ] **Step 7: 実データでの確認を integration テストに足す**

`tests/integration.test.mjs` の import のまとまりを次に置き換える:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { validateSchemas } from '../scripts/validators/schema-validator.mjs';
import { validateIndexConsistency } from '../scripts/validators/index-consistency.mjs';
import { validateProbabilities } from '../scripts/validators/probability-validator.mjs';
import { validateConfirmations } from '../scripts/validators/confirmation-validator.mjs';
import { validateCompleteness } from '../scripts/validators/completeness-validator.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';
import { loadProvenanceFiles } from '../scripts/lib/load-provenance.mjs';
```

同じファイルの `it('description: 100%充填', ...)` のブロックの後（`describe` の閉じかっこの前）に足す:

```js
  it('出典記録: エラーゼロ', () => {
    const provenanceFiles = loadProvenanceFiles(resolve(ROOT, 'provenance'));
    const result = validateProvenance(machineFiles, indexData, provenanceFiles);
    if (result.errors.length > 0) {
      console.log(
        'Provenance errors:',
        result.errors.map((e) => `${e.file}: ${e.message}`)
      );
    }
    expect(result.errors).toHaveLength(0);
  });

  it('validate.mjs が出典記録の検査を実行して成功する', () => {
    const run = spawnSync(process.execPath, ['scripts/validate.mjs'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('--- 出典記録バリデーション ---');
  });
```

- [ ] **Step 8: 全体を確かめる**

Run: `npx vitest run && npm run -s validate | tail -12`
Expected: vitest がすべて PASS（既存 130 件＋Task 1〜4 の追加分）。validate の出力に `--- 出典記録バリデーション ---` と `記録: 0件 / エラー: 0件 / 警告: 0件`、最後に `合計: エラー 0件 / 警告 0件`

- [ ] **Step 9: 整形と lint**

Run: `npx prettier --write scripts/lib/load-provenance.mjs scripts/validate.mjs tests/load-provenance.test.mjs tests/integration.test.mjs && npx eslint .`
Expected: eslint が何も出力せず終了コード 0

- [ ] **Step 10: コミット**

```bash
git add scripts/lib/load-provenance.mjs scripts/validate.mjs provenance/README.md tests/load-provenance.test.mjs tests/integration.test.mjs
git commit -m "feat(scripts): validate に出典記録の検査を組み込む

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: main と比べる検査（アプリが作る ID・採否ルール）

**Files:**
- Create: `scripts/lib/derived-ids.mjs`
- Create: `scripts/lib/rules-against-base.mjs`
- Create: `scripts/check-against-base.mjs`
- Modify: `package.json`（`check:base`）
- Modify: `.github/workflows/validate.yml`
- Test: `tests/derived-ids.test.mjs`、`tests/rules-against-base.test.mjs`

**Interfaces:**
- Consumes: `scripts/migrate-v1-to-v2.mjs` の `migrateV1ToV2`（iOS の `services/migrations/v1ToV2.ts` の移植。iOS 側は 2026-04-24 から変わっていないことを確認済み）、Task 1 の `CHONBORISTA_KEY`・`itemKey`・`NAME_SEPARATOR`・`createNameDisambiguator`・`listMachineItems`・`machineValue`・`valuesAgree`、Task 2 の `valuesEqual`、Task 4 の `loadProvenanceFiles`
- Produces:
  - `collectDerivedIds(machine: object): Map<string, string>`（項目キー → ID。キーは `role::名前`、`zone::名前`、`zoneRole::ゾーン::役`、`endScreen::名前`、`endScreenGroup::名前`、`endScreenGroupItem::グループ::画面`。重なったら `#2`、`#3`）
  - `compareDerivedIds(baseIds: Map, headIds: Map, removedKeys: Set<string>): string[]`
  - `checkDerivedIds({ readBase, readHead, provenanceFiles }): string[]`（`readBase` / `readHead` はリポジトリからの相対パスを受け取って中身を返す）
  - `checkRulesAgainstBase({ readBase, readHead, provenanceFiles }): string[]`（採否ルール（仕様 5.5）のうち、見直し前の値（main）が要るものを確かめる。kept-single-source は main にある項目にだけ使い、採用値と機種ファイルの値が main の値そのものか。main にある項目の provisional-chonborista は、ちょんぼりすたの値が main の値と一致しないときだけか（一致するなら規則2の kept-single-source）。Task 2 の `statusError` と Task 3 の検証器は見直し前の値を知らないので、ここで確かめる）
  - `npm run check:base`（上の2つをまとめて実行。終了コード 0 = 問題なし、1 = 問題あり、2 = 比べられない）

- [ ] **Step 1: ID の検査の失敗するテストを書く**

`tests/derived-ids.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  checkDerivedIds,
  collectDerivedIds,
  compareDerivedIds,
} from '../scripts/lib/derived-ids.mjs';

const baseMachine = {
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  lastUpdated: '2026-09-26',
  roles: [
    { name: 'BIG', probabilities: { 1: 0.00338753 }, hasSettingDiff: false, displayOrder: 1 },
    { name: 'REG', probabilities: { 1: 0.0025 }, hasSettingDiff: false, displayOrder: 2 },
  ],
  zones: [
    {
      name: 'CZ',
      isDefault: false,
      roles: [{ name: 'Bell', probabilities: { 1: 0.1 }, hasSettingDiff: false, displayOrder: 1 }],
    },
  ],
  endScreens: [
    { name: 'Blue', type: 'at_end', hint: '' },
    { name: '赤', hint: '' },
    { name: '青', hint: '' },
  ],
  endScreenGroups: [{ name: 'End', endScreens: [{ name: 'Red', hint: '' }] }],
};

describe('collectDerivedIds', () => {
  it('アプリと同じ規則で ID を作る', () => {
    expect(Object.fromEntries(collectDerivedIds(baseMachine))).toEqual({
      'role::BIG': 'big_1',
      'role::REG': 'reg_2',
      'zone::CZ': 'cz',
      'zoneRole::CZ::Bell': 'bell_1',
      'endScreen::Blue': 'blue',
      'endScreen::赤': 'endscreen',
      'endScreen::青': 'endscreen_2',
      'endScreenGroup::End': 'end',
      'endScreenGroupItem::End::Red': 'red',
    });
  });

  it('同じ名前の項目は、2つ目から #2 を付けて区別する', () => {
    const machine = {
      ...baseMachine,
      endScreens: [
        { name: '仁', id: 'jin_bonus', hint: '' },
        { name: '仁', id: 'jin_at', hint: '' },
      ],
    };
    const ids = collectDerivedIds(machine);
    expect(ids.get('endScreen::仁')).toBe('jin_bonus');
    expect(ids.get('endScreen::仁#2')).toBe('jin_at');
  });
});

describe('compareDerivedIds', () => {
  const base = collectDerivedIds(baseMachine);

  it('役を後ろに足しても既存の ID は変わらない', () => {
    const roles = [
      ...baseMachine.roles,
      { name: 'Cherry', probabilities: { 1: 0.01 }, hasSettingDiff: false, displayOrder: 3 },
    ];
    expect(compareDerivedIds(base, collectDerivedIds({ ...baseMachine, roles }), new Set())).toEqual(
      []
    );
  });

  it('displayOrder を変えると、ID が変わったと報告する', () => {
    const roles = [{ ...baseMachine.roles[0], displayOrder: 3 }, baseMachine.roles[1]];
    expect(compareDerivedIds(base, collectDerivedIds({ ...baseMachine, roles }), new Set())).toEqual(
      ['role::BIG: ID が変わった（big_1 → big_3）']
    );
  });

  it('漢字名の終了画面を外すと後ろの ID が繰り上がる。id を書いて固定すれば防げる', () => {
    const removed = new Set(['endScreen::赤']);
    const withoutAka = { ...baseMachine, endScreens: [baseMachine.endScreens[0], baseMachine.endScreens[2]] };
    expect(compareDerivedIds(base, collectDerivedIds(withoutAka), removed)).toEqual([
      'endScreen::青: ID が変わった（endscreen_2 → endscreen）',
    ]);
    const pinned = {
      ...baseMachine,
      endScreens: [baseMachine.endScreens[0], { ...baseMachine.endScreens[2], id: 'endscreen_2' }],
    };
    expect(compareDerivedIds(base, collectDerivedIds(pinned), removed)).toEqual([]);
  });

  it('記録なしに項目が消えると報告する', () => {
    const head = collectDerivedIds({ ...baseMachine, roles: [baseMachine.roles[0]] });
    expect(compareDerivedIds(base, head, new Set())).toEqual([
      'role::REG: 項目が消えたのに、出典記録の removed に無い',
    ]);
  });
});

describe('checkDerivedIds', () => {
  const index = {
    version: '3.8.0',
    updatedAt: '2026-09-26T00:00:00Z',
    machines: [
      {
        id: 'test-machine',
        name: 'テスト機種',
        type: 'AT',
        author: 'コミュニティ',
        version: '1.0',
        file: 'test/test-machine.json',
      },
    ],
  };
  const files = (machine, idx = index) => ({
    'machines/index.json': JSON.stringify(idx),
    'machines/test/test-machine.json': JSON.stringify(machine),
  });
  const reader = (map) => (path) => {
    if (!(path in map)) throw new Error(`no such file: ${path}`);
    return map[path];
  };

  it('変化が無ければ問題なし', () => {
    const map = files(baseMachine);
    expect(checkDerivedIds({ readBase: reader(map), readHead: reader(map), provenanceFiles: [] })).toEqual(
      []
    );
  });

  it('removed に記録した項目の削除は許す', () => {
    const head = files({ ...baseMachine, roles: [baseMachine.roles[0]] });
    const provenanceFiles = [
      {
        data: {
          machineId: 'test-machine',
          removed: [{ kind: 'role', name: 'REG', previous: {}, reason: '出典なし' }],
        },
      },
    ];
    expect(
      checkDerivedIds({ readBase: reader(files(baseMachine)), readHead: reader(head), provenanceFiles })
    ).toEqual([]);
  });

  it('index から機種が消えたら報告する', () => {
    const head = files(baseMachine, { ...index, machines: [] });
    expect(
      checkDerivedIds({ readBase: reader(files(baseMachine)), readHead: reader(head), provenanceFiles: [] })
    ).toEqual(['test-machine: index.json から機種が消えた']);
  });

  it('基準を読めなければ例外を投げる（CLI は終了コード 2 にする）', () => {
    expect(() =>
      checkDerivedIds({ readBase: reader({}), readHead: reader(files(baseMachine)), provenanceFiles: [] })
    ).toThrow('no such file');
  });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run tests/derived-ids.test.mjs`
Expected: FAIL（`derived-ids.mjs` が無いエラー）

- [ ] **Step 3: ID の検査を実装する**

`scripts/lib/derived-ids.mjs`:

```js
import { migrateV1ToV2 } from '../migrate-v1-to-v2.mjs';
import { NAME_SEPARATOR, createNameDisambiguator, itemKey } from './provenance.mjs';

/**
 * アプリが名前から作る ID（役・ゾーン・終了画面・終了画面グループ）を、元の項目ごとに集める（仕様 5.8）。
 * アプリと同じ移行処理（migrate-v1-to-v2.mjs は iOS の services/migrations/v1ToV2.ts の移植）を通す。
 * 同じ種類で同じ名前の項目は、出典記録と同じく `#2`、`#3` を付けて区別する。
 *
 * @param {object} machine 機種ファイルの中身
 * @returns {Map<string, string>} 項目キー → ID
 */
export function collectDerivedIds(machine) {
  const v2 = migrateV1ToV2(machine);
  const ids = new Map();
  const disambiguate = createNameDisambiguator();
  const put = (kind, name, id) => ids.set(itemKey(kind, disambiguate(kind, name)), id);
  const child = (parent, name) => `${parent}${NAME_SEPARATOR}${name}`;

  for (const role of v2.roles ?? []) put('role', role.name, role.id);
  for (const zone of v2.zones ?? []) {
    put('zone', zone.name, zone.id);
    for (const role of zone.roles ?? []) put('zoneRole', child(zone.name, role.name), role.id);
  }
  for (const screen of v2.endScreens ?? []) put('endScreen', screen.name, screen.id);
  for (const group of v2.endScreenGroups ?? []) {
    put('endScreenGroup', group.name, group.id);
    for (const screen of group.endScreens ?? []) {
      put('endScreenGroupItem', child(group.name, screen.name), screen.id);
    }
  }
  return ids;
}

/**
 * 基準の ID が、比べる側でも同じかを確かめる。
 *
 * @param {Map<string, string>} baseIds 基準（main）の ID
 * @param {Map<string, string>} headIds 比べる側（作業ブランチ）の ID
 * @param {Set<string>} removedKeys 出典記録の removed にある項目キー
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function compareDerivedIds(baseIds, headIds, removedKeys) {
  const problems = [];
  for (const [key, id] of baseIds) {
    if (headIds.has(key)) {
      const headId = headIds.get(key);
      if (headId !== id) problems.push(`${key}: ID が変わった（${id} → ${headId}）`);
    } else if (!removedKeys.has(key)) {
      problems.push(`${key}: 項目が消えたのに、出典記録の removed に無い`);
    }
  }
  return problems;
}

/**
 * index.json の全機種について、基準と比べる。
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   provenanceFiles: Array<{ data: object | null }> }} io
 *   readBase / readHead はリポジトリからの相対パスを受け取り、中身を返す。読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkDerivedIds({ readBase, readHead, provenanceFiles }) {
  const removedById = new Map();
  for (const file of provenanceFiles) {
    if (!file.data) continue;
    const keys = (file.data.removed ?? []).map((removed) => itemKey(removed.kind, removed.name));
    removedById.set(file.data.machineId, new Set(keys));
  }

  const baseIndex = JSON.parse(readBase('machines/index.json'));
  const headIndex = JSON.parse(readHead('machines/index.json'));
  const headById = new Map(headIndex.machines.map((entry) => [entry.id, entry]));

  const problems = [];
  for (const entry of baseIndex.machines) {
    const head = headById.get(entry.id);
    if (!head) {
      problems.push(`${entry.id}: index.json から機種が消えた`);
      continue;
    }
    const baseIds = collectDerivedIds(JSON.parse(readBase(`machines/${entry.file}`)));
    const headIds = collectDerivedIds(JSON.parse(readHead(`machines/${head.file}`)));
    const removed = removedById.get(entry.id) ?? new Set();
    for (const problem of compareDerivedIds(baseIds, headIds, removed)) {
      problems.push(`${entry.id}: ${problem}`);
    }
  }
  return problems;
}
```

- [ ] **Step 4: ID のテストが通ることを確かめる**

Run: `npx vitest run tests/derived-ids.test.mjs`
Expected: PASS（10 tests）

- [ ] **Step 5: 採否ルールの検査の失敗するテストを書く**

`tests/rules-against-base.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { checkRulesAgainstBase } from '../scripts/lib/rules-against-base.mjs';

const entry = {
  id: 'test-machine',
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  file: 'test/test-machine.json',
};
const indexJson = (machines) =>
  JSON.stringify({ version: '3.8.0', updatedAt: '2026-09-26T00:00:00Z', machines });
const big = (probability) => ({
  name: 'BIG',
  probabilities: { 1: probability },
  hasSettingDiff: false,
  displayOrder: 1,
});
const files = (roles, machines = [entry]) => ({
  'machines/index.json': indexJson(machines),
  'machines/test/test-machine.json': JSON.stringify({
    name: 'テスト機種',
    type: 'AT',
    author: 'コミュニティ',
    version: '1.0',
    lastUpdated: '2026-09-26',
    roles,
  }),
});
const reader = (map) => (path) => {
  if (!(path in map)) throw new Error(`no such file: ${path}`);
  return map[path];
};

// kept-single-source の採用値は、今の機種ファイルの値を unit の形にしたもの（1 ÷ 確率）そのもの
const kept = (adopted = { 1: 1 / 0.00338753 }) => ({
  kind: 'role',
  name: 'BIG',
  unit: 'denominator',
  status: 'kept-single-source',
  values: { 'nana-press': { 1: 295.2 } },
  adopted,
});
const provisional = (chonborista) => ({
  kind: 'role',
  name: 'BIG',
  unit: 'denominator',
  status: 'provisional-chonborista',
  values: { chonborista },
  adopted: chonborista,
  reread: { by: 'verifier', value: chonborista },
});
const recordsOf = (...items) => [{ data: { machineId: 'test-machine', items } }];
const run = (base, head, provenanceFiles) =>
  checkRulesAgainstBase({ readBase: reader(base), readHead: reader(head), provenanceFiles });

describe('checkRulesAgainstBase: kept-single-source', () => {
  it('採用値と機種ファイルの値が main の値そのものなら問題なし', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(kept()))).toEqual([]);
  });

  it('機種ファイルの値が main から変わったら、一致の条件の範囲でも報告する', () => {
    // 1/295.2 → 1/295.3 は 5.4 の一致の条件（0.1% 以内）に入るが、残す値は変えない
    expect(run(files([big(0.00338753)]), files([big(0.00338639)]), recordsOf(kept()))).toEqual([
      'test-machine: role::BIG: kept-single-source の値が main から変わった',
    ]);
  });

  it('採用値が main の値そのものでなければ、一致の条件の範囲でも報告する', () => {
    // 許容差による一致は推移しない。間の値を採用値に書くと、今の値を裏づけない出典でも通ってしまう
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(kept({ 1: 295.35 })))).toEqual([
      'test-machine: role::BIG: kept-single-source の採用値が main の値そのものでない',
    ]);
  });

  it('main に無い項目・機種に使ったら報告する', () => {
    const expected = ['test-machine: role::BIG: main に無い項目に kept-single-source を使っている'];
    expect(run(files([]), files([big(0.00338753)]), recordsOf(kept()))).toEqual(expected);
    const base = { 'machines/index.json': indexJson([]) };
    expect(run(base, files([big(0.00338753)]), recordsOf(kept()))).toEqual(expected);
  });

  it('機種ファイルに無い項目に使ったら報告する（index.json から外した機種も）', () => {
    const map = files([big(0.00338753)]);
    const expected = ['test-machine: role::BIG: kept-single-source の項目が機種ファイルに無い'];
    expect(run(map, files([]), recordsOf(kept()))).toEqual(expected);
    expect(run(map, files([big(0.00338753)], []), recordsOf(kept()))).toEqual(expected);
  });
});

describe('checkRulesAgainstBase: provisional-chonborista', () => {
  it('main にある項目で、ちょんぼりすたの値が main の値と一致しないなら問題なし（規則3）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(provisional({ 1: 300 })))).toEqual([]);
  });

  it('main にある項目で、ちょんぼりすたの値が main の値と一致するなら報告する（規則2）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(provisional({ 1: 295.2 })))).toEqual([
      'test-machine: role::BIG: ちょんぼりすたの値が main の値と一致する（規則2の kept-single-source にする）',
    ]);
  });

  it('main に無い項目（新しく入れる値）は、main の値と比べない', () => {
    const base = { 'machines/index.json': indexJson([]) };
    expect(run(base, files([big(0.00338753)]), recordsOf(provisional({ 1: 295.2 })))).toEqual([]);
  });
});

describe('checkRulesAgainstBase: そのほか', () => {
  it('kept-single-source と provisional-chonborista の無い記録では、main の機種ファイルを読まない', () => {
    const base = { 'machines/index.json': indexJson([entry]) };
    const confirmed = { ...kept(), status: 'confirmed' };
    expect(run(base, files([big(0.00338753)]), recordsOf(confirmed))).toEqual([]);
  });

  it('読めなかった記録は飛ばす（validate が報告する）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, [{ data: null }])).toEqual([]);
  });

  it('main の機種ファイルを読めなければ例外を投げる（CLI は終了コード 2 にする）', () => {
    const base = { 'machines/index.json': indexJson([entry]) };
    expect(() => run(base, files([big(0.00338753)]), recordsOf(kept()))).toThrow('no such file');
  });
});
```

- [ ] **Step 6: テストが失敗することを確かめる**

Run: `npx vitest run tests/rules-against-base.test.mjs`
Expected: FAIL（`rules-against-base.mjs` が無いエラー）

- [ ] **Step 7: 採否ルールの検査を実装する**

`scripts/lib/rules-against-base.mjs`:

```js
import {
  CHONBORISTA_KEY,
  itemKey,
  listMachineItems,
  machineValue,
  valuesAgree,
  valuesEqual,
} from './provenance.mjs';

const KEPT = 'kept-single-source';
const PROVISIONAL = 'provisional-chonborista';

function indexById(read) {
  const index = JSON.parse(read('machines/index.json'));
  return new Map(index.machines.map((entry) => [entry.id, entry]));
}

/** 機種の項目を項目キーで引けるようにする。機種が index.json に無ければ空 */
function itemsByKey(read, entry) {
  if (!entry) return new Map();
  const machine = JSON.parse(read(`machines/${entry.file}`));
  return new Map(listMachineItems(machine).map((item) => [itemKey(item.kind, item.name), item]));
}

/**
 * 採否ルール（仕様 5.5）のうち、見直し前の値（main）が要るものを確かめる（仕様 5.7）。
 * validate（出典記録の検証器と statusError）は main を読まないので、次をここで見る。
 * - kept-single-source は main にある項目にだけ使う。採用値は main の値そのもの（許容差による一致は
 *   推移しないので、完全一致で結ぶ）で、機種ファイルの値も main から変えない（「残す」は値を変えないこと）
 * - main にある項目の provisional-chonborista は、ちょんぼりすたの値が main の値と一致しないときだけ使う
 *   （一致するなら規則2の kept-single-source）
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   provenanceFiles: Array<{ data: object | null }> }} io
 *   readBase / readHead はリポジトリからの相対パスを受け取り、中身を返す。読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkRulesAgainstBase({ readBase, readHead, provenanceFiles }) {
  const baseById = indexById(readBase);
  const headById = indexById(readHead);
  const problems = [];
  for (const file of provenanceFiles) {
    const record = file.data;
    if (!record) continue; // 読めなかった記録は validate が報告する
    const items = (record.items ?? []).filter(
      (item) => item.status === KEPT || item.status === PROVISIONAL
    );
    if (items.length === 0) continue;

    const id = record.machineId;
    const baseItems = itemsByKey(readBase, baseById.get(id));
    const headItems = itemsByKey(readHead, headById.get(id));
    for (const item of items) {
      const key = itemKey(item.kind, item.name);
      const baseItem = baseItems.get(key);
      const baseValue = baseItem ? machineValue(baseItem.entry, item.unit) : null;

      if (item.status === PROVISIONAL) {
        if (baseItem && valuesAgree(item.unit, item.values?.[CHONBORISTA_KEY], baseValue)) {
          problems.push(
            `${id}: ${key}: ちょんぼりすたの値が main の値と一致する（規則2の kept-single-source にする）`
          );
        }
        continue;
      }

      const headItem = headItems.get(key);
      if (!baseItem) {
        problems.push(`${id}: ${key}: main に無い項目に kept-single-source を使っている`);
        continue;
      }
      if (!headItem) {
        problems.push(`${id}: ${key}: kept-single-source の項目が機種ファイルに無い`);
        continue;
      }
      // unit で表せない値（null）は、valuesEqual が同じとみなさない
      if (!valuesEqual(item.unit, baseValue, item.adopted)) {
        problems.push(`${id}: ${key}: kept-single-source の採用値が main の値そのものでない`);
      }
      if (!valuesEqual(item.unit, baseValue, machineValue(headItem.entry, item.unit))) {
        problems.push(`${id}: ${key}: kept-single-source の値が main から変わった`);
      }
    }
  }
  return problems;
}
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `npx vitest run tests/rules-against-base.test.mjs`
Expected: PASS（11 tests）

- [ ] **Step 9: CLI を書く**

`scripts/check-against-base.mjs`:

```js
#!/usr/bin/env node

/**
 * main（既定: origin/main）と比べて確かめる。validate は main を読まないので、こちらで見る（仕様 5.7・5.8）。
 * - アプリが名前から作る ID が変わっていないか、記録なしに項目が消えていないか
 * - 採否ルールのうち、見直し前の値が要るもの（kept-single-source・provisional-chonborista の使い方）
 *
 * Usage:
 *   node scripts/check-against-base.mjs                   # origin/main と比べる
 *   node scripts/check-against-base.mjs --base <git ref>  # 任意の基準と比べる
 *
 * 終了コード: 0 = 問題なし / 1 = 問題あり / 2 = 比べられない（素通りさせない）
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkDerivedIds } from './lib/derived-ids.mjs';
import { checkRulesAgainstBase } from './lib/rules-against-base.mjs';
import { loadProvenanceFiles } from './lib/load-provenance.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/** --base の値。--base が無ければ origin/main、--base の後に値が無ければ null */
function parseBase(argv) {
  const index = argv.indexOf('--base');
  if (index < 0) return 'origin/main';
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function main() {
  const base = parseBase(process.argv.slice(2));
  if (!base) {
    console.error('--base の後に、比べる git の参照を書いてください');
    process.exit(2);
  }
  const readBase = (path) =>
    execFileSync('git', ['show', `${base}:${path}`], {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const readHead = (path) => readFileSync(resolve(ROOT, path), 'utf-8');

  console.log(`=== 基準との比較（基準: ${base}）===\n`);
  let problems;
  try {
    const io = {
      readBase,
      readHead,
      provenanceFiles: loadProvenanceFiles(resolve(ROOT, 'provenance')),
    };
    problems = [...checkDerivedIds(io), ...checkRulesAgainstBase(io)];
  } catch (e) {
    // 基準を読めない・JSON が壊れている・項目の名前を区別できない（createNameDisambiguator の例外）のどれか
    console.error(`比べられませんでした（基準: ${base}）: ${e.message}`);
    process.exit(2);
  }

  if (problems.length === 0) {
    console.log(
      '問題なし: 既存の ID は基準と同じで、出典記録は基準の値に照らして採否ルールどおりです'
    );
    process.exit(0);
  }
  console.log(`問題: ${problems.length}件`);
  for (const problem of problems) console.log(`  ERROR ${problem}`);
  process.exit(1);
}

main();
```

- [ ] **Step 10: npm スクリプトを足す**

`package.json` の `"quality:json": "node scripts/quality-report.mjs --json",` の次の行に足す:

```json
    "check:base": "node scripts/check-against-base.mjs --base origin/main",
```

- [ ] **Step 11: 実データで CLI を確かめる**

Run: `git fetch origin && npm run -s check:base; echo "exit=$?"`
Expected: `問題なし: 既存の ID は基準と同じで、出典記録は基準の値に照らして採否ルールどおりです` と `exit=0`

Run: `node scripts/check-against-base.mjs --base no-such-ref > "$TMPDIR/base.txt" 2>&1; echo "exit=$?"; head -3 "$TMPDIR/base.txt"`
Expected: `exit=2` と `比べられませんでした（基準: no-such-ref）: Command failed: git show no-such-ref:machines/index.json`（パイプで tail に渡すと tail の終了コードを拾うので、ファイルに書いてから見る）

Run: `node scripts/check-against-base.mjs --base > "$TMPDIR/base.txt" 2>&1; echo "exit=$?"; head -3 "$TMPDIR/base.txt"`
Expected: `exit=2` と `--base の後に、比べる git の参照を書いてください`

- [ ] **Step 12: CI で PR のときに実行する**

`.github/workflows/validate.yml` の checkout を全履歴にする。置き換える前:

```yaml
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
```

置き換えた後:

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # main と比べる検査（ID の安定性・採否ルール）のため、全履歴を取る

      - uses: actions/setup-node@v4
```

同じファイルの「テスト」の手順の後に足す。置き換える前:

```yaml
      - name: テスト
        run: npm test

```

置き換えた後:

```yaml
      - name: テスト
        run: npm test

      - name: 基準（main）との比較（PR のみ）
        if: github.event_name == 'pull_request'
        run: node scripts/check-against-base.mjs --base "origin/${{ github.base_ref }}"

```

- [ ] **Step 13: 整形と lint**

Run: `npx prettier --write scripts/lib/derived-ids.mjs scripts/lib/rules-against-base.mjs scripts/check-against-base.mjs tests/derived-ids.test.mjs tests/rules-against-base.test.mjs && npx eslint . && npx vitest run`
Expected: eslint が何も出力せず、vitest がすべて PASS

- [ ] **Step 14: コミット**

```bash
git add scripts/lib/derived-ids.mjs scripts/lib/rules-against-base.mjs scripts/check-against-base.mjs tests/derived-ids.test.mjs tests/rules-against-base.test.mjs package.json .github/workflows/validate.yml
git commit -m "feat(scripts): main と比べる検査を追加（アプリが作る ID・採否ルール）

main と比べ、既存の役・ゾーン・終了画面の ID が変わっていないか、
記録なしに項目が消えていないか、見直し前の値が要る採否ルール
（kept-single-source・provisional-chonborista の使い方）を守っているかを確かめる。
PR の CI でも実行する。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 品質レポートと文書

**Files:**
- Modify: `scripts/quality-report.mjs`
- Modify: `tests/integration.test.mjs`
- Modify: `docs/data-format.md`、`docs/quality-standards.md`、`docs/CONTRIBUTING.md`、`docs/data-provenance-proposal.md`、`README.md`、`CHANGELOG.md`

**Interfaces:**
- Consumes: Task 4 の `loadProvenanceFiles`
- Produces: `node scripts/quality-report.mjs` に `provenance (出典記録)` の行、`--json` に `provenance: { withRecord, total }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/integration.test.mjs` の `it('validate.mjs が出典記録の検査を実行して成功する', ...)` の後に足す:

```js
  it('品質レポートが出典記録のある機種数を出す', () => {
    const run = spawnSync(process.execPath, ['scripts/quality-report.mjs', '--json'], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout);
    const recorded = loadProvenanceFiles(resolve(ROOT, 'provenance')).filter((file) => file.data);
    expect(report.provenance.total).toBe(indexData.machines.length);
    expect(report.provenance.withRecord).toBe(recorded.length);
  });
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run tests/integration.test.mjs`
Expected: FAIL（`Cannot read properties of undefined (reading 'total')`）

- [ ] **Step 3: 品質レポートを変える**

`scripts/quality-report.mjs`:

(a) `import { validateCompleteness } from './validators/completeness-validator.mjs';` の次に足す:

```js
import { loadProvenanceFiles } from './lib/load-provenance.mjs';
```

(b) `const MACHINES_DIR = resolve(ROOT, 'machines');` の次に足す:

```js
const PROVENANCE_DIR = resolve(ROOT, 'provenance');
```

(c) 置き換える前:

```js
  if (jsonOutput) {
    console.log(JSON.stringify({ summary, warnings: result.warnings, info: result.info }, null, 2));
    return;
  }
```

置き換えた後:

```js
  const recordedIds = new Set(
    loadProvenanceFiles(PROVENANCE_DIR)
      .filter((file) => file.data)
      .map((file) => file.data.machineId)
  );
  const withProvenance = (indexData.machines ?? []).filter((entry) =>
    recordedIds.has(entry.id)
  ).length;

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          summary,
          provenance: { withRecord: withProvenance, total },
          warnings: result.warnings,
          info: result.info,
        },
        null,
        2
      )
    );
    return;
  }
```

(d) `['voiceCounts (non-empty)', stats.voiceCountsNonEmpty],` の次の行に足す:

```js
    ['provenance (出典記録)', withProvenance],
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run tests/integration.test.mjs && npm run -s quality | grep -F 'provenance (出典記録)'`
Expected: PASS。grep の出力は `provenance (出典記録)` の行で、`0/149  (  0%)`

- [ ] **Step 5: `docs/data-format.md` の末尾に節を足す**

````markdown

## provenance（出典記録）

2026-09-26 から、出典を `provenance/<機種ID>.json` に項目ごとに記録する。機種ファイルには何も足さない（アプリと pachi-manager は読まない）。仕様は `docs/superpowers/specs/2026-09-26-data-expansion-design.md` の5章、スキーマは `schemas/provenance.schema.json`。

### 例

```json
{
  "machineId": "galfy",
  "machineFile": "galfy/galfy.json",
  "reviewedAt": "2026-09-26",
  "sources": [
    { "key": "chonborista", "kind": "analysis-site", "url": "https://chonborista.com/…", "retrievedAt": "2026-09-26" },
    { "key": "nana-press", "kind": "analysis-site", "url": "https://nana-press.com/…", "retrievedAt": "2026-09-26" }
  ],
  "items": [
    {
      "kind": "role",
      "name": "BIG",
      "status": "confirmed",
      "unit": "denominator",
      "values": { "chonborista": { "1": 295.2, "6": 277.7 }, "nana-press": { "1": 295.2, "6": 277.7 } },
      "adopted": { "1": 295.2, "6": 277.7 }
    }
  ],
  "candidates": [],
  "removed": []
}
```

### 値の表し方（unit）

| unit | 値 | 機種ファイル側との対応 |
|---|---|---|
| `denominator` | 設定ごとの分母（`{"1": 295.2}`） | `probabilities`（または `rates`）の `1 ÷ 値` |
| `percent` | 設定ごとの割合 0〜100（`{"1": 10}`） | `probabilities`（または `rates`）の `値 × 100` |
| `settings` | `{"confirmed": [...], "excluded": [...]}` | `confirmedSettings` / `excludedSettings` |
| `presence` | `true` | 数値は比べず、出典に載っていることだけを記録する |

unit は、機種ファイルの項目の中身で決まる（検証器が確かめる）。数値（`probabilities` / `rates`）があれば `denominator` か `percent`、数値が無く確定・否定の設定があれば `settings`、どちらも無ければ `presence`。確率が 0 の設定を含む項目は分母で表せないので、`percent` で記録する。数値と設定の組の両方がある項目（2026-09-26 時点で endScreen 2件・endScreenGroupItem 4件）は数値の側で記録し、設定の組の側は照合しない。

### 項目の種類と名前

| kind | 機種ファイルの場所 | name |
|---|---|---|
| `role` | `roles[]` | 役の名前 |
| `zoneRole` | `zones[].roles[]` | `ゾーン名::役の名前` |
| `confirmationEvent` | `confirmationEvents[]` | 名前 |
| `endScreen` | `endScreens[]` | 名前 |
| `endScreenGroupItem` | `endScreenGroups[].endScreens[]` | `グループ名::画面の名前` |
| `voiceCount` / `musicCount` / `effectCount` | 各配列 | 名前 |
| `trialSuccessRate` | `trialSuccessRates[]` | 名前 |
| `modeTransition` | `modeTransitions[]` | 名前 |
| `specialSettings` | `specialSettings` | `specialSettings` |

同じ種類で同じ名前の項目が複数あるときは、並び順で2つ目から名前に `#2`、`#3` を付けて区別する（例: tekken5 の終了画面 `仁` と `仁#2`）。並び順で数えるので、項目を並べ替えない。

### status

| status | 意味 |
|---|---|
| `confirmed` | 2サイト以上で一致、またはメーカー公式 |
| `provisional-chonborista` | ちょんぼりすたにしか無く、別の担当が読み直して一致した（`reread` が必須） |
| `kept-single-source` | 既存の値で、1サイトだけが同じ値を出している。`adopted` は今の機種ファイルの値を unit の形にしたもの（`machineValue` の結果）そのもので、機種ファイルの値は変えない（`npm run check:base` が main と比べる） |

`candidates` は見つけたが採用しなかった値、`removed` は見直しで外した値（前の値と理由）。

### 保存する数値

確率・割合は `scripts/lib/provenance.mjs` の `toStoredProbability(分母)` / `toStoredRate(割合)` で有効数字6桁にして保存する（小数6桁では 1/65536 のような小さい確率が約1.7%ずれるため）。
````

- [ ] **Step 6: `docs/quality-standards.md` の末尾に節を足す**

```markdown

## 出典と採否の基準（2026-09-26〜）

仕様: `docs/superpowers/specs/2026-09-26-data-expansion-design.md` の 5.4〜5.8。

### 一致の判定

- 確率（分母）: すべての設定で差が 0.1% 以内
- 割合: すべての設定で差が 0.1 ポイント以内
- 設定の組: 完全に同じ
- 採用する値: メーカー公式 → ちょんぼりすた → 最初に見つかった出典

### 新しく入れる値

1. 2サイト以上で一致、またはメーカー公式 → 入れる（`confirmed`）
2. ちょんぼりすたにしか無く、別の担当が読み直して一致 → 暫定で入れる（`provisional-chonborista`）
3. それ以外 → 入れない（`candidates` に記録）

### 既存の値（見直し）

1. 2サイト以上で一致した値がある → その値にする（`confirmed`）
2. 今の値を1サイトだけが裏づける → 残す（`kept-single-source`。採用値は今の値そのもので、機種ファイルの値は変えない）
3. 裏づけが無く、ちょんぼりすたにだけ値があり、読み直しで一致 → その値にする（`provisional-chonborista`）
4. それ以外 → 外す（`removed` に記録）

### アプリが作る ID を変えない

- 既存の項目の `name` と `displayOrder` を変えない。並べ替えない
- 新しい項目は後ろに足す（役の `displayOrder` は今の最大値＋1）
- 外したり足したりして `_2` などが繰り上がる場合は、残す項目に今の ID を `id` として書いて固定する

### main と比べる検査

`npm run check:base`（PR の CI でも実行）で、次を main と比べて確かめる。`npm run validate` は main を読まないので、こちらで見る。

- アプリが作る ID が変わっていないか、`removed` に記録せずに消えた項目がないか
- `kept-single-source` は main にある項目にだけ使い、採用値と機種ファイルの値が main の値そのものか
- main にある項目の `provisional-chonborista` は、ちょんぼりすたの値が main の値と一致しないときだけか（一致するなら `kept-single-source`）
```

- [ ] **Step 7: `docs/CONTRIBUTING.md` を変える**

(a) 置き換える前:

```markdown
テンプレート生成時にコンソールに出力されるエントリを `machines/index.json` の `machines` 配列に追加します。
```

置き換えた後:

```markdown
テンプレート生成時にコンソールに出力されるエントリを `machines/index.json` の `machines` 配列に追加します。

### 3-2. 出典記録を作る

`provenance/{id}.json` に、出典（URL と取得日）と項目ごとの値を記録します。形は [data-format.md](data-format.md) の「provenance（出典記録）」、採否の基準は [quality-standards.md](quality-standards.md) の「出典と採否の基準」を見てください。
```

(b) 置き換える前:

```bash
npm run validate   # スキーマ・確率値・演出のバリデーション
npm test           # テスト実行
```

置き換えた後:

```bash
npm run validate   # スキーマ・確率値・演出・出典記録のバリデーション
npm test           # テスト実行
npm run check:base # main と比べる（アプリが作る ID・採否ルール）
```

(c) `git add machines/{dir}/{id}.json machines/index.json` を `git add machines/{dir}/{id}.json machines/index.json provenance/{id}.json` に置き換える。

(d) 置き換える前:

```markdown
既存の機種データを修正する場合は、以下のルールに従ってください。
```

置き換えた後:

```markdown
既存の機種データを修正する場合は、以下のルールに従ってください。

値を変えたら `provenance/{id}.json` も直します。既存の項目の名前と `displayOrder` は変えないでください（アプリが作る ID が変わり、利用者の記録とのつながりが切れます）。
```

(e) 置き換える前:

```markdown
- [ ] 確率値を2サイト以上でクロスチェック済み
```

置き換えた後:

```markdown
- [ ] 確率値を2サイト以上でクロスチェック済み
- [ ] `provenance/{id}.json` があり、出典記録バリデーションがエラー0件
- [ ] `npm run check:base` が問題なし
```

(f) 置き換える前:

```markdown
- [ ] 修正理由がコミットメッセージに記述されている
```

置き換えた後:

```markdown
- [ ] 修正理由がコミットメッセージに記述されている
- [ ] `provenance/{id}.json` を更新し、出典記録バリデーションがエラー0件
- [ ] `npm run check:base` が問題なし
```

- [ ] **Step 8: `docs/data-provenance-proposal.md` に採用を書く**

置き換える前:

```markdown
# 出典（provenance）の恒久対策 — 提案 / 2026-08-17（rev2）
```

置き換えた後:

```markdown
# 出典（provenance）の恒久対策 — 提案 / 2026-08-17（rev2）

> **2026-09-26 採用**: 案E を変形した「別ファイル方式」で実装した（出典記録は機種ファイルの外、`provenance/<機種ID>.json` に置く）。仕様は `docs/superpowers/specs/2026-09-26-data-expansion-design.md` の5章。以下は検討時の記録。
```

- [ ] **Step 9: `README.md` を変える**

(a) ファイル構造。置き換える前:

```
├── schemas/
│   ├── machine.schema.json     # 機種データJSONスキーマ
│   └── index.schema.json       # インデックスJSONスキーマ
├── scripts/
│   ├── validate.mjs            # バリデーション実行
```

置き換えた後:

```
├── provenance/
│   └── {machine-id}.json       # 出典記録（項目ごとの出典・取得日・値）
├── schemas/
│   ├── machine.schema.json     # 機種データJSONスキーマ
│   ├── index.schema.json       # インデックスJSONスキーマ
│   └── provenance.schema.json  # 出典記録JSONスキーマ
├── scripts/
│   ├── validate.mjs            # バリデーション実行
│   ├── check-against-base.mjs  # main と比べる検査（アプリが作るID・採否ルール）
```

(b) バリデーション。`npm test                  # テスト実行（vitest）` の次の行に足す:

```bash
npm run check:base        # main と比べる（アプリが作るID・採否ルール）
```

(c) 品質指標。`npm run quality` を実行し、表の値をその出力に合わせる。見出しの日付を実行日に変え、`voiceCounts` の行の次に出典記録の行を足す（段階0では0台）:

```markdown
| provenance（出典記録） | 0% (0/149台)     |
```

(d) 品質指標の節の `> 🔴 **`source` 100% は「全機種で出典を追試できる」という意味ではない**` で始まる引用のまとまりの直後に、1行足す:

```markdown
> 2026-09-26 から、出典は `provenance/` に項目ごとに記録する（段階的に全機種へ広げる）。
```

- [ ] **Step 10: `CHANGELOG.md` に記録する**

`slot-analyzer-data の変更履歴。iOS SlotAnalyzer アプリとの互換性情報を含む。` の次に足す:

```markdown

## [Unreleased] - 段階0: 出典記録の仕組み

データ（`machines/`）と `index.json` の version（3.8.0）は変えていない。公開中のアプリへの影響はない。

### Added
- `provenance/<機種ID>.json`（出典記録）と `schemas/provenance.schema.json`
- `scripts/lib/provenance.mjs`: 値の比較（分母 0.1%・割合 0.1 ポイント・設定の組）、有効数字6桁への変換、採否ルール
- `scripts/validators/provenance-validator.mjs`: `npm run validate` の6番目の検査。`--require-provenance` で全機種に必須（段階3で有効化）
- `scripts/check-against-base.mjs` と `npm run check:base`: main と比べて、アプリが名前から作る ID（役・ゾーン・終了画面）が変わっていないか、見直し前の値が要る採否ルール（`kept-single-source`・`provisional-chonborista` の使い方）を守っているかを確かめる。PR の CI でも実行
- 品質レポートに「provenance (出典記録)」の行

### Changed
- CI: checkout を全履歴にし、PR で main と比べる検査（ID・採否ルール）を実行する
- 文書: data-format / quality-standards / CONTRIBUTING / README に出典記録と ID の規則を追記。出典対策の提案書（案E）を「別ファイル方式」で採用と明記
- 2026-08-16〜17 の文書修正（README・FUTURE_ADDITIONS・品質基準・出典対策の提案書）を main へ反映
```

- [ ] **Step 11: 全体を確かめる**

Run: `npx prettier --write scripts/quality-report.mjs tests/integration.test.mjs && npx eslint . && npx vitest run && npm run -s validate | tail -4`
Expected: eslint が何も出力しない。vitest がすべて PASS。`合計: エラー 0件 / 警告 0件`

- [ ] **Step 12: コミット**

```bash
git add scripts/quality-report.mjs tests/integration.test.mjs docs/data-format.md docs/quality-standards.md docs/CONTRIBUTING.md docs/data-provenance-proposal.md README.md CHANGELOG.md
git commit -m "docs: 出典記録と ID の規則を文書化し、品質レポートに出典記録の行を追加

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 関門を通して PR を出し、マージする

**Files:** なし（検証・PR・マージ）

本人の承認（2026-09-25「検証後にマージまで任せる」）の範囲で行う。どれかで落ちたら直して、Step 1 からやり直す。

- [ ] **Step 1: CI と同じ検査をすべて通す**

Run:

```bash
npm run -s validate | tail -4
npx vitest run 2>&1 | tail -5
npx eslint . && echo "eslint OK"
npx prettier --check "scripts/**/*.mjs" "tests/**/*.mjs" "*.mjs"
npm run -s quality | grep -E "provenance|Complete|Provisional|Incomplete"
npm run -s check:base
```

Expected: `合計: エラー 0件 / 警告 0件`、vitest がすべて PASS（件数を記録する）、`eslint OK`、`All matched files use Prettier code style!`、`provenance (出典記録)   0/149`、Complete 146 / Provisional 3 / Incomplete 0（段階0の前と同じ）、`問題なし: 既存の ID は基準と同じで、出典記録は基準の値に照らして採否ルールどおりです`

- [ ] **Step 2: カバレッジのしきい値を確かめる**

Run: `npx vitest run --coverage 2>&1 | tail -25`
Expected: しきい値（statements 80・branches 70・functions 80・lines 80）を下回らない。新しいファイル（`scripts/lib/provenance.mjs`・`scripts/lib/derived-ids.mjs`・`scripts/lib/load-provenance.mjs`・`scripts/validators/provenance-validator.mjs`）の行カバレッジを記録する

- [ ] **Step 3: 別の Node でもテストを通す**

Run: `fnm exec --using 24 -- npx vitest run 2>&1 | tail -4`
Expected: PASS（CI の Node 22 は PR の CI で確かめる）

- [ ] **Step 4: データが変わっていないことを確かめる**

Run: `git diff --stat origin/main -- machines/ && echo "--- ここより上に何も無ければデータは不変"`
Expected: `machines/` について差分が0（`machines/FUTURE_ADDITIONS.md` だけは8月の文書修正で差分が出る。それ以外が無いこと）

- [ ] **Step 5: アプリの取り込みテストを通す**

Run（slot-analyzer-ios で。サンドボックスの外）:

```bash
cd ~/second-brain/pachinko-tools/slot-analyzer-ios && SLOT_DATA_ROOT="$HOME/.worktrees/slot-analyzer-data/data-expansion-p0" npm run -s test:data-contract 2>&1 | tail -5
```

Expected: `Tests: 150 passed, 150 total`

- [ ] **Step 6: push して PR を出す**

```bash
git push -u origin feature/data-expansion-p0-provenance
```

PR の本文を `$TMPDIR/pr-body.md` に書く。Step 1〜5 の実際の出力（件数）を「検証」に入れる:

```markdown
## 概要

機種データ拡充の段階0（出典記録の仕組み）。仕様: `docs/superpowers/specs/2026-09-26-data-expansion-design.md`

**データ（`machines/` の機種ファイルと `index.json`）と version（3.8.0）は変えていません。公開中のアプリへの影響はありません。**

## 変更

- 出典記録 `provenance/<機種ID>.json` とスキーマ
- 値の比較（分母 0.1%・割合 0.1 ポイント・設定の組）、有効数字6桁への変換、採否ルール
- `npm run validate` の6番目の検査（出典記録）。`--require-provenance` で全機種に必須（段階3で有効化）
- main と比べる検査（`npm run check:base`: アプリが名前から作る ID・見直し前の値が要る採否ルール）。この PR から CI でも実行
- 品質レポートに出典記録の行
- 文書（data-format・quality-standards・CONTRIBUTING・README・CHANGELOG）と、8月16〜17日の文書修正

## 検証

- `npm run validate`: （出力）
- `npx vitest run`: （件数）
- ESLint / Prettier: （結果）
- カバレッジ: （新しいファイルの行カバレッジ）
- `npm run check:base`: （結果）
- iOS 取り込みテスト（build 15 のソース）: （件数）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

```bash
gh pr create --repo HiroyukiTakeda-iwmm/slot-analyzer-data --base main --head feature/data-expansion-p0-provenance --title "feat: 出典記録の仕組みと main と比べる検査（データ拡充 段階0）" --body-file "$TMPDIR/pr-body.md"
```

Expected: PR の URL が表示される

- [ ] **Step 7: CI を待って確かめる**

Run: `gh pr checks <PR番号> --repo HiroyukiTakeda-iwmm/slot-analyzer-data --watch --interval 20`
Expected: validate ジョブが pass

Run: `gh run view <run ID> --repo HiroyukiTakeda-iwmm/slot-analyzer-data --json jobs --jq '.jobs[].steps[] | [.name, .conclusion] | @tsv'`
Expected: `基準（main）との比較（PR のみ）	success` を含む（ステップが実際に走ったこと）

- [ ] **Step 8: マージする**

Run: `gh pr merge <PR番号> --repo HiroyukiTakeda-iwmm/slot-analyzer-data --merge`
Expected: マージ完了の表示

- [ ] **Step 9: 読み戻す**

```bash
cd ~/second-brain/pachinko-tools/slot-analyzer-data && git fetch origin && git log --oneline -1 origin/main
curl -s https://raw.githubusercontent.com/HiroyukiTakeda-iwmm/slot-analyzer-data/main/machines/index.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['version'], len(d['machines']))"
curl -s -o /dev/null -w "%{http_code}\n" https://raw.githubusercontent.com/HiroyukiTakeda-iwmm/slot-analyzer-data/main/schemas/provenance.schema.json
gh run list --repo HiroyukiTakeda-iwmm/slot-analyzer-data --branch main --limit 1
```

Expected: origin/main がマージコミット、`3.8.0 149`（データ不変）、`200`（raw の反映が遅いときは数分おいて読み直す）、main の CI が success

- [ ] **Step 10: 記録と片付け**

```bash
~/.harness/bin/ledger-note.sh "slot-analyzer-data 段階0 マージ（PR #<番号>）: 出典記録の仕組み・main と比べる検査（ID・採否ルール）。データ不変(3.8.0/149)。次: 新台の洗い出し→段階1の計画"
git -C ~/second-brain/pachinko-tools/slot-analyzer-data worktree remove ~/.worktrees/slot-analyzer-data/data-expansion-p0
```

Expected: 台帳に1行。worktree を消す前に `git -C ~/.worktrees/slot-analyzer-data/data-expansion-p0 status --short` が空であること

---

### Task 8: 実機の準備（サブの iPhone に TestFlight の build 15）

**Files:** なし（端末の操作）

Task 1〜7 とは独立。iPhone が空いているときに行う。

- [ ] **Step 1: 他のセッションと調整する**

`ListAgents` で稼働中のセッションを確かめる。焼売など iPhone ミラーリングを使いそうなセッションがあれば、`SendMessage` で「SlotAnalyzer の確認で iPhone ミラーリング（iWphone-sub）を15分ほど使います。使用中なら教えてください」と送る。使用中と返事があれば、終わるまで待つ

- [ ] **Step 2: iPhone ミラーリングを開く**

computer-use で `request_access`（アプリ: iPhone Mirroring）→ `open_application` → スクリーンショットで状態を見る。つながっていない（iPhone が近くにない・ロックされていない など）ときは、画面の表示を本人に伝えて止める

- [ ] **Step 3: TestFlight から build 15 を入れる**

iPhone の TestFlight → SlotAnalyzer → 版が `1.0 (15)` であることと、表示されたサイズを記録してから「インストール」。操作するのは TestFlight と SlotAnalyzer だけ（購入・設定の変更・他のアプリには触らない）

- [ ] **Step 4: 公開データの同期を確かめる（基準値）**

SlotAnalyzer を開く → オンボーディングは「スキップ」→ 機種一覧 →「公開機種から追加」で一覧が出ること、同期の処理件数・成功件数が 149 であることを確かめ、アプリの画面だけを撮る

- [ ] **Step 5: URL からの取り込みを確かめる（マージ前確認の経路）**

機種の読み込み画面の URL 欄に `https://raw.githubusercontent.com/HiroyukiTakeda-iwmm/slot-analyzer-data/main/machines/galfy/galfy.json` を入れて取り込む →「LBスロット GALFY を追加しました」→ 確率一覧で BIG が設定1 `1/295.2`・設定6 `1/277.7` と表示されること（今の main の値）

- [ ] **Step 6: 解放と記録**

iPhone ミラーリングの操作を終え、Step 1 で声をかけたセッションに「使い終わりました」と送る。台帳に1行残す（`ledger-note.sh "SlotAnalyzer 実機準備: iWphone-sub に TestFlight 1.0(15)。同期149・URL取り込みOK"`）。つまずいた点（ミラーリングの接続など）があれば記憶に残す

---

### Task 9: 新台の洗い出し（段階1の計画の材料）

**Files:** なし（調べるだけ。結果は段階1の計画に書く）

Task 1〜7 とは独立。読み取りだけなので並行して進めてよい。

- [ ] **Step 1: 導入日の一覧を2系統で集める**

ちょんぼりすたの新台一覧（導入日つき）と、P-WORLD などもう1つの一覧から、2026-06-01〜2026-09-25 に導入されたパチスロを集める。機種ごとに、機種名・メーカー・導入日・ちょんぼりすたの解析ページの URL・2つ目の出典の URL を記録する

- [ ] **Step 2: 除外と照合**

パチンコ、登録済み（`machines/index.json` の name と照合）、実在しない機種を除く。2つの一覧で導入日が食い違う機種は印を付ける

- [ ] **Step 3: 解析の出そろい具合を見る**

各機種について、ちょんぼりすたに設定差のある数値（小役・ボーナス・示唆）が載っているかを「多い・一部・なし」で分ける

- [ ] **Step 4: 本人に報告する**

台数、機種の一覧（導入日順）、解析の出そろい具合、BIRDIE WING とからくりサーカス2 の状態をまとめて報告し、段階1で入れる範囲を確認する。この結果を段階1の計画（`docs/superpowers/plans/` に新しく作る）の材料にする

---

## 段階1以降について

この計画は段階0だけを扱う。段階1（新台と暫定9機種）、段階2（既存の見直し）、段階3（出典記録の必須化）は、段階0の道具（`decideNewItem`・`decideExistingItem`・`validateProvenance`・`check:base`）と Task 9 の結果をもとに、それぞれ別の計画を書く。
