import { EXPLICIT_ID_FIELDS, hasExplicitId } from '../lib/derived-ids.mjs';
import { itemKey } from '../lib/provenance.mjs';

/**
 * 確定演出・試行成功率・ボイス・楽曲・演出・モード移行の明示の id が、同じ機種の同じ種類の中で重なっていないかを
 * 確かめる（仕様 5.8）。アプリはこの種類では id をそのまま使い、重なっても `_2` を付けないので、数えた記録が
 * 混ざる。種類が違えば同じ id でもよい。id の無い項目は見ない（アプリが取り込むたびに乱数の ID を振る）。
 * 種類と配列の欄の対応は、derived-ids.mjs の EXPLICIT_ID_FIELDS（正本）を使う。
 *
 * @param {Array<{ path: string, data: object }>} machineFiles
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function validateItemIds(machineFiles) {
  const errors = [];
  for (const { path, data } of machineFiles) {
    for (const [field, kind] of EXPLICIT_ID_FIELDS) {
      const ownerById = new Map();
      for (const entry of data[field] ?? []) {
        if (!hasExplicitId(entry)) continue;
        const key = itemKey(kind, entry.name);
        const owner = ownerById.get(entry.id);
        if (owner === undefined) {
          ownerById.set(entry.id, key);
          continue;
        }
        errors.push({
          file: path,
          type: 'item-id',
          severity: 'error',
          message: `${key}: 明示の id（${entry.id}）が ${owner} と重なっている（アプリは _2 を付けないので、数えた記録が混ざる）`,
        });
      }
    }
  }
  return { errors, warnings: [] };
}
