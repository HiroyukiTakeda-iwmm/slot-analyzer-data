import { collectItemIds } from './derived-ids.mjs';
import { itemKey, listMachineItems } from './provenance.mjs';
import { indexById } from './rules-against-base.mjs';

/**
 * 出典記録の removed（その見直しで外した根拠）と retiredIds（外した ID の台帳）を、main と比べて確かめる
 * （仕様 5.7・5.8）。validate は main を読まないので、main の値や main の記録が要るものをここで見る。
 * 台帳の ID の再利用は、main を読まずに validate（provenance-validator.mjs）が止める。
 */

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

/**
 * 機種の項目（項目キー → listMachineItems の項目。raw は機種ファイルの項目そのもの）と、アプリの ID
 * （項目キー → ID）。機種が index.json に無ければ、どちらも空
 */
function machineContext(read, entry) {
  if (!entry) return { items: new Map(), ids: new Map() };
  const machine = JSON.parse(read(`machines/${entry.file}`));
  return {
    items: new Map(listMachineItems(machine).map((item) => [itemKey(item.kind, item.name), item])),
    ids: collectItemIds(machine),
  };
}

/**
 * 出典記録の配列の欄（removed・retiredIds）を、機種 ID ごとにまとめる（同じ機種の記録が複数あれば合わせる）。
 * 読めなかった記録（null）は飛ばす（validate が報告する）
 */
function fieldByMachine(records, field) {
  const byId = new Map();
  for (const data of records) {
    if (!data) continue;
    byId.set(data.machineId, [...(byId.get(data.machineId) ?? []), ...(data[field] ?? [])]);
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
 * 比べる側の記録の removed を main と照らす。main の記録の removed は消してよいが、書き換えた項目は
 * 新しい removed として照らす。
 * - 新しく外した項目（main の同じ機種の記録に、JSON として同じ項目が無いもの）は、main の機種ファイルにあり、
 *   previous が main の生の項目と JSON として同じこと（外す条件の確かめを、作った値で通せないように）
 * - main にその項目の ID があれば、appId が main の ID と同じこと（patterns 形式の終了画面は、アプリが
 *   別々の終了画面に展開するので項目キーの ID が無い。記録は validate が止める）
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
    if (baseItem && base.ids.has(key) && removed.appId !== base.ids.get(key)) {
      problems.push(
        `${id}: ${key}: removed の appId が main の ID と違う（main: ${base.ids.get(key)}）`
      );
    }
  }
  return problems;
}

/**
 * main の記録の retiredIds の各行が、比べる側の同じ機種の記録に残っているか（外した ID の台帳は足すだけ。
 * 例外なし）。行を書き換えると、元の行を消したものとして報告する（1つの原因に1つの問題）
 */
function deletedRetiredProblems(id, baseRows, headRows) {
  return baseRows
    .filter((row) => !headRows.some((kept) => sameJson(kept, row)))
    .map(
      (row) =>
        `${id}: ${itemKey(row.kind, row.name)}（${row.appId}）: main の記録の retiredIds を消している（外した ID の台帳は消さない）`
    );
}

/**
 * removed と retiredIds を main と比べて確かめる（仕様 5.7・5.8）。
 * 1. 新しく外した項目は main の機種ファイルにあり、previous が main の生の項目と同じ。appId は main の ID と
 *    同じ（removalAgainstBaseProblems）
 * 2. main の記録の retiredIds を消さない・書き換えない（deletedRetiredProblems）。main の記録の removed は
 *    消してよい（その見直しの根拠。前の値と理由は git の履歴に残る）
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   listBase: (dir: string) => string[], provenanceFiles: Array<{ data: object | null }> }} io
 *   listBase は main のフォルダ直下のファイルのパス（リポジトリからの相対）を返す。読めなければ例外を投げる
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkLedgerAgainstBase({ readBase, listBase, provenanceFiles }) {
  const baseById = indexById(readBase);
  const baseRecords = loadBaseRecords(readBase, listBase);
  const headRecords = provenanceFiles.map((file) => file.data);
  const baseRemoved = fieldByMachine(baseRecords, 'removed');
  const headRemoved = fieldByMachine(headRecords, 'removed');
  const headRetired = fieldByMachine(headRecords, 'retiredIds');

  const problems = [];
  for (const [id, removed] of headRemoved) {
    const base = machineContext(readBase, baseById.get(id));
    problems.push(...removalAgainstBaseProblems(id, removed, baseRemoved.get(id) ?? [], base));
  }
  for (const [id, rows] of fieldByMachine(baseRecords, 'retiredIds')) {
    problems.push(...deletedRetiredProblems(id, rows, headRetired.get(id) ?? []));
  }
  return problems;
}
