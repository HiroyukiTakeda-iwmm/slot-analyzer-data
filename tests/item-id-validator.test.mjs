import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { validateItemIds } from '../scripts/validators/item-id-validator.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATH = 'machines/test/test-machine.json';
const check = (machine) => validateItemIds([{ path: PATH, data: machine }]);

describe('validateItemIds（明示の id の重なり）', () => {
  it('同じ種類で明示の id が重なればエラー（アプリはこの種類では _2 を付けない）', () => {
    const result = check({
      confirmationEvents: [
        { name: '金', id: 'gold' },
        { name: '銀', id: 'silver' },
        { name: '虹', id: 'gold' },
      ],
    });
    expect(result.errors).toEqual([
      {
        file: PATH,
        type: 'item-id',
        severity: 'error',
        message:
          'confirmationEvent::虹: 明示の id（gold）が confirmationEvent::金 と重なっている（アプリは _2 を付けないので、数えた記録が混ざる）',
      },
    ]);
  });

  it('6種類すべてを種類ごとに見る（種類が違えば同じ id でもよい。id の無い項目は見ない）', () => {
    const kinds = [
      ['confirmationEvents', 'confirmationEvent'],
      ['trialSuccessRates', 'trialSuccessRate'],
      ['voiceCounts', 'voiceCount'],
      ['musicCounts', 'musicCount'],
      ['effectCounts', 'effectCount'],
      ['modeTransitions', 'modeTransition'],
    ];
    for (const [field, kind] of kinds) {
      const dup = check({
        [field]: [
          { name: 'A', id: 'x' },
          { name: 'B', id: 'x' },
        ],
      });
      expect(dup.errors.map((e) => e.message)).toEqual([
        `${kind}::B: 明示の id（x）が ${kind}::A と重なっている（アプリは _2 を付けないので、数えた記録が混ざる）`,
      ]);
    }
    const spread = Object.fromEntries(kinds.map(([field]) => [field, [{ name: 'A', id: 'x' }]]));
    expect(
      check({ ...spread, voiceCounts: [{ name: 'A', id: 'x' }, { name: 'B' }, { name: 'C' }] })
        .errors
    ).toEqual([]);
  });

  it('今のデータには重なりが無い', () => {
    const index = JSON.parse(readFileSync(join(ROOT, 'machines/index.json'), 'utf-8'));
    const machineFiles = index.machines.map((entry) => ({
      path: `machines/${entry.file}`,
      data: JSON.parse(readFileSync(join(ROOT, 'machines', entry.file), 'utf-8')),
    }));
    expect(validateItemIds(machineFiles).errors).toEqual([]);
  });
});

describe('validate.mjs の「項目の ID」の節（読み込みのつなぎ）', () => {
  let dir;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'item-ids-'));
    for (const name of ['scripts', 'schemas', 'config', 'machines', 'provenance', 'package.json']) {
      cpSync(join(ROOT, name), join(dir, name), { recursive: true });
    }
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('重なりをエラーにして合計に数え、終了コード 1', () => {
    const clean = spawnSync(process.execPath, ['scripts/validate.mjs'], {
      cwd: dir,
      encoding: 'utf-8',
    });
    expect(clean.stdout).toContain(
      '--- 項目の ID（明示の id の重なり）---\n  エラー: 0件 / 警告: 0件'
    );
    // 確定演出を2つ以上（どれも明示の id つき）持つ機種で、2つ目の id を1つ目と同じにする
    const index = JSON.parse(readFileSync(join(dir, 'machines/index.json'), 'utf-8'));
    const target = index.machines
      .map((entry) => ({ entry, path: join(dir, 'machines', entry.file) }))
      .map((m) => ({ ...m, machine: JSON.parse(readFileSync(m.path, 'utf-8')) }))
      .find(({ machine }) => (machine.confirmationEvents ?? []).filter((e) => e.id).length >= 2);
    const [first, second] = target.machine.confirmationEvents.filter((e) => e.id);
    second.id = first.id;
    writeFileSync(target.path, JSON.stringify(target.machine, null, 2));
    const run = spawnSync(process.execPath, ['scripts/validate.mjs'], {
      cwd: dir,
      encoding: 'utf-8',
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(
      '--- 項目の ID（明示の id の重なり）---\n  エラー: 1件 / 警告: 0件'
    );
    expect(run.stdout).toContain('合計: エラー 1件 / 警告 0件');
    expect(run.stdout).toContain(
      `ERROR [item-id] machines/${target.entry.file}: confirmationEvent::${second.name}: 明示の id（${first.id}）が confirmationEvent::${first.name} と重なっている`
    );
  });
});
