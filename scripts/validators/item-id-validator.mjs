import { EXPLICIT_ID_KINDS, hasExplicitId } from '../lib/derived-ids.mjs';
import { itemKey } from '../lib/provenance.mjs';

/** EXPLICIT_ID_KINDS の種類の、機種ファイルの配列の欄 */
const FIELD_BY_KIND = {
  confirmationEvent: 'confirmationEvents',
  trialSuccessRate: 'trialSuccessRates',
  voiceCount: 'voiceCounts',
  musicCount: 'musicCounts',
  effectCount: 'effectCounts',
  modeTransition: 'modeTransitions',
};

/**
 * 確定演出・試行成功率・ボイス・楽曲・演出・モード移行の明示の id が、同じ機種の同じ種類の中で重なっていないかを
 * 確かめる（仕様 5.8）。アプリはこの種類では id をそのまま使い、重なっても `_2` を付けないので、数えた記録が
 * 混ざる。種類が違えば同じ id でもよい。id の無い項目は見ない（アプリが取り込むたびに乱数の ID を振る）。
 *
 * @param {Array<{ path: string, data: object }>} machineFiles
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function validateItemIds(machineFiles) {
  const errors = [];
  for (const { path, data } of machineFiles) {
    for (const kind of EXPLICIT_ID_KINDS) {
      const ownerById = new Map();
      for (const entry of data[FIELD_BY_KIND[kind]] ?? []) {
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
