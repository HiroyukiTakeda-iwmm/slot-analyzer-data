#!/usr/bin/env node

/**
 * slot-analyzer-data バリデーションスクリプト
 *
 * Usage:
 *   node scripts/validate.mjs              # 全チェック実行
 *   node scripts/validate.mjs --schema-only # スキーマチェックのみ
 *   node scripts/validate.mjs --index-only  # index整合性チェックのみ
 *   node scripts/validate.mjs --require-provenance # 出典記録を全機種に求める（段階3）
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { validateSchemas } from './validators/schema-validator.mjs';
import { validateIndexConsistency } from './validators/index-consistency.mjs';
import { validateProbabilities } from './validators/probability-validator.mjs';
import { validateConfirmations } from './validators/confirmation-validator.mjs';
import { validateCompleteness } from './validators/completeness-validator.mjs';
import { validateItemIds } from './validators/item-id-validator.mjs';
import { validateOfficialDomains, validateProvenance } from './validators/provenance-validator.mjs';
import { loadOfficialDomainsFile, loadProvenanceFiles } from './lib/load-provenance.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MACHINES_DIR = resolve(ROOT, 'machines');
const PROVENANCE_DIR = resolve(ROOT, 'provenance');

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
  console.log(
    `読み込み: index.json + ${validFiles.length}機種ファイル (パースエラー: ${parseErrors.length})\n`
  );

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

  // 5. 項目の ID（確定演出などの明示の id の重なり。アプリはこの種類では _2 を付けない）
  if (!schemaOnly && !indexOnly) {
    console.log('--- 項目の ID（明示の id の重なり）---');
    const itemIds = validateItemIds(validFiles);
    allErrors.push(...itemIds.errors);
    allWarnings.push(...itemIds.warnings);
    console.log(`  エラー: ${itemIds.errors.length}件 / 警告: ${itemIds.warnings.length}件\n`);
  }

  // 6. 完全性チェック（情報レベル — exit codeに影響しない）
  if (!schemaOnly && !indexOnly) {
    console.log('--- 完全性チェック ---');
    const comp = validateCompleteness(validFiles);
    allWarnings.push(...comp.warnings);
    const { summary } = comp;
    console.log(
      `  Complete: ${summary.complete} / Provisional: ${summary.provisional} / Incomplete: ${summary.incomplete}`
    );
    console.log(`  警告: ${comp.warnings.length}件 / 情報: ${comp.info.length}件\n`);
  }

  // 7. 出典記録バリデーション（段階3までは、記録がある機種だけを検証する）。
  // 公式の出典は、メーカーの公式ドメインの一覧と照らす。一覧を読めない・一覧に問題があるときは、
  // 空の一覧として続けず、一覧のエラーにする（公式の出典は「確かめられない」エラーになる）
  if (!schemaOnly && !indexOnly) {
    console.log('--- 公式ドメインの一覧 ---');
    const official = validateOfficialDomains(loadOfficialDomainsFile(ROOT));
    allErrors.push(...official.errors);
    allWarnings.push(...official.warnings);
    // 一覧を使えないときは「0件」にしない（空の一覧と区別する）
    const domainCount = official.domains === null ? '使えない' : `${official.domains.size}件`;
    console.log(
      `  ドメイン: ${domainCount} / エラー: ${official.errors.length}件 / 警告: ${official.warnings.length}件\n`
    );

    console.log('--- 出典記録バリデーション ---');
    const provenanceFiles = loadProvenanceFiles(PROVENANCE_DIR);
    const prov = validateProvenance(validFiles, indexData, provenanceFiles, {
      requireAll: args.includes('--require-provenance'),
      officialDomains: official.domains,
    });
    allErrors.push(...prov.errors);
    allWarnings.push(...prov.warnings);
    console.log(
      `  記録: ${provenanceFiles.length}件 / エラー: ${prov.errors.length}件 / 警告: ${prov.warnings.length}件\n`
    );
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
