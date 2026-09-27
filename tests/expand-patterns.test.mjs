import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  expandEndScreenPatterns,
  expandEndScreenPatternsWithIds,
  rewriteMachineText,
} from '../scripts/lib/expand-patterns.mjs';
import { migrateV1ToV2 } from '../scripts/migrate-v1-to-v2.mjs';
import { runAgainstBase } from '../scripts/lib/against-base.mjs';
import { loadProvenanceFiles } from '../scripts/lib/load-provenance.mjs';
import { validateSchemas } from '../scripts/validators/schema-validator.mjs';
import { validateIndexConsistency } from '../scripts/validators/index-consistency.mjs';
import { validateProbabilities } from '../scripts/validators/probability-validator.mjs';
import { validateConfirmations } from '../scripts/validators/confirmation-validator.mjs';
import { validateCompleteness } from '../scripts/validators/completeness-validator.mjs';
import { validateProvenance } from '../scripts/validators/provenance-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (path) => readFileSync(resolve(ROOT, path), 'utf-8');

const index = JSON.parse(readRepo('machines/index.json'));
// patterns を持つ機種は、見直しで書き直すと減っていく（段階1b・段階2）。数は固定せず、毎回数えた全部を確かめる
const withPatterns = index.machines
  .map((entry) => {
    const text = readRepo(`machines/${entry.file}`);
    return { entry, text, machine: JSON.parse(text) };
  })
  .filter(({ machine }) => (machine.endScreens ?? []).some((s) => (s.patterns ?? []).length > 0));
const noMachineHasPatterns = withPatterns.length === 0;

/** JSON.stringify の2スペースの形（末尾改行）。この形でない機種ファイルもある */
const canonical = (machine) => JSON.stringify(machine, null, 2) + '\n';

// 最上位の endScreens の前後に、文字列の中の ] や "endScreens"・末尾のバックスラッシュ・グループの中の
// endScreens（最上位より前）・すぐ前に数や true・false・null の値（詰めた書き方も）・数の書き方（0.10）・
// 1行の配列を置いた機種。前後は1バイトも変わらない
const TRICKY_BEFORE = [
  '{',
  '  "name": "括弧 ] と \\"endScreens\\": [ を含む名前",',
  '  "description": "末尾がバックスラッシュ\\\\",',
  '  "endScreenGroups": [',
  '    {',
  '      "name": "グループ",',
  '      "endScreens": [{ "name": "中", "patterns": [{ "name": "x", "setting": "6" }] }]',
  '    }',
  '  ],',
  '  "availableSettings": ["1", "2", "5", "6"],',
  '  "count": 3,',
  '  "ratio": -0.10e1,',
  '  "flag": true,"none":null,"off":false,',
  '  "endScreens": ',
].join('\n');
const TRICKY_OLD_ARRAY = [
  '[',
  '    { "id": "p", "name": "親 ]", "type": "bonus_end", "color": "#78909C", "patterns": [',
  '      { "name": "A ]", "setting": "6", "description": "\\"]\\" の説明" },',
  '      { "name": "B", "minSetting": 5 }',
  '    ] },',
  '    { "id": "s", "name": "普通", "hint": "\\"endScreens\\": []" }',
  '  ]',
].join('\n');
const TRICKY_NEW_ARRAY = [
  '[',
  '    {',
  '      "id": "p_1",',
  '      "name": "A ]",',
  '      "type": "bonus_end",',
  '      "hint": "\\"]\\" の説明",',
  '      "confirmedSettings": [',
  '        "6"',
  '      ],',
  '      "color": "#78909C"',
  '    },',
  '    {',
  '      "id": "p_2",',
  '      "name": "B",',
  '      "type": "bonus_end",',
  '      "hint": "",',
  '      "confirmedSettings": [',
  '        "5",',
  '        "6"',
  '      ],',
  '      "color": "#78909C"',
  '    },',
  '    {',
  '      "id": "s",',
  '      "name": "普通",',
  '      "hint": "\\"endScreens\\": []"',
  '    }',
  '  ]',
].join('\n');
const TRICKY_AFTER = [',', '  "rates": [0.10, 0.20],', '  "version": "1.0"', '}', ''].join('\n');

// 最上位に endScreens が2つある機種（JSON.parse は後ろを使う）。最初の配列を差し替えても、読むと後ろが残る
const DUPLICATE_TEXT = [
  '{',
  '  "name": "重なり",',
  '  "endScreens": [],',
  '  "endScreens": [{ "id": "p", "name": "親", "patterns": [{ "name": "A" }] }]',
  '}',
  '',
].join('\n');

/**
 * 2スペースで字下げした機種ファイルで、最上位の "endScreens" の配列の範囲を、行で探す（テストの物差し。
 * 道具の走査とは別のやり方）。キーの行 `  "endScreens": [` の "[" から、字下げ2の閉じる行 `  ]` の "]" まで。
 * JSON の文字列は生の改行を含まないので、行の頭の `  ]` は括弧
 */
function endScreensByLines(text) {
  const key = text.indexOf('\n  "endScreens": [');
  if (key < 0) throw new Error('最上位の "endScreens" の行が無い');
  const start = text.indexOf('[', key);
  const close = /\n {2}\]/g;
  close.lastIndex = start;
  const found = close.exec(text);
  return { start, end: found.index + found[0].length };
}

/** 書き直した文字列が、最上位の endScreens の配列だけを差し替えたものか（配列の外はバイト単位で同じ） */
function expectOnlyEndScreensReplaced(before, after, expectedMachine) {
  const b = endScreensByLines(before);
  const a = endScreensByLines(after);
  expect(after.slice(0, a.start)).toBe(before.slice(0, b.start));
  expect(after.slice(a.end)).toBe(before.slice(b.end));
  // 新しい配列は2スペースで整形し、キーの行（字下げ2）に合わせて字下げする
  expect(after.slice(a.start, a.end)).toBe(
    JSON.stringify(expectedMachine.endScreens, null, 2).replaceAll('\n', '\n  ')
  );
  expect(JSON.parse(after)).toEqual(expectedMachine);
}

describe('expandEndScreenPatterns（合成の機種）', () => {
  it('patterns が無ければ、同じオブジェクトを返す', () => {
    const machine = { name: 'x', endScreens: [{ name: 'a', confirmedSettings: ['6'] }] };
    expect(expandEndScreenPatterns(machine)).toEqual({ machine, expanded: [] });
  });

  it('展開した画面は明示の id を持つ', () => {
    const machine = {
      name: 'x',
      endScreens: [{ id: 'p', name: '親', patterns: [{ name: 'A', setting: '6' }, { name: 'B' }] }],
    };
    const { machine: expanded, expanded: list } = expandEndScreenPatterns(machine);
    expect(expanded.endScreens.map((s) => s.id)).toEqual(['p_1', 'p_2']);
    expect(expanded.endScreens[0].confirmedSettings).toEqual(['6']);
    expect(expanded.endScreens[1].confirmedSettings).toEqual([]);
    expect(list).toEqual([{ name: '親', patterns: 2 }]);
  });

  it('展開した終了画面は、移行処理がパターンから作る値だけを持つ（親に color が無ければ color を書かない）', () => {
    const machine = {
      name: 'x',
      availableSettings: ['1', '2', '4', '5', '6'],
      endScreens: [
        {
          id: 'p',
          name: '親',
          type: 'at_end',
          hint: '親のヒント',
          description: '親の説明',
          patterns: [
            { name: 'A', setting: '6', description: 'Aの説明' },
            { name: 'B', minSetting: 4 },
          ],
        },
      ],
    };
    // toStrictEqual は、値が undefined のキー（color: undefined など）も違いとして扱う
    expect(expandEndScreenPatterns(machine).machine.endScreens).toStrictEqual([
      { id: 'p_1', name: 'A', type: 'at_end', hint: 'Aの説明', confirmedSettings: ['6'] },
      {
        id: 'p_2',
        name: 'B',
        type: 'at_end',
        hint: '親のヒント',
        confirmedSettings: ['4', '5', '6'],
      },
    ]);
  });

  it('親に id・type・hint が無ければ、id はパターンの名前から作り、type は other、hint は description か ""', () => {
    const machine = {
      name: 'x',
      endScreens: [
        {
          name: '親',
          patterns: [
            { name: 'Gold', description: '金の説明' },
            { name: '金', minSetting: 5 },
            { name: '銀' },
          ],
        },
      ],
    };
    const { machine: expanded } = expandEndScreenPatterns(machine);
    // 漢字だけの名前は ID の文字にならないので endscreen、重なれば _2（アプリの移行処理と同じ）。
    // availableSettings が無ければ設定は 1〜6
    expect(expanded.endScreens).toStrictEqual([
      { id: 'gold', name: 'Gold', type: 'other', hint: '金の説明', confirmedSettings: [] },
      { id: 'endscreen', name: '金', type: 'other', hint: '', confirmedSettings: ['5', '6'] },
      { id: 'endscreen_2', name: '銀', type: 'other', hint: '', confirmedSettings: [] },
    ]);
    expect(migrateV1ToV2(expanded).endScreens).toEqual(migrateV1ToV2(machine).endScreens);
  });

  it('親に color があれば、展開した終了画面にも同じ color を書く', () => {
    const machine = {
      name: 'x',
      endScreens: [
        { id: 'p', name: '親', color: '#78909C', patterns: [{ name: 'A' }, { name: 'B' }] },
      ],
    };
    const { machine: expanded } = expandEndScreenPatterns(machine);
    expect(expanded.endScreens.map((s) => s.color)).toEqual(['#78909C', '#78909C']);
  });

  it('並び順を変えない（親の位置に、パターンの順で並べる。ほかの終了画面はそのまま）', () => {
    const first = { name: '前', confirmedSettings: ['2'] };
    const middle = { name: '間', hint: 'h' };
    const last = { name: '後' };
    const machine = {
      name: 'x',
      endScreens: [
        first,
        { id: 'p', name: '親1', patterns: [{ name: 'A' }, { name: 'B' }] },
        middle,
        { id: 'q', name: '親2', patterns: [{ name: 'C' }] },
        last,
      ],
    };
    const { machine: expanded, expanded: list } = expandEndScreenPatterns(machine);
    expect(expanded.endScreens.map((s) => s.name)).toEqual(['前', 'A', 'B', '間', 'C', '後']);
    expect(expanded.endScreens.map((s) => s.id)).toEqual([
      undefined,
      'p_1',
      'p_2',
      undefined,
      'q_1',
      undefined,
    ]);
    expect(expanded.endScreens[0]).toBe(first);
    expect(expanded.endScreens[3]).toBe(middle);
    expect(expanded.endScreens[5]).toBe(last);
    expect(list).toEqual([
      { name: '親1', patterns: 2 },
      { name: '親2', patterns: 1 },
    ]);
  });

  it('endScreens が無い機種・patterns が空の配列だけの機種は、同じオブジェクトを返す', () => {
    const noScreens = { name: 'x' };
    expect(expandEndScreenPatterns(noScreens).machine).toBe(noScreens);
    expect(expandEndScreenPatterns(noScreens).machine).not.toHaveProperty('endScreens');
    const emptyPatterns = { name: 'y', endScreens: [{ name: 'a', patterns: [] }] };
    expect(expandEndScreenPatterns(emptyPatterns).machine).toBe(emptyPatterns);
    expect(expandEndScreenPatterns(emptyPatterns).expanded).toEqual([]);
  });

  it('endScreenGroups の中の patterns と、voiceCounts の patterns は書き直さない', () => {
    const groups = [
      { name: 'G', endScreens: [{ name: 'g', patterns: [{ name: 'x', setting: '6' }] }] },
    ];
    const voiceCounts = [{ name: 'V', patterns: [{ name: 'y', setting: '6' }] }];
    const onlyInner = {
      name: 'x',
      endScreens: [{ name: 'a' }],
      endScreenGroups: groups,
      voiceCounts,
    };
    expect(expandEndScreenPatterns(onlyInner).machine).toBe(onlyInner);

    const machine = {
      ...onlyInner,
      endScreens: [{ id: 'p', name: '親', patterns: [{ name: 'A' }] }],
    };
    const { machine: expanded } = expandEndScreenPatterns(machine);
    expect(expanded.endScreenGroups).toBe(groups);
    expect(expanded.voiceCounts).toBe(voiceCounts);
  });

  it('入力の機種を書き換えない', () => {
    const machine = {
      name: 'x',
      endScreens: [
        { id: 'p', name: '親', color: '#78909C', patterns: [{ name: 'A', setting: '6' }] },
      ],
    };
    const copy = structuredClone(machine);
    expandEndScreenPatterns(machine);
    expect(machine).toEqual(copy);
  });

  it('パターンの数と、移行処理が作る終了画面の数が合わないと、書き直さずに例外を投げる', () => {
    // 疎な配列（JSON からは作れない）では、移行処理（forEach）が穴を飛ばすので、
    // patterns.length より少ない終了画面しか作らない。この数で並べると後ろの終了画面がずれ、
    // アプリが読む形が変わる
    const patterns = [{ name: 'A', setting: '6' }];
    patterns.length = 2;
    const machine = {
      name: '疎な機種',
      endScreens: [
        { id: 'p', name: '親', patterns },
        { id: 'n', name: '次' },
      ],
    };
    expect(() => expandEndScreenPatterns(machine)).toThrow(
      '書き直すと、アプリが読む終了画面が変わる: 疎な機種'
    );
  });

  it('patterns を持つ親に、書き直すと消える欄（id・name・type・hint・description・color・patterns 以外）があれば、例外を投げる', () => {
    const machine = {
      name: 'テスト機種',
      endScreens: [
        {
          id: 'p',
          name: '親',
          confirmedSettings: ['6'],
          probabilities: { 6: 0.1 },
          patterns: [{ name: 'A' }],
        },
      ],
    };
    expect(() => expandEndScreenPatterns(machine)).toThrow(
      'テスト機種: 終了画面「親」の confirmedSettings・probabilities は、書き直すと消える（アプリは使わないが、消す前に中身を確かめる）'
    );
  });

  it('機種に name が無ければ、例外の文は「名前のない機種」にする', () => {
    const machine = {
      endScreens: [{ id: 'p', name: '親', excludedSettings: ['1'], patterns: [{ name: 'A' }] }],
    };
    expect(() => expandEndScreenPatterns(machine)).toThrow(
      '名前のない機種: 終了画面「親」の excludedSettings は、書き直すと消える'
    );
  });

  it('expandEndScreenPatternsWithIds は、書き直した終了画面ごとに作った id も返す（CLI の表示用）', () => {
    const machine = {
      name: 'x',
      endScreens: [
        { id: 'p', name: '親1', patterns: [{ name: 'A' }, { name: 'B' }] },
        { id: 's', name: '普通' },
        { id: 'q', name: '親2', patterns: [{ name: 'C' }] },
      ],
    };
    const detailed = expandEndScreenPatternsWithIds(machine);
    expect(detailed.expanded).toEqual([
      { name: '親1', patterns: 2, ids: ['p_1', 'p_2'] },
      { name: '親2', patterns: 1, ids: ['q_1'] },
    ]);
    expect(detailed.machine.endScreens).toStrictEqual([
      { id: 'p_1', name: 'A', type: 'other', hint: '', confirmedSettings: [] },
      { id: 'p_2', name: 'B', type: 'other', hint: '', confirmedSettings: [] },
      { id: 's', name: '普通' },
      { id: 'q_1', name: 'C', type: 'other', hint: '', confirmedSettings: [] },
    ]);
  });
});

describe('rewriteMachineText（合成の機種）', () => {
  it('patterns が無ければ、元の文字列と空の expanded を返す', () => {
    const text =
      '{\n  "name": "x",\n  "rates": [0.10],\n  "endScreens": [{"name": "a", "patterns": []}]\n}\n';
    expect(rewriteMachineText(text)).toEqual({ text, expanded: [] });
  });

  it('文字列の中の ] や "endScreens"、グループの中の endScreens があっても、最上位の配列だけを差し替える', () => {
    expect(rewriteMachineText(TRICKY_BEFORE + TRICKY_OLD_ARRAY + TRICKY_AFTER)).toEqual({
      text: TRICKY_BEFORE + TRICKY_NEW_ARRAY + TRICKY_AFTER,
      expanded: [{ name: '親 ]', patterns: 2, ids: ['p_1', 'p_2'] }],
    });
  });

  it('新しい配列は、キーの行の字下げに合わせる（字下げが2スペースでないファイル）', () => {
    const text = [
      '{',
      '    "name": "x",',
      '    "endScreens": [',
      '        { "id": "p", "name": "親", "patterns": [{ "name": "A" }] }',
      '    ]',
      '}',
      '',
    ].join('\n');
    expect(rewriteMachineText(text).text).toBe(
      [
        '{',
        '    "name": "x",',
        '    "endScreens": [',
        '      {',
        '        "id": "p_1",',
        '        "name": "A",',
        '        "type": "other",',
        '        "hint": "",',
        '        "confirmedSettings": []',
        '      }',
        '    ]',
        '}',
        '',
      ].join('\n')
    );
  });

  it('CRLF のファイルでは、新しい配列も CRLF で書く', () => {
    const text = [
      '{',
      '  "name": "x",',
      '  "endScreens": [',
      '    { "id": "p", "name": "親", "patterns": [{ "name": "A" }] }',
      '  ],',
      '  "rates": [0.10]',
      '}',
      '',
    ].join('\r\n');
    expect(rewriteMachineText(text).text).toBe(
      [
        '{',
        '  "name": "x",',
        '  "endScreens": [',
        '    {',
        '      "id": "p_1",',
        '      "name": "A",',
        '      "type": "other",',
        '      "hint": "",',
        '      "confirmedSettings": []',
        '    }',
        '  ],',
        '  "rates": [0.10]',
        '}',
        '',
      ].join('\r\n')
    );
  });

  it('タブで字下げしたファイルでは、キーの行のタブに合わせる（配列の中は2スペースで整形）', () => {
    const text = [
      '{',
      '\t"name": "x",',
      '\t"endScreens": [',
      '\t\t{ "id": "p", "name": "親", "patterns": [{ "name": "A" }] }',
      '\t]',
      '}',
      '',
    ].join('\n');
    expect(rewriteMachineText(text).text).toBe(
      [
        '{',
        '\t"name": "x",',
        '\t"endScreens": [',
        '\t  {',
        '\t    "id": "p_1",',
        '\t    "name": "A",',
        '\t    "type": "other",',
        '\t    "hint": "",',
        '\t    "confirmedSettings": []',
        '\t  }',
        '\t]',
        '}',
        '',
      ].join('\n')
    );
  });

  it('改行に LF と CRLF が混ざったファイルは、書き直さずに例外を投げる', () => {
    const text =
      '{\r\n  "name": "混ざり",\n  "endScreens": [{ "id": "p", "name": "親", "patterns": [{ "name": "A" }] }]\r\n}\r\n';
    expect(() => rewriteMachineText(text)).toThrow(
      '混ざり: 改行に LF と CRLF が混ざっている（そろえてから書き直す）'
    );
  });

  it('差し替えた文字列を読んだ結果が、書き直した結果と違えば（最上位に endScreens が2つ）、例外を投げる', () => {
    expect(() => rewriteMachineText(DUPLICATE_TEXT)).toThrow(
      '差し替えた機種ファイルを読むと、書き直した結果と違う'
    );
  });
});

/** validate.mjs と同じ検査を、機種ファイルの中身を渡して行う（エラーと警告を「ファイル: 文面」で返す） */
function runValidators(files) {
  const results = [
    validateSchemas(files, index),
    validateIndexConsistency(files, index),
    validateProbabilities(files),
    validateConfirmations(files),
    validateCompleteness(files),
    validateProvenance(files, index, loadProvenanceFiles(resolve(ROOT, 'provenance'))),
  ];
  const toLine = (item) => `${item.file}: ${item.message}`;
  return {
    errors: results.flatMap((result) => result.errors).map(toLine),
    warnings: results.flatMap((result) => result.warnings).map(toLine),
  };
}

describe.skipIf(noMachineHasPatterns)('実データ（patterns を持つ機種を毎回数えた全部）', () => {
  it.each(withPatterns.map(({ entry, machine }) => [entry.id, machine]))(
    '%s: アプリが読む形が、書き直しの前後で同じ',
    (_id, machine) => {
      const { machine: expanded } = expandEndScreenPatterns(machine);
      expect(migrateV1ToV2(expanded).endScreens).toEqual(migrateV1ToV2(machine).endScreens);
      expect((expanded.endScreens ?? []).some((s) => (s.patterns ?? []).length > 0)).toBe(false);
    }
  );

  it.each(withPatterns.map(({ entry, text, machine }) => [entry.id, text, machine]))(
    '%s: rewriteMachineText は、最上位の endScreens の配列だけを差し替える（配列の外はバイト単位で同じ）',
    (_id, text, machine) => {
      const { text: after, expanded } = rewriteMachineText(text);
      expect(expanded.length).toBeGreaterThan(0);
      expectOnlyEndScreensReplaced(text, after, expandEndScreenPatterns(machine).machine);
    }
  );

  it('書き直した機種は、スキーマと validate の規則を、書き直す前と同じく通る（エラー 0・警告は元と同じ）', () => {
    const texts = index.machines.map((entry) => ({
      path: `machines/${entry.file}`,
      text: readRepo(`machines/${entry.file}`),
    }));
    const before = runValidators(texts.map(({ path, text }) => ({ path, data: JSON.parse(text) })));
    const after = runValidators(
      texts.map(({ path, text }) => ({ path, data: JSON.parse(rewriteMachineText(text).text) }))
    );
    expect(after.errors).toEqual([]);
    expect(after.warnings).toEqual(before.warnings);
  });

  it('main と比べる検査（check:base）を通る（アプリが作る ID が変わらず、同じ名前の項目も増えない）', () => {
    const head = new Map(
      withPatterns.map(({ entry, text }) => [
        `machines/${entry.file}`,
        rewriteMachineText(text).text,
      ])
    );
    const result = runAgainstBase({
      base: '書き直す前の作業ツリー',
      readBase: readRepo,
      readHead: (path) => head.get(path) ?? readRepo(path),
      loadProvenance: () => loadProvenanceFiles(resolve(ROOT, 'provenance')),
    });
    expect(result).toEqual({ code: 0, lines: [expect.stringContaining('問題なし')] });
  });
});

describe('scripts/expand-patterns.mjs（CLI）', () => {
  const CLI = resolve(ROOT, 'scripts/expand-patterns.mjs');
  const USAGE = '使い方: node scripts/expand-patterns.mjs <機種ファイル>... [--write]';
  const sample = {
    name: 'テスト機種',
    version: '1.0',
    lastUpdated: '2026-01-01',
    endScreens: [
      {
        id: 'p',
        name: '親',
        color: '#78909C',
        patterns: [{ name: 'A', setting: '6' }, { name: 'B' }],
      },
      { id: 's', name: '普通' },
    ],
  };
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'expand-patterns-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** 一時フォルダを作業場所にして CLI を実行する */
  function run(args) {
    return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf-8' });
  }

  /** 一時フォルダの path（machines/ から始まる相対パス）に、文字列をそのまま書く */
  function writeText(path, text) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
    return path;
  }

  const writeMachine = (path, machine) => writeText(path, canonical(machine));
  const copyMachine = (entry) =>
    writeText(`machines/${entry.file}`, readRepo(`machines/${entry.file}`));
  const readCopy = (path) => readFileSync(join(dir, path), 'utf-8');

  it('--write なし: 書き直す終了画面の名前・パターンの数・作る id を表示し、ファイルは変えない', () => {
    const path = writeMachine('machines/test/sample.json', sample);
    const before = readCopy(path);
    const result = run([path]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        'machines/test/sample.json: 書き直す終了画面 1',
        '  親（パターン 2）→ p_1, p_2',
        '',
        '表示だけで、ファイルは変えていません。書き直すときは --write を付けてください',
        '',
      ].join('\n')
    );
    expect(readCopy(path)).toBe(before);
  });

  it('--write: 文字列の中の ] や "endScreens" がある機種でも、最上位の endScreens の配列だけを差し替える', () => {
    const path = writeText(
      'machines/test/tricky.json',
      TRICKY_BEFORE + TRICKY_OLD_ARRAY + TRICKY_AFTER
    );
    const result = run([path, '--write']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('  親 ]（パターン 2）→ p_1, p_2\n');
    expect(readCopy(path)).toBe(TRICKY_BEFORE + TRICKY_NEW_ARRAY + TRICKY_AFTER);
  });

  it('書き直すものが無ければ「書き直す終了画面なし」で終了コード 0（--write でもファイルは変えない）', () => {
    const path = writeText(
      'machines/test/plain.json',
      '{"name": "x", "endScreens": [{"name": "a"}]}\n'
    );
    const result = run([path, '--write']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${path}: 書き直す終了画面なし\n`);
    expect(readCopy(path)).toBe('{"name": "x", "endScreens": [{"name": "a"}]}\n');
  });

  it('ファイルの指定が無ければ、使い方を出して終了コード 2', () => {
    const result = run(['--write']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(USAGE);
  });

  it('知らない引数は終了コード 2（--write の書き間違いを、黙って表示だけにしない）', () => {
    const path = writeMachine('machines/test/sample.json', sample);
    const before = readCopy(path);
    const result = run([path, '--wirte']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('知らない引数: --wirte');
    expect(result.stderr).toContain(USAGE);
    expect(result.stdout).toBe('');
    expect(readCopy(path)).toBe(before);
  });

  it('読めない・JSON でない・JSON のオブジェクトでないファイルは終了コード 2', () => {
    const cases = [
      ['machines/test/missing.json', '読めない'],
      [writeText('machines/test/broken.json', '{ "name": '), 'JSON として読めない'],
      [writeText('machines/test/array.json', '[]\n'), '機種ファイルの形でない'],
    ];
    for (const [path, message] of cases) {
      const result = run([path]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(`${path}: ${message}`);
      expect(result.stdout).toBe('');
    }
  });

  it('書き直せない機種（移行処理が扱えない patterns）は終了コード 2', () => {
    const path = writeMachine('machines/test/bad.json', {
      name: 'x',
      endScreens: [{ id: 'p', name: '親', patterns: [null] }],
    });
    const result = run([path]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`${path}: 書き直せない`);
  });

  it('差し替えた結果が書き直した結果と違う機種（最上位に endScreens が2つ）は、書かずに終了コード 2', () => {
    const path = writeText('machines/test/twice.json', DUPLICATE_TEXT);
    const result = run([path, '--write']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      `${path}: 書き直せない（差し替えた機種ファイルを読むと、書き直した結果と違う`
    );
    expect(readCopy(path)).toBe(DUPLICATE_TEXT);
  });

  it('--write で1つでも誤りのあるファイルがあれば、どのファイルも書き直さない', () => {
    const path = writeMachine('machines/test/sample.json', sample);
    const before = readCopy(path);
    const result = run([path, 'machines/test/missing.json', '--write']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('machines/test/missing.json: 読めない');
    expect(result.stderr).toContain('ファイルは書き直していません');
    expect(result.stdout).toBe('');
    expect(readCopy(path)).toBe(before);
  });

  it.skipIf(process.getuid?.() === 0)('書き込めないファイルは終了コード 2', () => {
    const path = writeMachine('machines/test/sample.json', sample);
    chmodSync(join(dir, path), 0o444);
    const result = run([path, '--write']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`${path}: 書き込めない`);
  });

  describe.skipIf(noMachineHasPatterns)('実データの写し（patterns を持つ全機種）', () => {
    it('--write なし: 機種ごとに書き直す内容を表示し、どれも変えない', () => {
      const paths = withPatterns.map(({ entry }) => copyMachine(entry));
      const result = run(paths);
      expect(result.status).toBe(0);
      for (const [i, { machine }] of withPatterns.entries()) {
        const { expanded } = expandEndScreenPatternsWithIds(machine);
        const lines = [
          `${paths[i]}: 書き直す終了画面 ${expanded.length}`,
          ...expanded.map(
            ({ name, patterns, ids }) => `  ${name}（パターン ${patterns}）→ ${ids.join(', ')}`
          ),
        ];
        expect(result.stdout).toContain(lines.join('\n') + '\n');
        expect(readCopy(paths[i])).toBe(readRepo(paths[i]));
      }
    });

    it('--write: 最上位の endScreens の配列だけを差し替え、配列の外はバイト単位で元と同じ', () => {
      const plain = index.machines.find(
        (entry) => !withPatterns.some(({ entry: target }) => target.id === entry.id)
      );
      const paths = withPatterns.map(({ entry }) => copyMachine(entry));
      const plainPath = copyMachine(plain);
      const result = run([...paths, plainPath, '--write']);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`${plainPath}: 書き直す終了画面なし\n`);

      const written = result.stdout.slice(result.stdout.indexOf('書き直したファイル'));
      expect(written).toBe(
        [`書き直したファイル: ${paths.length}`, ...paths.map((path) => `  ${path}`), ''].join('\n')
      );
      for (const [i, { text, machine }] of withPatterns.entries()) {
        const after = readCopy(paths[i]);
        expect(after).toBe(rewriteMachineText(text).text);
        expectOnlyEndScreensReplaced(text, after, expandEndScreenPatterns(machine).machine);
        expect(migrateV1ToV2(JSON.parse(after)).endScreens).toEqual(
          migrateV1ToV2(machine).endScreens
        );
      }
      expect(readCopy(plainPath)).toBe(readRepo(plainPath));

      const again = run([...paths, '--write']);
      expect(again.status).toBe(0);
      expect(again.stdout).not.toContain('書き直したファイル');
      expect(again.stdout).toContain(`${paths[0]}: 書き直す終了画面なし\n`);
    });

    // 2026-09-27 は bakemonogatari・isekai-quartet-bt・triple-crown-seven（0.10・0.015480・1行の配列）
    const nonCanonical = withPatterns.filter(({ text, machine }) => text !== canonical(machine));
    it.skipIf(nonCanonical.length === 0)(
      '--write: 整形が JSON.stringify の形でない機種でも、配列の外の書き方（数・1行の配列）を変えない',
      () => {
        const paths = nonCanonical.map(({ entry }) => copyMachine(entry));
        expect(run([...paths, '--write']).status).toBe(0);
        for (const [i, { text, machine }] of nonCanonical.entries()) {
          const after = readCopy(paths[i]);
          expectOnlyEndScreensReplaced(text, after, expandEndScreenPatterns(machine).machine);
          expect(after).not.toBe(canonical(JSON.parse(after)));
        }
      }
    );
  });
});
