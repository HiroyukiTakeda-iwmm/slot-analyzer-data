#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERIOD = Object.freeze({
  from: '2026-01-01',
  through: '2026-09-30',
  region: 'Japan',
  kind: 'pachislot',
});
const MONTH_COUNTS = Object.freeze([4, 6, 2, 9, 5, 4, 7, 9, 6]);
const TOTAL_COUNTS = Object.freeze({
  total: 52,
  existing: 26,
  added: 26,
  uniqueDataIds: 51,
  unresolved: 0,
});
const VARIANT_MODELS = Object.freeze({
  '30mm_coin': 'SBニューキングハナハナVPA-30',
  smart_slot: 'LBニューキングハナハナVPF',
});
const SHARED_ID = 'new-king-hanahana-v';
const SOURCE_HOSTS = Object.freeze({
  'P-WORLD': 'www.p-world.co.jp',
  一撃: '1geki.jp',
  DMMぱちタウン: 'p-town.dmm.com',
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const nameText = (value) =>
  typeof value === 'string'
    ? value
        .normalize('NFKC')
        .replace(/[\s‐−–—-]/gu, '')
        .toLowerCase()
    : '';

export function normalizeMachineName(value) {
  return nameText(value)
    .replace(/^(?:スマート沖スロ|スマスロ|lbパチスロ|lパチスロ|パチスロ|スロット|lb|l|s)/u, '')
    .replace('(うなと)', '');
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function checkHeader(catalog, errors) {
  if (catalog.schemaVersion !== 1) errors.push('台帳のschemaVersionは1にしてください');
  if (
    !isObject(catalog.scope) ||
    Object.entries(PERIOD).some(([key, value]) => catalog.scope[key] !== value)
  ) {
    errors.push('対象期間・地域・機種区分は2026-01-01〜2026-09-30の日本のパチスロで固定です');
  }
  if (!validDate(catalog.retrievedAt) || catalog.retrievedAt < PERIOD.through)
    errors.push('台帳の取得日が不正です');
  if (!hasText(catalog.sourceInterpretation))
    errors.push('媒体のメーカー表記差などの出典説明が必要です');
  if (
    /\/Users\/|\/home\/|\/private\/|file:\/\/|"(?:snapshot|workRoot)"\s*:/u.test(
      JSON.stringify(catalog)
    )
  ) {
    errors.push('公開台帳へローカル保存先を含めないでください');
  }
}

function countRows(rows) {
  return {
    total: rows.length,
    existing: rows.filter((row) => row?.status === 'existing').length,
    added: rows.filter((row) => row?.status === 'added').length,
    uniqueDataIds: new Set(rows.map((row) => row?.dataId)).size,
    unresolved: rows.filter(
      (row) => !hasText(row?.dataId) || !['existing', 'added'].includes(row?.status)
    ).length,
  };
}

function checkSummary(catalog, errors) {
  const counts = countRows(catalog.machines);
  if (counts.total !== TOTAL_COUNTS.total) errors.push('対象の52件をすべて台帳へ保持してください');
  if (
    !isObject(catalog.summary) ||
    Object.entries(TOTAL_COUNTS).some(
      ([key, value]) => catalog.summary[key] !== value || counts[key] !== value
    )
  ) {
    errors.push('台帳の集計が固定対象件数または実際の行数と一致しません');
  }
}

function checkMonths(catalog, errors) {
  if (
    !Array.isArray(catalog.monthlyCoverage) ||
    catalog.monthlyCoverage.length !== MONTH_COUNTS.length
  ) {
    errors.push('月別集計は2026年1月〜9月の9件が必要です');
    return;
  }
  for (const [offset, total] of MONTH_COUNTS.entries()) {
    const month = `2026-${String(offset + 1).padStart(2, '0')}`;
    const matches = catalog.monthlyCoverage.filter((row) => row?.month === month);
    const actual = countRows(
      catalog.machines.filter(
        (row) => typeof row?.introducedAt === 'string' && row.introducedAt.startsWith(month)
      )
    );
    const existing = offset < 5 ? total : 0;
    const expected = { total, existing, added: total - existing };
    if (
      matches.length !== 1 ||
      Object.entries(expected).some(
        ([key, value]) => matches[0]?.[key] !== value || actual[key] !== value
      )
    ) {
      errors.push(`${month}: 月別集計が対象件数・登録状態と一致しません`);
    }
  }
}

function sourceCalendarMatches(source, row) {
  const url = httpsUrl(source.url);
  if (!url || url.hostname !== SOURCE_HOSTS[source.publisher]) return false;
  const month = row.introducedAt.slice(0, 7);
  if (source.publisher === 'P-WORLD')
    return (
      url.pathname === '/database/machine/introduce_calendar.cgi' &&
      url.searchParams.get('year_month') === month
    );
  if (source.publisher === '一撃')
    return url.pathname === `/newmachinecalender/${month.replace('-', '')}/`;
  return (
    url.pathname === '/machines/new_calendar' &&
    url.searchParams.get('year') === '2026' &&
    Number(url.searchParams.get('month')) === Number(month.slice(-2))
  );
}

function checkSources(row, retrievedAt, errors) {
  if (!Array.isArray(row.sources)) {
    errors.push(`${row.calendarKey}: 導入日の出典が必要です`);
    return;
  }
  const publishers = new Set(row.sources.map((source) => source?.publisher));
  if (publishers.size < 2 || !publishers.has('P-WORLD'))
    errors.push(`${row.calendarKey}: P-WORLDを含む2媒体以上で照合してください`);
  for (const source of row.sources) {
    const basic = isObject(source) && hasText(source.name) && validDate(source.retrievedAt);
    if (
      !basic ||
      source.introducedAt !== row.introducedAt ||
      source.retrievedAt > retrievedAt ||
      source.retrievedAt < source.introducedAt
    ) {
      errors.push(`${row.calendarKey}: 出典の機種名・導入日・取得日が不正です`);
      continue;
    }
    if (!sourceCalendarMatches(source, row) || (source.machineUrl && !httpsUrl(source.machineUrl)))
      errors.push(`${row.calendarKey}: 出典URLが媒体・導入月と一致しません`);
    if (normalizeMachineName(source.name) !== normalizeMachineName(row.name))
      errors.push(`${row.calendarKey}: 出典の機種名が対象と一致しません`);
    if (source.publisher === 'P-WORLD' && source.maker !== row.maker)
      errors.push(`${row.calendarKey}: メーカー主表記がP-WORLD出典と一致しません`);
  }
}

function checkRowFields(row, retrievedAt, errors) {
  if (!isObject(row)) {
    errors.push('台帳の機種行はオブジェクトで指定してください');
    return false;
  }
  for (const key of ['calendarKey', 'name', 'maker', 'dataId', 'catalogName']) {
    if (!hasText(row[key])) errors.push(`機種行の${key}が必要です`);
  }
  if (!/^[a-z0-9_-]+$/u.test(row.calendarKey ?? '')) errors.push('calendarKeyの形式が不正です');
  if (!/^[a-z0-9-]+$/u.test(row.dataId ?? ''))
    errors.push(`${row.calendarKey}: dataIdの形式が不正です`);
  if (
    !validDate(row.introducedAt) ||
    row.introducedAt < PERIOD.from ||
    row.introducedAt > PERIOD.through
  ) {
    errors.push(`${row.calendarKey}: 導入日が有効な対象期間内の日付ではありません`);
    return false;
  }
  const expectedStatus = row.introducedAt < '2026-06-01' ? 'existing' : 'added';
  if (row.status !== expectedStatus)
    errors.push(`${row.calendarKey}: 登録状態は${expectedStatus}である必要があります`);
  checkSources(row, retrievedAt, errors);
  return true;
}

function safeRead(readJson, file, label, errors) {
  try {
    const data = readJson(file);
    if (!isObject(data)) throw new Error('invalid data');
    return data;
  } catch {
    errors.push(`${label}を読み取れません: ${file}`);
    return null;
  }
}

function checkIdentity(row, entry, machine, errors) {
  const rowName = normalizeMachineName(row.name);
  const catalogName = normalizeMachineName(row.catalogName);
  const variantName = row.variant?.kind === '30mm_coin' ? rowName.replace(/30$/u, '') : rowName;
  if (variantName !== catalogName || nameText(row.catalogName) !== nameText(entry.name))
    errors.push(`${row.calendarKey}: 台帳とindexの機種名が一致しません`);
  if (machine && normalizeMachineName(machine.name) !== catalogName)
    errors.push(`${row.calendarKey}: 機種ファイルの機種名が一致しません`);
  if (nameText(row.name) !== nameText(row.catalogName) && !hasText(row.identityNote))
    errors.push(`${row.calendarKey}: 機種名の表記差の説明が必要です`);
}

function checkProvenance(row, entry, readJson, errors) {
  if (row.status !== 'added') return;
  const data = safeRead(
    readJson,
    `provenance/${row.dataId}.json`,
    `${row.calendarKey}: 出典記録`,
    errors
  );
  if (!data) return;
  if (data.machineId !== row.dataId || data.machineFile !== entry.file)
    errors.push(`${row.calendarKey}: 出典記録のID・機種ファイルが一致しません`);
  if (
    !Array.isArray(data.sources) ||
    data.sources.length === 0 ||
    !Array.isArray(data.items) ||
    data.items.length === 0
  )
    errors.push(`${row.calendarKey}: 出典記録の採用項目と情報源が必要です`);
}

function checkData(row, entries, readJson, errors) {
  const entry = entries.get(row.dataId);
  if (!entry) {
    errors.push(`${row.calendarKey}: indexにdataIdがありません: ${row.dataId}`);
    return;
  }
  if (
    typeof entry.file !== 'string' ||
    !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.json$/u.test(entry.file)
  ) {
    errors.push(`${row.calendarKey}: 機種ファイル経路が不正です`);
    return;
  }
  const machine = safeRead(
    readJson,
    `machines/${entry.file}`,
    `${row.calendarKey}: 機種ファイル`,
    errors
  );
  checkIdentity(row, entry, machine, errors);
  checkProvenance(row, entry, readJson, errors);
}

function checkVariant(row, errors) {
  if (!row.variant) return;
  const variant = row.variant;
  const valid =
    row.dataId === SHARED_ID &&
    variant.groupId === SHARED_ID &&
    variant.sharedCatalogId === SHARED_ID;
  if (
    !valid ||
    !Object.hasOwn(VARIANT_MODELS, variant.kind) ||
    variant.modelNumber !== VARIANT_MODELS[variant.kind] ||
    !hasText(row.identityNote)
  )
    errors.push(`${row.calendarKey}: 筐体区分・型式・共有理由が不正です`);
  if (!httpsUrl(variant.basisUrl) || !httpsUrl(variant.sharedSpecUrl))
    errors.push(`${row.calendarKey}: 筐体共有の公式出典URLが必要です`);
}

function checkDuplicates(rows, errors) {
  const keys = new Set();
  const ids = new Map();
  for (const row of rows.filter(isObject)) {
    if (keys.has(row.calendarKey)) errors.push(`calendarKeyが重複しています: ${row.calendarKey}`);
    keys.add(row.calendarKey);
    ids.set(row.dataId, [...(ids.get(row.dataId) ?? []), row]);
    checkVariant(row, errors);
  }
  for (const [id, matches] of ids) {
    if (matches.length < 2) continue;
    const kinds = new Set(matches.map((row) => row.variant?.kind));
    if (
      id !== SHARED_ID ||
      matches.length !== 2 ||
      !kinds.has('smart_slot') ||
      !kinds.has('30mm_coin')
    )
      errors.push(`同じdataIdを複数行で共有できません: ${id}`);
  }
  const shared = ids.get(SHARED_ID) ?? [];
  if (shared.length !== 2 || shared.some((row) => !row.variant))
    errors.push('ニューキングの2筐体区分を別行で保持してください');
}

export function verifyYearCatalog({ catalog, index, readJson }) {
  const errors = [];
  if (!isObject(catalog) || !Array.isArray(catalog.machines))
    return { errors: ['台帳に機種一覧がありません'] };
  if (!isObject(index) || !Array.isArray(index.machines))
    return { errors: ['indexに機種一覧がありません'] };
  if (typeof readJson !== 'function') return { errors: ['機種ファイルを読む処理がありません'] };
  checkHeader(catalog, errors);
  checkSummary(catalog, errors);
  checkMonths(catalog, errors);
  checkDuplicates(catalog.machines, errors);
  const entries = new Map();
  for (const entry of index.machines) {
    if (!isObject(entry) || !hasText(entry.id)) {
      errors.push('indexの機種IDが不正です');
      continue;
    }
    if (entries.has(entry.id)) errors.push(`indexのID重複: ${entry.id}`);
    entries.set(entry.id, entry);
  }
  for (const row of catalog.machines) {
    if (checkRowFields(row, catalog.retrievedAt, errors)) checkData(row, entries, readJson, errors);
  }
  return { errors, summary: countRows(catalog.machines) };
}

export function verifyYearRepository(root = ROOT) {
  const errors = [];
  const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  const catalog = safeRead(readJson, 'docs/catalog-2026.json', '対象台帳', errors);
  const index = safeRead(readJson, 'machines/index.json', '機種index', errors);
  return errors.length ? { errors } : verifyYearCatalog({ catalog, index, readJson });
}

function main(argv) {
  if (argv.length) {
    process.stderr.write('このコマンドに引数は指定できません\n');
    return 2;
  }
  const result = verifyYearRepository();
  if (result.errors.length) {
    process.stderr.write(`${result.errors.map((error) => `- ${error}`).join('\n')}\n`);
    return 1;
  }
  process.stdout.write(
    '2026年1〜9月の対象台帳: 52行・既存26行・追加26行・51データID、9か月の照合に合格しました\n'
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
