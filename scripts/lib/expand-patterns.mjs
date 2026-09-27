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

/** JSON として深く同じか（キーの順は問わない。値が undefined のキーは無いものとして比べる） */
function sameJson(a, b) {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
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
  if (!sameJson(migrated, migrateV1ToV2(result).endScreens)) {
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

const JSON_WHITESPACE = ' \t\n\r';

/** text[start] から JSON の空白を飛ばした位置 */
function skipWhitespace(text, start) {
  let i = start;
  while (i < text.length && JSON_WHITESPACE.includes(text[i])) i += 1;
  return i;
}

/** text[start] の '"' から始まる文字列の、閉じる '"' の次の位置（"\" の次の1文字はエスケープとして飛ばす） */
function endOfString(text, start) {
  let i = start + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
  return i + 1;
}

/**
 * text[start] から始まる値（オブジェクト・配列・文字列・数・true・false・null）の次の位置。
 * オブジェクトと配列は、文字列の中を飛ばしながら括弧の深さをたどる（文字列の中の括弧は数えない）
 */
function endOfValue(text, start) {
  if (text[start] === '"') return endOfString(text, start);
  let i = start;
  if (text[start] !== '{' && text[start] !== '[') {
    while (i < text.length && !`,}]${JSON_WHITESPACE}`.includes(text[i])) i += 1;
    return i;
  }
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i = endOfString(text, i);
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return i; // JSON.parse で読めた文字列では、ここには来ない（閉じ括弧で返る）
}

/**
 * 機種ファイルの文字列で、最上位のキー "endScreens" の値の配列がある範囲を返す（最初に見つかったもの）。
 * JSON.parse で読めた文字列（最上位がオブジェクト）だけを渡す。最上位のオブジェクトのキーと値を順に読み、
 * 値は endOfValue で飛ばすので、グループの中の "endScreens" や、文字列の中の "]"・"endScreens" は数えない。
 * キーはエスケープを戻して比べる。
 *
 * @returns {{ start: number, end: number }} text.slice(start, end) が "[" から "]" まで
 */
function findTopLevelEndScreens(text) {
  let i = skipWhitespace(text, skipWhitespace(text, 0) + 1); // "{" の次
  while (text[i] === '"') {
    const keyEnd = endOfString(text, i);
    const key = JSON.parse(text.slice(i, keyEnd));
    const valueStart = skipWhitespace(text, skipWhitespace(text, keyEnd) + 1); // ":" の次
    const valueEnd = endOfValue(text, valueStart);
    if (key === 'endScreens' && text[valueStart] === '[') {
      return { start: valueStart, end: valueEnd };
    }
    i = skipWhitespace(text, skipWhitespace(text, valueEnd) + 1); // "," の次
  }
  throw new Error('最上位の endScreens の配列が見つからない');
}

/**
 * 機種ファイルの文字列の、最上位の endScreens の配列だけを、書き直した終了画面に差し替える
 * （2026-09-27 に決定。PR の差分を書き直した終了画面だけにするため、ほかの部分（数の書き方・
 * 1行の配列・キーの順・改行）は1バイトも変えない）。新しい配列は2スペースで整形し、元の配列が始まる行の
 * 字下げに合わせる。差し替えた文字列を読んだ結果が、書き直した機種（expandEndScreenPatterns の結果）と
 * JSON として深く同じでなければ（最上位に endScreens が2つあるなど）、例外を投げる。
 * 書き直すものが無ければ、元の文字列をそのまま返す。
 *
 * @param {string} text 機種ファイルの中身（JSON のオブジェクト）
 * @returns {{ text: string, expanded: Array<{ name: string, patterns: number, ids: string[] }> }}
 */
export function rewriteMachineText(text) {
  const { machine, expanded } = expandEndScreenPatternsWithIds(JSON.parse(text));
  if (expanded.length === 0) return { text, expanded };

  const { start, end } = findTopLevelEndScreens(text);
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const indent = text.slice(lineStart, start).match(/^[ \t]*/)[0];
  const array = JSON.stringify(machine.endScreens, null, 2).replaceAll('\n', `\n${indent}`);
  const rewritten = text.slice(0, start) + array + text.slice(end);
  if (!sameJson(JSON.parse(rewritten), machine)) {
    throw new Error(
      `差し替えた機種ファイルを読むと、書き直した結果と違う（最上位に endScreens が2つあるなど）: ${machine.name}`
    );
  }
  return { text: rewritten, expanded };
}
