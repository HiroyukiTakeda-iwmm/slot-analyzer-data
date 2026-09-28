/**
 * 抜き出しのメモ（<機種ID>.extract.json）と読み直しのメモ（<機種ID>.reread.json）を読み、照らし合わせる。
 *
 * メモはリポジトリの外（notes/<バッチ>/）に置く作業メモ。形は schemas/notes.schema.json の definitions の
 * extract・reread（値の形は出典記録と同じ）。docs/data-format.md の「抜き出し・読み直しのメモ」。
 */

import { readFileSync } from 'fs';
import { compileSchemaDefinition } from './compile-schema.mjs';
import { shapeError, valueDifferences } from './provenance.mjs';

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
 * @returns {string[]} 1件は「場所 説明」（知らない欄は、その欄の名前を添える）。合っていれば空の配列
 */
export function noteSchemaErrors(which, note) {
  const validate = validatorFor(which);
  if (validate(note)) return [];
  return validate.errors.map((e) => {
    const unknown =
      e.keyword === 'additionalProperties' ? `（知らない欄: ${e.params.additionalProperty}）` : '';
    return `${e.instancePath || '（最上位）'} ${e.message}${unknown}`;
  });
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
 * 抜き出しのメモの値のうち、その項目の unit の形に合わないもの（percent に null、presence に設定ごとの値など）。
 * スキーマは値の形を unit ごとには確かめない（出典記録と同じ定義）ので、ここで確かめる。
 * @returns {string[]} 合わない値ごとの説明。すべて合っていれば空の配列
 */
export function extractValueProblems(extract) {
  return extract.items.flatMap(({ kind, name, unit, values }) =>
    Object.entries(values).flatMap(([source, value]) => {
      const problem = shapeError(unit, value);
      return problem === null
        ? []
        : [
            `抜き出しの ${lineLabel({ kind, name, source })} の値が unit（${unit}）の形に合わない: ${problem}`,
          ];
    })
  );
}

/**
 * 抜き出しのメモだけで分かる、項目の誤り: 値が unit の形に合わない（extractValueProblems）・同じ項目（kind と
 * name）の行が2つ以上ある（どちらを使うか決まらない）。照合（rereadPairingProblems）と下書き
 * （provenance-draft.mjs）で同じ文面にする。
 * @returns {string[]} 誤りが無ければ空の配列
 */
export function extractItemProblems(extract) {
  return [
    ...extractValueProblems(extract),
    ...repeated(extract.items, (item) => lineKey(item.kind, item.name, null), itemLabel).map(
      (label) => `抜き出しのメモに同じ項目の行が2つ以上ある: ${label}`
    ),
  ];
}

/**
 * 抜き出しのメモの出典キーの誤り: sources に同じ出典キーが2つ以上ある（出典の種類が決まらない）・項目の values の
 * 出典キーが sources に無い（書き違いか、sources の書き漏れ）。スキーマは出典キーの形しか見ないので、ここで確かめる。
 * @returns {string[]} 誤りが無ければ空の配列
 */
export function extractSourceKeyProblems(extract) {
  const keys = new Set(extract.sources.map((source) => source.key));
  return [
    ...repeated(
      extract.sources,
      (source) => source.key,
      (source) => source.key
    ).map((key) => `抜き出しのメモの sources に同じ出典キーが2つ以上ある: ${key}`),
    ...extract.items.flatMap(({ kind, name, values }) =>
      Object.keys(values)
        .filter((source) => !keys.has(source))
        .map(
          (source) =>
            `抜き出しの ${lineLabel({ kind, name, source })} の出典キーが sources に無い（書き違いか、sources の書き漏れ）`
        )
    ),
  ];
}

/**
 * 抜き出しと読み直しのメモを照らし合わせられないわけ（compareReread の前に確かめる）。機種が違うメモどうし、
 * 抜き出しの値が unit の形に合わない（抜き出しの誤りで、読み直しとの食い違いではない）メモ、同じ項目（読み直しは
 * 同じ項目・出典）の行が2つあってどちらと比べるか決まらないメモは照合しない。
 * @returns {string[]} 照合できるなら空の配列
 */
export function rereadPairingProblems(extract, reread) {
  const problems = [];
  if (extract.machineId !== reread.machineId) {
    problems.push(`機種 ID が違う（抜き出し ${extract.machineId}・読み直し ${reread.machineId}）`);
  }
  problems.push(...extractItemProblems(extract));
  for (const label of repeated(
    reread.items,
    (line) => lineKey(line.kind, line.name, line.source),
    lineLabel
  )) {
    problems.push(`読み直しのメモに同じ項目・出典の行が2つ以上ある: ${label}`);
  }
  return problems;
}

/** valueDifferences の side（a が抜き出し、b が読み直し）の呼び方 */
const SIDE_LABELS = { a: '抜き出し', b: '読み直し' };

/**
 * 抜き出しと読み直しの値の違い（valueDifferences の結果）を、1つずつ文面にする。判定は valueDifferences だけで
 * 行い、ここでは書き直さない。
 * @returns {string[]}
 */
function describeDifferences(unit, extracted, reread, differences) {
  return differences.map((difference) => {
    switch (difference.type) {
      case 'shape':
        return `${SIDE_LABELS[difference.side]}の値が unit（${unit}）の形に合わない: ${difference.problem}`;
      case 'missingSettings':
        return `${SIDE_LABELS[difference.side]}に無い設定: ${difference.settings.join(', ')}`;
      case 'noOverlap': {
        const { setting } = difference;
        const pair = `${JSON.stringify(extracted[setting])} と ${JSON.stringify(reread[setting])}`;
        return difference.zero
          ? `設定 ${setting}: ${pair} は一致しない（確率 0 は確率 0 とだけ一致する）`
          : `設定 ${setting}: ${pair} は丸めの幅が重ならない`;
      }
      case 'settingSet': {
        const { key } = difference;
        return `${key}: 抜き出し ${JSON.stringify(extracted[key])}・読み直し ${JSON.stringify(reread[key])}`;
      }
      default:
        throw new Error(`説明の無い値の違い: ${difference.type}`);
    }
  });
}

/**
 * 読み直しの行を抜き出しと比べられないわけ（「読み直しにしか無い」の理由）。出典キーの書き違いを見分けられる
 * よう、抜き出しの sources に出典キーが無い場合を、項目が無い・その項目にその出典の値が無い場合と分ける。
 * @param {Set<string>} sourceKeys 抜き出しのメモの sources の key
 * @param {object | undefined} item 抜き出しのメモの同じ kind・name の項目
 * @returns {string | null} 比べられるなら null
 */
function rereadOnlyReason(sourceKeys, item, source) {
  if (!sourceKeys.has(source)) {
    return '抜き出しの sources にこの出典キーが無い（書き違いか、抜き出しで読んでいない出典）';
  }
  if (!item) return '抜き出しにこの項目が無い';
  if (!Object.hasOwn(item.values, source)) return '抜き出しにこの出典の値が無い';
  return null;
}

/**
 * 読み直しのメモの各行を、抜き出しのメモの同じ項目・同じ出典の値と比べる（判定は valuesAgree と同じ
 * valueDifferences。丸めの幅が重なるか。載っている設定の組が違えば一致しない）。unit は抜き出しのメモの同じ項目の
 * unit を使う。rereadPairingProblems が空のメモどうしで使う。
 * @returns {{
 *   agreed: number,
 *   mismatches: Array<{ kind, name, source, unit, extracted, reread, details: string[] }>,
 *   notReread: Array<{ kind, name, source }>,
 *   rereadOnly: Array<{ kind, name, source, reason: string }>,
 * }}
 *   notReread は抜き出しで値のある項目・出典のうち読み直しに行が無いもの、rereadOnly は抜き出しの sources に
 *   出典キーが無いか、抜き出しに項目かその出典の値が無い読み直しの行（reason でどれかを分ける）
 */
export function compareReread(extract, reread) {
  const itemByKey = new Map(
    extract.items.map((item) => [lineKey(item.kind, item.name, null), item])
  );
  const sourceKeys = new Set(extract.sources.map((source) => source.key));
  const compared = new Set();
  const mismatches = [];
  const rereadOnly = [];
  let agreed = 0;

  for (const line of reread.items) {
    const { kind, name, source } = line;
    const item = itemByKey.get(lineKey(kind, name, null));
    const reason = rereadOnlyReason(sourceKeys, item, source);
    if (reason !== null) {
      rereadOnly.push({ kind, name, source, reason });
      continue;
    }
    compared.add(lineKey(kind, name, source));
    const extracted = item.values[source];
    const differences = valueDifferences(item.unit, extracted, line.value);
    if (differences.length === 0) {
      agreed += 1;
    } else {
      mismatches.push({
        kind,
        name,
        source,
        unit: item.unit,
        extracted,
        reread: line.value,
        details: describeDifferences(item.unit, extracted, line.value, differences),
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
