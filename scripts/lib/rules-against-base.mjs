import { UNRECORDED_REMOVAL, hasItemId, removedKeysByMachine } from './derived-ids.mjs';
import { expandEndScreenPatterns } from './expand-patterns.mjs';
import {
  itemKey,
  listMachineItems,
  machineSupporters,
  machineValue,
  storedMap,
  valuesEqual,
} from './provenance.mjs';

const KEPT = 'kept-single-source';
const PROVISIONAL = 'provisional-chonborista';

/** オブジェクトのキーを並べ替えた形（JSON として同じかを、キーの順によらず比べるため）。配列の順は変えない */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

/** JSON として同じか（オブジェクトのキーの順は問わない） */
export function sameJson(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** index.json の機種を機種 ID で引けるようにする（read はリポジトリからの相対パスを読む関数） */
export function indexById(read) {
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
 * main の機種の項目を項目キーで引けるようにする。main の機種は、最上位の終了画面の patterns をアプリが読む形
 * （パターンごとの普通の終了画面。expandEndScreenPatterns）に書き直してから並べる（raw は書き直した後の項目）。
 * 同じ PR で patterns を書き直した終了画面を外す・残すとき、比べる側の項目の名前と値は書き直した後の形なので、
 * main も同じ計算で書き直して比べる（書き直しは決まった計算なので、道具で書き直した項目と JSON として同じになる）。
 * patterns の親は並ばない（アプリは親を読まない）。main が書き直せない形なら例外を投げる（CLI は終了コード 2 にする）。
 * main と比べる検査のうち、main の項目の値や中身を見るもの（採否ルールと removed）がこれを使う。
 *
 * @param {object} machine main の機種ファイルの中身
 * @returns {Map<string, { kind: string, name: string, entry: object, raw: object }>}
 */
export function baseMachineItems(machine) {
  const expanded = expandEndScreenPatterns(machine).machine;
  return new Map(listMachineItems(expanded).map((item) => [itemKey(item.kind, item.name), item]));
}

/**
 * main の provenance/ にある出典記録を読む。比べる側で記録のファイルごと消した場合も見つけるため、
 * 比べる側の記録からでなく main を列挙する。読めなければ例外を投げる（CLI は終了コード 2 にする）
 * @param {(path: string) => string} readBase
 * @param {(dir: string) => string[]} listBase
 * @returns {Array<object | null>}
 */
export function loadBaseRecords(readBase, listBase) {
  return listBase('provenance')
    .filter((path) => path.endsWith('.json'))
    .map((path) => {
      try {
        return JSON.parse(readBase(path));
      } catch (e) {
        throw new Error(`main の出典記録を読めない: ${path}: ${e.message}`, { cause: e });
      }
    });
}

/** main の出典記録の項目を、機種 ID ごとにまとめる（同じ機種の記録が複数あれば合わせる） */
function recordItemsByMachine(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record) continue;
    byId.set(record.machineId, [...(byId.get(record.machineId) ?? []), ...(record.items ?? [])]);
  }
  return byId;
}

/**
 * マージ済みの採用か。main の同じ機種の記録に、JSON として同じ項目（kind・name・unit・status・adopted・values・
 * reread のすべて）があり、機種ファイルの値（unit の形の値）も main と同じなら、main に入れたときに採否の確かめを
 * 通った採用なので、確かめ直さない。確かめ直すと、main の値が入れた暫定の値になっているので、ちょんぼりすたの値が
 * main の値を裏づけて、関係ない PR が止まる（最終レビュー C1）。
 * どちらかの機種ファイルに項目が無いか、unit で表せない値（null）なら、確かめる側に倒す
 */
function mergedAdoption(item, baseRecordItems, baseItem, headItem) {
  if (!baseItem || !headItem) return false;
  if (!baseRecordItems.some((recorded) => sameJson(recorded, item))) return false;
  const baseValue = machineValue(baseItem.entry, item.unit);
  return baseValue !== null && sameJson(baseValue, machineValue(headItem.entry, item.unit));
}

/**
 * main の値を裏づける出典があるか（既存の値の規則2「残す」の裏づけと同じ数え方。仕様 5.5）。
 * 数値の unit では、main の機種ファイルの確率の幅と、出典の値に載っている設定だけを比べる（一部だけの出典も数える）。
 * 設定の組・有無の unit では、main の値と組・有無で比べる（machineSupporters）。
 */
function supportedByBase(item, baseEntry, baseValue) {
  const machine = { stored: storedMap(baseEntry), current: baseValue };
  return machineSupporters(item.unit, item.values ?? {}, machine).length >= 1;
}

/**
 * 採否ルール（仕様 5.5）のうち、見直し前の値（main）が要るものを確かめる（仕様 5.7）。
 * validate（出典記録の検証器と statusError）は main を読まないので、次をここで見る。
 * - kept-single-source は main にある項目にだけ使う。採用値は main の値そのもの（丸めの幅の重なりによる一致は
 *   推移しないので、完全一致で結ぶ）で、機種ファイルの値も main から変えない（「残す」は値を変えないこと）
 * - main にある項目の provisional-chonborista は、main の値を裏づける出典（ちょんぼりすた以外・一部だけの出典も
 *   含む）が無いときだけ使う（あれば既存の値の順「確定 → 残す → 暫定 → 外す」で規則2の kept-single-source が
 *   先に当たる。数え方は「残す」の判断と同じ）
 * 確かめるのは、記録か機種ファイルの値が main から変わった項目と、新しい項目だけ（mergedAdoption。main の記録は
 * main の provenance/ を列挙して読む）。main の項目は、終了画面の patterns を書き直した形で比べる（baseMachineItems）。
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   listBase: (dir: string) => string[], provenanceFiles: Array<{ data: object | null }> }} io
 *   readBase / readHead はリポジトリからの相対パスを受け取り、中身を返す。listBase は main のフォルダ直下の
 *   ファイルのパス（リポジトリからの相対）を返す。どれも読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkRulesAgainstBase({ readBase, readHead, listBase, provenanceFiles }) {
  const baseById = indexById(readBase);
  const headById = indexById(readHead);
  const baseRecordItems = recordItemsByMachine(loadBaseRecords(readBase, listBase));
  const problems = [];
  for (const file of provenanceFiles) {
    const record = file.data;
    if (!record) continue; // 読めなかった記録は validate が報告する
    const items = (record.items ?? []).filter(
      (item) => item.status === KEPT || item.status === PROVISIONAL
    );
    if (items.length === 0) continue;

    const id = record.machineId;
    const baseEntry = baseById.get(id);
    const baseItems = baseEntry
      ? baseMachineItems(JSON.parse(readBase(`machines/${baseEntry.file}`)))
      : new Map();
    const headItems = itemsByKey(readHead, headById.get(id));
    const recorded = baseRecordItems.get(id) ?? [];
    for (const item of items) {
      const key = itemKey(item.kind, item.name);
      const baseItem = baseItems.get(key);
      const headItem = headItems.get(key);
      if (mergedAdoption(item, recorded, baseItem, headItem)) continue;
      const baseValue = baseItem ? machineValue(baseItem.entry, item.unit) : null;

      if (item.status === PROVISIONAL) {
        if (baseItem && supportedByBase(item, baseItem.entry, baseValue)) {
          problems.push(
            `${id}: ${key}: main の値を裏づける出典がある（規則2の kept-single-source にする）`
          );
        }
        continue;
      }

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

/**
 * ID を持たない項目（明示の id の無い確定演出・試行成功率・ボイスなどと、特殊設定）が、出典記録の removed に書かれずに
 * 消えていないかを確かめる（仕様 5.5 の規則4「外す（removed に前の値と理由を残す）」を機械で守る）。
 * 基準と比べる側の両方の index.json にある機種ごとに、listMachineItems の項目キーで比べる。
 * ID を持つ項目（hasItemId）は checkDerivedIds が同じ文面（UNRECORDED_REMOVAL）で、
 * index.json から消えた機種も checkDerivedIds が報告するので、ここでは見ない（二重に出さない）。
 * 終了画面は ID を持つ種類なので、main の patterns は書き直さずに並べる（baseMachineItems を使わない。
 * 書き直せない main の機種で、関係ない PR まで比べられなくならないように）。
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   provenanceFiles: Array<{ data: object | null }> }} io checkRulesAgainstBase と同じ
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkRemovedItems({ readBase, readHead, provenanceFiles }) {
  const removedById = removedKeysByMachine(provenanceFiles);
  const headById = indexById(readHead);
  const problems = [];
  for (const [id, baseEntry] of indexById(readBase)) {
    const headEntry = headById.get(id);
    if (!headEntry) continue;
    const headItems = itemsByKey(readHead, headEntry);
    const removed = removedById.get(id) ?? new Set();
    for (const [key, item] of itemsByKey(readBase, baseEntry)) {
      if (hasItemId(item.kind, item.raw) || headItems.has(key) || removed.has(key)) continue;
      problems.push(`${id}: ${key}: ${UNRECORDED_REMOVAL}`);
    }
  }
  return problems;
}

/**
 * 新しく足した機種（比べる側の index.json にあって、基準の index.json に無い機種）に、出典記録が
 * あるかを確かめる（新しく入れる値は、仕様 5.5 の採否ルールを通してから入れる）。
 * 記録は、パスが provenance/<機種ID>.json のもの、または machineId がその機種 ID のもの。
 * 中身は validate が確かめるので、ここでは有無だけを見る（壊れた記録も「ある」と数える）。
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   provenanceFiles: Array<{ path?: string, data: object | null }> }} io checkRulesAgainstBase と同じ
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkNewMachineRecords({ readBase, readHead, provenanceFiles }) {
  const baseById = indexById(readBase);
  const hasRecord = (id) =>
    provenanceFiles.some(
      (file) => file.path === `provenance/${id}.json` || file.data?.machineId === id
    );
  return [...indexById(readHead).keys()]
    .filter((id) => !baseById.has(id) && !hasRecord(id))
    .map((id) => `${id}: 新しく足した機種に出典記録（provenance/${id}.json）が無い`);
}
