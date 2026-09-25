import { migrateV1ToV2 } from '../migrate-v1-to-v2.mjs';
import { NAME_SEPARATOR, createNameDisambiguator, itemKey, plainName } from './provenance.mjs';

/**
 * アプリが名前から ID を作る種類（項目キーの種類の名前）。ほかの種類（確定演出・ボイスなど）は ID を持たない。
 * main と比べる検査では、この種類の項目の削除を checkDerivedIds が、ほかの種類の項目の削除を
 * checkRemovedItems（rules-against-base.mjs）が確かめる（二重に報告しない）。
 * collectDerivedIds がキーを作る種類と同じであることは、テストで確かめる。
 */
export const DERIVED_ID_KINDS = new Set([
  'role',
  'zone',
  'zoneRole',
  'endScreen',
  'endScreenGroup',
  'endScreenGroupItem',
]);

/**
 * ID を作る種類の項目を、項目キーと同じ単位の名前（子は `親::子`）で並べる。
 * 元の名前に「::」があれば例外を投げる（plainName）。
 *
 * @param {object} machine 機種ファイルの中身（移行前の元の形）か、migrateV1ToV2 の結果
 * @returns {Array<{ kind: string, name: string, entry: object }>}
 */
function listIdItems(machine) {
  const items = [];
  const add = (kind, entry, parent) => {
    const name = plainName(kind, entry.name);
    const full = parent === undefined ? name : `${parent}${NAME_SEPARATOR}${name}`;
    items.push({ kind, name: full, entry });
  };

  for (const role of machine.roles ?? []) add('role', role);
  for (const zone of machine.zones ?? []) {
    add('zone', zone);
    for (const role of zone.roles ?? []) add('zoneRole', role, zone.name);
  }
  for (const screen of machine.endScreens ?? []) add('endScreen', screen);
  for (const group of machine.endScreenGroups ?? []) {
    add('endScreenGroup', group);
    for (const screen of group.endScreens ?? []) add('endScreenGroupItem', screen, group.name);
  }
  return items;
}

/**
 * アプリが名前から作る ID（役・ゾーン・終了画面・終了画面グループ）を、元の項目ごとに集める（仕様 5.8）。
 * アプリと同じ移行処理（migrate-v1-to-v2.mjs は iOS の services/migrations/v1ToV2.ts の移植）を通す。
 * 同じ種類で同じ名前の項目は、出典記録と同じく `#2`、`#3` を付けて区別する。
 * アプリが ID を作る名前（patterns を展開した終了画面の名前も）に「::」があれば例外を投げる。
 *
 * @param {object} machine 機種ファイルの中身
 * @returns {Map<string, string>} 項目キー → ID
 */
export function collectDerivedIds(machine) {
  const ids = new Map();
  const disambiguate = createNameDisambiguator();
  for (const { kind, name, entry } of listIdItems(migrateV1ToV2(machine))) {
    ids.set(itemKey(kind, disambiguate(kind, name)), entry.id);
  }
  return ids;
}

/** 明示の id（アプリの移行処理が名前から作らず、そのまま使う id。migrate-v1-to-v2.mjs と同じ判定） */
function hasExplicitId(entry) {
  return typeof entry.id === 'string' && entry.id.length > 0;
}

/**
 * ID を作る種類で同じ名前の項目のうち、明示の id が無いものを探す（仕様 5.8）。
 * 同じ名前の項目は並び順で `#2` などと区別するので、1つ目を外したとき、2つ目が1つ目の ID を黙って引き継ぐ。
 * 移行後はすべての項目に id があるので、機種ファイルの移行前の元の形で見る。
 *
 * @param {object} machine 機種ファイルの中身（移行前の元の形）
 * @returns {string[]} 問題の説明（1つの名前につき1つ）
 */
function findDuplicateNamesWithoutId(machine) {
  const entriesByKey = new Map();
  for (const { kind, name, entry } of listIdItems(machine)) {
    const key = itemKey(kind, name);
    entriesByKey.set(key, [...(entriesByKey.get(key) ?? []), entry]);
  }
  return [...entriesByKey]
    .filter(([, entries]) => entries.length >= 2 && !entries.every(hasExplicitId))
    .map(([key]) => `${key}: 同じ名前の項目が複数あるので、明示の id を付ける`);
}

/**
 * 出典記録の removed にある項目キーを、機種 ID ごとに集める。読めなかった記録（data: null）は飛ばす
 * （validate が報告する）。
 *
 * @param {Array<{ data: object | null }>} provenanceFiles
 * @returns {Map<string, Set<string>>} 機種 ID → 項目キー
 */
export function removedKeysByMachine(provenanceFiles) {
  const removedById = new Map();
  for (const file of provenanceFiles) {
    if (!file.data) continue;
    const keys = (file.data.removed ?? []).map((removed) => itemKey(removed.kind, removed.name));
    removedById.set(file.data.machineId, new Set(keys));
  }
  return removedById;
}

/** ID が重なってはいけない範囲（項目の種類。ゾーン内の役とグループ内の終了画面は、親ごと） */
function idScope(key) {
  return key.slice(0, key.lastIndexOf(NAME_SEPARATOR));
}

/**
 * 基準の ID が、比べる側でも同じかを確かめる。
 * 新しく足した項目が、基準の別の項目の ID（外した項目の ID など）を使っていないかも確かめる。
 * 利用者の記録は ID でつながっているので、ID を引き継ぐと、外した項目の記録が別の項目に付く。
 * （PR をまたいだ引き継ぎは main と比べるだけでは分からない。段階2で、外した ID を記録して確かめる）
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

  const ownerByScopedId = new Map(
    [...baseIds].map(([key, id]) => [`${idScope(key)}${NAME_SEPARATOR}${id}`, key])
  );
  for (const [key, id] of headIds) {
    if (baseIds.has(key)) continue;
    const owner = ownerByScopedId.get(`${idScope(key)}${NAME_SEPARATOR}${id}`);
    if (owner !== undefined) {
      problems.push(
        `${key}: 新しい項目が、基準の ${owner} の ID（${id}）を使っている（明示の id を付ける）`
      );
    }
  }
  return problems;
}

/**
 * index.json の機種について、アプリが作る ID を確かめる。
 * - 基準の index.json の機種: 基準と比べる（compareDerivedIds）。index.json から消えた機種も報告する
 * - 比べる側の index.json のすべての機種（新しく足した機種も）: 同じ名前の項目に明示の id があるか
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   provenanceFiles: Array<{ data: object | null }> }} io
 *   readBase / readHead はリポジトリからの相対パスを受け取り、中身を返す。読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkDerivedIds({ readBase, readHead, provenanceFiles }) {
  const removedById = removedKeysByMachine(provenanceFiles);
  const baseIndex = JSON.parse(readBase('machines/index.json'));
  const headIndex = JSON.parse(readHead('machines/index.json'));
  // 比べる側の機種ファイルは、比べる側の index.json の場所から読む
  const headMachines = new Map(
    headIndex.machines.map((entry) => [entry.id, JSON.parse(readHead(`machines/${entry.file}`))])
  );

  const problems = [];
  for (const entry of baseIndex.machines) {
    if (!headMachines.has(entry.id)) {
      problems.push(`${entry.id}: index.json から機種が消えた`);
      continue;
    }
    const baseIds = collectDerivedIds(JSON.parse(readBase(`machines/${entry.file}`)));
    const headIds = collectDerivedIds(headMachines.get(entry.id));
    const removed = removedById.get(entry.id) ?? new Set();
    for (const problem of compareDerivedIds(baseIds, headIds, removed)) {
      problems.push(`${entry.id}: ${problem}`);
    }
  }
  for (const [id, machine] of headMachines) {
    for (const problem of findDuplicateNamesWithoutId(machine)) problems.push(`${id}: ${problem}`);
  }
  return problems;
}
