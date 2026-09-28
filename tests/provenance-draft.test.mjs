import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { compileSchema } from '../scripts/lib/compile-schema.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = resolve(ROOT, 'scripts/provenance-draft.mjs');

const SETTINGS = ['1', '2', '3', '4', '5', '6'];
const BY = 'reread-agent-2';

const SOURCES = [
  {
    key: 'chonborista',
    kind: 'analysis-site',
    url: 'https://chonborista.com/slot/test/1/',
    retrievedAt: '2026-09-28',
  },
  {
    key: 'nana',
    kind: 'analysis-site',
    url: 'https://nana-press.com/kaiseki/machine/1/',
    retrievedAt: '2026-09-28',
  },
  {
    key: 'dmm',
    kind: 'analysis-site',
    url: 'https://p-town.dmm.com/machines/1',
    retrievedAt: '2026-09-28',
  },
];

/** 設定ごとに同じ値の表 */
function every(settings, value) {
  return Object.fromEntries(settings.map((s) => [s, value]));
}

/** 今日の日付（道具と同じく、実行した環境の日付） */
function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ================================================================
// 新台（machines/index.json に無い機種）
// ================================================================

const NEW_SETTINGS = ['1', '2', '4', '5', '6'];

function newExtract() {
  return {
    machineId: 'new-machine',
    machineName: 'L新台',
    machineFile: 'new/new-machine.json',
    availableSettings: NEW_SETTINGS,
    sources: SOURCES,
    items: [
      {
        kind: 'role',
        name: 'BIG',
        unit: 'denominator',
        values: {
          chonborista: { 1: '300.0', 2: 295.2, 4: 280.5, 5: 270.3, 6: 260.1 },
          nana: { 1: 300, 2: '295.20', 4: 280.5, 5: 270.3, 6: 260.1 },
        },
      },
      {
        kind: 'role',
        name: 'REG',
        unit: 'denominator',
        values: { chonborista: { 1: 500, 2: 490, 4: 480, 5: 470, 6: 460 } },
      },
      {
        kind: 'role',
        name: 'チェリー',
        unit: 'denominator',
        values: { chonborista: every(NEW_SETTINGS, 100) },
      },
      {
        kind: 'trialSuccessRate',
        name: 'CZ成功率',
        unit: 'percent',
        values: { nana: { 1: '30.0', 2: 31, 4: 33, 5: 35, 6: 40 } },
      },
      { kind: 'role', name: '中段チェリー', unit: 'denominator', values: {} },
      {
        kind: 'trialSuccessRate',
        name: 'AT突入率',
        unit: 'percent',
        values: {
          chonborista: { 1: 3.1, 2: 3.2, 4: 3.5, 5: 3.9, 6: 4.5 },
          dmm: { 1: '3.10', 2: 3.2, 4: 3.5, 5: 3.9, 6: 4.5 },
        },
      },
      {
        kind: 'endScreen',
        name: '金',
        unit: 'settings',
        values: {
          chonborista: { confirmed: ['5', '6'], excluded: [] },
          nana: { confirmed: ['6', '5'], excluded: [] },
        },
      },
      {
        kind: 'confirmationEvent',
        name: 'エンディング',
        unit: 'presence',
        values: { nana: true, dmm: true },
      },
    ],
  };
}

function newReread() {
  return {
    machineId: 'new-machine',
    by: BY,
    items: [
      {
        kind: 'role',
        name: 'BIG',
        source: 'chonborista',
        value: { 1: 300, 2: 295.2, 4: 280.5, 5: 270.3, 6: 260.1 },
      },
      // ちょんぼりすた以外の行は、採否に使わない（記録にも付けない）
      { kind: 'role', name: 'BIG', source: 'nana', value: every(NEW_SETTINGS, 999) },
      {
        kind: 'role',
        name: 'REG',
        source: 'chonborista',
        value: { 1: '500.0', 2: 490, 4: 480, 5: 470, 6: 460 },
      },
      { kind: 'role', name: 'チェリー', source: 'chonborista', value: every(NEW_SETTINGS, 120) },
      {
        kind: 'endScreen',
        name: '金',
        source: 'chonborista',
        value: { confirmed: ['5', '6'], excluded: [] },
      },
    ],
  };
}

// ================================================================
// 既存の機種（machines/index.json にある機種）
// ================================================================

function oldMachine() {
  return {
    name: 'L既存機',
    type: 'スマスロ',
    author: 'test',
    version: '1.0.0',
    lastUpdated: '2026-09-01',
    roles: [
      {
        name: 'BIG',
        // 有効数字7桁（残す値は、有効数字6桁に丸め直さずそのまま書く）
        probabilities: every(SETTINGS, 0.003333333),
        hasSettingDiff: false,
        displayOrder: 1,
      },
      {
        name: 'REG',
        probabilities: every(SETTINGS, 0.002),
        hasSettingDiff: false,
        displayOrder: 2,
      },
      {
        name: 'スイカ',
        probabilities: every(SETTINGS, 0.0125),
        hasSettingDiff: false,
        displayOrder: 3,
      },
    ],
    confirmationEvents: [
      { name: '虹', id: 'ev-niji', confirmedSettings: ['6'], excludedSettings: [] },
      { name: '金', confirmedSettings: ['4', '5', '6'], excludedSettings: [] },
      { name: '白', id: 'ev-shiro', confirmedSettings: ['2', '4', '6'], excludedSettings: [] },
      { name: '青', id: 'ev-ao', confirmedSettings: ['5', '6'], excludedSettings: [] },
    ],
    endScreens: [{ name: 'X', distribution: every(SETTINGS, 0.5) }],
  };
}

/** 前の見直しの出典記録（外した ID の台帳にベルがある） */
function oldRecord() {
  return {
    machineId: 'old-machine',
    machineFile: 'old/old-machine.json',
    reviewedAt: '2026-09-01',
    sources: [SOURCES[1]],
    items: [],
    candidates: [],
    removed: [
      {
        kind: 'role',
        name: 'ベル',
        unit: 'denominator',
        previous: { name: 'ベル', probabilities: every(SETTINGS, 0.1) },
        values: {},
        appId: 'beru_9',
        reason: '出典なし',
      },
    ],
    retiredIds: [{ kind: 'role', name: 'ベル', appId: 'beru_9' }],
  };
}

function oldExtract() {
  return {
    machineId: 'old-machine',
    machineName: 'L既存機',
    machineFile: 'old/old-machine.json',
    availableSettings: SETTINGS,
    sources: SOURCES,
    items: [
      { kind: 'role', name: 'BIG', unit: 'denominator', values: { nana: every(SETTINGS, 300) } },
      {
        kind: 'role',
        name: 'REG',
        unit: 'denominator',
        values: { chonborista: every(SETTINGS, '480.0'), nana: every(SETTINGS, 480) },
      },
      { kind: 'role', name: 'スイカ', unit: 'denominator', values: {} },
      {
        kind: 'role',
        name: 'チェリー',
        unit: 'denominator',
        values: { chonborista: every(SETTINGS, 100), nana: every(SETTINGS, '100.0') },
      },
      { kind: 'confirmationEvent', name: '虹', unit: 'settings', values: {} },
      {
        kind: 'confirmationEvent',
        name: '金',
        unit: 'settings',
        values: { chonborista: { confirmed: ['5', '6'], excluded: [] } },
      },
      {
        kind: 'confirmationEvent',
        name: '白',
        unit: 'settings',
        values: { nana: { confirmed: ['2', '4', '6'], excluded: [] } },
      },
      {
        // 今の値と違うちょんぼりすたの値だけ。読み直しが合えば暫定（provisional-chonborista）
        kind: 'confirmationEvent',
        name: '青',
        unit: 'settings',
        values: { chonborista: { confirmed: ['6'], excluded: [] } },
      },
      { kind: 'endScreen', name: 'X', unit: 'percent', values: {} },
      {
        kind: 'trialSuccessRate',
        name: 'AT初当り',
        unit: 'percent',
        values: { dmm: every(SETTINGS, 50) },
      },
    ],
  };
}

function oldReread() {
  return {
    machineId: 'old-machine',
    by: BY,
    items: [
      {
        kind: 'confirmationEvent',
        name: '金',
        source: 'chonborista',
        value: { confirmed: ['6'], excluded: [] },
      },
      {
        kind: 'confirmationEvent',
        name: '青',
        source: 'chonborista',
        value: { confirmed: ['6'], excluded: [] },
      },
    ],
  };
}

// ================================================================
// 一時フォルダのリポジトリ
// ================================================================

describe('scripts/provenance-draft.mjs', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'provenance-draft-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeJson(rel, data) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    return path;
  }

  /** machines/index.json と機種ファイル、出典記録を置く */
  function setupRepo({ machines = [], records = [] } = {}) {
    writeJson('machines/index.json', {
      version: '3.9.0',
      machines: machines.map(({ id, file }) => ({ id, file })),
    });
    for (const { file, data } of machines) writeJson(`machines/${file}`, data);
    for (const record of records) writeJson(`provenance/${record.machineId}.json`, record);
  }

  function setupOld({ machine = oldMachine(), records = [oldRecord()] } = {}) {
    setupRepo({
      machines: [{ id: 'old-machine', file: 'old/old-machine.json', data: machine }],
      records,
    });
  }

  function run(args) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });
  }

  function draft(extract, reread) {
    const args = [writeJson('notes/m.extract.json', extract), '--root', dir];
    if (reread !== undefined) args.push('--reread', writeJson('notes/m.reread.json', reread));
    return run(args);
  }

  /** 終了コード 0 と、標準出力の1つの JSON */
  function succeeded(result) {
    expect(result.stderr).not.toContain('Error:');
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout);
  }

  /** 終了コード 1（下書きを出さない）と、標準エラー */
  function rejected(result) {
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    return result.stderr;
  }

  describe('新台（index.json に無い機種）', () => {
    it('項目ごとに新しい値の規則で決め、設定はメモの availableSettings を使う', () => {
      setupRepo();
      const { record } = succeeded(draft(newExtract(), newReread()));
      const [chonborista, nana, dmm] = SOURCES;
      expect(record).toEqual({
        machineId: 'new-machine',
        machineFile: 'new/new-machine.json',
        reviewedAt: expect.any(String),
        sources: [chonborista, nana, dmm],
        items: [
          {
            kind: 'role',
            name: 'BIG',
            status: 'confirmed',
            unit: 'denominator',
            values: newExtract().items[0].values,
            adopted: { 1: '300.0', 2: 295.2, 4: 280.5, 5: 270.3, 6: 260.1 },
            reread: { by: BY, value: newReread().items[0].value },
          },
          {
            kind: 'role',
            name: 'REG',
            status: 'provisional-chonborista',
            unit: 'denominator',
            values: newExtract().items[1].values,
            adopted: { 1: 500, 2: 490, 4: 480, 5: 470, 6: 460 },
            reread: { by: BY, value: newReread().items[2].value },
          },
          {
            kind: 'trialSuccessRate',
            name: 'AT突入率',
            status: 'confirmed',
            unit: 'percent',
            values: newExtract().items[5].values,
            adopted: { 1: 3.1, 2: 3.2, 4: 3.5, 5: 3.9, 6: 4.5 },
          },
          {
            kind: 'endScreen',
            name: '金',
            status: 'confirmed',
            unit: 'settings',
            values: newExtract().items[6].values,
            adopted: { confirmed: ['5', '6'], excluded: [] },
            reread: { by: BY, value: { confirmed: ['5', '6'], excluded: [] } },
          },
          {
            kind: 'confirmationEvent',
            name: 'エンディング',
            status: 'confirmed',
            unit: 'presence',
            values: { nana: true, dmm: true },
            adopted: true,
          },
        ],
        candidates: [
          {
            kind: 'role',
            name: 'チェリー',
            unit: 'denominator',
            values: newExtract().items[2].values,
            reason: 'ちょんぼりすたの値だけで、読み直しが無いか一致しない',
          },
          {
            kind: 'trialSuccessRate',
            name: 'CZ成功率',
            unit: 'percent',
            values: newExtract().items[3].values,
            reason: '全設定がそろった出典が1つだけ（ちょんぼりすた以外）',
          },
          {
            kind: 'role',
            name: '中段チェリー',
            unit: 'denominator',
            values: {},
            reason: '出典なし',
          },
        ],
        removed: [],
        retiredIds: [],
      });
    });

    it('機種ファイルに書く値: 確定・暫定の数値は有効数字6桁の確率、設定の組・有無は採用値', () => {
      setupRepo();
      const { machineValues } = succeeded(draft(newExtract(), newReread()));
      expect(machineValues).toEqual([
        {
          kind: 'role',
          name: 'BIG',
          status: 'confirmed',
          value: { 1: 0.00333333, 2: 0.00338753, 4: 0.00356506, 5: 0.00369959, 6: 0.00384468 },
        },
        {
          kind: 'role',
          name: 'REG',
          status: 'provisional-chonborista',
          value: { 1: 0.002, 2: 0.00204082, 4: 0.00208333, 5: 0.00212766, 6: 0.00217391 },
        },
        {
          kind: 'trialSuccessRate',
          name: 'AT突入率',
          status: 'confirmed',
          value: { 1: 0.031, 2: 0.032, 4: 0.035, 5: 0.039, 6: 0.045 },
        },
        {
          kind: 'endScreen',
          name: '金',
          status: 'confirmed',
          value: { confirmed: ['5', '6'], excluded: [] },
        },
        { kind: 'confirmationEvent', name: 'エンディング', status: 'confirmed', value: true },
      ]);
    });

    it('読み直しのメモが無ければ、ちょんぼりすただけの値は候補にする', () => {
      setupRepo();
      const { record } = succeeded(draft(newExtract()));
      expect(record.items.map((item) => item.name)).toEqual([
        'BIG',
        'AT突入率',
        '金',
        'エンディング',
      ]);
      expect(record.items.some((item) => 'reread' in item)).toBe(false);
      expect(record.candidates.find((c) => c.name === 'REG').reason).toBe(
        'ちょんぼりすたの値だけで、読み直しが無いか一致しない'
      );
    });

    it('下書きの記録は出典記録のスキーマと validate を通る（機種ファイルは機種ファイルに書く値で作る）', () => {
      setupRepo();
      const { record, machineValues } = succeeded(draft(newExtract(), newReread()));
      const value = (name) => machineValues.find((v) => v.name === name).value;
      const machine = {
        name: 'L新台',
        availableSettings: NEW_SETTINGS,
        roles: [
          { name: 'BIG', probabilities: value('BIG'), hasSettingDiff: true, displayOrder: 1 },
          { name: 'REG', probabilities: value('REG'), hasSettingDiff: true, displayOrder: 2 },
        ],
        trialSuccessRates: [{ id: 'at-rate', name: 'AT突入率', probabilities: value('AT突入率') }],
        endScreens: [
          {
            name: '金',
            confirmedSettings: value('金').confirmed,
            excludedSettings: value('金').excluded,
          },
        ],
        confirmationEvents: [
          // 有無（presence）の項目は、確定・否定の設定を持たない
          { id: 'ending', name: 'エンディング' },
        ],
      };
      const schema = compileSchema('provenance.schema.json');
      expect(schema(record)).toBe(true);
      const result = validateProvenance(
        [{ path: 'machines/new/new-machine.json', data: machine }],
        { machines: [{ id: 'new-machine', file: 'new/new-machine.json' }] },
        [{ path: 'provenance/new-machine.json', data: record }],
        { officialDomains: [] }
      );
      expect(result.errors).toEqual([]);
    });
  });

  describe('既存の機種（index.json にある機種）', () => {
    it('機種ファイルにある項目は既存の値の規則、無い項目は新しい値の規則で決める', () => {
      setupOld();
      const { record, machineValues } = succeeded(draft(oldExtract(), oldReread()));
      const status = Object.fromEntries(record.items.map((item) => [item.name, item.status]));
      expect(status).toEqual({
        BIG: 'kept-single-source',
        REG: 'confirmed',
        チェリー: 'confirmed',
        白: 'kept-single-source',
        青: 'provisional-chonborista',
      });
      expect(record.items.find((item) => item.name === '青').reread).toEqual({
        by: BY,
        value: { confirmed: ['6'], excluded: [] },
      });
      expect(record.candidates).toEqual([
        {
          kind: 'trialSuccessRate',
          name: 'AT初当り',
          unit: 'percent',
          values: { dmm: every(SETTINGS, 50) },
          reason: '全設定がそろった出典が1つだけ（ちょんぼりすた以外）',
        },
      ]);
      // 残す値は機種ファイルの今の確率そのもの、確定の値は採用値を有効数字6桁にした確率
      expect(machineValues).toEqual([
        {
          kind: 'role',
          name: 'BIG',
          status: 'kept-single-source',
          value: every(SETTINGS, 0.003333333),
        },
        { kind: 'role', name: 'REG', status: 'confirmed', value: every(SETTINGS, 0.00208333) },
        { kind: 'role', name: 'チェリー', status: 'confirmed', value: every(SETTINGS, 0.01) },
        {
          kind: 'confirmationEvent',
          name: '白',
          status: 'kept-single-source',
          value: { confirmed: ['2', '4', '6'], excluded: [] },
        },
        {
          kind: 'confirmationEvent',
          name: '青',
          status: 'provisional-chonborista',
          value: { confirmed: ['6'], excluded: [] },
        },
      ]);
    });

    it('外す項目は removed に、機種ファイルの生の項目・ID を持つ項目の appId・理由・読み直しを書く', () => {
      setupOld();
      const { record } = succeeded(draft(oldExtract(), oldReread()));
      const machine = oldMachine();
      expect(record.removed).toEqual([
        {
          kind: 'role',
          name: 'スイカ',
          unit: 'denominator',
          previous: machine.roles[2],
          values: {},
          appId: 'suika_3',
          reason: '出典なし',
        },
        {
          kind: 'confirmationEvent',
          name: '虹',
          unit: 'settings',
          previous: machine.confirmationEvents[0],
          values: {},
          appId: 'ev-niji',
          reason: '出典なし',
        },
        {
          // 明示の id の無い確定演出は ID を持たないので appId を書かない。読み直しは status によらず付ける
          kind: 'confirmationEvent',
          name: '金',
          unit: 'settings',
          previous: machine.confirmationEvents[1],
          values: { chonborista: { confirmed: ['5', '6'], excluded: [] } },
          reread: { by: BY, value: { confirmed: ['6'], excluded: [] } },
          reason: '今の値を裏づける出典なし',
        },
        {
          // 最上位の終了画面の previous は distribution のまま
          kind: 'endScreen',
          name: 'X',
          unit: 'percent',
          previous: { name: 'X', distribution: every(SETTINGS, 0.5) },
          values: {},
          appId: 'x',
          reason: '出典なし',
        },
      ]);
    });

    it('今の記録の retiredIds をそのまま先頭に引き継ぎ、外した ID を足す（今の記録の removed は引き継がない）', () => {
      setupOld();
      const { record } = succeeded(draft(oldExtract(), oldReread()));
      expect(record.retiredIds).toEqual([
        { kind: 'role', name: 'ベル', appId: 'beru_9' },
        { kind: 'role', name: 'スイカ', appId: 'suika_3' },
        { kind: 'confirmationEvent', name: '虹', appId: 'ev-niji' },
        { kind: 'endScreen', name: 'X', appId: 'x' },
      ]);
      expect(record.removed.map((removed) => removed.name)).not.toContain('ベル');
    });

    it('今の記録が無ければ、台帳は今回外した ID だけ', () => {
      setupOld({ records: [] });
      const { record } = succeeded(draft(oldExtract(), oldReread()));
      expect(record.retiredIds.map((row) => row.appId)).toEqual(['suika_3', 'ev-niji', 'x']);
    });

    it('下書きの記録は、外した後の機種ファイルで出典記録のスキーマと validate を通る', () => {
      setupOld();
      const { record, machineValues } = succeeded(draft(oldExtract(), oldReread()));
      const value = (name) => machineValues.find((v) => v.name === name).value;
      const before = oldMachine();
      const after = {
        ...before,
        roles: [
          before.roles[0],
          { ...before.roles[1], probabilities: value('REG') },
          {
            name: 'チェリー',
            probabilities: value('チェリー'),
            hasSettingDiff: false,
            displayOrder: 4,
          },
        ],
        confirmationEvents: [
          before.confirmationEvents[2],
          { ...before.confirmationEvents[3], confirmedSettings: value('青').confirmed },
        ],
        endScreens: [],
      };
      expect(compileSchema('provenance.schema.json')(record)).toBe(true);
      const result = validateProvenance(
        [{ path: 'machines/old/old-machine.json', data: after }],
        { machines: [{ id: 'old-machine', file: 'old/old-machine.json' }] },
        [{ path: 'provenance/old-machine.json', data: record }],
        { officialDomains: [] }
      );
      expect(result.errors).toEqual([]);
    });

    it('機種ファイル・出典記録は書き換えない', () => {
      setupOld();
      const machinePath = join(dir, 'machines/old/old-machine.json');
      const recordPath = join(dir, 'provenance/old-machine.json');
      const before = [readFileSync(machinePath, 'utf-8'), readFileSync(recordPath, 'utf-8')];
      succeeded(draft(oldExtract(), oldReread()));
      expect([readFileSync(machinePath, 'utf-8'), readFileSync(recordPath, 'utf-8')]).toEqual(
        before
      );
    });
  });

  describe('機種ファイルと合わないメモ（終了コード 1・下書きを出さない）', () => {
    it('機種ファイルの項目（#2 の付いた名前も）がメモに無ければ、無い項目を並べる', () => {
      const machine = oldMachine();
      machine.roles.push({ ...machine.roles[2], displayOrder: 4 });
      setupOld({ machine });
      const extract = oldExtract();
      extract.items = extract.items.filter((item) => item.name !== 'BIG');
      const stderr = rejected(draft(extract, oldReread()));
      expect(stderr).toContain('role BIG');
      expect(stderr).toContain('role スイカ#2');
      expect(stderr).toContain('values: {}');
      expect(stderr).not.toContain('role REG');
    });

    it('同じ kind と name の行が2つあれば止める（新台でも）', () => {
      setupRepo();
      const extract = newExtract();
      extract.items.push({ ...extract.items[4] });
      expect(rejected(draft(extract))).toContain('role 中段チェリー');
    });

    it('values の出典キーがメモの sources に無ければ止める', () => {
      setupRepo();
      const extract = newExtract();
      extract.items[4].values = { hissyou: every(NEW_SETTINGS, 1000) };
      expect(rejected(draft(extract))).toContain('hissyou');
    });

    it('sources に同じ出典キーが2つあれば止める', () => {
      setupRepo();
      const extract = newExtract();
      extract.sources = [...SOURCES, { ...SOURCES[1], url: 'https://nana-press.com/other/' }];
      expect(rejected(draft(extract))).toContain('nana');
    });

    it('availableSettings が機種ファイルの設定（無ければ 1〜6）と違えば止める', () => {
      setupOld();
      const extract = oldExtract();
      extract.availableSettings = ['1', '2', '4', '5', '6'];
      expect(rejected(draft(extract, oldReread()))).toContain('availableSettings');

      const machine = { ...oldMachine(), availableSettings: ['1', '2', '4', '5', '6'] };
      setupOld({ machine });
      expect(rejected(draft(oldExtract(), oldReread()))).toContain('availableSettings');
    });

    it('availableSettings の並びだけの違いは止めない', () => {
      setupOld();
      const extract = oldExtract();
      extract.availableSettings = ['6', '5', '4', '3', '2', '1'];
      succeeded(draft(extract, oldReread()));
    });

    it('最上位の終了画面に空でない patterns があれば、先に expand-patterns で書き直すよう示して止める', () => {
      const machine = oldMachine();
      machine.endScreens[0] = {
        name: 'X',
        patterns: [{ name: 'X-1', confirmedSettings: ['6'], excludedSettings: [] }],
      };
      setupOld({ machine });
      const stderr = rejected(draft(oldExtract(), oldReread()));
      expect(stderr).toContain('node scripts/expand-patterns.mjs');
      expect(stderr).toContain('--write');
    });

    it('空の patterns は止めない', () => {
      const machine = oldMachine();
      machine.endScreens[0] = { ...machine.endScreens[0], patterns: [] };
      setupOld({ machine });
      succeeded(draft(oldExtract(), oldReread()));
    });

    it('machineFile が index.json のその機種の行と違えば止める', () => {
      setupOld();
      const extract = { ...oldExtract(), machineFile: 'old/other.json' };
      expect(rejected(draft(extract, oldReread()))).toContain('machineFile');
    });

    it('機種ファイルの項目に使えない unit なら止める', () => {
      setupOld();
      const extract = oldExtract();
      extract.items[0] = {
        ...extract.items[0],
        unit: 'percent',
        values: { nana: every(SETTINGS, 30) },
      };
      const stderr = rejected(draft(extract, oldReread()));
      expect(stderr).toContain('role BIG');
      expect(stderr).toContain('denominator');
    });

    it('zoneRole・endScreenGroupItem の名前は「親::子」、ほかの種類の名前に「::」は使えない', () => {
      setupRepo();
      const zone = newExtract();
      zone.items[4] = { ...zone.items[4], kind: 'zoneRole' };
      expect(rejected(draft(zone))).toContain('zoneRole 中段チェリー');

      const role = newExtract();
      role.items[4] = { ...role.items[4], name: 'AT::中段チェリー' };
      expect(rejected(draft(role))).toContain('role AT::中段チェリー');
    });
  });

  describe('外した ID の台帳（retiredIds）の ID を新しい項目が使うとき（終了コード 1）', () => {
    function recordWithRetired(rows) {
      return { ...oldRecord(), removed: [], retiredIds: rows };
    }

    it('引き継いだ台帳の ID を、足し直す項目が使うことになれば、明示の別の id が要ると示して止める', () => {
      setupOld({
        records: [recordWithRetired([{ kind: 'endScreen', name: 'BLUE', appId: 'blue' }])],
      });
      const extract = oldExtract();
      extract.items.push({
        kind: 'endScreen',
        name: 'BLUE',
        unit: 'settings',
        values: {
          nana: { confirmed: ['4'], excluded: [] },
          dmm: { confirmed: ['4'], excluded: [] },
        },
      });
      const stderr = rejected(draft(extract, oldReread()));
      expect(stderr).toContain('endScreen BLUE');
      expect(stderr).toContain('（blue）');
      expect(stderr).toContain('明示の');
    });

    it('今回外した項目の ID を、新しい項目が使うことになっても止める', () => {
      setupOld({ records: [] });
      const extract = oldExtract();
      extract.items.push({
        kind: 'endScreen',
        name: 'x',
        unit: 'settings',
        values: {
          nana: { confirmed: ['4'], excluded: [] },
          dmm: { confirmed: ['4'], excluded: [] },
        },
      });
      const stderr = rejected(draft(extract, oldReread()));
      expect(stderr).toContain('endScreen x');
      expect(stderr).toContain('（x）');
    });

    it('ゾーンの中の役は、外す項目を除いたそのゾーンの末尾に足したときの ID で確かめる', () => {
      const machine = {
        name: 'Lゾーン機',
        roles: [],
        zones: [
          {
            name: 'AT',
            isDefault: false,
            roles: [
              { name: 'チェリー', probabilities: every(SETTINGS, 0.01), displayOrder: 1 },
              { name: 'ベル', probabilities: every(SETTINGS, 0.1), displayOrder: 2 },
            ],
          },
        ],
      };
      // 前の見直しで、AT の2番目の役だったスイカ（suika_2）を外した
      const record = recordWithRetired([
        { kind: 'zoneRole', name: 'AT::スイカ', appId: 'suika_2' },
      ]);
      setupOld({ machine, records: [record] });
      const extract = {
        ...oldExtract(),
        items: [
          {
            kind: 'zoneRole',
            name: 'AT::チェリー',
            unit: 'denominator',
            values: { nana: every(SETTINGS, 100) },
          },
          { kind: 'zoneRole', name: 'AT::ベル', unit: 'denominator', values: {} },
          {
            kind: 'zoneRole',
            name: 'AT::スイカ',
            unit: 'denominator',
            values: { nana: every(SETTINGS, 80), dmm: every(SETTINGS, '80.0') },
          },
        ],
      };
      const stderr = rejected(draft(extract));
      expect(stderr).toContain('zoneRole AT::スイカ');
      expect(stderr).toContain('（suika_2）');
    });

    it('採用しない（候補の）項目や、台帳と違う ID になる項目は止めない', () => {
      setupOld({
        records: [recordWithRetired([{ kind: 'endScreen', name: 'BLUE', appId: 'blue' }])],
      });
      const extract = oldExtract();
      extract.items.push(
        {
          kind: 'endScreen',
          name: 'BLUE',
          unit: 'settings',
          values: { dmm: { confirmed: ['4'], excluded: [] } },
        },
        {
          kind: 'endScreen',
          name: 'RED',
          unit: 'settings',
          values: {
            nana: { confirmed: ['5'], excluded: [] },
            dmm: { confirmed: ['5'], excluded: [] },
          },
        }
      );
      const { record } = succeeded(draft(extract, oldReread()));
      expect(record.candidates.map((c) => c.name)).toContain('BLUE');
      expect(record.items.map((item) => item.name)).toContain('RED');
    });
  });

  describe('メモの形の誤り（終了コード 1）', () => {
    it('抜き出しのメモがスキーマに合わない', () => {
      setupRepo();
      const extract = newExtract();
      delete extract.machineFile;
      expect(rejected(draft(extract))).toContain('抜き出しのメモの形に合わない');
    });

    it('読み直しのメモがスキーマに合わない', () => {
      setupRepo();
      const reread = newReread();
      delete reread.by;
      expect(rejected(draft(newExtract(), reread))).toContain('読み直しのメモの形に合わない');
    });

    it('抜き出しの値が unit の形に合わない（percent に null など）', () => {
      setupRepo();
      const extract = newExtract();
      extract.items[3].values.nana = { ...extract.items[3].values.nana, 6: null };
      expect(rejected(draft(extract))).toContain('trialSuccessRate CZ成功率 [nana]');
    });

    it('ちょんぼりすたの読み直しの値が、抜き出しの unit の形に合わない', () => {
      setupRepo();
      const reread = newReread();
      reread.items[2] = { ...reread.items[2], value: true };
      expect(rejected(draft(newExtract(), reread))).toContain('role REG [chonborista]');
    });

    it('読み直しのメモの機種 ID が違う・同じ項目と出典の行が2つある', () => {
      setupRepo();
      expect(rejected(draft(newExtract(), { ...newReread(), machineId: 'other' }))).toContain(
        '機種 ID'
      );
      const reread = newReread();
      reread.items.push({ ...reread.items[2] });
      expect(rejected(draft(newExtract(), reread))).toContain('role REG [chonborista]');
    });
  });

  describe('読めない（終了コード 2）', () => {
    it('メモのファイルが無い・JSON として読めない', () => {
      setupRepo();
      expect(run([join(dir, 'none.json'), '--root', dir]).status).toBe(2);
      const broken = writeJson('notes/broken.json', '{');
      const result = run([broken, '--root', dir]);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      const extract = writeJson('notes/m.extract.json', newExtract());
      expect(run([extract, '--root', dir, '--reread', join(dir, 'none.json')]).status).toBe(2);
    });

    it('index.json・機種ファイル・今の出典記録を読めない', () => {
      const extract = writeJson('notes/m.extract.json', oldExtract());
      expect(run([extract, '--root', dir]).status).toBe(2);

      writeJson('machines/index.json', {
        machines: [{ id: 'old-machine', file: 'old/old-machine.json' }],
      });
      expect(run([extract, '--root', dir]).status).toBe(2);

      setupOld({ records: [] });
      writeJson('provenance/old-machine.json', '{');
      const broken = run([extract, '--root', dir]);
      expect(broken.status).toBe(2);
      expect(broken.stderr).toContain('provenance/old-machine.json');

      writeJson('provenance/old-machine.json', { ...oldRecord(), retiredIds: undefined });
      expect(run([extract, '--root', dir]).status).toBe(2);

      writeJson('provenance/old-machine.json', { ...oldRecord(), machineId: 'other-machine' });
      const other = run([extract, '--root', dir]);
      expect(other.status).toBe(2);
      expect(other.stderr).toContain('machineId');
    });

    it('引数の誤り', () => {
      expect(run([]).status).toBe(2);
      expect(run(['a.json', 'b.json']).status).toBe(2);
      expect(run(['a.json', '--reread']).status).toBe(2);
      const unknown = run(['a.json', '--json']);
      expect(unknown.status).toBe(2);
      expect(unknown.stderr).toContain('知らない引数: --json');
    });
  });

  describe('出力', () => {
    it('標準出力は record と machineValues の1つの JSON で、reviewedAt は実行した日の日付', () => {
      setupRepo();
      const start = localDate();
      const output = succeeded(draft(newExtract(), newReread()));
      expect(Object.keys(output)).toEqual(['record', 'machineValues']);
      expect([start, localDate()]).toContain(output.record.reviewedAt);
    });

    it('--reread=<path>・--root=<dir> の形も受け付ける', () => {
      setupRepo();
      const extract = writeJson('notes/m.extract.json', newExtract());
      const reread = writeJson('notes/m.reread.json', newReread());
      const { record } = succeeded(run([extract, `--reread=${reread}`, `--root=${dir}`]));
      expect(record.items.find((item) => item.name === 'REG').status).toBe(
        'provisional-chonborista'
      );
    });

    it('標準エラーに、候補の数と理由・外す項目・読めなかったページを出す', () => {
      setupOld();
      const extract = oldExtract();
      extract.unreadable = [
        {
          url: 'https://example.com/slot/1/',
          route: 'WebFetch',
          at: '2026-09-28',
          reason: '403 で読めない',
        },
      ];
      const reread = {
        ...oldReread(),
        unreadable: [
          {
            url: 'https://example.com/slot/2/',
            route: 'ブラウザ',
            at: '2026-09-28',
            reason: '画像だけ',
          },
        ],
      };
      const { stderr } = draft(extract, reread);
      expect(stderr).toContain('候補（採用しない）1 件');
      expect(stderr).toContain('全設定がそろった出典が1つだけ（ちょんぼりすた以外）');
      expect(stderr).toContain('trialSuccessRate AT初当り');
      expect(stderr).toContain('外す項目 4 件');
      expect(stderr).toContain('role スイカ: 出典なし（appId: suika_3）');
      expect(stderr).toContain('https://example.com/slot/1/');
      expect(stderr).toContain('403 で読めない');
      expect(stderr).toContain('https://example.com/slot/2/');
    });

    it('読み直しの無い removed で、読み直しが合えば暫定にできるものは、標準エラーで知らせる', () => {
      setupOld();
      const { stderr } = draft(oldExtract());
      expect(stderr).toContain('confirmationEvent 金: 今の値を裏づける出典なし（読み直しが無い');
      expect(stderr).toContain('読み直しのメモを渡していない');
    });
  });
});
