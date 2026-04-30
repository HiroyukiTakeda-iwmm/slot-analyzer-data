#!/usr/bin/env node

/**
 * V1 → V2 migration スクリプト (slot-analyzer-data 側)
 *
 * 既存の V1 機種 JSON を読み込み、role.id の自動付与 + endScreens 標準化 +
 * schemaVersion: 2 の付与を行って書き戻す (--write モード)。
 * デフォルトは --dry-run で、差分統計のみ表示する。
 *
 * Usage:
 *   node scripts/migrate-v1-to-v2.mjs               # dry-run (default, 全機種)
 *   node scripts/migrate-v1-to-v2.mjs --dry-run
 *   node scripts/migrate-v1-to-v2.mjs --write       # 実書き込み (本タスクでは実行しない)
 *   node scripts/migrate-v1-to-v2.mjs --file <path> # 特定ファイルのみ
 *   node scripts/migrate-v1-to-v2.mjs --report <out.json>
 *
 * iOS 側 services/migrations/v1ToV2.ts と同一アルゴリズム。
 * KC-2 前提: 生成される role.id は両リポで bit 互換。
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { slugify, claimSlug } from './lib/slugify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MACHINES_DIR = resolve(ROOT, 'machines');

const DEFAULT_SETTINGS = ['1', '2', '3', '4', '5', '6'];
const DEFAULT_END_SCREEN_TYPE = 'other';

// ================================================================
// Role migration
// ================================================================

/**
 * Role に id / displayOrder / hasSettingDiff を補完して V2 形式に変換。
 * @param {Record<string, unknown>} role
 * @param {number} index
 * @param {Set<string>} usedIds 同一配列内の衝突回避用
 * @returns {Record<string, unknown>}
 */
function migrateRole(role, index, usedIds) {
  const displayOrder = typeof role.displayOrder === 'number' ? role.displayOrder : index + 1;
  const id = resolveRoleId(role, displayOrder, usedIds);

  return {
    ...role,
    id,
    hasSettingDiff: typeof role.hasSettingDiff === 'boolean' ? role.hasSettingDiff : false,
    displayOrder,
  };
}

/**
 * @param {Record<string, unknown>} role
 * @param {number} displayOrder
 * @param {Set<string>} usedIds
 * @returns {string}
 */
function resolveRoleId(role, displayOrder, usedIds) {
  // 既存 id が非空文字列ならそのまま採用 (idempotency)
  if (typeof role.id === 'string' && role.id.length > 0) {
    return claimSlug(role.id, usedIds);
  }
  const name = typeof role.name === 'string' ? role.name : '';
  const base = slugify(name);
  const candidate = base.length > 0 ? `${base}_${displayOrder}` : `role_${displayOrder}`;
  return claimSlug(candidate, usedIds);
}

// ================================================================
// EndScreen migration
// ================================================================

/**
 * V1 endScreens を V2 形式に標準化。
 * patterns 形式は複数 endScreen に展開、distribution は probabilities にリネーム。
 *
 * @param {unknown[]|undefined} endScreens
 * @param {string[]|undefined} availableSettings
 * @returns {unknown[]|undefined}
 */
function migrateEndScreens(endScreens, availableSettings) {
  if (endScreens === undefined) return undefined;

  const settings = availableSettings ?? DEFAULT_SETTINGS;
  const usedIds = new Set();
  /** @type {unknown[]} */
  const result = [];

  for (const es of endScreens) {
    const esObj = /** @type {Record<string, unknown>} */ (es);
    const patterns = esObj.patterns;
    if (Array.isArray(patterns) && patterns.length > 0) {
      // patterns 形式: 各 pattern を endScreen に展開
      patterns.forEach((pattern, patternIndex) => {
        result.push(buildEndScreenFromPattern(esObj, pattern, patternIndex, settings, usedIds));
      });
    } else {
      result.push(buildEndScreenFromStandard(esObj, usedIds));
    }
  }

  return result;
}

/**
 * patterns の 1 要素を独立した EndScreenV2 に展開。
 *
 * id 採番方針 (選択 B: parent.id を prefix として継承):
 *   - parent.id が指定されていれば `${parent.id}_${patternIndex + 1}` を基底候補
 *   - parent.id が無ければ `slugify(pattern.name)` を基底
 *   - 最後に衝突があれば `_2`, `_3` が付与 (claimSlug 契約)
 *
 * confirmedSettings:
 *   - pattern.setting 指定時: 単一設定 [setting]
 *   - pattern.minSetting 指定時: availableSettings のうち数値かつ minSetting 以上
 *   - どちらも無い場合: []
 *
 * @param {Record<string, unknown>} parent
 * @param {Record<string, unknown>} pattern
 * @param {number} patternIndex
 * @param {string[]} availableSettings
 * @param {Set<string>} usedIds
 * @returns {Record<string, unknown>}
 */
function buildEndScreenFromPattern(parent, pattern, patternIndex, availableSettings, usedIds) {
  const confirmedSettings = deriveConfirmedSettings(pattern, availableSettings);
  const id = derivePatternEndScreenId(parent, pattern, patternIndex, usedIds);

  const result = {
    id,
    name: pattern.name,
    type: typeof parent.type === 'string' ? parent.type : DEFAULT_END_SCREEN_TYPE,
    hint: typeof pattern.description === 'string'
      ? pattern.description
      : (typeof parent.hint === 'string' ? parent.hint : ''),
    confirmedSettings,
  };
  if (parent.color !== undefined) {
    result.color = parent.color;
  }
  return result;
}

/**
 * @param {Record<string, unknown>} parent
 * @param {Record<string, unknown>} pattern
 * @param {number} patternIndex
 * @param {Set<string>} usedIds
 * @returns {string}
 */
function derivePatternEndScreenId(parent, pattern, patternIndex, usedIds) {
  if (typeof parent.id === 'string' && parent.id.length > 0) {
    return claimSlug(`${parent.id}_${patternIndex + 1}`, usedIds);
  }
  const name = typeof pattern.name === 'string' ? pattern.name : '';
  return generateEndScreenId(name, usedIds);
}

/**
 * @param {Record<string, unknown>} pattern
 * @param {string[]} availableSettings
 * @returns {string[]}
 */
function deriveConfirmedSettings(pattern, availableSettings) {
  if (typeof pattern.setting === 'string') {
    return [pattern.setting];
  }
  if (typeof pattern.minSetting === 'number') {
    const min = pattern.minSetting;
    return availableSettings.filter((s) => {
      const num = Number(s);
      return Number.isFinite(num) && num >= min;
    });
  }
  return [];
}

/**
 * distribution → probabilities のリネーム。両方ある場合は probabilities を優先。
 *
 * @param {Record<string, unknown>} es
 * @param {Set<string>} usedIds
 * @returns {Record<string, unknown>}
 */
function buildEndScreenFromStandard(es, usedIds) {
  const id = typeof es.id === 'string' && es.id.length > 0
    ? claimSlug(es.id, usedIds)
    : generateEndScreenId(typeof es.name === 'string' ? es.name : '', usedIds);

  const probabilities = es.probabilities ?? es.distribution;

  /** @type {Record<string, unknown>} */
  const v2 = {
    id,
    name: es.name,
    type: typeof es.type === 'string' ? es.type : DEFAULT_END_SCREEN_TYPE,
    hint: typeof es.hint === 'string' ? es.hint : '',
  };

  if (es.color !== undefined) v2.color = es.color;
  if (es.confirmedSettings !== undefined) v2.confirmedSettings = es.confirmedSettings;
  if (es.excludedSettings !== undefined) v2.excludedSettings = es.excludedSettings;
  if (probabilities !== undefined) v2.probabilities = probabilities;

  return v2;
}

/**
 * @param {string} name
 * @param {Set<string>} usedIds
 * @returns {string}
 */
function generateEndScreenId(name, usedIds) {
  const base = slugify(name);
  const candidate = base.length > 0 ? base : 'endscreen';
  return claimSlug(candidate, usedIds);
}

// ================================================================
// Settings migration
// ================================================================

/**
 * settings.order を 1..N に再採番。元の order 昇順でソートしてから番号を振り直す。
 *
 * @param {unknown[]|undefined} settings
 * @returns {unknown[]|undefined}
 */
function migrateSettings(settings) {
  if (settings === undefined) return undefined;
  const sorted = [...settings].sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : 0;
    const bo = typeof b.order === 'number' ? b.order : 0;
    return ao - bo;
  });
  return sorted.map((s, i) => ({ ...s, order: i + 1 }));
}

// ================================================================
// Zones migration
// ================================================================

/**
 * @param {unknown[]|undefined} zones
 * @returns {unknown[]|undefined}
 */
function migrateZones(zones) {
  if (zones === undefined) return undefined;
  const usedZoneIds = new Set();
  return zones.map((zone) => {
    const usedRoleIds = new Set();
    const roles = Array.isArray(zone.roles)
      ? zone.roles.map((role, i) => migrateRole(role, i, usedRoleIds))
      : zone.roles;
    const rawId = typeof zone.id === 'string' && zone.id.length > 0
      ? zone.id
      : slugify(typeof zone.name === 'string' ? zone.name : '');
    const candidate = rawId.length > 0 ? rawId : 'zone';
    const id = claimSlug(candidate, usedZoneIds);
    return { ...zone, id, roles };
  });
}

// ================================================================
// endScreenGroups migration
// ================================================================

/**
 * endScreenGroups の内側 endScreens にも id 採番 + type fallback を適用する。
 * usedIds は group ごとに独立させる (group 跨ぎで衝突管理しない)。
 *
 * @param {unknown[]|undefined} groups
 * @param {Set<string>} usedGroupIds
 * @returns {unknown[]|undefined}
 */
function migrateEndScreenGroups(groups, usedGroupIds) {
  if (groups === undefined) return undefined;

  return groups.map((group) => {
    const groupId = resolveGroupId(group, usedGroupIds);
    const innerUsedIds = new Set();
    const endScreens = Array.isArray(group.endScreens)
      ? group.endScreens.map((es) => migrateInnerEndScreen(es, innerUsedIds))
      : group.endScreens;
    return { ...group, id: groupId, endScreens };
  });
}

/**
 * @param {Record<string, unknown>} group
 * @param {Set<string>} usedGroupIds
 * @returns {string}
 */
function resolveGroupId(group, usedGroupIds) {
  if (typeof group.id === 'string' && group.id.length > 0) {
    return claimSlug(group.id, usedGroupIds);
  }
  const base = slugify(typeof group.name === 'string' ? group.name : '');
  const candidate = base.length > 0 ? base : 'endscreen_group';
  return claimSlug(candidate, usedGroupIds);
}

/**
 * @param {Record<string, unknown>} es
 * @param {Set<string>} usedIds
 * @returns {Record<string, unknown>}
 */
function migrateInnerEndScreen(es, usedIds) {
  const id = typeof es.id === 'string' && es.id.length > 0
    ? claimSlug(es.id, usedIds)
    : generateEndScreenId(typeof es.name === 'string' ? es.name : '', usedIds);

  return {
    ...es,
    id,
    type: typeof es.type === 'string' ? es.type : DEFAULT_END_SCREEN_TYPE,
  };
}

// ================================================================
// Main migration entry
// ================================================================

/**
 * 単一機種 JSON を V1 → V2 に変換する純粋関数。
 *
 * 不変条件:
 *   - 入力 v1 を mutate しない
 *   - role.probabilities の値は変化しない (KC-3)
 *   - idempotent: migrate(migrate(v1)) = migrate(v1)
 *
 * @param {Record<string, unknown>} v1
 * @returns {Record<string, unknown>}
 */
export function migrateV1ToV2(v1) {
  const usedRoleIds = new Set();
  const roles = Array.isArray(v1.roles)
    ? v1.roles.map((role, i) => migrateRole(role, i, usedRoleIds))
    : v1.roles;

  // spread で V1 余剰フィールドが混入しないよう、zones / settings / endScreens /
  // endScreenGroups / roles は後から明示的に差し替える。v1 全体を spread 後、
  // 上書きする形で冪等性と差し替え制御を両立する。
  /** @type {Record<string, unknown>} */
  const v2 = {
    ...v1,
    schemaVersion: 2,
    roles,
  };
  // 事前削除: 後続で undefined を setter しない形に合わせるため、
  // 「migrate 結果 undefined の場合は v1 の値もそのまま残す」挙動を維持する。
  // (undefined set は存在しないので、既存 v1 値がそのまま残る)

  const migratedSettings = migrateSettings(v1.settings);
  if (migratedSettings !== undefined) v2.settings = migratedSettings;

  const migratedEndScreens = migrateEndScreens(v1.endScreens, v1.availableSettings);
  if (migratedEndScreens !== undefined) v2.endScreens = migratedEndScreens;

  const migratedZones = migrateZones(v1.zones);
  if (migratedZones !== undefined) v2.zones = migratedZones;

  const usedGroupIds = new Set();
  const migratedGroups = migrateEndScreenGroups(v1.endScreenGroups, usedGroupIds);
  if (migratedGroups !== undefined) v2.endScreenGroups = migratedGroups;

  return v2;
}

// ================================================================
// File walking & CLI
// ================================================================

/**
 * machines/ 配下から *.json (index.json 除く) を再帰的に収集。
 * @param {string} dir
 * @returns {Array<{ absPath: string, relPath: string }>}
 */
function findMachineJsonFiles(dir) {
  /** @type {Array<{ absPath: string, relPath: string }>} */
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMachineJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
      results.push({
        absPath: fullPath,
        relPath: 'machines/' + relative(MACHINES_DIR, fullPath),
      });
    }
  }
  return results;
}

/**
 * 1 機種分の migration を実行し、差分統計を返す。
 *
 * @param {string} absPath
 * @param {string} relPath
 * @returns {{
 *   path: string,
 *   idsAdded: number,
 *   endScreensNormalized: boolean,
 *   schemaVersionAdded: boolean,
 *   settingsReindexed: boolean,
 *   changed: boolean,
 *   after: Record<string, unknown>,
 *   error?: string,
 * }}
 */
function migrateFile(absPath, relPath) {
  let raw;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch (e) {
    return makeErrorReport(relPath, `read error: ${e.message}`);
  }

  let v1;
  try {
    v1 = JSON.parse(raw);
  } catch (e) {
    return makeErrorReport(relPath, `parse error: ${e.message}`);
  }

  const v2 = migrateV1ToV2(v1);
  return computeDiff(relPath, v1, v2);
}

/**
 * @param {string} path
 * @param {string} message
 */
function makeErrorReport(path, message) {
  return {
    path,
    idsAdded: 0,
    endScreensNormalized: false,
    schemaVersionAdded: false,
    settingsReindexed: false,
    changed: false,
    after: {},
    error: message,
  };
}

/**
 * v1/v2 を比較して変更項目を要約。
 *
 * @param {string} path
 * @param {Record<string, unknown>} v1
 * @param {Record<string, unknown>} v2
 */
function computeDiff(path, v1, v2) {
  const v1Roles = Array.isArray(v1.roles) ? v1.roles : [];
  const v2Roles = Array.isArray(v2.roles) ? v2.roles : [];

  let idsAdded = 0;
  v2Roles.forEach((r, i) => {
    const original = v1Roles[i];
    if (!original || typeof original.id !== 'string' || original.id.length === 0) {
      if (typeof r.id === 'string' && r.id.length > 0) idsAdded += 1;
    }
  });

  const endScreensNormalized =
    Array.isArray(v1.endScreens) &&
    JSON.stringify(v1.endScreens) !== JSON.stringify(v2.endScreens);

  const schemaVersionAdded = v1.schemaVersion !== 2 && v2.schemaVersion === 2;

  const settingsReindexed =
    Array.isArray(v1.settings) &&
    JSON.stringify(v1.settings) !== JSON.stringify(v2.settings);

  const changed = JSON.stringify(v1) !== JSON.stringify(v2);

  return {
    path,
    idsAdded,
    endScreensNormalized,
    schemaVersionAdded,
    settingsReindexed,
    changed,
    after: v2,
  };
}

/**
 * @param {object} args
 * @param {boolean} args.dryRun
 * @param {boolean} args.write
 * @param {string|undefined} args.file 特定ファイル絶対/相対パス
 * @param {string|undefined} args.reportPath
 */
function runCli({ dryRun, write, file, reportPath }) {
  /** @type {Array<{ absPath: string, relPath: string }>} */
  let targets;
  if (file) {
    const absPath = resolve(process.cwd(), file);
    const relPath = relative(ROOT, absPath);
    targets = [{ absPath, relPath }];
  } else {
    targets = findMachineJsonFiles(MACHINES_DIR);
  }

  const reports = targets.map(({ absPath, relPath }) => migrateFile(absPath, relPath));

  const errors = reports.filter((r) => r.error);
  const changed = reports.filter((r) => r.changed && !r.error);
  const totalIdsAdded = reports.reduce((sum, r) => sum + r.idsAdded, 0);
  const endScreensNormalizedCount = reports.filter((r) => r.endScreensNormalized).length;
  const schemaVersionAddedCount = reports.filter((r) => r.schemaVersionAdded).length;
  const settingsReindexedCount = reports.filter((r) => r.settingsReindexed).length;

  console.log('=== slot-analyzer-data V1 → V2 migration ===');
  console.log(`モード: ${write ? 'WRITE (ファイル書き換え)' : 'DRY-RUN (読み取り専用)'}`);
  console.log(`対象: ${reports.length} 機種`);
  console.log(`変更予定: ${changed.length} 機種`);
  console.log(`  └ role.id 付与: ${totalIdsAdded} 件`);
  console.log(`  └ endScreens 標準化: ${endScreensNormalizedCount} 機種`);
  console.log(`  └ schemaVersion: 2 付与: ${schemaVersionAddedCount} 機種`);
  console.log(`  └ settings.order 再採番: ${settingsReindexedCount} 機種`);
  console.log(`エラー: ${errors.length} 件`);
  console.log();

  if (errors.length > 0) {
    console.log('--- エラー ---');
    for (const r of errors) {
      console.log(`  ${r.path}: ${r.error}`);
    }
    console.log();
  }

  if (dryRun && changed.length > 0) {
    console.log('--- 変更予定機種 (上位 20) ---');
    for (const r of changed.slice(0, 20)) {
      console.log(`  ${r.path}: ids+${r.idsAdded}` +
        (r.endScreensNormalized ? ' endScreens=std' : '') +
        (r.schemaVersionAdded ? ' schema=2' : '') +
        (r.settingsReindexed ? ' settings=reidx' : ''));
    }
    if (changed.length > 20) {
      console.log(`  ... 他 ${changed.length - 20} 機種`);
    }
    console.log();
  }

  if (write) {
    let writeCount = 0;
    for (const r of reports) {
      if (r.error || !r.changed) continue;
      const abs = resolve(ROOT, r.path);
      writeFileSync(abs, JSON.stringify(r.after, null, 2) + '\n', 'utf-8');
      writeCount += 1;
    }
    console.log(`書き込み完了: ${writeCount} 機種`);
  } else {
    console.log('(dry-run なので実ファイル変更なし)');
  }

  if (reportPath) {
    const summary = {
      mode: write ? 'write' : 'dry-run',
      totalMachines: reports.length,
      changedMachines: changed.length,
      rolesIdsAdded: totalIdsAdded,
      endScreensNormalized: endScreensNormalizedCount,
      schemaVersionAdded: schemaVersionAddedCount,
      settingsReindexed: settingsReindexedCount,
      errors: errors.map((r) => ({ path: r.path, error: r.error })),
      changes: reports
        .filter((r) => r.changed && !r.error)
        .map((r) => ({
          path: r.path,
          idsAdded: r.idsAdded,
          endScreensNormalized: r.endScreensNormalized,
          schemaVersionAdded: r.schemaVersionAdded,
          settingsReindexed: r.settingsReindexed,
        })),
    };
    const absReport = resolve(process.cwd(), reportPath);
    writeFileSync(absReport, JSON.stringify(summary, null, 2) + '\n', 'utf-8');
    console.log(`レポート出力: ${absReport}`);
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

/**
 * @param {string[]} argv process.argv.slice(2) 相当
 */
export function parseArgs(argv) {
  const args = {
    dryRun: true,
    write: false,
    file: undefined,
    reportPath: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') {
      args.dryRun = true;
      args.write = false;
    } else if (a === '--write') {
      args.dryRun = false;
      args.write = true;
    } else if (a === '--file') {
      args.file = argv[i + 1];
      i += 1;
    } else if (a === '--report') {
      args.reportPath = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// CLI 実行ガード (テストから import されたときは main を走らせない)
const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
  runCli(parseArgs(process.argv.slice(2)));
}
