import { NOT_USED, STOPS_ESTIMATE } from './app-impact.mjs';
import { hasPatterns } from '../lib/expand-patterns.mjs';

const DEFAULT_SETTINGS = ['1', '2', '3', '4', '5', '6'];

// メッセージの末尾には、アプリ（SlotAnalyzer）での影響を添える（app-impact.mjs）。
// 推定に使う確率に機種の設定のキーが欠けていると、アプリは推定全体を止める（missing-probability）。
// アプリは機種の設定のキーだけを読む

function getExpectedSettings(data) {
  return data.availableSettings || DEFAULT_SETTINGS;
}

function checkProbabilityRange(probs, roleName, filePath, results) {
  // 確率値の範囲チェック（0-1）
  for (const [key, val] of Object.entries(probs)) {
    if (typeof val !== 'number' || val < 0 || val > 1) {
      results.errors.push({
        file: filePath,
        type: 'probability',
        severity: 'error',
        message: `"${roleName}" 設定${key}: 確率値が範囲外 (${val})`,
      });
    }
  }
}

/**
 * アプリの推定が使う確率が、機種のすべての設定のキーを持つかを確かめる。
 * 欠けたキーと、設定に無いキーはエラー。0 は「その設定では出ない」の意味で、キーがあるものとして数える。
 * 確率を持たない項目（確率の無い終了画面・ボイスなど）は見ない。形はスキーマの検証が確かめる。
 *
 * @param {object | undefined} probs 設定をキー、確率を値とするオブジェクト
 * @param {string} label メッセージで項目を示す文字列（例: `endScreens "翔"`）
 * @param {string} field 確率の欄の名前（`probabilities` か `distribution`）
 * @param {string[]} settings 機種の設定番号（availableSettings。無ければ 1〜6）
 * @param {string} missingImpact 欠けたキーのメッセージの末尾（アプリが使わない確率なら NOT_USED）
 */
function checkSettingKeys(
  probs,
  label,
  field,
  settings,
  filePath,
  results,
  missingImpact = STOPS_ESTIMATE
) {
  if (probs === null || typeof probs !== 'object' || Array.isArray(probs)) return;
  const keys = Object.keys(probs);
  const missing = settings.filter((setting) => !keys.includes(setting));
  const extra = keys.filter((key) => !settings.includes(key));
  if (missing.length > 0) {
    results.errors.push({
      file: filePath,
      type: 'probability',
      severity: 'error',
      message: `${label} ${field} に設定のキーが無い: ${missing.join(',')} (設定: ${settings.join(',')})${missingImpact}`,
    });
  }
  if (extra.length > 0) {
    results.errors.push({
      file: filePath,
      type: 'probability',
      severity: 'error',
      message: `${label} ${field} に設定に無いキー: ${extra.join(',')} (設定: ${settings.join(',')})${NOT_USED}`,
    });
  }
}

function checkSettingDiffConsistency(role, filePath, results) {
  const values = Object.values(role.probabilities);
  const allSame = values.every((v) => v === values[0]);

  if (role.hasSettingDiff && allSame && values.length > 1) {
    results.errors.push({
      file: filePath,
      type: 'probability',
      severity: 'error',
      message: `"${role.name}" hasSettingDiff=true だが全設定同一値 (${values[0]})`,
    });
  }

  if (!role.hasSettingDiff && !allSame) {
    results.errors.push({
      file: filePath,
      type: 'probability',
      severity: 'error',
      message: `"${role.name}" hasSettingDiff=false だが確率値に差異あり`,
    });
  }
}

function checkDisplayOrder(roles, filePath, results) {
  const orders = roles.map((r) => r.displayOrder).filter((o) => o != null);
  const uniqueOrders = new Set(orders);
  if (orders.length !== uniqueOrders.size) {
    results.warnings.push({
      file: filePath,
      type: 'probability',
      severity: 'warning',
      message: `displayOrderに重複あり: [${orders.join(', ')}]`,
    });
  }
}

export function validateProbabilities(machineFiles) {
  const results = { errors: [], warnings: [] };

  for (const { path: filePath, data } of machineFiles) {
    const expectedSettings = getExpectedSettings(data);
    const checkKeys = (probs, label, field = 'probabilities', missingImpact = STOPS_ESTIMATE) =>
      checkSettingKeys(probs, label, field, expectedSettings, filePath, results, missingImpact);

    // roles チェック
    if (data.roles) {
      for (const role of data.roles) {
        checkProbabilityRange(role.probabilities, role.name, filePath, results);
        checkKeys(role.probabilities, `roles "${role.name}"`);
        checkSettingDiffConsistency(role, filePath, results);
      }
      checkDisplayOrder(data.roles, filePath, results);
    }

    // zones内のrolesチェック
    if (data.zones) {
      for (const zone of data.zones) {
        if (zone.roles) {
          for (const role of zone.roles) {
            checkProbabilityRange(
              role.probabilities,
              `${zone.name}/${role.name}`,
              filePath,
              results
            );
            checkKeys(role.probabilities, `zones "${zone.name}" / roles "${role.name}"`);
            checkSettingDiffConsistency(role, filePath, results);
          }
        }
      }
    }

    // trialSuccessRates チェック
    if (data.trialSuccessRates) {
      for (const rate of data.trialSuccessRates) {
        checkProbabilityRange(rate.probabilities, rate.name, filePath, results);
        checkKeys(rate.probabilities, `trialSuccessRates "${rate.name}"`);
      }
    }

    // 終了画面の確率（アプリは1回でも数えると推定に使う）。最上位は probabilities、無ければ
    // distribution（アプリの移行処理が probabilities に改名して使う）。グループの中の distribution は
    // アプリが使わないので見ない。patterns が空でない最上位の終了画面は、移行処理がパターンごとの
    // 終了画面に展開し、親の probabilities・distribution を捨てる（欠けても推定は止まらない）
    for (const screen of data.endScreens ?? []) {
      const hasProbabilities = screen.probabilities !== undefined && screen.probabilities !== null;
      const field = hasProbabilities ? 'probabilities' : 'distribution';
      const missingImpact = hasPatterns(screen) ? NOT_USED : STOPS_ESTIMATE;
      checkKeys(screen[field], `endScreens "${screen.name}"`, field, missingImpact);
    }
    for (const group of data.endScreenGroups ?? []) {
      for (const screen of group.endScreens ?? []) {
        checkKeys(
          screen.probabilities,
          `endScreenGroups "${group.name}" / endScreens "${screen.name}"`
        );
      }
    }

    // ボイス・楽曲・演出カウントの確率（アプリは終了画面と同じく推定に使う）
    for (const field of ['voiceCounts', 'musicCounts', 'effectCounts']) {
      for (const item of data[field] ?? []) {
        checkKeys(item.probabilities, `${field} "${item.name}"`);
      }
    }

    // availableSettings の必要性チェック
    // roles が空の場合は trialSuccessRates からキーを取得
    const roleKeys = data.roles?.[0]?.probabilities
      ? Object.keys(data.roles[0].probabilities)
      : data.trialSuccessRates?.[0]?.probabilities
        ? Object.keys(data.trialSuccessRates[0].probabilities)
        : [];
    const sortedRoleKeys = [...roleKeys].sort();
    const sortedDefault = [...DEFAULT_SETTINGS].sort();
    if (
      JSON.stringify(sortedRoleKeys) !== JSON.stringify(sortedDefault) &&
      !data.availableSettings
    ) {
      results.warnings.push({
        file: filePath,
        type: 'probability',
        severity: 'warning',
        message: `設定キーが標準(1-6)と異なる(${sortedRoleKeys.join(',')})がavailableSettingsが未設定`,
      });
    }
  }

  return results;
}
