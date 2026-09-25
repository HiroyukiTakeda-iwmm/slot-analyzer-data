import { describe, it, expect } from 'vitest';
import {
  itemKey,
  listMachineItems,
  machineValue,
  shapeError,
  toStoredProbability,
  toStoredRate,
  valuesAgree,
} from '../scripts/lib/provenance.mjs';

describe('valuesAgree: denominator（分母）', () => {
  it('差が 0.1% 以内なら一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 6: 277.7 }, { 1: 295.24, 6: 277.7 })).toBe(true);
  });

  it('差が 0.1% を超えると不一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.6 })).toBe(false);
  });

  it('設定の並びが違えば不一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 2: 292.6 }, { 1: 295.2 })).toBe(false);
  });

  it('形が合わない値は不一致', () => {
    expect(valuesAgree('denominator', true, true)).toBe(false);
  });
});

describe('valuesAgree: percent（割合）', () => {
  it('差が 0.1 ポイント以内なら一致', () => {
    expect(valuesAgree('percent', { 1: 10, 6: 20 }, { 1: 10.05, 6: 20 })).toBe(true);
  });

  it('差が 0.1 ポイントを超えると不一致', () => {
    expect(valuesAgree('percent', { 1: 10 }, { 1: 10.2 })).toBe(false);
  });
});

describe('valuesAgree: settings / presence', () => {
  it('設定の組は順番に関係なく同じなら一致', () => {
    expect(
      valuesAgree(
        'settings',
        { confirmed: ['4', '5', '6'], excluded: [] },
        { confirmed: ['6', '5', '4'], excluded: [] }
      )
    ).toBe(true);
  });

  it('設定の組が違えば不一致', () => {
    expect(
      valuesAgree(
        'settings',
        { confirmed: ['4', '5', '6'], excluded: [] },
        { confirmed: ['5', '6'], excluded: [] }
      )
    ).toBe(false);
  });

  it('presence は両方 true なら一致', () => {
    expect(valuesAgree('presence', true, true)).toBe(true);
    expect(valuesAgree('presence', true, false)).toBe(false);
  });

  it('未知の unit は不一致', () => {
    expect(valuesAgree('unknown', { 1: 1 }, { 1: 1 })).toBe(false);
  });
});

describe('shapeError', () => {
  it('正しい形なら null', () => {
    expect(shapeError('denominator', { 1: 295.2 })).toBeNull();
    expect(shapeError('percent', { 1: 0, 6: 100 })).toBeNull();
    expect(shapeError('settings', { confirmed: ['6'], excluded: [] })).toBeNull();
    expect(shapeError('presence', true)).toBeNull();
  });

  it('形が合わなければ説明を返す', () => {
    expect(shapeError('denominator', { 1: 0 })).toContain('分母');
    expect(shapeError('percent', { 1: 120 })).toContain('割合');
    expect(shapeError('settings', { confirmed: ['6'] })).toContain('excluded');
    expect(shapeError('presence', false)).toContain('true');
    expect(shapeError('unknown', true)).toContain('未知の unit');
  });
});

describe('toStoredProbability / toStoredRate（有効数字6桁）', () => {
  it('分母から確率へ', () => {
    expect(toStoredProbability(295.2)).toBe(0.00338753);
    expect(toStoredProbability(65536)).toBe(0.0000152588);
    expect(toStoredProbability(8192)).toBe(0.00012207);
  });

  it('割合から 0〜1 へ', () => {
    expect(toStoredRate(12.34)).toBe(0.1234);
    expect(toStoredRate(0)).toBe(0);
    expect(toStoredRate(100)).toBe(1);
  });

  it('範囲外は RangeError', () => {
    expect(() => toStoredProbability(0)).toThrow(RangeError);
    expect(() => toStoredProbability(-1)).toThrow(RangeError);
    expect(() => toStoredProbability(Number.NaN)).toThrow(RangeError);
    expect(() => toStoredRate(101)).toThrow(RangeError);
  });
});

describe('machineValue', () => {
  it('denominator: probabilities を分母にする', () => {
    const value = machineValue({ probabilities: { 1: 0.00338753, 6: 0.00360101 } }, 'denominator');
    expect(value[1]).toBeCloseTo(295.2, 1);
    expect(value[6]).toBeCloseTo(277.7, 1);
  });

  it('denominator: 確率 0 を含むと表せない（null）', () => {
    expect(machineValue({ probabilities: { 1: 0, 6: 0.1 } }, 'denominator')).toBeNull();
  });

  it('percent: probabilities と rates を割合にする', () => {
    expect(machineValue({ probabilities: { 1: 0.1 } }, 'percent')[1]).toBeCloseTo(10, 6);
    expect(machineValue({ rates: { 1: 0.3 } }, 'percent')[1]).toBeCloseTo(30, 6);
  });

  it('settings: confirmedSettings / excludedSettings を組にする', () => {
    expect(machineValue({ confirmedSettings: ['6'] }, 'settings')).toEqual({
      confirmed: ['6'],
      excluded: [],
    });
    expect(machineValue({ hint: '示唆' }, 'settings')).toBeNull();
  });

  it('presence は常に true、数値の無い項目の分母・割合は null', () => {
    expect(machineValue({ hint: '示唆' }, 'presence')).toBe(true);
    expect(machineValue({ hint: '示唆' }, 'denominator')).toBeNull();
    expect(machineValue({ hint: '示唆' }, 'percent')).toBeNull();
  });
});

describe('listMachineItems', () => {
  it('対象の項目を決まった順と名前で並べる', () => {
    const machine = {
      roles: [{ name: 'BIG' }],
      zones: [{ name: 'CZ', roles: [{ name: 'ベル' }] }],
      confirmationEvents: [{ name: '金トロフィー' }],
      endScreens: [{ name: '青' }],
      endScreenGroups: [{ name: 'AT終了', endScreens: [{ name: '赤' }] }],
      voiceCounts: [{ name: 'ボイスA' }],
      musicCounts: [{ name: '楽曲A' }],
      effectCounts: [{ name: '演出A' }],
      trialSuccessRates: [{ name: 'CZ成功率' }],
      modeTransitions: [{ name: '高確移行' }],
      specialSettings: { note: 'x' },
    };
    expect(listMachineItems(machine).map((item) => itemKey(item.kind, item.name))).toEqual([
      'role::BIG',
      'zoneRole::CZ::ベル',
      'confirmationEvent::金トロフィー',
      'endScreen::青',
      'endScreenGroupItem::AT終了::赤',
      'voiceCount::ボイスA',
      'musicCount::楽曲A',
      'effectCount::演出A',
      'trialSuccessRate::CZ成功率',
      'modeTransition::高確移行',
      'specialSettings::specialSettings',
    ]);
  });

  it('空の specialSettings や無い配列は項目にしない', () => {
    expect(listMachineItems({ roles: [], specialSettings: {} })).toEqual([]);
  });
});
