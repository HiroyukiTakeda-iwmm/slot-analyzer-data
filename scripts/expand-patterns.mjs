#!/usr/bin/env node

/**
 * 最上位の終了画面の patterns を、アプリが読む形の普通の終了画面に書き直す（本人の決定 2026-09-27・仕様 5.4）。
 * 作る終了画面は、アプリの移行処理が作る id を明示の id として持つ。書き直してもアプリが読む形は変わらない
 * （scripts/lib/expand-patterns.mjs が確かめ、変わるなら書き直さない）。endScreenGroups の中と voiceCounts の
 * patterns は書き直さない。機種の version と lastUpdated は変えない（利用者に更新を届ける必要が無い）。
 *
 * Usage:
 *   node scripts/expand-patterns.mjs <機種ファイル>...          # 書き直す内容を表示するだけ
 *   node scripts/expand-patterns.mjs <機種ファイル>... --write  # 書き直す（2スペース・末尾改行）
 *
 * 終了コード: 0 = 表示・書き直しができた（書き直すものが無いときも）/ 2 = 読めない・書き直せない・書き込めない
 * 1つでも読めない・書き直せないファイルがあれば、どのファイルも書き直さない。
 */

import { readFileSync, writeFileSync } from 'fs';
import { expandEndScreenPatternsWithIds } from './lib/expand-patterns.mjs';

const USAGE = '使い方: node scripts/expand-patterns.mjs <機種ファイル>... [--write]';

/**
 * 引数を読む。知らない引数（--write の書き間違いなど）は、黙って表示だけにしないように誤りにする。
 * @returns {{ files: string[], write: boolean } | { error: string }}
 */
function parseArgs(argv) {
  const files = [];
  let write = false;
  for (const arg of argv) {
    if (arg === '--write') {
      write = true;
    } else if (arg.startsWith('-')) {
      return { error: `知らない引数: ${arg}` };
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) return { error: '機種ファイルを1つ以上指定してください' };
  return { files, write };
}

/**
 * 1つのファイルを読み、書き直した結果を作る（ファイルには書かない）。
 * @returns {{ path: string, machine?: object,
 *   expanded?: Array<{ name: string, patterns: number, ids: string[] }>, error?: string }}
 *   読めない・書き直せないときは error だけを持つ
 */
function planFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (e) {
    return { path, error: `読めない（${e.message}）` };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { path, error: `JSON として読めない（${e.message}）` };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { path, error: '機種ファイルの形でない（JSON のオブジェクトではない）' };
  }
  try {
    return { path, ...expandEndScreenPatternsWithIds(data) };
  } catch (e) {
    return { path, error: `書き直せない（${e.message}）` };
  }
}

/** 1つのファイルについて、書き直す終了画面の名前・パターンの数・作る id を並べる */
function describePlan({ path, expanded }) {
  if (expanded.length === 0) return [`${path}: 書き直す終了画面なし`];
  return [
    `${path}: 書き直す終了画面 ${expanded.length}`,
    ...expanded.map(
      ({ name, patterns, ids }) => `  ${name}（パターン ${patterns}）→ ${ids.join(', ')}`
    ),
  ];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const plans = args.files.map(planFile);
  const failed = plans.filter((plan) => plan.error);
  if (failed.length > 0) {
    for (const plan of failed) console.error(`${plan.path}: ${plan.error}`);
    if (args.write) console.error('ファイルは書き直していません');
    process.exitCode = 2;
    return;
  }

  for (const plan of plans) {
    for (const line of describePlan(plan)) console.log(line);
  }
  const targets = plans.filter((plan) => plan.expanded.length > 0);
  if (targets.length === 0) return;
  if (!args.write) {
    console.log('');
    console.log('表示だけで、ファイルは変えていません。書き直すときは --write を付けてください');
    return;
  }

  const written = [];
  let writeError;
  for (const plan of targets) {
    try {
      writeFileSync(plan.path, JSON.stringify(plan.machine, null, 2) + '\n', 'utf-8');
      written.push(plan.path);
    } catch (e) {
      writeError = `${plan.path}: 書き込めない（${e.message}）`;
      break;
    }
  }
  console.log('');
  console.log(`書き直したファイル: ${written.length}`);
  for (const path of written) console.log(`  ${path}`);
  if (writeError) {
    console.error(writeError);
    process.exitCode = 2;
  }
}

main();
