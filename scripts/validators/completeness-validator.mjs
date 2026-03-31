/**
 * 完全性バリデーター
 * 機種データのフィールド充填度を検査し、Complete/Provisional/Incompleteに分類する
 */

const JUGGLER_PATTERNS = [
  'juggler/',
  'funkyjuggler/',
  'gogojuggler/',
  'happyjuggler/',
  'aimjuggler/',
];

function isJugglerPath(path) {
  return JUGGLER_PATTERNS.some((p) => path.includes(p));
}

function isAtypeOrJuggler(data, path) {
  return data.type === 'A-type' || isJugglerPath(path);
}

function hasReasonForEmpty(data) {
  const text = `${data.notes || ''} ${data.description || ''}`;
  return /解析未|導入前|未公開|暫定/.test(text);
}

/**
 * @param {Array<{path: string, data: object}>} machineFiles
 * @returns {{errors: Array, warnings: Array, info: Array, summary: object}}
 */
export function validateCompleteness(machineFiles) {
  const errors = [];
  const warnings = [];
  const info = [];

  let complete = 0;
  let provisional = 0;
  let incomplete = 0;

  const stats = {
    rolesNonEmpty: 0,
    confirmationEventsKey: 0,
    endScreensNonEmpty: 0,
    trialSuccessRates: 0,
    description: 0,
    source: 0,
    voiceCountsNonEmpty: 0,
    total: machineFiles.length,
  };

  for (const { path, data } of machineFiles) {
    if (!data) continue;

    let isComplete = true;
    const atypeOrJuggler = isAtypeOrJuggler(data, path);

    // roles チェック
    if (data.roles && data.roles.length > 0) {
      stats.rolesNonEmpty++;
    } else {
      isComplete = false;
      if (hasReasonForEmpty(data)) {
        info.push({
          file: path,
          type: 'completeness',
          severity: 'info',
          message: 'rolesが空（理由記載あり: Provisional）',
        });
      } else {
        warnings.push({
          file: path,
          type: 'completeness',
          severity: 'warning',
          message: 'rolesが空（理由未記載）',
        });
      }
    }

    // confirmationEvents チェック
    if ('confirmationEvents' in data) {
      stats.confirmationEventsKey++;
    } else {
      isComplete = false;
      warnings.push({
        file: path,
        type: 'completeness',
        severity: 'warning',
        message: 'confirmationEventsキーが欠落',
      });
    }

    // endScreens チェック
    const hasEndScreens =
      (data.endScreens && data.endScreens.length > 0) ||
      (data.endScreenGroups && data.endScreenGroups.length > 0);
    if (hasEndScreens) {
      stats.endScreensNonEmpty++;
    } else if (!atypeOrJuggler) {
      if (!('endScreens' in data) && !('endScreenGroups' in data)) {
        isComplete = false;
        warnings.push({
          file: path,
          type: 'completeness',
          severity: 'warning',
          message: 'endScreensキーが欠落（AT/BT機）',
        });
      } else {
        info.push({
          file: path,
          type: 'completeness',
          severity: 'info',
          message: 'endScreensが空',
        });
      }
    }

    // trialSuccessRates チェック
    if (data.trialSuccessRates && data.trialSuccessRates.length > 0) {
      stats.trialSuccessRates++;
    }

    // description チェック
    if (data.description && data.description.length > 0) {
      stats.description++;
    }

    // source チェック
    if (data.source && data.source.length > 0) {
      stats.source++;
    }

    // voiceCounts チェック
    if (data.voiceCounts && data.voiceCounts.length > 0) {
      stats.voiceCountsNonEmpty++;
    }

    // 分類
    if (isComplete) {
      complete++;
    } else if (hasReasonForEmpty(data)) {
      provisional++;
    } else {
      incomplete++;
    }
  }

  return {
    errors,
    warnings,
    info,
    summary: {
      complete,
      provisional,
      incomplete,
      stats,
    },
  };
}
