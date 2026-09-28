import { compileSchemaObject } from './compile-schema.mjs';
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
/** main の出典記録を確かめるスキーマ（main から読む。比べる側のスキーマではない） */
const BASE_SCHEMA = 'schemas/provenance.schema.json';

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
 * main のスキーマ（main の schemas/provenance.schema.json）で確かめる関数を作る。main の記録は、main に入れたときの
 * 決まり（main のスキーマ）で確かめる（比べる側のスキーマで確かめると、スキーマを厳しくする PR で、main の決まりで
 * 正しかった記録まで通らなくなる）。main に記録があるのにスキーマを読めない・使えなければ例外を投げる
 * @param {string[]} paths main の記録のパス（例外の文面に出す）
 */
function compileBaseSchema(readBase, paths) {
  try {
    return compileSchemaObject(JSON.parse(readBase(BASE_SCHEMA)));
  } catch (e) {
    const others = paths.length > 1 ? ` ほか${paths.length - 1}件` : '';
    throw new Error(
      `main の出典記録を確かめられない: main のスキーマ（${BASE_SCHEMA}）を読めない（記録: ${paths[0]}${others}）: ${e.message}`,
      { cause: e }
    );
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * main の記録のうち、main と比べる検査が読む欄の形の問題（items は配列。removed・retiredIds は無いか配列で、
 * retiredIds の行はオブジェクト）。今のスキーマに合う記録ならいつも空。main のスキーマが緩くても（{} など）、
 * 検査が読む前に記録のパスを付けて止めるため
 * @returns {string[]}
 */
function readableShapeProblems(record) {
  const problems = [];
  if (!Array.isArray(record.items)) problems.push('items が配列でない');
  for (const field of ['removed', 'retiredIds']) {
    const value = record[field];
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      problems.push(`${field} が配列でない`);
    }
  }
  if (Array.isArray(record.retiredIds) && !record.retiredIds.every(isObject)) {
    problems.push('retiredIds の行がオブジェクトでない');
  }
  return problems;
}

/**
 * main の記録1つの問題。main のスキーマに合うか、パスが provenance/<machineId>.json か、machineId が main の
 * index.json にあり、machineFile が main の index.json のその機種の file と同じか（validate の出典記録の検証器
 * provenance-validator.mjs と同じ決まり）と、検査が読む欄の形（readableShapeProblems）。スキーマに合わなければ、
 * スキーマの問題だけを返す
 * @param {Map<string, object>} baseIndex main の index.json の機種（indexById）
 * @returns {string[]}
 */
function baseRecordProblems(path, record, validateSchema, baseIndex) {
  if (!validateSchema(record)) {
    return validateSchema.errors.map((e) => `スキーマ違反 ${e.instancePath || '/'} ${e.message}`);
  }
  const problems = [];
  const expectedPath = `provenance/${record.machineId}.json`;
  if (path !== expectedPath) problems.push(`ファイル名は ${expectedPath} にする`);
  const entry = baseIndex.get(record.machineId);
  if (!entry) {
    problems.push(`main の index.json に無い機種ID: ${record.machineId}`);
  } else if (entry.file !== record.machineFile) {
    problems.push(
      `machineFile が main の index.json と違う: ${record.machineFile}（index: ${entry.file}）`
    );
  }
  return [...problems, ...readableShapeProblems(record)];
}

/**
 * main の記録1つを確かめ、問題があれば記録のパスと理由を付けて例外を投げる。確かめの途中の例外（main のスキーマが
 * 緩いときの null の記録など）も、同じ形の文面にする
 */
function assertBaseRecord(path, record, validateSchema, baseIndex) {
  let problems;
  try {
    problems = baseRecordProblems(path, record, validateSchema, baseIndex);
  } catch (e) {
    throw new Error(`main の出典記録が不正: ${path}: ${e.message}`, { cause: e });
  }
  if (problems.length > 0) {
    throw new Error(`main の出典記録が不正: ${path}: ${problems.join('; ')}`);
  }
}

/**
 * main の provenance/ にある出典記録を読み、1つずつ確かめる。比べる側で記録のファイルごと消した場合も見つけるため、
 * 比べる側の記録からでなく main を列挙する。main の記録は「main に入れたときに確かめを通った」ものとして、マージ済みの
 * 採用を確かめ直さない・removed と retiredIds を照らす根拠にするので、main のスキーマ（BASE_SCHEMA）と main の
 * index.json に合わない記録は使わない（null・配列・必須欄の欠けなどを「記録が無い」「空の台帳」として扱わない）。
 * 読めない・合わない記録があれば、記録のパスと理由を付けて例外を投げる（CLI は終了コード 2 にする）。main の
 * スキーマが緩くても、検査が読む欄の形が合わない記録は、読む前に同じ形の例外にする（assertBaseRecord）。
 * main に記録が無い機種は、確かめを飛ばす理由が無い（すべての項目を確かめる）。記録が1つも無ければスキーマを読まない
 * @param {(path: string) => string} readBase
 * @param {(dir: string) => string[]} listBase
 * @returns {object[]} main のスキーマと index.json に合う記録
 */
export function loadBaseRecords(readBase, listBase) {
  const paths = listBase('provenance').filter((path) => path.endsWith('.json'));
  if (paths.length === 0) return [];
  const records = paths.map((path) => {
    try {
      return JSON.parse(readBase(path));
    } catch (e) {
      throw new Error(`main の出典記録を読めない: ${path}: ${e.message}`, { cause: e });
    }
  });
  const validateSchema = compileBaseSchema(readBase, paths);
  const baseIndex = indexById(readBase);
  paths.forEach((path, i) => assertBaseRecord(path, records[i], validateSchema, baseIndex));
  return records;
}

/** main の出典記録（loadBaseRecords で確かめたもの）の項目を、機種 ID ごとにまとめる */
function recordItemsByMachine(records) {
  const byId = new Map();
  for (const record of records) {
    byId.set(record.machineId, [...(byId.get(record.machineId) ?? []), ...record.items]);
  }
  return byId;
}

/** mergedAdoption の結果 */
const MERGED = 'merged';
const VALUE_CHANGED = 'value-changed';
const CHECK = 'check';

/**
 * main の記録と比べた項目の扱い。
 * - MERGED（マージ済みの採用）: main の同じ機種の記録に、JSON として同じ項目（kind・name・unit・status・adopted・
 *   values・reread のすべて）があり、機種ファイルの値（unit の形の値）も main と同じ（sameMachineValue）。main に
 *   入れたときに採否の確かめを通った採用なので、確かめ直さない。確かめ直すと、main の値が入れた暫定の値になって
 *   いるので、ちょんぼりすたの値が main の値を裏づけて、関係ない PR が止まる（最終レビュー C1）
 * - VALUE_CHANGED: main の記録に JSON として同じ項目があるのに、機種ファイルの値だけが main から変わった
 *   （記録を変えずに値を変えた）
 * - CHECK: それ以外。どちらかの機種ファイルに項目が無いか、main の値を unit で表せない（null）ときも、確かめる側に倒す
 */
function mergedAdoption(item, baseRecordItems, baseItem, headItem) {
  if (!baseItem || !headItem) return CHECK;
  if (!baseRecordItems.some((recorded) => sameJson(recorded, item))) return CHECK;
  const baseValue = machineValue(baseItem.entry, item.unit);
  if (baseValue === null) return CHECK;
  const headValue = machineValue(headItem.entry, item.unit);
  return sameMachineValue(item.unit, baseValue, headValue) ? MERGED : VALUE_CHANGED;
}

/**
 * 機種ファイルの値（unit の形。machineValue）が main と同じか。設定の組（settings）は confirmed・excluded を集合
 * として比べる（並びは問わない。kept-single-source の valuesEqual と同じ考え）。数値の unit と有無は JSON として
 * 同じか（数値は完全一致）
 */
function sameMachineValue(unit, baseValue, headValue) {
  if (sameJson(baseValue, headValue)) return true;
  return unit === 'settings' && valuesEqual(unit, baseValue, headValue);
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
 * main の provenance/ を列挙して読み、main のスキーマと index.json で確かめる。loadBaseRecords）。記録を変えずに
 * 暫定の値だけを変えた項目は、その原因を1件だけ出す。main の項目は、終了画面の patterns を書き直した形で比べる
 * （baseMachineItems）。
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
      const adoption = mergedAdoption(item, recorded, baseItem, headItem);
      if (adoption === MERGED) continue;
      const baseValue = baseItem ? machineValue(baseItem.entry, item.unit) : null;

      if (item.status === PROVISIONAL) {
        // 原因は「値が採用値から変わった」なので、「main の値を裏づける出典がある」を出さず、この1件だけにする
        // （kept-single-source は下の「値が main から変わった」が同じ原因を指す）
        if (adoption === VALUE_CHANGED) {
          problems.push(
            `${id}: ${key}: 記録を変えずに機種ファイルの値を main から変えている（記録も作り直すか、値を main に戻す）`
          );
          continue;
        }
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

/**
 * main に出典記録がある機種で、比べる側の記録（provenance/<機種ID>.json）を消していないかを確かめる（仕様 5.7。
 * 記録がある機種では、値を直すときに記録も直す。記録のファイルを消すと、validate も採否ルールの検査もその機種を
 * 見なくなり、値の見直しが採否ルールの確かめを受けない）。main の記録は loadBaseRecords で読む（main のスキーマと
 * index.json に合わなければ例外。CLI は終了コード 2 にする）。
 * 機種ごと比べる側の index.json から消した場合は対象外（ID の検査 checkDerivedIds が消えた項目を報告する）。
 * 比べる側の記録の中身は validate が確かめるので、ここではパスの有無だけを見る（壊れた記録も「ある」と数える。
 * 別のパスに置いた記録は数えない。ファイル名の誤りは validate も止める）。
 *
 * @param {{ readBase: (path: string) => string, readHead: (path: string) => string,
 *   listBase: (dir: string) => string[], provenanceFiles: Array<{ path?: string, data: object | null }> }} io
 *   checkRulesAgainstBase と同じ
 * @returns {string[]} 問題の説明。空なら問題なし
 */
export function checkDeletedBaseRecords({ readBase, readHead, listBase, provenanceFiles }) {
  const recordedIds = new Set(
    loadBaseRecords(readBase, listBase).map((record) => record.machineId)
  );
  const headById = indexById(readHead);
  const headPaths = new Set(provenanceFiles.map((file) => file.path));
  return [...recordedIds]
    .filter((id) => headById.has(id) && !headPaths.has(`provenance/${id}.json`))
    .map(
      (id) => `${id}: main に出典記録がある機種の記録を消している（記録がある機種では記録も直す）`
    );
}
