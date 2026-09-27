import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  expandEndScreenPatterns,
  expandEndScreenPatternsWithIds,
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
const withPatterns = index.machines
  .map((entry) => ({ entry, machine: JSON.parse(readRepo(`machines/${entry.file}`)) }))
  .filter(({ machine }) => (machine.endScreens ?? []).some((s) => (s.patterns ?? []).length > 0));

describe('expandEndScreenPatterns', () => {
  it('実データで、patterns を持つ機種がある（17機種）', () => {
    expect(withPatterns.length).toBe(17);
  });

  it.each(withPatterns.map(({ entry, machine }) => [entry.id, machine]))(
    '%s: アプリが読む形が、書き直しの前後で同じ',
    (_id, machine) => {
      const { machine: expanded } = expandEndScreenPatterns(machine);
      expect(migrateV1ToV2(expanded).endScreens).toEqual(migrateV1ToV2(machine).endScreens);
      expect((expanded.endScreens ?? []).some((s) => (s.patterns ?? []).length > 0)).toBe(false);
    }
  );

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
    expect(detailed.machine).toEqual(expandEndScreenPatterns(machine).machine);
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

/** 書き直した機種ファイルの中身（CLI の --write と同じ整形） */
function rewrittenText(machine) {
  return JSON.stringify(expandEndScreenPatterns(machine).machine, null, 2) + '\n';
}

describe('実データを書き直した結果が、今の検査を通る', () => {
  it('機種のスキーマと validate の規則を、書き直す前と同じく通る（エラー 0・警告は元と同じ）', () => {
    const files = index.machines.map((entry) => ({
      path: `machines/${entry.file}`,
      data: JSON.parse(readRepo(`machines/${entry.file}`)),
    }));
    const rewritten = files.map(({ path, data }) => ({
      path,
      data: JSON.parse(rewrittenText(data)),
    }));
    const before = runValidators(files);
    const after = runValidators(rewritten);
    expect(after.errors).toEqual([]);
    expect(after.warnings).toEqual(before.warnings);
  });

  it('main と比べる検査（check:base）を通る（アプリが作る ID が変わらず、同じ名前の項目も増えない）', () => {
    const head = new Map(
      withPatterns.map(({ entry, machine }) => [`machines/${entry.file}`, rewrittenText(machine)])
    );
    expect(head.size).toBeGreaterThan(0);
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

  const writeMachine = (path, machine) => writeText(path, JSON.stringify(machine, null, 2) + '\n');
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

  it('--write なし: 実データの写し（patterns を持つ全機種）で、機種ごとに書き直す内容を表示し、どれも変えない', () => {
    const paths = withPatterns.map(({ entry }) => copyMachine(entry));
    const result = run(paths);
    expect(result.status).toBe(0);
    for (const [i, { machine }] of withPatterns.entries()) {
      const parents = machine.endScreens.filter((s) => (s.patterns ?? []).length > 0);
      expect(result.stdout).toContain(`${paths[i]}: 書き直す終了画面 ${parents.length}\n`);
      for (const parent of parents) {
        // 実データの親はどれも明示の id を持つので、作る id は `${親の id}_${パターンの番号}`
        const ids = parent.patterns.map((_, k) => `${parent.id}_${k + 1}`);
        expect(result.stdout).toContain(
          `  ${parent.name}（パターン ${parent.patterns.length}）→ ${ids.join(', ')}\n`
        );
      }
      expect(readCopy(paths[i])).toBe(readRepo(paths[i]));
    }
  });

  it('--write: 実データの写しを書き直す（2スペース・末尾改行。アプリが読む形とほかの欄は元と同じ）', () => {
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
    for (const [i, { machine }] of withPatterns.entries()) {
      const text = readCopy(paths[i]);
      expect(text).toBe(rewrittenText(machine));
      const after = JSON.parse(text);
      expect(text).toBe(JSON.stringify(after, null, 2) + '\n');
      expect(migrateV1ToV2(after).endScreens).toEqual(migrateV1ToV2(machine).endScreens);
      // version・lastUpdated を含め、endScreens のほかは変えない
      expect({ ...after, endScreens: null }).toEqual({ ...machine, endScreens: null });
    }
    expect(readCopy(plainPath)).toBe(readRepo(plainPath));

    const again = run([...paths, '--write']);
    expect(again.status).toBe(0);
    expect(again.stdout).not.toContain('書き直したファイル');
    expect(again.stdout).toContain(`${paths[0]}: 書き直す終了画面なし\n`);
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
});
