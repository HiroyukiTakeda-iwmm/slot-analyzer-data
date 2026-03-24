import { describe, it, expect } from 'vitest';
import { validateSchemas } from '../scripts/validators/schema-validator.mjs';

import { validateProbabilities } from '../scripts/validators/probability-validator.mjs';
import { validateConfirmations } from '../scripts/validators/confirmation-validator.mjs';

const validMachine = {
  name: 'テスト機種',
  type: 'AT',
  roles: [
    {
      name: '弱チェリー',
      probabilities: { '1': 0.009174, '2': 0.009346, '3': 0.009524, '4': 0.009709, '5': 0.009901, '6': 0.010101 },
      hasSettingDiff: true,
      displayOrder: 1,
      color: '#E91E63',
    },
  ],
  confirmationEvents: [],
  author: 'コミュニティ',
  version: '1.0',
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
    const result = validateSchemas(
      [{ path: 'machines/test/test.json', data: bad }],
      validIndex
    );
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rolesが空でもスキーマエラーなし', () => {
    const empty = { ...validMachine, roles: [] };
    const result = validateSchemas(
      [{ path: 'machines/test/test.json', data: empty }],
      validIndex
    );
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
          probabilities: { '1': 0.01, '2': 0.01, '3': 0.01, '4': 0.01, '5': 0.01, '6': 0.01 },
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
          probabilities: { '1': 0.01, '2': 0.01, '3': 0.01, '4': 0.01, '5': 0.01, '6': 0.02 },
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
          probabilities: { '1': 0.01, '2': 0.01, '4': 0.01, '5': 0.01, '6': 0.02 },
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
