import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(...args) {
  return spawnSync(process.execPath, ['scripts/check-against-base.mjs', ...args], {
    cwd: ROOT,
    encoding: 'utf-8',
  });
}

describe('check-against-base.mjs の引数', () => {
  it('知らない引数は、既定の基準で比べずに終了コード 2', () => {
    const result = run('--bse', 'main');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('知らない引数: --bse');
  });

  it('--base の値が無ければ終了コード 2', () => {
    expect(run('--base').status).toBe(2);
    expect(run('--base=').status).toBe(2);
  });

  it('--base=<ref> の形も受け付ける（読めない基準は終了コード 2）', () => {
    const result = run('--base=no-such-ref');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('比べられませんでした（基準: no-such-ref）');
  });

  it('--base <ref> の形で渡した基準と比べる（npm スクリプトと CI の形）', () => {
    const result = run('--base', 'no-such-ref');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('比べられませんでした（基準: no-such-ref）');
  });
});
