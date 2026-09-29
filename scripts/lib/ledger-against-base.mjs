import { collectItemIds } from './derived-ids.mjs';
import { itemKey } from './provenance.mjs';
import { baseMachineItems, indexById, loadBaseRecords, sameJson } from './rules-against-base.mjs';

/**
 * 出典記録の removed（その見直しで外した根拠）と retiredIds（外した ID の台帳）を、main と比べて確かめる
 * （仕様 5.7・5.8）。validate は main を読まないので、main の値や main の記録が要るものをここで見る。
 * 台帳の ID の再利用は、main を読まずに validate（provenance-validator.mjs）が止める。
 */

/**
 * main の機種の項目（項目キー → 項目。終了画面の patterns を書き直した後の形。raw は書き直した後の機種ファイルの
 * 項目そのもの。baseMachineItems）と、アプリの ID（項目キー → ID）。機種が index.json に無ければ、どちらも空
 */
function machineContext(read, entry) {
  if (!entry) return { items: new Map(), ids: new Map() };
  const machine = JSON.parse(read(`machines/${entry.file}`));
  return { items: baseMachineItems(machine), ids: collectItemIds(machine) };
}

/**
 * 出典記録の配列の欄（removed・retiredIds）を、機種 ID ごとにまとめる（同じ機種の記録が複数あれば合わせる）。
 * 比べる側の読めなかった記録（null）は飛ばす（validate が報告する）。main の記録は loadBaseRecords で main の
 * スキーマと index.json に照らしてあり、合わなければその前に例外になる（null や欄の欠けを空の台帳として扱わない）
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
 * 比べる側の記録の removed を main と照らす。main の記録の removed は消してよいが、書き換えた項目は
 * 新しい removed として照らす。
 * - 新しく外した項目（main の同じ機種の記録に、JSON として同じ項目が無いもの）は、main の機種ファイルにあり、
 *   previous が main の機種ファイルの項目と JSON として同じこと（外す条件の確かめを、作った値で通せないように）。
 *   main の終了画面の patterns は書き直した後の形（アプリが読む形）で比べるので、同じ PR で書き直した終了画面も
 *   外せる。patterns の親は main の項目に無い（アプリは親を読まない）
 * - main にその項目の ID があれば、appId が main の ID と同じこと（ID はアプリの移行処理を通して作るので、
 *   書き直した終了画面の ID は、main の patterns から作る ID と同じ）
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
 * 1. 新しく外した項目は main の機種ファイルにあり、previous が main の項目（終了画面の patterns は書き直した後の形）
 *    と同じ。appId は main の ID と同じ（removalAgainstBaseProblems）
 * 2. main の記録の retiredIds を消さない・書き換えない（deletedRetiredProblems）。main の記録の removed は
 *    消してよい（その見直しの根拠。前の値と理由は git の履歴に残る）
 * main の記録は loadBaseRecords で読む（採否ルールの検査と同じ読み方。main のスキーマと index.json に合わない記録が
 * あれば例外を投げる。CLI は終了コード 2 にする）
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
