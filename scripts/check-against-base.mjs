#!/usr/bin/env node

/**
 * main（既定: origin/main）と比べて確かめる。validate は main を読まないので、こちらで見る（仕様 5.7・5.8）。
 * - アプリが名前から作る ID が変わっていないか、記録なしに項目が消えていないか、
 *   新しい項目が基準の別の項目の ID を使っていないか、同じ名前の項目に別々の明示の id があるか
 * - 採否ルールのうち、見直し前の値が要るもの（kept-single-source・provisional-chonborista の使い方）
 * - ID を持たない種類の項目（確定演出など）を消したら、出典記録の removed に書いてあるか
 * - 新しく足した機種に、出典記録があるか
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
import { runAgainstBase } from './lib/against-base.mjs';
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
  const { code, lines } = runAgainstBase({
    base,
    readBase,
    readHead,
    loadProvenance: () => loadProvenanceFiles(resolve(ROOT, 'provenance')),
  });
  const print = code === 2 ? console.error : console.log;
  for (const line of lines) print(line);
  process.exit(code);
}

main();
