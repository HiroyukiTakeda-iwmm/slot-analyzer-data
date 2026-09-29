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

/** メーカーの公式ドメインの一覧の場所（リポジトリからの相対パス） */
export const OFFICIAL_DOMAINS_PATH = 'config/official-domains.json';

/**
 * メーカーの公式ドメインの一覧（config/official-domains.json）を読む。無い・JSON として読めないときは、
 * 空の一覧にせず readError を付ける（validateOfficialDomains がエラーにする）。
 *
 * @param {string} root リポジトリのルートの絶対パス
 * @returns {{ path: string, data: object | null, readError?: string }}
 */
export function loadOfficialDomainsFile(root) {
  try {
    return {
      path: OFFICIAL_DOMAINS_PATH,
      data: JSON.parse(readFileSync(resolve(root, OFFICIAL_DOMAINS_PATH), 'utf-8')),
    };
  } catch (e) {
    return { path: OFFICIAL_DOMAINS_PATH, data: null, readError: e.message };
  }
}
