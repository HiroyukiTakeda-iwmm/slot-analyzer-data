import { describe, it, expect } from 'vitest';
import { decideExistingItem, toStoredProbability } from '../scripts/lib/provenance.mjs';
import {
  checkNewMachineRecords,
  checkRemovedItems,
  checkRemovedLedger,
  checkRulesAgainstBase,
} from '../scripts/lib/rules-against-base.mjs';

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
/** main にある項目の provisional-chonborista で、main の値を裏づける出典があるときの報告 */
const supportedByBase = (key) =>
  `test-machine: ${key}: main の値を裏づける出典がある（規則2の kept-single-source にする）`;

describe('checkRulesAgainstBase: kept-single-source', () => {
  it('採用値と機種ファイルの値が main の値そのものなら問題なし', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(kept()))).toEqual([]);
  });

  it('機種ファイルの値が main から変わったら、一致の条件の範囲でも報告する', () => {
    // 1/295.2 → 1/295.22（0.0033873）は、出典の 295.2（丸めの幅 295.15〜295.25）と 5.4 の条件で
    // 一致するが、残す値は変えない
    expect(run(files([big(0.00338753)]), files([big(0.0033873)]), recordsOf(kept()))).toEqual([
      'test-machine: role::BIG: kept-single-source の値が main から変わった',
    ]);
  });

  it('採用値が main の値そのものでなければ、一致の条件の範囲でも報告する', () => {
    // 丸めの幅の重なりによる一致は推移しない。295.2 は main の確率 0.00338753 と重なるが、
    // main の値そのもの（1 ÷ 0.00338753）ではない
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(kept({ 1: 295.2 })))).toEqual([
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
  it('main にある項目で、main の値を裏づける出典が無いなら問題なし（規則3）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(provisional({ 1: 300 })))).toEqual([]);
  });

  it('main にある項目で、ちょんぼりすたの値が main の値を裏づけるなら報告する（規則2）', () => {
    const map = files([big(0.00338753)]);
    expect(run(map, map, recordsOf(provisional({ 1: 295.2 })))).toEqual([
      supportedByBase('role::BIG'),
    ]);
  });

  it('ちょんぼりすた以外の出典（一部だけも）が main の値を裏づけるなら報告する（採否の関数は kept-single-source にする）', () => {
    // レビュー I1 の再現例: main は設定1が 1/300。ちょんぼりすたは全設定で別の値（読み直し一致）、なな徹は
    // 設定6だけを載せて main の値と合う。既存の値の順（確定 → 残す → 暫定 → 外す）では「残す」が先に当たる
    const main = { 1: toStoredProbability(300), 6: toStoredProbability(277.7) };
    const chonborista = { 1: 295.2, 6: 277.7 };
    const values = { chonborista, 'nana-press': { 6: 277.7 } };
    const current = { 1: 1 / main[1], 6: 1 / main[6] };
    const sourceKinds = { chonborista: 'analysis-site', 'nana-press': 'analysis-site' };
    expect(
      decideExistingItem({
        unit: 'denominator',
        values,
        sourceKinds,
        reread: chonborista,
        current,
        stored: main,
      })
    ).toEqual({ outcome: 'adopt', status: 'kept-single-source', adopted: current });

    const base = files([{ ...big(main[1]), probabilities: main }]);
    const written = { 1: toStoredProbability(295.2), 6: toStoredProbability(277.7) };
    const head = files([{ ...big(written[1]), probabilities: written }]);
    expect(run(base, head, recordsOf({ ...provisional(chonborista), values }))).toEqual([
      supportedByBase('role::BIG'),
    ]);
    // 採否の関数が作る記録（kept-single-source。値は main のまま）は通る
    expect(run(base, base, recordsOf({ ...kept(current), values }))).toEqual([]);

    // 一部だけの出典が main の値を裏づけず、ちょんぼりすたの値と合うなら、採否の関数も check:base も暫定
    const notSupporting = { chonborista, 'nana-press': { 1: 295.2 } };
    expect(
      decideExistingItem({
        unit: 'denominator',
        values: notSupporting,
        sourceKinds,
        reread: chonborista,
        current,
        stored: main,
      })
    ).toEqual({ outcome: 'adopt', status: 'provisional-chonborista', adopted: chonborista });
    expect(
      run(base, head, recordsOf({ ...provisional(chonborista), values: notSupporting }))
    ).toEqual([]);
  });

  it('main に無い項目（新しく入れる値）は、main の値と比べない', () => {
    const base = { 'machines/index.json': indexJson([]) };
    expect(run(base, files([big(0.00338753)]), recordsOf(provisional({ 1: 295.2 })))).toEqual([]);
  });

  it('main の確率の幅で比べる（小数6桁の 0.000076 と、ちょんぼりすたの 13107.2 は一致する）', () => {
    const map = files([big(0.000076)]);
    expect(run(map, map, recordsOf(provisional({ 1: 13107.2 })))).toEqual([
      supportedByBase('role::BIG'),
    ]);
  });

  it('ちょんぼりすたが一部の設定だけでも、載っている設定がすべて main と合えば報告する（「残す」と同じ数え方）', () => {
    const map = files([{ ...big(0.00338753), probabilities: { 1: 0.00338753, 6: 0.00360101 } }]);
    expect(run(map, map, recordsOf(provisional({ 1: 295.2 })))).toEqual([
      supportedByBase('role::BIG'),
    ]);
    expect(run(map, map, recordsOf(provisional({ 1: 295.2, 6: 280 })))).toEqual([]);
  });

  it('設定の組の項目は、今までどおり main の値と組で比べる', () => {
    const gold = { name: '金トロフィー', confirmedSettings: ['6'], excludedSettings: ['1'] };
    const map = {
      ...files([big(0.00338753)]),
      'machines/test/test-machine.json': JSON.stringify({
        name: 'テスト機種',
        roles: [big(0.00338753)],
        confirmationEvents: [gold],
      }),
    };
    const settingsItem = (chonborista) => ({
      kind: 'confirmationEvent',
      name: '金トロフィー',
      unit: 'settings',
      status: 'provisional-chonborista',
      values: { chonborista },
      adopted: chonborista,
      reread: { by: 'verifier', value: chonborista },
    });
    expect(run(map, map, recordsOf(settingsItem({ confirmed: ['6'], excluded: ['1'] })))).toEqual([
      supportedByBase('confirmationEvent::金トロフィー'),
    ]);
    expect(run(map, map, recordsOf(settingsItem({ confirmed: ['6'], excluded: [] })))).toEqual([]);
    // ちょんぼりすた以外の出典が main の値を裏づけるときも報告する（どの出典も数える。validate の statusError は
    // 設定の組の暫定に「ちょんぼりすたにしか無い」を求めるが、main と比べる検査はそれに頼らない）
    const other = settingsItem({ confirmed: ['6'], excluded: [] });
    other.values = { ...other.values, 'nana-press': { confirmed: ['6'], excluded: ['1'] } };
    expect(run(map, map, recordsOf(other))).toEqual([
      supportedByBase('confirmationEvent::金トロフィー'),
    ]);
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

describe('checkRemovedItems（ID を持たない種類の項目の削除）', () => {
  const gold = { name: '金トロフィー', confirmedSettings: ['6'], excludedSettings: ['1'] };
  const withItems = (fields, machines = [entry]) => ({
    'machines/index.json': indexJson(machines),
    'machines/test/test-machine.json': JSON.stringify({
      name: 'テスト機種',
      type: 'AT',
      author: 'コミュニティ',
      version: '1.0',
      lastUpdated: '2026-09-26',
      roles: [big(0.00338753)],
      ...fields,
    }),
  });
  const removedRecord = (...removed) => [
    { path: 'provenance/test-machine.json', data: { machineId: 'test-machine', removed } },
  ];
  const runRemoved = (base, head, provenanceFiles = []) =>
    checkRemovedItems({ readBase: reader(base), readHead: reader(head), provenanceFiles });

  it('確定演出を消して、出典記録の removed に無ければ報告する', () => {
    const base = withItems({ confirmationEvents: [gold] });
    expect(runRemoved(base, withItems({ confirmationEvents: [] }))).toEqual([
      'test-machine: confirmationEvent::金トロフィー: 項目が消えたのに、出典記録の removed に無い',
    ]);
  });

  it('removed に書けば報告しない', () => {
    const base = withItems({ confirmationEvents: [gold] });
    const provenanceFiles = removedRecord({
      kind: 'confirmationEvent',
      name: '金トロフィー',
      previous: { confirmed: ['6'], excluded: ['1'] },
      reason: '出典なし',
    });
    expect(runRemoved(base, withItems({}), provenanceFiles)).toEqual([]);
  });

  it('ID を持たない7種類すべてを、項目キー（同じ名前は #2 など）で比べる', () => {
    const base = withItems({
      confirmationEvents: [gold],
      voiceCounts: [{ name: 'ボイスA' }],
      musicCounts: [{ name: '楽曲A' }],
      effectCounts: [{ name: '演出A' }],
      trialSuccessRates: [
        { name: 'CZ成功率', probabilities: { 1: 0.3 } },
        { name: 'CZ成功率', probabilities: { 1: 0.4 } },
      ],
      modeTransitions: [{ name: '高確移行', rates: { 1: 0.1 } }],
      specialSettings: { note: 'x' },
    });
    const head = withItems({
      trialSuccessRates: [{ name: 'CZ成功率', probabilities: { 1: 0.3 } }],
    });
    const problem = (key) => `test-machine: ${key}: 項目が消えたのに、出典記録の removed に無い`;
    expect(runRemoved(base, head)).toEqual([
      problem('confirmationEvent::金トロフィー'),
      problem('voiceCount::ボイスA'),
      problem('musicCount::楽曲A'),
      problem('effectCount::演出A'),
      problem('trialSuccessRate::CZ成功率#2'),
      problem('modeTransition::高確移行'),
      problem('specialSettings::specialSettings'),
    ]);
  });

  it('役を消したときは報告しない（ID を持つ種類は checkDerivedIds が同じ文面で報告する）', () => {
    expect(runRemoved(withItems({}), withItems({ roles: [] }))).toEqual([]);
  });

  it('読めなかった記録は飛ばす（validate が報告する）', () => {
    const base = withItems({ confirmationEvents: [gold] });
    const provenanceFiles = [{ path: 'provenance/test-machine.json', data: null }];
    expect(runRemoved(base, withItems({}), provenanceFiles)).toEqual([
      'test-machine: confirmationEvent::金トロフィー: 項目が消えたのに、出典記録の removed に無い',
    ]);
  });

  it('index.json から消えた機種は見ない（checkDerivedIds が報告する）', () => {
    const base = withItems({ confirmationEvents: [gold] });
    expect(runRemoved(base, { 'machines/index.json': indexJson([]) })).toEqual([]);
  });
});

describe('checkNewMachineRecords（新しく足した機種の出典記録）', () => {
  const added = { ...entry, id: 'new-machine', name: '新台', file: 'test/new-machine.json' };
  const base = files([big(0.00338753)]);
  const head = files([big(0.00338753)], [entry, added]);
  const runNew = (provenanceFiles) =>
    checkNewMachineRecords({ readBase: reader(base), readHead: reader(head), provenanceFiles });

  it('新しい機種に出典記録が無ければ報告する', () => {
    expect(runNew([])).toEqual([
      'new-machine: 新しく足した機種に出典記録（provenance/new-machine.json）が無い',
    ]);
  });

  it('記録があれば報告しない（パスか machineId で見つける。壊れた記録も「ある」と数える）', () => {
    expect(runNew([{ path: 'provenance/new-machine.json', data: null, parseError: 'x' }])).toEqual(
      []
    );
    expect(runNew([{ path: 'provenance/other.json', data: { machineId: 'new-machine' } }])).toEqual(
      []
    );
  });

  it('ほかの機種の記録は数えない', () => {
    const others = [{ path: 'provenance/test-machine.json', data: { machineId: 'test-machine' } }];
    expect(runNew(others)).toEqual([
      'new-machine: 新しく足した機種に出典記録（provenance/new-machine.json）が無い',
    ]);
  });

  it('既存の機種は対象外', () => {
    expect(
      checkNewMachineRecords({
        readBase: reader(base),
        readHead: reader(base),
        provenanceFiles: [],
      })
    ).toEqual([]);
  });
});

describe('checkRemovedLedger（外した ID の台帳）', () => {
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
  const ledger = (...removed) => ({ machineId: 'test-machine', removed });
  /** main の provenance/ に記録を置く */
  const withBaseRecords = (map, ...records) => ({
    ...map,
    'provenance/README.md': '# provenance',
    ...Object.fromEntries(
      records.map((r) => [`provenance/${r.machineId}.json`, JSON.stringify(r)])
    ),
  });
  const lister = (map) => (dir) => Object.keys(map).filter((path) => path.startsWith(`${dir}/`));
  const runLedger = (base, head, headRecords = []) =>
    checkRemovedLedger({
      readBase: reader(base),
      readHead: reader(head),
      listBase: lister(base),
      provenanceFiles: headRecords.map((data) => ({
        path: `provenance/${data.machineId}.json`,
        data,
      })),
    });
  const problem = (key, text) => `test-machine: ${key}: ${text}`;
  const DELETED = 'main の記録の removed を消している（外した ID の台帳は消さない）';
  const REUSED = (id) => `外した項目の ID（${id}）を新しい項目が使っている（明示の id を付ける）`;

  // main には BIG と 強 がある。この PR で 強 を外す
  const main = machineMap([role('BIG', 1), role('強', 2)]);
  const withoutKyou = machineMap([role('BIG', 1)]);
  // 強 を外した後の main（先の PR で外し、記録が main に残っている）
  const mainAfter = withBaseRecords(withoutKyou, ledger(removedRole('強', 2, 'role_2')));

  it('新しい removed の previous と appId が main の項目と同じなら問題なし（previous のキーの順は問わない）', () => {
    expect(runLedger(main, withoutKyou, [ledger(removedRole('強', 2, 'role_2'))])).toEqual([]);
    const reordered = { displayOrder: 2, probabilities: { 1: 0.01 }, hasSettingDiff: false };
    const removed = removedRole('強', 2, 'role_2', { previous: { ...reordered, name: '強' } });
    expect(runLedger(main, withoutKyou, [ledger(removed)])).toEqual([]);
  });

  it('ID を作る種類の appId が main の ID と違えば報告する', () => {
    expect(runLedger(main, withoutKyou, [ledger(removedRole('強', 2, 'kyou'))])).toEqual([
      problem('role::強', 'removed の appId が main の ID と違う（main: role_2）'),
    ]);
  });

  it('新しい removed の項目が main の機種ファイルに無ければ報告する（main に無い機種も）', () => {
    expect(runLedger(main, main, [ledger(removedRole('弱', 3, 'role_3'))])).toEqual([
      problem('role::弱', 'removed の項目が main の機種ファイルに無い'),
    ]);
    const noMachine = { 'machines/index.json': indexJson([]) };
    expect(runLedger(noMachine, withoutKyou, [ledger(removedRole('強', 2, 'role_2'))])).toEqual([
      problem('role::強', 'removed の項目が main の機種ファイルに無い'),
    ]);
  });

  it('新しい removed の previous が main の項目と違えば報告する（作った値で外す条件を通せないように）', () => {
    const forged = removedRole('強', 2, 'role_2', {
      previous: role('強', 2, { probabilities: { 1: 0.02 } }),
    });
    expect(runLedger(main, withoutKyou, [ledger(forged)])).toEqual([
      problem('role::強', 'removed の previous が main の項目と違う'),
    ]);
    // ID を作らない種類も、previous を main の項目と比べる（appId は比べない）
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
    expect(runLedger(withGold, withoutKyou, [ledger(removedGold(gold))])).toEqual([]);
    expect(
      runLedger(withGold, withoutKyou, [ledger(removedGold({ ...gold, excludedSettings: [] }))])
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
    expect(runLedger(withScreen, withoutKyou, [ledger(removed)])).toEqual([]);
  });

  it('main の記録の removed を残していれば問題なし', () => {
    expect(runLedger(mainAfter, withoutKyou, [ledger(removedRole('強', 2, 'role_2'))])).toEqual([]);
  });

  it('main の記録の removed を消せば報告する（記録のファイルごと消した場合も）', () => {
    expect(runLedger(mainAfter, withoutKyou, [ledger()])).toEqual([problem('role::強', DELETED)]);
    expect(runLedger(mainAfter, withoutKyou, [])).toEqual([problem('role::強', DELETED)]);
  });

  it('main の記録の removed を書き換えれば、消して新しく足したものとして報告する', () => {
    const rewritten = removedRole('強', 2, 'role_2', { reason: '書き換えた理由' });
    expect(runLedger(mainAfter, withoutKyou, [ledger(rewritten)])).toEqual([
      problem('role::強', 'removed の項目が main の機種ファイルに無い'),
      problem('role::強', DELETED),
    ]);
  });

  it('足し直した項目は main の記録の removed から外してよいが、前の ID は使えない', () => {
    // 別の ID（displayOrder 3 → role_3）で足し直すなら問題なし
    const readded = machineMap([role('BIG', 1), role('強', 3)]);
    expect(runLedger(mainAfter, readded, [ledger()])).toEqual([]);
    // 前の ID（role_2）のまま足し直すと、main の記録の台帳で見つける
    const sameId = machineMap([role('BIG', 1), role('強', 2)]);
    expect(runLedger(mainAfter, sameId, [ledger()])).toEqual([
      problem('role::強', REUSED('role_2')),
    ]);
  });

  it('PR をまたいで、外した項目の ID を新しい項目が使えば報告する（明示の id を付ければ通る）', () => {
    const kept = [ledger(removedRole('強', 2, 'role_2'))];
    const reused = machineMap([role('BIG', 1), role('弱', 2)]);
    expect(runLedger(mainAfter, reused, kept)).toEqual([problem('role::弱', REUSED('role_2'))]);
    const pinned = machineMap([role('BIG', 1), role('弱', 2, { id: 'jaku' })]);
    expect(runLedger(mainAfter, pinned, kept)).toEqual([]);
  });

  it('main の記録に無い、比べる側の記録の appId も台帳に数える', () => {
    // この PR で 強 を外し、appId を main の ID と違う kyou と書いて、新しい項目に kyou を使う
    const reused = machineMap([role('BIG', 1), role('弱', 3, { id: 'kyou' })]);
    expect(runLedger(main, reused, [ledger(removedRole('強', 2, 'kyou'))])).toEqual([
      problem('role::強', 'removed の appId が main の ID と違う（main: role_2）'),
      problem('role::弱', REUSED('kyou')),
    ]);
  });

  it('main にある ID の使い回しは compareDerivedIds が報告するので、重ねて報告しない', () => {
    const reused = machineMap([role('BIG', 1), role('弱', 2)]);
    expect(runLedger(main, reused, [ledger(removedRole('強', 2, 'role_2'))])).toEqual([]);
  });

  it('既存の項目の ID が変わったときは compareDerivedIds が報告するので、台帳では見ない（新しく足した項目だけ）', () => {
    // main の 弱 は role_1。displayOrder を 2 にすると、外した 強 の ID（role_2）と同じになる
    const base = withBaseRecords(
      machineMap([role('弱', 1)]),
      ledger(removedRole('強', 2, 'role_2'))
    );
    const moved = machineMap([role('弱', 2)]);
    expect(runLedger(base, moved, [ledger(removedRole('強', 2, 'role_2'))])).toEqual([]);
  });

  it('ID が重なってはいけない範囲（idScope）が違えば、同じ ID でも報告しない', () => {
    const inZone = machineMap([role('BIG', 1)], {
      zones: [{ name: 'CZ', isDefault: false, roles: [role('強', 2)] }],
    });
    expect(runLedger(mainAfter, inZone, [ledger(removedRole('強', 2, 'role_2'))])).toEqual([]);
  });

  it('main の記録を読めなければ例外を投げる（CLI は終了コード 2 にする）。JSON でないファイルは読まない', () => {
    const broken = { ...withBaseRecords(withoutKyou), 'provenance/test-machine.json': '{' };
    expect(() => runLedger(broken, withoutKyou)).toThrow();
    expect(runLedger(withBaseRecords(withoutKyou), withoutKyou)).toEqual([]);
  });
});
