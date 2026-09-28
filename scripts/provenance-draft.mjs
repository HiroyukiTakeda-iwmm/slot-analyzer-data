#!/usr/bin/env node

/**
 * 記録の下書き: 抜き出しのメモ（と読み直しのメモ）から、出典記録の下書きと、採用した項目の「機種ファイルに書く値」を
 * 作る（仕様 5.5・5.6）。採否は decideNewItem・decideExistingItem で決める。機種ファイル・provenance/ は書き換えない。
 * メモの形は schemas/notes.schema.json、決まりは docs/data-format.md の「記録の下書き」。
 *
 * Usage:
 *   node scripts/provenance-draft.mjs <抜き出しのメモ> [--reread <読み直しのメモ>] [--root <リポジトリのフォルダ>]
 *   --root の既定は、この道具のあるリポジトリ
 *
 * 出力: 標準出力に1つの JSON { "record": 出典記録の下書き, "machineValues": [{ kind, name, status, value }] }。
 * 標準エラーに、候補の数と理由・外す項目・メモの unreadable（読めなかったページ）を出す。
 *
 * 終了コード: 0 = 下書きを出した / 1 = メモが形に合わない・機種ファイルと合わない（下書きは出さない。理由は標準
 * エラー） / 2 = 読めない（メモ・index.json・機種ファイル・今の出典記録を読めない、引数の誤り、道具の誤り）
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { collectItemIds } from './lib/derived-ids.mjs';
import { compileSchema } from './lib/compile-schema.mjs';
import { itemLabel, readNote } from './lib/notes.mjs';
import { draftRecord, machineProblems, memoProblems } from './lib/provenance-draft.mjs';
import { itemKey, listMachineItems } from './lib/provenance.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE =
  '使い方: node scripts/provenance-draft.mjs <抜き出しのメモ> [--reread <読み直しのメモ>] [--root <リポジトリのフォルダ>]';
const OPTIONS = ['--reread', '--root'];

/**
 * 引数を読む。--reread・--root は「--reread <path>」と「--reread=<path>」の形。知らない引数は、黙って無視しない
 * ように誤りにする。
 * @returns {{ extractPath: string, rereadPath?: string, root: string } | { error: string }}
 */
function parseArgs(argv) {
  const files = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (OPTIONS.includes(name)) {
      const value = eq === -1 ? argv[i + 1] : arg.slice(eq + 1);
      if (eq === -1) i += 1;
      if (value === undefined || value === '' || value.startsWith('-')) {
        return { error: `${name} の値が無い` };
      }
      if (Object.hasOwn(options, name)) return { error: `${name} が2つある` };
      options[name] = value;
    } else if (arg.startsWith('-')) {
      return { error: `知らない引数: ${arg}` };
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 1) return { error: '抜き出しのメモを1つ指定してください' };
  return {
    extractPath: files[0],
    rereadPath: options['--reread'],
    root: resolve(options['--root'] ?? DEFAULT_ROOT),
  };
}

/** リポジトリの JSON ファイルを読む。@returns {{ data: unknown } | { error: string }} */
function readJson(root, relative) {
  try {
    return { data: JSON.parse(readFileSync(resolve(root, relative), 'utf-8')) };
  } catch (e) {
    return { error: `読めない: ${relative}（${e.message}）` };
  }
}

/**
 * 今の出典記録（provenance/<機種ID>.json）を読む。無ければ null。読めない・出典記録の形に合わない・機種 ID が違う
 * 記録は、外した ID の台帳（retiredIds）を正しく引き継げないので誤りにする。
 * @returns {{ record: object | null } | { error: string }}
 */
function readCurrentRecord(root, machineId, validateRecord) {
  const relative = `provenance/${machineId}.json`;
  if (!existsSync(resolve(root, relative))) return { record: null };
  const read = readJson(root, relative);
  if (read.error) return read;
  if (!validateRecord(read.data)) {
    const details = validateRecord.errors.map(
      (e) => `${e.instancePath || '（最上位）'} ${e.message}`
    );
    return { error: `出典記録の形に合わない: ${relative}（${details.join('・')}）` };
  }
  if (read.data.machineId !== machineId) {
    return { error: `出典記録の machineId が違う: ${relative}（${read.data.machineId}）` };
  }
  return { record: read.data };
}

/**
 * index.json・機種ファイル（既存の機種だけ）・今の出典記録を読む。
 * @returns {{ entry?: object, machine?: object, machineItems?: object[], itemIds?: Map<string, string>,
 *   currentRecord: object | null } | { error: string }}
 */
function readRepository(root, machineId, validateRecord) {
  const index = readJson(root, 'machines/index.json');
  if (index.error) return index;
  if (!Array.isArray(index.data?.machines)) {
    return { error: '読めない: machines/index.json（machines の配列が無い）' };
  }
  const current = readCurrentRecord(root, machineId, validateRecord);
  if (current.error) return current;
  const entry = index.data.machines.find((machine) => machine.id === machineId);
  if (!entry) return { currentRecord: current.record };

  const machine = readJson(root, `machines/${entry.file}`);
  if (machine.error) return machine;
  try {
    return {
      entry,
      machine: machine.data,
      machineItems: listMachineItems(machine.data),
      itemIds: collectItemIds(machine.data),
      currentRecord: current.record,
    };
  } catch (e) {
    return { error: `機種ファイルの項目を並べられない: machines/${entry.file}（${e.message}）` };
  }
}

/** 実行した環境の日付（YYYY-MM-DD） */
function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 読めなかったページ（メモの unreadable）の行 */
function unreadableLines(label, note) {
  const pages = note?.unreadable ?? [];
  if (pages.length === 0) return [];
  return [
    `読めなかったページ（${label}）${pages.length} 件:`,
    ...pages.map((page) => `  ${page.url}（${page.route}・${page.at}）: ${page.reason}`),
  ];
}

/** 標準エラーに出す、下書きの知らせ（候補の数と理由・外す項目・読めなかったページ） */
function formatReport({ record, needsReread }, { isNew, extract, reread }) {
  const { items, candidates, removed } = record;
  const lines = [
    `${record.machineId}: 出典記録の下書き（${isNew ? '新台' : '既存の機種'}）: 採用 ${items.length}・候補 ${candidates.length}・外す ${removed.length}`,
  ];
  if (!reread) {
    lines.push(
      '読み直しのメモを渡していない（ちょんぼりすただけの値は暫定にしない。--reread で渡す）'
    );
  }
  if (candidates.length > 0) {
    lines.push(`候補（採用しない）${candidates.length} 件:`);
    // Map.groupBy は Node 21 から（package.json の engines は Node 20 以上）
    const byReason = new Map();
    for (const candidate of candidates) {
      byReason.set(candidate.reason, [...(byReason.get(candidate.reason) ?? []), candidate]);
    }
    for (const [reason, group] of byReason) {
      lines.push(`  ${reason}: ${group.length} 件`, ...group.map((c) => `    ${itemLabel(c)}`));
    }
  }
  if (removed.length > 0) {
    const needs = new Set(needsReread);
    lines.push(`外す項目 ${removed.length} 件:`);
    for (const entry of removed) {
      const appId = entry.appId === undefined ? '' : `（appId: ${entry.appId}）`;
      const reread = needs.has(itemKey(entry.kind, entry.name))
        ? '（読み直しが無い。ちょんぼりすたの値と合う読み直しがあれば provisional-chonborista になるので、validate はこの removed を止める。読み直してから作り直す）'
        : '';
      lines.push(`  ${itemLabel(entry)}: ${entry.reason}${appId}${reread}`);
    }
  }
  lines.push(...unreadableLines('抜き出しのメモ', extract));
  lines.push(...unreadableLines('読み直しのメモ', reread));
  return lines;
}

function printProblems(machineId, problems) {
  console.error(`${machineId}: 下書きを出さない（メモか機種ファイルを直す）:`);
  for (const problem of problems) console.error(`  ${problem}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(args.error);
    console.error(USAGE);
    return 2;
  }

  const notes = [readNote(args.extractPath, 'extract')];
  if (args.rereadPath !== undefined) notes.push(readNote(args.rereadPath, 'reread'));
  const failed = notes.filter((result) => result.problem);
  if (failed.length > 0) {
    for (const message of failed.flatMap((result) => result.errors)) console.error(message);
    return failed.some((result) => result.problem === 'unreadable') ? 2 : 1;
  }
  const [extract, reread = null] = notes.map((result) => result.note);

  const validateRecord = compileSchema('provenance.schema.json');
  const repo = readRepository(args.root, extract.machineId, validateRecord);
  if (repo.error) {
    console.error(repo.error);
    return 2;
  }

  const problems = [
    ...memoProblems(extract, reread),
    ...(repo.machine ? machineProblems(extract, repo.entry, repo.machine, repo.machineItems) : []),
  ];
  if (problems.length > 0) {
    printProblems(extract.machineId, problems);
    return 1;
  }

  const result = draftRecord({ extract, reread, reviewedAt: localDate(), ...repo });
  if (result.problems) {
    printProblems(extract.machineId, result.problems);
    return 1;
  }
  // 出典記録のスキーマに通してから出す（メモはスキーマで確かめてあり、ここで落ちるのは道具の誤り）
  if (!validateRecord(result.record)) {
    printProblems(
      extract.machineId,
      validateRecord.errors.map(
        (e) => `下書きが出典記録の形に合わない: ${e.instancePath} ${e.message}`
      )
    );
    return 1;
  }

  process.stdout.write(
    `${JSON.stringify({ record: result.record, machineValues: result.machineValues }, null, 2)}\n`
  );
  const report = formatReport(result, { isNew: !repo.machine, extract, reread });
  for (const line of report) console.error(line);
  return 0;
}

// 想定外の例外（道具の誤り）は、メモの誤り（1）と取り違えないよう 2 にする
try {
  process.exitCode = main();
} catch (e) {
  console.error(`下書きを作れない（道具の誤り）: ${e.stack ?? e.message}`);
  process.exitCode = 2;
}
