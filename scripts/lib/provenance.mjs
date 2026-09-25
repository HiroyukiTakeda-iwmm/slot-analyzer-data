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

/** 分母の値: 設定ごとの 1 以上の有限数。確率 0 の設定は null */
function isDenominatorMap(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(
      (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 1)
    )
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
      return isDenominatorMap(value)
        ? null
        : '設定ごとに、1 以上の分母か、確率 0 を表す null が必要';
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

/** 分母どうしが一致するか（差が 0.1% 以内）。確率 0（null）は null とだけ一致する */
function denominatorsAgree(x, y) {
  if (x === null || y === null) return x === y;
  return Math.abs(x - y) / Math.max(x, y) <= DENOMINATOR_TOLERANCE + FLOAT_EPSILON;
}

/**
 * 2つの値が一致するか（仕様 5.4）。形が unit に合わない値は一致しないとみなす。
 */
export function valuesAgree(unit, a, b) {
  if (shapeError(unit, a) !== null || shapeError(unit, b) !== null) return false;
  switch (unit) {
    case 'denominator':
      return sameKeys(a, b) && Object.keys(a).every((k) => denominatorsAgree(a[k], b[k]));
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

/** 分母（1/x の x）を、保存する確率（有効数字6桁）にする。null は確率 0 */
export function toStoredProbability(denominator) {
  if (denominator === null) return 0;
  if (typeof denominator !== 'number' || !Number.isFinite(denominator) || denominator < 1) {
    throw new RangeError(`分母は 1 以上の有限数か、確率 0 を表す null が必要: ${denominator}`);
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
 * 機種ファイルの項目の値を、出典記録と同じ unit の形にする。denominator では、確率 0 の設定を null にする。
 * @returns {object | true | null} unit で表せないときは null
 */
export function machineValue(entry, unit) {
  switch (unit) {
    case 'denominator': {
      const map = numericMap(entry);
      const isProbability = (p) => typeof p === 'number' && p >= 0 && p <= 1;
      if (!map || Object.keys(map).length === 0 || !Object.values(map).every(isProbability)) {
        return null;
      }
      return mapValues(map, (p) => (p === 0 ? null : 1 / p));
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

/** percent で記録できるのは、0 でない確率がすべてこれ以上の項目だけ（仕様 5.4） */
const PERCENT_MIN_PROBABILITY = 0.1;

/**
 * 機種ファイルの項目の種類と中身から、出典記録に使える unit を決める（仕様 5.4）。
 * 記録する側が選べると、緩い比べ方にして値の照合を外せてしまうので、ここで決める。
 * - 役（role・zoneRole）は denominator
 * - ほかの数値（probabilities / rates）の項目は、0 でない値がすべて 10% 以上なら denominator か
 *   percent、それ以外は denominator（割合の 0.1 ポイントの許容差は、小さい値には緩すぎるため）
 * - 数値が無く、確定・否定の設定があれば settings。どちらも無ければ presence
 * 数値と設定の組の両方がある項目は、数値の側で決める。
 * @returns {string[]}
 */
export function allowedUnits(kind, entry) {
  const map = numericMap(entry);
  if (map && Object.keys(map).length > 0) {
    if (kind === 'role' || kind === 'zoneRole') return ['denominator'];
    const nonZero = Object.values(map).filter((p) => p !== 0);
    return nonZero.every((p) => p >= PERCENT_MIN_PROBABILITY)
      ? ['denominator', 'percent']
      : ['denominator'];
  }
  if (machineValue(entry, 'settings') !== null) return ['settings'];
  return ['presence'];
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
      throw new Error(
        `項目の名前を区別できない: ${uniqueKey}（名前に「#数字」を含む項目と重なった）`
      );
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
      return hasRivalPair(unit, values, values[key])
        ? { conflict: true }
        : { adopted: values[key] };
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
    return {
      outcome: 'adopt',
      status: 'provisional-chonborista',
      adopted: values[CHONBORISTA_KEY],
    };
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
