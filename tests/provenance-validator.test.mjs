import { describe, it, expect } from 'vitest';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';
import { toStoredProbability } from '../scripts/lib/provenance.mjs';

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
    ...overrides,
  };
}

function run(rec, { path = 'provenance/test-machine.json', files = machineFiles } = {}) {
  return validateProvenance(files, index, [{ path, data: rec }]);
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

  it('機種ファイルに無い項目の記録はエラー', () => {
    const rec = record();
    rec.items.push({ ...rec.items[0], name: 'REG' });
    expect(messages(run(rec))).toContain('role::REG: 機種ファイルに無い項目の記録');
  });

  it('機種ファイルの値が採用値と違えばエラー', () => {
    const other = { 1: 300, 6: 277.7 };
    const rec = record();
    rec.items[0] = {
      ...rec.items[0],
      values: { chonborista: other, 'nana-press': other },
      adopted: other,
    };
    expect(messages(run(rec))).toContain('role::BIG: 機種ファイルの値が採用値と一致しない');
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
      removed: [{ kind: 'role', name: 'BIG', previous: BIG, reason: '出典なし' }],
    });
    expect(messages(run(rec))).toContain('外したはずの項目が機種ファイルにある');
  });

  it('unit と値の形が合わなければ、形のエラーだけを出す', () => {
    const rec = record();
    rec.items[0] = { ...rec.items[0], unit: 'percent' };
    expect(run(rec).errors.map((e) => e.message)).toEqual([
      'role::BIG: adopted が unit=percent の形に合わない（設定ごとの 0〜100 の割合が必要）',
      'role::BIG: values.chonborista が unit=percent の形に合わない（設定ごとの 0〜100 の割合が必要）',
      'role::BIG: values.nana-press が unit=percent の形に合わない（設定ごとの 0〜100 の割合が必要）',
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
      'role::BIG: unit=presence は使えない（機種ファイルの項目に合わせて denominator か percent にする）'
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

  it('確率 0 を含む項目は分母で表せないのでエラー', () => {
    const zero = {
      ...machine,
      roles: [{ ...machine.roles[0], probabilities: { 1: 0, 6: toStoredProbability(277.7) } }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: zero }];
    expect(messages(run(record(), { files }))).toContain('で表せない');
  });

  it('機種ファイルの項目名を区別できないときは、落ちずにエラーとして報告する', () => {
    const clash = {
      ...machine,
      endScreens: [{ name: '仁' }, { name: '仁#2' }, { name: '仁' }],
    };
    const files = [{ path: 'machines/test/test-machine.json', data: clash }];
    expect(messages(run(record(), { files }))).toContain('項目の名前を区別できない');
  });
});
