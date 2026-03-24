#!/usr/bin/env node

/**
 * slot-analyzer-data バリデーションスクリプト
 *
 * Usage:
 *   node scripts/validate.mjs              # 全チェック実行
 *   node scripts/validate.mjs --schema-only # スキーマチェックのみ
 *   node scripts/validate.mjs --index-only  # index整合性チェックのみ
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { validateSchemas } from './validators/schema-validator.mjs';
import { validateIndexConsistency } from './validators/index-consistency.mjs';
import { validateProbabilities } from './validators/probability-validator.mjs';
import { validateConfirmations } from './validators/confirmation-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MACHINES_DIR = resolve(ROOT, 'machines');

// --- ファイル読み込み ---

function loadJsonFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
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
        const data = loadJsonFile(fullPath);
        results.push({ path: relPath, data });
      } catch (e) {
        results.push({
          path: relPath,
          data: null,
          parseError: e.message,
        });
      }
    }
  }
  return results;
}

// --- メイン ---

function main() {
  const args = process.argv.slice(2);
  const schemaOnly = args.includes('--schema-only');
  const indexOnly = args.includes('--index-only');

  console.log('=== slot-analyzer-data バリデーション ===\n');

  // データ読み込み
  const indexData = loadJsonFile(resolve(MACHINES_DIR, 'index.json'));
  const machineFiles = findMachineJsonFiles(MACHINES_DIR);

  // JSONパースエラーチェック
  const parseErrors = machineFiles.filter((f) => f.parseError);
  if (parseErrors.length > 0) {
    console.log('--- JSON パースエラー ---');
    for (const f of parseErrors) {
      console.log(`  ERROR ${f.path}: ${f.parseError}`);
    }
    console.log();
  }

  const validFiles = machineFiles.filter((f) => f.data !== null);
  console.log(`読み込み: index.json + ${validFiles.length}機種ファイル (パースエラー: ${parseErrors.length})\n`);

  let allErrors = [];
  let allWarnings = [];

  // 1. スキーマバリデーション
  if (!indexOnly) {
    console.log('--- スキーマバリデーション ---');
    const schema = validateSchemas(validFiles, indexData);
    allErrors.push(...schema.errors);
    allWarnings.push(...schema.warnings);
    console.log(`  エラー: ${schema.errors.length}件 / 警告: ${schema.warnings.length}件\n`);
  }

  // 2. index整合性チェック
  if (!schemaOnly) {
    console.log('--- index.json 整合性チェック ---');
    const index = validateIndexConsistency(validFiles, indexData);
    allErrors.push(...index.errors);
    allWarnings.push(...index.warnings);
    console.log(`  エラー: ${index.errors.length}件 / 警告: ${index.warnings.length}件\n`);
  }

  // 3. 確率値バリデーション
  if (!schemaOnly && !indexOnly) {
    console.log('--- 確率値バリデーション ---');
    const probs = validateProbabilities(validFiles);
    allErrors.push(...probs.errors);
    allWarnings.push(...probs.warnings);
    console.log(`  エラー: ${probs.errors.length}件 / 警告: ${probs.warnings.length}件\n`);
  }

  // 4. 確定演出バリデーション
  if (!schemaOnly && !indexOnly) {
    console.log('--- 確定演出バリデーション ---');
    const conf = validateConfirmations(validFiles);
    allErrors.push(...conf.errors);
    allWarnings.push(...conf.warnings);
    console.log(`  エラー: ${conf.errors.length}件 / 警告: ${conf.warnings.length}件\n`);
  }

  // --- 結果出力 ---
  console.log('========================================');
  console.log(`合計: エラー ${allErrors.length}件 / 警告 ${allWarnings.length}件`);
  console.log('========================================\n');

  if (allErrors.length > 0) {
    console.log('--- エラー一覧 ---');
    for (const err of allErrors) {
      console.log(`  ERROR [${err.type}] ${err.file}: ${err.message}`);
    }
    console.log();
  }

  if (allWarnings.length > 0) {
    console.log('--- 警告一覧 ---');
    for (const warn of allWarnings) {
      console.log(`  WARN  [${warn.type}] ${warn.file}: ${warn.message}`);
    }
    console.log();
  }

  // JSON出力（CI用）
  if (args.includes('--json')) {
    const report = { errors: allErrors, warnings: allWarnings };
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(allErrors.length > 0 ? 1 : 0);
}

main();
