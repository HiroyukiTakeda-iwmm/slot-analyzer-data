import { basename } from 'path';
import {
  DERIVED_ID_KINDS,
  EXPLICIT_ID_KINDS,
  collectItemIds,
  hasItemId,
  scopedId,
} from '../lib/derived-ids.mjs';
import { compileSchema } from '../lib/compile-schema.mjs';
import {
  REREAD_BEFORE_REMOVAL,
  allowedUnits,
  decideExistingItem,
  itemEntry,
  itemKey,
  listMachineItems,
  machineValue,
  machineValueProblem,
  patternsProblem,
  rereadWouldMakeProvisional,
  shapeError,
  sourceProblems,
  statusError,
  storedMap,
} from '../lib/provenance.mjs';

function error(file, message) {
  return { file, type: 'provenance', severity: 'error', message };
}

/**
 * 出典記録（provenance/*.json）を検証する（仕様 5.7）。
 *
 * @param {Array<{ path: string, data: object }>} machineFiles machines/ 配下の機種ファイル
 * @param {object} indexData machines/index.json の中身
 * @param {Array<{ path: string, data: object | null, parseError?: string }>} provenanceFiles
 * @param {{ requireAll?: boolean, officialDomains?: Iterable<string> | null }} [options]
 *   requireAll: 全機種に出典記録を求める（段階3）。
 *   officialDomains: メーカーの公式ドメインの一覧（validateOfficialDomains の domains）。null（渡さない）ときは
 *   一覧を読めなかったものとして、公式の出典を通さない（確かめられないエラーにする）
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function validateProvenance(machineFiles, indexData, provenanceFiles, options = {}) {
  const { requireAll = false } = options;
  const officialDomains = options.officialDomains == null ? null : new Set(options.officialDomains);
  const errors = [];
  const warnings = [];
  const validateSchema = compileSchema('provenance.schema.json');

  const entries = indexData.machines ?? [];
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const machineByPath = new Map(machineFiles.map((file) => [file.path, file.data]));
  const recordedIds = new Set();

  for (const { path, data, parseError } of provenanceFiles) {
    // 壊れた記録も「記録はある」と数える（requireAll で「出典記録がない」を重ねて出さない）
    recordedIds.add(basename(path, '.json'));
    if (parseError) {
      errors.push(error(path, `JSON パースエラー: ${parseError}`));
      continue;
    }
    if (!validateSchema(data)) {
      for (const e of validateSchema.errors) {
        errors.push(error(path, `スキーマ違反 ${e.instancePath} ${e.message}`));
      }
      continue;
    }

    const expectedPath = `provenance/${data.machineId}.json`;
    if (path !== expectedPath) {
      errors.push(error(path, `ファイル名は ${expectedPath} にする`));
    }
    const entry = entryById.get(data.machineId);
    if (!entry) {
      errors.push(error(path, `index.json に無い機種ID: ${data.machineId}`));
      continue;
    }
    if (entry.file !== data.machineFile) {
      errors.push(
        error(path, `machineFile が index.json と違う: ${data.machineFile}（index: ${entry.file}）`)
      );
    }
    const machinePath = `machines/${entry.file}`;
    const machine = machineByPath.get(machinePath);
    if (!machine) {
      errors.push(error(path, `機種ファイルを読めない: ${machinePath}`));
      continue;
    }
    recordedIds.add(data.machineId);
    errors.push(...checkRecord(path, data, { machine, machinePath }, officialDomains));
  }

  if (requireAll) {
    for (const entry of entries) {
      if (!recordedIds.has(entry.id)) {
        errors.push(error(`provenance/${entry.id}.json`, '出典記録がない（全機種必須）'));
      }
    }
  }

  return { errors, warnings };
}

/**
 * 出典キーごとの種類を集める。出典キーの重複と、出典の URL のサイトとキーの確かめ（sourceProblems。記録の下書きと
 * 同じ規則・文面）をエラーにして errors に足す。
 * @param {Set<string> | null} officialDomains null は一覧を読めなかったとき
 */
function collectSourceKinds(path, sources, errors, officialDomains) {
  const sourceKinds = {};
  for (const source of sources) {
    if (source.key in sourceKinds) {
      errors.push(error(path, `出典キーの重複: ${source.key}`));
    }
    sourceKinds[source.key] = source.kind;
  }
  errors.push(...sourceProblems(sources, officialDomains).map((message) => error(path, message)));
  return sourceKinds;
}

/** values の出典キーが、記録の sources にあるか（items と removed で同じ文面） */
function unknownSourceErrors(path, key, values, sourceKinds) {
  return Object.keys(values)
    .filter((sourceKey) => !(sourceKey in sourceKinds))
    .map((sourceKey) => error(path, `${key}: sources に無い出典キー: ${sourceKey}`));
}

/**
 * unit が、機種ファイルの項目（entry。itemEntry の形）の種類と中身で決まる候補にあるか（allowedUnits）。
 * 候補の中から出典の表示の形に合わせて選んだかは、確かめられない。items と removed で同じ文面にする。
 * patterns 形式の項目（候補が空）は、記録できない理由と次にすること（patternsProblem。記録の下書きと同じ文面）。
 * @param {string} machinePath 機種ファイルのパス（patterns の書き直しのコマンドに出す）
 * @returns {string | null} 合わないときの説明
 */
function unitProblem(key, kind, entry, unit, machinePath) {
  const allowed = allowedUnits(kind, entry);
  if (allowed.length === 0) return `${key}: ${patternsProblem(kind, machinePath)}`;
  if (!allowed.includes(unit)) {
    return `${key}: unit=${unit} は使えない（機種ファイルの項目に合わせて ${allowed.join(' か ')} にする）`;
  }
  return null;
}

/** 値（出典の値・読み直し・採用値）が unit の形に合わないときのエラー。items と removed で同じ文面 */
function shapeErrors(path, key, unit, labelled) {
  return labelled
    .map(([label, value]) => [label, shapeError(unit, value)])
    .filter(([, problem]) => problem !== null)
    .map(([label, problem]) =>
      error(path, `${key}: ${label} が unit=${unit} の形に合わない（${problem}）`)
    );
}

/** 出典の値と読み直しの値に、形を確かめるための名前を付けて並べる */
function labelledValues(values, reread) {
  return [
    ...Object.entries(values).map(([sourceKey, value]) => [`values.${sourceKey}`, value]),
    ...(reread ? [['reread', reread.value]] : []),
  ];
}

function checkItem(path, item, sourceKinds, machineItems, machinePath) {
  const key = itemKey(item.kind, item.name);
  const errors = unknownSourceErrors(path, key, item.values, sourceKinds);

  // unit の候補は機種ファイルの項目の種類と中身で決まる（候補の中からは出典の表示の形に合わせて選ぶ。
  // これは確かめられない）。形の検査より先に見る
  const target = machineItems.get(key);
  if (target) {
    const problem = unitProblem(key, item.kind, target.entry, item.unit, machinePath);
    if (problem) {
      errors.push(error(path, problem));
      return errors;
    }
  }

  const labelled = [['adopted', item.adopted], ...labelledValues(item.values, item.reread)];
  const shapeProblems = shapeErrors(path, key, item.unit, labelled);
  errors.push(...shapeProblems);
  if (shapeProblems.length > 0) return errors;

  // 機種ファイルに無い項目は、そのエラーだけを出す。確率が分からないので status と値は確かめられない
  // （1つの原因に1つのエラー）
  if (!target) {
    errors.push(error(path, `${key}: 機種ファイルに無い項目の記録`));
    return errors;
  }
  const stored = storedMap(target.entry);
  const statusProblem = statusError(item, sourceKinds, { stored });
  if (statusProblem) errors.push(error(path, `${key}: ${statusProblem}`));

  // 確定・暫定の数値は、採用値を有効数字6桁にした値そのもの。残す値と設定の組・有無は 5.4 の一致（仕様 5.6）
  const valueProblem = machineValueProblem(item, target.entry);
  if (valueProblem) errors.push(error(path, `${key}: ${valueProblem}`));
  return errors;
}

/**
 * appId は、ID を持つ項目（ID を作る種類の項目と、確定演出などで previous に明示の id がある項目。hasItemId）
 * だけに書く（仕様 5.8）。種類の一覧をスキーマに書き写さないよう、ここで確かめる。
 */
function appIdErrors(path, key, removed) {
  const hasId = hasItemId(removed.kind, removed.previous);
  if (hasId && removed.appId === undefined) {
    return [
      error(path, `${key}: ID を持つ項目なので、appId（main でアプリが使っていた ID）を書く`),
    ];
  }
  if (!hasId && removed.appId !== undefined) {
    return [error(path, `${key}: ID を持たない項目なので、appId を書かない`)];
  }
  return [];
}

/**
 * 外す条件（仕様 5.5 の既存の値の規則4）に合わないときの説明（合えば null）。
 * 外す前の項目（entry）を今の値として、採否ルール（decideExistingItem）が「外す」を選ぶかを確かめる。
 * 読み直しを省くと、ちょんぼりすたの暫定（規則3）を素通りして外せてしまうので、読み直しが無く、
 * ちょんぼりすたの値と合う読み直しがあれば暫定になる場合は、読み直しを求める。
 * @param {object} removed 形を確かめた removed の項目
 * @param {object} entry itemEntry(removed.kind, removed.previous)
 * @param {Record<string, string>} sourceKinds
 * @returns {string | null}
 */
function removalProblem(removed, entry, sourceKinds) {
  const { unit, values } = removed;
  const input = {
    unit,
    values,
    sourceKinds,
    current: machineValue(entry, unit),
    stored: storedMap(entry),
    reread: removed.reread?.value,
  };
  const decision = decideExistingItem(input);
  if (decision.outcome !== 'remove') return `外す条件に合わない（${decision.status} にできる）`;
  return rereadWouldMakeProvisional(input) ? REREAD_BEFORE_REMOVAL : null;
}

/**
 * 外した項目（removed）の記録を確かめる（仕様 5.7）。previous は外す前の機種ファイルの項目そのもので、
 * それを今の値として、unit・値の形・外す条件を items と同じ規則で確かめる。
 * previous が main の項目そのものかは、main と比べる検査（ledger-against-base.mjs の checkLedgerAgainstBase）が確かめる。
 */
function checkRemoved(path, removed, sourceKinds, machinePath) {
  const key = itemKey(removed.kind, removed.name);
  const errors = [
    ...unknownSourceErrors(path, key, removed.values, sourceKinds),
    ...appIdErrors(path, key, removed),
  ];
  const entry = itemEntry(removed.kind, removed.previous);
  const problem = unitProblem(key, removed.kind, entry, removed.unit, machinePath);
  if (problem) return [...errors, error(path, problem)];

  const shapeProblems = shapeErrors(
    path,
    key,
    removed.unit,
    labelledValues(removed.values, removed.reread)
  );
  if (shapeProblems.length > 0) return [...errors, ...shapeProblems];

  const removal = removalProblem(removed, entry, sourceKinds);
  if (removal) errors.push(error(path, `${key}: ${removal}`));
  return errors;
}

/** retiredIds の行を見分けるキー（kind・name・appId） */
function retiredRowKey({ kind, name, appId }) {
  return JSON.stringify([kind, name, appId]);
}

/**
 * 外した ID の台帳（retiredIds。足すだけ）を確かめる（仕様 5.7・5.8）。
 * - ID を持つ種類の行だけ・同じ行を2つ書かない
 * - appId のある removed は、同じ kind・name・appId の行が retiredIds にある
 * - 今の機種ファイルの ID を持つ項目が、台帳の ID を同じ範囲（idScope）で使っていない。main を読まずに
 *   止めるので、PR をまたいでも、外した項目を足し直した後でも効く。外したはずの項目が機種ファイルに残って
 *   いるときは、そのエラー（checkRecord）だけにする（自分の ID の再利用を重ねない）
 * @param {Map<string, object>} machineItems 今の機種ファイルの項目（項目キー → 項目）
 * @param {Map<string, string>} itemIds 今の機種ファイルの ID（項目キー → ID）
 */
function retiredIdErrors(path, record, machineItems, itemIds) {
  const errors = [];
  const rows = new Set();
  for (const row of record.retiredIds) {
    const key = itemKey(row.kind, row.name);
    if (!DERIVED_ID_KINDS.has(row.kind) && !EXPLICIT_ID_KINDS.has(row.kind)) {
      errors.push(error(path, `${key}: ID を持たない種類は retiredIds に書かない`));
    }
    if (rows.has(retiredRowKey(row))) {
      errors.push(error(path, `${key}: retiredIds の重複（${row.appId}）`));
    }
    rows.add(retiredRowKey(row));
  }
  for (const removed of record.removed) {
    // appId を書かない種類の appId は appIdErrors が報告する（1つの原因に1つのエラー）
    if (removed.appId === undefined || !hasItemId(removed.kind, removed.previous)) continue;
    if (rows.has(retiredRowKey(removed))) continue;
    const key = itemKey(removed.kind, removed.name);
    errors.push(
      error(
        path,
        `${key}: removed の appId（${removed.appId}）が retiredIds に無い（外した ID の台帳に足す）`
      )
    );
  }
  const removedKeys = new Set(record.removed.map((removed) => itemKey(removed.kind, removed.name)));
  const retired = new Set(
    record.retiredIds.map((row) => scopedId(itemKey(row.kind, row.name), row.appId))
  );
  for (const [key, id] of itemIds) {
    if (!retired.has(scopedId(key, id))) continue;
    if (removedKeys.has(key) && machineItems.has(key)) continue;
    // 名前から作る ID が繰り上がって重なった既存の項目（仁・義・礼から義を外し、礼を固定し忘れる）は、main の ID を
    // id に書いて固定するのが直し方。別の新しい id を付けると、check:base が「ID が変わった」で止める
    errors.push(
      error(
        path,
        `${key}: 外した項目の ID（${id}）を使っている（既存の項目なら main の ID を id に書いて固定する。新しい項目なら別の明示の id を付ける）`
      )
    );
  }
  return errors;
}

/** 1つの出典記録を、機種ファイル（machine。パスは machinePath）と照らす */
function checkRecord(path, record, { machine, machinePath }, officialDomains) {
  const errors = [];
  const sourceKinds = collectSourceKinds(path, record.sources, errors, officialDomains);

  // 同じ名前の項目は listMachineItems が #2 などを付けて区別するので、キーは重ならない。
  // 区別できない名前（「#数字」を含む名前との重なり）と「::」を含む名前は例外になるので、エラーとして報告する
  let machineItems;
  let itemIds;
  try {
    machineItems = new Map(
      listMachineItems(machine).map((item) => [itemKey(item.kind, item.name), item])
    );
    itemIds = collectItemIds(machine);
  } catch (e) {
    errors.push(error(path, e.message));
    return errors;
  }

  const recorded = new Set();
  for (const item of record.items) {
    const key = itemKey(item.kind, item.name);
    if (recorded.has(key)) {
      errors.push(error(path, `${key}: 出典記録の項目が重複`));
      continue;
    }
    recorded.add(key);
    errors.push(...checkItem(path, item, sourceKinds, machineItems, machinePath));
  }

  for (const key of machineItems.keys()) {
    if (!recorded.has(key)) errors.push(error(path, `${key}: 出典記録がない項目`));
  }
  for (const candidate of record.candidates) {
    const key = itemKey(candidate.kind, candidate.name);
    if (machineItems.has(key)) {
      errors.push(error(path, `${key}: 候補（未採用）なのに機種ファイルにある`));
    }
  }
  for (const removed of record.removed) {
    const key = itemKey(removed.kind, removed.name);
    if (machineItems.has(key)) {
      errors.push(error(path, `${key}: 外したはずの項目が機種ファイルにある`));
    }
    errors.push(...checkRemoved(path, removed, sourceKinds, machinePath));
  }
  errors.push(...retiredIdErrors(path, record, machineItems, itemIds));
  return errors;
}
