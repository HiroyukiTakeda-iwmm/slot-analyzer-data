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
 * アプリの読み込み時の形の確かめは name を空でない文字列に限る（規則7。スキーマは確かめない）。
 * name の無いパターンは、何番目か（0 から数える）で示す。
 */
function checkPatterns(screen, settings, filePath, errors) {
  asArray(screen.patterns).forEach((pattern, index) => {
    const hasName = typeof pattern.name === 'string' && pattern.name.length > 0;
    const label = `endScreens "${screen.name}" / ${hasName ? `patterns "${pattern.name}"` : `patterns[${index}]`}`;
    if (!hasName) {
      const name = pattern.name === undefined ? '(無し)' : JSON.stringify(pattern.name);
      errors.push(
        toError(filePath, `${label} name が無い・空・文字列でない: ${name}${CANNOT_LOAD}`)
      );
    }
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
  });
}

/** アプリが推定に使う、項目の確定・否定の設定 */
function listsOf(item) {
  return { confirmed: asArray(item.confirmedSettings), excluded: asArray(item.excludedSettings) };
}

/**
 * 確定・否定の設定でアプリが除く設定（utils/binomial.ts の resolveSettingConstraints と同じ）。
 * 否定の設定と、確定の設定があればその外。ほかの規則が同じ項目を止めるときは null（重ねない）:
 * 設定番号でない値はアプリが別の理由（invalid-settings）で止め、確定する設定がすべて否定にもある
 * 項目は、両方にある値の規則（OVERLAP）が同じことを伝える。
 *
 * @param {{ confirmed: unknown[], excluded: unknown[] } | null} lists 読まない項目は null
 * @returns {string[] | null}
 */
function settingsExcludedByLists(lists, settings) {
  if (lists === null) return [];
  const { confirmed, excluded } = lists;
  if ([...confirmed, ...excluded].some((value) => !settings.includes(value))) return null;
  if (confirmed.length > 0 && confirmed.every((value) => excluded.includes(value))) return null;
  return settings.filter(
    (setting) =>
      excluded.includes(setting) || (confirmed.length > 0 && !confirmed.includes(setting))
  );
}

/**
 * 1つの項目だけで全設定を否定する書き方を止める（規則8）。アプリ（utils/binomial.ts）は、数えた項目の
 * 確率が 0 の設定の尤度を 0 にし（log(0)）、確定・否定の設定で除く設定を除く。除かれない設定が
 * 残らなければ、数えた（確定演出は有効にした）時点で推定が止まる（all-settings-excluded）。
 * 試行成功率と役は見ない: 成功・失敗の一方を数えたときだけ止まる（確率がすべて 0 か 1）か、
 * 設定差が無く推定に使わない（全設定が同じ値の役）。
 *
 * @param {object} evidence アプリが数えたときに使う欄
 * @param {{ confirmed: unknown[], excluded: unknown[] } | null} evidence.lists 確定・否定の設定。読まない項目は null
 * @param {object} [evidence.probabilities] 確率（無い項目は undefined）
 */
function checkAllSettingsDenied(label, settings, { lists, probabilities }, filePath, errors) {
  const byLists = settingsExcludedByLists(lists, settings);
  if (byLists === null) return;
  const byZero =
    probabilities !== null && typeof probabilities === 'object'
      ? settings.filter((setting) => probabilities[setting] === 0)
      : [];
  if (settings.some((setting) => !byLists.includes(setting) && !byZero.includes(setting))) return;
  const reasons = [];
  if (byZero.length > 0) reasons.push(`確率が 0: ${byZero.join(',')}`);
  if (byLists.length > 0) reasons.push(`確定・否定の設定で除く: ${byLists.join(',')}`);
  errors.push(
    toError(
      filePath,
      `${label} だけで全設定を否定している (${reasons.join(' / ')})${STOPS_ESTIMATE}`
    )
  );
}

export function validateConfirmations(machineFiles) {
  const errors = [];
  // 検証器の共通の形（errors / warnings）に合わせる。今の規則はすべてエラー
  const warnings = [];

  for (const { path: filePath, data } of machineFiles) {
    const settings = data.availableSettings || DEFAULT_SETTINGS;

    // 確定演出: アプリは演出を有効にした時点で、確定・否定の設定を推定に使う
    for (const event of asArray(data.confirmationEvents)) {
      const label = `confirmationEvents "${event.name}"`;
      checkSettingLists(event, label, settings, filePath, errors);
      checkAllSettingsDenied(label, settings, { lists: listsOf(event) }, filePath, errors);
    }

    // 終了画面: アプリは1回でも数えると、確定・否定の設定と確率を推定に使う。最上位の確率は
    // probabilities、無ければ distribution（移行処理が改名して使う）。ただし patterns が空でない
    // 最上位の終了画面は、移行処理がパターンごとの終了画面に展開し、親の確定・否定の設定と確率を捨てる
    for (const screen of asArray(data.endScreens)) {
      const label = `endScreens "${screen.name}"`;
      const usage = hasPatterns(screen) ? DISCARDED : ESTIMATE;
      checkSettingLists(screen, label, settings, filePath, errors, usage);
      checkPatterns(screen, settings, filePath, errors);
      if (usage === ESTIMATE) {
        const probabilities = screen.probabilities ?? screen.distribution;
        const evidence = { lists: listsOf(screen), probabilities };
        checkAllSettingsDenied(label, settings, evidence, filePath, errors);
      }
    }
    for (const group of asArray(data.endScreenGroups)) {
      for (const screen of asArray(group.endScreens)) {
        const label = `endScreenGroups "${group.name}" / endScreens "${screen.name}"`;
        checkSettingLists(screen, label, settings, filePath, errors);
        const evidence = { lists: listsOf(screen), probabilities: screen.probabilities };
        checkAllSettingsDenied(label, settings, evidence, filePath, errors);
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
        const label = `${field} "${item.name}"`;
        checkSettingLists(item, label, settings, filePath, errors, usage);
        const lists = usage === ESTIMATE ? listsOf(item) : null;
        const evidence = { lists, probabilities: item.probabilities };
        checkAllSettingsDenied(label, settings, evidence, filePath, errors);
      }
    }
  }

  return { errors, warnings };
}
