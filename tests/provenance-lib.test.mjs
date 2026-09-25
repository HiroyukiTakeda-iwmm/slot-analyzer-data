import { describe, it, expect } from 'vitest';
import {
  allowedUnits,
  createNameDisambiguator,
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

  it('確率 0（null）は null とだけ一致', () => {
    expect(valuesAgree('denominator', { 1: null, 6: 8192 }, { 1: null, 6: 8192 })).toBe(true);
    expect(valuesAgree('denominator', { 1: null }, { 1: 8192 })).toBe(false);
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

  it('差がちょうど 0.1% なら一致（境界を含む）', () => {
    expect(valuesAgree('denominator', { 1: 8192 }, { 1: 8183.808 })).toBe(true);
  });

  it('空・NaN・1 未満を含む値は不一致', () => {
    expect(valuesAgree('denominator', {}, {})).toBe(false);
    expect(valuesAgree('denominator', { 1: Number.NaN }, { 1: Number.NaN })).toBe(false);
    expect(valuesAgree('denominator', { 1: 0.5 }, { 1: 0.5 })).toBe(false);
  });
});

describe('valuesAgree: percent（割合）', () => {
  it('差が 0.1 ポイント以内なら一致', () => {
    expect(valuesAgree('percent', { 1: 10, 6: 20 }, { 1: 10.05, 6: 20 })).toBe(true);
  });

  it('差がちょうど 0.1 ポイントなら一致（境界を含む）', () => {
    expect(valuesAgree('percent', { 1: 20 }, { 1: 20.1 })).toBe(true);
  });

  it('差が 0.1 ポイントを超えると不一致', () => {
    expect(valuesAgree('percent', { 1: 10 }, { 1: 10.2 })).toBe(false);
  });

  it('0（その設定では起きない）は 0 とだけ一致する', () => {
    expect(valuesAgree('percent', { 1: 0 }, { 1: 0.1 })).toBe(false);
    expect(valuesAgree('percent', { 1: 0.1 }, { 1: 0 })).toBe(false);
    expect(valuesAgree('percent', { 1: 0 }, { 1: 0 })).toBe(true);
    expect(valuesAgree('percent', { 1: 10 }, { 1: 10.05 })).toBe(true);
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

  it('否定する設定（excluded）だけが違っても不一致', () => {
    expect(
      valuesAgree(
        'settings',
        { confirmed: ['6'], excluded: ['1'] },
        { confirmed: ['6'], excluded: ['2'] }
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
    expect(shapeError('denominator', { 1: null, 6: 8192 })).toBeNull();
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
    expect(toStoredProbability(null)).toBe(0);
  });

  it('割合から 0〜1 へ', () => {
    expect(toStoredRate(12.34)).toBe(0.1234);
    expect(toStoredRate(0)).toBe(0);
    expect(toStoredRate(100)).toBe(1);
  });

  it('範囲外は RangeError', () => {
    expect(() => toStoredProbability(0)).toThrow(RangeError);
    expect(() => toStoredProbability(-1)).toThrow(RangeError);
    expect(() => toStoredProbability(0.5)).toThrow(RangeError);
    expect(() => toStoredProbability(Number.NaN)).toThrow(RangeError);
    expect(() => toStoredRate(101)).toThrow(RangeError);
    expect(() => toStoredRate(-1)).toThrow(RangeError);
    expect(() => toStoredRate(Number.NaN)).toThrow(RangeError);
  });
});

describe('machineValue', () => {
  it('denominator: probabilities を分母にする', () => {
    const value = machineValue({ probabilities: { 1: 0.00338753, 6: 0.00360101 } }, 'denominator');
    expect(value[1]).toBeCloseTo(295.2, 1);
    expect(value[6]).toBeCloseTo(277.7, 1);
  });

  it('denominator: 確率 0 の設定は null', () => {
    expect(machineValue({ probabilities: { 1: 0, 6: 0.1 } }, 'denominator')).toEqual({
      1: null,
      6: 10,
    });
  });

  it('denominator: 最上位の終了画面の distribution は、listMachineItems が確率として渡す', () => {
    const machine = { endScreens: [{ name: '金枠', distribution: { 1: 0, 6: 0.01 } }] };
    const [item] = listMachineItems(machine);
    expect(machineValue(item.entry, 'denominator')).toEqual({ 1: null, 6: 100 });
    expect(machine.endScreens[0]).not.toHaveProperty('probabilities'); // 機種ファイルは書き換えない
  });

  it('denominator: 最上位の終了画面に probabilities もあれば、distribution より先に使う（アプリと同じ）', () => {
    const machine = {
      endScreens: [{ name: '金枠', probabilities: { 6: 0.5 }, distribution: { 6: 0.01 } }],
    };
    const [item] = listMachineItems(machine);
    expect(machineValue(item.entry, 'denominator')).toEqual({ 6: 2 });
  });

  it('denominator: 負の値や 1 を超える値があると表せない（null）', () => {
    expect(machineValue({ probabilities: { 1: -0.1, 6: 0.1 } }, 'denominator')).toBeNull();
    expect(machineValue({ probabilities: { 1: 1.5 } }, 'denominator')).toBeNull();
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

  it('同じ種類で同じ名前の項目は、2つ目から #2 を付けて区別する', () => {
    const machine = {
      roles: [{ name: '仁' }],
      endScreens: [{ name: '仁' }, { name: '仁' }, { name: '仁' }],
    };
    expect(listMachineItems(machine).map((item) => itemKey(item.kind, item.name))).toEqual([
      'role::仁',
      'endScreen::仁',
      'endScreen::仁#2',
      'endScreen::仁#3',
    ]);
  });

  it('親子の名前（ゾーン内の役）でも、同じ名前は #2 で区別する', () => {
    const machine = { zones: [{ name: 'CZ', roles: [{ name: 'ベル' }, { name: 'ベル' }] }] };
    expect(listMachineItems(machine).map((item) => itemKey(item.kind, item.name))).toEqual([
      'zoneRole::CZ::ベル',
      'zoneRole::CZ::ベル#2',
    ]);
  });

  it('区別した名前が「#数字」を含む名前と重なったら例外を投げる', () => {
    const machine = { endScreens: [{ name: '仁' }, { name: '仁#2' }, { name: '仁' }] };
    expect(() => listMachineItems(machine)).toThrow('項目の名前を区別できない');
  });

  it('「#数字」を含む名前が先にあっても、区別した名前と重なれば例外を投げる', () => {
    const machine = { endScreens: [{ name: '仁#2' }, { name: '仁' }, { name: '仁' }] };
    expect(() => listMachineItems(machine)).toThrow('項目の名前を区別できない');
  });

  it('名前に「::」を含む項目は、親と子の切れ目が分からなくなるので例外を投げる', () => {
    expect(() => listMachineItems({ roles: [{ name: '強::弱' }] })).toThrow(
      '項目の名前に「::」は使えない: role 強::弱'
    );
  });

  it('「::」は、組み立てる前の元の名前（親・子・ID を持たない種類の名前）で見る', () => {
    const cases = [
      [{ zones: [{ name: 'CZ::1', roles: [{ name: 'ベル' }] }] }, 'zone CZ::1'],
      [{ zones: [{ name: 'CZ', roles: [{ name: 'ベル::強' }] }] }, 'zoneRole ベル::強'],
      [
        { endScreenGroups: [{ name: 'AT::終了', endScreens: [{ name: '赤' }] }] },
        'endScreenGroup AT::終了',
      ],
      [{ confirmationEvents: [{ name: '金::銀' }] }, 'confirmationEvent 金::銀'],
      [{ voiceCounts: [{ name: '声::1' }] }, 'voiceCount 声::1'],
    ];
    for (const [machine, label] of cases) {
      expect(() => listMachineItems(machine)).toThrow(`項目の名前に「::」は使えない: ${label}`);
    }
    expect(() =>
      listMachineItems({ zones: [{ name: 'CZ', roles: [{ name: 'ベル' }] }] })
    ).not.toThrow();
  });
});

describe('createNameDisambiguator', () => {
  it('種類ごとに数え、1つ目はそのまま、2つ目から #n を付ける', () => {
    const disambiguate = createNameDisambiguator();
    expect(disambiguate('endScreen', '青')).toBe('青');
    expect(disambiguate('role', '青')).toBe('青');
    expect(disambiguate('endScreen', '青')).toBe('青#2');
  });
});

describe('machineValue: 空の probabilities', () => {
  it('分母・割合とも表せない（null）', () => {
    expect(machineValue({ probabilities: {} }, 'denominator')).toBeNull();
    expect(machineValue({ probabilities: {} }, 'percent')).toBeNull();
  });
});

describe('allowedUnits（記録に使える unit。仕様 5.4）', () => {
  it('役は denominator だけ', () => {
    expect(allowedUnits('role', { probabilities: { 1: 0.5 } })).toEqual(['denominator']);
    expect(allowedUnits('zoneRole', { probabilities: { 1: 0, 6: 0.25 } })).toEqual(['denominator']);
  });

  it('ほかの数値の項目は、0 でない値がすべて 10% 以上なら percent も使える', () => {
    const wide = allowedUnits('trialSuccessRate', { probabilities: { 1: 0.25, 6: 0 } });
    expect(wide).toEqual(['denominator', 'percent']);
    expect(allowedUnits('trialSuccessRate', { probabilities: { 1: 0.003661 } })).toEqual([
      'denominator',
    ]);
    expect(allowedUnits('modeTransition', { rates: { 1: 0.1, 6: 0.047 } })).toEqual([
      'denominator',
    ]);
  });

  it('10% ちょうどは percent も使える（境界を含む）', () => {
    expect(allowedUnits('trialSuccessRate', { probabilities: { 1: 0.1, 6: 0.2 } })).toEqual([
      'denominator',
      'percent',
    ]);
  });

  it('最上位の終了画面の distribution（古い形）は、数値として扱う', () => {
    const [item] = listMachineItems({
      endScreens: [{ name: '金枠', distribution: { 1: 0, 6: 0.01 } }],
    });
    expect(allowedUnits('endScreen', item.entry)).toEqual(['denominator']);
  });

  it('グループの中の終了画面の distribution は、アプリが改名しないので数値として扱わない', () => {
    const [item] = listMachineItems({
      endScreenGroups: [{ name: 'G', endScreens: [{ name: '金', distribution: { 6: 0.01 } }] }],
    });
    expect(allowedUnits(item.kind, item.entry)).toEqual(['presence']);
  });

  it('patterns 形式の項目は、出典記録の形を決めるまで記録できない（空）', () => {
    expect(allowedUnits('endScreen', { patterns: [{ name: 'A', setting: 'default' }] })).toEqual(
      []
    );
    expect(allowedUnits('voiceCount', { patterns: [{ voice: 'x', minSetting: 5 }] })).toEqual([]);
  });

  it('数値が無ければ、設定の組があれば settings、無ければ presence', () => {
    expect(allowedUnits('confirmationEvent', { confirmedSettings: ['6'] })).toEqual(['settings']);
    expect(allowedUnits('endScreen', { hint: '示唆' })).toEqual(['presence']);
  });

  it('数値と設定の組の両方がある項目は、数値の側で決める', () => {
    const both = { probabilities: { 1: 0.05 }, confirmedSettings: ['6'] };
    expect(allowedUnits('endScreen', both)).toEqual(['denominator']);
  });
});
