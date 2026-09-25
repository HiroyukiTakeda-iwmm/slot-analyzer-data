import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * provenance/ 配下の出典記録を名前順に読む。フォルダが無ければ空配列。
 *
 * @param {string} dir provenance フォルダの絶対パス
 * @returns {Array<{ path: string, data: object | null, parseError?: string }>}
 */
export function loadProvenanceFiles(dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  return names.map((name) => {
    const path = `provenance/${name}`;
    try {
      return { path, data: JSON.parse(readFileSync(resolve(dir, name), 'utf-8')) };
    } catch (e) {
      return { path, data: null, parseError: e.message };
    }
  });
}
