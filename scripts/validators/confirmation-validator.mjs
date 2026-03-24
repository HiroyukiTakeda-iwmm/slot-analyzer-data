const DEFAULT_SETTINGS = ['1', '2', '3', '4', '5', '6'];

export function validateConfirmations(machineFiles) {
  const errors = [];
  const warnings = [];

  for (const { path: filePath, data } of machineFiles) {
    const availableSettings = data.availableSettings || DEFAULT_SETTINGS;
    const events = data.confirmationEvents || [];

    for (const event of events) {
      const confirmed = event.confirmedSettings || [];
      const excluded = event.excludedSettings || [];

      // confirmed と excluded の重複チェック
      const overlap = confirmed.filter((s) => excluded.includes(s));
      if (overlap.length > 0) {
        errors.push({
          file: filePath,
          type: 'confirmation',
          severity: 'error',
          message: `"${event.name}" confirmedとexcludedに重複: [${overlap.join(', ')}]`,
        });
      }

      // 設定値の妥当性チェック
      for (const s of [...confirmed, ...excluded]) {
        if (!availableSettings.includes(s)) {
          warnings.push({
            file: filePath,
            type: 'confirmation',
            severity: 'warning',
            message: `"${event.name}" 利用不可な設定値: "${s}" (利用可能: ${availableSettings.join(',')})`,
          });
        }
      }
    }

    // voiceCounts の整合性チェック
    if (data.voiceCounts) {
      for (const vc of data.voiceCounts) {
        const confirmed = vc.confirmedSettings || [];
        const excluded = vc.excludedSettings || [];
        const overlap = confirmed.filter((s) => excluded.includes(s));
        if (overlap.length > 0) {
          errors.push({
            file: filePath,
            type: 'confirmation',
            severity: 'error',
            message: `voiceCount "${vc.name}" confirmedとexcludedに重複: [${overlap.join(', ')}]`,
          });
        }
      }
    }
  }

  return { errors, warnings };
}
