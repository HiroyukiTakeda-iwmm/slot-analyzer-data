import { migrateV1ToV2 } from '../migrate-v1-to-v2.mjs';
import {
  NAME_SEPARATOR,
  createNameDisambiguator,
  itemKey,
  listMachineItems,
  plainName,
} from './provenance.mjs';

/**
 * アプリが名前から ID を作る種類（項目キーの種類の名前）。確定演出・ボイスなどは、明示の id があるときだけ
 * ID を持つ（EXPLICIT_ID_KINDS・hasItemId）。main と比べる検査では、ID を持つ項目の削除を checkDerivedIds が、
 * ID を持たない項目の削除を checkRemovedItems（rules-against-base.mjs）が確かめる（二重に報告しない）。
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
 * アプリがデータの `id` をそのまま使い、無いときだけ取り込むたびに乱数の ID を振る種類の、機種ファイルの配列の欄と
 * 項目キーの種類の名前の対応（6種類の正本。EXPLICIT_ID_KINDS と item-id-validator.mjs はここから作る）。
 * slot-analyzer-ios の services/githubMachineService.ts（`x.id || generateUUID()`）。数えた記録（セッション）は
 * この ID で項目につながるので、明示の id がある項目は、ID を作る種類と同じく ID を変えない・再利用しない。
 * @type {Array<[string, string]>}
 */
export const EXPLICIT_ID_FIELDS = [
  ['confirmationEvents', 'confirmationEvent'],
  ['trialSuccessRates', 'trialSuccessRate'],
  ['voiceCounts', 'voiceCount'],
  ['musicCounts', 'musicCount'],
  ['effectCounts', 'effectCount'],
  ['modeTransitions', 'modeTransition'],
];

/** 明示の id をそのまま使う種類（項目キーの種類の名前。EXPLICIT_ID_FIELDS の種類） */
export const EXPLICIT_ID_KINDS = new Set(EXPLICIT_ID_FIELDS.map(([, kind]) => kind));

/** 明示の id（アプリがそのまま使う id。migrate-v1-to-v2.mjs と githubMachineService.ts と同じ判定） */
export function hasExplicitId(entry) {
  return typeof entry.id === 'string' && entry.id.length > 0;
}

/**
 * ID を持つ項目か: ID を作る種類（DERIVED_ID_KINDS）の項目、または EXPLICIT_ID_KINDS の種類で明示の id が
 * ある項目。ID を持つ項目は、ID を変えない・消したら removed に書く・外した ID を再利用しない（仕様 5.8）。
 * @param {string} kind 項目キーの種類の名前
 * @param {object} raw 機種ファイルの項目そのもの
 */
export function hasItemId(kind, raw) {
  return DERIVED_ID_KINDS.has(kind) || (EXPLICIT_ID_KINDS.has(kind) && hasExplicitId(raw));
}

/**
 * 基準にある項目が消えたのに、出典記録の removed に無いときの文面。
 * checkDerivedIds（ID を持つ項目）と checkRemovedItems（ID を持たない項目）で同じ文面にする。
 */
export const UNRECORDED_REMOVAL = '項目が消えたのに、出典記録の removed に無い';

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

/**
 * ID を持つ項目の ID を、項目キーごとに集める（仕様 5.8。ID の集め方はここ1か所）。
 * ID を作る種類はアプリと同じ作り方（collectDerivedIds）、EXPLICIT_ID_KINDS の種類は明示の id そのもの
 * （id の無い項目は含めない。アプリが取り込むたびに乱数の ID を振るため）。範囲（idScope）は、後者では種類。
 * 同じ種類で同じ名前の項目は、出典記録と同じく並び順で `#2` などを付けて区別する（id の無い項目も数える）。
 *
 * @param {object} machine 機種ファイルの中身
 * @returns {Map<string, string>} 項目キー → ID
 */
export function collectItemIds(machine) {
  const ids = collectDerivedIds(machine);
  const disambiguate = createNameDisambiguator();
  for (const [field, kind] of EXPLICIT_ID_FIELDS) {
    for (const entry of machine[field] ?? []) {
      const key = itemKey(kind, disambiguate(kind, plainName(kind, entry.name)));
      if (hasExplicitId(entry)) ids.set(key, entry.id);
    }
  }
  return ids;
}

/** 機種の項目キー（出典記録の項目の単位）の Set */
function itemKeysOf(machine) {
  return new Set(listMachineItems(machine).map((item) => itemKey(item.kind, item.name)));
}

/**
 * ID を作る種類で同じ名前の項目に、別々の明示の id があるかを確かめる（仕様 5.8）。
 * 同じ名前の項目は並び順で `#2` などと区別するので、名前から作る ID では、1つ目を外したとき、
 * 2つ目が1つ目の ID を黙って引き継ぐ。明示の id でも、値が重なると移行処理が並び順で `_2` を付けるので
 * （claimSlug）、同じことが起きる。
 * 移行後はすべての項目に id があるので、機種ファイルの移行前の元の形で見る。
 *
 * @param {object} machine 機種ファイルの中身（移行前の元の形）
 * @returns {string[]} 問題の説明（1つの名前につき1つ）
 */
function findDuplicateNameProblems(machine) {
  const entriesByKey = new Map();
  for (const { kind, name, entry } of listIdItems(machine)) {
    const key = itemKey(kind, name);
    entriesByKey.set(key, [...(entriesByKey.get(key) ?? []), entry]);
  }
  const problems = [];
  for (const [key, entries] of entriesByKey) {
    if (entries.length < 2) continue;
    if (!entries.every(hasExplicitId)) {
      problems.push(`${key}: 同じ名前の項目が複数あるので、明示の id を付ける`);
    } else if (new Set(entries.map((entry) => entry.id)).size < entries.length) {
      problems.push(`${key}: 同じ名前の項目の明示の id が重なっている（別々の id にする）`);
    }
  }
  return problems;
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
export function idScope(key) {
  return key.slice(0, key.lastIndexOf(NAME_SEPARATOR));
}

/** 範囲つきの ID（項目キーの範囲と ID）。範囲が違えば同じ ID でも別のものとして比べる */
export function scopedId(key, id) {
  return `${idScope(key)}${NAME_SEPARATOR}${id}`;
}

/**
 * 出典記録の retiredIds（外した ID の台帳）を、機種 ID ごとに範囲つきの ID の Set にする。
 * 読めなかった記録（data: null）は飛ばす（validate が報告する）。
 *
 * @param {Array<{ data: object | null }>} provenanceFiles
 * @returns {Map<string, Set<string>>} 機種 ID → 範囲つきの ID
 */
export function retiredIdsByMachine(provenanceFiles) {
  const byId = new Map();
  for (const file of provenanceFiles) {
    if (!file.data) continue;
    const rows = file.data.retiredIds ?? [];
    byId.set(
      file.data.machineId,
      new Set(rows.map((row) => scopedId(itemKey(row.kind, row.name), row.appId)))
    );
  }
  return byId;
}

/**
 * 基準の ID（collectItemIds）が、比べる側でも同じかを確かめる。明示の id が無くなった項目も報告する。
 * 新しく足した項目が、基準の別の項目の ID（外した項目の ID など）を使っていないかも確かめる。
 * 利用者の記録は ID でつながっているので、ID を引き継ぐと、外した項目の記録が別の項目に付く。
 * 外した項目の ID は、出典記録の retiredIds（外した ID の台帳。足すだけ）に残り、今の機種ファイルの項目が
 * それを使えば validate（provenance-validator.mjs）が止める（PR をまたいでも、足し直しでも）。台帳にある ID
 * （retired）の使い回しは validate が報告するので、ここでは重ねて報告しない。
 *
 * @param {Map<string, string>} baseIds 基準（main）の ID
 * @param {Map<string, string>} headIds 比べる側（作業ブランチ）の ID
 * @param {Set<string>} removedKeys 出典記録の removed にある項目キー
 * @param {Set<string>} [retired] 比べる側の出典記録の retiredIds（範囲つきの ID。scopedId）
 * @param {Set<string>} [headKeys] 比べる側の項目キー（ID の無い項目も）。ID を持たなくなった項目を、消えた
 *   項目と分けて報告するのに使う
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function compareDerivedIds(
  baseIds,
  headIds,
  removedKeys,
  retired = new Set(),
  headKeys = new Set(headIds.keys())
) {
  const problems = [];
  for (const [key, id] of baseIds) {
    if (headIds.has(key)) {
      const headId = headIds.get(key);
      if (headId !== id) problems.push(`${key}: ID が変わった（${id} → ${headId}）`);
    } else if (headKeys.has(key)) {
      problems.push(
        `${key}: 明示の id が無くなった（${id}。アプリが取り込むたびに乱数の ID になり、数えた記録が切れる）`
      );
    } else if (!removedKeys.has(key)) {
      problems.push(`${key}: ${UNRECORDED_REMOVAL}`);
    }
  }

  const ownerByScopedId = new Map([...baseIds].map(([key, id]) => [scopedId(key, id), key]));
  for (const [key, id] of headIds) {
    if (baseIds.has(key) || retired.has(scopedId(key, id))) continue;
    const owner = ownerByScopedId.get(scopedId(key, id));
    if (owner !== undefined) {
      problems.push(
        `${key}: 新しい項目が、基準の ${owner} の ID（${id}）を使っている（明示の id を付ける）`
      );
    }
  }
  return problems;
}

/**
 * 比べる側で新しく足した項目（基準に無い項目キー。新しい機種の項目も）のうち、EXPLICIT_ID_KINDS の種類で
 * 明示の id が無いもの（アプリが取り込むたびに乱数の ID になり、数えた記録が切れる）。基準にあった id の無い
 * 項目はそのまま（段階1a は機種ファイルを変えない）
 * @param {object | undefined} base 基準の機種ファイル（新しい機種なら undefined）
 */
function missingExplicitIdProblems(base, head) {
  const baseKeys = base ? itemKeysOf(base) : new Set();
  return listMachineItems(head)
    .map((item) => ({ ...item, key: itemKey(item.kind, item.name) }))
    .filter((item) => EXPLICIT_ID_KINDS.has(item.kind) && !baseKeys.has(item.key))
    .filter((item) => !hasExplicitId(item.raw))
    .map(
      (item) =>
        `${item.key}: 新しい項目に明示の id が無い（アプリが取り込むたびに乱数の ID になり、数えた記録が切れる）`
    );
}

/**
 * index.json の機種について、ID を持つ項目（collectItemIds）の ID を確かめる。
 * - 基準の index.json の機種: 基準と比べる（compareDerivedIds）。index.json から消えた機種も報告する
 * - 比べる側の index.json のすべての機種（新しく足した機種も）: 同じ名前の項目に別々の明示の id があるか、
 *   新しく足した確定演出などに明示の id があるか
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   provenanceFiles: Array<{ data: object | null }> }} io
 *   readBase / readHead はリポジトリからの相対パスを受け取り、中身を返す。読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkDerivedIds({ readBase, readHead, provenanceFiles }) {
  const removedById = removedKeysByMachine(provenanceFiles);
  const retiredById = retiredIdsByMachine(provenanceFiles);
  const baseIndex = JSON.parse(readBase('machines/index.json'));
  const headIndex = JSON.parse(readHead('machines/index.json'));
  // 比べる側の機種ファイルは、比べる側の index.json の場所から読む
  const headMachines = new Map(
    headIndex.machines.map((entry) => [entry.id, JSON.parse(readHead(`machines/${entry.file}`))])
  );

  const problems = [];
  const baseMachines = new Map();
  for (const entry of baseIndex.machines) {
    if (!headMachines.has(entry.id)) {
      problems.push(`${entry.id}: index.json から機種が消えた`);
      continue;
    }
    const base = JSON.parse(readBase(`machines/${entry.file}`));
    const head = headMachines.get(entry.id);
    baseMachines.set(entry.id, base);
    const removed = removedById.get(entry.id) ?? new Set();
    const retired = retiredById.get(entry.id) ?? new Set();
    const headIds = collectItemIds(head);
    const headKeys = new Set([...itemKeysOf(head), ...headIds.keys()]);
    for (const problem of compareDerivedIds(
      collectItemIds(base),
      headIds,
      removed,
      retired,
      headKeys
    )) {
      problems.push(`${entry.id}: ${problem}`);
    }
  }
  for (const [id, machine] of headMachines) {
    const machineProblems = [
      ...findDuplicateNameProblems(machine),
      ...missingExplicitIdProblems(baseMachines.get(id), machine),
    ];
    for (const problem of machineProblems) problems.push(`${id}: ${problem}`);
  }
  return problems;
}
