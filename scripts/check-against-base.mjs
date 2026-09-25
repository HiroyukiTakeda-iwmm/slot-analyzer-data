#!/usr/bin/env node

/**
 * main（既定: origin/main）と比べて確かめる。validate は main を読まないので、こちらで見る（仕様 5.7・5.8）。
 * - アプリが名前から作る ID が変わっていないか、記録なしに項目が消えていないか
 * - 採否ルールのうち、見直し前の値が要るもの（kept-single-source・provisional-chonborista の使い方）
 *
 * Usage:
 *   node scripts/check-against-base.mjs                   # origin/main と比べる
 *   node scripts/check-against-base.mjs --base <git ref>  # 任意の基準と比べる
 *
 * 終了コード: 0 = 問題なし / 1 = 問題あり / 2 = 比べられない（素通りさせない）
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { checkDerivedIds } from './lib/derived-ids.mjs';
import { checkRulesAgainstBase } from './lib/rules-against-base.mjs';
import { loadProvenanceFiles } from './lib/load-provenance.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * 引数を読む。`--base <ref>` と `--base=<ref>` を受け付け、無ければ origin/main と比べる。
 * 知らない引数や値の無い --base は、黙って既定の基準で比べないように誤りにする。
 * @returns {{ base: string } | { error: string }}
 */
function parseArgs(argv) {
  let base = 'origin/main';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let value;
    if (arg === '--base') {
      value = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--base=')) {
      value = arg.slice('--base='.length);
    } else {
      return { error: `知らない引数: ${arg}` };
    }
    if (!value || value.startsWith('--')) {
      return { error: '--base の後に、比べる git の参照を書いてください' };
    }
    base = value;
  }
  return { base };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    process.exit(2);
  }
  const { base } = args;
  const readBase = (path) =>
    execFileSync('git', ['show', `${base}:${path}`], {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const readHead = (path) => readFileSync(resolve(ROOT, path), 'utf-8');

  console.log(`=== 基準との比較（基準: ${base}）===\n`);
  let problems;
  try {
    const io = {
      readBase,
      readHead,
      provenanceFiles: loadProvenanceFiles(resolve(ROOT, 'provenance')),
    };
    problems = [...checkDerivedIds(io), ...checkRulesAgainstBase(io)];
  } catch (e) {
    // 基準を読めない・JSON が壊れている・項目の名前を区別できない（createNameDisambiguator の例外）のどれか
    console.error(`比べられませんでした（基準: ${base}）: ${e.message}`);
    process.exit(2);
  }

  if (problems.length === 0) {
    console.log(
      '問題なし: 既存の ID は基準と同じで、出典記録は基準の値に照らして採否ルールどおりです'
    );
    process.exit(0);
  }
  console.log(`問題: ${problems.length}件`);
  for (const problem of problems) console.log(`  ERROR ${problem}`);
  process.exit(1);
}

main();
