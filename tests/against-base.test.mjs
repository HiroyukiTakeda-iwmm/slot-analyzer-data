import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listGitFiles, runAgainstBase } from '../scripts/lib/against-base.mjs';
import { toStoredProbability } from '../scripts/lib/provenance.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
const lister = (map) => (dir) => Object.keys(map).filter((path) => path.startsWith(`${dir}/`));
const run = (base, head, provenanceFiles = []) =>
  runAgainstBase({
    base: 'origin/main',
    readBase: reader(base),
    readHead: reader(head),
    listBase: lister(base),
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

  it('名前に「::」を含む項目があれば終了コード 2', () => {
    const head = files([{ ...role(1, 0.00338753), name: '強::弱' }]);
    expect(run(files([role(1, 0.00338753)]), head)).toEqual({
      code: 2,
      lines: [
        '比べられませんでした（基準: origin/main）: 項目の名前に「::」は使えない: role 強::弱',
      ],
    });
  });

  it('ID を持たない項目の削除と、新しい機種の出典記録の無さもまとめて、終了コード 1', () => {
    const added = { ...entry, id: 'new-machine', file: 'test/new-machine.json' };
    const machine = (fields) =>
      JSON.stringify({ name: 'テスト機種', type: 'AT', roles: [role(1, 0.00338753)], ...fields });
    const index = (machines) =>
      JSON.stringify({ version: '3.8.0', updatedAt: '2026-09-26', machines });
    const base = {
      'machines/index.json': index([entry]),
      'machines/test/test-machine.json': machine({
        confirmationEvents: [{ name: '金トロフィー', confirmedSettings: ['6'] }],
      }),
    };
    const head = {
      'machines/index.json': index([entry, added]),
      'machines/test/test-machine.json': machine({}),
      'machines/test/new-machine.json': machine({}),
    };
    expect(run(base, head)).toEqual({
      code: 1,
      lines: [
        '問題: 2件',
        '  ERROR test-machine: confirmationEvent::金トロフィー: 項目が消えたのに、出典記録の removed に無い',
        '  ERROR new-machine: 新しく足した機種に出典記録（provenance/new-machine.json）が無い',
      ],
    });
  });
  it('main の記録の retiredIds（外した ID の台帳）を消せば、終了コード 1', () => {
    const map = files([role(1, 0.00338753)]);
    const retired = { kind: 'role', name: '強', appId: 'role_2' };
    const base = {
      ...map,
      'provenance/test-machine.json': JSON.stringify({
        machineId: 'test-machine',
        removed: [],
        retiredIds: [retired],
      }),
    };
    const provenanceFiles = [{ data: { machineId: 'test-machine', removed: [], retiredIds: [] } }];
    expect(run(base, map, provenanceFiles)).toEqual({
      code: 1,
      lines: [
        '問題: 1件',
        '  ERROR test-machine: role::強（role_2）: main の記録の retiredIds を消している（外した ID の台帳は消さない）',
      ],
    });
  });

  it('main の記録を読めなければ終了コード 2', () => {
    const map = files([role(1, 0.00338753)]);
    const result = run({ ...map, 'provenance/test-machine.json': '{' }, map);
    expect(result.code).toBe(2);
    expect(result.lines[0]).toContain('比べられませんでした（基準: origin/main）');
  });
});

describe('PR を続けて流す（validate と check:base）', () => {
  const machineEntry = (id) => ({
    id,
    name: id,
    type: 'AT',
    author: 'コミュニティ',
    version: '1.0',
    file: `test/${id}.json`,
  });
  /** 機種（機種 ID → 機種ファイルの中身）と出典記録からリポジトリを作る */
  const repo = (machines, records = []) => ({
    'machines/index.json': JSON.stringify({
      version: '3.8.0',
      updatedAt: '2026-09-26',
      machines: Object.keys(machines).map(machineEntry),
    }),
    ...Object.fromEntries(
      Object.entries(machines).map(([id, machine]) => [
        `machines/test/${id}.json`,
        JSON.stringify(machine),
      ])
    ),
    ...Object.fromEntries(
      records.map((record) => [`provenance/${record.machineId}.json`, JSON.stringify(record)])
    ),
  });
  /** PR の問題（validate のエラーと check:base の問題） */
  const problemsOf = (base, head) => {
    const index = JSON.parse(head['machines/index.json']);
    const machineFiles = index.machines.map((e) => ({
      path: `machines/${e.file}`,
      data: JSON.parse(head[`machines/${e.file}`]),
    }));
    const provenanceFiles = Object.keys(head)
      .filter((path) => path.startsWith('provenance/'))
      .map((path) => ({ path, data: JSON.parse(head[path]) }));
    const validated = validateProvenance(machineFiles, index, provenanceFiles, {
      officialDomains: [],
    });
    const againstBase = runAgainstBase({
      base: 'main',
      readBase: reader(base),
      readHead: reader(head),
      listBase: lister(base),
      loadProvenance: () => provenanceFiles,
    });
    return [
      ...validated.errors.map((e) => e.message),
      ...(againstBase.code === 0 ? [] : againstBase.lines),
    ];
  };
  const source = (key, url) => ({ key, kind: 'analysis-site', url, retrievedAt: '2026-09-29' });
  const sources = [
    source('chonborista', 'https://chonborista.com/1'),
    source('site-a', 'https://site-a.com/1'),
    source('site-b', 'https://site-b.com/1'),
  ];
  const recordOf = (machineId, items, removed = [], retiredIds = []) => ({
    machineId,
    machineFile: `test/${machineId}.json`,
    reviewedAt: '2026-09-29',
    sources,
    items,
    candidates: [],
    removed,
    retiredIds,
  });
  const bigRole = (probability) => ({
    name: 'BIG',
    probabilities: { 1: probability },
    hasSettingDiff: false,
    displayOrder: 1,
  });

  it('暫定の値を入れた PR（バッチ1）をマージした後、関係ない PR（バッチ2）が止まらない', () => {
    // バッチ1: main の 1/300 を、裏づける出典が無いので、ちょんぼりすたの 1/295.2 で暫定にする（規則3）
    const main0 = repo({ 'machine-a': { name: 'A', roles: [bigRole(toStoredProbability(300))] } });
    const chonborista = { 1: 295.2 };
    const provisionalBig = {
      kind: 'role',
      name: 'BIG',
      status: 'provisional-chonborista',
      unit: 'denominator',
      values: { chonborista },
      adopted: chonborista,
      reread: { by: 'verifier', value: chonborista },
    };
    const machineA = { name: 'A', roles: [bigRole(toStoredProbability(295.2))] };
    const main1 = repo({ 'machine-a': machineA }, [recordOf('machine-a', [provisionalBig])]);
    expect(problemsOf(main0, main1)).toEqual([]);

    // バッチ2: 別の機種を足す（machine-a の記録と値は変えない）
    const confirmedBig = {
      kind: 'role',
      name: 'BIG',
      status: 'confirmed',
      unit: 'denominator',
      values: { 'site-a': { 1: 300 }, 'site-b': { 1: 300 } },
      adopted: { 1: 300 },
    };
    const pr2 = repo(
      {
        'machine-a': machineA,
        'machine-b': { name: 'B', roles: [bigRole(toStoredProbability(300))] },
      },
      [recordOf('machine-a', [provisionalBig]), recordOf('machine-b', [confirmedBig])]
    );
    expect(problemsOf(main1, pr2)).toEqual([]);

    // 記録を変えずに machine-a の値だけ変えると止まる（check:base は確かめ直す）
    const changed = repo(
      { 'machine-a': { name: 'A', roles: [bigRole(toStoredProbability(290))] } },
      [recordOf('machine-a', [provisionalBig])]
    );
    expect(problemsOf(main1, changed)).toContain(
      '  ERROR machine-a: role::BIG: main の値を裏づける出典がある（規則2の kept-single-source にする）'
    );
  });

  describe('patterns を書き直した PR で、書き直した終了画面を見直す（bakemonogatari の形）', () => {
    const parent = {
      name: 'AT終了画面',
      patterns: [
        { name: '初代パネル（暦・忍・忍野）', minSetting: 4, description: '設定4以上濃厚' },
        { name: 'ヒロイン集合（初代パネル）', minSetting: 5, description: '設定5以上濃厚' },
        { name: 'I LOVE YOU', minSetting: 6, description: '設定6濃厚' },
      ],
      id: 'AT終了画面',
      type: 'at_end',
      hint: '設定示唆',
      color: '#78909C',
    };
    const trophy = {
      id: 'サミートロフィー銅',
      name: 'サミートロフィー銅',
      type: 'at_end',
      hint: '設定2以上濃厚',
      color: '#CD7F32',
    };
    /** 書き直した後の終了画面（expand-patterns --write が書く形） */
    const rewritten = (index, name, hint, confirmedSettings) => ({
      id: `AT終了画面_${index}`,
      name,
      type: 'at_end',
      hint,
      confirmedSettings,
      color: '#78909C',
    });
    const shodai = rewritten(1, '初代パネル（暦・忍・忍野）', '設定4以上濃厚', ['4', '5', '6']);
    const heroine = rewritten(2, 'ヒロイン集合（初代パネル）', '設定5以上濃厚', ['5', '6']);
    const iLoveYou = rewritten(3, 'I LOVE YOU', '設定6濃厚', ['6']);
    const main0 = repo({ bakemonogatari: { name: '化物語', endScreens: [parent, trophy] } });
    const settingsOf = (confirmed) => ({ confirmed, excluded: [] });
    const items = [
      {
        kind: 'endScreen',
        name: 'ヒロイン集合（初代パネル）',
        status: 'kept-single-source',
        unit: 'settings',
        values: { 'site-a': settingsOf(['5', '6']) },
        adopted: settingsOf(['5', '6']),
      },
      {
        kind: 'endScreen',
        name: 'I LOVE YOU',
        status: 'confirmed',
        unit: 'settings',
        values: { 'site-a': settingsOf(['6']), 'site-b': settingsOf(['6']) },
        adopted: settingsOf(['6']),
      },
      {
        kind: 'endScreen',
        name: 'サミートロフィー銅',
        status: 'confirmed',
        unit: 'presence',
        values: { 'site-a': true, 'site-b': true },
        adopted: true,
      },
    ];
    const removedShodai = {
      kind: 'endScreen',
      name: '初代パネル（暦・忍・忍野）',
      unit: 'settings',
      previous: shodai,
      values: {},
      appId: 'AT終了画面_1',
      reason: '出典なし',
    };
    const retired = [
      { kind: 'endScreen', name: '初代パネル（暦・忍・忍野）', appId: 'AT終了画面_1' },
    ];

    it('書き直した画面を外し（1）、1サイトだけの画面を kept-single-source で残す（2）PR が通る', () => {
      const pr = repo(
        { bakemonogatari: { name: '化物語', endScreens: [heroine, iLoveYou, trophy] } },
        [recordOf('bakemonogatari', items, [removedShodai], retired)]
      );
      expect(problemsOf(main0, pr)).toEqual([]);
    });

    it('書き直さずに親ごと外すと止まる（親は main の項目に無い。アプリは親を読まない）', () => {
      const removedParent = {
        kind: 'endScreen',
        name: 'AT終了画面',
        unit: 'settings',
        previous: parent,
        values: {},
        appId: 'AT終了画面',
        reason: '出典なし',
      };
      const pr = repo({ bakemonogatari: { name: '化物語', endScreens: [trophy] } }, [
        recordOf(
          'bakemonogatari',
          [items[2]],
          [removedParent],
          [{ kind: 'endScreen', name: 'AT終了画面', appId: 'AT終了画面' }]
        ),
      ]);
      expect(problemsOf(main0, pr)).toContain(
        '  ERROR bakemonogatari: endScreen::AT終了画面: removed の項目が main の機種ファイルに無い'
      );
    });
  });
});

describe('listGitFiles', () => {
  it('git の参照で、フォルダ直下のファイルのパスを並べる（フォルダが無ければ空）', () => {
    const paths = listGitFiles('HEAD', 'schemas', ROOT);
    expect(paths).toContain('schemas/provenance.schema.json');
    expect(paths).toContain('schemas/machine.schema.json');
    expect(paths.every((path) => path.startsWith('schemas/'))).toBe(true);
    expect(listGitFiles('HEAD', 'no-such-dir', ROOT)).toEqual([]);
  });

  it('フォルダの中のフォルダは並べない', () => {
    const paths = listGitFiles('HEAD', 'tests', ROOT);
    expect(paths).toContain('tests/against-base.test.mjs');
    expect(paths).not.toContain('tests/fixtures');
  });

  it('読めない参照では例外を投げる（CLI は終了コード 2 にする）', () => {
    expect(() => listGitFiles('no-such-ref', 'schemas', ROOT)).toThrow();
  });
});
