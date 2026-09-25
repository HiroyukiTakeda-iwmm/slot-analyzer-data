import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { basename, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CHONBORISTA_KEY,
  allowedUnits,
  itemKey,
  listMachineItems,
  machineValue,
  shapeError,
  statusError,
  valuesAgree,
} from '../lib/provenance.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CHONBORISTA_URL_PREFIX = 'https://chonborista.com/';

function error(file, message) {
  return { file, type: 'provenance', severity: 'error', message };
}

/**
 * 出典記録（provenance/*.json）を検証する（仕様 5.7）。
 *
 * @param {Array<{ path: string, data: object }>} machineFiles machines/ 配下の機種ファイル
 * @param {object} indexData machines/index.json の中身
 * @param {Array<{ path: string, data: object | null, parseError?: string }>} provenanceFiles
 * @param {{ requireAll?: boolean }} [options] requireAll: 全機種に出典記録を求める（段階3）
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function validateProvenance(machineFiles, indexData, provenanceFiles, options = {}) {
  const { requireAll = false } = options;
  const errors = [];
  const warnings = [];

  const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas/provenance.schema.json'), 'utf-8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);

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
    errors.push(...checkRecord(path, data, machine));
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

/** 出典の URL のサイト（ホスト名。先頭の www. は除く） */
function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function collectSourceKinds(path, sources, errors) {
  const sourceKinds = {};
  const keyBySite = new Map();
  for (const source of sources) {
    if (source.key in sourceKinds) {
      errors.push(error(path, `出典キーの重複: ${source.key}`));
    }
    sourceKinds[source.key] = source.kind;
    // 同じサイトを2つの出典として数えると、「2サイト以上で一致」を1サイトで満たせてしまう
    const site = siteOf(source.url);
    const other = keyBySite.get(site);
    if (other !== undefined && other !== source.key) {
      errors.push(
        error(path, `同じサイト（${site}）を2つの出典に登録している: ${other}・${source.key}`)
      );
    }
    keyBySite.set(site, source.key);
    if (source.key === CHONBORISTA_KEY && !source.url.startsWith(CHONBORISTA_URL_PREFIX)) {
      errors.push(error(path, `chonborista の URL は ${CHONBORISTA_URL_PREFIX} で始める`));
    }
  }
  return sourceKinds;
}

function checkItem(path, item, sourceKinds, machineItems) {
  const errors = [];
  const key = itemKey(item.kind, item.name);

  for (const sourceKey of Object.keys(item.values)) {
    if (!(sourceKey in sourceKinds)) {
      errors.push(error(path, `${key}: sources に無い出典キー: ${sourceKey}`));
    }
  }

  // unit は機種ファイルの項目の種類と中身で決まる（記録する側は選べない）。形の検査より先に見る
  const target = machineItems.get(key);
  if (target) {
    const allowed = allowedUnits(item.kind, target.entry);
    if (!allowed.includes(item.unit)) {
      errors.push(
        error(
          path,
          `${key}: unit=${item.unit} は使えない（機種ファイルの項目に合わせて ${allowed.join(' か ')} にする）`
        )
      );
      return errors;
    }
  }

  const labelled = [
    ['adopted', item.adopted],
    ...Object.entries(item.values).map(([sourceKey, value]) => [`values.${sourceKey}`, value]),
    ...(item.reread ? [['reread', item.reread.value]] : []),
  ];
  const shapeProblems = labelled
    .map(([label, value]) => [label, shapeError(item.unit, value)])
    .filter(([, problem]) => problem !== null);
  for (const [label, problem] of shapeProblems) {
    errors.push(error(path, `${key}: ${label} が unit=${item.unit} の形に合わない（${problem}）`));
  }
  if (shapeProblems.length > 0) return errors;

  const statusProblem = statusError(item, sourceKinds);
  if (statusProblem) errors.push(error(path, `${key}: ${statusProblem}`));

  if (!target) {
    errors.push(error(path, `${key}: 機種ファイルに無い項目の記録`));
    return errors;
  }
  const actual = machineValue(target.entry, item.unit);
  if (actual === null) {
    errors.push(error(path, `${key}: 機種ファイルの値を unit=${item.unit} で表せない`));
  } else if (!valuesAgree(item.unit, actual, item.adopted)) {
    errors.push(error(path, `${key}: 機種ファイルの値が採用値と一致しない`));
  }
  return errors;
}

function checkRecord(path, record, machine) {
  const errors = [];
  const sourceKinds = collectSourceKinds(path, record.sources, errors);

  // 同じ名前の項目は listMachineItems が #2 などを付けて区別するので、キーは重ならない。
  // 区別できない名前（「#数字」を含む名前との重なり）は例外になるので、エラーとして報告する
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
  }
  return errors;
}
