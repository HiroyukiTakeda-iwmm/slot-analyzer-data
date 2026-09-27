import {
  DERIVED_ID_KINDS,
  UNRECORDED_REMOVAL,
  collectDerivedIds,
  idScope,
  removedKeysByMachine,
} from './derived-ids.mjs';
import {
  NAME_SEPARATOR,
  itemKey,
  listMachineItems,
  machineSupporters,
  machineValue,
  storedMap,
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
        if (baseItem && supportedByBase(item, baseItem.entry, baseValue)) {
          problems.push(
            `${id}: ${key}: main の値を裏づける出典がある（規則2の kept-single-source にする）`
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
 * ID を作る種類（DERIVED_ID_KINDS）の項目は checkDerivedIds が同じ文面（UNRECORDED_REMOVAL）で、
 * index.json から消えた機種も checkDerivedIds が報告するので、ここでは見ない（二重に出さない）。
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

// ================================================================
// 外した ID の台帳（出典記録の removed。仕様 5.7・5.8）
// ================================================================

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
function sameJson(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** 結果を機種 ID ごとに覚えておく（同じ機種ファイルを何度も読まない） */
function memoize(fn) {
  const cache = new Map();
  return (key) => {
    if (!cache.has(key)) cache.set(key, fn(key));
    return cache.get(key);
  };
}

/**
 * 機種の項目（項目キー → listMachineItems の項目。raw は機種ファイルの項目そのもの）と、アプリが作る ID
 * （項目キー → ID）。機種が index.json に無ければ、どちらも空
 */
function machineContext(read, entry) {
  if (!entry) return { items: new Map(), ids: new Map() };
  const machine = JSON.parse(read(`machines/${entry.file}`));
  return {
    items: new Map(listMachineItems(machine).map((item) => [itemKey(item.kind, item.name), item])),
    ids: collectDerivedIds(machine),
  };
}

/**
 * 出典記録の removed を、機種 ID ごとにまとめる（同じ機種の記録が複数あれば合わせる）。
 * 読めなかった記録（null）は飛ばす（validate が報告する）
 */
function removedByMachine(records) {
  const byId = new Map();
  for (const data of records) {
    if (!data) continue;
    byId.set(data.machineId, [...(byId.get(data.machineId) ?? []), ...(data.removed ?? [])]);
  }
  return byId;
}

/**
 * main の provenance/ にある出典記録を読む。比べる側で記録のファイルごと消した場合も見つけるため、
 * 比べる側の記録からでなく main を列挙する。読めなければ例外を投げる（CLI は終了コード 2 にする）
 */
function loadBaseRecords(readBase, listBase) {
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

/**
 * 比べる側の記録の removed を main と照らす。
 * - 新しく外した項目（main の同じ機種の記録に、JSON として同じ項目が無いもの）は、main の機種ファイルにあり、
 *   previous が main の生の項目と JSON として同じこと（外す条件の確かめを、作った値で通せないように）
 * - ID を作る種類で main にその項目があれば、appId が main の ID と同じこと（patterns 形式の終了画面は、
 *   アプリが別々の終了画面に展開するので項目キーの ID が無い。記録は validate が止める）
 */
function removalAgainstBaseProblems(id, headRemoved, baseRemoved, base) {
  const problems = [];
  for (const removed of headRemoved) {
    const key = itemKey(removed.kind, removed.name);
    const baseItem = base.items.get(key);
    const isNew = !baseRemoved.some((entry) => sameJson(entry, removed));
    if (isNew && !baseItem) {
      problems.push(`${id}: ${key}: removed の項目が main の機種ファイルに無い`);
    } else if (isNew && !sameJson(removed.previous, baseItem.raw)) {
      problems.push(`${id}: ${key}: removed の previous が main の項目と違う`);
    }
    if (baseItem && DERIVED_ID_KINDS.has(removed.kind) && base.ids.has(key)) {
      const baseId = base.ids.get(key);
      if (removed.appId !== baseId) {
        problems.push(`${id}: ${key}: removed の appId が main の ID と違う（main: ${baseId}）`);
      }
    }
  }
  return problems;
}

/**
 * main の記録の removed が、比べる側の同じ機種の記録に JSON として同じ形で残っているか（外した ID の台帳は
 * 消さない）。同じ項目キーの項目を比べる側の機種ファイルに足し直したときだけ、記録から外してよい（validate の
 * 「外したはずの項目が機種ファイルにある」があるため）。足し直した項目も前の ID は使えない（reusedIdProblems）
 */
function deletedLedgerProblems(id, baseRemoved, headRemoved, headItems) {
  return baseRemoved
    .filter((entry) => !headRemoved.some((kept) => sameJson(kept, entry)))
    .map((entry) => itemKey(entry.kind, entry.name))
    .filter((key) => !headItems.has(key))
    .map(
      (key) => `${id}: ${key}: main の記録の removed を消している（外した ID の台帳は消さない）`
    );
}

/**
 * 比べる側で新しく足した項目（main に無い項目キー）が、外した項目の ID（台帳の appId）を同じ範囲（idScope）で
 * 使っていないか。main にある ID の使い回しは compareDerivedIds（derived-ids.mjs）が報告するので、ここでは
 * main に無い ID（先の PR で外した項目の ID など）だけを報告する（二重に出さない）
 * @param {object[]} ledger 比べる側と main の記録の removed
 */
function reusedIdProblems(id, baseIds, headIds, ledger) {
  const scoped = (key, appId) => `${idScope(key)}${NAME_SEPARATOR}${appId}`;
  const inBase = new Set([...baseIds].map(([key, appId]) => scoped(key, appId)));
  const removedIds = new Set(
    ledger
      .filter((removed) => typeof removed.appId === 'string')
      .map((removed) => scoped(itemKey(removed.kind, removed.name), removed.appId))
  );
  return [...headIds]
    .filter(([key]) => !baseIds.has(key))
    .filter(([key, appId]) => removedIds.has(scoped(key, appId)) && !inBase.has(scoped(key, appId)))
    .map(
      ([key, appId]) =>
        `${id}: ${key}: 外した項目の ID（${appId}）を新しい項目が使っている（明示の id を付ける）`
    );
}

/**
 * 外した ID の台帳（出典記録の removed）を main と比べて確かめる（仕様 5.7・5.8）。
 * 1. 新しく外した項目は main の機種ファイルにあり、previous が main の生の項目と同じ。ID を作る種類の appId は
 *    main の ID と同じ（removalAgainstBaseProblems）
 * 2. main の記録の removed を消さない（足し直した項目を除く。deletedLedgerProblems）
 * 3. 新しく足した項目が、外した項目の ID を使わない。台帳は比べる側と main の両方の記録の removed
 *    （reusedIdProblems）。記録が main に残るので、PR をまたいだ引き継ぎも見つかる
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   listBase: (dir: string) => string[], provenanceFiles: Array<{ data: object | null }> }} io
 *   listBase は main のフォルダ直下のファイルのパス（リポジトリからの相対）を返す。読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkRemovedLedger({ readBase, readHead, listBase, provenanceFiles }) {
  const baseById = indexById(readBase);
  const headById = indexById(readHead);
  const baseRemovedById = removedByMachine(loadBaseRecords(readBase, listBase));
  const headRemovedById = removedByMachine(provenanceFiles.map((file) => file.data));
  const baseMachine = memoize((id) => machineContext(readBase, baseById.get(id)));
  const headMachine = memoize((id) => machineContext(readHead, headById.get(id)));

  const problems = [];
  for (const [id, headRemoved] of headRemovedById) {
    const baseRemoved = baseRemovedById.get(id) ?? [];
    problems.push(...removalAgainstBaseProblems(id, headRemoved, baseRemoved, baseMachine(id)));
  }
  for (const [id, baseRemoved] of baseRemovedById) {
    const headRemoved = headRemovedById.get(id) ?? [];
    problems.push(...deletedLedgerProblems(id, baseRemoved, headRemoved, headMachine(id).items));
  }
  for (const id of headById.keys()) {
    const ledger = [...(headRemovedById.get(id) ?? []), ...(baseRemovedById.get(id) ?? [])];
    if (ledger.length === 0) continue;
    problems.push(...reusedIdProblems(id, baseMachine(id).ids, headMachine(id).ids, ledger));
  }
  return problems;
}
