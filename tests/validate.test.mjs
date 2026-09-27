import { describe, it, expect } from 'vitest';
import { validateSchemas } from '../scripts/validators/schema-validator.mjs';
import { validateProbabilities } from '../scripts/validators/probability-validator.mjs';
import { validateConfirmations } from '../scripts/validators/confirmation-validator.mjs';
import { validateIndexConsistency } from '../scripts/validators/index-consistency.mjs';
import { validateCompleteness } from '../scripts/validators/completeness-validator.mjs';

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

const STOPS_ESTIMATE = '（アプリの推定が止まる）';
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
      expect(e.message).toContain('否定を優先');
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
    expect(errors[0].message.endsWith('（アプリが機種を読み込めない）')).toBe(true);
  });

  it('patterns の minSetting が数でない → エラー（アプリは機種を読み込めない）', () => {
    const { errors } = checkConfirmations(withPatterns([{ name: '金', minSetting: '4' }]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'confirmation', severity: 'error' });
    expect(errors[0].message).toContain('patterns "金" minSetting が数でない: "4"');
    expect(errors[0].message.endsWith('（アプリが機種を読み込めない）')).toBe(true);
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
    expect(music.endsWith('（アプリは使わない）')).toBe(true);
    const effect = onlyMessage(errors, 'effectCounts "虹カットイン"');
    expect(effect).toContain('confirmedSettings に設定番号でない値: "7"');
    expect(effect.endsWith('（アプリは使わない）')).toBe(true);
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
    expect(errors[0].message.endsWith('（アプリは使わない）')).toBe(true);
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
