import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadProvenanceFiles } from '../scripts/lib/load-provenance.mjs';

let dir;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('loadProvenanceFiles', () => {
  it('フォルダが無ければ空配列', () => {
    expect(loadProvenanceFiles(join(tmpdir(), 'no-such-provenance-dir-for-test'))).toEqual([]);
  });

  it('JSON ファイルだけを名前順に読み、壊れたものには parseError を付ける', () => {
    dir = mkdtempSync(join(tmpdir(), 'provenance-'));
    writeFileSync(join(dir, 'b.json'), '{"machineId":"b"}');
    writeFileSync(join(dir, 'a.json'), '{"machineId":"a"}');
    writeFileSync(join(dir, 'README.md'), '# 説明');
    writeFileSync(join(dir, 'broken.json'), '{');
    mkdirSync(join(dir, 'folder.json'));

    const files = loadProvenanceFiles(dir);

    expect(files.map((file) => file.path)).toEqual([
      'provenance/a.json',
      'provenance/b.json',
      'provenance/broken.json',
    ]);
    expect(files[0].data).toEqual({ machineId: 'a' });
    expect(files[2].data).toBeNull();
    expect(files[2].parseError).toEqual(expect.any(String));
  });
});
