import { describe, it, expect } from 'vitest';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';
import { statusError, toStoredProbability } from '../scripts/lib/provenance.mjs';

const machine = {
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  lastUpdated: '2026-09-26',
  availableSettings: ['1', '6'],
  roles: [
    {
      name: 'BIG',
      probabilities: { 1: toStoredProbability(295.2), 6: toStoredProbability(277.7) },
      hasSettingDiff: true,
      displayOrder: 1,
    },
  ],
  confirmationEvents: [{ name: '金トロフィー', confirmedSettings: ['6'], excludedSettings: ['1'] }],
};

const index = {
  version: '3.8.0',
  updatedAt: '2026-09-26T00:00:00Z',
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

const machineFiles = [{ path: 'machines/test/test-machine.json', data: machine }];

/** BIG の設定1の確率だけを p1 にした機種ファイル（設定6は 1/277.7 の有効数字6桁のまま） */
const filesWithBig1 = (p1) => [
  {
    path: 'machines/test/test-machine.json',
    data: {
      ...machine,
      roles: [{ ...machine.roles[0], probabilities: { 1: p1, 6: toStoredProbability(277.7) } }],
    },
  },
];

const BIG = { 1: 295.2, 6: 277.7 };
const GOLD = { confirmed: ['6'], excluded: ['1'] };

function record(overrides = {}) {
  return {
    machineId: 'test-machine',
    machineFile: 'test/test-machine.json',
    reviewedAt: '2026-09-26',
    sources: [
      {
        key: 'chonborista',
        kind: 'analysis-site',
        url: 'https://chonborista.com/slot/test/',
        retrievedAt: '2026-09-26',
      },
      {
        key: 'nana-press',
        kind: 'analysis-site',
        url: 'https://nana-press.com/kaiseki/machine/1/',
        retrievedAt: '2026-09-26',
      },
    ],
    items: [
      {
        kind: 'role',
        name: 'BIG',
        status: 'confirmed',
        unit: 'denominator',
        values: { chonborista: BIG, 'nana-press': BIG },
        adopted: BIG,
      },
      {
        kind: 'confirmationEvent',
        name: '金トロフィー',
        status: 'confirmed',
        unit: 'settings',
        values: { chonborista: GOLD, 'nana-press': GOLD },
        adopted: GOLD,
      },
    ],
    candidates: [],
    removed: [],
    retiredIds: [],
    ...overrides,
  };
}

function run(
  rec,
  { path = 'provenance/test-machine.json', files = machineFiles, officialDomains } = {}
) {
  return validateProvenance(files, index, [{ path, data: rec }], { officialDomains });
}

function messages(result) {
  return result.errors.map((e) => e.message).join('\n');
}

describe('validateProvenance', () => {
  it('正しい記録ならエラーなし', () => {
    expect(run(record()).errors).toEqual([]);
  });

  it('記録の無い機種は、requireAll でなければエラーにしない', () => {
    expect(validateProvenance(machineFiles, index, []).errors).toEqual([]);
  });

  it('requireAll では記録の無い機種をエラーにする', () => {
    const result = validateProvenance(machineFiles, index, [], { requireAll: true });
    expect(messages(result)).toContain('全機種必須');
  });

  it('JSON が壊れていればエラー', () => {
    const result = validateProvenance(machineFiles, index, [
      { path: 'provenance/test-machine.json', data: null, parseError: 'Unexpected token' },
    ]);
    expect(messages(result)).toContain('JSON パースエラー');
  });

  it('スキーマ違反（出典に url が無い）はエラー', () => {
    const rec = record();
    delete rec.sources[1].url;
    expect(messages(run(rec))).toContain('スキーマ違反');
  });

  it('ファイル名が機種IDと違えばエラー', () => {
    expect(messages(run(record(), { path: 'provenance/other.json' }))).toContain('ファイル名');
  });

  it('index.json に無い機種IDはエラー', () => {
    const rec = record({ machineId: 'unknown' });
    expect(messages(run(rec, { path: 'provenance/unknown.json' }))).toContain(
      'index.json に無い機種ID'
    );
  });

  it('machineFile が index.json と違えばエラー', () => {
    expect(messages(run(record({ machineFile: 'test/other.json' })))).toContain('machineFile');
  });

  it('機種ファイルの項目に記録が無ければエラー', () => {
    const rec = record();
    rec.items = rec.items.filter((item) => item.kind !== 'confirmationEvent');
    expect(messages(run(rec))).toContain('confirmationEvent::金トロフィー: 出典記録がない項目');
  });

  it('機種ファイルに無い項目の記録は、そのエラーだけを出す（確率が無いことによる status の確かめを重ねない）', () => {
    const rec = record();
    rec.items.push({ ...rec.items[0], name: 'REG' });
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::REG: 機種ファイルに無い項目の記録',
    ]);
  });

  it('機種ファイルの値が採用値と違えばエラー（confirmed は、採用値を有効数字6桁にした値と比べる）', () => {
    const other = { 1: 300, 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: other, 'nana-press': other },
      adopted: other,
    };
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::BIG: 機種ファイルの値が、採用値を有効数字6桁にした値と違う（設定 1: 0.00338753 ≠ 0.00333333）',
    ]);
  });

  it('% 表示の値（"3.1%"）を採用値にした分母の項目は、機種ファイルの確率（0.031）と一致して通る', () => {
    const cherry = {
      ...machine,
      roles: [{ ...machine.roles[0], probabilities: { 1: 0.031, 6: toStoredProbability(277.7) } }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: cherry }];
    const shown = { 1: '3.1%', 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: shown, 'nana-press': shown },
      adopted: shown,
    };
    expect(run(rec, { files }).errors).toEqual([]);
  });

  it('confirmed・provisional-chonborista の数値は、採用値を有効数字6桁にした値そのものを機種ファイルに書く（65536 を小数6桁の 0.000015 と書いた約1.7%のずれを止める）', () => {
    // 1/65536 は有効数字6桁で 0.0000152588。小数6桁の 0.000015 は、小数6桁の幅（0.0000145〜0.0000155）では
    // 出典の 65536 と重なってしまう
    const shown = { 1: 65536, 6: 277.7 };
    const confirmed = record();
    confirmed.items[0] = {
      ...confirmed.items[0],
      values: { chonborista: shown, 'nana-press': shown },
      adopted: shown,
    };
    const provisional = record();
    provisional.items[0] = {
      ...provisional.items[0],
      status: 'provisional-chonborista',
      values: { chonborista: shown },
      adopted: shown,
      reread: { by: 'verifier', value: shown },
    };
    for (const rec of [confirmed, provisional]) {
      expect(run(rec, { files: filesWithBig1(0.000015) }).errors.map((e) => e.message)).toEqual([
        'role::BIG: 機種ファイルの値が、採用値を有効数字6桁にした値と違う（設定 1: 0.000015 ≠ 0.0000152588）',
      ]);
      expect(run(rec, { files: filesWithBig1(0.0000152588) }).errors).toEqual([]);
    }
  });

  it('confirmed の採用値 295.4 は、機種ファイルの 1/295.2（0.00338753）と違う（有効数字6桁にすると 0.00338524）', () => {
    const near = { 1: 295.4, 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: near, 'nana-press': near },
      adopted: near,
    };
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::BIG: 機種ファイルの値が、採用値を有効数字6桁にした値と違う（設定 1: 0.00338753 ≠ 0.00338524）',
    ]);
  });

  it('小数6桁で保存した小さい確率（0.000076）: kept-single-source は幅で比べて通る（I-4）が、confirmed は有効数字6桁の値でないと止める', () => {
    // 1 ÷ 0.000076 = 13157.9… の桁で比べると、出典の 13107.2 と一致しない。「残す」は機種ファイルの確率の幅
    // （0.0000755〜0.0000765）で比べる。確定の値は、13107.2 を有効数字6桁にした 0.0000762939 を書く
    const shown = { 1: 13107.2, 6: 277.7 };
    const confirmed = record();
    confirmed.items[0] = {
      ...confirmed.items[0],
      values: { chonborista: shown, 'nana-press': shown },
      adopted: shown,
    };
    const errorsWith = (rec, p1) =>
      run(rec, { files: filesWithBig1(p1) }).errors.map((e) => e.message);
    expect(errorsWith(confirmed, 0.000076)).toEqual([
      'role::BIG: 機種ファイルの値が、採用値を有効数字6桁にした値と違う（設定 1: 0.000076 ≠ 0.0000762939）',
    ]);
    expect(errorsWith(confirmed, 0.0000762939)).toEqual([]);

    const kept = record();
    kept.items[0] = {
      ...kept.items[0],
      status: 'kept-single-source',
      values: { 'nana-press': shown },
      adopted: { 1: 1 / 0.000076, 6: 1 / toStoredProbability(277.7) },
    };
    expect(errorsWith(kept, 0.000076)).toEqual([]);
  });

  it('割合（0.25）: confirmed は有効数字6桁にした値と比べ、kept-single-source は機種ファイルの確率の幅で比べる', () => {
    // 0.25 × 100 = 25 の桁（24.5〜25.5%）で比べると、25.3% も一致してしまう
    const withRates = {
      ...machine,
      trialSuccessRates: [{ name: 'CZ成功率', probabilities: { 1: 0.25, 6: 0.5 } }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: withRates }];
    const item = (value) => ({
      kind: 'trialSuccessRate',
      name: 'CZ成功率',
      status: 'confirmed',
      unit: 'percent',
      values: { chonborista: value, 'nana-press': value },
      adopted: value,
    });
    const rec = record();
    rec.items.push(item({ 1: 25, 6: 50 }));
    expect(run(rec, { files }).errors).toEqual([]);
    rec.items[2] = item({ 1: 25.3, 6: 50 });
    expect(run(rec, { files }).errors.map((e) => e.message)).toEqual([
      'trialSuccessRate::CZ成功率: 機種ファイルの値が、採用値を有効数字6桁にした値と違う（設定 1: 0.25 ≠ 0.253）',
    ]);
    // kept-single-source の採用値が機種ファイルの確率の幅から外れていれば止める（裏づけの出典は合っている）
    rec.items[2] = {
      ...item({ 1: 25.3, 6: 50 }),
      status: 'kept-single-source',
      values: { 'nana-press': { 1: 25, 6: 50 } },
    };
    expect(run(rec, { files }).errors.map((e) => e.message)).toEqual([
      'trialSuccessRate::CZ成功率: 機種ファイルの値が採用値と一致しない',
    ]);
  });

  it('一部の設定だけの採用値の confirmed は、statusError（一部だけの値は採用の候補にならない）と機種ファイルの全設定との比較の両方で止まる', () => {
    const partial = { 1: 295.2 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: partial, 'nana-press': partial },
      adopted: partial,
    };
    const kinds = { chonborista: 'analysis-site', 'nana-press': 'analysis-site' };
    const stored = machine.roles[0].probabilities;
    expect(statusError(rec.items[0], kinds, { stored })).toContain('confirmed には');
    const errors = run(rec).errors.map((e) => e.message);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('role::BIG: confirmed には');
    expect(errors[1]).toBe('role::BIG: 機種ファイルの値が採用値と一致しない');
  });

  it('一部の設定だけの出典を含む記録も、採否の判定どおりなら通る（全設定の2サイト一致・矛盾しない一部だけの出典のある暫定）', () => {
    const site = (key, host) => ({
      key,
      kind: 'analysis-site',
      url: `https://${host}/kaiseki/1/`,
      retrievedAt: '2026-09-26',
    });
    const part = { 1: 295.2 };
    const rec = record();
    rec.sources.push(
      site('p-town-dmm', 'p-town.dmm.com'),
      site('slopachi', 'slopachi-quest.com'),
      site('x-site', 'x-site.example.jp')
    );
    // ちょんぼりすた・なな徹・DMM は設定1だけ。スロパチと X が全設定で一致（採用値はスロパチの値）
    rec.items[0] = {
      ...rec.items[0],
      values: {
        chonborista: part,
        'nana-press': part,
        'p-town-dmm': part,
        slopachi: BIG,
        'x-site': { ...BIG },
      },
      adopted: BIG,
    };
    expect(run(rec).errors).toEqual([]);
    // ちょんぼりすたが全設定、なな徹が矛盾しない一部だけ、読み直し一致 → 暫定
    rec.items[0] = {
      ...rec.items[0],
      status: 'provisional-chonborista',
      values: { chonborista: BIG, 'nana-press': part },
      reread: { by: 'verifier', value: { ...BIG } },
    };
    expect(run(rec).errors).toEqual([]);
  });

  it('kept-single-source は、機種ファイルの確率で裏づけを数える（一部の設定だけの出典も数える）', () => {
    // 採用値は今の機種ファイルの値を分母にしたもの（machineValue の結果）
    const { 1: p1, 6: p6 } = machine.roles[0].probabilities;
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      status: 'kept-single-source',
      values: { 'nana-press': { 1: 295.2 } },
      adopted: { 1: 1 / p1, 6: 1 / p6 },
    };
    expect(run(rec).errors).toEqual([]);
    rec.items[0].values = { 'nana-press': { 1: 295.4 } };
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::BIG: kept-single-source には、採用値と一致する出典が1つ以上必要',
    ]);
  });

  it('機種ファイルに無い項目の kept-single-source・provisional-chonborista も、落ちずにそのエラーだけを出す', () => {
    const rec = record();
    rec.items.push(
      {
        kind: 'role',
        name: 'REG',
        status: 'kept-single-source',
        unit: 'denominator',
        values: { 'nana-press': { 1: 400 } },
        adopted: { 1: 400 },
      },
      {
        kind: 'role',
        name: 'CZ',
        status: 'provisional-chonborista',
        unit: 'denominator',
        values: { chonborista: { 1: 50 } },
        adopted: { 1: 50 },
        reread: { by: 'verifier', value: { 1: 50 } },
      }
    );
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::REG: 機種ファイルに無い項目の記録',
      'role::CZ: 機種ファイルに無い項目の記録',
    ]);
  });

  it('値の文字列は、表示の桁を残した数か % 付きの割合だけ（"1/300" はスキーマ違反）', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], adopted: { 1: '1/300', 6: 277.7 } };
    expect(messages(run(rec))).toContain('スキーマ違反 /items/0/adopted');
  });

  it('confirmed なのに出典が1つだけならエラー', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], values: { chonborista: BIG } };
    expect(messages(run(rec))).toContain('confirmed には');
  });

  it('provisional-chonborista は読み直しが無ければエラー、あれば通る', () => {
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      status: 'provisional-chonborista',
      values: { chonborista: BIG },
    };
    expect(messages(run(rec))).toContain('読み直し');
    rec.items[0].reread = { by: 'verifier', value: BIG };
    expect(run(rec).errors).toEqual([]);
  });

  it('sources に無い出典キーはエラー', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], values: { ...rec.items[0].values, '1geki': BIG } };
    expect(messages(run(rec))).toContain('sources に無い出典キー: 1geki');
  });

  it('chonborista の URL が別のサイトならエラー', () => {
    const rec = record();
    rec.sources[0] = { ...rec.sources[0], url: 'https://example.com/slot/test/' };
    expect(messages(run(rec))).toContain('chonborista の URL');
  });

  it('出典キーの重複はエラー', () => {
    const rec = record();
    rec.sources.push({ ...rec.sources[0] });
    expect(messages(run(rec))).toContain('出典キーの重複');
  });

  it('記録の項目の重複はエラー', () => {
    const rec = record();
    rec.items.push({ ...rec.items[0] });
    expect(messages(run(rec))).toContain('出典記録の項目が重複');
  });

  it('候補（未採用）の項目が機種ファイルにあればエラー', () => {
    const rec = record({
      candidates: [
        { kind: 'role', name: 'BIG', unit: 'denominator', values: {}, reason: '食い違い' },
      ],
    });
    expect(messages(run(rec))).toContain('候補（未採用）なのに機種ファイルにある');
  });

  it('外した項目が機種ファイルに残っていればエラー', () => {
    const rec = record({
      removed: [
        {
          kind: 'role',
          name: 'BIG',
          unit: 'denominator',
          previous: machine.roles[0],
          values: {},
          appId: 'big_1',
          reason: '出典なし',
        },
      ],
    });
    expect(messages(run(rec))).toContain('外したはずの項目が機種ファイルにある');
  });

  it('値の形が unit に合わなければ、形のエラーだけを出す', () => {
    const bad = { 1: 0.5, 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: bad, 'nana-press': bad },
      adopted: bad,
    };
    const problem =
      '設定ごとに、1 以上の分母（数か、表示の桁を残した文字列）、% 付きの割合、または確率 0 を表す null が必要';
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      `role::BIG: adopted が unit=denominator の形に合わない（${problem}）`,
      `role::BIG: values.chonborista が unit=denominator の形に合わない（${problem}）`,
      `role::BIG: values.nana-press が unit=denominator の形に合わない（${problem}）`,
    ]);
  });

  it('役は percent で記録できない（unit は形より先に確かめ、形のエラーを重ねない）', () => {
    // BIG の分母は割合（0〜100）の形にも合わないので、順番か return が崩れると形のエラーが3件増える
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      unit: 'percent',
      values: { chonborista: BIG, 'nana-press': BIG },
      adopted: BIG,
    };
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::BIG: unit=percent は使えない（機種ファイルの項目に合わせて denominator にする）',
    ]);
  });

  it('unit は機種ファイルの項目の中身に合わせる（数値・設定の組の項目を presence にするとエラー）', () => {
    const rec = record();
    rec.items = rec.items.map((item) => ({
      ...item,
      unit: 'presence',
      values: { chonborista: true, 'nana-press': true },
      adopted: true,
    }));
    const result = messages(run(rec));
    expect(result).toContain(
      'role::BIG: unit=presence は使えない（機種ファイルの項目に合わせて denominator にする）'
    );
    expect(result).toContain(
      'confirmationEvent::金トロフィー: unit=presence は使えない（機種ファイルの項目に合わせて settings にする）'
    );
  });

  it('数値も設定の組も無い項目は presence だけ', () => {
    const hintOnly = { ...machine, endScreens: [{ name: '青', hint: '示唆' }] };
    const files = [{ path: 'machines/test/test-machine.json', data: hintOnly }];
    const rec = record();
    rec.items.push({
      kind: 'endScreen',
      name: '青',
      status: 'confirmed',
      unit: 'settings',
      values: { chonborista: GOLD, 'nana-press': GOLD },
      adopted: GOLD,
    });
    expect(messages(run(rec, { files }))).toContain(
      'endScreen::青: unit=settings は使えない（機種ファイルの項目に合わせて presence にする）'
    );
    rec.items[2] = {
      ...rec.items[2],
      unit: 'presence',
      values: { chonborista: true, 'nana-press': true },
      adopted: true,
    };
    expect(run(rec, { files }).errors).toEqual([]);
  });

  it('機種ファイルを読めなければエラー', () => {
    expect(messages(run(record(), { files: [] }))).toContain(
      '機種ファイルを読めない: machines/test/test-machine.json'
    );
  });

  it('requireAll でも、正しい記録がある機種はエラーにしない', () => {
    const provenanceFiles = [{ path: 'provenance/test-machine.json', data: record() }];
    expect(
      validateProvenance(machineFiles, index, provenanceFiles, { requireAll: true }).errors
    ).toEqual([]);
  });

  it('requireAll で、壊れた記録の機種に「出典記録がない」を重ねて出さない', () => {
    const provenanceFiles = [
      { path: 'provenance/test-machine.json', data: null, parseError: 'Unexpected token' },
    ];
    const result = validateProvenance(machineFiles, index, provenanceFiles, { requireAll: true });
    expect(result.errors.map((e) => e.message)).toEqual(['JSON パースエラー: Unexpected token']);
  });

  it('確率 0 の設定は、分母の null で記録する', () => {
    const zero = {
      ...machine,
      roles: [{ ...machine.roles[0], probabilities: { 1: 0, 6: toStoredProbability(277.7) } }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: zero }];
    const withZero = { 1: null, 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: withZero, 'nana-press': withZero },
      adopted: withZero,
    };
    expect(run(rec, { files }).errors).toEqual([]);
    expect(run(record(), { files }).errors.map((e) => e.message)).toEqual([
      'role::BIG: 機種ファイルの値が、採用値を有効数字6桁にした値と違う（設定 1: 0 ≠ 0.00338753）',
    ]);
  });

  it('機種ファイルの項目名を区別できないときは、落ちずにエラーとして報告する', () => {
    const clash = {
      ...machine,
      endScreens: [{ name: '仁' }, { name: '仁#2' }, { name: '仁' }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: clash }];
    expect(messages(run(record(), { files }))).toContain('項目の名前を区別できない');
  });

  it('requireAll で、ファイル名の違う記録の機種に「出典記録がない」を重ねて出さない', () => {
    const provenanceFiles = [{ path: 'provenance/other.json', data: record() }];
    const result = validateProvenance(machineFiles, index, provenanceFiles, { requireAll: true });
    expect(result.errors.map((e) => e.message)).toEqual([
      'ファイル名は provenance/test-machine.json にする',
    ]);
  });

  it('10% 未満の割合（3.1% など）も percent で記録でき、確定・残す・食い違いを丸めの幅で判定する（2026-09-27）', () => {
    const site = (key, host) => ({
      key,
      kind: 'analysis-site',
      url: `https://${host}/kaiseki/1/`,
      retrievedAt: '2026-09-26',
    });
    const withRates = {
      ...machine,
      trialSuccessRates: [
        { name: '強チャンス目CZ当選率', probabilities: { 1: 0.031, 6: 0.047 } },
        { name: '弱チャンス目CZ当選率', probabilities: { 1: 0.0312, 6: 0.0468 } },
        { name: 'ベルCZ当選率', probabilities: { 1: 0.031, 6: 0.047 } },
      ],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: withRates }];
    const SHOWN = { 1: '3.1%', 6: '4.7%' };
    // 設定1の幅（3.25〜3.35%）が SHOWN の幅（3.05〜3.15%）と重ならない
    const RIVAL = { 1: '3.3%', 6: '4.7%' };
    const item = (name, status, values, adopted) => ({
      kind: 'trialSuccessRate',
      name,
      status,
      unit: 'percent',
      values,
      adopted,
    });
    const rec = record();
    rec.sources.push(site('p-town-dmm', 'p-town.dmm.com'), site('slopachi', 'slopachi-quest.com'));
    rec.items.push(
      // 確定: 表示の桁が違っても、丸めの幅（3.05〜3.15% と 3.135〜3.145%）が重なれば一致
      item(
        '強チャンス目CZ当選率',
        'confirmed',
        { chonborista: SHOWN, 'nana-press': { 1: 3.14, 6: 4.66 } },
        SHOWN
      ),
      // 残す: 出典の幅（3.05〜3.15%）が機種ファイルの確率（0.0312）の幅と重なれば裏づけになる
      item(
        '弱チャンス目CZ当選率',
        'kept-single-source',
        { 'nana-press': SHOWN },
        { 1: 3.12, 6: 4.68 }
      ),
      // 食い違い: 3.1% の2サイトと、幅の重ならない 3.3% の2サイトがあるので、確定にできない
      item(
        'ベルCZ当選率',
        'confirmed',
        { chonborista: SHOWN, 'p-town-dmm': SHOWN, 'nana-press': RIVAL, slopachi: RIVAL },
        SHOWN
      )
    );
    expect(run(rec, { files }).errors.map((e) => e.message)).toEqual([
      'trialSuccessRate::ベルCZ当選率: confirmed には、公式の値、または別の値で一致する組の無い2サイト以上の一致が必要（採用値は選んだ出典の値そのもの。公式があれば公式の値）',
    ]);
  });

  it('数値と設定の組の両方がある項目は、数値の側で記録する', () => {
    const both = {
      ...machine,
      endScreens: [{ name: '金', probabilities: { 1: 0.05 }, confirmedSettings: ['6'] }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: both }];
    const rec = record();
    rec.items.push({
      kind: 'endScreen',
      name: '金',
      status: 'confirmed',
      unit: 'settings',
      values: { chonborista: GOLD, 'nana-press': GOLD },
      adopted: GOLD,
    });
    expect(messages(run(rec, { files }))).toContain(
      'endScreen::金: unit=settings は使えない（機種ファイルの項目に合わせて denominator か percent にする）'
    );
  });

  it('同じサイトを2つの出典として数えない', () => {
    const rec = record();
    rec.sources.push({
      key: 'chonborista-2',
      kind: 'analysis-site',
      url: 'https://www.chonborista.com/slot/other/',
      retrievedAt: '2026-09-26',
    });
    expect(messages(run(rec))).toContain(
      '同じサイト（chonborista.com）を2つの出典に登録している: chonborista・chonborista-2'
    );
  });

  it('distribution（アプリが確率として読む古い形）の項目は、数値の unit（denominator か percent）で記録する', () => {
    const withDistribution = {
      ...machine,
      endScreens: [{ name: '金枠', distribution: { 1: 0, 6: 0.01 } }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: withDistribution }];
    const gold = { 1: null, 6: 100 };
    const rec = record();
    rec.items.push({
      kind: 'endScreen',
      name: '金枠',
      status: 'confirmed',
      unit: 'denominator',
      values: { chonborista: gold, 'nana-press': gold },
      adopted: gold,
    });
    expect(run(rec, { files }).errors).toEqual([]);
    rec.items[2] = {
      ...rec.items[2],
      unit: 'presence',
      values: { chonborista: true, 'nana-press': true },
      adopted: true,
    };
    expect(run(rec, { files }).errors.map((e) => e.message)).toEqual([
      'endScreen::金枠: unit=presence は使えない（機種ファイルの項目に合わせて denominator か percent にする）',
    ]);
  });

  it('patterns 形式の項目は、出典記録の形を決めるまで記録できない（段階1で決める）', () => {
    const withPatterns = {
      ...machine,
      endScreens: [{ name: '殲滅', patterns: [{ name: 'P1', setting: 'default' }] }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: withPatterns }];
    const rec = record();
    rec.items.push({
      kind: 'endScreen',
      name: '殲滅',
      status: 'confirmed',
      unit: 'presence',
      values: { chonborista: true, 'nana-press': true },
      adopted: true,
    });
    expect(run(rec, { files }).errors.map((e) => e.message)).toEqual([
      'endScreen::殲滅: patterns 形式の項目は、出典記録の形を決めるまで記録できない（段階1で決める）',
    ]);
  });

  it('機種ファイルの項目名に「::」があれば、落ちずにエラーとして報告する', () => {
    const colon = { ...machine, roles: [{ ...machine.roles[0], name: '強::弱' }] };
    const files = [{ path: 'machines/test/test-machine.json', data: colon }];
    expect(run(record(), { files }).errors.map((e) => e.message)).toEqual([
      '項目の名前に「::」は使えない: role 強::弱',
    ]);
  });

  it('chonborista.com の出典（サブドメイン・末尾のドットを含む）は、キーを chonborista にする', () => {
    for (const url of [
      'https://sp.chonborista.com/slot/test/',
      'https://chonborista.com./slot/test/',
    ]) {
      const rec = record();
      rec.sources.push({ key: 'chonbo', kind: 'analysis-site', url, retrievedAt: '2026-09-26' });
      expect(messages(run(rec))).toContain(
        'chonborista.com の出典は、キーを chonborista にする: chonbo'
      );
    }
  });

  it('chonborista の出典は kind を analysis-site にする', () => {
    const rec = record();
    rec.sources[0] = { ...rec.sources[0], kind: 'official' };
    expect(messages(run(rec))).toContain('chonborista の出典は kind を analysis-site にする');
  });

  it('サブドメインが違っても、同じサイト（登録ドメイン）として数える', () => {
    const rec = record();
    rec.sources.push({
      key: 'nana-press-sp',
      kind: 'analysis-site',
      url: 'https://sp.nana-press.com/kaiseki/machine/1/',
      retrievedAt: '2026-09-26',
    });
    expect(messages(run(rec))).toContain(
      '同じサイト（nana-press.com）を2つの出典に登録している: nana-press・nana-press-sp'
    );
  });

  it('.co.jp などの属性型 JP ドメインは末尾3ラベルで数える（別の会社を同じサイトにしない）', () => {
    const source = (key, url) => ({ key, kind: 'official', url, retrievedAt: '2026-09-26' });
    const rec = record();
    rec.sources.push(
      source('maker-a', 'https://www.maker-a.co.jp/slot/'),
      source('maker-a-sp', 'https://SP.Maker-A.co.jp/slot/'),
      source('maker-b', 'https://maker-b.co.jp/slot/')
    );
    const officialDomains = ['maker-a.co.jp', 'maker-b.co.jp'];
    expect(run(rec, { officialDomains }).errors.map((e) => e.message)).toEqual([
      '同じサイト（maker-a.co.jp）を2つの出典に登録している: maker-a・maker-a-sp',
    ]);
  });

  it('実在しない日付はスキーマ違反（月の日数まで見る）', () => {
    for (const reviewedAt of ['2026-13-45', '2026-02-30']) {
      expect(messages(run(record({ reviewedAt })))).toContain('スキーマ違反 /reviewedAt');
    }
  });

  it.each(['https://chonborista.com /x', 'https://chonborista.com:99999/x'])(
    'URL として読めない出典はエラーにする: %s',
    (url) => {
      const rec = record();
      rec.sources.push({ key: 'chonbo', kind: 'analysis-site', url, retrievedAt: '2026-09-26' });
      expect(messages(run(rec))).toContain(`出典の URL を読めない: ${url}`);
    }
  );

  it('URL として読めない出典どうしを、同じサイトとして数えない（サイトの判定から外す）', () => {
    const rec = record();
    const unreadable = ['https://chonborista.com /x', 'https://chonborista.com:99999/x'];
    unreadable.forEach((url, i) => {
      rec.sources.push({ key: `bad-${i}`, kind: 'analysis-site', url, retrievedAt: '2026-09-26' });
    });
    expect(run(rec).errors.map((e) => e.message)).toEqual(
      unreadable.map((url) => `出典の URL を読めない: ${url}`)
    );
  });
});

describe('validateProvenance: 外した項目（removed）', () => {
  /** 外す前の役（main の機種ファイルの項目そのもの）。今の確率は 1/10000 */
  const CHERRY = {
    name: '中段チェリー',
    probabilities: { 1: 0.0001, 6: 0.0001 },
    hasSettingDiff: false,
    displayOrder: 7,
  };
  const OTHER = { 1: 12000, 6: 12000 };
  /** なな徹だけが今の値と違う値を出している（ちょんぼりすたの値は無いので暫定にもできず、外す） */
  const removedCherry = (overrides = {}) => ({
    kind: 'role',
    name: '中段チェリー',
    unit: 'denominator',
    previous: CHERRY,
    values: { 'nana-press': OTHER },
    appId: 'chuudan_cherry_7',
    reason: '今の値を裏づける出典なし',
    ...overrides,
  });
  const SILVER = { name: '銀トロフィー', confirmedSettings: ['6'], excludedSettings: [] };
  /** ID を作らない種類。出典が見つからなかった（values は {}） */
  const removedSilver = (overrides = {}) => ({
    kind: 'confirmationEvent',
    name: '銀トロフィー',
    unit: 'settings',
    previous: SILVER,
    values: {},
    reason: '出典なし',
    ...overrides,
  });
  /** removed の appId を、外した ID の台帳（retiredIds）にも書いた記録で確かめる */
  const rowsOf = (removed) =>
    removed
      .filter((r) => r.appId !== undefined)
      .map(({ kind, name, appId }) => ({ kind, name, appId }));
  const errorsOf = (...removed) =>
    run(record({ removed, retiredIds: rowsOf(removed) })).errors.map((e) => e.message);
  /** key の欄を除いたコピー */
  const without = (object, key) =>
    Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
  const DENOMINATOR_SHAPE =
    '設定ごとに、1 以上の分母（数か、表示の桁を残した文字列）、% 付きの割合、または確率 0 を表す null が必要';

  it('外す条件に合う記録は通る（ID を作る種類は appId を書き、ほかの種類は書かない）', () => {
    expect(errorsOf(removedCherry(), removedSilver())).toEqual([]);
  });

  it('スキーマで欄を確かめる（unit・values が無い・appId が空・previous がオブジェクトでない）', () => {
    for (const bad of [
      without(removedCherry(), 'unit'),
      without(removedCherry(), 'values'),
      removedCherry({ appId: '' }),
      removedCherry({ previous: 1 }),
    ]) {
      expect(messages(run(record({ removed: [bad] })))).toContain('スキーマ違反 /removed/0');
    }
  });

  it('ID を作る種類で appId が無い、ほかの種類で appId があればエラー', () => {
    const removed = [without(removedCherry(), 'appId'), removedSilver({ appId: 'gin' })];
    expect(run(record({ removed })).errors.map((e) => e.message)).toEqual([
      'role::中段チェリー: ID を持つ項目なので、appId（main でアプリが使っていた ID）を書く',
      'confirmationEvent::銀トロフィー: ID を持たない項目なので、appId を書かない',
    ]);
  });

  it('ゾーン内の役・終了画面・グループ内の終了画面も、ID を作る種類として appId を求める', () => {
    const plain = (kind, name) => ({
      kind,
      name,
      unit: 'presence',
      previous: { name: name.split('::').at(-1), hint: '' },
      values: {},
      reason: '出典なし',
    });
    const zoneRole = without(
      removedCherry({ kind: 'zoneRole', name: 'CZ::中段チェリー' }),
      'appId'
    );
    expect(
      errorsOf(plain('endScreen', '青'), plain('endScreenGroupItem', 'End::赤'), zoneRole)
    ).toEqual([
      'endScreen::青: ID を持つ項目なので、appId（main でアプリが使っていた ID）を書く',
      'endScreenGroupItem::End::赤: ID を持つ項目なので、appId（main でアプリが使っていた ID）を書く',
      'zoneRole::CZ::中段チェリー: ID を持つ項目なので、appId（main でアプリが使っていた ID）を書く',
    ]);
  });

  it('unit は外す前の項目（previous）の種類と中身で決まる（項目と同じ文面）', () => {
    expect(errorsOf(removedCherry({ unit: 'percent', values: {} }))).toEqual([
      'role::中段チェリー: unit=percent は使えない（機種ファイルの項目に合わせて denominator にする）',
    ]);
    expect(errorsOf(removedSilver({ unit: 'presence' }))).toEqual([
      'confirmationEvent::銀トロフィー: unit=presence は使えない（機種ファイルの項目に合わせて settings にする）',
    ]);
  });

  it('values の出典キーと値の形、読み直しの形を、項目と同じ文面で確かめる', () => {
    const bad = { 1: 0.5, 6: 12000 };
    expect(errorsOf(removedCherry({ values: { 'nana-press': bad, '1geki': OTHER } }))).toEqual([
      'role::中段チェリー: sources に無い出典キー: 1geki',
      `role::中段チェリー: values.nana-press が unit=denominator の形に合わない（${DENOMINATOR_SHAPE}）`,
    ]);
    expect(errorsOf(removedCherry({ reread: { by: 'verifier', value: bad } }))).toEqual([
      `role::中段チェリー: reread が unit=denominator の形に合わない（${DENOMINATOR_SHAPE}）`,
    ]);
  });

  it('今の値を裏づける出典や確定値があれば外せない（採否ルールが選ぶ status を理由にする）', () => {
    expect(errorsOf(removedCherry({ values: { 'nana-press': { 1: 10000, 6: 10000 } } }))).toEqual([
      'role::中段チェリー: 外す条件に合わない（kept-single-source にできる）',
    ]);
    // 一部の設定だけの出典も「残す」の裏づけに数える
    expect(errorsOf(removedCherry({ values: { 'nana-press': { 6: 10000 } } }))).toEqual([
      'role::中段チェリー: 外す条件に合わない（kept-single-source にできる）',
    ]);
    expect(
      errorsOf(removedCherry({ values: { chonborista: OTHER, 'nana-press': OTHER } }))
    ).toEqual(['role::中段チェリー: 外す条件に合わない（confirmed にできる）']);
    const silver = { confirmed: ['6'], excluded: [] };
    expect(errorsOf(removedSilver({ values: { 'nana-press': silver } }))).toEqual([
      'confirmationEvent::銀トロフィー: 外す条件に合わない（kept-single-source にできる）',
    ]);
  });

  it('読み直しを省いて外せない（ちょんぼりすたの値で暫定にできるときは、読み直しが要る）', () => {
    const onlyChonborista = removedCherry({ values: { chonborista: OTHER } });
    expect(errorsOf(onlyChonborista)).toEqual([
      'role::中段チェリー: 外す前に、ちょんぼりすたの値の読み直しが要る（合えば provisional-chonborista にする）',
    ]);
    // 読み直しが合わなければ、暫定にできないので外せる
    const differs = { by: 'verifier', value: { 1: 11000, 6: 12000 } };
    expect(errorsOf({ ...onlyChonborista, reread: differs })).toEqual([]);
    // 読み直しが合えば、暫定にできるので外せない
    const agrees = { by: 'verifier', value: { ...OTHER } };
    expect(errorsOf({ ...onlyChonborista, reread: agrees })).toEqual([
      'role::中段チェリー: 外す条件に合わない（provisional-chonborista にできる）',
    ]);
    // 設定の組の項目も同じ（ちょんぼりすたにしか無い値）
    const gold = { confirmed: ['5', '6'], excluded: [] };
    expect(errorsOf(removedSilver({ values: { chonborista: gold } }))).toEqual([
      'confirmationEvent::銀トロフィー: 外す前に、ちょんぼりすたの値の読み直しが要る（合えば provisional-chonborista にする）',
    ]);
  });

  it('ちょんぼりすたの値で暫定にできないとき（一部の設定だけ・ほかの出典と矛盾）は、読み直しが無くても外せる', () => {
    expect(errorsOf(removedCherry({ values: { chonborista: { 1: 12000 } } }))).toEqual([]);
    const against = { chonborista: OTHER, 'nana-press': { 1: 15000, 6: 15000 } };
    expect(errorsOf(removedCherry({ values: against }))).toEqual([]);
  });

  it('最上位の終了画面の previous は、distribution を確率として読む（listMachineItems と同じ改名）', () => {
    const removedGold = (values) => ({
      kind: 'endScreen',
      name: '金枠',
      unit: 'denominator',
      previous: { name: '金枠', distribution: { 1: 0, 6: 0.01 } },
      values,
      appId: 'endscreen',
      reason: '出典なし',
    });
    expect(errorsOf(removedGold({}))).toEqual([]);
    expect(errorsOf(removedGold({ 'nana-press': { 1: null, 6: 100 } }))).toEqual([
      'endScreen::金枠: 外す条件に合わない（kept-single-source にできる）',
    ]);
  });
});

describe('validateProvenance: 外した ID の台帳（retiredIds）', () => {
  const CHERRY = {
    name: '中段チェリー',
    probabilities: { 1: 0.0001, 6: 0.0001 },
    hasSettingDiff: false,
    displayOrder: 7,
  };
  const removedCherry = {
    kind: 'role',
    name: '中段チェリー',
    unit: 'denominator',
    previous: CHERRY,
    values: {},
    appId: 'chuudan_cherry_7',
    reason: '出典なし',
  };
  const row = (kind, name, appId) => ({ kind, name, appId });
  const CHERRY_ROW = row('role', '中段チェリー', 'chuudan_cherry_7');
  const errorsOf = (overrides, files) =>
    run(record(overrides), { files }).errors.map((e) => e.message);
  const REUSE = (key, id) => `${key}: 外した項目の ID（${id}）を使っている（明示の id を付ける）`;

  it('removed の appId は、同じ kind・name・appId の行が retiredIds に要る', () => {
    expect(errorsOf({ removed: [removedCherry], retiredIds: [CHERRY_ROW] })).toEqual([]);
    const missing =
      'role::中段チェリー: removed の appId（chuudan_cherry_7）が retiredIds に無い（外した ID の台帳に足す）';
    expect(errorsOf({ removed: [removedCherry], retiredIds: [] })).toEqual([missing]);
    expect(
      errorsOf({ removed: [removedCherry], retiredIds: [row('role', '中段チェリー', 'other')] })
    ).toEqual([missing]);
    expect(
      errorsOf({
        removed: [removedCherry],
        retiredIds: [row('role', '別の役', 'chuudan_cherry_7')],
      })
    ).toEqual([missing]);
  });

  it('retiredIds は removed が無くても残せる（removed は見直しの根拠で、消してよい）', () => {
    expect(errorsOf({ retiredIds: [CHERRY_ROW] })).toEqual([]);
  });

  it('retiredIds に同じ行が2つあればエラー', () => {
    expect(errorsOf({ retiredIds: [CHERRY_ROW, { ...CHERRY_ROW }] })).toEqual([
      'role::中段チェリー: retiredIds の重複（chuudan_cherry_7）',
    ]);
  });

  it('ID を持たない種類は retiredIds に書かない', () => {
    expect(errorsOf({ retiredIds: [row('specialSettings', 'specialSettings', 'x')] })).toEqual([
      'specialSettings::specialSettings: ID を持たない種類は retiredIds に書かない',
    ]);
  });

  it('スキーマで行の欄を確かめる（retiredIds が無い・appId が空・知らない欄）', () => {
    const rec = record();
    delete rec.retiredIds;
    expect(messages(run(rec))).toContain("スキーマ違反  must have required property 'retiredIds'");
    for (const bad of [
      { ...CHERRY_ROW, appId: '' },
      { ...CHERRY_ROW, reason: 'x' },
    ]) {
      expect(messages(run(record({ retiredIds: [bad] })))).toContain('スキーマ違反 /retiredIds/0');
    }
  });

  it('今の機種ファイルの項目が、外した項目の ID を同じ範囲で使っていればエラー（main を読まずに止める）', () => {
    // BIG の ID は big_1
    expect(errorsOf({ retiredIds: [row('role', '旧BIG', 'big_1')] })).toEqual([
      REUSE('role::BIG', 'big_1'),
    ]);
    // 範囲（idScope）が違えば同じ ID でもよい
    expect(errorsOf({ retiredIds: [row('zoneRole', 'CZ::旧BIG', 'big_1')] })).toEqual([]);
  });

  it('ゾーン内の役・グループ内の終了画面は、同じ親の中で外した ID を使えばエラー（別の親ならよい）', () => {
    const withChildren = {
      ...machine,
      zones: [{ name: 'CZ', isDefault: false, roles: [{ ...machine.roles[0], name: 'Bell' }] }],
      endScreenGroups: [{ name: 'End', endScreens: [{ name: 'Red', hint: '' }] }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: withChildren }];
    const reuses = (retiredIds) =>
      errorsOf({ retiredIds }, files).filter((m) => m.includes('外した項目の ID'));
    expect(
      reuses([row('zoneRole', 'CZ::旧', 'bell_1'), row('endScreenGroupItem', 'End::旧', 'red')])
    ).toEqual([
      REUSE('zoneRole::CZ::Bell', 'bell_1'),
      REUSE('endScreenGroupItem::End::Red', 'red'),
    ]);
    expect(
      reuses([row('zoneRole', 'AT::旧', 'bell_1'), row('endScreenGroupItem', 'Top::旧', 'red')])
    ).toEqual([]);
  });

  it('明示の id を持つ確定演出なども ID を持つ項目: removed に appId と台帳の行が要り、今の項目は台帳の id を使えない', () => {
    const SILVER = {
      name: '銀トロフィー',
      id: 'silver',
      confirmedSettings: ['6'],
      excludedSettings: [],
    };
    const removedSilver = {
      kind: 'confirmationEvent',
      name: '銀トロフィー',
      unit: 'settings',
      previous: SILVER,
      values: {},
      appId: 'silver',
      reason: '出典なし',
    };
    const SILVER_ROW = row('confirmationEvent', '銀トロフィー', 'silver');
    expect(errorsOf({ removed: [removedSilver], retiredIds: [SILVER_ROW] })).toEqual([]);
    const noAppId = Object.fromEntries(
      Object.entries(removedSilver).filter(([name]) => name !== 'appId')
    );
    expect(errorsOf({ removed: [noAppId], retiredIds: [] })).toEqual([
      'confirmationEvent::銀トロフィー: ID を持つ項目なので、appId（main でアプリが使っていた ID）を書く',
    ]);
    expect(errorsOf({ removed: [removedSilver], retiredIds: [] })).toEqual([
      'confirmationEvent::銀トロフィー: removed の appId（silver）が retiredIds に無い（外した ID の台帳に足す）',
    ]);
    // 今の機種ファイルの 金トロフィー が、外した id を使う（範囲は種類ごと）
    const withGoldId = {
      ...machine,
      confirmationEvents: [{ ...machine.confirmationEvents[0], id: 'silver' }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: withGoldId }];
    expect(errorsOf({ retiredIds: [SILVER_ROW] }, files)).toEqual([
      REUSE('confirmationEvent::金トロフィー', 'silver'),
    ]);
    expect(errorsOf({ retiredIds: [row('trialSuccessRate', '旧', 'silver')] }, files)).toEqual([]);
  });

  it('外したはずの項目が機種ファイルに残っているときは、そのエラーだけを出す（自分の ID の再利用を重ねない）', () => {
    const removedBig = {
      kind: 'role',
      name: 'BIG',
      unit: 'denominator',
      previous: machine.roles[0],
      values: {},
      appId: 'big_1',
      reason: '出典なし',
    };
    expect(errorsOf({ removed: [removedBig], retiredIds: [row('role', 'BIG', 'big_1')] })).toEqual([
      'role::BIG: 外したはずの項目が機種ファイルにある',
    ]);
  });
});

describe('公式の出典とメーカーのドメインの一覧', () => {
  const official = (key, url) => ({ key, kind: 'official', url, retrievedAt: '2026-09-27' });
  const withOfficial = (...sources) => {
    const rec = record();
    rec.sources.push(...sources);
    return rec;
  };
  const errorsOf = (rec, officialDomains) =>
    run(rec, { officialDomains }).errors.map((e) => e.message);

  it('公式の出典は、URL のサイト（登録ドメイン）が一覧にあれば通る（www.・サブドメインの URL も）', () => {
    const rec = withOfficial(
      official('sammy', 'https://www.sammy.co.jp/japanese/product/'),
      official('daito', 'https://sp.daito.co.jp/slot/')
    );
    expect(errorsOf(rec, ['sammy.co.jp', 'daito.co.jp'])).toEqual([]);
    expect(errorsOf(rec, new Set(['sammy.co.jp', 'daito.co.jp']))).toEqual([]);
  });

  it('一覧に無いドメインの公式の出典はエラー', () => {
    const rec = withOfficial(official('maker', 'https://www.fake-maker.co.jp/slot/'));
    expect(errorsOf(rec, ['sammy.co.jp'])).toEqual([
      '公式の出典のドメインが一覧（config/official-domains.json）に無い: fake-maker.co.jp',
    ]);
    expect(errorsOf(rec, [])).toEqual([
      '公式の出典のドメインが一覧（config/official-domains.json）に無い: fake-maker.co.jp',
    ]);
  });

  it('解析サイト（analysis-site）の出典は、一覧と照らさない', () => {
    expect(errorsOf(record(), [])).toEqual([]);
  });

  it('一覧を読めない（渡されない）ときは、公式の出典を通さず、確かめられないエラーにする', () => {
    const rec = withOfficial(official('sammy', 'https://www.sammy.co.jp/japanese/product/'));
    const expected = [
      '公式の出典を確かめられない（公式ドメインの一覧 config/official-domains.json を読めない）: sammy.co.jp',
    ];
    expect(errorsOf(rec, null)).toEqual(expected);
    expect(
      validateProvenance(machineFiles, index, [
        { path: 'provenance/test-machine.json', data: rec },
      ]).errors.map((e) => e.message)
    ).toEqual(expected);
    // 公式の出典が無ければ、一覧が無くてもエラーにしない
    expect(errorsOf(record(), null)).toEqual([]);
  });

  it('URL として読めない公式の出典は、読めないエラーだけを出す（サイトが分からないので一覧と照らさない）', () => {
    const url = 'https://sammy.co.jp /x';
    expect(errorsOf(withOfficial(official('sammy', url)), [])).toEqual([
      `出典の URL を読めない: ${url}`,
    ]);
  });
});
