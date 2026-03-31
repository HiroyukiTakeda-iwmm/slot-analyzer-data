import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const MACHINES_DIR = resolve(ROOT, 'machines');

export function validateIndexConsistency(machineFiles, indexData) {
  const errors = [];
  const warnings = [];

  const indexEntries = indexData.machines || [];
  const indexFileMap = new Map(indexEntries.map((e) => [e.file, e]));
  const indexIdSet = new Set();

  // ID重複チェック
  for (const entry of indexEntries) {
    if (indexIdSet.has(entry.id)) {
      errors.push({
        file: 'machines/index.json',
        type: 'index-consistency',
        severity: 'error',
        message: `ID重複: "${entry.id}"`,
      });
    }
    indexIdSet.add(entry.id);
  }

  // index → 実ファイル存在チェック
  for (const entry of indexEntries) {
    const filePath = resolve(MACHINES_DIR, entry.file);
    if (!existsSync(filePath)) {
      errors.push({
        file: 'machines/index.json',
        type: 'index-consistency',
        severity: 'error',
        message: `ファイル未存在: "${entry.file}" (id: ${entry.id})`,
      });
      continue;
    }

    // 対応するファイルデータを検索
    const fileData = machineFiles.find((f) => f.path === `machines/${entry.file}`);
    if (!fileData) continue;

    // name一致チェック
    if (entry.name !== fileData.data.name) {
      errors.push({
        file: `machines/${entry.file}`,
        type: 'index-consistency',
        severity: 'error',
        message: `名前不一致: index="${entry.name}" / file="${fileData.data.name}"`,
      });
    }

    // type一致チェック
    if (entry.type !== fileData.data.type) {
      errors.push({
        file: `machines/${entry.file}`,
        type: 'index-consistency',
        severity: 'error',
        message: `タイプ不一致: index="${entry.type}" / file="${fileData.data.type}"`,
      });
    }

    // version一致チェック
    if (fileData.data.version && entry.version !== fileData.data.version) {
      warnings.push({
        file: `machines/${entry.file}`,
        type: 'index-consistency',
        severity: 'warning',
        message: `バージョン不一致: index="${entry.version}" / file="${fileData.data.version}"`,
      });
    }

    // lastUpdated一致チェック
    if (
      entry.lastUpdated &&
      fileData.data.lastUpdated &&
      entry.lastUpdated !== fileData.data.lastUpdated
    ) {
      errors.push({
        file: `machines/${entry.file}`,
        type: 'index-consistency',
        severity: 'error',
        message: `lastUpdated不一致: index="${entry.lastUpdated}" / file="${fileData.data.lastUpdated}"`,
      });
    }
  }

  // 実ファイル → index登録チェック
  const diskFiles = new Set(machineFiles.map((f) => f.path.replace('machines/', '')));
  for (const diskFile of diskFiles) {
    if (diskFile === 'index.json' || diskFile === 'FUTURE_ADDITIONS.md') continue;
    if (!indexFileMap.has(diskFile)) {
      errors.push({
        file: `machines/${diskFile}`,
        type: 'index-consistency',
        severity: 'error',
        message: `index.jsonに未登録: "${diskFile}"`,
      });
    }
  }

  return { errors, warnings };
}
