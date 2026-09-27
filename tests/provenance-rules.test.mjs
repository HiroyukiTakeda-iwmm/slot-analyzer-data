import { describe, it, expect } from 'vitest';
import {
  decideExistingItem,
  decideNewItem,
  preferenceOrder,
  statusError,
  toStoredProbability,
  valuesEqual,
} from '../scripts/lib/provenance.mjs';

const DEN = 'denominator';
const KINDS = {
  chonborista: 'analysis-site',
  'nana-press': 'analysis-site',
  '1geki': 'analysis-site',
  'p-town-dmm': 'analysis-site',
  maker: 'official',
};

/** 分母の表を、機種ファイルに保存する確率（有効数字6桁）の表にする */
const storedOf = (denominators) =>
  Object.fromEntries(Object.entries(denominators).map(([k, v]) => [k, toStoredProbability(v)]));

/** 機種ファイルの確率の表を、今の値（unit の形。machineValue と同じ 1 ÷ 確率）にする */
const currentOf = (stored) =>
  Object.fromEntries(Object.entries(stored).map(([k, p]) => [k, 1 / p]));

describe('valuesEqual（丸めの幅で比べない完全一致）', () => {
  it('設定の並び順は見ない（JS が並べ直さない、整数でないキーで確かめる）', () => {
    expect(valuesEqual(DEN, { L: 300, V: 200 }, { V: 200, L: 300 })).toBe(true);
  });

  it('denominator / percent は、丸めの幅が重なっても値が違えば false', () => {
    expect(valuesEqual(DEN, { 1: 295.2 }, { 1: 295.24 })).toBe(false);
    expect(valuesEqual(DEN, { 1: null, 6: 277.7 }, { 1: null, 6: 277.7 })).toBe(true);
    expect(valuesEqual(DEN, { 1: null }, { 1: 8192 })).toBe(false);
    expect(valuesEqual('percent', { 1: 10 }, { 1: 10 })).toBe(true);
    expect(valuesEqual('percent', { 1: 10 }, { 1: 10.05 })).toBe(false);
  });

  it('表示の桁を残した文字列は、同じ数の値と同じでない（"300.0" と 300）', () => {
    expect(valuesEqual(DEN, { 1: '300.0' }, { 1: 300 })).toBe(false);
    expect(valuesEqual(DEN, { 1: '300.0' }, { 1: '300.0' })).toBe(true);
    expect(valuesEqual(DEN, { 1: '3.1%' }, { 1: '3.1%' })).toBe(true);
  });

  it('settings は組として比べる（並び順と重なりは見ない）', () => {
    const a = { confirmed: ['6', '5'], excluded: ['1'] };
    expect(valuesEqual('settings', a, { confirmed: ['5', '6', '6'], excluded: ['1'] })).toBe(true);
    expect(valuesEqual('settings', a, { confirmed: ['6'], excluded: ['1'] })).toBe(false);
    expect(
      valuesEqual(
        'settings',
        { confirmed: ['6'], excluded: ['1'] },
        { confirmed: ['6'], excluded: ['2'] }
      )
    ).toBe(false);
  });

  it('presence は true どうしなら true', () => {
    expect(valuesEqual('presence', true, true)).toBe(true);
    expect(valuesEqual('presence', true, false)).toBe(false);
  });

  it('形が unit に合わない値・設定の欠け・未知の unit は false', () => {
    expect(valuesEqual(DEN, null, null)).toBe(false);
    expect(valuesEqual(DEN, { 1: 0.5 }, { 1: 0.5 })).toBe(false);
    expect(valuesEqual(DEN, { 1: 295.2 }, { 1: 295.2, 2: 292.6 })).toBe(false);
    expect(valuesEqual('unknown', { 1: 1 }, { 1: 1 })).toBe(false);
  });
});

describe('preferenceOrder', () => {
  it('公式 → ちょんぼりすた → 記録順', () => {
    const values = { 'nana-press': {}, chonborista: {}, '1geki': {}, maker: {} };
    expect(preferenceOrder(values, KINDS)).toEqual(['maker', 'chonborista', 'nana-press', '1geki']);
  });
});

describe('decideNewItem（新しく入れる値）', () => {
  // 設定1だけの機種として比べる（全設定の値がそろうかは、下の「全設定がそろった項目だけ」で確かめる）
  const NEW = { sourceKinds: KINDS, settings: ['1'] };

  it('2サイトで一致 → confirmed。採用値はちょんぼりすた', () => {
    const values = { 'nana-press': { 1: 295.24 }, chonborista: { 1: 295.2 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('公式があれば、ほかと食い違っても公式の値で confirmed', () => {
    const values = { chonborista: { 1: 300 }, maker: { 1: 295.2 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('ちょんぼりすただけ＋読み直しが一致 → provisional-chonborista', () => {
    const values = { chonborista: { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW, reread: { 1: 8192 } })).toEqual({
      outcome: 'adopt',
      status: 'provisional-chonborista',
      adopted: { 1: 8192 },
    });
  });

  it('ちょんぼりすただけで、読み直しが無い・一致しない → candidate', () => {
    const values = { chonborista: { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW }).outcome).toBe('candidate');
    expect(decideNewItem({ unit: DEN, values, ...NEW, reread: { 1: 4096 } }).outcome).toBe(
      'candidate'
    );
  });

  it('ちょんぼりすた以外の1サイトだけ → candidate', () => {
    const values = { 'nana-press': { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual({
      outcome: 'candidate',
      reason: 'ちょんぼりすた以外の1サイトのみ',
    });
  });

  it('2サイトが食い違う → candidate', () => {
    const values = { chonborista: { 1: 300 }, 'nana-press': { 1: 400 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('別々の値でそれぞれ2サイトが一致 → candidate', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('出典なし → candidate', () => {
    expect(decideNewItem({ unit: DEN, values: {}, ...NEW })).toEqual({
      outcome: 'candidate',
      reason: '出典なし',
    });
  });

  it('公式が2つあって食い違う → candidate', () => {
    const kinds = { ...KINDS, 'maker-site': 'official' };
    const values = { maker: { 1: 295.2 }, 'maker-site': { 1: 300 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW, sourceKinds: kinds })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('形が unit に合わない値は例外にする', () => {
    const values = { maker: { 1: 0.5 } };
    expect(() => decideNewItem({ unit: DEN, values, ...NEW })).toThrow('形に合わない');
  });
});

describe('decideNewItem: 新しく入れる値は全設定がそろった項目だけ（2026-09-27）', () => {
  const MISSING = {
    outcome: 'candidate',
    reason: '全設定の値がそろわない（アプリは設定が1つでも欠けた確率があると推定が止まる）',
  };
  const FULL = { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 };
  const SETTINGS = ['1', '2', '5', '6'];

  it('ちょんぼりすたが一部の設定だけ → 読み直しが一致しても candidate', () => {
    const values = { chonborista: { 1: 295.2, 6: 277.7 } };
    const reread = { 1: 295.2, 6: 277.7 };
    expect(
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread, settings: SETTINGS })
    ).toEqual(MISSING);
  });

  it('同じ値でも、機種の設定がすべてそろっていれば provisional-chonborista', () => {
    const values = { chonborista: { 1: 295.2, 6: 277.7 } };
    const reread = { 1: 295.2, 6: 277.7 };
    expect(
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread, settings: ['1', '6'] })
    ).toEqual({
      outcome: 'adopt',
      status: 'provisional-chonborista',
      adopted: { 1: 295.2, 6: 277.7 },
    });
  });

  it('2サイトが全設定で一致 → confirmed', () => {
    const values = { chonborista: FULL, 'nana-press': { ...FULL } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings: SETTINGS })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: FULL,
    });
  });

  it('2サイトや公式が一致しても、一部の設定だけなら candidate', () => {
    const partial = { 1: 295.2, 6: 277.7 };
    const run = (values) =>
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings: SETTINGS });
    expect(run({ chonborista: partial, 'nana-press': { ...partial } })).toEqual(MISSING);
    expect(run({ maker: partial })).toEqual(MISSING);
  });

  it('一部の設定だけの出典は記録してよいが、新しい値の一致には数えない', () => {
    const run = (values) =>
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings: SETTINGS });
    // 全設定の出典1つと、同じ値を一部の設定だけ載せる出典は、2サイト一致にならない
    expect(run({ 'nana-press': FULL, '1geki': { 1: 295.2, 6: 277.7 } }).outcome).toBe('candidate');
    // 全設定で一致する2サイトがあれば、一部の設定だけの出典があっても confirmed
    expect(run({ chonborista: FULL, 'nana-press': { ...FULL }, '1geki': { 1: 295.2 } })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: FULL,
    });
  });

  it('既存の値では、同じ一部の設定だけの出典を「残す」の裏づけに数える（新しく入れる値との違い）', () => {
    const values = { chonborista: { 1: 295.2, 6: 277.7 } };
    const stored = storedOf(FULL);
    const current = Object.fromEntries(Object.entries(stored).map(([k, p]) => [k, 1 / p]));
    const reread = { 1: 295.2, 6: 277.7 };
    expect(
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread, settings: SETTINGS })
    ).toEqual(MISSING);
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current, stored })).toEqual({
      outcome: 'adopt',
      status: 'kept-single-source',
      adopted: current,
    });
  });

  it('機種の設定に無いキーを持つ値も、全設定がそろったとはみなさない', () => {
    const values = { chonborista: { 1: 295.2, 6: 277.7 } };
    const reread = { 1: 295.2, 6: 277.7 };
    expect(
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread, settings: ['1'] })
    ).toEqual(MISSING);
  });

  it('割合の項目にも同じ決まりを使う', () => {
    const values = { chonborista: { 1: 25 }, 'nana-press': { 1: 25 } };
    const run = (settings) =>
      decideNewItem({ unit: 'percent', values, sourceKinds: KINDS, settings });
    expect(run(['1', '6'])).toEqual(MISSING);
    expect(run(['1'])).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: { 1: 25 } });
  });

  it('数値の unit で settings（機種の設定）を渡さなければ例外', () => {
    for (const unit of [DEN, 'percent']) {
      expect(() =>
        decideNewItem({ unit, values: { chonborista: { 1: 30 } }, sourceKinds: KINDS })
      ).toThrow('数値の項目には settings（機種の設定）が必要');
    }
  });

  it('設定の組・有無の unit では settings を見ない', () => {
    const gold = { confirmed: ['6'], excluded: ['1'] };
    expect(
      decideNewItem({
        unit: 'settings',
        values: { chonborista: gold, 'nana-press': gold },
        sourceKinds: KINDS,
      })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: gold });
    expect(
      decideNewItem({
        unit: 'presence',
        values: { chonborista: true, 'nana-press': true },
        sourceKinds: KINDS,
        settings: ['1', '6'],
      })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: true });
  });
});

describe('decideExistingItem（既存の値の見直し）', () => {
  // 今の値（current）は機種ファイルの値を分母にしたもの、stored はその確率そのもの
  const at300 = { current: { 1: 300 }, stored: storedOf({ 1: 300 }) };

  it('2サイトで一致した値が今の値と違えば、その値へ直す', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.24 } };
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, ...at300 })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('今の値を1サイトだけが裏づける → kept-single-source', () => {
    const values = { 'nana-press': { 1: 295.2 }, '1geki': { 1: 310 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 295.2 },
        stored: storedOf({ 1: 295.2 }),
      })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 295.2 } });
  });

  it('食い違いがあっても今の値に裏づけがあれば残す', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, ...at300 })).toEqual({
      outcome: 'adopt',
      status: 'kept-single-source',
      adopted: { 1: 300 },
    });
  });

  it('裏づけが無く、ちょんぼりすただけが別の値＋読み直し一致 → provisional-chonborista', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        ...at300,
        reread: { 1: 295.2 },
      })
    ).toEqual({ outcome: 'adopt', status: 'provisional-chonborista', adopted: { 1: 295.2 } });
  });

  it('裏づけが無く、読み直しも無い → remove', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, ...at300 })).toEqual({
      outcome: 'remove',
      reason: '今の値を裏づける出典なし',
    });
  });

  it('出典なし → remove', () => {
    expect(decideExistingItem({ unit: DEN, values: {}, sourceKinds: KINDS, ...at300 })).toEqual({
      outcome: 'remove',
      reason: '出典なし',
    });
  });

  it('小数6桁で保存した小さい確率も、出典の分母が裏づける → kept-single-source（I-4）', () => {
    const values = { nana: { 1: 13107.2 } };
    const current = { 1: 1 / 0.000076 };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current,
        stored: { 1: 0.000076 },
      })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: current });
  });

  it('一部の設定だけの出典も、載っている設定がすべて合えば「残す」の裏づけに数える', () => {
    const stored = { 1: 0.003388, 2: 0.003418, 5: 0.00351, 6: 0.003601 };
    const current = Object.fromEntries(Object.entries(stored).map(([k, p]) => [k, 1 / p]));
    const values = { nana: { 1: 295.2, 6: 277.7 } };
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current, stored })).toEqual({
      outcome: 'adopt',
      status: 'kept-single-source',
      adopted: current,
    });
  });

  it('数値の unit では「残す」の裏づけを stored で数える（current は採用値にだけ使う）', () => {
    // current と stored が食い違う入力で、どちらで数えているかを確かめる
    const values = { nana: { 1: 300 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 300 },
        stored: storedOf({ 1: 400 }),
      })
    ).toEqual({ outcome: 'remove', reason: '今の値を裏づける出典なし' });
  });

  it('数値の unit で stored（機種ファイルの確率）を渡さなければ例外', () => {
    const values = { nana: { 1: 300 } };
    for (const unit of [DEN, 'percent']) {
      expect(() =>
        decideExistingItem({ unit, values, sourceKinds: KINDS, current: { 1: 300 } })
      ).toThrow('数値の項目には stored（機種ファイルの確率）が必要');
    }
  });

  it('設定の組・有無の unit では stored を見ず、今の値と一致する出典を数える', () => {
    const gold = { confirmed: ['6'], excluded: ['1'] };
    const values = { 'nana-press': gold, '1geki': { confirmed: ['5', '6'], excluded: [] } };
    expect(
      decideExistingItem({ unit: 'settings', values, sourceKinds: KINDS, current: gold })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: gold });
  });

  it('presence: 2サイトに載っていれば confirmed', () => {
    const values = { chonborista: true, 'nana-press': true };
    expect(
      decideExistingItem({ unit: 'presence', values, sourceKinds: KINDS, current: true })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: true });
  });

  it('公式があれば、今の値に関係なく公式の値で confirmed', () => {
    const values = { 'nana-press': { 1: 300 }, maker: { 1: 295.2 } };
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, ...at300 })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('ちょんぼりすただけが今の値と一致 → 暫定より先に kept-single-source', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 295.2 },
        stored: storedOf({ 1: 295.2 }),
        reread: { 1: 295.2 },
      })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 295.2 } });
  });

  it('食い違いがあり、今の値の裏づけも無い → 理由つきで remove', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 500 },
        stored: storedOf({ 1: 500 }),
      })
    ).toEqual({ outcome: 'remove', reason: 'サイト間で食い違い、今の値を裏づける出典なし' });
  });
});

describe('statusError（記録の status と値の関係）', () => {
  const item = (overrides) => ({ unit: DEN, adopted: { 1: 295.2 }, ...overrides });

  it('confirmed: 採用値と一致する出典が2つ → null', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toBeNull();
  });

  it('confirmed: 公式が1つ → null', () => {
    const values = { maker: { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toBeNull();
  });

  it('confirmed: 出典が1つだけ → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toContain('confirmed には');
  });

  it('provisional-chonborista: 条件を満たす → null', () => {
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS)
    ).toBeNull();
  });

  it('provisional-chonborista: ほかの出典がある → エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 310 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS)
    ).toContain('ちょんぼりすただけ');
  });

  it('provisional-chonborista: 読み直しが無い → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(statusError(item({ status: 'provisional-chonborista', values }), KINDS)).toContain(
      '読み直し'
    );
  });

  it('provisional-chonborista: 読み直しがあっても、ちょんぼりすたの値と一致しない → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 310 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS)
    ).toContain('読み直し');
  });

  it('kept-single-source: 一致が1つ → null、0 → エラー', () => {
    const one = { '1geki': { 1: 295.2 } };
    const none = { '1geki': { 1: 310 } };
    const stored = storedOf({ 1: 295.2 });
    expect(
      statusError(item({ status: 'kept-single-source', values: one }), KINDS, { stored })
    ).toBeNull();
    expect(
      statusError(item({ status: 'kept-single-source', values: none }), KINDS, { stored })
    ).toContain('kept-single-source には');
  });

  it('kept-single-source: 数値の unit では、機種ファイルの確率（stored）が無ければエラー', () => {
    const values = { '1geki': { 1: 295.2 } };
    expect(statusError(item({ status: 'kept-single-source', values }), KINDS)).toBe(
      'kept-single-source の確かめには機種ファイルの確率が要る'
    );
  });

  it('kept-single-source: stored が無ければ、2サイト一致があっても先にそれを返す（確定値に使えるかを決められない）', () => {
    // 機種ファイルに無い項目の記録では、検証器は stored を渡せない
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'kept-single-source', values }), KINDS)).toBe(
      'kept-single-source の確かめには機種ファイルの確率が要る'
    );
  });

  it('kept-single-source: 裏づけは機種ファイルの確率の幅で、載っている設定だけを比べて数える', () => {
    // 採用値（今の値を分母にしたもの）は 2 設定、出典は設定1だけ。分母の桁では 13107.2 と 13157.9… は合わない
    const stored = { 1: 0.000076, 6: 0.0001 };
    const adopted = { 1: 1 / 0.000076, 6: 1 / 0.0001 };
    const values = { '1geki': { 1: 13107.2 } };
    expect(
      statusError(item({ status: 'kept-single-source', values, adopted }), KINDS, { stored })
    ).toBeNull();
  });

  it('kept-single-source: 設定の組の unit では stored なしで、採用値と一致する出典を数える', () => {
    const gold = { confirmed: ['6'], excluded: ['1'] };
    const record = { unit: 'settings', status: 'kept-single-source', adopted: gold };
    expect(statusError({ ...record, values: { '1geki': gold } }, KINDS)).toBeNull();
    expect(
      statusError({ ...record, values: { '1geki': { confirmed: ['6'], excluded: [] } } }, KINDS)
    ).toContain('kept-single-source には');
  });

  it('confirmed: 別の値で2サイトが一致する組がある → エラー', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 300 } }), KINDS)
    ).toContain('confirmed には');
  });

  it('confirmed: 公式があるのに公式でない値を採用している → エラー', () => {
    const values = { chonborista: { 1: 300 }, 'nana-press': { 1: 300 }, maker: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 300 } }), KINDS)
    ).toContain('confirmed には');
  });

  it('kept-single-source: 2サイト一致の値があるなら confirmed にすべき → エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    const stored = storedOf({ 1: 295.2 });
    expect(
      statusError(item({ status: 'kept-single-source', values }), KINDS, { stored })
    ).toContain('confirmed にする');
  });

  it('kept-single-source: 一部の設定だけで一致する2サイトは確定に数えないので、kept-single-source でよい', () => {
    // 機種ファイルは4設定。出典は設定1・6だけで一致し、今の値を裏づける
    const stored = storedOf({ 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 });
    const partial = { 1: 295.2, 6: 277.7 };
    const values = { chonborista: partial, 'nana-press': { ...partial } };
    const record = item({ status: 'kept-single-source', values, adopted: currentOf(stored) });
    expect(statusError(record, KINDS, { stored })).toBeNull();
  });

  it('confirmed: 採用値が選んだ出典の値そのものでない（丸めの幅が重なっても）→ エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.24 } };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 294.92 } }), KINDS)
    ).toContain('confirmed には');
  });

  it('provisional-chonborista: 採用値がちょんぼりすたの値と違う → エラー', () => {
    const values = { chonborista: { 1: 1000 } };
    const reread = { by: 'verifier', value: { 1: 1000 } };
    expect(
      statusError(
        item({ status: 'provisional-chonborista', values, reread, adopted: { 1: 1000.95 } }),
        KINDS
      )
    ).toContain('同じでない');
  });

  it('未知の status → エラー', () => {
    expect(statusError(item({ status: 'guess', values: {} }), KINDS)).toContain('未知の status');
  });
});

describe('採否と検査の一貫性', () => {
  // settings は機種の設定（decideNewItem が使う）、current / stored は今の機種ファイルの値（decideExistingItem が使う）
  const one = ['1'];
  const cases = [
    {
      unit: DEN,
      values: { 'nana-press': { 1: 295.24 }, chonborista: { 1: 295.2 } },
      settings: one,
    },
    { unit: DEN, values: { chonborista: { 1: 300 }, maker: { 1: 295.2 } }, settings: one },
    { unit: DEN, values: { chonborista: { 1: 8192 } }, reread: { 1: 8192 }, settings: one },
    {
      unit: DEN,
      values: { 'nana-press': { 1: 295.2 }, '1geki': { 1: 310 } },
      settings: one,
      current: { 1: 295.2 },
      stored: storedOf({ 1: 295.2 }),
    },
    {
      unit: DEN,
      values: { chonborista: { 1: 295.2 } },
      settings: one,
      current: { 1: 300 },
      stored: storedOf({ 1: 300 }),
      reread: { 1: 295.2 },
    },
    { unit: 'presence', values: { chonborista: true, 'nana-press': true }, current: true },
    {
      unit: DEN,
      values: { nana: { 1: 13107.2 } },
      settings: one,
      current: { 1: 1 / 0.000076 },
      stored: { 1: 0.000076 },
    },
    {
      unit: DEN,
      values: { nana: { 1: 295.2, 6: 277.7 } },
      settings: ['1', '2', '5', '6'],
      current: { 1: 1 / 0.003388, 2: 1 / 0.003418, 5: 1 / 0.00351, 6: 1 / 0.003601 },
      stored: { 1: 0.003388, 2: 0.003418, 5: 0.00351, 6: 0.003601 },
    },
    // 一部の設定だけで一致する2サイト: 新しい値では入れず、既存の値では確定に使わずに「残す」
    {
      unit: DEN,
      values: { chonborista: { 1: 295.2, 6: 277.7 }, 'nana-press': { 1: 295.2, 6: 277.7 } },
      settings: ['1', '2', '5', '6'],
      current: currentOf(storedOf({ 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 })),
      stored: storedOf({ 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 }),
    },
    // 全設定で一致する2サイトと、矛盾しない一部だけの2サイト: 新しい値・既存の値とも confirmed
    {
      unit: DEN,
      values: {
        chonborista: { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
        'nana-press': { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
        '1geki': { 1: 295.2, 6: 277.7 },
        'p-town-dmm': { 1: 295.2, 6: 277.7 },
      },
      settings: ['1', '2', '5', '6'],
      current: currentOf(storedOf({ 1: 300, 2: 292.6, 5: 284.9, 6: 277.7 })),
      stored: storedOf({ 1: 300, 2: 292.6, 5: 284.9, 6: 277.7 }),
    },
  ];

  it('decideNewItem / decideExistingItem が採用した記録は、すべて statusError を通る', () => {
    let adopted = 0;
    for (const c of cases) {
      const results = [decideNewItem({ ...c, sourceKinds: KINDS })];
      if (c.current !== undefined) results.push(decideExistingItem({ ...c, sourceKinds: KINDS }));
      for (const result of results.filter((r) => r.outcome === 'adopt')) {
        const record = {
          unit: c.unit,
          status: result.status,
          values: c.values,
          adopted: result.adopted,
          ...(c.reread ? { reread: { by: 'verifier', value: c.reread } } : {}),
        };
        expect(statusError(record, KINDS, { stored: c.stored })).toBeNull();
        adopted += 1;
      }
    }
    expect(adopted).toBe(13);
  });
});

describe('一部の設定だけの出典を、食い違いにも確定にも使わない（2026-09-27）', () => {
  const FULL = { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 };
  const SETTINGS = ['1', '2', '5', '6'];
  /** 全設定の値と、載っている設定（1・6）で矛盾しない */
  const PART = { 1: 295.2, 6: 277.7 };
  /** 設定1で全設定の値と食い違う */
  const CLASH = { 1: 300, 6: 277.7 };
  const newItem = (values) =>
    decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings: SETTINGS });
  const existingItem = (values, denominators) => {
    const stored = storedOf(denominators);
    return decideExistingItem({
      unit: DEN,
      values,
      sourceKinds: KINDS,
      current: currentOf(stored),
      stored,
    });
  };

  describe('食い違い（別の値で2サイトが一致する組）に数えない', () => {
    /** 全設定で一致する2サイトと、同じ一部の設定の値で互いに一致する2サイト */
    const withPartialPair = (partial) => ({
      chonborista: FULL,
      'nana-press': { ...FULL },
      '1geki': partial,
      'p-town-dmm': { ...partial },
    });

    it('新しい値: 全設定の2サイト一致と、互いに一致して採用値と矛盾しない一部だけの2サイト → confirmed', () => {
      expect(newItem(withPartialPair(PART))).toEqual({
        outcome: 'adopt',
        status: 'confirmed',
        adopted: FULL,
      });
    });

    it('新しい値: 一部だけの2サイトが設定1で採用値と食い違い、互いに一致すれば candidate（サイト間で食い違い）', () => {
      expect(newItem(withPartialPair(CLASH))).toEqual({
        outcome: 'candidate',
        reason: 'サイト間で食い違い',
      });
    });

    it('一部だけの出典でも、採用値に無い設定を載せていれば矛盾しないとはみなさない', () => {
      expect(newItem(withPartialPair({ 1: 295.2, 3: 290 }))).toEqual({
        outcome: 'candidate',
        reason: 'サイト間で食い違い',
      });
    });

    it('既存の値でも同じ: 矛盾しない一部だけの2サイトがあっても、全設定の2サイト一致の値へ直す', () => {
      expect(existingItem(withPartialPair(PART), { ...FULL, 1: 300 })).toEqual({
        outcome: 'adopt',
        status: 'confirmed',
        adopted: FULL,
      });
    });

    it('既存の値でも同じ: 食い違う一部だけの2サイトは別の値の組。今の値の裏づけが無ければ食い違いとして外す', () => {
      expect(existingItem(withPartialPair(CLASH), { ...FULL, 1: 310 })).toEqual({
        outcome: 'remove',
        reason: 'サイト間で食い違い、今の値を裏づける出典なし',
      });
    });
  });

  describe('既存の項目で、一部の設定だけの値を確定にしない', () => {
    it('設定1・6だけで一致する2つの出典が今の値（4設定）と合う → kept-single-source（confirmed にしない）', () => {
      const values = { chonborista: PART, 'nana-press': { ...PART } };
      const stored = storedOf(FULL);
      expect(existingItem(values, FULL)).toEqual({
        outcome: 'adopt',
        status: 'kept-single-source',
        adopted: currentOf(stored),
      });
    });

    it('設定1・6だけで一致する2つの出典が今の値と食い違い、ほかに裏づけが無い → remove', () => {
      const values = { chonborista: PART, 'nana-press': { ...PART } };
      expect(existingItem(values, { ...FULL, 1: 300 })).toEqual({
        outcome: 'remove',
        reason: '今の値を裏づける出典なし',
      });
    });

    it('公式の値でも、一部の設定だけなら確定に使わない', () => {
      const values = { maker: PART };
      expect(existingItem(values, FULL)).toMatchObject({ status: 'kept-single-source' });
      expect(existingItem(values, { ...FULL, 1: 300 })).toEqual({
        outcome: 'remove',
        reason: '今の値を裏づける出典なし',
      });
    });

    it('全設定で2サイトが一致すれば、今までどおり confirmed', () => {
      const values = { chonborista: FULL, 'nana-press': { ...FULL } };
      expect(existingItem(values, { ...FULL, 1: 300 })).toEqual({
        outcome: 'adopt',
        status: 'confirmed',
        adopted: FULL,
      });
    });
  });
});
