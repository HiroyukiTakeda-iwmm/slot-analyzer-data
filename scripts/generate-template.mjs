#!/usr/bin/env node

/**
 * 新機種テンプレート生成ツール
 *
 * Usage:
 *   node scripts/generate-template.mjs --name "機種名" --type AT --dir dirname --id machine-id
 *   node scripts/generate-template.mjs --name "スマスロ攻殻機動隊" --type AT --dir koukaku --id koukaku-kidoutai
 *
 * Options:
 *   --name     機種名（必須）
 *   --type     機種タイプ: A-type, AT, ART, A+RT, A+AT, A+ART, BT（必須）
 *   --dir      ディレクトリ名（必須）
 *   --id       機種ID kebab-case（必須）
 *   --settings 利用可能設定（カンマ区切り、デフォルト: 1,2,3,4,5,6）
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MACHINES_DIR = resolve(ROOT, 'machines');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    params[key] = args[i + 1];
  }
  return params;
}

function generateTemplate(name, type, settings) {
  const settingsObj = {};
  for (const s of settings) {
    settingsObj[s] = 0.0;
  }

  const template = {
    name,
    type,
  };

  // 非標準設定の場合のみavailableSettingsを追加
  const defaultSettings = ['1', '2', '3', '4', '5', '6'];
  if (JSON.stringify(settings) !== JSON.stringify(defaultSettings)) {
    template.availableSettings = settings;
  }

  template.roles = [
    {
      name: '小役1',
      probabilities: { ...settingsObj },
      hasSettingDiff: true,
      displayOrder: 1,
      color: '#4CAF50',
    },
  ];

  template.confirmationEvents = [];
  template.trialSuccessRates = [];
  template.endScreens = [];
  template.voiceCounts = [];
  template.author = 'コミュニティ';
  template.version = '1.0';
  template.lastUpdated = new Date().toISOString().split('T')[0];
  template.source = '';
  template.description = '';

  return template;
}

function generateIndexEntry(id, name, type, dir) {
  return {
    id,
    name,
    type,
    author: 'コミュニティ',
    version: '1.0',
    file: `${dir}/${id}.json`,
    tags: [type],
    description: '',
  };
}

function main() {
  const params = parseArgs();

  if (!params.name || !params.type || !params.dir || !params.id) {
    console.error('Usage: node scripts/generate-template.mjs --name "機種名" --type AT --dir dirname --id machine-id');
    console.error('');
    console.error('Options:');
    console.error('  --name     機種名（必須）');
    console.error('  --type     機種タイプ: A-type, AT, ART, A+RT, A+AT, A+ART, BT（必須）');
    console.error('  --dir      ディレクトリ名（必須）');
    console.error('  --id       機種ID kebab-case（必須）');
    console.error('  --settings 利用可能設定（カンマ区切り、デフォルト: 1,2,3,4,5,6）');
    process.exit(1);
  }

  const validTypes = ['A-type', 'AT', 'ART', 'A+RT', 'A+AT', 'A+ART', 'BT'];
  if (!validTypes.includes(params.type)) {
    console.error(`無効なタイプ: ${params.type}. 有効値: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  const settings = params.settings
    ? params.settings.split(',')
    : ['1', '2', '3', '4', '5', '6'];

  const dirPath = resolve(MACHINES_DIR, params.dir);
  const filePath = resolve(dirPath, `${params.id}.json`);

  if (existsSync(filePath)) {
    console.error(`ファイル既存: ${filePath}`);
    process.exit(1);
  }

  // ディレクトリ作成
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  // テンプレート生成
  const template = generateTemplate(params.name, params.type, settings);
  writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n', 'utf-8');
  console.log(`生成: ${filePath}`);

  // index.jsonエントリ出力
  const indexEntry = generateIndexEntry(params.id, params.name, params.type, params.dir);
  console.log('\n--- index.json に追加するエントリ ---');
  console.log(JSON.stringify(indexEntry, null, 2));

  // チェックリスト出力
  console.log('\n--- データ収集チェックリスト ---');
  console.log('[ ] 小役確率（全設定）を収集');
  console.log('[ ] 設定確定演出を収集');
  console.log('[ ] 終了画面/示唆演出を収集');
  console.log('[ ] ボイス示唆を収集');
  console.log('[ ] CZ/AT当選率を収集');
  console.log('[ ] 2サイト以上でクロスチェック');
  console.log('[ ] npm run validate を実行');
  console.log('[ ] index.json にエントリ追加');
}

main();
