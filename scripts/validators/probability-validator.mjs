const DEFAULT_SETTINGS = ['1', '2', '3', '4', '5', '6'];

function getExpectedSettings(data) {
  return data.availableSettings || DEFAULT_SETTINGS;
}

function checkProbabilities(probs, roleName, filePath, expectedSettings, results) {
  const keys = Object.keys(probs);

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

  // probキーとavailableSettingsの整合性
  const sortedKeys = [...keys].sort();
  const sortedExpected = [...expectedSettings].sort();
  if (JSON.stringify(sortedKeys) !== JSON.stringify(sortedExpected)) {
    results.warnings.push({
      file: filePath,
      type: 'probability',
      severity: 'warning',
      message: `"${roleName}" 設定キー不一致: 期待=${sortedExpected.join(',')} / 実際=${sortedKeys.join(',')}`,
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

    // roles チェック
    if (data.roles) {
      for (const role of data.roles) {
        checkProbabilities(role.probabilities, role.name, filePath, expectedSettings, results);
        checkSettingDiffConsistency(role, filePath, results);
      }
      checkDisplayOrder(data.roles, filePath, results);
    }

    // zones内のrolesチェック
    if (data.zones) {
      for (const zone of data.zones) {
        if (zone.roles) {
          for (const role of zone.roles) {
            checkProbabilities(role.probabilities, `${zone.name}/${role.name}`, filePath, expectedSettings, results);
            checkSettingDiffConsistency(role, filePath, results);
          }
        }
      }
    }

    // trialSuccessRates チェック
    if (data.trialSuccessRates) {
      for (const rate of data.trialSuccessRates) {
        checkProbabilities(rate.probabilities, rate.name, filePath, expectedSettings, results);
      }
    }

    // availableSettings の必要性チェック
    const roleKeys = data.roles?.[0]?.probabilities
      ? Object.keys(data.roles[0].probabilities)
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
