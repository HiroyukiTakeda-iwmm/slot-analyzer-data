import { checkDerivedIds } from './derived-ids.mjs';
import {
  checkNewMachineRecords,
  checkRemovedItems,
  checkRulesAgainstBase,
} from './rules-against-base.mjs';

/**
 * main と比べる検査（アプリが作る ID・採否ルール・ID を持たない項目の削除・新しい機種の出典記録）を
 * まとめて実行し、終了コードと表示する行を決める。
 *
 * @param {{ base: string, readBase: (path: string) => string, readHead: (path: string) => string,
 *   loadProvenance: () => Array<{ path?: string, data: object | null }> }} io
 * @returns {{ code: 0 | 1 | 2, lines: string[] }} 0 = 問題なし / 1 = 問題あり / 2 = 比べられない
 */
export function runAgainstBase({ base, readBase, readHead, loadProvenance }) {
  let problems;
  try {
    const io = { readBase, readHead, provenanceFiles: loadProvenance() };
    problems = [
      ...checkDerivedIds(io),
      ...checkRulesAgainstBase(io),
      ...checkRemovedItems(io),
      ...checkNewMachineRecords(io),
    ];
  } catch (e) {
    // 基準を読めない・JSON が壊れている・項目の名前を区別できない（createNameDisambiguator の例外）・
    // 名前に「::」を含む（plainName の例外）のどれか
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
