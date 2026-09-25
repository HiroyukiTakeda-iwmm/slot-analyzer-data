import { describe, it, expect } from 'vitest';
import { checkRulesAgainstBase } from '../scripts/lib/rules-against-base.mjs';

const entry = {
  id: 'test-machine',
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  file: 'test/test-machine.json',
};
const indexJson = (machines) =>
  JSON.stringify({ version: '3.8.0', updatedAt: '2026-09-26T00:00:00Z', machines });
const big = (probability) => ({
  name: 'BIG',
  probabilities: { 1: probability },
  hasSettingDiff: false,
  displayOrder: 1,
});
const files = (roles, machines = [entry]) => ({
  'machines/index.json': indexJson(machines),
  'machines/test/test-machine.json': JSON.stringify({
    name: 'テスト機種',
    type: 'AT',
    author: 'コミュニティ',
    version: '1.0',
    lastUpdated: '2026-09-26',
    roles,
  }),
});
const reader = (map) => (path) => {
  if (!(path in map)) throw new Error(`no such file: ${path}`);
  return map[path];
};

// kept-single-source の採用値は、今の機種ファイルの値を unit の形にしたもの（1 ÷ 確率）そのもの
const kept = (adopted = { 1: 1 / 0.00338753 }) => ({
  kind: 'role',
  name: 'BIG',
  unit: 'denominator',
  status: 'kept-single-source',
  values: { 'nana-press': { 1: 295.2 } },
  adopted,
});
const provisional = (chonborista) => ({
  kind: 'role',
  name: 'BIG',
  unit: 'denominator',
  status: 'provisional-chonborista',
  values: { chonborista },
  adopted: chonborista,
  reread: { by: 'verifier', value: chonborista },
});
const recordsOf = (...items) => [{ data: { machineId: 'test-machine', items } }];
const run = (base, head, provenanceFiles) =>
  checkRulesAgainstBase({ readBase: reader(base), readHead: reader(head), provenanceFiles });

describe('checkRulesAgainstBase: kept-single-source', () => {
  it('採用値と機種ファイルの値が main の値そのものなら問題なし', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(kept()))).toEqual([]);
  });

  it('機種ファイルの値が main から変わったら、一致の条件の範囲でも報告する', () => {
    // 1/295.2 → 1/295.3 は 5.4 の一致の条件（0.1% 以内）に入るが、残す値は変えない
    expect(run(files([big(0.00338753)]), files([big(0.00338639)]), recordsOf(kept()))).toEqual([
      'test-machine: role::BIG: kept-single-source の値が main から変わった',
    ]);
  });

  it('採用値が main の値そのものでなければ、一致の条件の範囲でも報告する', () => {
    // 許容差による一致は推移しない。間の値を採用値に書くと、今の値を裏づけない出典でも通ってしまう
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(kept({ 1: 295.35 })))).toEqual([
      'test-machine: role::BIG: kept-single-source の採用値が main の値そのものでない',
    ]);
  });

  it('main に無い項目・機種に使ったら報告する', () => {
    const expected = ['test-machine: role::BIG: main に無い項目に kept-single-source を使っている'];
    expect(run(files([]), files([big(0.00338753)]), recordsOf(kept()))).toEqual(expected);
    const base = { 'machines/index.json': indexJson([]) };
    expect(run(base, files([big(0.00338753)]), recordsOf(kept()))).toEqual(expected);
  });

  it('機種ファイルに無い項目に使ったら報告する（index.json から外した機種も）', () => {
    const map = files([big(0.00338753)]);
    const expected = ['test-machine: role::BIG: kept-single-source の項目が機種ファイルに無い'];
    expect(run(map, files([]), recordsOf(kept()))).toEqual(expected);
    expect(run(map, files([big(0.00338753)], []), recordsOf(kept()))).toEqual(expected);
  });
});

describe('checkRulesAgainstBase: provisional-chonborista', () => {
  it('main にある項目で、ちょんぼりすたの値が main の値と一致しないなら問題なし（規則3）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(provisional({ 1: 300 })))).toEqual([]);
  });

  it('main にある項目で、ちょんぼりすたの値が main の値と一致するなら報告する（規則2）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(provisional({ 1: 295.2 })))).toEqual([
      'test-machine: role::BIG: ちょんぼりすたの値が main の値と一致する（規則2の kept-single-source にする）',
    ]);
  });

  it('main に無い項目（新しく入れる値）は、main の値と比べない', () => {
    const base = { 'machines/index.json': indexJson([]) };
    expect(run(base, files([big(0.00338753)]), recordsOf(provisional({ 1: 295.2 })))).toEqual([]);
  });
});

describe('checkRulesAgainstBase: そのほか', () => {
  it('kept-single-source と provisional-chonborista の無い記録では、main の機種ファイルを読まない', () => {
    const base = { 'machines/index.json': indexJson([entry]) };
    const confirmed = { ...kept(), status: 'confirmed' };
    expect(run(base, files([big(0.00338753)]), recordsOf(confirmed))).toEqual([]);
  });

  it('読めなかった記録は飛ばす（validate が報告する）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, [{ data: null }])).toEqual([]);
  });

  it('main の機種ファイルを読めなければ例外を投げる（CLI は終了コード 2 にする）', () => {
    const base = { 'machines/index.json': indexJson([entry]) };
    expect(() => run(base, files([big(0.00338753)]), recordsOf(kept()))).toThrow('no such file');
  });
});
