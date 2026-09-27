import { describe, it, expect } from 'vitest';
import { checkLedgerAgainstBase } from '../scripts/lib/ledger-against-base.mjs';
import { runAgainstBase } from '../scripts/lib/against-base.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';

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
const reader = (map) => (path) => {
  if (!(path in map)) throw new Error(`no such file: ${path}`);
  return map[path];
};
const lister = (map) => (dir) => Object.keys(map).filter((path) => path.startsWith(`${dir}/`));
const role = (name, displayOrder, extra = {}) => ({
  name,
  probabilities: { 1: 0.01 },
  hasSettingDiff: false,
  displayOrder,
  ...extra,
});
const machineMap = (roles, fields = {}, machines = [entry]) => ({
  'machines/index.json': indexJson(machines),
  'machines/test/test-machine.json': JSON.stringify({
    name: 'テスト機種',
    type: 'AT',
    roles,
    ...fields,
  }),
});
/** 漢字だけの名前の役の ID は role_ + displayOrder（強 は role_2） */
const removedRole = (name, displayOrder, appId, overrides = {}) => ({
  kind: 'role',
  name,
  unit: 'denominator',
  previous: role(name, displayOrder),
  values: {},
  appId,
  reason: '出典なし',
  ...overrides,
});
const row = (name, appId, kind = 'role') => ({ kind, name, appId });
const ledger = (removed = [], retiredIds = []) => ({
  machineId: 'test-machine',
  removed,
  retiredIds,
});
/** main の provenance/ に記録を置く */
const withBaseRecords = (map, ...records) => ({
  ...map,
  'provenance/README.md': '# provenance',
  ...Object.fromEntries(records.map((r) => [`provenance/${r.machineId}.json`, JSON.stringify(r)])),
});
const runLedger = (base, head, headRecords = []) =>
  checkLedgerAgainstBase({
    readBase: reader(base),
    readHead: reader(head),
    listBase: lister(base),
    provenanceFiles: headRecords.map((data) => ({
      path: `provenance/${data.machineId}.json`,
      data,
    })),
  });
const problem = (key, text) => `test-machine: ${key}: ${text}`;
const RETIRED_DELETED = (key, appId) =>
  `test-machine: ${key}（${appId}）: main の記録の retiredIds を消している（外した ID の台帳は消さない）`;

describe('checkLedgerAgainstBase: 新しく外した項目（removed）を main と照らす', () => {
  // main には BIG と 強 がある。この PR で 強 を外す
  const main = machineMap([role('BIG', 1), role('強', 2)]);
  const withoutKyou = machineMap([role('BIG', 1)]);
  const kyou = removedRole('強', 2, 'role_2');

  it('previous と appId が main の項目と同じなら問題なし（previous のキーの順は問わない）', () => {
    expect(runLedger(main, withoutKyou, [ledger([kyou], [row('強', 'role_2')])])).toEqual([]);
    const reordered = { displayOrder: 2, probabilities: { 1: 0.01 }, hasSettingDiff: false };
    const removed = removedRole('強', 2, 'role_2', { previous: { ...reordered, name: '強' } });
    expect(runLedger(main, withoutKyou, [ledger([removed])])).toEqual([]);
  });

  it('ID を作る種類の appId が main の ID と違えば報告する', () => {
    expect(runLedger(main, withoutKyou, [ledger([removedRole('強', 2, 'kyou')])])).toEqual([
      problem('role::強', 'removed の appId が main の ID と違う（main: role_2）'),
    ]);
  });

  it('新しい removed の項目が main の機種ファイルに無ければ報告する（main に無い機種も）', () => {
    expect(runLedger(main, main, [ledger([removedRole('弱', 3, 'role_3')])])).toEqual([
      problem('role::弱', 'removed の項目が main の機種ファイルに無い'),
    ]);
    const noMachine = { 'machines/index.json': indexJson([]) };
    expect(runLedger(noMachine, withoutKyou, [ledger([kyou])])).toEqual([
      problem('role::強', 'removed の項目が main の機種ファイルに無い'),
    ]);
  });

  it('新しい removed の previous が main の項目と違えば報告する（作った値で外す条件を通せないように）', () => {
    const forged = removedRole('強', 2, 'role_2', {
      previous: role('強', 2, { probabilities: { 1: 0.02 } }),
    });
    expect(runLedger(main, withoutKyou, [ledger([forged])])).toEqual([
      problem('role::強', 'removed の previous が main の項目と違う'),
    ]);
    // ID を持たない項目も、previous を main の項目と比べる（appId は比べない）
    const gold = { name: '金トロフィー', confirmedSettings: ['6'], excludedSettings: ['1'] };
    const removedGold = (previous) => ({
      kind: 'confirmationEvent',
      name: '金トロフィー',
      unit: 'settings',
      previous,
      values: {},
      reason: '出典なし',
    });
    const withGold = machineMap([role('BIG', 1)], { confirmationEvents: [gold] });
    expect(runLedger(withGold, withoutKyou, [ledger([removedGold(gold)])])).toEqual([]);
    expect(
      runLedger(withGold, withoutKyou, [ledger([removedGold({ ...gold, excludedSettings: [] })])])
    ).toEqual([
      problem('confirmationEvent::金トロフィー', 'removed の previous が main の項目と違う'),
    ]);
  });

  it('previous は main の生の項目と比べる（最上位の終了画面の distribution を改名した形でなく）', () => {
    const screen = { name: '金枠', distribution: { 1: 0, 6: 0.01 } };
    const removed = {
      kind: 'endScreen',
      name: '金枠',
      unit: 'denominator',
      previous: screen,
      values: {},
      appId: 'endscreen',
      reason: '出典なし',
    };
    const withScreen = machineMap([role('BIG', 1)], { endScreens: [screen] });
    expect(runLedger(withScreen, withoutKyou, [ledger([removed])])).toEqual([]);
  });
});

describe('checkLedgerAgainstBase: 明示の id を持つ項目', () => {
  it('確定演出の removed の appId も、main の明示の id と比べる', () => {
    const gold = { name: '金トロフィー', id: 'gold', confirmedSettings: ['6'] };
    const removed = (appId) => ({
      kind: 'confirmationEvent',
      name: '金トロフィー',
      unit: 'settings',
      previous: gold,
      values: {},
      appId,
      reason: '出典なし',
    });
    const main = machineMap([role('BIG', 1)], { confirmationEvents: [gold] });
    const head = machineMap([role('BIG', 1)]);
    expect(runLedger(main, head, [ledger([removed('gold')])])).toEqual([]);
    expect(runLedger(main, head, [ledger([removed('kin')])])).toEqual([
      problem(
        'confirmationEvent::金トロフィー',
        'removed の appId が main の ID と違う（main: gold）'
      ),
    ]);
  });
});

describe('checkLedgerAgainstBase: main の記録（removed は消してよい・retiredIds は足すだけ）', () => {
  const withoutKyou = machineMap([role('BIG', 1)]);
  const kyou = removedRole('強', 2, 'role_2');
  // 先の PR で 強 を外した後の main（記録が main に残っている）
  const mainAfter = withBaseRecords(withoutKyou, ledger([kyou], [row('強', 'role_2')]));

  it('main の記録の removed と retiredIds を残していれば問題なし', () => {
    expect(runLedger(mainAfter, withoutKyou, [ledger([kyou], [row('強', 'role_2')])])).toEqual([]);
  });

  it('main の記録の removed は消してよい（その見直しの根拠。ID は retiredIds に残る）', () => {
    expect(runLedger(mainAfter, withoutKyou, [ledger([], [row('強', 'role_2')])])).toEqual([]);
  });

  it('main の記録の removed を書き換えると、新しい removed として main と照らす（1件）', () => {
    const rewritten = removedRole('強', 2, 'role_2', { reason: '書き換えた理由' });
    expect(runLedger(mainAfter, withoutKyou, [ledger([rewritten], [row('強', 'role_2')])])).toEqual(
      [problem('role::強', 'removed の項目が main の機種ファイルに無い')]
    );
  });

  it('main の記録の retiredIds を消せば報告する（記録のファイルごと消した場合も）', () => {
    expect(runLedger(mainAfter, withoutKyou, [ledger([kyou], [])])).toEqual([
      RETIRED_DELETED('role::強', 'role_2'),
    ]);
    expect(runLedger(mainAfter, withoutKyou, [])).toEqual([RETIRED_DELETED('role::強', 'role_2')]);
  });

  it('main の記録の retiredIds の行を書き換えれば、消したものとして1件だけ報告する', () => {
    expect(runLedger(mainAfter, withoutKyou, [ledger([kyou], [row('強', 'role_9')])])).toEqual([
      RETIRED_DELETED('role::強', 'role_2'),
    ]);
  });

  it('足し直した項目でも、retiredIds は消せない（足し直しの例外は無い）', () => {
    const readded = machineMap([role('BIG', 1), role('強', 3)]);
    expect(runLedger(mainAfter, readded, [ledger([], [row('強', 'role_2')])])).toEqual([]);
    expect(runLedger(mainAfter, readded, [ledger([], [])])).toEqual([
      RETIRED_DELETED('role::強', 'role_2'),
    ]);
  });

  it('main の記録を読めなければ例外を投げる（CLI は終了コード 2 にする）。JSON でないファイルは読まない', () => {
    const broken = { ...withBaseRecords(withoutKyou), 'provenance/test-machine.json': '{' };
    expect(() => runLedger(broken, withoutKyou)).toThrow('main の出典記録を読めない');
    expect(runLedger(withBaseRecords(withoutKyou), withoutKyou)).toEqual([]);
  });
});

describe('外した ID の台帳: 3段の PR（外す → 足し直す → 新しい項目が前の ID を使う）', () => {
  // validate（出典記録の検証）と check:base（main と比べる検査）を、PR ごとに実行する
  const sources = [
    {
      key: 'site-a',
      kind: 'analysis-site',
      url: 'https://site-a.com/1',
      retrievedAt: '2026-09-27',
    },
    {
      key: 'site-b',
      kind: 'analysis-site',
      url: 'https://site-b.com/1',
      retrievedAt: '2026-09-27',
    },
  ];
  const presence = (kind, name) => ({
    kind,
    name,
    status: 'confirmed',
    unit: 'presence',
    values: { 'site-a': true, 'site-b': true },
    adopted: true,
  });
  const repo = (machine, record) => ({
    'machines/index.json': indexJson([entry]),
    'machines/test/test-machine.json': JSON.stringify(machine),
    ...(record ? { 'provenance/test-machine.json': JSON.stringify(record) } : {}),
  });
  const recordOf = (items, removed, retiredIds) => ({
    machineId: 'test-machine',
    machineFile: 'test/test-machine.json',
    reviewedAt: '2026-09-27',
    sources,
    items,
    candidates: [],
    removed,
    retiredIds,
  });
  /** PR の問題（validate のエラーと check:base の問題） */
  const problemsOf = (base, head) => {
    const record = head['provenance/test-machine.json'];
    const data = record ? JSON.parse(record) : null;
    const provenanceFiles = data ? [{ path: 'provenance/test-machine.json', data }] : [];
    const machine = JSON.parse(head['machines/test/test-machine.json']);
    const validated = validateProvenance(
      [{ path: 'machines/test/test-machine.json', data: machine }],
      JSON.parse(head['machines/index.json']),
      provenanceFiles,
      { officialDomains: [] }
    );
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

  it('確定演出（明示の id）: 3段目で止まる', () => {
    const gold = {
      name: '金トロフィー',
      id: 'gold',
      confirmedSettings: ['6'],
      excludedSettings: [],
    };
    const settingsItem = (name, confirmed) => ({
      kind: 'confirmationEvent',
      name,
      status: 'confirmed',
      unit: 'settings',
      values: {
        'site-a': { confirmed, excluded: [] },
        'site-b': { confirmed, excluded: [] },
      },
      adopted: { confirmed, excluded: [] },
    });
    const main0 = repo({ name: 'テスト機種', confirmationEvents: [gold] });
    const retired = [row('金トロフィー', 'gold', 'confirmationEvent')];
    const goldRemoved = {
      kind: 'confirmationEvent',
      name: '金トロフィー',
      unit: 'settings',
      previous: gold,
      values: {},
      appId: 'gold',
      reason: '出典なし',
    };
    // PR1: 金トロフィー を外す
    const main1 = repo(
      { name: 'テスト機種', confirmationEvents: [] },
      recordOf([], [goldRemoved], retired)
    );
    expect(problemsOf(main0, main1)).toEqual([]);
    // PR2: 別の id で足し直し、removed から消す（retiredIds は残す）
    const regold = { ...gold, id: 'gold_v2' };
    const main2 = repo(
      { name: 'テスト機種', confirmationEvents: [regold] },
      recordOf([settingsItem('金トロフィー', ['6'])], [], retired)
    );
    expect(problemsOf(main1, main2)).toEqual([]);
    // PR3: 新しい 虹トロフィー に、外した id（gold）を付ける
    const rainbow = {
      name: '虹トロフィー',
      id: 'gold',
      confirmedSettings: ['5', '6'],
      excludedSettings: [],
    };
    const pr3 = repo(
      { name: 'テスト機種', confirmationEvents: [regold, rainbow] },
      recordOf(
        [settingsItem('金トロフィー', ['6']), settingsItem('虹トロフィー', ['5', '6'])],
        [],
        retired
      )
    );
    expect(problemsOf(main2, pr3)).toEqual([
      'confirmationEvent::虹トロフィー: 外した項目の ID（gold）を使っている（明示の id を付ける）',
    ]);
  });

  it('終了画面（名前から作る ID）: 3段目で止まる', () => {
    const jin = { name: '仁', hint: '' };
    const gi = { name: '義', hint: '' };
    const main0 = repo({ name: 'テスト機種', endScreens: [jin, gi] });
    const giRemoved = {
      kind: 'endScreen',
      name: '義',
      unit: 'presence',
      previous: gi,
      values: {},
      appId: 'endscreen_2',
      reason: '出典なし',
    };
    const retired = [row('義', 'endscreen_2', 'endScreen')];
    // PR1: 義 を外す
    const main1 = repo(
      { name: 'テスト機種', endScreens: [jin] },
      recordOf([presence('endScreen', '仁')], [giRemoved], retired)
    );
    expect(problemsOf(main0, main1)).toEqual([]);
    // PR2: 義 を明示の別の id で足し直し、removed から消す（retiredIds は残す）
    const main2 = repo(
      { name: 'テスト機種', endScreens: [jin, { ...gi, id: 'gi' }] },
      recordOf([presence('endScreen', '仁'), presence('endScreen', '義')], [], retired)
    );
    expect(problemsOf(main1, main2)).toEqual([]);
    // PR3: 漢字だけの 礼 を足すと、ID が endscreen_2（外した 義 の ID）になる
    const pr3 = repo(
      { name: 'テスト機種', endScreens: [jin, { ...gi, id: 'gi' }, { name: '礼', hint: '' }] },
      recordOf(
        [presence('endScreen', '仁'), presence('endScreen', '義'), presence('endScreen', '礼')],
        [],
        retired
      )
    );
    expect(problemsOf(main2, pr3)).toEqual([
      'endScreen::礼: 外した項目の ID（endscreen_2）を使っている（明示の id を付ける）',
    ]);
    // PR2 で retiredIds も消すと、check:base が止める
    const main2Deleted = repo(
      { name: 'テスト機種', endScreens: [jin, { ...gi, id: 'gi' }] },
      recordOf([presence('endScreen', '仁'), presence('endScreen', '義')], [], [])
    );
    expect(problemsOf(main1, main2Deleted)).toEqual([
      '問題: 1件',
      `  ERROR ${RETIRED_DELETED('endScreen::義', 'endscreen_2')}`,
    ]);
  });
});
