import { migrateV1ToV2 } from '../migrate-v1-to-v2.mjs';

/** 移行処理（migrate-v1-to-v2.mjs の migrateEndScreens）が patterns 形式として展開する終了画面か */
function hasPatterns(screen) {
  return Array.isArray(screen.patterns) && screen.patterns.length > 0;
}

/** 移行処理がパターンから作る終了画面を、機種ファイルに書く形にする（パターンの経路が作るキーだけ） */
function toStandard(screen) {
  const result = {
    id: screen.id,
    name: screen.name,
    type: screen.type,
    hint: screen.hint,
    confirmedSettings: screen.confirmedSettings,
  };
  if (screen.color !== undefined) result.color = screen.color;
  return result;
}

/** キーの順を問わずに比べるため、オブジェクトのキーを名前の順に並べ替える（配列の順は変えない） */
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])])
    );
  }
  return value;
}

/**
 * expandEndScreenPatterns と同じ書き直しをし、書き直した終了画面ごとに、作った終了画面の id も返す
 * （CLI の表示用。expandEndScreenPatterns の expanded は、計画の形の name と patterns の数だけ）。
 *
 * @param {object} machine 機種ファイルの中身
 * @returns {{ machine: object, expanded: Array<{ name: string, patterns: number, ids: string[] }> }}
 */
export function expandEndScreenPatternsWithIds(machine) {
  const screens = machine.endScreens ?? [];
  if (!screens.some(hasPatterns)) return { machine, expanded: [] };

  const migrated = migrateV1ToV2(machine).endScreens;
  const endScreens = [];
  const expanded = [];
  let cursor = 0;
  for (const screen of screens) {
    if (hasPatterns(screen)) {
      const count = screen.patterns.length;
      const made = migrated.slice(cursor, cursor + count).map(toStandard);
      endScreens.push(...made);
      expanded.push({ name: screen.name, patterns: count, ids: made.map((s) => s.id) });
      cursor += count;
    } else {
      endScreens.push(screen);
      cursor += 1;
    }
  }
  const result = { ...machine, endScreens };
  const before = JSON.stringify(sortKeysDeep(migrated));
  const after = JSON.stringify(sortKeysDeep(migrateV1ToV2(result).endScreens));
  if (before !== after) {
    throw new Error(`書き直すと、アプリが読む終了画面が変わる: ${machine.name}`);
  }
  return { machine: result, expanded };
}

/**
 * 最上位の終了画面の patterns を、アプリの移行処理と同じ終了画面に書き直す（本人の決定 2026-09-27）。
 * 書き直した後も、アプリが読む形（移行処理の結果）は元と同じ。同じでなければ例外を投げる。
 * 並び順は変えない（親の位置に、パターンの順で並べる）。作った終了画面は、移行処理が作る id を明示の
 * id として持つ。endScreenGroups の中と voiceCounts の patterns は書き直さない。
 * patterns を持つ終了画面が無ければ、同じオブジェクトを返す。入力は書き換えない。
 *
 * @param {object} machine 機種ファイルの中身
 * @returns {{ machine: object, expanded: Array<{ name: string, patterns: number }> }}
 */
export function expandEndScreenPatterns(machine) {
  const { machine: result, expanded } = expandEndScreenPatternsWithIds(machine);
  return { machine: result, expanded: expanded.map(({ name, patterns }) => ({ name, patterns })) };
}
