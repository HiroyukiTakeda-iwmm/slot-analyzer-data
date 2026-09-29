#!/usr/bin/env node

/**
 * 読み直しの照合: 読み直しのメモの各行を、抜き出しのメモの同じ項目・同じ出典の値と比べる（仕様 5.4・5.5）。
 * 比べ方は出典記録と同じ valuesAgree（丸めの幅が重なるか。表示の文字列どうしでは比べない）。unit は抜き出しの
 * メモの同じ項目の unit を使う。載っている設定の組が違えば食い違い（一部だけ読めた、は一致にしない）。
 * 食い違い・読み直していない（抜き出しで値のある項目・出典のうち、読み直しに行が無い）・読み直しにしか無い
 * （抜き出しの sources に出典キーが無いか、抜き出しに項目かその出典の値が無い）行を並べる。メモは書き換えない。
 * メモの形は schemas/notes.schema.json（docs/data-format.md の「抜き出し・読み直しのメモ」）。
 *
 * Usage:
 *   node scripts/reread-compare.mjs <抜き出しのメモ> <読み直しのメモ>
 *
 * 終了コード: 0 = すべて一致 / 1 = 食い違いか抜けがある、または照合する行が無い（比べた行が 0 件。調べていない
 * ものを一致としない） / 2 = 照合できない（ファイル・JSON として読めない、メモの形に合わない、抜き出しの値が unit の
 * 形に合わない、抜き出しの values の出典キーが sources に無い（sources に同じキーが2つある）、機種 ID が違う、
 * 同じ項目（読み直しは同じ項目・出典）の行が2つある、引数の誤り）
 */

import { compareReread, lineLabel, readNote, rereadPairingProblems } from './lib/notes.mjs';

const USAGE = '使い方: node scripts/reread-compare.mjs <抜き出しのメモ> <読み直しのメモ>';

/**
 * 引数を読む。知らない引数は、黙って無視しないように誤りにする。
 * @returns {{ extractPath: string, rereadPath: string } | { error: string }}
 */
function parseArgs(argv) {
  const unknown = argv.find((arg) => arg.startsWith('-'));
  if (unknown) return { error: `知らない引数: ${unknown}` };
  if (argv.length !== 2)
    return { error: '抜き出しのメモと読み直しのメモを1つずつ指定してください' };
  return { extractPath: argv[0], rereadPath: argv[1] };
}

/** 比べた行（抜き出しと読み直しの両方に値のある項目・出典）の数 */
function comparedCount({ agreed, mismatches }) {
  return agreed + mismatches.length;
}

/** すべて一致したか。比べた行が 0 件なら、調べていないものを一致としないので成功にしない */
function allAgree(result) {
  const { mismatches, notReread, rereadOnly } = result;
  return (
    comparedCount(result) > 0 &&
    mismatches.length === 0 &&
    notReread.length === 0 &&
    rereadOnly.length === 0
  );
}

/** 照合の結果を、標準出力に出す行にする */
function formatReport(extract, reread, result) {
  const { agreed, mismatches, notReread, rereadOnly } = result;
  const lines = [`${extract.machineId}: 読み直しの照合（by ${reread.by}）`];
  if (allAgree(result)) {
    lines.push(`すべて一致（${agreed} 行）`);
    return lines;
  }
  if (comparedCount(result) === 0) {
    lines.push('照合する行が無い（抜き出しと読み直しの両方に値のある項目・出典が 0 件）');
    if (notReread.length === 0 && rereadOnly.length === 0) return lines;
  }
  lines.push(
    `一致 ${agreed}・食い違い ${mismatches.length}・読み直していない ${notReread.length}・読み直しにしか無い ${rereadOnly.length}`
  );
  if (mismatches.length > 0) {
    lines.push('', `食い違い ${mismatches.length}:`);
    for (const m of mismatches) {
      lines.push(
        `  ${lineLabel(m)}（${m.unit}）`,
        `    抜き出し: ${JSON.stringify(m.extracted)}`,
        `    読み直し: ${JSON.stringify(m.reread)}`,
        ...m.details.map((detail) => `    ${detail}`)
      );
    }
  }
  if (notReread.length > 0) {
    lines.push('', `読み直していない ${notReread.length}（抜き出しにだけ値がある）:`);
    lines.push(...notReread.map((line) => `  ${lineLabel(line)}`));
  }
  if (rereadOnly.length > 0) {
    lines.push('', `読み直しにしか無い ${rereadOnly.length}:`);
    lines.push(...rereadOnly.map((line) => `  ${lineLabel(line)}: ${line.reason}`));
  }
  return lines;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    console.error(USAGE);
    return 2;
  }

  const extract = readNote(args.extractPath, 'extract');
  const reread = readNote(args.rereadPath, 'reread');
  const readErrors = [extract, reread].flatMap((result) => result.errors ?? []);
  if (readErrors.length > 0) {
    for (const message of readErrors) console.error(message);
    return 2;
  }

  const problems = rereadPairingProblems(extract.note, reread.note);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`照合できない: ${problem}`);
    return 2;
  }

  const result = compareReread(extract.note, reread.note);
  process.stdout.write(formatReport(extract.note, reread.note, result).join('\n') + '\n');
  return allAgree(result) ? 0 : 1;
}

process.exitCode = main();
