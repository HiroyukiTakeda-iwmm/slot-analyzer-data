/** 属性型 JP ドメイン（example.co.jp など）の2番目のラベル。この形は末尾3ラベルを1つのサイトにする */
const JP_SECOND_LEVEL_LABELS = new Set(['co', 'ne', 'or', 'ac', 'go', 'ed', 'gr', 'lg', 'ad']);

/**
 * 出典の URL のサイト（登録ドメイン）。サブドメインは同じサイトにまとめる
 * （例: sp.chonborista.com → chonborista.com、www.example.co.jp → example.co.jp）。
 * ホスト名を小文字にし、空のラベル（末尾の「.」など）と先頭の「www.」を除いてから、
 * ラベルが3つ以上の属性型 JP ドメイン（`.co.jp` など）は末尾3ラベル、それ以外は末尾2ラベルにする。
 * @returns {string | null} URL として読めなければ null
 */
export function siteOf(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  const labels = hostname
    .toLowerCase()
    .split('.')
    .filter((label) => label !== '');
  if (labels.length > 1 && labels[0] === 'www') labels.shift();
  const attributeJp =
    labels.length >= 3 && labels.at(-1) === 'jp' && JP_SECOND_LEVEL_LABELS.has(labels.at(-2));
  return labels.slice(attributeJp ? -3 : -2).join('.');
}
