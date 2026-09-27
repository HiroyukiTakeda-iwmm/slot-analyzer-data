import { describe, it, expect } from 'vitest';
import { decideExistingItem, toStoredProbability } from '../scripts/lib/provenance.mjs';
import {
  checkNewMachineRecords,
  checkRemovedItems,
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
