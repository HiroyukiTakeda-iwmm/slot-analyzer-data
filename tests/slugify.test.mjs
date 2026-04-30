/**
 * slugify 関数の決定論テスト (iOS 版 __tests__/utils/slugify.test.ts からの移植)
 *
 * 目的 (KC-2): iOS 側と data 側で同じアルゴリズムを実装したときに、
 * 同じ入力から常に同じ slug が生成されることを保証する。
 *
 * 設計判断:
 *   - ー (長音) は「直前母音を複製」で一貫する
 *   - 漢字は削除 (外部依存なしで決定的な動作を担保)
 *   - 空文字の場合は空文字を返す (呼び出し側で fallback)
 */

import { describe, it, expect } from 'vitest';
import { slugify, hepburnKana, ensureUnique, claimSlug } from '../scripts/lib/slugify.mjs';

describe('slugify', () => {
  describe('hepburnKana - 基本五十音', () => {
    it('converts pure hiragana "ぶどう" to "budou"', () => {
      expect(hepburnKana('ぶどう')).toBe('budou');
    });

    it('converts pure hiragana "りんご" to "ringo"', () => {
      expect(hepburnKana('りんご')).toBe('ringo');
    });

    it('converts pure katakana "ベル" to "beru"', () => {
      expect(hepburnKana('ベル')).toBe('beru');
    });

    it('converts "さしすせそ" to "sashisuseso"', () => {
      expect(hepburnKana('さしすせそ')).toBe('sashisuseso');
    });

    it('converts "たちつてと" to "tachitsuteto"', () => {
      expect(hepburnKana('たちつてと')).toBe('tachitsuteto');
    });

    it('converts "なにぬねの" to "naninuneno"', () => {
      expect(hepburnKana('なにぬねの')).toBe('naninuneno');
    });

    it('converts "ん" to "n"', () => {
      expect(hepburnKana('ん')).toBe('n');
    });
  });

  describe('hepburnKana - 濁音半濁音', () => {
    it('converts "がぎぐげご" to "gagigugego"', () => {
      expect(hepburnKana('がぎぐげご')).toBe('gagigugego');
    });

    it('converts "ぱぴぷぺぽ" to "papipupepo"', () => {
      expect(hepburnKana('ぱぴぷぺぽ')).toBe('papipupepo');
    });

    it('converts "ヴ" to "vu"', () => {
      expect(hepburnKana('ヴ')).toBe('vu');
    });
  });

  describe('hepburnKana - 拗音 (combined kana)', () => {
    it('converts "きゃ" to "kya"', () => {
      expect(hepburnKana('きゃ')).toBe('kya');
    });

    it('converts "しゃしゅしょ" to "shashusho"', () => {
      expect(hepburnKana('しゃしゅしょ')).toBe('shashusho');
    });

    it('converts "ちゃちゅちょ" to "chachucho"', () => {
      expect(hepburnKana('ちゃちゅちょ')).toBe('chachucho');
    });

    it('converts "じゃじゅじょ" to "jajujo"', () => {
      expect(hepburnKana('じゃじゅじょ')).toBe('jajujo');
    });

    it('converts "ふぁふぃふぇふぉ" to "fafifefo"', () => {
      expect(hepburnKana('ふぁふぃふぇふぉ')).toBe('fafifefo');
    });

    it('converts "ジャグラー" to "jaguraa" (ー doubles previous vowel)', () => {
      expect(hepburnKana('ジャグラー')).toBe('jaguraa');
    });

    it('converts "チャンス" to "chansu"', () => {
      expect(hepburnKana('チャンス')).toBe('chansu');
    });
  });

  describe('hepburnKana - 促音 (っ/ッ)', () => {
    it('converts "ラッキー" to "rakkii" (っ doubles next consonant, ー doubles vowel)', () => {
      expect(hepburnKana('ラッキー')).toBe('rakkii');
    });

    it('converts "ビッグ" to "biggu"', () => {
      expect(hepburnKana('ビッグ')).toBe('biggu');
    });

    it('converts "っき" to "kki" (isolated sokuon doubles next)', () => {
      expect(hepburnKana('っき')).toBe('kki');
    });
  });

  describe('hepburnKana - 長音 (ー)', () => {
    it('converts "チェリー" to "cherii"', () => {
      expect(hepburnKana('チェリー')).toBe('cherii');
    });

    it('converts "スマスロ" to "sumasuro" (no long vowel)', () => {
      expect(hepburnKana('スマスロ')).toBe('sumasuro');
    });

    it('converts "ジャー" to "jaa"', () => {
      expect(hepburnKana('ジャー')).toBe('jaa');
    });

    it('converts "リプレイ" to "ripurei"', () => {
      expect(hepburnKana('リプレイ')).toBe('ripurei');
    });
  });

  describe('slugify - 英数字混在', () => {
    it('lowercases "BIG" to "big"', () => {
      expect(slugify('BIG')).toBe('big');
    });

    it('lowercases "BAR" to "bar"', () => {
      expect(slugify('BAR')).toBe('bar');
    });

    it('converts "30型" to "30" (kanji removed)', () => {
      expect(slugify('30型')).toBe('30');
    });

    it('converts full-width alphabet "ＡＢＣ" to "abc"', () => {
      expect(slugify('ＡＢＣ')).toBe('abc');
    });

    it('converts full-width digits "１２３" to "123"', () => {
      expect(slugify('１２３')).toBe('123');
    });
  });

  describe('slugify - 漢字の取り扱い', () => {
    it('removes kanji "金トロフィー" leaving "torofii"', () => {
      expect(slugify('金トロフィー')).toBe('torofii');
    });

    it('converts "北斗の拳" to "no" (kanji removed, only の remains)', () => {
      expect(slugify('北斗の拳')).toBe('no');
    });

    it('returns empty string for single kanji "大"', () => {
      expect(slugify('大')).toBe('');
    });
  });

  describe('slugify - 記号・空文字', () => {
    it('converts "Re:ゼロ" to "re-zero"', () => {
      expect(slugify('Re:ゼロ')).toBe('re-zero');
    });

    it('converts "A・B" to "a-b"', () => {
      expect(slugify('A・B')).toBe('a-b');
    });

    it('collapses multiple separators "A  B__C" to "a-b-c"', () => {
      expect(slugify('A  B__C')).toBe('a-b-c');
    });

    it('trims leading and trailing hyphens "  hello  " to "hello"', () => {
      expect(slugify('  hello  ')).toBe('hello');
    });

    it('returns empty string for empty input', () => {
      expect(slugify('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(slugify('   ')).toBe('');
    });

    it('returns empty string for symbols-only input', () => {
      expect(slugify('!!!###')).toBe('');
    });
  });

  describe('slugify - idempotency', () => {
    it('is idempotent: slugify(slugify(x)) === slugify(x)', () => {
      const inputs = ['ジャグラー', 'BIG', 'Re:ゼロ', '金トロフィー', '30型'];
      for (const input of inputs) {
        const once = slugify(input);
        const twice = slugify(once);
        expect(twice).toBe(once);
      }
    });
  });

  describe('ensureUnique', () => {
    it('returns the slug unchanged when not in existing set', () => {
      const existing = new Set();
      expect(ensureUnique('foo', existing)).toBe('foo');
    });

    it('appends _2 when slug already exists', () => {
      const existing = new Set(['foo']);
      expect(ensureUnique('foo', existing)).toBe('foo_2');
    });

    it('appends _3 when _2 is also taken', () => {
      const existing = new Set(['foo', 'foo_2']);
      expect(ensureUnique('foo', existing)).toBe('foo_3');
    });

    it('appends _4 when _2 and _3 are also taken', () => {
      const existing = new Set(['foo', 'foo_2', 'foo_3']);
      expect(ensureUnique('foo', existing)).toBe('foo_4');
    });

    it('is idempotent when the slug is unique (no mutation of existing)', () => {
      const existing = new Set(['bar']);
      const snapshotBefore = Array.from(existing).sort();
      ensureUnique('foo', existing);
      const snapshotAfter = Array.from(existing).sort();
      expect(snapshotAfter).toEqual(snapshotBefore);
    });

    it('handles empty string slug by returning empty (caller must fallback)', () => {
      const existing = new Set();
      expect(ensureUnique('', existing)).toBe('');
    });
  });

  describe('既知の決定論的挙動 (iOS 側と同一仕様)', () => {
    it('treats "ンイ" identically to "ニ" (both → "ni")', () => {
      expect(hepburnKana('ンイ')).toBe('ni');
      expect(hepburnKana('ニ')).toBe('ni');
      expect(slugify('ンイ')).toBe('ni');
      expect(slugify('ニ')).toBe('ni');
    });

    it('drops trailing orphan sokuon "トロッ" → "toro"', () => {
      expect(slugify('トロッ')).toBe('toro');
      expect(slugify('ッ')).toBe('');
    });

    it('ignores leading long-vowel marks "ーー" → "" (no preceding vowel)', () => {
      expect(slugify('ーー')).toBe('');
      expect(hepburnKana('ーー')).toBe('');
    });

    it('normalizes combining voiced mark (U+3099) via NFKC: "か" + U+3099 → "ga"', () => {
      const combining = '\u304B\u3099'; // か + ◌゛
      expect(combining).not.toBe('が');
      expect(hepburnKana(combining)).toBe('ga');
      expect(slugify(combining)).toBe('ga');
    });
  });

  describe('claimSlug', () => {
    it('returns the unique slug and registers it into usedIds in one call', () => {
      const usedIds = new Set();
      const result = claimSlug('foo', usedIds);
      expect(result).toBe('foo');
      expect(usedIds.has('foo')).toBe(true);
    });

    it('disambiguates and registers the suffixed slug', () => {
      const usedIds = new Set(['foo']);
      const result = claimSlug('foo', usedIds);
      expect(result).toBe('foo_2');
      expect(usedIds.has('foo_2')).toBe(true);
      expect(usedIds.has('foo')).toBe(true);
    });

    it('returns empty string and does not register when input is empty', () => {
      const usedIds = new Set();
      const result = claimSlug('', usedIds);
      expect(result).toBe('');
      expect(usedIds.size).toBe(0);
    });

    it('is chainable: consecutive calls keep producing unique slugs', () => {
      const usedIds = new Set();
      const a = claimSlug('bar', usedIds);
      const b = claimSlug('bar', usedIds);
      const c = claimSlug('bar', usedIds);
      expect(a).toBe('bar');
      expect(b).toBe('bar_2');
      expect(c).toBe('bar_3');
    });
  });
});
