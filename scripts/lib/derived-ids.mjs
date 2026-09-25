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
