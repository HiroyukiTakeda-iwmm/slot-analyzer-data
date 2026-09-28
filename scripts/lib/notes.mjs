/**
 * 抜き出しのメモ（<機種ID>.extract.json）と読み直しのメモ（<機種ID>.reread.json）を読み、照らし合わせる。
 *
 * メモはリポジトリの外（notes/<バッチ>/）に置く作業メモ。形は schemas/notes.schema.json の definitions の
 * extract・reread（値の形は出典記録と同じ）。docs/data-format.md の「抜き出し・読み直しのメモ」。
 */

import { readFileSync } from 'fs';
import { compileSchemaDefinition } from './compile-schema.mjs';
import { intervalsOverlap, parseShown, shapeError, valuesAgree } from './provenance.mjs';

/** メモの種類（schemas/notes.schema.json の definitions の名前）と、文面での呼び方 */
const NOTE_LABELS = { extract: '抜き出しのメモ', reread: '読み直しのメモ' };

const validators = new Map();

function validatorFor(which) {
  if (!Object.hasOwn(NOTE_LABELS, which)) throw new Error(`未知のメモの種類: ${which}`);
  if (!validators.has(which)) {
    validators.set(
      which,
      compileSchemaDefinition('notes.schema.json', which, ['provenance.schema.json'])
    );
  }
  return validators.get(which);
}

/**
 * メモがスキーマの定義に合わないところ。
 * @param {'extract' | 'reread'} which
 * @returns {string[]} 1件は「場所 説明」。合っていれば空の配列
 */
export function noteSchemaErrors(which, note) {
  const validate = validatorFor(which);
  if (validate(note)) return [];
  return validate.errors.map((e) => `${e.instancePath || '（最上位）'} ${e.message}`);
}

/**
 * メモのファイルを読み、スキーマで確かめる。
 * @param {'extract' | 'reread'} which
 * @returns {{ note: object } | { problem: 'unreadable' | 'shape', errors: string[] }}
 *   unreadable はファイル・JSON として読めない、shape はメモの形に合わない
 */
export function readNote(path, which) {
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (e) {
    return { problem: 'unreadable', errors: [`読めない: ${path}（${e.message}）`] };
  }
  let note;
  try {
    note = JSON.parse(text);
  } catch (e) {
    return { problem: 'unreadable', errors: [`JSON として読めない: ${path}（${e.message}）`] };
  }
  const errors = noteSchemaErrors(which, note);
  if (errors.length > 0) {
    return {
      problem: 'shape',
      errors: [`${NOTE_LABELS[which]}の形に合わない: ${path}`, ...errors.map((e) => `  ${e}`)],
    };
  }
  return { note };
}

/** 項目（kind と name）の表し方。文面に出す */
export function itemLabel({ kind, name }) {
  return `${kind} ${name}`;
}

/** 項目と出典の表し方。文面に出す */
export function lineLabel({ kind, name, source }) {
  return `${kind} ${name} [${source}]`;
}

/** 項目と出典を区別するキー（名前に :: や空白があっても重ならない） */
function lineKey(kind, name, source) {
  return JSON.stringify([kind, name, source]);
}

/** 同じキーの要素が2つ以上ある、その要素の表し方（1つのキーにつき1回） */
function repeated(list, keyOf, labelOf) {
  const seen = new Set();
  const reported = new Set();
  const labels = [];
  for (const element of list) {
    const key = keyOf(element);
    if (seen.has(key) && !reported.has(key)) {
      reported.add(key);
      labels.push(labelOf(element));
    }
    seen.add(key);
  }
  return labels;
}

/**
 * 抜き出しと読み直しのメモを照らし合わせられないわけ（compareReread の前に確かめる）。機種が違うメモどうし、
 * 同じ項目（読み直しは同じ項目・出典）の行が2つあってどちらと比べるか決まらないメモは照合しない。
 * @returns {string[]} 照合できるなら空の配列
 */
export function rereadPairingProblems(extract, reread) {
  const problems = [];
  if (extract.machineId !== reread.machineId) {
    problems.push(`機種 ID が違う（抜き出し ${extract.machineId}・読み直し ${reread.machineId}）`);
  }
  for (const label of repeated(
    extract.items,
    (item) => lineKey(item.kind, item.name, null),
    itemLabel
  )) {
    problems.push(`抜き出しのメモに同じ項目の行が2つ以上ある: ${label}`);
  }
  for (const label of repeated(
    reread.items,
    (line) => lineKey(line.kind, line.name, line.source),
    lineLabel
  )) {
    problems.push(`読み直しのメモに同じ項目・出典の行が2つ以上ある: ${label}`);
  }
  return problems;
}

function sameSet(a, b) {
  const sa = [...new Set(a)].sort();
  const sb = [...new Set(b)].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * valuesAgree が一致しないとした2つの値の、どこが違うか。
 * @returns {string[]}
 */
function disagreement(unit, extracted, reread) {
  const shapeProblems = [
    ['抜き出し', extracted],
    ['読み直し', reread],
  ]
    .map(([who, value]) => [who, shapeError(unit, value)])
    .filter(([, problem]) => problem !== null)
    .map(([who, problem]) => `${who}の値が unit（${unit}）の形に合わない: ${problem}`);
  if (shapeProblems.length > 0) return shapeProblems;

  if (unit === 'settings') {
    return ['confirmed', 'excluded']
      .filter((key) => !sameSet(extracted[key], reread[key]))
      .map(
        (key) =>
          `${key}: 抜き出し ${JSON.stringify(extracted[key])}・読み直し ${JSON.stringify(reread[key])}`
      );
  }

  const details = [];
  const onlyExtracted = Object.keys(extracted).filter((k) => !Object.hasOwn(reread, k));
  const onlyReread = Object.keys(reread).filter((k) => !Object.hasOwn(extracted, k));
  if (onlyExtracted.length > 0) details.push(`読み直しに無い設定: ${onlyExtracted.join(', ')}`);
  if (onlyReread.length > 0) details.push(`抜き出しに無い設定: ${onlyReread.join(', ')}`);
  for (const key of Object.keys(extracted).filter((k) => Object.hasOwn(reread, k))) {
    const a = parseShown(unit, extracted[key]);
    const b = parseShown(unit, reread[key]);
    if (intervalsOverlap(a, b)) continue;
    const pair = `${JSON.stringify(extracted[key])} と ${JSON.stringify(reread[key])}`;
    details.push(
      a.zero || b.zero
        ? `設定 ${key}: ${pair} は一致しない（確率 0 は確率 0 とだけ一致する）`
        : `設定 ${key}: ${pair} は丸めの幅が重ならない`
    );
  }
  return details;
}

/**
 * 読み直しのメモの各行を、抜き出しのメモの同じ項目・同じ出典の値と valuesAgree で比べる（丸めの幅が重なるか。
 * 載っている設定の組が違えば一致しない）。unit は抜き出しのメモの同じ項目の unit を使う。
 * rereadPairingProblems が空のメモどうしで使う。
 * @returns {{
 *   agreed: number,
 *   mismatches: Array<{ kind, name, source, unit, extracted, reread, details: string[] }>,
 *   notReread: Array<{ kind, name, source }>,
 *   rereadOnly: Array<{ kind, name, source, reason: string }>,
 * }}
 *   notReread は抜き出しで値のある項目・出典のうち読み直しに行が無いもの、rereadOnly は抜き出しに項目か
 *   その出典の値が無い読み直しの行
 */
export function compareReread(extract, reread) {
  const itemByKey = new Map(
    extract.items.map((item) => [lineKey(item.kind, item.name, null), item])
  );
  const compared = new Set();
  const mismatches = [];
  const rereadOnly = [];
  let agreed = 0;

  for (const line of reread.items) {
    const { kind, name, source } = line;
    const item = itemByKey.get(lineKey(kind, name, null));
    if (!item) {
      rereadOnly.push({ kind, name, source, reason: '抜き出しにこの項目が無い' });
      continue;
    }
    if (!Object.hasOwn(item.values, source)) {
      rereadOnly.push({ kind, name, source, reason: '抜き出しにこの出典の値が無い' });
      continue;
    }
    compared.add(lineKey(kind, name, source));
    const extracted = item.values[source];
    if (valuesAgree(item.unit, extracted, line.value)) {
      agreed += 1;
    } else {
      mismatches.push({
        kind,
        name,
        source,
        unit: item.unit,
        extracted,
        reread: line.value,
        details: disagreement(item.unit, extracted, line.value),
      });
    }
  }

  const notReread = extract.items.flatMap(({ kind, name, values }) =>
    Object.keys(values)
      .filter((source) => !compared.has(lineKey(kind, name, source)))
      .map((source) => ({ kind, name, source }))
  );

  return { agreed, mismatches, notReread, rereadOnly };
}
