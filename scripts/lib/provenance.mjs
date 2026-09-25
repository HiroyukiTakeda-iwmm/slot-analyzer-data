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
      return isNumberMap(value) && Object.values(value).every((v) => v > 0)
        ? null
        : '設定ごとの正の分母が必要';
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
  if (typeof denominator !== 'number' || !Number.isFinite(denominator) || denominator <= 0) {
    throw new RangeError(`分母は正の有限数が必要: ${denominator}`);
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
      if (!map || Object.values(map).some((p) => !(p > 0))) return null;
      return mapValues(map, (p) => 1 / p);
    }
    case 'percent': {
      const map = numericMap(entry);
      return map ? mapValues(map, (p) => p * 100) : null;
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
 * 機種ファイルの中で、出典記録の対象になる項目を並べる（仕様 5.4）。
 */
export function listMachineItems(machine) {
  const items = [];
  const add = (kind, name, entry) => items.push({ kind, name, entry });
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
