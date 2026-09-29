import { compileSchema } from '../lib/compile-schema.mjs';
import { siteOf } from '../lib/site.mjs';

function domainsError(file, message) {
  return { file, type: 'official-domains', severity: 'error', message };
}

/**
 * メーカーの公式ドメインの一覧（config/official-domains.json）を確かめる（仕様 5.7）。
 * - 読めない・スキーマ（schemas/official-domains.schema.json）に合わないときはエラー
 * - domain は登録ドメインそのもの（siteOf と同じ計算で、www.・サブドメインを付けない）で、重複しない
 * 問題が1つでもあれば、一覧を使わない（domains は null。空の一覧として続けると、公式の出典を黙って落とす）。
 *
 * @param {{ path: string, data: object | null, readError?: string }} file loadOfficialDomainsFile の結果
 * @returns {{ errors: object[], warnings: object[], domains: Set<string> | null }}
 */
export function validateOfficialDomains(file) {
  const { path, data, readError } = file;
  if (readError !== undefined) {
    const errors = [domainsError(path, `公式ドメインの一覧を読めない: ${readError}`)];
    return { errors, warnings: [], domains: null };
  }
  const validateSchema = compileSchema('official-domains.schema.json');
  if (!validateSchema(data)) {
    const errors = validateSchema.errors.map((e) =>
      domainsError(path, `スキーマ違反 ${e.instancePath} ${e.message}`)
    );
    return { errors, warnings: [], domains: null };
  }
  const errors = [];
  const domains = new Set();
  for (const { domain } of data.domains) {
    const site = siteOf(`https://${domain}/`);
    if (site !== domain) {
      errors.push(
        domainsError(
          path,
          `公式ドメインの一覧の domain は登録ドメインにする（www.・サブドメインを付けない）: ${domain}（登録ドメイン: ${site}）`
        )
      );
    }
    if (domains.has(domain)) errors.push(domainsError(path, `公式ドメインの一覧で重複: ${domain}`));
    domains.add(domain);
  }
  return { errors, warnings: [], domains: errors.length === 0 ? domains : null };
}
