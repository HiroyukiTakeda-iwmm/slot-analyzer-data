import { describe, it, expect } from 'vitest';
import {
  agreesWithStored,
  allowedUnits,
  createNameDisambiguator,
  decimalsOf,
  intervalsOverlap,
  itemKey,
  kindUnits,
  listMachineItems,
  machineSupporters,
  machineValue,
  parseShown,
  patternsProblem,
  shapeError,
  storedInterval,
  toStoredFromShown,
  toStoredProbability,
  toStoredRate,
  valueDifferences,
  valuesAgree,
} from '../scripts/lib/provenance.mjs';

describe('decimalsOf', () => {
  it('表示の桁数を数える（数・文字列・% 付き・指数表記）', () => {
    expect(decimalsOf(295.2)).toBe(1);
    expect(decimalsOf('300.0')).toBe(1);
    expect(decimalsOf('3.1%')).toBe(1);
    expect(decimalsOf(300)).toBe(0);
    expect(decimalsOf(0.000076)).toBe(6);
    expect(decimalsOf(1.5e-7)).toBe(8);
    expect(decimalsOf('abc')).toBeNull();
  });
});

describe('丸めの幅の重なり（valuesAgree）', () => {
  it('丸めだけの違いは一致する', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.24 })).toBe(true);
    expect(valuesAgree('denominator', { 1: 300 }, { 1: 300.4 })).toBe(true);
    expect(valuesAgree('denominator', { 1: '3.1%' }, { 1: 32.3 })).toBe(true);
  });

  it('丸めで説明できない違いは一致しない（今の 0.1% の許容差より厳しい所）', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.4 })).toBe(false);
    expect(valuesAgree('denominator', { 1: '300.0' }, { 1: 300.4 })).toBe(false);
    // 33.0 は末尾の 0 を残すため文字列で書く（数の 33.0 は 33 と同じで、32.5〜33.5 の幅になる）
    expect(valuesAgree('denominator', { 1: '3.1%' }, { 1: '33.0' })).toBe(false);
  });

  it('確率 0 は確率 0 とだけ一致する', () => {
    expect(valuesAgree('denominator', { 1: null }, { 1: null })).toBe(true);
    expect(valuesAgree('denominator', { 1: null }, { 1: 99999 })).toBe(false);
    expect(valuesAgree('percent', { 1: 0 }, { 1: '0.0%' })).toBe(true);
    expect(valuesAgree('percent', { 1: 0 }, { 1: 0.1 })).toBe(false);
  });

  it('設定の組が違えば一致しない', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 6: 277.7 }, { 1: 295.2 })).toBe(false);
  });
});

describe('機種ファイルの確率との比較', () => {
  it('小数6桁で保存した小さい確率は、出典の分母と一致する（I-4）', () => {
    expect(agreesWithStored('denominator', { 1: 13107.2 }, { 1: 0.000076 })).toBe(true);
  });

  it('末尾の 0 が消えた保存値でも、小数6桁の幅で比べる', () => {
    expect(agreesWithStored('denominator', { 1: 32.5 }, { 1: 0.031 })).toBe(false);
    expect(agreesWithStored('denominator', { 1: '3.1%' }, { 1: 0.03125 })).toBe(true);
  });

  it('partial: 載っている設定がすべて合えば一致（既存の値の裏づけ）', () => {
    const stored = { 1: 0.003388, 2: 0.003418, 5: 0.00351, 6: 0.003601 };
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 277.7 }, stored, { partial: true })).toBe(
      true
    );
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 277.7 }, stored)).toBe(false);
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 280 }, stored, { partial: true })).toBe(
      false
    );
    expect(agreesWithStored('denominator', { 3: 295.2 }, stored, { partial: true })).toBe(false);
  });

  it('machineSupporters: 数値の unit は機種ファイルの確率と partial で数え、設定の組・有無は機種ファイルの値と比べる', () => {
    const stored = { 1: 0.003388, 6: 0.003601 };
    const values = { nana: { 1: 295.2 }, other: { 1: 250 } };
    expect(machineSupporters('denominator', values, { stored })).toEqual(['nana']);
    const gold = { confirmed: ['6'], excluded: ['1'] };
    const settingsValues = { nana: gold, other: { confirmed: ['6'], excluded: [] } };
    expect(machineSupporters('settings', settingsValues, { current: gold })).toEqual(['nana']);
  });

  it('全設定の比較: 設定の組が同じで、すべての設定の幅が重なれば一致', () => {
    const stored = { 1: 0.00338753, 6: 0.00360101 };
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 277.7 }, stored)).toBe(true);
    expect(agreesWithStored('percent', { 1: 25, 6: '50.0' }, { 1: 0.25, 6: 0.5 })).toBe(true);
    expect(agreesWithStored('denominator', { 1: 295.2, 6: 277.7 }, { 1: 0, 6: 0.00360101 })).toBe(
      false
    );
    expect(agreesWithStored('denominator', { 1: null, 6: 277.7 }, { 1: 0, 6: 0.00360101 })).toBe(
      true
    );
  });

  it('形が unit に合わない値や、確率の表でない stored は一致しない', () => {
    expect(agreesWithStored('denominator', { 1: 0.5 }, { 1: 0.5 })).toBe(false);
    expect(agreesWithStored('denominator', { 1: 295.2 }, null)).toBe(false);
    expect(agreesWithStored('denominator', { 1: 295.2 }, 0.00338753)).toBe(false);
    expect(agreesWithStored('denominator', { 1: 295.2 }, { 1: 1.5 }, { partial: true })).toBe(
      false
    );
    expect(agreesWithStored('denominator', {}, {}, { partial: true })).toBe(false);
  });
});

describe('区間の関数', () => {
  it('parseShown と storedInterval と intervalsOverlap', () => {
    expect(parseShown('denominator', null)).toEqual({ zero: true });
    expect(parseShown('percent', null)).toBeNull();
    expect(parseShown('denominator', 0.5)).toBeNull();
    expect(parseShown('denominator', '1/300')).toBeNull();
    expect(parseShown('percent', 101)).toBeNull();
    expect(storedInterval(0)).toEqual({ zero: true });
    expect(storedInterval(1.5)).toBeNull();
    expect(intervalsOverlap({ zero: true }, { zero: true })).toBe(true);
    expect(intervalsOverlap(null, { zero: true })).toBe(false);
  });

  it('parseShown: 表示の最後の桁の半分だけ幅を持たせ、確率に直す', () => {
    const den = parseShown('denominator', 295.2);
    expect(den.lo).toBeCloseTo(1 / 295.25, 15);
    expect(den.hi).toBeCloseTo(1 / 295.15, 15);
    const kept = parseShown('denominator', '300.0');
    expect(kept.lo).toBeCloseTo(1 / 300.05, 15);
    expect(kept.hi).toBeCloseTo(1 / 299.95, 15);
    const shownPercent = parseShown('denominator', '3.1%');
    expect(shownPercent.lo).toBeCloseTo(0.0305, 15);
    expect(shownPercent.hi).toBeCloseTo(0.0315, 15);
    const percent = parseShown('percent', 30.5);
    expect(percent.lo).toBeCloseTo(0.3045, 15);
    expect(percent.hi).toBeCloseTo(0.3055, 15);
  });

  it('parseShown: 端は確率の 0〜1 に収める（分母 1・割合 100）', () => {
    expect(parseShown('denominator', 1)).toEqual({ lo: 1 / 1.5, hi: 1 });
    expect(parseShown('percent', 100)).toEqual({ lo: 0.995, hi: 1 });
    expect(parseShown('percent', '0.0')).toEqual({ zero: true });
  });

  it('parseShown: 数として読めない値・範囲外・書き方の違う文字列は null', () => {
    for (const raw of [Number.NaN, Infinity, -1, true, undefined, {}, '', '03.1', '3.1%%', '1e3']) {
      expect(parseShown('denominator', raw)).toBeNull();
    }
    expect(parseShown('percent', -0.1)).toBeNull();
    expect(parseShown('percent', '100.1%')).toBeNull();
  });

  it('parseShown: 有限の数にならない文字列は null（読めない数を通さない）', () => {
    // "1" のあとに 0 が 400 個続く文字列は Number で Infinity になり、幅 0 の値（確率 0 の印も無い）になっていた
    const huge = '1' + '0'.repeat(400);
    expect(parseShown('denominator', huge)).toBeNull();
    expect(parseShown('percent', huge)).toBeNull();
    // 読めない値は形のエラーになり、同じ値どうしでも一致しない
    expect(shapeError('denominator', { 1: huge })).not.toBeNull();
    expect(valuesAgree('denominator', { 1: huge }, { 1: huge })).toBe(false);
  });

  it('parseShown: 確率に直すと幅の上端まで 0 になる値は null（0 でない値は正の確率を表す）', () => {
    // 割合の 5e-324 は、確率に直すと { lo: 0, hi: 0 } に丸まる（確率 0 の印も無い）
    expect(parseShown('percent', 5e-324)).toBeNull();
    expect(shapeError('percent', { 1: 5e-324 })).not.toBeNull();
    expect(valuesAgree('percent', { 1: 5e-324 }, { 1: 5e-324 })).toBe(false);
  });

  it('parseShown: 桁の多い値（kept-single-source の採用値にする 1 ÷ 確率など）は、幅が浮動小数点で消えても点として読む', () => {
    // 1 ÷ 0.00338753 = 295.20033770918633 は、表示の桁の半分（5e-15）が倍精度で消えて lo と hi が同じになる
    const den = parseShown('denominator', 1 / 0.00338753);
    expect(den).not.toBeNull();
    expect(den.lo).toBe(den.hi);
    expect(parseShown('percent', 0.123457 * 100)).not.toBeNull(); // 12.345699999999999
    // 機種ファイルの確率から作る今の値（machineValue）は形が合い、機種ファイルの確率と一致する
    const stored = { 1: 0.00338753, 6: 0.00360101 };
    const current = machineValue({ probabilities: stored }, 'denominator');
    expect(shapeError('denominator', current)).toBeNull();
    expect(agreesWithStored('denominator', current, stored)).toBe(true);
    const rates = { 1: 0.123457, 6: 0.5 };
    const percent = machineValue({ probabilities: rates }, 'percent');
    expect(shapeError('percent', percent)).toBeNull();
    expect(agreesWithStored('percent', percent, rates)).toBe(true);
  });

  it('storedInterval: 小数6桁より粗くないとみなし、細かい値は表示の桁で幅を持たせる', () => {
    const coarse = storedInterval(0.000076);
    expect(coarse.lo).toBeCloseTo(0.0000755, 15);
    expect(coarse.hi).toBeCloseTo(0.0000765, 15);
    const fine = storedInterval(0.00338753);
    expect(fine.lo).toBeCloseTo(0.003387525, 15);
    expect(fine.hi).toBeCloseTo(0.003387535, 15);
    expect(storedInterval(1)).toEqual({ lo: 0.9999995, hi: 1 });
    expect(storedInterval(-0.1)).toBeNull();
    expect(storedInterval('0.5')).toBeNull();
  });
});

describe('toStoredFromShown', () => {
  it('表示の値を、機種ファイルに保存する確率（有効数字6桁）にする', () => {
    expect(toStoredFromShown('denominator', 295.2)).toBe(0.00338753);
    expect(toStoredFromShown('denominator', '300.0')).toBe(0.00333333);
    expect(toStoredFromShown('denominator', '3.1%')).toBe(0.031);
    expect(toStoredFromShown('denominator', null)).toBe(0);
    expect(toStoredFromShown('percent', 30.5)).toBe(0.305);
  });
});

describe('valuesAgree: denominator（分母）', () => {
  it('丸めの幅が重なれば一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 6: 277.7 }, { 1: 295.24, 6: 277.7 })).toBe(true);
  });

  it('確率 0（null）は null とだけ一致', () => {
    expect(valuesAgree('denominator', { 1: null, 6: 8192 }, { 1: null, 6: 8192 })).toBe(true);
    expect(valuesAgree('denominator', { 1: null }, { 1: 8192 })).toBe(false);
  });

  it('丸めの幅が重ならなければ不一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2 }, { 1: 295.6 })).toBe(false);
  });

  it('設定の並びが違えば不一致', () => {
    expect(valuesAgree('denominator', { 1: 295.2, 2: 292.6 }, { 1: 295.2 })).toBe(false);
  });

  it('形が合わない値は不一致', () => {
    expect(valuesAgree('denominator', true, true)).toBe(false);
  });

  it('丸めの幅がちょうど接するなら一致（境界を含む）。許容差の境目だった値は一致しない', () => {
    // 32.3 は 32.25〜32.35、32.4 は 32.35〜32.45。確率に直すと浮動小数点の誤差で端がわずかにずれる
    expect(valuesAgree('denominator', { 1: 32.3 }, { 1: 32.4 })).toBe(true);
    expect(valuesAgree('denominator', { 1: 32.3 }, { 1: 32.41 })).toBe(false);
    // 差がちょうど 0.1% の組（以前の許容差の境目）は、丸めで説明できないので一致しない
    expect(valuesAgree('denominator', { 1: 8192 }, { 1: 8183.808 })).toBe(false);
  });

  it('空・NaN・1 未満を含む値は不一致', () => {
    expect(valuesAgree('denominator', {}, {})).toBe(false);
    expect(valuesAgree('denominator', { 1: Number.NaN }, { 1: Number.NaN })).toBe(false);
    expect(valuesAgree('denominator', { 1: 0.5 }, { 1: 0.5 })).toBe(false);
  });
});

describe('valuesAgree: percent（割合）', () => {
  it('丸めの幅が重なれば一致', () => {
    expect(valuesAgree('percent', { 1: 10, 6: 20 }, { 1: 10.05, 6: 20 })).toBe(true);
  });

  it('丸めの幅がちょうど接するなら一致（境界を含む）', () => {
    // "20.0" は 19.95〜20.05%、20.1 は 20.05〜20.15%
    expect(valuesAgree('percent', { 1: '20.0' }, { 1: 20.1 })).toBe(true);
    // 2.1 は 2.05〜2.15%、2.2 は 2.15〜2.25%。確率に直すと浮動小数点の誤差で端がわずかにずれる
    expect(valuesAgree('percent', { 1: 2.1 }, { 1: 2.2 })).toBe(true);
    expect(valuesAgree('percent', { 1: 2.1 }, { 1: 2.21 })).toBe(false);
  });

  it('丸めの幅が重ならなければ不一致（末尾の 0 は文字列にして表示の桁を残す）', () => {
    expect(valuesAgree('percent', { 1: '10.0' }, { 1: 10.2 })).toBe(false);
    // 数の 10 は表示の桁が 0 桁なので、9.5〜10.5% の幅を持つ
    expect(valuesAgree('percent', { 1: 10 }, { 1: 10.2 })).toBe(true);
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

describe('valueDifferences（valuesAgree の判定の本体）', () => {
  it('一致しない道ごとに違いを返し、違いが無いときだけ valuesAgree が一致とする', () => {
    const cases = [
      ['denominator', { 1: 99.9, 6: 94.2 }, { 1: '99.90', 6: 94.24 }, []],
      [
        'denominator',
        { 1: 99.9 },
        { 1: 'ほぼ 1/100' },
        [{ type: 'shape', side: 'b', problem: shapeError('denominator', { 1: 'ほぼ 1/100' }) }],
      ],
      [
        'denominator',
        { 1: 99.9, 6: 94.2 },
        { 1: 99.9, 2: 98 },
        [
          { type: 'missingSettings', side: 'b', settings: ['6'] },
          { type: 'missingSettings', side: 'a', settings: ['2'] },
        ],
      ],
      ['denominator', { 1: 94.2 }, { 1: 94.5 }, [{ type: 'noOverlap', setting: '1', zero: false }]],
      ['denominator', { 1: null }, { 1: 99999 }, [{ type: 'noOverlap', setting: '1', zero: true }]],
      ['percent', { 1: 0.1 }, { 1: 0 }, [{ type: 'noOverlap', setting: '1', zero: true }]],
      ['percent', { 1: '10.0', 6: 40 }, { 1: 10.04, 6: '40%' }, []],
      [
        'settings',
        { confirmed: ['5', '6'], excluded: [] },
        { confirmed: ['6'], excluded: ['1'] },
        [
          { type: 'settingSet', key: 'confirmed' },
          { type: 'settingSet', key: 'excluded' },
        ],
      ],
      [
        'settings',
        { confirmed: ['6', '5'], excluded: [] },
        { confirmed: ['5', '6'], excluded: [] },
        [],
      ],
      ['presence', true, true, []],
      ['presence', true, false, [{ type: 'shape', side: 'b', problem: 'true が必要' }]],
      [
        'unknown',
        { 1: 1 },
        { 1: 1 },
        [
          { type: 'shape', side: 'a', problem: '未知の unit: unknown' },
          { type: 'shape', side: 'b', problem: '未知の unit: unknown' },
        ],
      ],
    ];
    for (const [unit, a, b, expected] of cases) {
      expect(valueDifferences(unit, a, b)).toEqual(expected);
      expect(valuesAgree(unit, a, b)).toBe(expected.length === 0);
    }
  });

  it('形の合わない値があれば、形の違いだけを返す（設定ごとには比べない）', () => {
    expect(valueDifferences('percent', { 1: null, 6: 40 }, { 1: 30, 2: 40 })).toEqual([
      { type: 'shape', side: 'a', problem: shapeError('percent', { 1: null }) },
    ]);
  });
});

describe('shapeError', () => {
  it('正しい形なら null', () => {
    expect(shapeError('denominator', { 1: 295.2 })).toBeNull();
    expect(shapeError('denominator', { 1: null, 6: 8192 })).toBeNull();
    expect(shapeError('denominator', { 1: '300.0', 6: '3.1%' })).toBeNull();
    expect(shapeError('percent', { 1: 0, 6: 100 })).toBeNull();
    expect(shapeError('percent', { 1: '30.0', 6: '0.5%' })).toBeNull();
    expect(shapeError('settings', { confirmed: ['6'], excluded: [] })).toBeNull();
    expect(shapeError('presence', true)).toBeNull();
  });

  it('形が合わなければ説明を返す', () => {
    expect(shapeError('denominator', { 1: 0 })).toBe(
      '設定ごとに、1 以上の分母（数か、表示の桁を残した文字列）、% 付きの割合、または確率 0 を表す null が必要'
    );
    expect(shapeError('denominator', { 1: '1/300' })).toContain('分母');
    expect(shapeError('denominator', {})).toContain('分母');
    expect(shapeError('denominator', [295.2])).toContain('分母');
    expect(shapeError('denominator', null)).toContain('分母');
    expect(shapeError('percent', { 1: 120 })).toBe(
      '設定ごとに、0〜100 の割合（数か、表示の桁を残した文字列）が必要'
    );
    expect(shapeError('percent', { 1: null })).toContain('割合');
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

describe('kindUnits（種類だけで決まる unit。機種ファイルに無い新しい項目の確かめ）', () => {
  it('役・ゾーンの役は denominator だけ。ほかの種類は項目の中身で決まるので null', () => {
    expect(kindUnits('role')).toEqual(['denominator']);
    expect(kindUnits('zoneRole')).toEqual(['denominator']);
    for (const kind of [
      'endScreen',
      'endScreenGroupItem',
      'trialSuccessRate',
      'confirmationEvent',
    ]) {
      expect(kindUnits(kind)).toBeNull();
    }
  });

  it('allowedUnits の数値の項目の候補と同じ規則', () => {
    for (const kind of ['role', 'zoneRole', 'endScreen', 'trialSuccessRate', 'modeTransition']) {
      expect(allowedUnits(kind, { probabilities: { 1: 0.5 } })).toEqual(
        kindUnits(kind) ?? ['denominator', 'percent']
      );
    }
  });
});

describe('allowedUnits（記録に使える unit。仕様 5.4）', () => {
  it('役は denominator だけ', () => {
    expect(allowedUnits('role', { probabilities: { 1: 0.5 } })).toEqual(['denominator']);
    expect(allowedUnits('zoneRole', { probabilities: { 1: 0, 6: 0.25 } })).toEqual(['denominator']);
  });

  it('ほかの数値の項目は、値の大きさによらず denominator か percent を選べる（2026-09-27）', () => {
    const both = ['denominator', 'percent'];
    expect(allowedUnits('trialSuccessRate', { probabilities: { 1: 0.25, 6: 0 } })).toEqual(both);
    // 10% 未満の値（2026-09-27 より前は denominator だけ。% の表示はそのときも denominator に "3.1%" と書けた）
    expect(allowedUnits('trialSuccessRate', { probabilities: { 1: 0.031, 6: 0.047 } })).toEqual(
      both
    );
    expect(allowedUnits('trialSuccessRate', { probabilities: { 1: 0.003661 } })).toEqual(both);
    expect(allowedUnits('modeTransition', { rates: { 1: 0.1, 6: 0.047 } })).toEqual(both);
  });

  it('最上位の終了画面の distribution（古い形）は、数値として扱う', () => {
    const [item] = listMachineItems({
      endScreens: [{ name: '金枠', distribution: { 1: 0, 6: 0.01 } }],
    });
    expect(allowedUnits('endScreen', item.entry)).toEqual(['denominator', 'percent']);
  });

  it('グループの中の終了画面の distribution は、アプリが改名しないので数値として扱わない', () => {
    const [item] = listMachineItems({
      endScreenGroups: [{ name: 'G', endScreens: [{ name: '金', distribution: { 6: 0.01 } }] }],
    });
    expect(allowedUnits(item.kind, item.entry)).toEqual(['presence']);
  });

  it('patterns 形式の項目は記録できない（候補が空。理由と次にすることは patternsProblem）', () => {
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
    expect(allowedUnits('endScreen', both)).toEqual(['denominator', 'percent']);
  });
});

describe('patternsProblem', () => {
  it('最上位の終了画面は、先に expand-patterns --write で書き直すよう示す', () => {
    expect(patternsProblem('endScreen', 'machines/rezero/rezero-season2.json')).toBe(
      'patterns 形式の終了画面は記録できない（アプリはパターンごとの終了画面を使い、親を捨てる）。先に node scripts/expand-patterns.mjs machines/rezero/rezero-season2.json --write で書き直す'
    );
  });

  it('ボイスなど、ほかの patterns は扱いを段階2で決める', () => {
    expect(patternsProblem('voiceCount', 'machines/a/b.json')).toBe(
      'patterns 形式の項目は記録できない（扱いは段階2で決める）'
    );
  });
});
