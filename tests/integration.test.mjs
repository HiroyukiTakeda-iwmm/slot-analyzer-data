/**
 * 統合テスト
 * 全138ファイルの実データに対するスモークテスト
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { validateSchemas } from '../scripts/validators/schema-validator.mjs';
import { validateIndexConsistency } from '../scripts/validators/index-consistency.mjs';
import { validateProbabilities } from '../scripts/validators/probability-validator.mjs';
import { validateConfirmations } from '../scripts/validators/confirmation-validator.mjs';
import { validateCompleteness } from '../scripts/validators/completeness-validator.mjs';

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
      results.push({ path: relPath, data: loadJsonFile(fullPath) });
    }
  }
  return results;
}

const indexData = loadJsonFile(resolve(MACHINES_DIR, 'index.json'));
const machineFiles = findMachineJsonFiles(MACHINES_DIR);

describe('統合テスト: 実データ', () => {
  it('全機種ファイルがJSONとしてパース可能', () => {
    expect(machineFiles.length).toBeGreaterThanOrEqual(138);
    for (const f of machineFiles) {
      expect(f.data).not.toBeNull();
    }
  });

  it('index.jsonのmachines数とディスク上のファイル数が一致', () => {
    expect(indexData.machines.length).toBe(machineFiles.length);
  });

  it('スキーマバリデーション: エラーゼロ', () => {
    const result = validateSchemas(machineFiles, indexData);
    if (result.errors.length > 0) {
      console.log(
        'Schema errors:',
        result.errors.map((e) => `${e.file}: ${e.message}`)
      );
    }
    expect(result.errors).toHaveLength(0);
  });

  it('index整合性: エラーゼロ', () => {
    const result = validateIndexConsistency(machineFiles, indexData);
    if (result.errors.length > 0) {
      console.log(
        'Consistency errors:',
        result.errors.map((e) => `${e.file}: ${e.message}`)
      );
    }
    expect(result.errors).toHaveLength(0);
  });

  it('確率値バリデーション: エラーゼロ', () => {
    const result = validateProbabilities(machineFiles);
    if (result.errors.length > 0) {
      console.log(
        'Probability errors:',
        result.errors.map((e) => `${e.file}: ${e.message}`)
      );
    }
    expect(result.errors).toHaveLength(0);
  });

  it('確定演出バリデーション: エラーゼロ', () => {
    const result = validateConfirmations(machineFiles);
    if (result.errors.length > 0) {
      console.log(
        'Confirmation errors:',
        result.errors.map((e) => `${e.file}: ${e.message}`)
      );
    }
    expect(result.errors).toHaveLength(0);
  });

  it('完全性チェック: Incompleteが5未満', () => {
    const result = validateCompleteness(machineFiles);
    expect(result.summary.incomplete).toBeLessThan(5);
  });

  it('trialSuccessRates: 100%充填', () => {
    const result = validateCompleteness(machineFiles);
    expect(result.summary.stats.trialSuccessRates).toBe(result.summary.stats.total);
  });

  it('description: 100%充填', () => {
    const result = validateCompleteness(machineFiles);
    expect(result.summary.stats.description).toBe(result.summary.stats.total);
  });
});
