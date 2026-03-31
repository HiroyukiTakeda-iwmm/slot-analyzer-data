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
