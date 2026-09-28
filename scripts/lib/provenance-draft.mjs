/**
 * 抜き出しのメモ（と読み直しのメモ）から、出典記録の下書きと「機種ファイルに書く値」を作る
 * （scripts/provenance-draft.mjs の本体。ファイルは読み書きしない）。
 *
 * 採否は provenance.mjs の decideNewItem・decideExistingItem だけで決め、ここでは書き直さない。
 * 決まりは docs/data-format.md の「記録の下書き」。
 */

import { DERIVED_ID_KINDS, collectDerivedIds, hasItemId, scopedId } from './derived-ids.mjs';
import { hasPatterns } from './expand-patterns.mjs';
import {
  extractItemProblems,
  extractSourceKeyProblems,
  itemLabel,
  lineLabel,
  rereadPairingProblems,
} from './notes.mjs';
import {
  CHONBORISTA_KEY,
  NAME_SEPARATOR,
  allowedUnits,
  decideExistingItem,
  decideNewItem,
  isNumericUnit,
  itemKey,
  machineValue,
  shapeError,
  storedMap,
  toStoredFromShown,
} from './provenance.mjs';

/**
 * 機種ファイルに availableSettings が無いときの設定。validate（probability-validator.mjs の getExpectedSettings・
 * confirmation-validator.mjs）と同じ求め方にする
 */
const DEFAULT_SETTINGS = ['1', '2', '3', '4', '5', '6'];

/** 名前が「親::子」の種類 */
const CHILD_KINDS = new Set(['zoneRole', 'endScreenGroupItem']);

/** 機種の設定（validate と同じ求め方） */
export function machineSettings(machine) {
  return machine.availableSettings || DEFAULT_SETTINGS;
}

function sameSettings(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((s) => sb.has(s));
}

/**
 * 項目名の形（仕様の決まり: zoneRole・endScreenGroupItem の項目名は「親の名前::子の名前」）。
 * ほかの種類の名前に「::」があると、項目キーの親と子の切れ目が分からなくなる（plainName と同じ理由）。
 */
function nameProblems(extract) {
  return extract.items.flatMap((item) => {
    const parts = item.name.split(NAME_SEPARATOR);
    if (CHILD_KINDS.has(item.kind)) {
      return parts.length === 2 && parts.every((part) => part.length > 0)
        ? []
        : [
            `${itemLabel(item)}: ${item.kind} の項目名は「親の名前${NAME_SEPARATOR}子の名前」にする`,
          ];
    }
    return parts.length === 1
      ? []
      : [
          `${itemLabel(item)}: 項目名に「${NAME_SEPARATOR}」は使えない（zoneRole・endScreenGroupItem の親と子の区切りだけに使う）`,
        ];
  });
}

/**
 * 読み直しのメモの、ちょんぼりすたの行の値（項目キー → 値）。採否の関数の reread に渡す（ちょんぼりすたの値の
 * 読み直し。ほかの出典の行は採否に使わない）
 */
function chonboristaRereads(reread) {
  const values = new Map();
  for (const line of reread?.items ?? []) {
    if (line.source === CHONBORISTA_KEY) values.set(itemKey(line.kind, line.name), line.value);
  }
  return values;
}

/** ちょんぼりすたの読み直しの値のうち、抜き出しのメモの同じ項目の unit の形に合わないもの */
function rereadShapeProblems(extract, rereads) {
  return extract.items.flatMap(({ kind, name, unit }) => {
    const key = itemKey(kind, name);
    if (!rereads.has(key)) return [];
    const problem = shapeError(unit, rereads.get(key));
    return problem === null
      ? []
      : [
          `読み直しの ${lineLabel({ kind, name, source: CHONBORISTA_KEY })} の値が unit（${unit}）の形に合わない: ${problem}`,
        ];
  });
}

/**
 * メモ（抜き出しと、あれば読み直し）だけで分かる誤り。スキーマに合ったメモに使う。
 * 値が unit の形に合わない・同じ項目の行が2つある・出典キーが sources に無い（sources に同じキーが2つある）・
 * 項目名の形・読み直しの機種 ID が違う・読み直しに同じ項目と出典の行が2つある・ちょんぼりすたの読み直しの値が
 * unit の形に合わない。
 * @returns {string[]} 誤りが無ければ空の配列
 */
export function memoProblems(extract, reread) {
  return [
    ...(reread ? rereadPairingProblems(extract, reread) : extractItemProblems(extract)),
    ...extractSourceKeyProblems(extract),
    ...nameProblems(extract),
    ...rereadShapeProblems(extract, chonboristaRereads(reread)),
  ];
}

/**
 * 既存の機種で、メモが機種ファイルと合わないところ（仕様の決まり F1・F2）。
 * - machineFile が index.json のその機種の行と違う
 * - availableSettings が機種ファイルの設定（validate と同じ求め方）と違う（並びは問わない）
 * - 機種ファイルの最上位の終了画面に空でない patterns がある（アプリはパターンごとの終了画面を使い、親を捨てる）
 * - 機種ファイルの項目（listMachineItems。`#2` などの付いた名前も）がメモに無い（抜き出しで見落とした項目を、
 *   黙って「出典なし」として外さない）
 * - メモの unit が、機種ファイルの項目に使えない（allowedUnits）
 * @param {{ id: string, file: string }} entry index.json のその機種の行
 * @param {Array<{ kind: string, name: string, entry: object, raw: object }>} machineItems listMachineItems の結果
 * @returns {string[]}
 */
export function machineProblems(extract, entry, machine, machineItems) {
  const problems = [];
  if (extract.machineFile !== entry.file) {
    problems.push(
      `machineFile が index.json のその機種の行と違う（メモ: ${extract.machineFile}・index.json: ${entry.file}）`
    );
  }
  const settings = machineSettings(machine);
  if (!sameSettings(extract.availableSettings, settings)) {
    problems.push(
      `availableSettings が機種ファイルの設定と違う（メモ: ${extract.availableSettings.join(', ')}・機種ファイル: ${settings.join(', ')}）`
    );
  }
  for (const screen of (machine.endScreens ?? []).filter(hasPatterns)) {
    problems.push(
      `機種ファイルの最上位の終了画面「${screen.name}」に patterns がある（アプリはパターンごとの終了画面を使い、親を捨てるので記録しない）。先に node scripts/expand-patterns.mjs machines/${entry.file} --write で書き直す`
    );
  }
  const unitByKey = new Map(
    extract.items.map((item) => [itemKey(item.kind, item.name), item.unit])
  );
  for (const item of machineItems) {
    const key = itemKey(item.kind, item.name);
    if (!unitByKey.has(key)) {
      problems.push(
        `機種ファイルの項目がメモに無い: ${itemLabel(item)}（どの出典にも無かった項目は values: {} で書く）`
      );
      continue;
    }
    // 最上位の終了画面の patterns は上で1回だけ報告する
    if (item.kind === 'endScreen' && hasPatterns(item.raw)) continue;
    const unit = unitByKey.get(key);
    const allowed = allowedUnits(item.kind, item.entry);
    if (allowed.length === 0) {
      problems.push(`${itemLabel(item)}: patterns 形式の項目は、出典記録に記録できない`);
    } else if (!allowed.includes(unit)) {
      problems.push(
        `${itemLabel(item)}: unit=${unit} は使えない（機種ファイルの項目に合わせて ${allowed.join(' か ')} にする）`
      );
    }
  }
  return problems;
}

/**
 * 採用した項目の「機種ファイルに書く値」（仕様 5.6）。数値の unit の確定・暫定は、採用値を有効数字6桁にした確率
 * （toStoredFromShown）、残す（kept-single-source）は機種ファイルの今の確率そのもの。設定の組・有無は採用値。
 * @param {object | undefined} target 機種ファイルの項目（listMachineItems の項目。新しく足す項目は undefined）
 */
function storedValue({ unit, status, adopted }, target) {
  if (!isNumericUnit(unit)) return adopted;
  if (status === 'kept-single-source') return storedMap(target.entry);
  return Object.fromEntries(
    Object.entries(adopted).map(([setting, shown]) => [setting, toStoredFromShown(unit, shown)])
  );
}

/** retiredIds の行を見分けるキー（kind・name・appId。provenance-validator.mjs と同じ） */
function retiredRowKey({ kind, name, appId }) {
  return JSON.stringify([kind, name, appId]);
}

/**
 * 外す項目を除き、新しく足す ID を作る種類の項目を足した機種ファイル（ID を確かめるためだけの形）。
 * 足す項目は、それぞれの配列（ゾーン・グループの中の配列）の末尾に、名前だけで（役は displayOrder を書かずに）置く。
 * 親のゾーン・グループが無ければ、名前だけの親を末尾に足す。元の機種ファイルは書き換えない。
 * @param {Set<object>} removedRaws 外す項目（機種ファイルの項目そのもの）
 * @param {Array<{ kind: string, name: string }>} added 足す項目（DERIVED_ID_KINDS の種類）
 */
function withAddedItems(machine, removedRaws, added) {
  const keep = (list) => (list ?? []).filter((raw) => !removedRaws.has(raw));
  const result = structuredClone({
    ...machine,
    roles: keep(machine.roles),
    zones: (machine.zones ?? []).map((zone) => ({ ...zone, roles: keep(zone.roles) })),
    endScreens: keep(machine.endScreens),
    endScreenGroups: (machine.endScreenGroups ?? []).map((group) => ({
      ...group,
      endScreens: keep(group.endScreens),
    })),
  });
  for (const { kind, name } of added) {
    if (kind === 'role' || kind === 'endScreen') {
      result[kind === 'role' ? 'roles' : 'endScreens'].push({ name });
      continue;
    }
    const [parentName, childName] = name.split(NAME_SEPARATOR);
    const [field, children] =
      kind === 'zoneRole' ? ['zones', 'roles'] : ['endScreenGroups', 'endScreens'];
    let parent = result[field].find((candidate) => candidate.name === parentName);
    if (!parent) {
      parent = { name: parentName, [children]: [] };
      result[field].push(parent);
    }
    parent[children].push({ name: childName });
  }
  return result;
}

/**
 * 新しく足す項目（機種ファイルに無く、採用した項目）が、外した ID の台帳（引き継いだ行と今回足した行）の ID を
 * 使うことになるところ（仕様の決まり F3。足し直しなど）。ID を作る種類（DERIVED_ID_KINDS）の項目を、
 * withAddedItems の置き方で足したときに、アプリが名前から作る ID（collectDerivedIds）で確かめる。
 * 確定演出などの ID は、機種ファイルに書く明示の id で決まり、ここでは分からない（validate が確かめる）。
 * @returns {string[]}
 */
function reusedRetiredIdProblems(machine, removedRaws, added, retiredIds) {
  const rowByScopedId = new Map(
    retiredIds.map((row) => [scopedId(itemKey(row.kind, row.name), row.appId), row])
  );
  const derived = added.filter((item) => DERIVED_ID_KINDS.has(item.kind));
  if (rowByScopedId.size === 0 || derived.length === 0) return [];
  const ids = collectDerivedIds(withAddedItems(machine ?? {}, removedRaws, derived));
  return derived.flatMap((item) => {
    const key = itemKey(item.kind, item.name);
    const id = ids.get(key);
    const row = rowByScopedId.get(scopedId(key, id));
    return row === undefined
      ? []
      : [
          `${itemLabel(item)}: 外した ID の台帳（retiredIds）にある ID（${id}）を使うことになる（台帳の行: ${itemLabel(row)}）。機種ファイルに足すときは、台帳に無い明示の別の id を付ける`,
        ];
  });
}

/**
 * 出典記録の下書きを作る（仕様の決まり F3〜F5）。memoProblems・machineProblems が空のメモに使う。
 * - 機種ファイルにある項目は decideExistingItem（current・stored は機種ファイルから）、無い項目（新台のすべての
 *   項目も）は decideNewItem（settings は機種の設定。新台はメモの availableSettings）
 * - 外す項目の removed: previous は機種ファイルの生の項目、ID を持つ項目（hasItemId）は appId（collectItemIds の
 *   ID）を書き、同じ行を retiredIds に足す
 * - retiredIds は、今の出典記録の retiredIds をそのまま先頭に引き継ぐ（足すだけの台帳）。今の記録の removed は
 *   引き継がない
 * - 読み直し（ちょんぼりすたの行）があれば、項目・removed に status によらず reread: { by, value } を付ける
 * @param {{ extract: object, reread?: object | null, reviewedAt: string,
 *   machine?: object, machineItems?: Array<object>, itemIds?: Map<string, string>,
 *   currentRecord?: object | null }} input
 *   machine・machineItems（listMachineItems）・itemIds（collectItemIds）は既存の機種だけ。currentRecord は今の出典記録
 * @returns {{ problems: string[] }
 *   | { record: object, machineValues: object[], needsReread: string[] }}
 *   problems は外した ID の台帳の ID を使うことになる新しい項目。needsReread は、読み直しが無く、ちょんぼりすたの値と
 *   合う読み直しがあれば暫定にできる removed の項目（validate が止める）
 */
export function draftRecord({
  extract,
  reread = null,
  reviewedAt,
  machine,
  machineItems = [],
  itemIds = new Map(),
  currentRecord = null,
}) {
  const sourceKinds = Object.fromEntries(
    extract.sources.map((source) => [source.key, source.kind])
  );
  const settings = machine ? machineSettings(machine) : extract.availableSettings;
  const targets = new Map(machineItems.map((item) => [itemKey(item.kind, item.name), item]));
  const rereads = chonboristaRereads(reread);

  const items = [];
  const candidates = [];
  const removed = [];
  const machineValues = [];
  const added = [];
  const needsReread = [];
  const retiredIds = [...(currentRecord?.retiredIds ?? [])];
  const retiredRows = new Set(retiredIds.map(retiredRowKey));

  for (const { kind, name, unit, values } of extract.items) {
    const key = itemKey(kind, name);
    const rereadValue = rereads.get(key);
    const rereadField =
      rereadValue === undefined ? {} : { reread: { by: reread.by, value: rereadValue } };
    const target = targets.get(key);
    let decision;
    if (target) {
      const machineInput = {
        unit,
        values,
        sourceKinds,
        current: machineValue(target.entry, unit),
        stored: storedMap(target.entry),
      };
      decision = decideExistingItem({ ...machineInput, reread: rereadValue });
      if (decision.outcome === 'remove') {
        const hasId = hasItemId(kind, target.raw);
        const appId = hasId ? itemIds.get(key) : undefined;
        if (hasId && appId === undefined) {
          throw new Error(`${itemLabel({ kind, name })}: ID を持つ項目の ID が求められない`);
        }
        removed.push({
          kind,
          name,
          unit,
          previous: target.raw,
          values,
          ...(appId === undefined ? {} : { appId }),
          ...rereadField,
          reason: decision.reason,
        });
        if (appId !== undefined && !retiredRows.has(retiredRowKey({ kind, name, appId }))) {
          retiredIds.push({ kind, name, appId });
          retiredRows.add(retiredRowKey({ kind, name, appId }));
        }
        const chonborista = values[CHONBORISTA_KEY];
        if (
          rereadValue === undefined &&
          chonborista !== undefined &&
          decideExistingItem({ ...machineInput, reread: chonborista }).status ===
            'provisional-chonborista'
        ) {
          needsReread.push(key);
        }
        continue;
      }
    } else {
      decision = decideNewItem({ unit, values, sourceKinds, reread: rereadValue, settings });
      if (decision.outcome === 'candidate') {
        candidates.push({ kind, name, unit, values, reason: decision.reason });
        continue;
      }
      added.push({ kind, name });
    }
    const { status, adopted } = decision;
    items.push({ kind, name, status, unit, values, adopted, ...rereadField });
    machineValues.push({
      kind,
      name,
      status,
      value: storedValue({ unit, status, adopted }, target),
    });
  }

  const removedRaws = new Set(
    removed.map((entry) => targets.get(itemKey(entry.kind, entry.name)).raw)
  );
  const problems = reusedRetiredIdProblems(machine, removedRaws, added, retiredIds);
  if (problems.length > 0) return { problems };

  const record = {
    machineId: extract.machineId,
    machineFile: extract.machineFile,
    reviewedAt,
    sources: extract.sources,
    items,
    candidates,
    removed,
    retiredIds,
  };
  return { record, machineValues, needsReread };
}
