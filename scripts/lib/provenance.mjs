/**
 * 出典記録（provenance）の判定に使う純粋関数。
 *
 * 仕様: docs/superpowers/specs/2026-09-26-data-expansion-design.md の5章。
 *
 * 値の表し方（unit）:
 *   - denominator: 設定ごとの分母（1/x の x）。小役・ボーナスなどの確率。% で表示された値は "3.1%" と書ける
 *   - percent: 設定ごとの割合（0〜100）。試行成功率・移行率など
 *   - settings: 確定・否定する設定の組 { confirmed: [...], excluded: [...] }
 *   - presence: 数値を持たない項目。出典に載っていること自体を確かめる（値は true）
 *
 * 分母・割合の値は、出典の表示の桁のまま書く（数か、末尾の 0 を残す文字列 "300.0"）。値どうしは、表示の
 * 最後の桁の半分の幅（丸めの幅）を確率に直し、すべての設定で幅が重なるかで比べる。機種ファイルの確率は、
 * 小数6桁より粗くないとみなした幅で比べる（仕様 5.4）。
 *
 * 項目の種類（kind）と unit の一覧は schemas/provenance.schema.json が正本。
 */

/** ちょんぼりすたの出典キー。単独の値を暫定で採用できるのはこの出典だけ（仕様 5.5） */
export const CHONBORISTA_KEY = 'chonborista';

/** zoneRole・endScreenGroupItem の名前で、親と子を区切る文字列 */
export const NAME_SEPARATOR = '::';

/** 機種ファイルの確率は、小数6桁より粗くないとみなす（末尾の 0 は JSON で消えるため、表示の桁では決めない） */
export const STORED_MIN_DECIMALS = 6;

/** 区間の端がちょうど接するときに、浮動小数点の誤差で落ちないための余裕（確率の絶対値） */
const OVERLAP_EPSILON = 1e-12;

/** 出典の値として書ける文字列（表示の桁を残した数か、% 付きの割合） */
const SHOWN_TEXT = /^(0|[1-9]\d*)(\.\d+)?%?$/;

/** 保存する確率・割合の有効数字（小数6桁ではない。仕様 5.6） */
const STORED_SIGNIFICANT_DIGITS = 6;

export function itemKey(kind, name) {
  return `${kind}${NAME_SEPARATOR}${name}`;
}

/** 数値の unit（分母・割合）か。この unit の値は丸めの幅で比べ、機種ファイルの確率と照らす */
export function isNumericUnit(unit) {
  return unit === 'denominator' || unit === 'percent';
}

// ================================================================
// 丸めの幅（仕様 5.4）
// ================================================================

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

/** 設定ごとの値の表で、すべての値を unit の値として読めるか（空の表・配列は読めない） */
function isShownMap(unit, value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((v) => parseShown(unit, v) !== null)
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
      return isShownMap('denominator', value)
        ? null
        : '設定ごとに、1 以上の分母（数か、表示の桁を残した文字列）、% 付きの割合、または確率 0 を表す null が必要';
    case 'percent':
      return isShownMap('percent', value)
        ? null
        : '設定ごとに、0〜100 の割合（数か、表示の桁を残した文字列）が必要';
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
 * 分母・割合は、設定の組が同じで、すべての設定で丸めの幅が重なれば一致する。確率 0（分母の null・割合の 0）は、
 * 「その設定では起きない」（設定を否定できる）を表すので、確率 0 とだけ一致する。
 */
export function valuesAgree(unit, a, b) {
  if (shapeError(unit, a) !== null || shapeError(unit, b) !== null) return false;
  switch (unit) {
    case 'denominator':
    case 'percent':
      return (
        sameKeys(a, b) &&
        Object.keys(a).every((k) =>
          intervalsOverlap(parseShown(unit, a[k]), parseShown(unit, b[k]))
        )
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

/** 表示の値を、機種ファイルに保存する確率（有効数字6桁）にする */
export function toStoredFromShown(unit, raw) {
  if (raw === null) return 0;
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (text.endsWith('%') || unit === 'percent') return toStoredRate(Number(text.replace(/%$/, '')));
  return toStoredProbability(Number(text));
}

/** 項目の設定ごとの数値（`probabilities`、無ければ `rates`） */
function numericMap(entry) {
  return entry.probabilities ?? entry.rates ?? null;
}

/** 項目の確率（listMachineItems の entry を渡す。最上位の終了画面の distribution はそこで渡し直している） */
export function storedMap(entry) {
  return numericMap(entry);
}

/**
 * 出典などの値が、機種ファイルの確率と一致するか。partial では、値に載っている設定だけを比べる
 * （既存の値の「残す」の裏づけ。本人の決定 2026-09-27）。値の設定がすべて機種ファイルにあり、1つ以上あること。
 */
export function agreesWithStored(unit, value, stored, { partial = false } = {}) {
  if (shapeError(unit, value) !== null || stored === null || typeof stored !== 'object') {
    return false;
  }
  const keys = Object.keys(value);
  const keysOk = partial
    ? keys.length > 0 && keys.every((k) => Object.hasOwn(stored, k))
    : sameKeys(value, stored);
  return (
    keysOk &&
    keys.every((k) => intervalsOverlap(parseShown(unit, value[k]), storedInterval(stored[k])))
  );
}

/** 機種ファイルの確率を裏づける出典のキー（partial で数える） */
export function storedSupporters(unit, values, stored) {
  return Object.keys(values).filter((key) =>
    agreesWithStored(unit, values[key], stored, { partial: true })
  );
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

/**
 * 機種ファイルの項目の値を、出典記録と同じ unit の形にする。denominator では、確率 0 の設定を null にする。
 * entry は `listMachineItems` の項目の entry を渡す（最上位の終了画面の `distribution` は、そこで確率として渡し直している）。
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
 * - patterns 形式（アプリは終了画面の patterns を別々の終了画面に展開する）は、出典記録の形を
 *   段階1で決めるまで記録できない（空の配列を返す）
 * - 役（role・zoneRole）は denominator
 * - ほかの数値（probabilities / rates）の項目は、0 でない値がすべて 10% 以上なら
 *   denominator か percent、それ以外は denominator（割合の丸めの幅は、小さい値には値に比べて広すぎるため。
 *   0.4% と書くと 0.35〜0.45%）。最上位の終了画面の distribution は、listMachineItems が probabilities として渡す
 * - 数値が無く、確定・否定の設定があれば settings。どちらも無ければ presence
 * 数値と設定の組の両方がある項目は、数値の側で決める。
 * @returns {string[]}
 */
export function allowedUnits(kind, entry) {
  if (Array.isArray(entry.patterns) && entry.patterns.length > 0) return [];
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
 * 項目の元の名前（`親::子` に組み立てる前の名前）を確かめて返す。
 * 名前に「::」があると、項目キーの親と子の切れ目や、ID が重なってはいけない範囲が分からなくなり、
 * 別々の項目を取り違えても気づけないので、例外を投げる。
 * @param {string} kind 種類（ゾーンは zone、終了画面グループは endScreenGroup）
 * @returns {unknown} name そのもの
 */
export function plainName(kind, name) {
  if (typeof name === 'string' && name.includes(NAME_SEPARATOR)) {
    throw new Error(`項目の名前に「${NAME_SEPARATOR}」は使えない: ${kind} ${name}`);
  }
  return name;
}

/**
 * 機種ファイルの中で、出典記録の対象になる項目を並べる（仕様 5.4）。
 * 同じ種類で同じ名前の項目は、createNameDisambiguator で `#2` などを付けた名前にする。
 * 元の名前（役・ゾーン・終了画面・グループ・そのほかの項目の名前）に「::」があれば例外を投げる（plainName）。
 */
export function listMachineItems(machine) {
  const items = [];
  const disambiguate = createNameDisambiguator();
  // 子（ゾーン内の役・グループ内の終了画面）の名前は「親::子」にする
  const add = (kind, entry, parent) => {
    const name = plainName(kind, entry.name);
    const full = parent === undefined ? name : `${parent}${NAME_SEPARATOR}${name}`;
    items.push({ kind, name: disambiguate(kind, full), entry });
  };

  for (const r of machine.roles ?? []) add('role', r);
  for (const z of machine.zones ?? []) {
    const zone = plainName('zone', z.name);
    for (const r of z.roles ?? []) add('zoneRole', r, zone);
  }
  for (const e of machine.confirmationEvents ?? []) add('confirmationEvent', e);
  for (const s of machine.endScreens ?? []) {
    // アプリの移行処理（migrate-v1-to-v2.mjs の buildEndScreenFromStandard）は、最上位の終了画面だけ
    // distribution を probabilities に改名して使う（グループの中の終了画面は改名しない）。出典記録でも
    // アプリが使う値を照合するので、最上位の終了画面だけ改名した形を渡す（機種ファイルは書き換えない）
    const renamed = s.probabilities == null && s.distribution !== undefined;
    add('endScreen', renamed ? { ...s, probabilities: s.distribution } : s);
  }
  for (const g of machine.endScreenGroups ?? []) {
    const group = plainName('endScreenGroup', g.name);
    for (const s of g.endScreens ?? []) add('endScreenGroupItem', s, group);
  }
  for (const v of machine.voiceCounts ?? []) add('voiceCount', v);
  for (const m of machine.musicCounts ?? []) add('musicCount', m);
  for (const e of machine.effectCounts ?? []) add('effectCount', e);
  for (const t of machine.trialSuccessRates ?? []) add('trialSuccessRate', t);
  for (const t of machine.modeTransitions ?? []) add('modeTransition', t);
  if (machine.specialSettings && Object.keys(machine.specialSettings).length > 0) {
    // 機種に1つだけの項目なので、名前は種類と同じ固定の名前にする
    items.push({
      kind: 'specialSettings',
      name: 'specialSettings',
      entry: machine.specialSettings,
    });
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
 * 2つの値が完全に同じか（丸めの幅で比べない。表示の桁を残した "300.0" と数の 300 も同じでない）。
 * 採用値が、選んだ出典の値そのものかを確かめるのに使う。形が unit に合わない値は同じとみなさない。
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

/**
 * 出典の値が、採用しようとする値と矛盾しないか（2026-09-27）。数値の unit では、出典の値の設定（キー）がすべて
 * 採用値にあり、その設定ごとに丸めの幅が重なること（一部の設定だけの出典も、載っている設定が合えば矛盾しない。
 * 全設定がそろった出典では valuesAgree と同じ）。設定の組・有無の unit では valuesAgree。
 */
function consistentWith(unit, value, adopted) {
  if (!isNumericUnit(unit)) return valuesAgree(unit, value, adopted);
  if (shapeError(unit, value) !== null || shapeError(unit, adopted) !== null) return false;
  return Object.keys(value).every(
    (k) =>
      Object.hasOwn(adopted, k) &&
      intervalsOverlap(parseShown(unit, value[k]), parseShown(unit, adopted[k]))
  );
}

/**
 * adopted と矛盾する値で、2つの出典が一致しているか（＝別の値を支持する組がある）。
 * adopted と矛盾しない出典（載っている設定が合う、一部の設定だけの出典を含む）は、組の候補に数えない。
 */
function hasRivalPair(unit, values, adopted) {
  const others = Object.keys(values).filter((key) => !consistentWith(unit, values[key], adopted));
  return others.some((a, i) =>
    others.slice(i + 1).some((b) => valuesAgree(unit, values[a], values[b]))
  );
}

/**
 * 公式の値、または2サイト以上で一致する値を探す。
 * 公式どうしが食い違うとき、または別の値で2サイトが一致する組があるときは、食い違い（conflict）とする
 * （見つけた値と矛盾しない出典は、別の値の組に数えない。hasRivalPair）。
 * 見つけた値が機種のすべての設定を持つかは見ない（呼ぶ側が決める。decideNewItem・decideExistingItem）。
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
 * 新しく入れる値を採用する。数値の unit では、採用する値が機種のすべての設定の値を持つときだけ入れる
 * （キーの組が機種の設定と同じこと。アプリは設定が1つでも欠けた確率があると推定全体を止める。本人の決定 2026-09-27）。
 */
function adoptNewValue(unit, settings, status, adopted) {
  const complete =
    !isNumericUnit(unit) || sameKeys(adopted, Object.fromEntries(settings.map((s) => [s, true])));
  return complete
    ? { outcome: 'adopt', status, adopted }
    : {
        outcome: 'candidate',
        reason: '全設定の値がそろわない（アプリは設定が1つでも欠けた確率があると推定が止まる）',
      };
}

/**
 * 新しく入れる値の採否（仕様 5.5 前半）。
 * settings は機種の設定（availableSettings、無ければ "1"〜"6"）で、数値の unit（denominator・percent）では必須。
 * 一致（2サイト・公式）は今のまま同じ設定の組どうしで比べるので、一部の設定だけの出典は values に記録しても、
 * 全設定の値の一致には数えない。採用しようとする値と矛盾しない一部の設定だけの出典は、食い違いにも数えない
 * （hasRivalPair）。採用する値に全設定がそろわなければ candidate にする（adoptNewValue）。
 * @param {{ unit: string, values: Record<string, unknown>,
 *   sourceKinds: Record<string, string>, reread?: unknown, settings?: string[] }} input
 * @returns {{ outcome: 'adopt', status: string, adopted: unknown }
 *   | { outcome: 'candidate', reason: string }}
 */
export function decideNewItem({ unit, values, sourceKinds, reread, settings }) {
  if (isNumericUnit(unit) && !Array.isArray(settings)) {
    throw new Error('数値の項目には settings（機種の設定）が必要');
  }
  assertShapes(unit, values, reread);
  const found = findConfirmed(unit, values, sourceKinds);
  if (found?.conflict) return { outcome: 'candidate', reason: 'サイト間で食い違い' };
  if (found) return adoptNewValue(unit, settings, 'confirmed', found.adopted);
  if (isChonboristaOnly(values)) {
    return rereadAgrees(unit, values, reread)
      ? adoptNewValue(unit, settings, 'provisional-chonborista', values[CHONBORISTA_KEY])
      : { outcome: 'candidate', reason: 'ちょんぼりすたのみで、読み直しが無いか一致しない' };
  }
  const count = Object.keys(values).length;
  if (count === 0) return { outcome: 'candidate', reason: '出典なし' };
  if (count === 1) return { outcome: 'candidate', reason: 'ちょんぼりすた以外の1サイトのみ' };
  return { outcome: 'candidate', reason: 'サイト間で食い違い' };
}

/**
 * 今の値を「残す」裏づけになる出典のキー（仕様 5.5 の既存の値の規則2）。
 * 数値の unit では、機種ファイルの確率（stored）の幅と、出典の値に載っている設定だけを比べる（storedSupporters）。
 * 分母に直した値（1 ÷ 確率）の桁では比べない。設定の組・有無の unit では、今の値と一致する出典を数える。
 */
function keptSupporters(unit, values, { current, stored }) {
  return isNumericUnit(unit)
    ? storedSupporters(unit, values, stored)
    : supporters(unit, values, current);
}

/**
 * 既存の項目で、findConfirmed が見つけた値を確定に使えるか（2026-09-27）。数値の unit では、値の設定（キー）が
 * 今の機種ファイルの確率（stored）の設定とそろうこと。機種ファイルの確率は機種のすべての設定を持つので
 * （3.9.0 の validate）、一部の設定だけの値では確定しない。設定の組・有無の unit では常に使える。
 */
function confirmsExisting(unit, value, stored) {
  return !isNumericUnit(unit) || sameKeys(value, stored);
}

/**
 * 既存の値の採否（仕様 5.5 後半）。current は今の機種ファイルの値（unit の形。kept-single-source の採用値）。
 * stored は今の機種ファイルの確率（storedMap の結果）で、数値の unit（denominator・percent）では必須。
 * 一部の設定だけの値は、2サイトや公式で一致しても確定に使わず、見つからなかったものとして「残す」・暫定・外すを決める。
 * @returns {{ outcome: 'adopt', status: string, adopted: unknown }
 *   | { outcome: 'remove', reason: string }}
 */
export function decideExistingItem({ unit, values, sourceKinds, reread, current, stored }) {
  if (isNumericUnit(unit) && stored == null) {
    throw new Error('数値の項目には stored（機種ファイルの確率）が必要');
  }
  assertShapes(unit, values, reread);
  const confirmed = findConfirmed(unit, values, sourceKinds);
  const found =
    confirmed && !confirmed.conflict && !confirmsExisting(unit, confirmed.adopted, stored)
      ? null
      : confirmed;
  if (found && !found.conflict) {
    return { outcome: 'adopt', status: 'confirmed', adopted: found.adopted };
  }
  if (keptSupporters(unit, values, { current, stored }).length >= 1) {
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
 * @param {{ stored?: Record<string, number> | null }} [context] stored は機種ファイルの確率（storedMap の結果）。
 *   数値の unit の kept-single-source で、decideExistingItem と同じく、確定値に使えるか（一部の設定だけの値は
 *   使わない）と裏づけを、機種ファイルの確率で決めるのに使う
 * @returns {string | null} 問題の説明。問題なければ null
 */
export function statusError(item, sourceKinds, { stored } = {}) {
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
      // 数値の unit では、確定値に使えるか（decideExistingItem と同じ）と裏づけの両方に機種ファイルの確率が要る
      if (isNumericUnit(unit) && stored == null) {
        return 'kept-single-source の確かめには機種ファイルの確率が要る';
      }
      if (confirmedValue !== undefined && confirmsExisting(unit, confirmedValue, stored)) {
        return 'kept-single-source は、公式の値や2サイト一致の値が無いときだけ使う（confirmed にする）';
      }
      return keptSupporters(unit, values, { current: adopted, stored }).length >= 1
        ? null
        : 'kept-single-source には、採用値と一致する出典が1つ以上必要';
    default:
      return `未知の status: ${status}`;
  }
}
