import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { basename, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DERIVED_ID_KINDS } from '../lib/derived-ids.mjs';
import { OFFICIAL_DOMAINS_PATH } from '../lib/load-provenance.mjs';
import {
  CHONBORISTA_KEY,
  allowedUnits,
  decideExistingItem,
  itemEntry,
  itemKey,
  listMachineItems,
  machineValue,
  machineValueProblem,
  shapeError,
  statusError,
  storedMap,
} from '../lib/provenance.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CHONBORISTA_URL_PREFIX = 'https://chonborista.com/';
const CHONBORISTA_SITE = 'chonborista.com';

/** 属性型 JP ドメイン（example.co.jp など）の2番目のラベル。この形は末尾3ラベルを1つのサイトにする */
const JP_SECOND_LEVEL_LABELS = new Set(['co', 'ne', 'or', 'ac', 'go', 'ed', 'gr', 'lg', 'ad']);

function error(file, message) {
  return { file, type: 'provenance', severity: 'error', message };
}

/** ajv でスキーマ（schemas/ の中のファイル名）を読み、確かめる関数を作る */
function compileSchema(name) {
  const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas', name), 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
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
    const machine = machineByPath.get(`machines/${entry.file}`);
    if (!machine) {
      errors.push(error(path, `機種ファイルを読めない: machines/${entry.file}`));
      continue;
    }
    recordedIds.add(data.machineId);
    errors.push(...checkRecord(path, data, machine, officialDomains));
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
 * 出典の URL のサイト（登録ドメイン）。サブドメインは同じサイトにまとめる
 * （例: sp.chonborista.com → chonborista.com、www.example.co.jp → example.co.jp）。
 * ホスト名を小文字にし、空のラベル（末尾の「.」など）と先頭の「www.」を除いてから、
 * ラベルが3つ以上の属性型 JP ドメイン（`.co.jp` など）は末尾3ラベル、それ以外は末尾2ラベルにする。
 * @returns {string | null} URL として読めなければ null
 */
function siteOf(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  const labels = hostname
    .toLowerCase()
    .split('.')
    .filter((label) => label !== '');
  if (labels.length > 1 && labels[0] === 'www') labels.shift();
  const attributeJp =
    labels.length >= 3 && labels.at(-1) === 'jp' && JP_SECOND_LEVEL_LABELS.has(labels.at(-2));
  return labels.slice(attributeJp ? -3 : -2).join('.');
}

/**
 * 出典の URL のサイトで確かめること（仕様 5.7）: 同じサイトを2つの出典に登録しない・chonborista.com は
 * キーを chonborista にする・公式の出典は、サイトがメーカーの公式ドメインの一覧にある。
 * @param {Map<string, string>} keyBySite これまでの出典のサイト → 出典キー（ここで足す）
 * @param {Set<string> | null} officialDomains null は一覧を読めなかったとき
 */
function siteErrors(path, source, site, keyBySite, officialDomains) {
  const errors = [];
  // 同じサイトを2つの出典として数えると、「2サイト以上で一致」を1サイトで満たせてしまう
  const other = keyBySite.get(site);
  if (other !== undefined && other !== source.key) {
    errors.push(
      error(path, `同じサイト（${site}）を2つの出典に登録している: ${other}・${source.key}`)
    );
  }
  keyBySite.set(site, source.key);
  // 採用の優先順と provisional-chonborista は、ちょんぼりすたをキーで見分ける。別のキーや official で
  // 登録すると、ちょんぼりすたの値を公式や別サイトとして数えてしまう
  if (site === CHONBORISTA_SITE && source.key !== CHONBORISTA_KEY) {
    errors.push(
      error(path, `${CHONBORISTA_SITE} の出典は、キーを ${CHONBORISTA_KEY} にする: ${source.key}`)
    );
  }
  // 公式は採用で最優先になるので、記録する側の申告だけにしない（本人の決定 2026-09-27）
  if (source.kind === 'official' && officialDomains === null) {
    errors.push(
      error(
        path,
        `公式の出典を確かめられない（公式ドメインの一覧 ${OFFICIAL_DOMAINS_PATH} を読めない）: ${site}`
      )
    );
  } else if (source.kind === 'official' && !officialDomains.has(site)) {
    errors.push(
      error(path, `公式の出典のドメインが一覧（${OFFICIAL_DOMAINS_PATH}）に無い: ${site}`)
    );
  }
  return errors;
}

function collectSourceKinds(path, sources, errors, officialDomains) {
  const sourceKinds = {};
  const keyBySite = new Map();
  for (const source of sources) {
    if (source.key in sourceKinds) {
      errors.push(error(path, `出典キーの重複: ${source.key}`));
    }
    sourceKinds[source.key] = source.kind;
    const site = siteOf(source.url);
    if (site === null) {
      // スキーマは https:// で始まることしか見ない。読めない URL はサイトが分からず、サイトの判定を
      // 黙って外れるので、エラーにしてサイトの判定から外す
      errors.push(error(path, `出典の URL を読めない: ${source.url}`));
    } else {
      errors.push(...siteErrors(path, source, site, keyBySite, officialDomains));
    }
    if (source.key === CHONBORISTA_KEY) {
      if (!source.url.startsWith(CHONBORISTA_URL_PREFIX)) {
        errors.push(error(path, `chonborista の URL は ${CHONBORISTA_URL_PREFIX} で始める`));
      }
      if (source.kind !== 'analysis-site') {
        errors.push(error(path, `${CHONBORISTA_KEY} の出典は kind を analysis-site にする`));
      }
    }
  }
  return sourceKinds;
}

function domainsError(file, message) {
  return { file, type: 'official-domains', severity: 'error', message };
}

/**
 * メーカーの公式ドメインの一覧（config/official-domains.json）を確かめる（仕様 5.7）。
 * - 読めない・スキーマ（schemas/official-domains.schema.json）に合わないときはエラー
 * - domain は登録ドメインそのもの（siteOf と同じ計算で、www.・サブドメインを付けない）で、重複しない
 * 問題が1つでもあれば、一覧を使わない（domains は null。空の一覧として続けると、公式の出典を黙って落とす）。
 *
 * @param {{ path: string, data: object | null, readError?: string }} file loadOfficialDomainsFile の結果
 * @returns {{ errors: object[], warnings: object[], domains: Set<string> | null }}
 */
export function validateOfficialDomains(file) {
  const { path, data, readError } = file;
  if (readError !== undefined || data === null) {
    const errors = [domainsError(path, `公式ドメインの一覧を読めない: ${readError}`)];
    return { errors, warnings: [], domains: null };
  }
  const validateSchema = compileSchema('official-domains.schema.json');
  if (!validateSchema(data)) {
    const errors = validateSchema.errors.map((e) =>
      domainsError(path, `スキーマ違反 ${e.instancePath} ${e.message}`)
    );
    return { errors, warnings: [], domains: null };
  }
  const errors = [];
  const domains = new Set();
  for (const { domain } of data.domains) {
    const site = siteOf(`https://${domain}/`);
    if (site !== domain) {
      errors.push(
        domainsError(
          path,
          `公式ドメインの一覧の domain は登録ドメインにする（www.・サブドメインを付けない）: ${domain}（登録ドメイン: ${site}）`
        )
      );
    }
    if (domains.has(domain)) errors.push(domainsError(path, `公式ドメインの一覧で重複: ${domain}`));
    domains.add(domain);
  }
  return { errors, warnings: [], domains: errors.length === 0 ? domains : null };
}

/** values の出典キーが、記録の sources にあるか（items と removed で同じ文面） */
function unknownSourceErrors(path, key, values, sourceKinds) {
  return Object.keys(values)
    .filter((sourceKey) => !(sourceKey in sourceKinds))
    .map((sourceKey) => error(path, `${key}: sources に無い出典キー: ${sourceKey}`));
}

/**
 * unit が、機種ファイルの項目（entry。itemEntry の形）の種類と中身で決まるものか（allowedUnits）。
 * 記録する側は選べない。items と removed で同じ文面にする。
 * @returns {string | null} 合わないときの説明
 */
function unitProblem(key, kind, entry, unit) {
  const allowed = allowedUnits(kind, entry);
  if (allowed.length === 0) {
    return `${key}: patterns 形式の項目は、出典記録の形を決めるまで記録できない（段階1で決める）`;
  }
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

function checkItem(path, item, sourceKinds, machineItems) {
  const key = itemKey(item.kind, item.name);
  const errors = unknownSourceErrors(path, key, item.values, sourceKinds);

  // unit は機種ファイルの項目の種類と中身で決まる（記録する側は選べない）。形の検査より先に見る
  const target = machineItems.get(key);
  if (target) {
    const problem = unitProblem(key, item.kind, target.entry, item.unit);
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
 * appId は、アプリが ID を作る種類（DERIVED_ID_KINDS）だけに書く（仕様 5.8）。
 * 種類の一覧をスキーマに書き写さないよう、ここで確かめる。
 */
function appIdErrors(path, key, removed) {
  const derived = DERIVED_ID_KINDS.has(removed.kind);
  if (derived && removed.appId === undefined) {
    return [
      error(path, `${key}: ID を作る種類なので、appId（main でアプリが作っていた ID）を書く`),
    ];
  }
  if (!derived && removed.appId !== undefined) {
    return [error(path, `${key}: ID を作らない種類なので、appId を書かない`)];
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
  };
  const decision = decideExistingItem({ ...input, reread: removed.reread?.value });
  if (decision.outcome !== 'remove') return `外す条件に合わない（${decision.status} にできる）`;
  const chonborista = values[CHONBORISTA_KEY];
  if (removed.reread === undefined && chonborista !== undefined) {
    const ifReread = decideExistingItem({ ...input, reread: chonborista });
    if (ifReread.status === 'provisional-chonborista') {
      return '外す前に、ちょんぼりすたの値の読み直しが要る（合えば provisional-chonborista にする）';
    }
  }
  return null;
}

/**
 * 外した項目（removed）の記録を確かめる（仕様 5.7）。previous は外す前の機種ファイルの項目そのもので、
 * それを今の値として、unit・値の形・外す条件を items と同じ規則で確かめる。
 * previous が main の項目そのものかは、main と比べる検査（checkRemovedLedger）が確かめる。
 */
function checkRemoved(path, removed, sourceKinds) {
  const key = itemKey(removed.kind, removed.name);
  const errors = [
    ...unknownSourceErrors(path, key, removed.values, sourceKinds),
    ...appIdErrors(path, key, removed),
  ];
  const entry = itemEntry(removed.kind, removed.previous);
  const problem = unitProblem(key, removed.kind, entry, removed.unit);
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

function checkRecord(path, record, machine, officialDomains) {
  const errors = [];
  const sourceKinds = collectSourceKinds(path, record.sources, errors, officialDomains);

  // 同じ名前の項目は listMachineItems が #2 などを付けて区別するので、キーは重ならない。
  // 区別できない名前（「#数字」を含む名前との重なり）と「::」を含む名前は例外になるので、エラーとして報告する
  let machineItems;
  try {
    machineItems = new Map(
      listMachineItems(machine).map((item) => [itemKey(item.kind, item.name), item])
    );
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
    errors.push(...checkItem(path, item, sourceKinds, machineItems));
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
    errors.push(...checkRemoved(path, removed, sourceKinds));
  }
  return errors;
}
