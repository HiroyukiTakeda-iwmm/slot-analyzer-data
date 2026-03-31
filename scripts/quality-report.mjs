#!/usr/bin/env node

/**
 * 品質ダッシュボード
 * フィールド充填率と品質分類を出力する
 *
 * Usage:
 *   node scripts/quality-report.mjs          # ダッシュボード表示
 *   node scripts/quality-report.mjs --json   # JSON出力
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { validateCompleteness } from './validators/completeness-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MACHINES_DIR = resolve(ROOT, 'machines');

function loadJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function findMachineJsonFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMachineJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
      const relPath = 'machines/' + relative(MACHINES_DIR, fullPath);
      try {
        results.push({ path: relPath, data: loadJsonFile(fullPath) });
      } catch {
        // skip parse errors
      }
    }
  }
  return results;
}

function bar(count, total, width = 20) {
  const filled = Math.round((count / total) * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(count, total) {
  return `${Math.round((count / total) * 100)}%`;
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  const indexData = loadJsonFile(resolve(MACHINES_DIR, 'index.json'));
  const machineFiles = findMachineJsonFiles(MACHINES_DIR);
  const result = validateCompleteness(machineFiles);
  const { summary } = result;
  const { stats } = summary;
  const total = stats.total;

  if (jsonOutput) {
    console.log(JSON.stringify({ summary, warnings: result.warnings, info: result.info }, null, 2));
    return;
  }

  const version = indexData.version || 'unknown';
  const date = new Date().toISOString().split('T')[0];

  console.log('=== SlotAnalyzer Data Quality Dashboard ===');
  console.log(`Version: ${version} | Total: ${total} machines | Date: ${date}\n`);

  console.log('--- Field Coverage ---');
  const fields = [
    ['roles (non-empty)', stats.rolesNonEmpty],
    ['confirmationEvents (key)', stats.confirmationEventsKey],
    ['endScreens (non-empty)', stats.endScreensNonEmpty],
    ['trialSuccessRates', stats.trialSuccessRates],
    ['description', stats.description],
    ['source', stats.source],
    ['voiceCounts (non-empty)', stats.voiceCountsNonEmpty],
  ];

  for (const [name, count] of fields) {
    const padded = name.padEnd(28);
    console.log(
      `  ${padded} ${String(count).padStart(3)}/${total}  (${pct(count, total).padStart(4)})  ${bar(count, total)}`
    );
  }

  console.log('\n--- Quality Classification ---');
  console.log(`  Complete:     ${summary.complete} machines`);
  console.log(`  Provisional:  ${summary.provisional} machines`);
  console.log(`  Incomplete:   ${summary.incomplete} machines`);

  if (result.warnings.length > 0) {
    console.log('\n--- Warnings ---');
    for (const w of result.warnings) {
      const shortPath = w.file.replace('machines/', '');
      console.log(`  ${shortPath.padEnd(45)} ${w.message}`);
    }
  }

  if (result.info.length > 0) {
    console.log('\n--- Info ---');
    for (const i of result.info) {
      const shortPath = i.file.replace('machines/', '');
      console.log(`  ${shortPath.padEnd(45)} ${i.message}`);
    }
  }

  console.log();
}

main();
