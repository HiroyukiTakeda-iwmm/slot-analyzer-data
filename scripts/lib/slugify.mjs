/**
 * slugify: 機種名・小役名から決定論的な slug を生成する。
 *
 * iOS 側 (utils/slugify.ts) と完全一致するアルゴリズムを ESM で移植。
 * 同じ入力から常に同じ slug が得られることを KC-2 契約として保証する。
 *
 * アルゴリズム:
 *   1. NFKC 正規化 (全角英数 → 半角、結合濁点 → 合成形)
 *   2. hepburnKana: ひらがな/カタカナ → Hepburn 式ローマ字
 *      - 五十音・濁音・半濁音・拗音・促音 (っ)・長音 (ー) 対応
 *      - ー は直前母音を複製 (例: ジャー → jaa, ラッキー → rakkii)
 *   3. 漢字は削除 (外部ライブラリ依存を避け決定性を担保)
 *   4. lowercase、非 [a-z0-9] をハイフンに置換
 *   5. 連続ハイフン圧縮、前後ハイフン除去
 *   6. 空文字の場合は空文字を返す (呼び出し側で fallback する設計)
 *
 * 設計選択: Why ?
 *   - 外部依存 (kuromoji, wanakana) を入れないのはバンドル肥大化を避けるため、
 *     また、両リポで同一挙動を保証する上で手書きテーブルが最もシンプル。
 *   - 漢字削除は決定的な挙動を担保する (辞書依存を回避)。
 */

// ================================================================
// Hepburn 変換テーブル
// ================================================================

/**
 * 基本かな → Hepburn マッピング (ひらがな/カタカナ共通)。
 * 拗音は 2 文字キー ("きゃ" 等) で直接引く。
 * @type {Record<string, string>}
 */
const KANA_TO_ROMAJI = {
  // 五十音 (ひらがな)
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'wo', ん: 'n',
  // 濁音・半濁音 (ひらがな)
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  // 小書きかな (単体: 拗音組合せに使われなかった場合のフォールバック)
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',

  // 五十音 (カタカナ)
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o',
  カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
  サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to',
  ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
  ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
  ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
  ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  ワ: 'wa', ヲ: 'wo', ン: 'n',
  // 濁音・半濁音 (カタカナ)
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
  ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
  ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
  パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  ヴ: 'vu',
  // 小書きかな (単体)
  ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o',
  ャ: 'ya', ュ: 'yu', ョ: 'yo',
};

/**
 * 拗音 (2 文字で 1 音) マッピング。
 * 大書き + 小書きャ/ュ/ョ/ァ/ィ/ェ/ォ。
 * @type {Record<string, string>}
 */
const DIGRAPH_TO_ROMAJI = {
  // ひらがな
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  // カタカナ
  キャ: 'kya', キュ: 'kyu', キョ: 'kyo',
  シャ: 'sha', シュ: 'shu', ショ: 'sho',
  チャ: 'cha', チュ: 'chu', チョ: 'cho',
  ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
  ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo',
  ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
  リャ: 'rya', リュ: 'ryu', リョ: 'ryo',
  ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
  ジャ: 'ja', ジュ: 'ju', ジョ: 'jo',
  ビャ: 'bya', ビュ: 'byu', ビョ: 'byo',
  ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo',
  チェ: 'che', シェ: 'she', ジェ: 'je',
  ファ: 'fa', フィ: 'fi', フェ: 'fe', フォ: 'fo',
  ウィ: 'wi', ウェ: 'we', ウォ: 'wo',
  ヴァ: 'va', ヴィ: 'vi', ヴェ: 've', ヴォ: 'vo',
  ティ: 'ti', ディ: 'di', トゥ: 'tu', ドゥ: 'du',
};

const SOKUON_CHARS = new Set(['っ', 'ッ']);
const CHOONPU = 'ー';
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

// ================================================================
// 公開関数
// ================================================================

/**
 * ひらがな/カタカナ + ASCII 混在文字列を Hepburn 式ローマ字 + ASCII に変換。
 * 漢字は本関数では除去しない (呼び出し側 slugify で除去される)。
 *
 * 既知の決定論的挙動 (iOS 版と完全一致させること):
 *
 *   (A) `ン + 母音` は後続母音と融合する (例: `ンイ` → "ni")。
 *       Hepburn 式で本来挿入される `n'` 区切りは意図的に省略する。
 *       このため `ンイ` と `ニ` は共に "ni" を生成する。衝突対策は
 *       呼び出し側の `ensureUnique` + displayOrder 付加に委ねる。
 *
 *   (B) 末尾の孤立促音 (単体 `ッ` や `トロッ` のような末尾 `ッ`) は無視される。
 *       内部的には `pendingSokuon` フラグが終端まで残った場合、何も emit せず破棄する。
 *
 *   (C) 先頭 / 直前母音が無い `ー` は無視する。
 *       先頭 `ー` は `appendChoonpu` の `acc.length === 0` ガードで落ち、
 *       連続 `ーー` (先頭) も 1 個目が push しないため 2 個目も同じガードで落ちる。
 *       一方、母音の直後に連続する `ー` は「直前母音の複製」を**都度**繰り返す
 *       (例: `カーー` → "kaaa")。
 *
 * @param {string} input 変換元文字列
 * @returns {string} Hepburn 式ローマ字 (ASCII と非ASCII混在の可能性あり)
 */
export function hepburnKana(input) {
  if (input.length === 0) return '';

  const normalized = input.normalize('NFKC');
  const state = { result: [], pendingSokuon: false, index: 0 };

  while (state.index < normalized.length) {
    stepHepburn(normalized, state);
  }

  return state.result.join('');
}

/**
 * hepburnKana の 1 ステップ。state を in-place 更新する。
 * @param {string} input 正規化済み入力
 * @param {{ result: string[], pendingSokuon: boolean, index: number }} state
 * @returns {void}
 */
function stepHepburn(input, state) {
  const ch = input[state.index];
  const next = input[state.index + 1];
  const digraph = next !== undefined ? ch + next : '';

  // 拗音 (digraph) 優先
  if (digraph && DIGRAPH_TO_ROMAJI[digraph] !== undefined) {
    state.result.push(applySokuon(DIGRAPH_TO_ROMAJI[digraph], state.pendingSokuon));
    state.pendingSokuon = false;
    state.index += 2;
    return;
  }

  // 促音 (っ/ッ): 次の子音を複製するマーカーとして保持
  if (SOKUON_CHARS.has(ch)) {
    state.pendingSokuon = true;
    state.index += 1;
    return;
  }

  // 長音 (ー): 直前母音を複製
  if (ch === CHOONPU) {
    appendChoonpu(state.result);
    state.index += 1;
    return;
  }

  // 基本かな
  if (KANA_TO_ROMAJI[ch] !== undefined) {
    state.result.push(applySokuon(KANA_TO_ROMAJI[ch], state.pendingSokuon));
    state.pendingSokuon = false;
    state.index += 1;
    return;
  }

  // その他 (ASCII, 漢字, 記号等) はそのまま残す (漢字除去は slugify 本体で実施)
  state.result.push(ch);
  state.pendingSokuon = false;
  state.index += 1;
}

/**
 * 促音 (っ) が立っている場合、続く子音を複製する。
 * 例: 'ki' + pendingSokuon → 'kki'。
 * 母音始まりは複製しない (仕様: 子音のみ複製)。
 * @param {string} romaji
 * @param {boolean} pending
 * @returns {string}
 */
function applySokuon(romaji, pending) {
  if (!pending || romaji.length === 0) return romaji;
  const first = romaji[0];
  if (VOWELS.has(first)) return romaji;
  return first + romaji;
}

/**
 * 長音 (ー) の処理: 直前の母音を複製。
 * 直前が母音でない (例: 文字列先頭等) 場合は何もしない。
 * @param {string[]} acc
 * @returns {void}
 */
function appendChoonpu(acc) {
  if (acc.length === 0) return;
  const lastPart = acc[acc.length - 1];
  const lastChar = lastPart[lastPart.length - 1];
  if (VOWELS.has(lastChar)) {
    acc.push(lastChar);
  }
}

/**
 * 文字列から決定論的な slug を生成する。
 *
 * - 空文字・全漢字入力の場合は空文字を返す
 * - 呼び出し側で fallback (例: `role_${displayOrder}`) すること
 *
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  if (input.length === 0) return '';

  const romanized = hepburnKana(input);
  // 非 ASCII (漢字・残存する全角記号等) をハイフンに置換
  const asciiOnly = romanized.replace(/[^\x20-\x7E]/g, '-');
  const lower = asciiOnly.toLowerCase();
  const hyphenated = lower.replace(/[^a-z0-9]+/g, '-');
  const trimmed = hyphenated.replace(/^-+|-+$/g, '');
  return trimmed;
}

/**
 * slug が existing と衝突する場合、`_2`, `_3`, ... を付与して衝突回避。
 *
 * - 純粋関数: existing を変更しない
 * - 空文字入力はそのまま空文字を返す (呼び出し側 fallback 責務)
 *
 * 注意: この関数は existing の `add` を**行わない**。呼び出し側で明示的に
 * `existing.add(result)` する必要がある。契約を一関数で完結させたい場合は
 * `claimSlug` を使用すること。
 *
 * @param {string} slug
 * @param {Set<string>} existing
 * @returns {string}
 */
export function ensureUnique(slug, existing) {
  if (slug.length === 0) return '';
  if (!existing.has(slug)) return slug;

  let suffix = 2;
  while (existing.has(`${slug}_${suffix}`)) {
    suffix += 1;
  }
  return `${slug}_${suffix}`;
}

/**
 * `ensureUnique` + `usedIds.add` を 1 関数に集約したヘルパ。
 *
 * - 衝突回避後の unique slug を返しつつ、同時に usedIds に登録する
 * - 呼び出し側で add を忘れる事故を防止する
 * - 空文字入力は空文字を返し、usedIds には add しない
 *   (空 slug を衝突管理しない契約は `ensureUnique` と同一)
 *
 * @param {string} slug
 * @param {Set<string>} usedIds
 * @returns {string}
 */
export function claimSlug(slug, usedIds) {
  const unique = ensureUnique(slug, usedIds);
  if (unique.length === 0) return '';
  usedIds.add(unique);
  return unique;
}
