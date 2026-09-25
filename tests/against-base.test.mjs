import { describe, it, expect } from 'vitest';
import { runAgainstBase } from '../scripts/lib/against-base.mjs';

const entry = {
  id: 'test-machine',
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  file: 'test/test-machine.json',
};
const role = (displayOrder, probability) => ({
  name: 'BIG',
  probabilities: { 1: probability },
  hasSettingDiff: false,
  displayOrder,
});
const files = (roles) => ({
  'machines/index.json': JSON.stringify({
    version: '3.8.0',
    updatedAt: '2026-09-26',
    machines: [entry],
  }),
  'machines/test/test-machine.json': JSON.stringify({ name: 'テスト機種', type: 'AT', roles }),
});
const reader = (map) => (path) => {
  if (!(path in map)) throw new Error(`no such file: ${path}`);
  return map[path];
};
const run = (base, head, provenanceFiles = []) =>
  runAgainstBase({
    base: 'origin/main',
    readBase: reader(base),
    readHead: reader(head),
    loadProvenance: () => provenanceFiles,
  });

describe('runAgainstBase', () => {
  it('問題が無ければ終了コード 0', () => {
    const map = files([role(1, 0.00338753)]);
    expect(run(map, map)).toEqual({
      code: 0,
      lines: [
        '問題なし: 既存の ID は基準と同じで、出典記録は基準の値に照らして採否ルールどおりです',
      ],
    });
  });

  it('ID の検査と採否ルールの検査の問題をまとめて、終了コード 1', () => {
    const kept = {
      kind: 'role',
      name: 'BIG',
      unit: 'denominator',
      status: 'kept-single-source',
      values: { 'nana-press': { 1: 295.2 } },
      adopted: { 1: 1 / 0.00338753 },
    };
    const provenanceFiles = [{ data: { machineId: 'test-machine', items: [kept] } }];
    const head = files([role(2, 0.00338639)]);
    expect(run(files([role(1, 0.00338753)]), head, provenanceFiles)).toEqual({
      code: 1,
      lines: [
        '問題: 2件',
        '  ERROR test-machine: role::BIG: ID が変わった（big_1 → big_2）',
        '  ERROR test-machine: role::BIG: kept-single-source の値が main から変わった',
      ],
    });
  });

  it('基準を読めなければ終了コード 2', () => {
    expect(run({}, files([role(1, 0.00338753)]))).toEqual({
      code: 2,
      lines: ['比べられませんでした（基準: origin/main）: no such file: machines/index.json'],
    });
  });
});
