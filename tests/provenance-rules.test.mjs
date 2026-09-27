import { describe, it, expect } from 'vitest';
import {
  decideExistingItem,
  decideNewItem,
  preferenceOrder,
  statusError,
  toStoredFromShown,
  toStoredProbability,
  valuesEqual,
} from '../scripts/lib/provenance.mjs';
import { checkRulesAgainstBase } from '../scripts/lib/rules-against-base.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';

const DEN = 'denominator';
const KINDS = {
  chonborista: 'analysis-site',
  'nana-press': 'analysis-site',
  '1geki': 'analysis-site',
  'p-town-dmm': 'analysis-site',
  slopachi: 'analysis-site',
  'x-site': 'analysis-site',
  maker: 'official',
  'maker-pdf': 'official',
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
    const candidate = {
      outcome: 'candidate',
      reason: 'ちょんぼりすたの値だけで、読み直しが無いか一致しない',
    };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual(candidate);
    expect(decideNewItem({ unit: DEN, values, ...NEW, reread: { 1: 4096 } })).toEqual(candidate);
  });

  it('ちょんぼりすた以外の1サイトだけ → candidate', () => {
    const values = { 'nana-press': { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, ...NEW })).toEqual({
      outcome: 'candidate',
      reason: '全設定がそろった出典が1つだけ（ちょんぼりすた以外）',
    });
  });

  it('2サイトが食い違う → candidate（ちょんぼりすたがあれば「ちょんぼりすたの値と矛盾する出典がある」）', () => {
    expect(
      decideNewItem({
        unit: DEN,
        values: { chonborista: { 1: 300 }, 'nana-press': { 1: 400 } },
        ...NEW,
      })
    ).toEqual({ outcome: 'candidate', reason: 'ちょんぼりすたの値と矛盾する出典がある' });
    expect(
      decideNewItem({
        unit: DEN,
        values: { 'nana-press': { 1: 300 }, '1geki': { 1: 400 } },
        ...NEW,
      })
    ).toEqual({ outcome: 'candidate', reason: 'サイト間で食い違い' });
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
    reason: '全設定の値がそろった出典が無い（アプリは設定が1つでも欠けた確率があると推定が止まる）',
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
    expect(run({ 'nana-press': FULL, '1geki': { 1: 295.2, 6: 277.7 } })).toEqual({
      outcome: 'candidate',
      reason: '全設定がそろった出典が1つだけ（ちょんぼりすた以外）',
    });
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
  // stored は今の機種ファイルの確率。数値の unit の今の値（kept-single-source の採用値）は stored から作る
  const at300 = { stored: storedOf({ 1: 300 }) };

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
    const stored = storedOf({ 1: 295.2 });
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, stored })).toEqual({
      outcome: 'adopt',
      status: 'kept-single-source',
      adopted: currentOf(stored),
    });
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
      adopted: currentOf(at300.stored),
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

  it('数値の unit では「残す」の裏づけを stored で数える（引数の current は使わない）', () => {
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

  it('数値の unit の今の値（kept-single-source の採用値）は stored から作る。current を渡さなくても、違う値を渡しても同じ', () => {
    // 前は current を渡し忘れると adopted: undefined を黙って返していた
    const stored = storedOf({ 1: 295.2, 6: 277.7 });
    const values = { 'nana-press': { 1: 295.2, 6: 277.7 } };
    const kept = { outcome: 'adopt', status: 'kept-single-source', adopted: currentOf(stored) };
    expect(decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, stored })).toEqual(kept);
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        stored,
        current: { 1: 300, 6: 280 },
      })
    ).toEqual(kept);
    // 割合は 確率 × 100（machineValue と同じ計算）
    expect(
      decideExistingItem({
        unit: 'percent',
        values: { 'nana-press': { 1: 25, 6: 50 } },
        sourceKinds: KINDS,
        stored: { 1: 0.25, 6: 0.5 },
      })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 25, 6: 50 } });
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
    const stored = storedOf({ 1: 295.2 });
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, stored, reread: { 1: 295.2 } })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: currentOf(stored) });
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
  // 数値の unit では、そろっているかを機種ファイルの確率（stored）のキーで決める。ここの機種は設定1だけ
  const ONE = { stored: storedOf({ 1: 295.2 }) };

  it('confirmed: 採用値と一致する出典が2つ → null', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS, ONE)).toBeNull();
  });

  it('confirmed: 公式が1つ → null', () => {
    const values = { maker: { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS, ONE)).toBeNull();
  });

  it('confirmed: 出典が1つだけ → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS, ONE)).toContain(
      'confirmed には'
    );
  });

  it('provisional-chonborista: 条件を満たす → null', () => {
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS, ONE)
    ).toBeNull();
  });

  it('provisional-chonborista: ほかの出典がちょんぼりすたの値と矛盾する → エラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 310 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS, ONE)
    ).toBe('provisional-chonborista は、ほかの出典がちょんぼりすたの値と矛盾しないときだけ使う');
  });

  it('provisional-chonborista: 読み直しが無い → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(statusError(item({ status: 'provisional-chonborista', values }), KINDS, ONE)).toContain(
      '読み直し'
    );
  });

  it('provisional-chonborista: 読み直しがあっても、ちょんぼりすたの値と一致しない → エラー', () => {
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 310 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS, ONE)
    ).toContain('読み直し');
  });

  it('provisional-chonborista: 確定値（2サイト一致）があれば暫定にしない', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS, ONE)
    ).toBe(
      'provisional-chonborista は、公式の値・2サイト一致の値・食い違いのどれも無いときだけ使う'
    );
  });

  it('provisional-chonborista: ちょんぼりすたの値に全設定がそろっていなければ暫定にしない', () => {
    const stored = storedOf({ 1: 295.2, 6: 277.7 });
    const values = { chonborista: { 1: 295.2 } };
    const reread = { by: 'verifier', value: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'provisional-chonborista', values, reread }), KINDS, { stored })
    ).toBe('provisional-chonborista は、ちょんぼりすたの値に全設定がそろっているときだけ使う');
  });

  it('provisional-chonborista: 矛盾しない一部だけの出典があっても暫定にできる', () => {
    const stored = storedOf({ 1: 295.2, 6: 277.7 });
    const full = { 1: 295.2, 6: 277.7 };
    const values = { chonborista: full, 'nana-press': { 1: 295.2 } };
    const reread = { by: 'verifier', value: { ...full } };
    const record = item({ status: 'provisional-chonborista', values, reread, adopted: full });
    expect(statusError(record, KINDS, { stored })).toBeNull();
  });

  it('confirmed・provisional-chonborista も、数値の unit では機種ファイルの確率（stored）が無ければエラー', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS)).toBe(
      'confirmed の確かめには機種ファイルの確率が要る'
    );
    expect(statusError(item({ status: 'provisional-chonborista', values }), KINDS)).toBe(
      'provisional-chonborista の確かめには機種ファイルの確率が要る'
    );
  });

  it('confirmed: 一部の設定だけの値は採用の候補にならないので、2サイトが一致してもエラー', () => {
    const stored = storedOf({ 1: 295.2, 6: 277.7 });
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.2 } };
    expect(statusError(item({ status: 'confirmed', values }), KINDS, { stored })).toContain(
      'confirmed には'
    );
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
      statusError(item({ status: 'confirmed', values, adopted: { 1: 300 } }), KINDS, ONE)
    ).toContain('confirmed には');
  });

  it('confirmed: 公式があるのに公式でない値を採用している → エラー', () => {
    const values = { chonborista: { 1: 300 }, 'nana-press': { 1: 300 }, maker: { 1: 295.2 } };
    expect(
      statusError(item({ status: 'confirmed', values, adopted: { 1: 300 } }), KINDS, ONE)
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
      statusError(item({ status: 'confirmed', values, adopted: { 1: 294.92 } }), KINDS, ONE)
    ).toContain('confirmed には');
  });

  it('provisional-chonborista: 採用値がちょんぼりすたの値と違う → エラー', () => {
    const values = { chonborista: { 1: 1000 } };
    const reread = { by: 'verifier', value: { 1: 1000 } };
    expect(
      statusError(
        item({ status: 'provisional-chonborista', values, reread, adopted: { 1: 1000.95 } }),
        KINDS,
        ONE
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
    // 採否の判定の作り直し（2026-09-27）の再現例。今の値（設定1が 1/300）はどの出典も裏づけない
    ...[
      // 1. ちょんぼりすた・なな徹・DMM が一部だけ（互いに一致）、スロパチと X が全設定で一致
      {
        chonborista: { 1: 295.2, 6: 277.7 },
        'nana-press': { 1: 295.2, 6: 277.7 },
        'p-town-dmm': { 1: 295.2, 6: 277.7 },
        slopachi: { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
        'x-site': { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
      },
      // 3. 全設定の公式と、矛盾しない一部だけの公式
      { maker: { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 }, 'maker-pdf': { 1: 295.2, 6: 277.7 } },
      // 4. 矛盾しない一部だけの公式と、全設定で一致する2サイト
      {
        maker: { 1: 295.2, 6: 277.7 },
        chonborista: { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
        'nana-press': { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
      },
    ].map((values) => ({
      unit: DEN,
      values,
      settings: ['1', '2', '5', '6'],
      current: currentOf(storedOf({ 1: 300, 2: 292.6, 5: 284.9, 6: 277.7 })),
      stored: storedOf({ 1: 300, 2: 292.6, 5: 284.9, 6: 277.7 }),
    })),
    // ちょんぼりすたが全設定、なな徹が矛盾しない一部だけ、読み直し一致 → 新しい値・既存の値とも暫定
    {
      unit: DEN,
      values: {
        chonborista: { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
        'nana-press': { 1: 295.2, 6: 277.7 },
      },
      reread: { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 },
      settings: ['1', '2', '5', '6'],
      current: currentOf(storedOf({ 1: 300, 2: 292.6, 5: 284.9, 6: 277.7 })),
      stored: storedOf({ 1: 300, 2: 292.6, 5: 284.9, 6: 277.7 }),
    },
  ];

  /**
   * 検証器がその記録を確かめるときの機種ファイルの確率。採用値を書いた後の機種ファイルなので、
   * kept-single-source では今の値のまま、ほかは採用値を保存する形にしたもの
   */
  const storedAfter = (c, result) => {
    if (c.unit !== DEN) return undefined;
    if (result.status === 'kept-single-source') return c.stored;
    return Object.fromEntries(
      Object.entries(result.adopted).map(([k, v]) => [k, toStoredFromShown(DEN, v)])
    );
  };

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
        expect(statusError(record, KINDS, { stored: storedAfter(c, result) })).toBeNull();
        adopted += 1;
      }
    }
    expect(adopted).toBe(21);
  });
});

describe('採否と検査の一貫性（逆向き）: 決定と違う status・採用値の記録は、検査のどこかで止まる（2026-09-27）', () => {
  // 検査 = validate の出典記録の検証（statusError と機種ファイルとの比較を含む）と、main と比べる検査（check:base）。
  // 場面ごとに、採否の関数の決定どおりの記録は検査を通り、status か採用値が違う記録はどこかで止まることを確かめる
  const SETTINGS = ['1', '2', '5', '6'];
  const FULL = { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 };
  /** 設定1で FULL と食い違う、全設定の値 */
  const OTHER = { ...FULL, 1: 300 };
  /** FULL と矛盾しない、一部だけの値 */
  const PART = { 1: 295.2, 6: 277.7 };
  /** main の機種ファイルの確率: FULL と合う・OTHER と合う・どの出典とも合わない */
  const MAIN_FULL = storedOf(FULL);
  const MAIN_OTHER = storedOf(OTHER);
  const MAIN_310 = storedOf({ ...FULL, 1: 310 });
  const STATUSES = ['confirmed', 'provisional-chonborista', 'kept-single-source'];
  const SOURCES = [
    ['chonborista', 'analysis-site', 'https://chonborista.com/slot/test/'],
    ['nana-press', 'analysis-site', 'https://nana-press.com/kaiseki/1/'],
    ['p-town-dmm', 'analysis-site', 'https://p-town.dmm.com/machines/1'],
    ['maker', 'official', 'https://www.maker.co.jp/products/test/'],
  ].map(([key, kind, url]) => ({ key, kind, url, retrievedAt: '2026-09-27' }));
  const kinds = Object.fromEntries(SOURCES.map((s) => [s.key, s.kind]));

  // expected は採否の関数の決定（adopt なら status、そうでなければ outcome）。main が無い場面は新しい値
  const scenes = [
    {
      label: '新しい値: 全設定で2サイト一致',
      expected: 'confirmed',
      values: { chonborista: FULL, 'nana-press': { ...FULL } },
    },
    {
      label: '新しい値: 全設定の公式と、公式と食い違って互いに一致する2サイト（公式が優先）',
      expected: 'confirmed',
      values: { maker: FULL, chonborista: OTHER, 'nana-press': { ...OTHER } },
    },
    {
      label: '新しい値: 矛盾しない一部だけの公式と、全設定の2サイト一致',
      expected: 'confirmed',
      values: { maker: PART, chonborista: FULL, 'nana-press': { ...FULL } },
    },
    {
      label: '新しい値: 2サイト一致の値と矛盾する一部だけの公式',
      expected: 'candidate',
      values: { maker: { 1: 300, 6: 277.7 }, chonborista: FULL, 'nana-press': { ...FULL } },
    },
    {
      label: '新しい値: 全設定のちょんぼりすた・矛盾しない一部だけの出典・読み直し一致',
      expected: 'provisional-chonborista',
      values: { chonborista: FULL, 'nana-press': PART },
      reread: FULL,
    },
    {
      label: '新しい値: 全設定のちょんぼりすた・矛盾しない一部だけの出典・読み直し無し',
      expected: 'candidate',
      values: { chonborista: FULL, 'nana-press': PART },
    },
    {
      label: '新しい値: ちょんぼりすたと矛盾する出典（読み直し一致）',
      expected: 'candidate',
      values: { chonborista: FULL, 'nana-press': OTHER },
      reread: FULL,
    },
    {
      label: '新しい値: 一部だけの出典しか無い（読み直し一致）',
      expected: 'candidate',
      values: { chonborista: PART, 'nana-press': { ...PART } },
      reread: PART,
    },
    {
      label: '新しい値: 全設定の出典がちょんぼりすた以外の1つと、一部だけの出典',
      expected: 'candidate',
      values: { 'nana-press': FULL, 'p-town-dmm': PART },
    },
    // 既存の値（main にある項目）
    {
      label: '既存の値: 全設定で2サイト一致（今の値の裏づけは無い）',
      expected: 'confirmed',
      values: { chonborista: FULL, 'nana-press': { ...FULL } },
      main: MAIN_310,
    },
    {
      label: '既存の値: 全設定の公式と、今の値を裏づけて互いに一致する2サイト（公式が優先）',
      expected: 'confirmed',
      values: { maker: FULL, chonborista: OTHER, 'nana-press': { ...OTHER } },
      main: MAIN_OTHER,
    },
    {
      label: '既存の値: 一部だけの2サイトが今の値を裏づける（一部だけでは確定しない）',
      expected: 'kept-single-source',
      values: { chonborista: PART, 'nana-press': { ...PART } },
      main: MAIN_FULL,
    },
    {
      label:
        '既存の値: ちょんぼりすた以外の一部だけの出典が今の値を裏づける（読み直し一致。レビュー I1）',
      expected: 'kept-single-source',
      values: { chonborista: FULL, 'nana-press': { 6: 277.7 } },
      reread: FULL,
      main: MAIN_OTHER,
    },
    {
      label: '既存の値: 全設定の出典1つが今の値を裏づける',
      expected: 'kept-single-source',
      values: { 'nana-press': FULL },
      main: MAIN_FULL,
    },
    {
      label:
        '既存の値: 裏づけが無く、全設定のちょんぼりすた・矛盾しない一部だけの出典・読み直し一致',
      expected: 'provisional-chonborista',
      values: { chonborista: FULL, 'nana-press': PART },
      reread: FULL,
      main: MAIN_310,
    },
    {
      label: '既存の値: 同じで読み直しが無い',
      expected: 'remove',
      values: { chonborista: FULL, 'nana-press': PART },
      main: MAIN_310,
    },
    {
      label: '既存の値: 食い違う2サイトで、今の値の裏づけも無い（読み直し一致）',
      expected: 'remove',
      values: { chonborista: FULL, 'nana-press': OTHER },
      reread: FULL,
      main: MAIN_310,
    },
  ];

  const INDEX = {
    version: '3.9.0',
    updatedAt: '2026-09-27T00:00:00Z',
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
  /** 機種ファイル。stored が無ければ、BIG の無い機種（新しい値の main） */
  const machineOf = (stored) => ({
    name: 'テスト機種',
    type: 'AT',
    author: 'コミュニティ',
    version: '1.0',
    lastUpdated: '2026-09-27',
    availableSettings: SETTINGS,
    roles: stored
      ? [{ name: 'BIG', probabilities: stored, hasSettingDiff: true, displayOrder: 1 }]
      : [],
  });
  const readerOf = (stored) => {
    const files = {
      'machines/index.json': JSON.stringify(INDEX),
      'machines/test/test-machine.json': JSON.stringify(machineOf(stored)),
    };
    return (path) => {
      if (!(path in files)) throw new Error(`no such file: ${path}`);
      return files[path];
    };
  };
  const recordOf = (scene, status, adopted) => ({
    machineId: 'test-machine',
    machineFile: 'test/test-machine.json',
    reviewedAt: '2026-09-27',
    sources: SOURCES,
    items: [
      {
        kind: 'role',
        name: 'BIG',
        status,
        unit: DEN,
        values: scene.values,
        adopted,
        ...(scene.reread ? { reread: { by: 'verifier', value: scene.reread } } : {}),
      },
    ],
    candidates: [],
    removed: [],
  });
  /**
   * 記録を書いた後の機種ファイルの確率。main にある項目の kept-single-source は main のまま（残す値は変えない）。
   * ほかは採用値を有効数字6桁にして書き、採用値に無い設定は元の値のまま（機種ファイルは全設定のキーを持つ）
   */
  const headOf = (scene, status, adopted) => {
    if (status === 'kept-single-source' && scene.main) return scene.main;
    const written = Object.fromEntries(
      Object.entries(adopted).map(([k, v]) => [k, toStoredFromShown(DEN, v)])
    );
    return { ...(scene.main ?? storedOf({ 1: 1000, 2: 1000, 5: 1000, 6: 1000 })), ...written };
  };
  /** 検査が出す問題（validate の出典記録の検証と、main と比べる検査） */
  const problemsOf = (scene, status, adopted) => {
    const head = headOf(scene, status, adopted);
    const record = recordOf(scene, status, adopted);
    const machineFiles = [{ path: 'machines/test/test-machine.json', data: machineOf(head) }];
    const validated = validateProvenance(machineFiles, INDEX, [
      { path: 'provenance/test-machine.json', data: record },
    ]);
    const againstBase = checkRulesAgainstBase({
      readBase: readerOf(scene.main),
      readHead: readerOf(head),
      provenanceFiles: [{ data: record }],
    });
    return [...validated.errors.map((e) => e.message), ...againstBase];
  };
  const decide = ({ values, reread, main }) =>
    main
      ? decideExistingItem({
          unit: DEN,
          values,
          sourceKinds: kinds,
          reread,
          current: currentOf(main),
          stored: main,
        })
      : decideNewItem({ unit: DEN, values, sourceKinds: kinds, reread, settings: SETTINGS });

  it.each(scenes.map((scene) => [scene.label, scene]))('%s', (_label, scene) => {
    const decision = decide(scene);
    expect(decision.status ?? decision.outcome).toBe(scene.expected);
    if (decision.outcome === 'adopt') {
      expect(problemsOf(scene, decision.status, decision.adopted)).toEqual([]);
    }
    // 採用値の候補: 出典の値（一部だけも）、今の値、決定の採用値
    const candidates = [
      ...Object.values(scene.values),
      ...(scene.main ? [currentOf(scene.main)] : []),
      ...(decision.outcome === 'adopt' ? [decision.adopted] : []),
    ].filter((v, i, all) => all.findIndex((w) => valuesEqual(DEN, v, w)) === i);
    let checked = 0;
    for (const status of STATUSES) {
      for (const adopted of candidates) {
        const asDecided =
          decision.outcome === 'adopt' &&
          status === decision.status &&
          valuesEqual(DEN, adopted, decision.adopted);
        if (asDecided) continue;
        expect(
          problemsOf(scene, status, adopted),
          `${status} ${JSON.stringify(adopted)}`
        ).not.toEqual([]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
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

describe('採否の判定: 採用の候補は全設定がそろった値だけ（2026-09-27）', () => {
  const FULL = { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 };
  const SETTINGS = ['1', '2', '5', '6'];
  /** 全設定の値と、載っている設定（1・6）で矛盾しない */
  const PART = { 1: 295.2, 6: 277.7 };
  /** 設定1で全設定の値と食い違う */
  const CLASH = { 1: 300, 6: 277.7 };
  /** 既存の値の見直しでの今の値。どの出典も裏づけない */
  const CURRENT = { ...FULL, 1: 310 };
  const CONFIRMED_FULL = { outcome: 'adopt', status: 'confirmed', adopted: FULL };
  const CONFLICT = { outcome: 'candidate', reason: 'サイト間で食い違い' };
  const newItem = (values, extra = {}) =>
    decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings: SETTINGS, ...extra });
  const existingItem = (values, extra = {}) => {
    const stored = storedOf(CURRENT);
    return decideExistingItem({
      unit: DEN,
      values,
      sourceKinds: KINDS,
      current: currentOf(stored),
      stored,
      ...extra,
    });
  };

  describe('1. 一部だけの値は採用の候補にしない（並び順に左右されない）', () => {
    // ちょんぼりすた・なな徹・DMM が一部だけ（互いに一致し、ちょんぼりすたとも一致）、スロパチと X が全設定で一致
    const complete = new Set(['slopachi', 'x-site']);
    const valuesIn = (order) =>
      Object.fromEntries(order.map((key) => [key, complete.has(key) ? { ...FULL } : { ...PART }]));
    const orders = [
      ['chonborista', 'nana-press', 'p-town-dmm', 'slopachi', 'x-site'],
      ['x-site', 'slopachi', 'p-town-dmm', 'nana-press', 'chonborista'],
      ['slopachi', 'nana-press', 'x-site', 'p-town-dmm', 'chonborista'],
    ].map((order) => [order.join(' → '), order]);

    it.each(orders)('新しい値: %s の並びでも confirmed（全設定の値）', (_label, order) => {
      expect(newItem(valuesIn(order))).toEqual(CONFIRMED_FULL);
    });

    it.each(orders)('既存の値: %s の並びでも confirmed（全設定の値）', (_label, order) => {
      expect(existingItem(valuesIn(order))).toEqual(CONFIRMED_FULL);
    });
  });

  describe('2. 一部だけのちょんぼりすたは暫定にしない', () => {
    it('既存の値: 一部だけのちょんぼりすた・読み直し一致・ほかに出典なし → 今の値の裏づけが無ければ remove', () => {
      expect(existingItem({ chonborista: PART }, { reread: { ...PART } })).toEqual({
        outcome: 'remove',
        reason: '今の値を裏づける出典なし',
      });
    });

    it('新しい値: 全設定の値がそろった出典が無い candidate', () => {
      expect(newItem({ chonborista: PART }, { reread: { ...PART } })).toEqual({
        outcome: 'candidate',
        reason:
          '全設定の値がそろった出典が無い（アプリは設定が1つでも欠けた確率があると推定が止まる）',
      });
    });
  });

  describe('3・4. 公式', () => {
    it('3. 全設定の公式と、それと矛盾しない一部だけの公式 → confirmed（公式の値）。並びが逆でも同じ', () => {
      expect(newItem({ maker: FULL, 'maker-pdf': PART })).toEqual(CONFIRMED_FULL);
      expect(newItem({ 'maker-pdf': PART, maker: FULL })).toEqual(CONFIRMED_FULL);
      expect(existingItem({ maker: FULL, 'maker-pdf': PART })).toEqual(CONFIRMED_FULL);
    });

    it('全設定の公式と、それと矛盾する公式（一部だけ・全設定）→ 食い違い', () => {
      expect(newItem({ maker: FULL, 'maker-pdf': CLASH })).toEqual(CONFLICT);
      expect(newItem({ maker: FULL, 'maker-pdf': { ...FULL, 1: 300 } })).toEqual(CONFLICT);
    });

    it('4. 矛盾しない一部だけの公式と、全設定で一致する2サイト → confirmed（2サイトの値）', () => {
      const values = { maker: PART, chonborista: FULL, 'nana-press': { ...FULL } };
      expect(newItem(values)).toEqual(CONFIRMED_FULL);
      expect(existingItem(values)).toEqual(CONFIRMED_FULL);
    });

    it('4. 一部だけの公式が2サイトの値と矛盾する → 食い違い（公式が優先）', () => {
      const values = { maker: CLASH, chonborista: FULL, 'nana-press': { ...FULL } };
      expect(newItem(values)).toEqual(CONFLICT);
      expect(existingItem(values)).toEqual({
        outcome: 'remove',
        reason: 'サイト間で食い違い、今の値を裏づける出典なし',
      });
    });

    it('そろった公式があれば公式以外の出典は見ない（公式が優先）: 公式と矛盾して互いに一致する2サイトがあっても confirmed', () => {
      const official = { 1: 295.2, 6: 277.7 };
      const sites = { 1: 300, 6: 277.7 };
      const values = { maker: official, chonborista: sites, 'nana-press': { ...sites } };
      const settings = ['1', '6'];
      const confirmed = { outcome: 'adopt', status: 'confirmed', adopted: official };
      expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings })).toEqual(confirmed);
      const stored = storedOf({ 1: 310, 6: 277.7 });
      expect(
        decideExistingItem({
          unit: DEN,
          values,
          sourceKinds: KINDS,
          current: currentOf(stored),
          stored,
        })
      ).toEqual(confirmed);
      // 検証器は、公式の値を書いた後の機種ファイルの確率で確かめる
      const record = { unit: DEN, status: 'confirmed', values, adopted: official };
      expect(statusError(record, KINDS, { stored: storedOf(official) })).toBeNull();
    });
  });

  describe('食い違いの確かめ（採用値と矛盾する出典のうち、互いに矛盾しない2つ）', () => {
    it('設定の組が違っても、共通の設定で幅が重なる2つは別の値の組', () => {
      const values = {
        chonborista: FULL,
        'nana-press': { ...FULL },
        '1geki': { 1: 300 },
        'p-town-dmm': { 1: 300, 6: 277.7 },
      };
      expect(newItem(values)).toEqual(CONFLICT);
    });

    it('共通の設定が無い2つは、組にしない', () => {
      const values = {
        chonborista: FULL,
        'nana-press': { ...FULL },
        '1geki': { 1: 300 },
        'p-town-dmm': { 5: 290 },
      };
      expect(newItem(values)).toEqual(CONFIRMED_FULL);
    });

    it('全設定の出典は1つだけで、一部だけの出典と2つでは一致にしない（2サイト一致は全設定どうし）', () => {
      // 全設定のちょんぼりすたと、矛盾しない一部だけの2つ。読み直しが無いので暫定にもしない
      expect(newItem({ chonborista: FULL, 'nana-press': PART, '1geki': PART })).toEqual({
        outcome: 'candidate',
        reason: 'ちょんぼりすたの値だけで、読み直しが無いか一致しない',
      });
      expect(newItem({ 'nana-press': FULL, '1geki': PART })).toEqual({
        outcome: 'candidate',
        reason: '全設定がそろった出典が1つだけ（ちょんぼりすた以外）',
      });
    });
  });

  describe('ちょんぼりすたの暫定の新しい条件', () => {
    const reread = { reread: { ...FULL } };
    const PROVISIONAL = { outcome: 'adopt', status: 'provisional-chonborista', adopted: FULL };
    const AGAINST = { outcome: 'candidate', reason: 'ちょんぼりすたの値と矛盾する出典がある' };
    const NO_REREAD = {
      outcome: 'candidate',
      reason: 'ちょんぼりすたの値だけで、読み直しが無いか一致しない',
    };

    it('ちょんぼりすたが全設定・なな徹が矛盾しない一部だけ・読み直し一致 → provisional-chonborista', () => {
      const values = { chonborista: FULL, 'nana-press': PART };
      expect(newItem(values, reread)).toEqual(PROVISIONAL);
      expect(existingItem(values, reread)).toEqual(PROVISIONAL);
    });

    it('なな徹が矛盾する → candidate（既存の値では、今の値の裏づけが無ければ remove）', () => {
      const values = { chonborista: FULL, 'nana-press': CLASH };
      expect(newItem(values, reread)).toEqual(AGAINST);
      expect(existingItem(values, reread)).toEqual({
        outcome: 'remove',
        reason: '今の値を裏づける出典なし',
      });
    });

    it('矛盾しない一部だけの公式があっても暫定にできる。矛盾する一部だけの公式があればできない', () => {
      expect(newItem({ chonborista: FULL, 'maker-pdf': PART }, reread)).toEqual(PROVISIONAL);
      expect(newItem({ chonborista: FULL, 'maker-pdf': CLASH }, reread)).toEqual(AGAINST);
    });

    it('読み直しが無いか合わなければ暫定にしない', () => {
      const values = { chonborista: FULL, 'nana-press': PART };
      expect(newItem(values)).toEqual(NO_REREAD);
      expect(newItem(values, { reread: { ...FULL, 1: 300 } })).toEqual(NO_REREAD);
    });
  });
});

describe('decideNewItem: candidate の理由は、上から最初に当たったもの（2026-09-27）', () => {
  const FULL = { 1: 295.2, 2: 292.6, 5: 284.9, 6: 277.7 };
  /** 設定1で FULL と食い違う、全設定の値 */
  const OTHER = { ...FULL, 1: 300 };
  /** FULL と矛盾しない、一部だけの値 */
  const PART = { 1: 295.2, 6: 277.7 };
  const MISSING =
    '全設定の値がそろった出典が無い（アプリは設定が1つでも欠けた確率があると推定が止まる）';
  const CONFLICT = 'サイト間で食い違い';
  const AGAINST = 'ちょんぼりすたの値と矛盾する出典がある';
  const NO_REREAD = 'ちょんぼりすたの値だけで、読み直しが無いか一致しない';
  const SINGLE = '全設定がそろった出典が1つだけ（ちょんぼりすた以外）';
  const reasonOf = (values, extra = {}) =>
    decideNewItem({
      unit: DEN,
      values,
      sourceKinds: KINDS,
      settings: ['1', '2', '5', '6'],
      ...extra,
    });
  const candidate = (reason) => ({ outcome: 'candidate', reason });

  it('1. 出典なし', () => {
    expect(reasonOf({})).toEqual(candidate('出典なし'));
  });

  it('2. 全設定の値がそろった出典が無い（読み直しが合っても、公式でも）', () => {
    expect(reasonOf({ chonborista: PART, 'nana-press': { ...PART } }, { reread: PART })).toEqual(
      candidate(MISSING)
    );
    expect(reasonOf({ maker: PART })).toEqual(candidate(MISSING));
  });

  it('3. サイト間で食い違い（確定値を探して食い違った）。ちょんぼりすたの値と矛盾する出典があっても、こちらが先', () => {
    // 一部だけの公式が2サイト一致の値と矛盾する（公式が優先）。公式はちょんぼりすたの値とも矛盾する
    const values = { maker: { 1: 300, 6: 277.7 }, chonborista: FULL, 'nana-press': { ...FULL } };
    expect(reasonOf(values, { reread: FULL })).toEqual(candidate(CONFLICT));
    // 公式どうしの食い違い
    expect(reasonOf({ maker: FULL, 'maker-pdf': OTHER })).toEqual(candidate(CONFLICT));
  });

  it('4. ちょんぼりすたの値と矛盾する出典がある（全設定のちょんぼりすた。読み直しが合っても）', () => {
    expect(reasonOf({ chonborista: FULL, 'nana-press': OTHER }, { reread: FULL })).toEqual(
      candidate(AGAINST)
    );
    // 一部だけの出典が矛盾する（載っている設定1が合わない）
    expect(reasonOf({ chonborista: FULL, 'nana-press': { 1: 300 } })).toEqual(candidate(AGAINST));
  });

  it('5. ちょんぼりすたの値だけで、読み直しが無いか一致しない（ほかの出典はその値と矛盾しない）', () => {
    expect(reasonOf({ chonborista: FULL })).toEqual(candidate(NO_REREAD));
    expect(reasonOf({ chonborista: FULL }, { reread: OTHER })).toEqual(candidate(NO_REREAD));
    // 担当が挙げた例1: 矛盾しない一部だけの出典があり、読み直しが無い（前は「サイト間で食い違い」）
    expect(reasonOf({ chonborista: FULL, 'nana-press': PART })).toEqual(candidate(NO_REREAD));
  });

  it('6. 全設定がそろった出典が1つだけ（ちょんぼりすた以外）', () => {
    expect(reasonOf({ 'nana-press': FULL })).toEqual(candidate(SINGLE));
    // 担当が挙げた例2: 矛盾しない一部だけの出典がある（前は「サイト間で食い違い」）
    expect(reasonOf({ 'nana-press': FULL, 'p-town-dmm': PART })).toEqual(candidate(SINGLE));
    // 一部だけのちょんぼりすたがあっても（矛盾していても）、全設定の出典の数で決める
    expect(reasonOf({ 'nana-press': FULL, chonborista: { 1: 300 } })).toEqual(candidate(SINGLE));
  });

  it('7. サイト間で食い違い（全設定がそろった出典が2つ以上あるが、合う組が無い）', () => {
    expect(reasonOf({ 'nana-press': FULL, 'p-town-dmm': OTHER })).toEqual(candidate(CONFLICT));
    expect(reasonOf({ 'nana-press': FULL, 'p-town-dmm': OTHER, chonborista: PART })).toEqual(
      candidate(CONFLICT)
    );
  });

  it('設定の組・有無の項目: 2 は使わず、6 は段階0の文面（ちょんぼりすた以外の1サイトのみ）。ほかは同じ順', () => {
    // 値は設定ごとではないので、どれも「そろった」値として数える（数値の unit の 6 の文面は上のテスト）
    const ONLY_ONE_SITE = 'ちょんぼりすた以外の1サイトのみ';
    const gold = { confirmed: ['6'], excluded: ['1'] };
    const other = { confirmed: ['6'], excluded: [] };
    const settingsItem = (values, extra = {}) =>
      decideNewItem({ unit: 'settings', values, sourceKinds: KINDS, ...extra });
    const presenceItem = (values) =>
      decideNewItem({ unit: 'presence', values, sourceKinds: KINDS });
    expect(settingsItem({})).toEqual(candidate('出典なし'));
    expect(settingsItem({ maker: gold, 'maker-pdf': other })).toEqual(candidate(CONFLICT));
    expect(settingsItem({ chonborista: gold, 'nana-press': other })).toEqual(candidate(AGAINST));
    expect(settingsItem({ chonborista: gold })).toEqual(candidate(NO_REREAD));
    expect(settingsItem({ chonborista: gold }, { reread: other })).toEqual(candidate(NO_REREAD));
    expect(settingsItem({ 'nana-press': gold })).toEqual(candidate(ONLY_ONE_SITE));
    expect(
      settingsItem({ 'nana-press': gold, '1geki': { confirmed: ['5', '6'], excluded: [] } })
    ).toEqual(candidate(CONFLICT));
    expect(presenceItem({ chonborista: true })).toEqual(candidate(NO_REREAD));
    expect(presenceItem({ 'nana-press': true })).toEqual(candidate(ONLY_ONE_SITE));
  });
});

describe('幅の重なりは推移しない: 採用値は優先順の最初に条件を満たす値で決まる（2026-09-27）', () => {
  // 設定1だけの機種。A と B、B と C、C と E は幅が重なり、A と C、B と E は重ならない（仕様 5.5）
  const A = { 1: 295.2 }; // 295.15〜295.25
  const B = { 1: 295.25 }; // 295.245〜295.255
  const C = { 1: 295.26 }; // 295.255〜295.265
  const E = { 1: 295.265 }; // 295.2645〜295.2655
  const run = (values) => decideNewItem({ unit: DEN, values, sourceKinds: KINDS, settings: ['1'] });

  it('A が先: A と合う B で A を採るが、A と矛盾して互いに合う C・E があるので食い違い', () => {
    expect(run({ 'nana-press': A, '1geki': B, 'p-town-dmm': C, slopachi: E })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('B が先: B と合う A・C で B を採り、B と矛盾するのは E だけなので confirmed（295.25）', () => {
    expect(run({ '1geki': B, 'nana-press': A, 'p-town-dmm': C, slopachi: E })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: B,
    });
  });
});
