#!/usr/bin/env node

/**
 * 機種データ鮮度監査スクリプト
 *
 * Usage:
 *   node scripts/audit-freshness.mjs              # 全機種の鮮度レポート
 *   node scripts/audit-freshness.mjs --stale 30   # N日以上未更新の機種リスト
 *   node scripts/audit-freshness.mjs --json        # JSON出力
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_PATH = resolve(ROOT, 'machines/index.json');
const MACHINES_DIR = resolve(ROOT, 'machines');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { stale: null, json: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--stale' && args[i + 1]) {
      params.stale = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--json') {
      params.json = true;
    }
  }
  return params;
}

function daysSince(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

function classifyFreshness(days) {
  if (days <= 7) return 'fresh';       // 最新
  if (days <= 30) return 'recent';     // 新しい
  if (days <= 90) return 'stale';      // 古い
  return 'very_stale';                  // 非常に古い
}

function main() {
  const params = parseArgs();
  const indexData = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  const results = [];

  for (const entry of indexData.machines) {
    const filePath = resolve(MACHINES_DIR, entry.file);
    let machineData;
    try {
      machineData = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      results.push({
        id: entry.id,
        name: entry.name,
        file: entry.file,
        lastUpdated: null,
        days: Infinity,
        category: 'unknown',
      });
      continue;
    }

    const lastUpdated = machineData.lastUpdated || null;
    const days = lastUpdated ? daysSince(lastUpdated) : Infinity;

    results.push({
      id: entry.id,
      name: entry.name,
      file: entry.file,
      lastUpdated,
      days,
      category: lastUpdated ? classifyFreshness(days) : 'unknown',
    });
  }

  // ソート: 古い順
  results.sort((a, b) => b.days - a.days);

  // --stale モード
  if (params.stale !== null) {
    const staleResults = results.filter((r) => r.days >= params.stale);
    if (params.json) {
      console.log(JSON.stringify(staleResults, null, 2));
    } else {
      console.log(`\n${params.stale}日以上未更新: ${staleResults.length}台\n`);
      for (const r of staleResults) {
        console.log(`  ${String(r.days).padStart(4)}日  ${r.lastUpdated || 'N/A'}  ${r.id}`);
      }
    }
    process.exit(staleResults.length > 0 ? 1 : 0);
  }

  // 通常モード: フルレポート
  const categories = {
    fresh: results.filter((r) => r.category === 'fresh'),
    recent: results.filter((r) => r.category === 'recent'),
    stale: results.filter((r) => r.category === 'stale'),
    very_stale: results.filter((r) => r.category === 'very_stale'),
    unknown: results.filter((r) => r.category === 'unknown'),
  };

  if (params.json) {
    console.log(JSON.stringify({ today, total: results.length, categories: {
      fresh: categories.fresh.length,
      recent: categories.recent.length,
      stale: categories.stale.length,
      very_stale: categories.very_stale.length,
      unknown: categories.unknown.length,
    }, machines: results }, null, 2));
    return;
  }

  console.log(`\n=== 鮮度監査レポート ===`);
  console.log(`日付: ${today}`);
  console.log(`総機種数: ${results.length}台\n`);

  const labels = {
    fresh: '最新 (0-7日)',
    recent: '新しい (8-30日)',
    stale: '古い (31-90日)',
    very_stale: '非常に古い (91日+)',
    unknown: '不明',
  };

  for (const [key, label] of Object.entries(labels)) {
    const count = categories[key].length;
    const marker = key === 'stale' ? ' ← 警告' : key === 'very_stale' ? ' ← 要対応' : '';
    console.log(`  ${label.padEnd(22)} ${String(count).padStart(3)}台${marker}`);
  }

  // 古い/非常に古い機種の詳細
  const needsAttention = [...categories.very_stale, ...categories.stale];
  if (needsAttention.length > 0) {
    console.log(`\n--- 更新が必要な機種 (${needsAttention.length}台) ---\n`);
    for (const r of needsAttention) {
      console.log(`  ${String(r.days).padStart(4)}日  ${r.lastUpdated || 'N/A'}  ${r.id} (${r.name})`);
    }
  } else {
    console.log('\n全機種が最新状態です。');
  }

  console.log('');
}

main();
