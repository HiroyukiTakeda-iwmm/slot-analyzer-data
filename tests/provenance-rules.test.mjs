import { describe, it, expect } from 'vitest';
import {
  decideExistingItem,
  decideNewItem,
  preferenceOrder,
  statusError,
} from '../scripts/lib/provenance.mjs';

const DEN = 'denominator';
const KINDS = {
  chonborista: 'analysis-site',
  'nana-press': 'analysis-site',
  '1geki': 'analysis-site',
  'p-town-dmm': 'analysis-site',
  maker: 'official',
};

describe('preferenceOrder', () => {
  it('公式 → ちょんぼりすた → 記録順', () => {
    const values = { 'nana-press': {}, chonborista: {}, '1geki': {}, maker: {} };
    expect(preferenceOrder(values, KINDS)).toEqual(['maker', 'chonborista', 'nana-press', '1geki']);
  });
});

describe('decideNewItem（新しく入れる値）', () => {
  it('2サイトで一致 → confirmed。採用値はちょんぼりすた', () => {
    const values = { 'nana-press': { 1: 295.24 }, chonborista: { 1: 295.2 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('公式があれば、ほかと食い違っても公式の値で confirmed', () => {
    const values = { chonborista: { 1: 300 }, maker: { 1: 295.2 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'adopt',
      status: 'confirmed',
      adopted: { 1: 295.2 },
    });
  });

  it('ちょんぼりすただけ＋読み直しが一致 → provisional-chonborista', () => {
    const values = { chonborista: { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread: { 1: 8192 } })).toEqual({
      outcome: 'adopt',
      status: 'provisional-chonborista',
      adopted: { 1: 8192 },
    });
  });

  it('ちょんぼりすただけで、読み直しが無い・一致しない → candidate', () => {
    const values = { chonborista: { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS }).outcome).toBe('candidate');
    expect(
      decideNewItem({ unit: DEN, values, sourceKinds: KINDS, reread: { 1: 4096 } }).outcome
    ).toBe('candidate');
  });

  it('ちょんぼりすた以外の1サイトだけ → candidate', () => {
    const values = { 'nana-press': { 1: 8192 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: 'ちょんぼりすた以外の1サイトのみ',
    });
  });

  it('2サイトが食い違う → candidate', () => {
    const values = { chonborista: { 1: 300 }, 'nana-press': { 1: 400 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
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
    expect(decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('出典なし → candidate', () => {
    expect(decideNewItem({ unit: DEN, values: {}, sourceKinds: KINDS })).toEqual({
      outcome: 'candidate',
      reason: '出典なし',
    });
  });

  it('公式が2つあって食い違う → candidate', () => {
    const kinds = { ...KINDS, 'maker-site': 'official' };
    const values = { maker: { 1: 295.2 }, 'maker-site': { 1: 300 } };
    expect(decideNewItem({ unit: DEN, values, sourceKinds: kinds })).toEqual({
      outcome: 'candidate',
      reason: 'サイト間で食い違い',
    });
  });

  it('形が unit に合わない値は例外にする', () => {
    const values = { maker: { 1: 0.5 } };
    expect(() => decideNewItem({ unit: DEN, values, sourceKinds: KINDS })).toThrow('形に合わない');
  });
});

describe('decideExistingItem（既存の値の見直し）', () => {
  it('2サイトで一致した値が今の値と違えば、その値へ直す', () => {
    const values = { chonborista: { 1: 295.2 }, 'nana-press': { 1: 295.24 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: { 1: 295.2 } });
  });

  it('今の値を1サイトだけが裏づける → kept-single-source', () => {
    const values = { 'nana-press': { 1: 295.2 }, '1geki': { 1: 310 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 295.2 } })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 295.2 } });
  });

  it('食い違いがあっても今の値に裏づけがあれば残す', () => {
    const values = {
      chonborista: { 1: 300 },
      'nana-press': { 1: 300 },
      '1geki': { 1: 400 },
      'p-town-dmm': { 1: 400 },
    };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: { 1: 300 } });
  });

  it('裏づけが無く、ちょんぼりすただけが別の値＋読み直し一致 → provisional-chonborista', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({
        unit: DEN,
        values,
        sourceKinds: KINDS,
        current: { 1: 300 },
        reread: { 1: 295.2 },
      })
    ).toEqual({ outcome: 'adopt', status: 'provisional-chonborista', adopted: { 1: 295.2 } });
  });

  it('裏づけが無く、読み直しも無い → remove', () => {
    const values = { chonborista: { 1: 295.2 } };
    expect(
      decideExistingItem({ unit: DEN, values, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'remove', reason: '今の値を裏づける出典なし' });
  });

  it('出典なし → remove', () => {
    expect(
      decideExistingItem({ unit: DEN, values: {}, sourceKinds: KINDS, current: { 1: 300 } })
    ).toEqual({ outcome: 'remove', reason: '出典なし' });
  });

  it('presence: 2サイトに載っていれば confirmed', () => {
    const values = { chonborista: true, 'nana-press': true };
    expect(
      decideExistingItem({ unit: 'presence', values, sourceKinds: KINDS, current: true })
    ).toEqual({ outcome: 'adopt', status: 'confirmed', adopted: true });
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

  it('kept-single-source: 一致が1つ → null、0 → エラー', () => {
    const one = { '1geki': { 1: 295.2 } };
    const none = { '1geki': { 1: 310 } };
    expect(statusError(item({ status: 'kept-single-source', values: one }), KINDS)).toBeNull();
    expect(statusError(item({ status: 'kept-single-source', values: none }), KINDS)).toContain(
      'kept-single-source には'
    );
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
    expect(statusError(item({ status: 'kept-single-source', values }), KINDS)).toContain(
      'confirmed にする'
    );
  });

  it('未知の status → エラー', () => {
    expect(statusError(item({ status: 'guess', values: {} }), KINDS)).toContain('未知の status');
  });
});
