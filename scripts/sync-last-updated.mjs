#!/usr/bin/env node

/**
 * index.json ⇔ 個別JSONファイル間の lastUpdated 同期スクリプト
 *
 * 信頼の方向: 個別JSONファイル → index.json（Single Source of Truth = 個別ファイル）
 *
 * Usage:
 *   node scripts/sync-last-updated.mjs            # 同期実行
 *   node scripts/sync-last-updated.mjs --dry-run   # 差分のみ表示（書き込みなし）
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_PATH = resolve(ROOT, 'machines/index.json');
const MACHINES_DIR = resolve(ROOT, 'machines');

const dryRun = process.argv.includes('--dry-run');

function main() {
  const indexData = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  let updatedCount = 0;
  let skippedCount = 0;
  const diffs = [];

  for (const entry of indexData.machines) {
    const filePath = resolve(MACHINES_DIR, entry.file);
    let machineData;
    try {
      machineData = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      console.warn(`  SKIP  ファイル読み込み失敗: ${entry.file}`);
      skippedCount++;
      continue;
    }

    const fileDate = machineData.lastUpdated;
    if (!fileDate) {
      console.warn(`  SKIP  lastUpdated未設定: ${entry.file}`);
      skippedCount++;
      continue;
    }

    if (entry.lastUpdated === fileDate) {
      continue; // 一致済み
    }

    diffs.push({
      id: entry.id,
      file: entry.file,
      old: entry.lastUpdated || '(なし)',
      new: fileDate,
    });

    if (!dryRun) {
      entry.lastUpdated = fileDate;
    }
    updatedCount++;
  }

  if (diffs.length > 0) {
    console.log(`\n=== lastUpdated 同期${dryRun ? '（dry-run）' : ''} ===\n`);
    for (const d of diffs) {
      console.log(`  ${d.id}: ${d.old} → ${d.new}`);
    }
    console.log(`\n更新: ${updatedCount}件 / スキップ: ${skippedCount}件`);
  } else {
    console.log('\n全エントリが同期済みです。差分はありません。');
  }

  if (!dryRun && updatedCount > 0) {
    writeFileSync(INDEX_PATH, JSON.stringify(indexData, null, 2) + '\n', 'utf-8');
    console.log(`\nindex.json を更新しました。`);
  }
}

main();
