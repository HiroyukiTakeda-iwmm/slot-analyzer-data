import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listGitFiles, runAgainstBase } from '../scripts/lib/against-base.mjs';
import { toStoredProbability } from '../scripts/lib/provenance.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** main のスキーマ（main の記録は main のスキーマで確かめる。ここでは今のスキーマを main に置く） */
const PROVENANCE_SCHEMA = readFileSync(resolve(ROOT, 'schemas/provenance.schema.json'), 'utf-8');
/** main のスキーマと main の index.json（test-machine だけ）に合う出典記録 */
const validRecord = (overrides = {}) => ({
  machineId: 'test-machine',
  machineFile: 'test/test-machine.json',
  reviewedAt: '2026-09-27',
  sources: [
    {
      key: 'site-a',
      kind: 'analysis-site',
      url: 'https://site-a.com/1',
      retrievedAt: '2026-09-27',
    },
  ],
  items: [],
  candidates: [],
  removed: [],
  retiredIds: [],
  ...overrides,
});
/** オブジェクトから欄を1つ除く */
const omit = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

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
      'schemas/provenance.schema.json': PROVENANCE_SCHEMA,
      'provenance/test-machine.json': JSON.stringify(validRecord({ retiredIds: [retired] })),
    };
    const provenanceFiles = [
      {
        path: 'provenance/test-machine.json',
        data: { machineId: 'test-machine', removed: [], retiredIds: [] },
      },
    ];
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

describe('runAgainstBase: main の出典記録を、main のスキーマと main の index.json で確かめる', () => {
  const map = files([role(1, 0.00338753)]);
  const RECORD = 'provenance/test-machine.json';
  /** main に記録を1つ置く（schema が null なら main にスキーマを置かない） */
  const mainWith = (path, text, schema = PROVENANCE_SCHEMA) => ({
    ...map,
    ...(schema === null ? {} : { 'schemas/provenance.schema.json': schema }),
    'provenance/README.md': '# provenance',
    [path]: text,
  });

  /** 比べる側にも同じ記録を残す（main に記録がある機種の記録を消すと止まるため） */
  const kept = (record = validRecord()) => [{ path: RECORD, data: record }];

  it('main の記録が main のスキーマ・index と合えば比べる（終了コード 0）', () => {
    expect(run(mainWith(RECORD, JSON.stringify(validRecord())), map, kept()).code).toBe(0);
  });

  it.each([
    ['null', RECORD, 'null', 'スキーマ違反 / must be object'],
    ['配列', RECORD, '[]', 'スキーマ違反 / must be object'],
    ['空のオブジェクト', RECORD, '{}', "スキーマ違反 / must have required property 'machineId'"],
    ['false', RECORD, 'false', 'スキーマ違反 / must be object'],
    [
      'machineId だけ',
      RECORD,
      '{"machineId":"x"}',
      "スキーマ違反 / must have required property 'machineFile'",
    ],
    [
      '必須欄の欠け',
      RECORD,
      JSON.stringify(omit(validRecord(), 'sources')),
      "スキーマ違反 / must have required property 'sources'",
    ],
    [
      '欄の中身の誤り',
      RECORD,
      JSON.stringify(validRecord({ retiredIds: [{ kind: 'role', name: '強' }] })),
      "スキーマ違反 /retiredIds/0 must have required property 'appId'",
    ],
    [
      'machineFile が main の index と違う',
      RECORD,
      JSON.stringify(validRecord({ machineFile: 'test/other.json' })),
      'machineFile が main の index.json と違う: test/other.json（index: test/test-machine.json）',
    ],
    [
      'machineId が main の index に無い',
      'provenance/ghost.json',
      JSON.stringify(validRecord({ machineId: 'ghost' })),
      'main の index.json に無い機種ID: ghost',
    ],
    [
      'ファイル名と machineId が違う',
      'provenance/other-name.json',
      JSON.stringify(validRecord()),
      'ファイル名は provenance/test-machine.json にする',
    ],
  ])('%s なら、終了コード 2（記録のパスと理由を出す）', (_label, path, text, reason) => {
    const result = run(mainWith(path, text), map);
    expect(result.code).toBe(2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toContain(`main の出典記録が不正: ${path}: `);
    expect(result.lines[0]).toContain(reason);
  });

  it('main に記録があるのに main のスキーマが無ければ、終了コード 2', () => {
    const result = run(mainWith(RECORD, JSON.stringify(validRecord()), null), map);
    expect(result.code).toBe(2);
    expect(result.lines[0]).toContain(
      `main のスキーマ（schemas/provenance.schema.json）を読めない（記録: ${RECORD}）`
    );
  });

  it('main の記録は main のスキーマで確かめる（比べる側のスキーマではない）', () => {
    const schema = JSON.parse(PROVENANCE_SCHEMA);
    // main のスキーマでは candidates が要らない: main の決まりで正しかった記録は通す
    const looser = { ...schema, required: schema.required.filter((key) => key !== 'candidates') };
    const noCandidates = JSON.stringify(omit(validRecord(), 'candidates'));
    expect(
      run(
        mainWith(RECORD, noCandidates, JSON.stringify(looser)),
        map,
        kept(JSON.parse(noCandidates))
      ).code
    ).toBe(0);
    // main のスキーマで note が要る: 比べる側のスキーマに合う記録でも、main の決まりに合わなければ止める
    const stricter = {
      ...schema,
      required: [...schema.required, 'note'],
      properties: { ...schema.properties, note: { type: 'string' } },
    };
    const result = run(
      mainWith(RECORD, JSON.stringify(validRecord()), JSON.stringify(stricter)),
      map
    );
    expect(result.code).toBe(2);
    expect(result.lines[0]).toContain("must have required property 'note'");
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
    'schemas/provenance.schema.json': PROVENANCE_SCHEMA,
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

  // バッチ1: main の 1/300 を、裏づける出典が無いので、ちょんぼりすたの 1/295.2 で暫定にする（規則3）
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
  const main1 = () => repo({ 'machine-a': machineA }, [recordOf('machine-a', [provisionalBig])]);
  // バッチ2: 別の機種を足す（machine-a の記録と値は変えない）
  const confirmedBig = {
    kind: 'role',
    name: 'BIG',
    status: 'confirmed',
    unit: 'denominator',
    values: { 'site-a': { 1: 300 }, 'site-b': { 1: 300 } },
    adopted: { 1: 300 },
  };
  const pr2 = () =>
    repo(
      {
        'machine-a': machineA,
        'machine-b': { name: 'B', roles: [bigRole(toStoredProbability(300))] },
      },
      [recordOf('machine-a', [provisionalBig]), recordOf('machine-b', [confirmedBig])]
    );

  it('暫定の値を入れた PR（バッチ1）をマージした後、関係ない PR（バッチ2）が止まらない', () => {
    const main0 = repo({ 'machine-a': { name: 'A', roles: [bigRole(toStoredProbability(300))] } });
    expect(problemsOf(main0, main1())).toEqual([]);
    expect(problemsOf(main1(), pr2())).toEqual([]);

    // 記録を変えずに machine-a の値だけ変えると止まる（check:base は確かめ直し、原因を1件だけ出す）
    const changed = repo(
      { 'machine-a': { name: 'A', roles: [bigRole(toStoredProbability(290))] } },
      [recordOf('machine-a', [provisionalBig])]
    );
    const problems = problemsOf(main1(), changed);
    expect(problems).toContain(
      '  ERROR machine-a: role::BIG: 記録を変えずに機種ファイルの値を main から変えている（記録も作り直すか、値を main に戻す）'
    );
    expect(problems.filter((line) => line.startsWith('  ERROR'))).toHaveLength(1);
  });

  it('バッチ2の後、記録を消して暫定の役の確率を変える PR は止まる（validate は通る）', () => {
    // 最終レビュー3 の I1 の再現: 記録を消すと、validate も採否ルールの検査も machine-a を見なくなる
    const deletedLine =
      '  ERROR machine-a: main に出典記録がある機種の記録を消している（記録がある機種では記録も直す）';
    const machineB = { name: 'B', roles: [bigRole(toStoredProbability(300))] };
    const dropped = repo(
      {
        'machine-a': { name: 'A', roles: [bigRole(toStoredProbability(295.2 / 1.05))] },
        'machine-b': machineB,
      },
      [recordOf('machine-b', [confirmedBig])]
    );
    expect(problemsOf(pr2(), dropped)).toEqual(['問題: 1件', deletedLine]);

    // 機種ごと index.json から消すなら、この文面は出ない（ID の検査が消えた項目を報告する）
    const machineRemoved = repo({ 'machine-b': machineB }, [recordOf('machine-b', [confirmedBig])]);
    const problems = problemsOf(pr2(), machineRemoved);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems).not.toContain(deletedLine);
  });

  it('比べる側が validate を通っても、main の記録だけが不正なら比べられない（マージ済みとして飛ばさない）', () => {
    const path = 'provenance/machine-a.json';
    // 必須欄を欠いた記録（項目は比べる側と同じ）・machineFile が main の index.json と違う記録
    const lacking = { machineId: 'machine-a', items: [provisionalBig] };
    const wrongFile = {
      ...recordOf('machine-a', [provisionalBig]),
      machineFile: 'test/machine-b.json',
    };
    for (const record of [lacking, wrongFile]) {
      const problems = problemsOf({ ...main1(), [path]: JSON.stringify(record) }, pr2());
      // validate のエラーは無く、check:base の「比べられない」1行だけ
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain(
        `比べられませんでした（基準: main）: main の出典記録が不正: ${path}: `
      );
    }
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
