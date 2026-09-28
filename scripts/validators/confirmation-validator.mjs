import { CANNOT_LOAD, NOT_USED, OVERLAP, STOPS_ESTIMATE } from './app-impact.mjs';
import { hasPatterns } from '../lib/expand-patterns.mjs';

const DEFAULT_SETTINGS = ['1', '2', '3', '4', '5', '6'];

// メッセージの末尾には、アプリ（SlotAnalyzer）での影響を添える（app-impact.mjs）。
// 確定・否定の設定に機種の設定番号でない値があると、アプリは推定全体を止める（invalid-settings）。
// アプリは設定の値を文字列、minSetting を数として読み、形が違うと機種ファイルごと読み込まない

function toError(filePath, message) {
  return { file: filePath, type: 'confirmation', severity: 'error', message };
}

/** 配列でなければ空とみなす（形はスキーマの検証が確かめる） */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** 設定番号でない値の、アプリでの影響。文字列でなければ機種ごと読み込めない */
function impactOf(value) {
  return typeof value === 'string' ? STOPS_ESTIMATE : CANNOT_LOAD;
}

/**
 * アプリが項目の確定・否定の設定をどう扱うか（checkSettingLists の usage）。
 * - ESTIMATE: 読み込み時に文字列の配列かを確かめ、推定に使う
 * - DISCARDED: 読み込み時に文字列の配列かを確かめるが、移行処理が捨てて推定には使わない
 *   （patterns が空でない最上位の終了画面の親）
 * - UNREAD: 読み込み時に捨てる（楽曲・演出カウント）
 */
const ESTIMATE = 'estimate';
const DISCARDED = 'discarded';
const UNREAD = 'unread';

/** 設定番号でない値の末尾。推定に使わない値でも、読み込み時に確かめる値は文字列でなければ読み込めない */
function invalidValueImpact(value, usage) {
  if (usage === ESTIMATE) return impactOf(value);
  if (usage === DISCARDED && typeof value !== 'string') return CANNOT_LOAD;
  return NOT_USED;
}

/**
 * 確定・否定の設定（confirmedSettings / excludedSettings）を確かめる。
 * 機種の設定番号でない値と、両方にある値はエラー。
 *
 * @param {object} item 確定演出・終了画面・ボイスなどの項目
 * @param {string} label メッセージで項目を示す文字列（例: `endScreens "翔"`）
 * @param {string[]} settings 機種の設定番号（availableSettings。無ければ 1〜6）
 * @param {string} usage アプリがこの項目の確定・否定の設定をどう扱うか（ESTIMATE・DISCARDED・UNREAD）
 */
function checkSettingLists(item, label, settings, filePath, errors, usage = ESTIMATE) {
  const confirmed = asArray(item.confirmedSettings);
  const excluded = asArray(item.excludedSettings);
  for (const [field, values] of [
    ['confirmedSettings', confirmed],
    ['excludedSettings', excluded],
  ]) {
    for (const value of values) {
      if (settings.includes(value)) continue;
      errors.push(
        toError(
          filePath,
          `${label} ${field} に設定番号でない値: ${JSON.stringify(value)} (利用可能: ${settings.join(',')})${invalidValueImpact(value, usage)}`
        )
      );
    }
  }

  const overlap = confirmed.filter((s) => excluded.includes(s));
  if (overlap.length > 0) {
    errors.push(
      toError(
        filePath,
        `${label} confirmedとexcludedに重複: [${overlap.join(', ')}]${usage === ESTIMATE ? OVERLAP : NOT_USED}`
      )
    );
  }
}

/**
 * 最上位の終了画面の patterns を確かめる。アプリの移行処理はパターンごとの終了画面に展開し、
 * setting をそのまま確定する設定にする（"high" なら ["high"]）。minSetting は数として比べる。
 */
function checkPatterns(screen, settings, filePath, errors) {
  for (const pattern of asArray(screen.patterns)) {
    const label = `endScreens "${screen.name}" / patterns "${pattern.name}"`;
    if (pattern.setting !== undefined && !settings.includes(pattern.setting)) {
      errors.push(
        toError(
          filePath,
          `${label} setting が設定番号でない: ${JSON.stringify(pattern.setting)} (利用可能: ${settings.join(',')})${impactOf(pattern.setting)}`
        )
      );
    }
    if (pattern.minSetting !== undefined && typeof pattern.minSetting !== 'number') {
      errors.push(
        toError(
          filePath,
          `${label} minSetting が数でない: ${JSON.stringify(pattern.minSetting)}${CANNOT_LOAD}`
        )
      );
    }
  }
}

export function validateConfirmations(machineFiles) {
  const errors = [];
  // 検証器の共通の形（errors / warnings）に合わせる。今の規則はすべてエラー
  const warnings = [];

  for (const { path: filePath, data } of machineFiles) {
    const settings = data.availableSettings || DEFAULT_SETTINGS;

    // 確定演出: アプリは演出を有効にした時点で、確定・否定の設定を推定に使う
    for (const event of asArray(data.confirmationEvents)) {
      checkSettingLists(event, `confirmationEvents "${event.name}"`, settings, filePath, errors);
    }

    // 終了画面: アプリは1回でも数えると、確定・否定の設定を推定に使う。ただし patterns が空でない
    // 最上位の終了画面は、移行処理がパターンごとの終了画面に展開し、親の確定・否定の設定を捨てる
    for (const screen of asArray(data.endScreens)) {
      const usage = hasPatterns(screen) ? DISCARDED : ESTIMATE;
      checkSettingLists(screen, `endScreens "${screen.name}"`, settings, filePath, errors, usage);
      checkPatterns(screen, settings, filePath, errors);
    }
    for (const group of asArray(data.endScreenGroups)) {
      for (const screen of asArray(group.endScreens)) {
        const label = `endScreenGroups "${group.name}" / endScreens "${screen.name}"`;
        checkSettingLists(screen, label, settings, filePath, errors);
      }
    }

    // ボイス・楽曲・演出カウント: アプリは終了画面と同じく推定に使う。
    // ただし楽曲・演出の確定・否定の設定は、アプリが読まない（スキーマでも禁止）
    for (const [field, usage] of [
      ['voiceCounts', ESTIMATE],
      ['musicCounts', UNREAD],
      ['effectCounts', UNREAD],
    ]) {
      for (const item of asArray(data[field])) {
        checkSettingLists(item, `${field} "${item.name}"`, settings, filePath, errors, usage);
      }
    }
  }

  return { errors, warnings };
}
