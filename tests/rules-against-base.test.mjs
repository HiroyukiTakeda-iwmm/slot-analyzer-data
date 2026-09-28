import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { decideExistingItem, toStoredProbability } from '../scripts/lib/provenance.mjs';
import {
  checkDeletedBaseRecords,
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
const lister = (map) => (dir) => Object.keys(map).filter((path) => path.startsWith(`${dir}/`));
const recordsOf = (...items) => [{ data: { machineId: 'test-machine', items } }];
/** main のスキーマ（main の記録は main のスキーマで確かめる。ここでは今のスキーマを main に置く） */
const PROVENANCE_SCHEMA = readFileSync(
  new URL('../schemas/provenance.schema.json', import.meta.url),
  'utf-8'
);
/** main の出典記録（main のスキーマと main の index.json に合う形） */
const baseRecordOf = (machineId, items) => ({
  machineId,
  machineFile: `test/${machineId}.json`,
  reviewedAt: '2026-09-27',
  sources: [
    {
      key: 'nana-press',
      kind: 'analysis-site',
      url: 'https://nana-press.com/1',
      retrievedAt: '2026-09-27',
    },
  ],
  items,
  candidates: [],
  removed: [],
  retiredIds: [],
});
/** main の provenance/ に記録を置く（先の PR でマージした記録） */
const withBaseRecord = (map, items, machineId = 'test-machine') => ({
  ...map,
  'schemas/provenance.schema.json': PROVENANCE_SCHEMA,
  'provenance/README.md': '# provenance',
  [`provenance/${machineId}.json`]: JSON.stringify(baseRecordOf(machineId, items)),
});
const run = (base, head, provenanceFiles) =>
  checkRulesAgainstBase({
    readBase: reader(base),
    readHead: reader(head),
    listBase: lister(base),
    provenanceFiles,
  });
/** main にある項目の provisional-chonborista で、main の値を裏づける出典があるときの報告 */
const supportedByBase = (key) =>
  `test-machine: ${key}: main の値を裏づける出典がある（規則2の kept-single-source にする）`;
/** main の記録と JSON として同じ項目のまま、機種ファイルの値だけを main から変えたときの報告 */
const valueChangedUnderSameRecord = (key) =>
  `test-machine: ${key}: 記録を変えずに機種ファイルの値を main から変えている（記録も作り直すか、値を main に戻す）`;

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

describe('checkRulesAgainstBase: main の記録と同じ項目は確かめ直さない（マージ済みの採用）', () => {
  // 先の PR で暫定の値（ちょんぼりすたの 1/295.2）を入れてマージした後の main。確かめ直すと、ちょんぼりすたの値が
  // main の値（入れた暫定の値）を裏づけるので、関係ない PR が止まる（最終レビュー C1）
  const written = toStoredProbability(295.2);
  const item = provisional({ 1: 295.2 });
  const main = withBaseRecord(files([big(written)]), [item]);

  it('記録（unit・status・adopted・values・reread）と機種ファイルの値が main と同じなら問題なし', () => {
    expect(run(main, files([big(written)]), recordsOf(item))).toEqual([]);
    // 記録の項目のキーの順は問わない
    const reordered = Object.fromEntries(Object.entries(item).reverse());
    expect(run(main, files([big(written)]), recordsOf(reordered))).toEqual([]);
  });

  it('記録を変えずに機種ファイルの値だけ変えたら確かめる', () => {
    // 暫定の項目は、原因（記録を変えずに値を変えた）を1件だけ出す（「main の値を裏づける出典がある」にしない）
    expect(run(main, files([big(toStoredProbability(300))]), recordsOf(item))).toEqual([
      valueChangedUnderSameRecord('role::BIG'),
    ]);
    // main の値を裏づけない場合（main の値が記録の採用値と違う形）も、check:base が止める
    const mismatched = withBaseRecord(files([big(toStoredProbability(400))]), [item]);
    expect(run(mismatched, files([big(toStoredProbability(300))]), recordsOf(item))).toEqual([
      valueChangedUnderSameRecord('role::BIG'),
    ]);
    // kept-single-source も同じ（値を変えないことを確かめる）
    const keptMain = withBaseRecord(files([big(0.00338753)]), [kept()]);
    expect(run(keptMain, files([big(0.00338753)]), recordsOf(kept()))).toEqual([]);
    expect(run(keptMain, files([big(0.0033873)]), recordsOf(kept()))).toEqual([
      'test-machine: role::BIG: kept-single-source の値が main から変わった',
    ]);
  });

  it('記録が main と違えば確かめる（values・reread・adopted・unit・status のどれでも）', () => {
    const head = files([big(written)]);
    const mainItems = [
      { ...item, values: { chonborista: { 1: 295.2 }, 'nana-press': { 1: 310 } } },
      { ...item, reread: { by: 'other-verifier', value: { 1: 295.2 } } },
      { ...item, adopted: { 1: 295.20001 } },
      { ...item, unit: 'percent' },
      { ...item, status: 'kept-single-source' },
    ];
    for (const mainItem of mainItems) {
      const base = withBaseRecord(head, [mainItem]);
      expect(run(base, head, recordsOf(item))).toEqual([supportedByBase('role::BIG')]);
    }
    // status を kept-single-source に変えたら、kept-single-source の規則で確かめる
    const asKept = { ...item, status: 'kept-single-source' };
    expect(run(main, head, recordsOf(asKept))).toEqual([
      'test-machine: role::BIG: kept-single-source の採用値が main の値そのものでない',
    ]);
  });

  it('main の別の機種の記録にある同じ項目では、確かめ直しを省かない', () => {
    const otherEntry = { ...entry, id: 'other-machine', file: 'test/other-machine.json' };
    const other = withBaseRecord(
      files([big(written)], [entry, otherEntry]),
      [item],
      'other-machine'
    );
    expect(run(other, files([big(written)]), recordsOf(item))).toEqual([
      supportedByBase('role::BIG'),
    ]);
  });

  it('設定の組の項目は、機種ファイルの値を集合として比べる（並べ替えだけなら確かめ直さない）', () => {
    const settings = { confirmed: ['4', '5', '6'], excluded: ['1', '2'] };
    const bonus = {
      kind: 'confirmationEvent',
      name: '特定ボーナス',
      unit: 'settings',
      status: 'provisional-chonborista',
      values: { chonborista: settings },
      adopted: settings,
      reread: { by: 'verifier', value: settings },
    };
    const withEvent = (confirmedSettings, excludedSettings) => ({
      ...files([big(written)]),
      'machines/test/test-machine.json': JSON.stringify({
        name: 'テスト機種',
        roles: [big(written)],
        confirmationEvents: [{ name: '特定ボーナス', confirmedSettings, excludedSettings }],
      }),
    });
    const settingsMain = withBaseRecord(withEvent(['4', '5', '6'], ['1', '2']), [bonus]);
    // confirmed・excluded の並べ替えだけ: マージ済みの採用として確かめ直さない
    expect(run(settingsMain, withEvent(['6', '5', '4'], ['2', '1']), recordsOf(bonus))).toEqual([]);
    // 組を変えれば、記録を変えずに値を変えたとして止める
    expect(run(settingsMain, withEvent(['5', '6'], ['1', '2']), recordsOf(bonus))).toEqual([
      valueChangedUnderSameRecord('confirmationEvent::特定ボーナス'),
    ]);
    expect(run(settingsMain, withEvent(['4', '5', '6'], ['1']), recordsOf(bonus))).toEqual([
      valueChangedUnderSameRecord('confirmationEvent::特定ボーナス'),
    ]);
  });

  it('main の機種ファイルに無い項目・比べる側の機種ファイルに無い項目は、記録が同じでも確かめる', () => {
    const keptMain = withBaseRecord(files([]), [kept()]);
    expect(run(keptMain, files([big(0.00338753)]), recordsOf(kept()))).toEqual([
      'test-machine: role::BIG: main に無い項目に kept-single-source を使っている',
    ]);
    const removedHead = withBaseRecord(files([big(0.00338753)]), [kept()]);
    expect(run(removedHead, files([]), recordsOf(kept()))).toEqual([
      'test-machine: role::BIG: kept-single-source の項目が機種ファイルに無い',
    ]);
  });

  it('unit で表せない値（null）なら、記録と値が main と同じでも確かめる', () => {
    // 確定演出（設定の組）に denominator の記録。main でも比べる側でも unit の形にできない
    const map = {
      ...files([big(written)]),
      'machines/test/test-machine.json': JSON.stringify({
        name: 'テスト機種',
        roles: [big(written)],
        confirmationEvents: [{ name: '金トロフィー', confirmedSettings: ['6'] }],
      }),
    };
    const odd = { ...kept(), kind: 'confirmationEvent', name: '金トロフィー' };
    expect(run(withBaseRecord(map, [odd]), map, recordsOf(odd))).toEqual([
      'test-machine: confirmationEvent::金トロフィー: kept-single-source の採用値が main の値そのものでない',
      'test-machine: confirmationEvent::金トロフィー: kept-single-source の値が main から変わった',
    ]);
  });

  it('main の出典記録を読めなければ例外を投げる（CLI は終了コード 2 にする）', () => {
    const broken = { ...files([big(written)]), 'provenance/test-machine.json': '{' };
    expect(() => run(broken, files([big(written)]), recordsOf(item))).toThrow(
      'main の出典記録を読めない'
    );
  });

  it('main の記録が main のスキーマ・index と合わなければ、同じ項目でも飛ばさずに例外を投げる', () => {
    const head = files([big(written)]);
    const record = 'provenance/test-machine.json';
    // 必須欄を欠いた記録（項目は同じ）
    const lacking = {
      ...main,
      [record]: JSON.stringify({ machineId: 'test-machine', items: [item] }),
    };
    expect(() => run(lacking, head, recordsOf(item))).toThrow(
      `main の出典記録が不正: ${record}: スキーマ違反 / must have required property 'machineFile'`
    );
    // machineFile が main の index.json と違う記録
    const wrongFile = {
      ...main,
      [record]: JSON.stringify({ ...baseRecordOf('test-machine', [item]), machineFile: 'x.json' }),
    };
    expect(() => run(wrongFile, head, recordsOf(item))).toThrow(
      `main の出典記録が不正: ${record}: machineFile が main の index.json と違う: x.json（index: test/test-machine.json）`
    );
  });

  it('main に記録の無い機種は、すべての項目を確かめる（main のスキーマが無くても）', () => {
    const noRecord = { ...files([big(written)]), 'provenance/README.md': '# provenance' };
    expect(run(noRecord, files([big(written)]), recordsOf(item))).toEqual([
      supportedByBase('role::BIG'),
    ]);
  });
});

describe('checkRulesAgainstBase: main の終了画面の patterns は、書き直した形で比べる', () => {
  // bakemonogatari の AT終了画面 と同じ形。同じ PR で書き直して（expand-patterns --write）、値を見直す
  const parent = {
    name: 'AT終了画面',
    patterns: [
      { name: '初代パネル（暦・忍・忍野）', minSetting: 4, description: '設定4以上濃厚' },
      { name: 'ヒロイン集合（初代パネル）', minSetting: 5, description: '設定5以上濃厚' },
    ],
    id: 'AT終了画面',
    type: 'at_end',
    hint: '設定示唆',
    color: '#78909C',
  };
  /** 書き直した後の終了画面（expand-patterns --write が書く形） */
  const heroine = {
    id: 'AT終了画面_2',
    name: 'ヒロイン集合（初代パネル）',
    type: 'at_end',
    hint: '設定5以上濃厚',
    confirmedSettings: ['5', '6'],
    color: '#78909C',
  };
  const shodai = {
    id: 'AT終了画面_1',
    name: '初代パネル（暦・忍・忍野）',
    type: 'at_end',
    hint: '設定4以上濃厚',
    confirmedSettings: ['4', '5', '6'],
    color: '#78909C',
  };
  const withScreens = (endScreens) => ({
    'machines/index.json': indexJson([entry]),
    'machines/test/test-machine.json': JSON.stringify({
      name: 'テスト機種',
      roles: [],
      endScreens,
    }),
  });
  const settings = { confirmed: ['5', '6'], excluded: [] };
  const keptHeroine = {
    kind: 'endScreen',
    name: 'ヒロイン集合（初代パネル）',
    unit: 'settings',
    status: 'kept-single-source',
    values: { 'nana-press': settings },
    adopted: settings,
  };

  it('同じ PR で書き直した終了画面に kept-single-source を使える', () => {
    expect(
      run(withScreens([parent]), withScreens([shodai, heroine]), recordsOf(keptHeroine))
    ).toEqual([]);
  });

  it('書き直した終了画面でも、採用値が main の値（書き直した形）でなければ報告する', () => {
    const wrong = { ...keptHeroine, adopted: { confirmed: ['6'], excluded: [] } };
    expect(run(withScreens([parent]), withScreens([shodai, heroine]), recordsOf(wrong))).toEqual([
      'test-machine: endScreen::ヒロイン集合（初代パネル）: kept-single-source の採用値が main の値そのものでない',
    ]);
  });

  it('main が書き直せない形なら例外を投げる（CLI は終了コード 2 にする）', () => {
    const odd = { ...parent, confirmedSettings: ['6'] };
    expect(() =>
      run(withScreens([odd]), withScreens([shodai, heroine]), recordsOf(keptHeroine))
    ).toThrow('書き直すと消える');
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

  it('明示の id を持つ項目を消したときは報告しない（ID を持つ項目は checkDerivedIds が同じ文面で報告する）', () => {
    const base = withItems({ confirmationEvents: [{ ...gold, id: 'gold' }] });
    expect(runRemoved(base, withItems({ confirmationEvents: [] }))).toEqual([]);
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

describe('checkDeletedBaseRecords（main に出典記録がある機種の記録を消していないか）', () => {
  const machine = files([big(0.00338753)]);
  const recorded = withBaseRecord(machine, [kept()]);
  const runDeleted = (base, head, provenanceFiles) =>
    checkDeletedBaseRecords({
      readBase: reader(base),
      readHead: reader(head),
      listBase: lister(base),
      provenanceFiles,
    });
  const deleted =
    'test-machine: main に出典記録がある機種の記録を消している（記録がある機種では記録も直す）';

  it('比べる側の index.json に残る機種で、provenance/<機種ID>.json を消せば報告する', () => {
    expect(runDeleted(recorded, machine, [])).toEqual([deleted]);
    // 別のパスに置いた同じ machineId の記録は数えない（ファイル名の誤りは validate も止める）
    const moved = [{ path: 'provenance/other.json', data: baseRecordOf('test-machine', []) }];
    expect(runDeleted(recorded, machine, moved)).toEqual([deleted]);
  });

  it('機種ごと index.json から消したら報告しない（ID の検査が報告する）', () => {
    expect(runDeleted(recorded, { 'machines/index.json': indexJson([]) }, [])).toEqual([]);
  });

  it('記録を残せば報告しない（壊れた記録も「ある」と数える。中身は validate が確かめる）', () => {
    const path = 'provenance/test-machine.json';
    expect(
      runDeleted(recorded, machine, [{ path, data: baseRecordOf('test-machine', []) }])
    ).toEqual([]);
    expect(runDeleted(recorded, machine, [{ path, data: null, parseError: 'x' }])).toEqual([]);
  });

  it('main に記録が無ければ報告しない（main のスキーマも読まない）', () => {
    const noRecord = { ...machine, 'provenance/README.md': '# provenance' };
    expect(runDeleted(noRecord, machine, [])).toEqual([]);
  });

  it('main の記録が不正なら例外を投げる（CLI は終了コード 2 にする）', () => {
    const broken = {
      ...recorded,
      'provenance/test-machine.json': JSON.stringify({ machineId: 'test-machine' }),
    };
    expect(() => runDeleted(broken, machine, [])).toThrow(
      'main の出典記録が不正: provenance/test-machine.json: '
    );
  });
});
