import { execFileSync } from 'child_process';
import { checkDerivedIds } from './derived-ids.mjs';
import { checkLedgerAgainstBase } from './ledger-against-base.mjs';
import {
  checkNewMachineRecords,
  checkRemovedItems,
  checkRulesAgainstBase,
} from './rules-against-base.mjs';

/**
 * git の参照（base）で、フォルダ直下のファイル（フォルダの中のフォルダは除く）のパスを、リポジトリからの
 * 相対パスで並べる。フォルダが無ければ空。参照を読めなければ例外を投げる。
 * @param {string} base git の参照
 * @param {string} dir リポジトリからの相対パスのフォルダ（末尾の「/」なし）
 * @param {string} cwd リポジトリのルート
 * @returns {string[]}
 */
export function listGitFiles(base, dir, cwd) {
  const output = execFileSync('git', ['ls-tree', '-z', base, '--', `${dir}/`], {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // 1行は「<mode> <type> <object>\t<path>」。-z なので、日本語のパスも引用符で囲まれない
  return output
    .split('\0')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'))
    .filter(([meta]) => meta.split(' ')[1] === 'blob')
    .map(([, path]) => path);
}

/**
 * main と比べる検査（アプリが作る ID・採否ルール・ID を持たない項目の削除・新しい機種の出典記録・
 * 外した ID の台帳）をまとめて実行し、終了コードと表示する行を決める。
 *
 * @param {{ base: string, readBase: (path: string) => string, readHead: (path: string) => string,
 *   listBase: (dir: string) => string[],
 *   loadProvenance: () => Array<{ path?: string, data: object | null }> }} io
 *   listBase は main のフォルダ直下のファイルのパスを返す（listGitFiles）
 * @returns {{ code: 0 | 1 | 2, lines: string[] }} 0 = 問題なし / 1 = 問題あり / 2 = 比べられない
 */
export function runAgainstBase({ base, readBase, readHead, listBase, loadProvenance }) {
  let problems;
  try {
    const io = { readBase, readHead, listBase, provenanceFiles: loadProvenance() };
    problems = [
      ...checkDerivedIds(io),
      ...checkRulesAgainstBase(io),
      ...checkRemovedItems(io),
      ...checkNewMachineRecords(io),
      ...checkLedgerAgainstBase(io),
    ];
  } catch (e) {
    // 基準を読めない・JSON が壊れている（main の出典記録も）・項目の名前を区別できない
    // （createNameDisambiguator の例外）・名前に「::」を含む（plainName の例外）のどれか
    return { code: 2, lines: [`比べられませんでした（基準: ${base}）: ${e.message}`] };
  }
  if (problems.length === 0) {
    return {
      code: 0,
      lines: [
        '問題なし: 既存の ID は基準と同じで、出典記録は基準の値に照らして採否ルールどおりです',
      ],
    };
  }
  return {
    code: 1,
    lines: [`問題: ${problems.length}件`, ...problems.map((problem) => `  ERROR ${problem}`)],
  };
}
