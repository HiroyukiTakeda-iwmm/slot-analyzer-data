import { describe, it, expect } from 'vitest';
import { validateSchemas } from '../scripts/validators/schema-validator.mjs';
import { validateProbabilities } from '../scripts/validators/probability-validator.mjs';
import { validateConfirmations } from '../scripts/validators/confirmation-validator.mjs';
import { validateIndexConsistency } from '../scripts/validators/index-consistency.mjs';
import { validateCompleteness } from '../scripts/validators/completeness-validator.mjs';
import {
  CANNOT_LOAD,
  NOT_USED,
  OVERLAP,
  STOPS_ESTIMATE,
} from '../scripts/validators/app-impact.mjs';

const validMachine = {
  name: 'テスト機種',
  type: 'AT',
  roles: [
    {
      name: '弱チェリー',
      probabilities: {
        1: 0.009174,
        2: 0.009346,
        3: 0.009524,
        4: 0.009709,
        5: 0.009901,
        6: 0.010101,
      },
      hasSettingDiff: true,
      displayOrder: 1,
      color: '#E91E63',
    },
  ],
  confirmationEvents: [],
  author: 'コミュニティ',
  version: '1.0',
  lastUpdated: '2026-03-27',
};

const validIndex = {
  version: '1.0',
  updatedAt: '2026-03-25T00:00:00Z',
  machines: [
    {
      id: 'test-machine',
      name: 'テスト機種',
      type: 'AT',
      author: 'コミュニティ',
      version: '1.0',
      file: 'test/test-machine.json',
    },
  ],
};

describe('schema-validator', () => {
  it('正常なデータでエラーなし', () => {
    const result = validateSchemas(
      [{ path: 'machines/test/test-machine.json', data: validMachine }],
      validIndex
    );
    expect(result.errors).toHaveLength(0);
  });

  it('不正なtypeでエラー', () => {
    const bad = { ...validMachine, type: 'INVALID' };
    const result = validateSchemas([{ path: 'machines/test/test.json', data: bad }], validIndex);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rolesが空でもスキーマエラーなし', () => {
    const empty = { ...validMachine, roles: [] };
    const result = validateSchemas([{ path: 'machines/test/test.json', data: empty }], validIndex);
    expect(result.errors).toHaveLength(0);
  });
});

describe('probability-validator', () => {
  it('hasSettingDiff=true + 全設定同値 → エラー', () => {
    const bad = {
      ...validMachine,
      roles: [
        {
          name: '同値テスト',
          probabilities: { 1: 0.01, 2: 0.01, 3: 0.01, 4: 0.01, 5: 0.01, 6: 0.01 },
          hasSettingDiff: true,
          displayOrder: 1,
        },
      ],
    };
    const result = validateProbabilities([{ path: 'test.json', data: bad }]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('hasSettingDiff=true');
  });

  it('hasSettingDiff=false + 確率差あり → エラー', () => {
    const bad = {
      ...validMachine,
      roles: [
        {
          name: '差異テスト',
          probabilities: { 1: 0.01, 2: 0.01, 3: 0.01, 4: 0.01, 5: 0.01, 6: 0.02 },
          hasSettingDiff: false,
          displayOrder: 1,
        },
      ],
    };
    const result = validateProbabilities([{ path: 'test.json', data: bad }]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('hasSettingDiff=false');
  });

  it('正常なデータでエラーなし', () => {
    const result = validateProbabilities([{ path: 'test.json', data: validMachine }]);
    expect(result.errors).toHaveLength(0);
  });

  it('availableSettings未設定で非標準キー → 警告', () => {
    const nonStd = {
      ...validMachine,
      roles: [
        {
          name: '5段階設定',
          probabilities: { 1: 0.01, 2: 0.01, 4: 0.01, 5: 0.01, 6: 0.02 },
          hasSettingDiff: true,
          displayOrder: 1,
        },
      ],
    };
    const result = validateProbabilities([{ path: 'test.json', data: nonStd }]);
    expect(result.warnings.some((w) => w.message.includes('availableSettings'))).toBe(true);
  });
});

describe('confirmation-validator', () => {
  it('confirmed/excludedに重複 → エラー', () => {
    const bad = {
      ...validMachine,
      confirmationEvents: [
        {
          name: '重複テスト',
          confirmedSettings: ['4', '5', '6'],
          excludedSettings: ['1', '2', '4'],
          color: '#FFD700',
        },
      ],
    };
    const result = validateConfirmations([{ path: 'test.json', data: bad }]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('重複');
  });

  it('正常なconfirmationEventsでエラーなし', () => {
    const good = {
      ...validMachine,
      confirmationEvents: [
        {
          name: '金トロフィー',
          confirmedSettings: ['4', '5', '6'],
          excludedSettings: ['1', '2', '3'],
          color: '#FFD700',
        },
      ],
    };
    const result = validateConfirmations([{ path: 'test.json', data: good }]);
    expect(result.errors).toHaveLength(0);
  });
});

// --- アプリの推定が止まる設定の指定と確率の欠け（3.9.0 の規則1〜5） ---
// アプリは、確定・否定の設定に機種の設定番号でない値があると推定全体を止め（invalid-settings）、
// 推定に使う確率に機種の設定のキーが欠けていても止める（missing-probability）。

const FOUR_SETTINGS = ['1', '2', '5', '6'];

function machineWith(overrides) {
  return { ...validMachine, ...overrides };
}

function checkConfirmations(data) {
  return validateConfirmations([{ path: 'test.json', data }]);
}

function checkProbabilities(data) {
  return validateProbabilities([{ path: 'test.json', data }]);
}

/** 渡した設定のキーをすべて持つ確率 */
function probabilitiesFor(settings, value = 0.01) {
  return Object.fromEntries(settings.map((setting) => [setting, value]));
}

/** label を含むエラーのメッセージを返す。ちょうど1件でなければ落とす */
function onlyMessage(errors, label) {
  const found = errors.filter((e) => e.message.includes(label));
  expect(found, label).toHaveLength(1);
  return found[0].message;
}

describe('confirmation-validator: 終了画面の確定・否定の設定（規則1）', () => {
  it('最上位の endScreens の confirmedSettings に設定番号でない値 → エラー', () => {
    const data = machineWith({
      endScreens: [{ name: '紫枠', confirmedSettings: ['high'], excludedSettings: [] }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: 'test.json', type: 'confirmation', severity: 'error' });
    expect(errors[0].message).toContain(
      'endScreens "紫枠" confirmedSettings に設定番号でない値: "high" (利用可能: 1,2,3,4,5,6)'
    );
    expect(errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('機種の availableSettings に無い設定（4段階の機種の "3"）→ エラー', () => {
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      endScreens: [{ name: '青', excludedSettings: ['3'] }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('excludedSettings に設定番号でない値: "3"');
    expect(errors[0].message).toContain('(利用可能: 1,2,5,6)');
  });

  it('endScreenGroups の中の endScreens の設定番号でない値 → エラー（グループと画面の名前が分かる）', () => {
    const data = machineWith({
      endScreenGroups: [
        { name: 'AT終了画面', endScreens: [{ name: '赤', confirmedSettings: ['odd'] }] },
      ],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('endScreenGroups "AT終了画面" / endScreens "赤"');
    expect(errors[0].message).toContain('confirmedSettings に設定番号でない値: "odd"');
    expect(errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('confirmedSettings と excludedSettings の両方にある値 → エラー（最上位とグループの中）', () => {
    const data = machineWith({
      endScreens: [{ name: '金枠', confirmedSettings: ['5', '6'], excludedSettings: ['1', '6'] }],
      endScreenGroups: [
        {
          name: 'ボーナス終了画面',
          endScreens: [{ name: '虹', confirmedSettings: ['6'], excludedSettings: ['6'] }],
        },
      ],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, 'endScreens "金枠"')).toContain('confirmedとexcludedに重複: [6]');
    expect(onlyMessage(errors, 'endScreens "虹"')).toContain('confirmedとexcludedに重複: [6]');
    for (const e of errors) {
      expect(e.severity).toBe('error');
      // アプリは否定を優先する。確定する設定がすべて否定にもあるときだけ推定が止まる
      expect(e.message.endsWith(OVERLAP)).toBe(true);
    }
  });

  it('設定番号だけで、両方にある値が無ければ通る（4段階の機種）', () => {
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      endScreens: [
        { name: '金枠', confirmedSettings: ['5', '6'], excludedSettings: ['1', '2'] },
        { name: 'デフォルト' },
      ],
      endScreenGroups: [
        { name: 'AT終了画面', endScreens: [{ name: '赤', excludedSettings: ['1'] }] },
      ],
    });
    const result = checkConfirmations(data);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('confirmation-validator: 終了画面のパターン（規則2）', () => {
  function withPatterns(patterns, extra = {}) {
    return machineWith({ ...extra, endScreens: [{ name: 'CZ/ST終了画面', patterns }] });
  }

  it('patterns の setting が設定番号でない → エラー', () => {
    const { errors } = checkConfirmations(withPatterns([{ name: '紫枠', setting: 'high' }]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'confirmation', severity: 'error' });
    expect(errors[0].message).toContain('endScreens "CZ/ST終了画面" / patterns "紫枠"');
    expect(errors[0].message).toContain('setting が設定番号でない: "high"');
    expect(errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('patterns の setting が機種の availableSettings に無い → エラー', () => {
    const data = withPatterns([{ name: '青', setting: '3' }], { availableSettings: FOUR_SETTINGS });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('setting が設定番号でない: "3" (利用可能: 1,2,5,6)');
  });

  it('patterns の setting が文字列でない → エラー（アプリは機種を読み込めない）', () => {
    const { errors } = checkConfirmations(withPatterns([{ name: '虹', setting: 6 }]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('patterns "虹" setting が設定番号でない: 6');
    expect(errors[0].message.endsWith(CANNOT_LOAD)).toBe(true);
  });

  it('patterns の minSetting が数でない → エラー（アプリは機種を読み込めない）', () => {
    const { errors } = checkConfirmations(withPatterns([{ name: '金', minSetting: '4' }]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'confirmation', severity: 'error' });
    expect(errors[0].message).toContain('patterns "金" minSetting が数でない: "4"');
    expect(errors[0].message.endsWith(CANNOT_LOAD)).toBe(true);
  });

  it('setting が設定番号・minSetting が数・どちらも無いパターンは通る', () => {
    const data = withPatterns([
      { name: '設定6示唆', setting: '6', description: '設定6濃厚' },
      { name: '金背景', minSetting: 4 },
      { name: 'デフォルト', description: '示唆なし' },
    ]);
    const result = checkConfirmations(data);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('confirmation-validator: 確定演出の設定番号（規則3）', () => {
  it('確定演出の設定番号でない値は、警告でなくエラー', () => {
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      confirmationEvents: [
        { name: '虹トロフィー', confirmedSettings: ['6'], excludedSettings: ['1', '3'] },
      ],
    });
    const result = checkConfirmations(data);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ type: 'confirmation', severity: 'error' });
    expect(result.errors[0].message).toContain(
      'confirmationEvents "虹トロフィー" excludedSettings に設定番号でない値: "3"'
    );
    expect(result.errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('設定番号だけの確定演出は、エラーも警告も無い', () => {
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      confirmationEvents: [
        { name: '金トロフィー', confirmedSettings: ['5', '6'], excludedSettings: ['1', '2'] },
      ],
    });
    const result = checkConfirmations(data);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('confirmation-validator: ボイス・楽曲・演出カウントの設定（規則4）', () => {
  it('voiceCounts・musicCounts・effectCounts の設定番号でない値 → エラー', () => {
    const data = machineWith({
      voiceCounts: [{ name: '高設定セリフ', confirmedSettings: ['high'] }],
      musicCounts: [{ name: '専用曲', excludedSettings: ['L'] }],
      effectCounts: [{ name: '虹カットイン', confirmedSettings: ['7'] }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(3);
    expect(errors.every((e) => e.type === 'confirmation' && e.severity === 'error')).toBe(true);
    const voice = onlyMessage(errors, 'voiceCounts "高設定セリフ"');
    expect(voice).toContain('confirmedSettings に設定番号でない値: "high"');
    expect(voice.endsWith(STOPS_ESTIMATE)).toBe(true);
    // 楽曲・演出の確定・否定の設定は、今のアプリが読まない（スキーマでも禁止）
    const music = onlyMessage(errors, 'musicCounts "専用曲"');
    expect(music).toContain('excludedSettings に設定番号でない値: "L"');
    expect(music.endsWith(NOT_USED)).toBe(true);
    const effect = onlyMessage(errors, 'effectCounts "虹カットイン"');
    expect(effect).toContain('confirmedSettings に設定番号でない値: "7"');
    expect(effect.endsWith(NOT_USED)).toBe(true);
  });

  it('voiceCounts・musicCounts・effectCounts の confirmed と excluded の両方にある値 → エラー', () => {
    const both = { confirmedSettings: ['6'], excludedSettings: ['1', '6'] };
    const data = machineWith({
      voiceCounts: [{ name: 'ボイスA', ...both }],
      musicCounts: [{ name: '楽曲A', ...both }],
      effectCounts: [{ name: '演出A', ...both }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(3);
    for (const label of ['voiceCounts "ボイスA"', 'musicCounts "楽曲A"', 'effectCounts "演出A"']) {
      expect(onlyMessage(errors, label)).toContain('confirmedとexcludedに重複: [6]');
    }
    // ボイスはアプリが推定に使う。楽曲・演出の確定・否定の設定は、アプリが読まない
    expect(onlyMessage(errors, 'voiceCounts "ボイスA"').endsWith(OVERLAP)).toBe(true);
    expect(onlyMessage(errors, 'musicCounts "楽曲A"').endsWith(NOT_USED)).toBe(true);
    expect(onlyMessage(errors, 'effectCounts "演出A"').endsWith(NOT_USED)).toBe(true);
  });

  it('確定・否定の設定に文字列でない値 → エラー（アプリが機種を読み込めない。楽曲・演出はアプリが使わない）', () => {
    const data = machineWith({
      endScreens: [{ name: '紫枠', confirmedSettings: [6] }],
      endScreenGroups: [
        { name: 'AT終了画面', endScreens: [{ name: '赤', excludedSettings: [1] }] },
      ],
      confirmationEvents: [{ name: '虹トロフィー', confirmedSettings: [6], excludedSettings: [] }],
      voiceCounts: [{ name: '高設定セリフ', excludedSettings: [null] }],
      musicCounts: [{ name: '専用曲', confirmedSettings: [6] }],
      effectCounts: [{ name: '虹カットイン', excludedSettings: [1] }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(6);
    expect(errors.every((e) => e.type === 'confirmation' && e.severity === 'error')).toBe(true);
    expect(onlyMessage(errors, 'endScreens "紫枠"')).toContain(
      'confirmedSettings に設定番号でない値: 6 (利用可能: 1,2,3,4,5,6)'
    );
    // アプリは読み込み時に設定の値が文字列かを確かめ、違えば機種ファイルごと読み込まない
    expect(onlyMessage(errors, 'endScreens "紫枠"').endsWith(CANNOT_LOAD)).toBe(true);
    expect(onlyMessage(errors, 'endScreens "赤"').endsWith(CANNOT_LOAD)).toBe(true);
    expect(onlyMessage(errors, 'confirmationEvents "虹トロフィー"').endsWith(CANNOT_LOAD)).toBe(
      true
    );
    expect(onlyMessage(errors, 'voiceCounts "高設定セリフ"').endsWith(CANNOT_LOAD)).toBe(true);
    // 楽曲・演出の確定・否定の設定は、アプリが読み込み時に捨てるので、文字列でなくても読み込める
    expect(onlyMessage(errors, 'musicCounts "専用曲"').endsWith(NOT_USED)).toBe(true);
    expect(onlyMessage(errors, 'effectCounts "虹カットイン"').endsWith(NOT_USED)).toBe(true);
  });

  it('設定番号だけで、両方にある値が無ければ通る', () => {
    const valid = { confirmedSettings: ['5', '6'], excludedSettings: ['1'] };
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      voiceCounts: [{ name: 'ボイスA', ...valid }],
      musicCounts: [{ name: '楽曲A', ...valid }],
      effectCounts: [{ name: '演出A', ...valid }],
    });
    const result = checkConfirmations(data);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('probability-validator: 推定に使う確率の設定のキー（規則5）', () => {
  const FIVE_SETTINGS = ['1', '2', '3', '4', '6'];
  const fourSettingRole = {
    name: 'ベル',
    probabilities: probabilitiesFor(FOUR_SETTINGS),
    hasSettingDiff: false,
    displayOrder: 1,
  };

  it('役の確率に設定のキーが欠けている → エラー（警告でない）', () => {
    const data = machineWith({
      roles: [
        {
          name: '弱チェリー',
          probabilities: { 1: 0.01, 2: 0.01, 3: 0.01, 4: 0.01, 5: 0.02 },
          hasSettingDiff: true,
          displayOrder: 1,
        },
      ],
    });
    const result = checkProbabilities(data);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      file: 'test.json',
      type: 'probability',
      severity: 'error',
    });
    expect(result.errors[0].message).toContain(
      'roles "弱チェリー" probabilities に設定のキーが無い: 6'
    );
    expect(result.errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
    // 前の「設定キー不一致」の警告は、このエラーに置き換わる
    expect(result.warnings.some((w) => w.message.includes('設定キー不一致'))).toBe(false);
  });

  it('ゾーンの役の確率に欠け → エラー（ゾーンと役の名前が分かる）', () => {
    const data = machineWith({
      zones: [
        {
          name: 'AT中',
          isDefault: false,
          roles: [
            {
              name: 'レア役',
              probabilities: { 1: 0.02, 2: 0.02, 3: 0.02, 4: 0.02, 5: 0.02 },
              hasSettingDiff: false,
              displayOrder: 1,
            },
          ],
        },
      ],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(
      'zones "AT中" / roles "レア役" probabilities に設定のキーが無い: 6'
    );
    expect(errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('最上位の endScreens の probabilities に欠け → エラー（欠けた設定が分かる）', () => {
    const data = machineWith({
      availableSettings: FIVE_SETTINGS,
      roles: [{ ...fourSettingRole, probabilities: probabilitiesFor(FIVE_SETTINGS) }],
      endScreens: [
        {
          name: '翔',
          confirmedSettings: ['6'],
          excludedSettings: ['1', '2', '3', '4'],
          probabilities: { 6: 0.01 },
        },
      ],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'probability', severity: 'error' });
    expect(errors[0].message).toContain(
      'endScreens "翔" probabilities に設定のキーが無い: 1,2,3,4 (設定: 1,2,3,4,6)'
    );
    expect(errors[0].message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('最上位の endScreens に probabilities が無ければ distribution を見る → 欠けでエラー', () => {
    const data = machineWith({
      endScreens: [{ name: '白', distribution: { 1: 0.5, 2: 0.5, 3: 0.4, 4: 0.4, 5: 0.3 } }],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('endScreens "白" distribution に設定のキーが無い: 6');
  });

  it('最上位の endScreens に probabilities があれば distribution は見ない', () => {
    const data = machineWith({
      endScreens: [
        {
          name: '白',
          probabilities: probabilitiesFor(['1', '2', '3', '4', '5', '6'], 0.5),
          distribution: { 1: 0.5 },
        },
      ],
    });
    expect(checkProbabilities(data).errors).toHaveLength(0);
  });

  it('endScreenGroups の中の endScreens の probabilities に欠け → エラー。グループの中の distribution は見ない', () => {
    const data = machineWith({
      endScreenGroups: [
        {
          name: 'AT終了画面',
          endScreens: [
            { name: '赤', probabilities: { 1: 0.1, 6: 0.2 } },
            { name: '青', distribution: { 1: 0.1 } },
          ],
        },
      ],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(
      'endScreenGroups "AT終了画面" / endScreens "赤" probabilities に設定のキーが無い: 2,3,4,5'
    );
  });

  it('voiceCounts・musicCounts・effectCounts・trialSuccessRates の確率に欠け → エラー', () => {
    const partial = { 1: 0.1, 2: 0.1, 3: 0.1 };
    const data = machineWith({
      voiceCounts: [{ name: 'ボイスA', probabilities: partial }],
      musicCounts: [{ name: '楽曲A', probabilities: partial }],
      effectCounts: [{ name: '演出A', probabilities: partial }],
      trialSuccessRates: [{ name: 'CZ成功率', probabilities: partial }],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(4);
    for (const label of [
      'voiceCounts "ボイスA"',
      'musicCounts "楽曲A"',
      'effectCounts "演出A"',
      'trialSuccessRates "CZ成功率"',
    ]) {
      const message = onlyMessage(errors, label);
      expect(message).toContain('probabilities に設定のキーが無い: 4,5,6');
      expect(message.endsWith(STOPS_ESTIMATE)).toBe(true);
    }
  });

  it('設定に無いキー → エラー（4段階の機種の役に "3"）', () => {
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      roles: [{ ...fourSettingRole, probabilities: probabilitiesFor(['1', '2', '3', '5', '6']) }],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'probability', severity: 'error' });
    expect(errors[0].message).toContain(
      'roles "ベル" probabilities に設定に無いキー: 3 (設定: 1,2,5,6)'
    );
    // アプリは機種の設定のキーしか読まないので、推定は止まらない（書き方の誤りとして止める）
    expect(errors[0].message.endsWith(NOT_USED)).toBe(true);
  });

  it('L・V を含む機種は availableSettings に従う', () => {
    const lSettings = ['L', '2', '3', '4', '5', '6'];
    const good = machineWith({
      availableSettings: lSettings,
      roles: [{ ...fourSettingRole, probabilities: probabilitiesFor(lSettings) }],
      endScreens: [{ name: 'L示唆', probabilities: probabilitiesFor(lSettings, 0.1) }],
    });
    expect(checkProbabilities(good).errors).toHaveLength(0);

    const bad = machineWith({
      availableSettings: lSettings,
      roles: [
        { ...fourSettingRole, probabilities: probabilitiesFor(['1', ...lSettings.slice(1)]) },
      ],
    });
    const { errors } = checkProbabilities(bad);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, 'キーが無い')).toContain('probabilities に設定のキーが無い: L');
    expect(onlyMessage(errors, '設定に無いキー')).toContain('probabilities に設定に無いキー: 1');
  });

  it('0 を含め、推定に使う確率がすべての設定のキーを持てば通る', () => {
    const data = machineWith({
      availableSettings: FIVE_SETTINGS,
      roles: [{ ...fourSettingRole, probabilities: probabilitiesFor(FIVE_SETTINGS) }],
      endScreens: [
        { name: '土産屋', probabilities: { 1: 0, 2: 0.03, 3: 0.03, 4: 0.03, 6: 0.03 } },
        { name: 'パターン', patterns: [{ name: '通常' }] },
      ],
      endScreenGroups: [
        {
          name: 'AT終了画面',
          endScreens: [{ name: '赤', probabilities: probabilitiesFor(FIVE_SETTINGS, 0.2) }],
        },
      ],
      voiceCounts: [{ name: 'ボイスA', probabilities: probabilitiesFor(FIVE_SETTINGS, 0.1) }],
      musicCounts: [{ name: '楽曲A', probabilities: probabilitiesFor(FIVE_SETTINGS, 0.1) }],
      effectCounts: [{ name: '演出A', probabilities: probabilitiesFor(FIVE_SETTINGS, 0.1) }],
      trialSuccessRates: [
        { name: 'CZ成功率', probabilities: probabilitiesFor(FIVE_SETTINGS, 0.3) },
      ],
    });
    const result = checkProbabilities(data);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('patterns を持つ最上位の終了画面の親の欄（規則1・5）', () => {
  // アプリの移行処理は、patterns が空でない終了画面をパターンごとの終了画面に展開し、親の
  // confirmedSettings・excludedSettings・probabilities・distribution を捨てる。空の patterns は普通の終了画面
  it('patterns が空でなければ、親の確定・否定の設定と確率の誤りの末尾は「アプリは使わない」', () => {
    const parentFields = {
      confirmedSettings: ['high', '6'],
      excludedSettings: [1, '6'],
      probabilities: { 1: 0.1 },
    };
    const data = machineWith({
      endScreens: [
        { name: 'パターンあり', ...parentFields, patterns: [{ name: '通常' }] },
        { name: '分布とパターン', distribution: { 1: 0.5 }, patterns: [{ name: '通常' }] },
        { name: 'パターンが空', ...parentFields, patterns: [] },
      ],
    });
    const withPatterns = 'endScreens "パターンあり" ';
    const emptyPatterns = 'endScreens "パターンが空" ';
    const endOf = (errors, label) => {
      const message = onlyMessage(errors, label);
      return message.slice(message.lastIndexOf('（'));
    };

    const confirmation = checkConfirmations(data).errors;
    expect(confirmation).toHaveLength(6);
    expect(endOf(confirmation, `${withPatterns}confirmedSettings に設定番号でない値: "high"`)).toBe(
      NOT_USED
    );
    expect(endOf(confirmation, `${withPatterns}confirmedとexcludedに重複: [6]`)).toBe(NOT_USED);
    // 文字列でない値は、アプリが親を捨てる前の読み込み（形の確かめ）で止まる
    expect(endOf(confirmation, `${withPatterns}excludedSettings に設定番号でない値: 1`)).toBe(
      CANNOT_LOAD
    );
    expect(
      endOf(confirmation, `${emptyPatterns}confirmedSettings に設定番号でない値: "high"`)
    ).toBe(STOPS_ESTIMATE);
    expect(endOf(confirmation, `${emptyPatterns}confirmedとexcludedに重複: [6]`)).toBe(OVERLAP);

    const probability = checkProbabilities(data).errors;
    expect(probability).toHaveLength(3);
    expect(endOf(probability, `${withPatterns}probabilities に設定のキーが無い: 2,3,4,5,6`)).toBe(
      NOT_USED
    );
    expect(endOf(probability, 'endScreens "分布とパターン" distribution に設定のキーが無い')).toBe(
      NOT_USED
    );
    expect(endOf(probability, `${emptyPatterns}probabilities に設定のキーが無い`)).toBe(
      STOPS_ESTIMATE
    );
  });
});

// --- 今後の規則（規則6〜8）: 今のデータには無いが、アプリの推定が止まる・機種を読み込めない書き方 ---

const SIX_SETTINGS = ['1', '2', '3', '4', '5', '6'];

describe('probability-validator: 最上位の終了画面の distribution の値（規則6）', () => {
  // アプリの読み込み時の形の確かめは distribution の値を数に限り、移行処理は probabilities の無い
  // 最上位の終了画面の distribution を確率として使う（0〜1 の外は推定が止まる）
  it('distribution の値が 0〜1 の外 → エラー（アプリの推定が止まる）。0 と 1 は通る', () => {
    const data = machineWith({
      endScreens: [{ name: '分布', distribution: { 1: 1.5, 2: -0.1, 3: 0, 4: 0.1, 5: 0.5, 6: 1 } }],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, '設定1')).toContain(
      'endScreens "分布" distribution 設定1: 0〜1 の数でない (1.5)'
    );
    expect(onlyMessage(errors, '設定2')).toContain('distribution 設定2: 0〜1 の数でない (-0.1)');
    for (const e of errors) {
      expect(e).toMatchObject({ file: 'test.json', type: 'probability', severity: 'error' });
      expect(e.message.endsWith(STOPS_ESTIMATE)).toBe(true);
    }
  });

  it('distribution の値が数でない → エラー（アプリが機種を読み込めない）', () => {
    const data = machineWith({
      endScreens: [
        { name: '分布', distribution: { 1: '0.5', 2: null, 3: 0.1, 4: 0.1, 5: 0.1, 6: 0.1 } },
      ],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, '設定1')).toContain('distribution 設定1: 0〜1 の数でない ("0.5")');
    expect(onlyMessage(errors, '設定2')).toContain('distribution 設定2: 0〜1 の数でない (null)');
    for (const e of errors) expect(e.message.endsWith(CANNOT_LOAD)).toBe(true);
  });

  it('アプリが distribution を使わない終了画面・設定に無いキーでは、範囲外の末尾は「アプリは使わない」', () => {
    const distribution = { ...probabilitiesFor(SIX_SETTINGS, 0.1), 1: 2, 2: 'x' };
    const data = machineWith({
      endScreens: [
        { name: '確率あり', probabilities: probabilitiesFor(SIX_SETTINGS), distribution },
        { name: 'パターンあり', distribution, patterns: [{ name: '通常' }] },
        { name: '設定に無いキー', distribution: { ...probabilitiesFor(SIX_SETTINGS), 7: 2 } },
      ],
    });
    const { errors } = checkProbabilities(data);
    expect(errors).toHaveLength(6);
    const endOf = (label) => {
      const message = onlyMessage(errors, label);
      return message.slice(message.lastIndexOf('（'));
    };
    for (const name of ['確率あり', 'パターンあり']) {
      expect(endOf(`endScreens "${name}" distribution 設定1: 0〜1 の数でない (2)`)).toBe(NOT_USED);
      // 数でない値は、アプリが distribution を使うかどうかの前の読み込み（形の確かめ）で止まる
      expect(endOf(`endScreens "${name}" distribution 設定2: 0〜1 の数でない ("x")`)).toBe(
        CANNOT_LOAD
      );
    }
    expect(endOf('distribution 設定7: 0〜1 の数でない (2)')).toBe(NOT_USED);
    expect(endOf('distribution に設定に無いキー: 7')).toBe(NOT_USED);
  });
});

describe('confirmation-validator: パターンの name（規則7）', () => {
  // アプリの読み込み時の形の確かめは、最上位の終了画面のパターンの name を空でない文字列に限る
  it('パターンの name が無い・空・文字列でない → エラー（アプリが機種を読み込めない。何番目か分かる）', () => {
    const data = machineWith({
      endScreens: [
        {
          name: 'CZ終了画面',
          patterns: [{ name: '通常' }, { setting: '6' }, { name: '' }, { name: 6 }],
        },
      ],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(3);
    expect(onlyMessage(errors, 'patterns[1]')).toContain(
      'endScreens "CZ終了画面" / patterns[1] name が無い・空・文字列でない: (無し)'
    );
    expect(onlyMessage(errors, 'patterns[2]')).toContain('name が無い・空・文字列でない: ""');
    expect(onlyMessage(errors, 'patterns[3]')).toContain('name が無い・空・文字列でない: 6');
    for (const e of errors) {
      expect(e).toMatchObject({ file: 'test.json', type: 'confirmation', severity: 'error' });
      expect(e.message.endsWith(CANNOT_LOAD)).toBe(true);
    }
  });

  it('name の無いパターンの他の誤りも、何番目かで示す', () => {
    const data = machineWith({
      endScreens: [{ name: 'CZ終了画面', patterns: [{ setting: 'high' }] }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, 'setting が設定番号でない')).toContain(
      'endScreens "CZ終了画面" / patterns[0] setting が設定番号でない: "high"'
    );
    expect(errors.some((e) => e.message.includes('patterns "undefined"'))).toBe(false);
  });
});

describe('confirmation-validator: 1つの項目だけで全設定を否定する書き方（規則8）', () => {
  // アプリ（utils/binomial.ts）は、数えた項目の確率が 0 の設定の尤度を 0 にし、確定・否定の設定から
  // 除く設定を決める。1つの項目で除かれない設定が残らなければ、数えた（確定演出は有効にした）時点で
  // 推定が止まる（all-settings-excluded）
  const DENIED = 'だけで全設定を否定している';

  it('確率がすべて 0 → エラー（最上位は probabilities、無ければ distribution。グループの中・ボイス・楽曲・演出も）', () => {
    const zero = probabilitiesFor(SIX_SETTINGS, 0);
    const data = machineWith({
      endScreens: [
        { name: '確率0', probabilities: zero },
        { name: '分布0', distribution: zero },
      ],
      endScreenGroups: [{ name: 'AT終了画面', endScreens: [{ name: '赤', probabilities: zero }] }],
      voiceCounts: [{ name: 'ボイスA', probabilities: zero }],
      musicCounts: [{ name: '楽曲A', probabilities: zero }],
      effectCounts: [{ name: '演出A', probabilities: zero }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(6);
    for (const label of [
      'endScreens "確率0"',
      'endScreens "分布0"',
      'endScreenGroups "AT終了画面" / endScreens "赤"',
      'voiceCounts "ボイスA"',
      'musicCounts "楽曲A"',
      'effectCounts "演出A"',
    ]) {
      expect(onlyMessage(errors, label)).toContain(`${label} ${DENIED} (確率が 0: 1,2,3,4,5,6)`);
    }
    for (const e of errors) {
      expect(e).toMatchObject({ file: 'test.json', type: 'confirmation', severity: 'error' });
      expect(e.message.endsWith(STOPS_ESTIMATE)).toBe(true);
    }
  });

  it('否定の設定が全設定 → エラー（確定演出・最上位とグループの中の終了画面・ボイス。4段階の機種）', () => {
    const data = machineWith({
      availableSettings: FOUR_SETTINGS,
      confirmationEvents: [
        { name: '全否定', confirmedSettings: [], excludedSettings: FOUR_SETTINGS },
      ],
      endScreens: [{ name: '青', excludedSettings: FOUR_SETTINGS }],
      endScreenGroups: [
        {
          name: 'AT終了画面',
          endScreens: [{ name: '赤', excludedSettings: ['6', '5', '2', '1'] }],
        },
      ],
      voiceCounts: [{ name: 'ボイスA', excludedSettings: FOUR_SETTINGS }],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(4);
    for (const label of [
      'confirmationEvents "全否定"',
      'endScreens "青"',
      'endScreenGroups "AT終了画面" / endScreens "赤"',
      'voiceCounts "ボイスA"',
    ]) {
      expect(onlyMessage(errors, label)).toContain(
        `${label} ${DENIED} (確定・否定の設定で除く: 1,2,5,6)`
      );
    }
    for (const e of errors) expect(e.message.endsWith(STOPS_ESTIMATE)).toBe(true);
  });

  it('1つの項目の中で、確率が 0 の設定と確定・否定の設定で除く設定を合わせて全設定 → エラー', () => {
    const data = machineWith({
      endScreens: [
        {
          name: '否定と0',
          probabilities: { 1: 0, 2: 0, 3: 0, 4: 0.1, 5: 0.1, 6: 0.1 },
          excludedSettings: ['4', '5', '6'],
        },
        {
          name: '確定と0',
          probabilities: { ...probabilitiesFor(SIX_SETTINGS, 0.1), 6: 0 },
          confirmedSettings: ['6'],
        },
      ],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, 'endScreens "否定と0"')).toContain(
      `${DENIED} (確率が 0: 1,2,3 / 確定・否定の設定で除く: 4,5,6)`
    );
    expect(onlyMessage(errors, 'endScreens "確定と0"')).toContain(
      `${DENIED} (確率が 0: 6 / 確定・否定の設定で除く: 1,2,3,4,5)`
    );
  });

  it('除かれない設定が残る・アプリが確定・否定の設定を読まない・親を捨てる項目は止めない', () => {
    const data = machineWith({
      confirmationEvents: [
        {
          name: '設定6確定',
          confirmedSettings: ['6'],
          excludedSettings: ['1', '2', '3', '4', '5'],
        },
      ],
      endScreens: [
        { name: '1つ残る', probabilities: { ...probabilitiesFor(SIX_SETTINGS, 0), 6: 0.1 } },
        // patterns が空でなければ、移行処理が親の確定・否定の設定と確率を捨てる
        { name: 'パターンあり', excludedSettings: SIX_SETTINGS, patterns: [{ name: '通常' }] },
      ],
      // 楽曲・演出の確定・否定の設定は、アプリが読み込み時に捨てる
      musicCounts: [
        {
          name: '楽曲A',
          excludedSettings: SIX_SETTINGS,
          probabilities: probabilitiesFor(SIX_SETTINGS),
        },
      ],
    });
    const result = checkConfirmations(data);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('試行成功率・役の確率がすべて 0 や 1 でも止めない（成功・失敗の一方を数えたときだけ止まる）', () => {
    // onihama-kyoutou の「カッ飛びゾーン レベル5」（全設定で成功率 100%）は正しいデータ。
    // 役は設定差が無ければ（hasSettingDiff=false）推定に使わない
    const data = machineWith({
      roles: [
        {
          name: '出ない役',
          probabilities: probabilitiesFor(SIX_SETTINGS, 0),
          hasSettingDiff: false,
          displayOrder: 1,
        },
      ],
      trialSuccessRates: [
        { name: 'レベル5', probabilities: probabilitiesFor(SIX_SETTINGS, 1) },
        { name: 'レベル0', probabilities: probabilitiesFor(SIX_SETTINGS, 0) },
      ],
    });
    expect(checkConfirmations(data).errors).toHaveLength(0);
    expect(checkProbabilities(data).errors).toHaveLength(0);
  });

  it('確定する設定がすべて否定にもある・設定番号でない値がある項目は、その規則のエラーだけ（重ねない）', () => {
    const data = machineWith({
      endScreens: [
        { name: '重複', confirmedSettings: ['6'], excludedSettings: ['6'] },
        { name: '番号でない', excludedSettings: [...SIX_SETTINGS, 'high'] },
      ],
    });
    const { errors } = checkConfirmations(data);
    expect(errors).toHaveLength(2);
    expect(onlyMessage(errors, 'endScreens "重複"')).toContain('confirmedとexcludedに重複: [6]');
    expect(onlyMessage(errors, 'endScreens "番号でない"')).toContain('設定番号でない値: "high"');
  });
});

// --- index-consistency テスト ---

describe('index-consistency', () => {
  // NOTE: validateIndexConsistencyはexistsSyncでディスク上のファイル存在をチェックするため
  // ファイル存在依存の検証（name/type/version一致）は統合テストでカバーする

  it('ID重複 → エラー', () => {
    const dupIndex = {
      ...validIndex,
      machines: [
        { id: 'dup', name: 'A', type: 'AT', author: 'a', version: '1.0', file: 'a/a.json' },
        { id: 'dup', name: 'B', type: 'AT', author: 'a', version: '1.0', file: 'b/b.json' },
      ],
    };
    const result = validateIndexConsistency([], dupIndex);
    expect(result.errors.some((e) => e.message.includes('ID重複'))).toBe(true);
  });

  it('index.jsonに未登録のファイル → エラー', () => {
    const files = [
      { path: 'machines/test/test-machine.json', data: validMachine },
      { path: 'machines/extra/extra.json', data: { ...validMachine, name: 'Extra' } },
    ];
    const result = validateIndexConsistency(files, validIndex);
    expect(result.errors.some((e) => e.message.includes('未登録'))).toBe(true);
  });

  it('存在しないファイルがindexに登録 → ファイル未存在エラー', () => {
    const badIndex = {
      ...validIndex,
      machines: [
        {
          id: 'ghost',
          name: 'Ghost',
          type: 'AT',
          author: 'a',
          version: '1.0',
          file: 'nonexistent/ghost.json',
        },
      ],
    };
    const result = validateIndexConsistency([], badIndex);
    expect(result.errors.some((e) => e.message.includes('ファイル未存在'))).toBe(true);
  });
});

// --- completeness-validator テスト ---

describe('completeness-validator', () => {
  it('完全なデータ → Complete分類、警告なし', () => {
    const files = [
      {
        path: 'machines/test/test.json',
        data: {
          ...validMachine,
          endScreens: [{ name: 'test', type: 'at_end' }],
          trialSuccessRates: [{ name: 'test', probabilities: { 1: 0.01 } }],
          description: 'テスト',
          source: 'test.com',
        },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.warnings).toHaveLength(0);
    expect(result.summary.complete).toBe(1);
  });

  it('roles空 + 理由なし → warning', () => {
    const files = [
      {
        path: 'machines/test/test.json',
        data: { ...validMachine, roles: [], confirmationEvents: [] },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.warnings.some((w) => w.message.includes('rolesが空（理由未記載）'))).toBe(true);
  });

  it('roles空 + 理由あり → info（Provisional）', () => {
    const files = [
      {
        path: 'machines/test/test.json',
        data: {
          ...validMachine,
          roles: [],
          confirmationEvents: [],
          description: '解析未判明のため暫定データ',
        },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.info.some((i) => i.message.includes('Provisional'))).toBe(true);
    expect(result.warnings.filter((w) => w.message.includes('roles'))).toHaveLength(0);
  });

  it('endScreensキー欠落 + AT機 → warning', () => {
    const files = [
      {
        path: 'machines/test/test.json',
        data: { name: 'test', type: 'AT', roles: [validMachine.roles[0]], confirmationEvents: [] },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.warnings.some((w) => w.message.includes('endScreensキーが欠落'))).toBe(true);
  });

  it('endScreensキー欠落 + ジャグラー → 警告なし', () => {
    const files = [
      {
        path: 'machines/juggler/my-juggler.json',
        data: {
          name: 'ジャグラー',
          type: 'A-type',
          roles: [validMachine.roles[0]],
          confirmationEvents: [],
        },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.warnings.filter((w) => w.message.includes('endScreens'))).toHaveLength(0);
  });

  it('confirmationEventsキー欠落 → warning', () => {
    const files = [
      {
        path: 'machines/test/test.json',
        data: { name: 'test', type: 'AT', roles: [validMachine.roles[0]], endScreens: [] },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.warnings.some((w) => w.message.includes('confirmationEventsキーが欠落'))).toBe(
      true
    );
  });

  it('summary.statsが正確にカウントされる', () => {
    const files = [
      {
        path: 'machines/a/a.json',
        data: {
          ...validMachine,
          endScreens: [{ name: 'a' }],
          trialSuccessRates: [{ name: 'a', probabilities: {} }],
          description: 'test',
          source: 'test',
          voiceCounts: [{ name: 'a' }],
        },
      },
      {
        path: 'machines/b/b.json',
        data: {
          ...validMachine,
          endScreens: [],
          trialSuccessRates: [],
          description: '',
          source: '',
        },
      },
    ];
    const result = validateCompleteness(files);
    expect(result.summary.stats.total).toBe(2);
    expect(result.summary.stats.rolesNonEmpty).toBe(2);
    expect(result.summary.stats.endScreensNonEmpty).toBe(1);
    expect(result.summary.stats.voiceCountsNonEmpty).toBe(1);
  });
});
