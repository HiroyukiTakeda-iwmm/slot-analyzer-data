import { DERIVED_ID_KINDS, removedKeysByMachine } from './derived-ids.mjs';
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

/**
 * ID を持たない種類の項目（確定演出・試行成功率・ボイスなど）が、出典記録の removed に書かれずに
 * 消えていないかを確かめる（仕様 5.5 の規則4「外す（removed に前の値と理由を残す）」を機械で守る）。
 * 基準と比べる側の両方の index.json にある機種ごとに、listMachineItems の項目キーで比べる。
 * ID を作る種類（DERIVED_ID_KINDS）の項目と、index.json から消えた機種は、checkDerivedIds が
 * 同じ文面で報告するので見ない（二重に出さない）。
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
      if (DERIVED_ID_KINDS.has(item.kind) || headItems.has(key) || removed.has(key)) continue;
      problems.push(`${id}: ${key}: 項目が消えたのに、出典記録の removed に無い`);
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
