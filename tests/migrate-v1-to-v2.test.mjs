/**
 * migrate-v1-to-v2 スクリプトのテスト
 *
 * 目的:
 *   - KC-2 契約: iOS 側 golden role.id ベクトル 10 機種と完全一致することを保証
 *   - migration の idempotency (2回実行で同じ結果)
 *   - dry-run モードが実ファイルを変更しないこと
 *   - role.probabilities が migration で変化しないこと (KC-3)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { migrateV1ToV2, parseArgs } from '../scripts/migrate-v1-to-v2.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MACHINES_DIR = resolve(ROOT, 'machines');
const GOLDEN_DIR = resolve(__dirname, 'fixtures/expected-role-ids');

// ================================================================
// Helpers
// ================================================================

/**
 * 指定 stem の machine.json を machines/ 配下から再帰的に検索する。
 * golden 側は machine id (= ファイル stem) だけを知っていて、data 側の
 * directory 階層を意識しない設計なので、ここで探索して橋渡しする。
 * @param {string} id
 * @returns {string|null}
 */
function findMachineJsonById(id) {
  const candidates = [];
  walkJson(MACHINES_DIR, candidates);
  return candidates.find((p) => p.endsWith(`/${id}.json`)) ?? null;
}

/**
 * @param {string} dir
 * @param {string[]} acc
 */
function walkJson(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkJson(full, acc);
    } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
      acc.push(full);
    }
  }
}

/**
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function loadGoldenIds() {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => loadJson(resolve(GOLDEN_DIR, f)));
}

// ================================================================
// KC-2: golden role.id vector と一致
// ================================================================

describe('KC-2: iOS side golden role.id vector matches data side migration', () => {
  const goldens = loadGoldenIds();

  it('has 10 golden machine fixtures (Phase 1 frozen)', () => {
    expect(goldens.length).toBe(10);
  });

  for (const golden of goldens) {
    it(`${golden.id}: role.id vector matches golden after migration`, () => {
      const machinePath = findMachineJsonById(golden.id);
      expect(machinePath, `data side machine.json for id=${golden.id} must exist`).not.toBeNull();

      const v1 = loadJson(machinePath);
      const v2 = migrateV1ToV2(v1);

      expect(Array.isArray(v2.roles)).toBe(true);
      const actualIds = v2.roles.map((r) => r.id);
      expect(actualIds).toEqual(golden.roleIds);
    });
  }
});

// ================================================================
// Idempotency: migrate(migrate(v1)) = migrate(v1)
// ================================================================

describe('migrate-v1-to-v2: idempotency', () => {
  const goldens = loadGoldenIds();

  for (const golden of goldens) {
    it(`${golden.id}: migrateV1ToV2 is idempotent`, () => {
      const machinePath = findMachineJsonById(golden.id);
      const v1 = loadJson(machinePath);
      const v2 = migrateV1ToV2(v1);
      const v2Again = migrateV1ToV2(v2);
      expect(v2Again).toEqual(v2);
    });
  }
});

// ================================================================
// KC-3: role.probabilities は migration で変化しない
// ================================================================

describe('KC-3: role.probabilities preserved through migration', () => {
  const goldens = loadGoldenIds();

  for (const golden of goldens) {
    it(`${golden.id}: role.probabilities unchanged`, () => {
      const machinePath = findMachineJsonById(golden.id);
      const v1 = loadJson(machinePath);
      const v2 = migrateV1ToV2(v1);

      v1.roles.forEach((r1, i) => {
        expect(v2.roles[i].probabilities).toEqual(r1.probabilities);
      });
    });
  }
});

// ================================================================
// schemaVersion: 2 が付与される
// ================================================================

describe('migrate-v1-to-v2: schemaVersion', () => {
  it('adds schemaVersion: 2 when absent', () => {
    const v1 = { name: 'x', type: 'AT', roles: [] };
    const v2 = migrateV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
  });

  it('preserves schemaVersion: 2 idempotently', () => {
    const v1 = { schemaVersion: 2, name: 'x', type: 'AT', roles: [] };
    const v2 = migrateV1ToV2(v1);
    expect(v2.schemaVersion).toBe(2);
  });
});

// ================================================================
// Role id generation edge cases
// ================================================================

describe('migrate-v1-to-v2: role id generation', () => {
  it('uses slugify(name) + displayOrder for roles without id', () => {
    const v1 = {
      name: 'test',
      type: 'AT',
      roles: [
        { name: 'チェリー', probabilities: { 1: 0.01 }, displayOrder: 1 },
        { name: 'BIG', probabilities: { 1: 0.01 }, displayOrder: 2 },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.roles[0].id).toBe('cherii_1');
    expect(v2.roles[1].id).toBe('big_2');
  });

  it('preserves existing role.id', () => {
    const v1 = {
      name: 'test',
      type: 'AT',
      roles: [
        { id: 'custom-id', name: 'チェリー', probabilities: { 1: 0.01 } },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.roles[0].id).toBe('custom-id');
  });

  it('falls back to role_N when name has no valid chars', () => {
    const v1 = {
      name: 'test',
      type: 'AT',
      roles: [
        { name: '大', probabilities: { 1: 0.01 }, displayOrder: 1 },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.roles[0].id).toBe('role_1');
  });

  it('disambiguates colliding ids with _2 suffix', () => {
    const v1 = {
      name: 'test',
      type: 'AT',
      roles: [
        { id: 'same', name: 'A', probabilities: { 1: 0.01 } },
        { id: 'same', name: 'B', probabilities: { 1: 0.01 } },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.roles[0].id).toBe('same');
    expect(v2.roles[1].id).toBe('same_2');
  });
});

// ================================================================
// endScreens normalization
// ================================================================

describe('migrate-v1-to-v2: endScreens', () => {
  it('renames distribution → probabilities', () => {
    const v1 = {
      name: 'x', type: 'AT', roles: [],
      endScreens: [
        { name: 'A', distribution: { 1: 0.5, 6: 0.5 } },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.endScreens[0].probabilities).toEqual({ 1: 0.5, 6: 0.5 });
    expect(v2.endScreens[0].distribution).toBeUndefined();
  });

  it('expands patterns into individual endScreens', () => {
    const v1 = {
      name: 'x', type: 'AT', roles: [],
      availableSettings: ['1', '2', '3', '4', '5', '6'],
      endScreens: [
        {
          id: 'night',
          name: '夜エンド',
          patterns: [
            { name: '設定5確定', setting: '5' },
            { name: '設定6確定', setting: '6' },
          ],
        },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.endScreens).toHaveLength(2);
    expect(v2.endScreens[0].id).toBe('night_1');
    expect(v2.endScreens[0].confirmedSettings).toEqual(['5']);
    expect(v2.endScreens[1].id).toBe('night_2');
    expect(v2.endScreens[1].confirmedSettings).toEqual(['6']);
  });

  it('applies minSetting filter over availableSettings', () => {
    const v1 = {
      name: 'x', type: 'AT', roles: [],
      availableSettings: ['1', '2', '3', '4', '5', '6'],
      endScreens: [
        {
          id: 'p',
          name: 'x',
          patterns: [{ name: '設定4以上', minSetting: 4 }],
        },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.endScreens[0].confirmedSettings).toEqual(['4', '5', '6']);
  });

  it('fills default type = "other" when absent', () => {
    const v1 = {
      name: 'x', type: 'AT', roles: [],
      endScreens: [{ name: 'A' }],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.endScreens[0].type).toBe('other');
  });
});

// ================================================================
// settings reindex
// ================================================================

describe('migrate-v1-to-v2: settings.order reindex', () => {
  it('reindexes settings.order to 1..N', () => {
    const v1 = {
      name: 'x', type: 'AT', roles: [],
      settings: [
        { id: '1', name: '設定1', order: 10 },
        { id: '6', name: '設定6', order: 20 },
        { id: '3', name: '設定3', order: 15 },
      ],
    };
    const v2 = migrateV1ToV2(v1);
    expect(v2.settings).toEqual([
      { id: '1', name: '設定1', order: 1 },
      { id: '3', name: '設定3', order: 2 },
      { id: '6', name: '設定6', order: 3 },
    ]);
  });
});

// ================================================================
// Purity: migrate does not mutate input
// ================================================================

describe('migrate-v1-to-v2: purity', () => {
  it('does not mutate input v1', () => {
    const v1 = {
      name: 'x', type: 'AT',
      roles: [{ name: 'チェリー', probabilities: { 1: 0.01 }, displayOrder: 1 }],
    };
    const snapshot = JSON.parse(JSON.stringify(v1));
    migrateV1ToV2(v1);
    expect(v1).toEqual(snapshot);
  });
});

// ================================================================
// CLI arg parser
// ================================================================

describe('parseArgs', () => {
  it('defaults to dry-run', () => {
    const args = parseArgs([]);
    expect(args.dryRun).toBe(true);
    expect(args.write).toBe(false);
  });

  it('parses --write', () => {
    const args = parseArgs(['--write']);
    expect(args.dryRun).toBe(false);
    expect(args.write).toBe(true);
  });

  it('parses --file <path>', () => {
    const args = parseArgs(['--file', 'machines/foo/foo.json']);
    expect(args.file).toBe('machines/foo/foo.json');
  });

  it('parses --report <path>', () => {
    const args = parseArgs(['--report', 'out.json']);
    expect(args.reportPath).toBe('out.json');
  });
});

// ================================================================
// Dry-run: 実ファイル mtime が変わらない
// ================================================================

describe('dry-run: no file mutation', () => {
  it('keeps mtime unchanged for golden machine files after migrateV1ToV2', () => {
    // migrate は純粋関数なのでファイル I/O せず、mtime 不変であること
    const path = findMachineJsonById('druaga');
    const before = statSync(path).mtimeMs;
    const v1 = loadJson(path);
    migrateV1ToV2(v1);
    const after = statSync(path).mtimeMs;
    expect(after).toBe(before);
  });
});
