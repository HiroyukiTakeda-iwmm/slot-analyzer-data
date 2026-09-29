import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { noteSchemaErrors } from '../scripts/lib/notes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = resolve(ROOT, 'scripts/reread-compare.mjs');

/** 指示書の例の抜き出しのメモ（machineFile を足し、unit ごとの項目と、どの出典にも無かった項目を加えた） */
function extractNote() {
  return {
    machineId: 'karakuri-circus2',
    machineName: 'Lパチスロ からくりサーカス2',
    machineFile: 'karakuri-circus2/karakuri-circus2.json',
    availableSettings: ['1', '2', '3', '4', '5', '6'],
    sources: [
      {
        key: 'chonborista',
        kind: 'analysis-site',
        url: 'https://chonborista.com/slot/sankyo-slot/256699/',
        retrievedAt: '2026-09-28',
      },
      {
        key: 'nana',
        kind: 'analysis-site',
        url: 'https://nana-press.com/kaiseki/machine/1/',
        retrievedAt: '2026-09-28',
      },
    ],
    items: [
      {
        kind: 'role',
        name: '弱チェリー',
        unit: 'denominator',
        values: { chonborista: { 1: 99.9, 6: 94.2 }, nana: { 1: '99.90', 6: 94.2 } },
      },
      {
        kind: 'trialSuccessRate',
        name: 'CZ成功率',
        unit: 'percent',
        values: { chonborista: { 1: '3.1', 6: 40 } },
      },
      {
        kind: 'endScreen',
        name: '金',
        unit: 'settings',
        values: { chonborista: { confirmed: ['5', '6'], excluded: [] } },
      },
      {
        kind: 'confirmationEvent',
        name: 'エンディング',
        unit: 'presence',
        values: { chonborista: true },
      },
      { kind: 'role', name: '中段チェリー', unit: 'denominator', values: {} },
    ],
  };
}

/** extractNote のすべての値を、表示の書き方を変えて（丸めの幅は重なる）読み直したメモ */
function rereadNote() {
  return {
    machineId: 'karakuri-circus2',
    by: 'reread-agent-2',
    items: [
      { kind: 'role', name: '弱チェリー', source: 'chonborista', value: { 1: 99.9, 6: 94.24 } },
      { kind: 'role', name: '弱チェリー', source: 'nana', value: { 1: 99.9, 6: '94.2' } },
      {
        kind: 'trialSuccessRate',
        name: 'CZ成功率',
        source: 'chonborista',
        value: { 1: '3.1%', 6: '40.0' },
      },
      {
        kind: 'endScreen',
        name: '金',
        source: 'chonborista',
        value: { confirmed: ['6', '5'], excluded: [] },
      },
      { kind: 'confirmationEvent', name: 'エンディング', source: 'chonborista', value: true },
    ],
  };
}

describe('schemas/notes.schema.json', () => {
  it('指示書の形の抜き出しのメモ（machineFile 付き）と読み直しのメモを通す', () => {
    expect(noteSchemaErrors('extract', extractNote())).toEqual([]);
    expect(noteSchemaErrors('reread', rereadNote())).toEqual([]);
  });

  it('抜き出しのメモの machineFile は必須で、出典記録の machineFile と同じ形', () => {
    const missing = extractNote();
    delete missing.machineFile;
    expect(noteSchemaErrors('extract', missing).join('\n')).toContain('machineFile');
    const absolute = { ...extractNote(), machineFile: '/karakuri-circus2/karakuri-circus2.json' };
    expect(noteSchemaErrors('extract', absolute).join('\n')).toContain('/machineFile');
    const notJson = { ...extractNote(), machineFile: 'karakuri-circus2/karakuri-circus2.txt' };
    expect(noteSchemaErrors('extract', notJson)).not.toEqual([]);
  });

  it('抜き出しのメモの必須の欄（machineName・availableSettings・sources・items）', () => {
    for (const key of ['machineId', 'machineName', 'availableSettings', 'sources', 'items']) {
      const note = extractNote();
      delete note[key];
      expect(noteSchemaErrors('extract', note).join('\n')).toContain(key);
    }
  });

  it('values の {}（どの出典にも無かった項目）を通す', () => {
    const note = extractNote();
    note.items = [{ kind: 'role', name: '中段チェリー', unit: 'denominator', values: {} }];
    expect(noteSchemaErrors('extract', note)).toEqual([]);
  });

  it('unreadable は { url, route, at, reason } の一覧（at は日時か日付）', () => {
    const page = {
      url: 'https://example.com/slot/1/',
      route: 'WebFetch',
      at: '2026-09-28T21:05:00+09:00',
      reason: '403 で読めない',
    };
    const withPages = (pages) => ({ ...extractNote(), unreadable: pages });
    expect(noteSchemaErrors('extract', withPages([page, { ...page, at: '2026-09-28' }]))).toEqual(
      []
    );
    expect(noteSchemaErrors('reread', { ...rereadNote(), unreadable: [page] })).toEqual([]);
    for (const key of ['url', 'route', 'at', 'reason']) {
      const partial = { ...page };
      delete partial[key];
      expect(noteSchemaErrors('extract', withPages([partial])).join('\n')).toContain(key);
    }
    expect(noteSchemaErrors('extract', withPages([{ ...page, at: 'きのう' }]))).not.toEqual([]);
    expect(noteSchemaErrors('extract', withPages([{ ...page, url: 'example.com' }]))).not.toEqual(
      []
    );
    expect(noteSchemaErrors('extract', withPages([{ ...page, route: '' }]))).not.toEqual([]);
    expect(noteSchemaErrors('extract', withPages([{ ...page, extra: 1 }]))).not.toEqual([]);
    expect(noteSchemaErrors('extract', withPages(['https://example.com/']))).not.toEqual([]);
  });

  it('notes は空でない文字列の配列', () => {
    expect(noteSchemaErrors('extract', { ...extractNote(), notes: ['表2 は画像だけ'] })).toEqual(
      []
    );
    expect(noteSchemaErrors('reread', { ...rereadNote(), notes: ['BIG が見つからない'] })).toEqual(
      []
    );
    expect(noteSchemaErrors('extract', { ...extractNote(), notes: 'メモ' })).not.toEqual([]);
    expect(noteSchemaErrors('extract', { ...extractNote(), notes: [1] })).not.toEqual([]);
    expect(noteSchemaErrors('reread', { ...rereadNote(), notes: [''] })).not.toEqual([]);
  });

  it('値の形は出典記録と同じ（設定のキー・数の文字列・% ・null・設定の組・有無）', () => {
    const withValues = (values) => {
      const note = extractNote();
      note.items = [{ kind: 'role', name: '弱チェリー', unit: 'denominator', values }];
      return note;
    };
    expect(
      noteSchemaErrors('extract', withValues({ chonborista: { 1: '300.0', 2: '3.1%', 6: null } }))
    ).toEqual([]);
    expect(noteSchemaErrors('extract', withValues({ chonborista: { 7: 99.9 } }))).not.toEqual([]);
    expect(noteSchemaErrors('extract', withValues({ chonborista: { 1: '1/99.9' } }))).not.toEqual(
      []
    );
    expect(noteSchemaErrors('extract', withValues({ chonborista: {} }))).not.toEqual([]);
    expect(noteSchemaErrors('extract', withValues({ Chonborista: { 1: 99.9 } }))).not.toEqual([]);
    expect(noteSchemaErrors('extract', withValues({ chonborista: false }))).not.toEqual([]);
    const reread = rereadNote();
    reread.items[0].value = { 1: 'ほぼ 1/100' };
    expect(noteSchemaErrors('reread', reread)).not.toEqual([]);
  });

  it('種類・unit・出典・設定の段階は出典記録と同じ候補', () => {
    const note = extractNote();
    note.items[0].kind = 'bonus';
    expect(noteSchemaErrors('extract', note).join('\n')).toContain('/items/0/kind');
    const unit = extractNote();
    unit.items[0].unit = 'ratio';
    expect(noteSchemaErrors('extract', unit).join('\n')).toContain('/items/0/unit');
    const source = extractNote();
    source.sources[0].url = 'http://chonborista.com/';
    expect(noteSchemaErrors('extract', source).join('\n')).toContain('/sources/0/url');
    expect(noteSchemaErrors('extract', { ...extractNote(), sources: [] })).not.toEqual([]);
    expect(noteSchemaErrors('extract', { ...extractNote(), availableSettings: [] })).not.toEqual(
      []
    );
    expect(
      noteSchemaErrors('extract', { ...extractNote(), availableSettings: ['1', '1'] })
    ).not.toEqual([]);
    expect(noteSchemaErrors('extract', { ...extractNote(), availableSettings: ['7'] })).not.toEqual(
      []
    );
  });

  it('知らない欄を通さない（メモの最上位・項目・読み直しの行）', () => {
    expect(noteSchemaErrors('extract', { ...extractNote(), reviewedAt: '2026-09-28' })).not.toEqual(
      []
    );
    const item = extractNote();
    item.items[0].status = 'confirmed';
    expect(noteSchemaErrors('extract', item)).not.toEqual([]);
    const line = rereadNote();
    line.items[0].unit = 'denominator';
    expect(noteSchemaErrors('reread', line)).not.toEqual([]);
    expect(noteSchemaErrors('reread', { ...rereadNote(), machineName: 'x' })).not.toEqual([]);
  });

  it('知らない欄は、その欄の名前を文面に出す', () => {
    expect(noteSchemaErrors('extract', { ...extractNote(), reviewedAt: '2026-09-28' })).toContain(
      '（最上位） must NOT have additional properties（知らない欄: reviewedAt）'
    );
    const item = extractNote();
    item.items[0].status = 'confirmed';
    expect(noteSchemaErrors('extract', item)).toContain(
      '/items/0 must NOT have additional properties（知らない欄: status）'
    );
    const page = {
      url: 'https://example.com/',
      route: 'WebFetch',
      at: '2026-09-28',
      reason: '403 で読めない',
      extra: 1,
    };
    expect(noteSchemaErrors('reread', { ...rereadNote(), unreadable: [page] })).toContain(
      '/unreadable/0 must NOT have additional properties（知らない欄: extra）'
    );
  });

  it('読み直しのメモの必須の欄（machineId・by・items、行の kind・name・source・value）', () => {
    for (const key of ['machineId', 'by', 'items']) {
      const note = rereadNote();
      delete note[key];
      expect(noteSchemaErrors('reread', note).join('\n')).toContain(key);
    }
    for (const key of ['kind', 'name', 'source', 'value']) {
      const note = rereadNote();
      delete note.items[0][key];
      expect(noteSchemaErrors('reread', note).join('\n')).toContain(key);
    }
    expect(noteSchemaErrors('reread', { ...rereadNote(), by: '' })).not.toEqual([]);
  });

  it('値・種類・unit・出典・日付の定義は出典記録のスキーマを参照する（書き写さない）', () => {
    const schema = JSON.parse(readFileSync(resolve(ROOT, 'schemas/notes.schema.json'), 'utf-8'));
    const text = JSON.stringify(schema);
    for (const ref of [
      'provenance.schema.json#/properties/machineId',
      'provenance.schema.json#/properties/machineFile',
      'provenance.schema.json#/properties/sources',
      'provenance.schema.json#/definitions/kind',
      'provenance.schema.json#/definitions/unit',
      'provenance.schema.json#/definitions/valuesBySource',
      'provenance.schema.json#/definitions/value',
      'provenance.schema.json#/definitions/sourceKey',
      'provenance.schema.json#/definitions/settingList',
      'provenance.schema.json#/definitions/date',
    ]) {
      expect(text).toContain(`"$ref":"${ref}"`);
    }
    expect(text).not.toContain('"enum"');
    expect(text).not.toContain('patternProperties');
  });
});

describe('scripts/reread-compare.mjs', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reread-compare-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** 一時フォルダにメモを書く（オブジェクトは JSON に、文字列はそのまま） */
  function writeNote(name, content) {
    const path = join(dir, name);
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return path;
  }

  /** 2つのメモを書いて照合する */
  function compare(extract, reread) {
    const extractPath = writeNote('karakuri-circus2.extract.json', extract);
    const rereadPath = writeNote('karakuri-circus2.reread.json', reread);
    return spawnSync(process.execPath, [CLI, extractPath, rereadPath], {
      cwd: ROOT,
      encoding: 'utf-8',
    });
  }

  it('すべて一致: 丸めの幅が重なれば、表示の書き方が違っても一致（終了コード 0）', () => {
    const result = compare(extractNote(), rereadNote());
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      ['karakuri-circus2: 読み直しの照合（by reread-agent-2）', 'すべて一致（5 行）', ''].join('\n')
    );
  });

  it('食い違い: 丸めの幅が重ならない設定を並べる（終了コード 1）', () => {
    const reread = rereadNote();
    reread.items[0].value = { 1: 99.9, 6: 94.5 };
    const result = compare(extractNote(), reread);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        'karakuri-circus2: 読み直しの照合（by reread-agent-2）',
        '一致 4・食い違い 1・読み直していない 0・読み直しにしか無い 0',
        '',
        '食い違い 1:',
        '  role 弱チェリー [chonborista]（denominator）',
        '    抜き出し: {"1":99.9,"6":94.2}',
        '    読み直し: {"1":99.9,"6":94.5}',
        '    設定 6: 94.2 と 94.5 は丸めの幅が重ならない',
        '',
      ].join('\n')
    );
  });

  it('比べるのは表示の文字列ではなく丸めの幅（"300.0" と 300.4 は食い違い、300 と 300.4 は一致）', () => {
    const extract = extractNote();
    extract.items[0].values.chonborista = { 1: '300.0', 6: 300 };
    const reread = rereadNote();
    reread.items[0].value = { 1: 300.4, 6: 300.4 };
    const result = compare(extract, reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('    設定 1: "300.0" と 300.4 は丸めの幅が重ならない\n');
    expect(result.stdout).not.toContain('設定 6');
  });

  it('unit は抜き出しのメモの同じ項目の unit を使う（percent の "3.1" と "3.1%" は一致）', () => {
    const extract = extractNote();
    extract.items[1].values.chonborista = { 1: '3.1' };
    const reread = rereadNote();
    reread.items[2].value = { 1: '3.1%' };
    expect(compare(extract, reread).status).toBe(0);

    // 同じ値でも、抜き出しの unit が denominator なら 1/3.1 と 3.1% で食い違う
    extract.items[1].unit = 'denominator';
    const result = compare(extract, reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('  trialSuccessRate CZ成功率 [chonborista]（denominator）\n');
  });

  it('載っている設定の組が違えば食い違い（一部だけ読めた、は一致にしない）', () => {
    const reread = rereadNote();
    reread.items[0].value = { 1: 99.9 };
    reread.items[1].value = { 1: 99.9, 2: 98.0, 6: 94.2 };
    const result = compare(extractNote(), reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('食い違い 2:');
    expect(result.stdout).toContain(
      '  role 弱チェリー [chonborista]（denominator）\n    抜き出し: {"1":99.9,"6":94.2}\n    読み直し: {"1":99.9}\n    読み直しに無い設定: 6\n'
    );
    expect(result.stdout).toContain('  role 弱チェリー [nana]（denominator）');
    expect(result.stdout).toContain('    抜き出しに無い設定: 2\n');
  });

  it('設定の組・確率 0・読み直しの値の形が合わない食い違い', () => {
    const extract = extractNote();
    extract.items[0].values.nana = { 1: null, 6: 94.2 };
    const reread = rereadNote();
    reread.items[3].value = { confirmed: ['6'], excluded: ['1'] };
    reread.items[1].value = { 1: 99.9, 6: 94.2 };
    reread.items[2].value = { 1: null, 6: 40 };
    const result = compare(extract, reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('食い違い 3:');
    expect(result.stdout).toContain(
      '  endScreen 金 [chonborista]（settings）\n    抜き出し: {"confirmed":["5","6"],"excluded":[]}\n    読み直し: {"confirmed":["6"],"excluded":["1"]}\n    confirmed: 抜き出し ["5","6"]・読み直し ["6"]\n    excluded: 抜き出し []・読み直し ["1"]\n'
    );
    expect(result.stdout).toContain(
      '    設定 1: null と 99.9 は一致しない（確率 0 は確率 0 とだけ一致する）\n'
    );
    expect(result.stdout).toContain(
      '    読み直しの値が unit（percent）の形に合わない: 設定ごとに、0〜100 の割合（数か、表示の桁を残した文字列）が必要\n'
    );
  });

  it('照合する行が無ければ、成功にしない（終了コード 1）', () => {
    const extract = extractNote();
    extract.items = extract.items.map((item) => ({ ...item, values: {} }));
    const empty = compare(extract, { ...rereadNote(), items: [] });
    expect(empty.status).toBe(1);
    expect(empty.stderr).toBe('');
    expect(empty.stdout).toBe(
      [
        'karakuri-circus2: 読み直しの照合（by reread-agent-2）',
        '照合する行が無い（抜き出しと読み直しの両方に値のある項目・出典が 0 件）',
        '',
      ].join('\n')
    );

    const noItems = compare({ ...extractNote(), items: [] }, { ...rereadNote(), items: [] });
    expect(noItems.status).toBe(1);
    expect(noItems.stdout).toContain('照合する行が無い');

    // 読み直しの行が1つも無いときは、読み直していない行とともに出す
    const notReread = compare(extractNote(), { ...rereadNote(), items: [] });
    expect(notReread.status).toBe(1);
    expect(notReread.stdout).toContain(
      '照合する行が無い（抜き出しと読み直しの両方に値のある項目・出典が 0 件）\n一致 0・食い違い 0・読み直していない 5・読み直しにしか無い 0\n'
    );
  });

  it('抜き出しで値のある項目・出典のうち、読み直しに行が無いものは「読み直していない」', () => {
    const reread = rereadNote();
    reread.items = reread.items.filter((line) => line.source !== 'nana');
    const result = compare(extractNote(), reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      [
        'karakuri-circus2: 読み直しの照合（by reread-agent-2）',
        '一致 4・食い違い 0・読み直していない 1・読み直しにしか無い 0',
        '',
        '読み直していない 1（抜き出しにだけ値がある）:',
        '  role 弱チェリー [nana]',
        '',
      ].join('\n')
    );
  });

  it('「読み直しにしか無い行」は、出典キーが sources に無い・項目が無い・その出典の値が無い、を分けて出す', () => {
    const reread = rereadNote();
    const settings = { confirmed: ['6'], excluded: [] };
    reread.items.push(
      { kind: 'role', name: '中段チェリー', source: 'chonborista', value: { 1: 12000 } },
      { kind: 'role', name: '強チェリー', source: 'chonborista', value: { 1: 300 } },
      { kind: 'endScreen', name: '金', source: 'nana', value: settings },
      { kind: 'endScreen', name: '金', source: 'dmm', value: settings },
      { kind: 'role', name: '強チェリー', source: 'dmm', value: { 1: 300 } }
    );
    const result = compare(extractNote(), reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe(
      [
        'karakuri-circus2: 読み直しの照合（by reread-agent-2）',
        '一致 5・食い違い 0・読み直していない 0・読み直しにしか無い 5',
        '',
        '読み直しにしか無い 5:',
        '  role 中段チェリー [chonborista]: 抜き出しにこの出典の値が無い',
        '  role 強チェリー [chonborista]: 抜き出しにこの項目が無い',
        '  endScreen 金 [nana]: 抜き出しにこの出典の値が無い',
        '  endScreen 金 [dmm]: 抜き出しの sources にこの出典キーが無い（書き違いか、抜き出しで読んでいない出典）',
        '  role 強チェリー [dmm]: 抜き出しの sources にこの出典キーが無い（書き違いか、抜き出しで読んでいない出典）',
        '',
      ].join('\n')
    );
  });

  it('同じ名前でも kind が違えば別の項目', () => {
    const reread = rereadNote();
    reread.items.push({
      kind: 'zoneRole',
      name: '弱チェリー',
      source: 'chonborista',
      value: { 1: 99.9, 6: 94.2 },
    });
    const result = compare(extractNote(), reread);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      '  zoneRole 弱チェリー [chonborista]: 抜き出しにこの項目が無い\n'
    );
  });

  describe('照合できないとき（終了コード 2）', () => {
    it('ファイルが無い・JSON でない', () => {
      const reread = writeNote('r.json', rereadNote());
      const missing = spawnSync(process.execPath, [CLI, join(dir, 'none.json'), reread], {
        encoding: 'utf-8',
      });
      expect(missing.status).toBe(2);
      expect(missing.stdout).toBe('');
      expect(missing.stderr).toContain(`読めない: ${join(dir, 'none.json')}`);

      const broken = compare('{ "machineId": ', rereadNote());
      expect(broken.status).toBe(2);
      expect(broken.stderr).toContain('JSON として読めない');
    });

    it('メモの形に合わない（どこが合わないかを出す）', () => {
      const extract = extractNote();
      delete extract.machineFile;
      const result = compare(extract, rereadNote());
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('抜き出しのメモの形に合わない');
      expect(result.stderr).toContain('machineFile');

      const reread = rereadNote();
      reread.items[0].source = 'ちょんぼりすた';
      const bad = compare(extractNote(), reread);
      expect(bad.status).toBe(2);
      expect(bad.stderr).toContain('読み直しのメモの形に合わない');
      expect(bad.stderr).toContain('/items/0/source');
    });

    it('抜き出しの値が unit の形に合わない（照合する前に止める）', () => {
      const extract = extractNote();
      extract.items[1].values.chonborista = { 1: null, 6: 40 };
      extract.items[3].values.chonborista = { 1: 99.9 };
      const result = compare(extract, rereadNote());
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        [
          '照合できない: 抜き出しの trialSuccessRate CZ成功率 [chonborista] の値が unit（percent）の形に合わない: 設定ごとに、0〜100 の割合（数か、表示の桁を残した文字列）が必要',
          '照合できない: 抜き出しの confirmationEvent エンディング [chonborista] の値が unit（presence）の形に合わない: true が必要',
          '',
        ].join('\n')
      );

      // 読み直しに行の無い出典の値も確かめる
      const notCompared = extractNote();
      notCompared.items[0].values.nana = { 1: 0.5 };
      const reread = rereadNote();
      reread.items = reread.items.filter((line) => line.source !== 'nana');
      const onlyExtract = compare(notCompared, reread);
      expect(onlyExtract.status).toBe(2);
      expect(onlyExtract.stderr).toContain('抜き出しの role 弱チェリー [nana] の値が unit');
    });

    it('抜き出しの values の出典キーが sources に無い・sources に同じ出典キーが2つある（照合する前に止める）', () => {
      // 読み直しがその出典を読んでいても、「読み直していない」と「読み直しにしか無い」を同時に出さない
      const extract = extractNote();
      extract.items[0].values.dmm = { 1: 99.9, 6: 94.2 };
      const reread = rereadNote();
      reread.items.push({
        kind: 'role',
        name: '弱チェリー',
        source: 'dmm',
        value: { 1: 99.9, 6: 94.2 },
      });
      const result = compare(extract, reread);
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        '照合できない: 抜き出しの role 弱チェリー [dmm] の出典キーが sources に無い（書き違いか、sources の書き漏れ）\n'
      );

      const twice = extractNote();
      twice.sources.push({ ...twice.sources[1], url: 'https://nana-press.com/other/' });
      const keys = compare(twice, rereadNote());
      expect(keys.status).toBe(2);
      expect(keys.stderr).toContain('抜き出しのメモの sources に同じ出典キーが2つ以上ある: nana');
    });

    it('抜き出しと読み直しの機種 ID が違う', () => {
      const result = compare(extractNote(), { ...rereadNote(), machineId: 'sao2' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('機種 ID が違う（抜き出し karakuri-circus2・読み直し sao2）');
    });

    it('同じ項目の行が2つある（どちらと比べるか決まらない）', () => {
      const extract = extractNote();
      extract.items.push({ ...extract.items[0] });
      const twice = compare(extract, rereadNote());
      expect(twice.status).toBe(2);
      expect(twice.stderr).toContain('抜き出しのメモに同じ項目の行が2つ以上ある: role 弱チェリー');

      const reread = rereadNote();
      reread.items.push({ ...reread.items[1] });
      const lines = compare(extractNote(), reread);
      expect(lines.status).toBe(2);
      expect(lines.stderr).toContain(
        '読み直しのメモに同じ項目・出典の行が2つ以上ある: role 弱チェリー [nana]'
      );
    });

    it('引数が2つでない・知らない引数', () => {
      const one = spawnSync(process.execPath, [CLI, 'a.json'], { encoding: 'utf-8' });
      expect(one.status).toBe(2);
      expect(one.stderr).toContain('使い方: node scripts/reread-compare.mjs');
      const option = spawnSync(process.execPath, [CLI, 'a.json', 'b.json', '--json'], {
        encoding: 'utf-8',
      });
      expect(option.status).toBe(2);
      expect(option.stderr).toContain('知らない引数: --json');
    });
  });
});
