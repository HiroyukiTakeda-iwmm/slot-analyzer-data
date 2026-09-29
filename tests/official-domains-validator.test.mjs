import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { validateOfficialDomains } from '../scripts/validators/official-domains-validator.mjs';
import { loadOfficialDomainsFile } from '../scripts/lib/load-provenance.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('validateOfficialDomains（公式ドメインの一覧の検証）', () => {
  const PATH = 'config/official-domains.json';
  const entry = (domain, overrides = {}) => ({
    domain,
    maker: 'サミー',
    evidence: 'https://www.sammy.co.jp/japanese/company/',
    checkedAt: '2026-09-27',
    ...overrides,
  });
  const check = (data) => validateOfficialDomains({ path: PATH, data });
  const messagesOf = (result) => result.errors.map((e) => e.message);

  it('正しい一覧なら、エラーなしでドメインの集まりを返す（空の一覧も正しい）', () => {
    const result = check({
      domains: [entry('sammy.co.jp'), entry('daito.co.jp', { maker: '大都技研' })],
    });
    expect(result.errors).toEqual([]);
    expect(result.domains).toEqual(new Set(['sammy.co.jp', 'daito.co.jp']));
    expect(check({ domains: [] })).toEqual({ errors: [], warnings: [], domains: new Set() });
  });

  it('同じドメインの重複はエラーで、一覧を使わない（domains は null）', () => {
    const result = check({
      domains: [entry('sammy.co.jp'), entry('sammy.co.jp', { maker: '別' })],
    });
    expect(messagesOf(result)).toEqual(['公式ドメインの一覧で重複: sammy.co.jp']);
    expect(result.domains).toBeNull();
    expect(result.errors[0]).toMatchObject({
      file: PATH,
      type: 'official-domains',
      severity: 'error',
    });
  });

  it('domain は登録ドメインにする（www.・サブドメインは、siteOf と同じ計算で止める）', () => {
    const result = check({ domains: [entry('www.sammy.co.jp'), entry('sp.daito.co.jp')] });
    expect(messagesOf(result)).toEqual([
      '公式ドメインの一覧の domain は登録ドメインにする（www.・サブドメインを付けない）: www.sammy.co.jp（登録ドメイン: sammy.co.jp）',
      '公式ドメインの一覧の domain は登録ドメインにする（www.・サブドメインを付けない）: sp.daito.co.jp（登録ドメイン: daito.co.jp）',
    ]);
    expect(result.domains).toBeNull();
  });

  it.each([
    ['大文字', { domains: [entry('Sammy.co.jp')] }, '/domains/0/domain'],
    ['URL の形', { domains: [entry('https://sammy.co.jp/')] }, '/domains/0/domain'],
    ['ラベルが1つ', { domains: [entry('localhost')] }, '/domains/0/domain'],
    [
      'evidence が http',
      { domains: [entry('sammy.co.jp', { evidence: 'http://www.sammy.co.jp/' })] },
      '/domains/0/evidence',
    ],
    [
      'checkedAt が日付でない',
      { domains: [entry('sammy.co.jp', { checkedAt: '2026-02-30' })] },
      '/domains/0/checkedAt',
    ],
    ['maker が空', { domains: [entry('sammy.co.jp', { maker: '' })] }, '/domains/0/maker'],
    ['知らない欄', { domains: [entry('sammy.co.jp', { note: 'x' })] }, '/domains/0'],
    ['domains が無い', {}, ''],
  ])('スキーマに合わなければエラーで、一覧を使わない: %s', (_label, data, instancePath) => {
    const result = check(data);
    expect(messagesOf(result).join('\n')).toContain(`スキーマ違反 ${instancePath}`);
    expect(result.domains).toBeNull();
  });

  it('読めた中身が JSON の null などなら、「読めない」でなくスキーマの確かめに進む', () => {
    for (const data of [null, [], 'domains']) {
      const result = check(data);
      expect(messagesOf(result)).toEqual(['スキーマ違反  must be object']);
      expect(result.domains).toBeNull();
    }
  });

  it('ファイルが無い・JSON として読めないときは、空の一覧として続けずにエラーにする', () => {
    const missing = loadOfficialDomainsFile(join(tmpdir(), 'no-such-dir-for-official-domains'));
    expect(missing).toMatchObject({ path: PATH, data: null });
    expect(missing.readError).toEqual(expect.any(String));
    const result = validateOfficialDomains(missing);
    expect(messagesOf(result)).toEqual([`公式ドメインの一覧を読めない: ${missing.readError}`]);
    expect(result.domains).toBeNull();

    const broken = mkdtempSync(join(tmpdir(), 'official-domains-broken-'));
    try {
      cpSync(join(ROOT, 'config'), join(broken, 'config'), { recursive: true });
      writeFileSync(join(broken, 'config/official-domains.json'), '{ "domains": [');
      const unreadable = loadOfficialDomainsFile(broken);
      expect(unreadable.data).toBeNull();
      expect(messagesOf(validateOfficialDomains(unreadable))).toEqual([
        `公式ドメインの一覧を読めない: ${unreadable.readError}`,
      ]);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });

  it('リポジトリの一覧は、スキーマと決まりに合う', () => {
    const result = validateOfficialDomains(loadOfficialDomainsFile(ROOT));
    expect(result.errors).toEqual([]);
    expect(result.domains).toBeInstanceOf(Set);
  });
});

describe('validate.mjs と公式ドメインの一覧（読み込みのつなぎ）', () => {
  // リポジトリの写しで validate.mjs を動かす（本物の config と provenance は書き換えない）
  let dir;
  const configPath = () => join(dir, 'config/official-domains.json');
  const runValidate = () =>
    spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: dir, encoding: 'utf-8' });
  const section = (stdout) =>
    /--- 公式ドメインの一覧 ---\n {2}ドメイン: (\d+件|使えない) \/ エラー: (\d+)件 \/ 警告: (\d+)件/.exec(
      stdout
    );
  const writeList = (domains) => writeFileSync(configPath(), JSON.stringify({ domains }, null, 2));
  const sammy = {
    domain: 'sammy.co.jp',
    maker: 'サミー',
    evidence: 'https://www.sammy.co.jp/japanese/company/',
    checkedAt: '2026-09-27',
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'official-domains-'));
    for (const name of ['scripts', 'schemas', 'config', 'machines', 'provenance', 'package.json']) {
      cpSync(join(ROOT, name), join(dir, name), { recursive: true });
    }
    symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  });

  // it ごとに、一覧を本物の中身に、provenance/ を本物（記録の無い状態）に置き直す（順に依存しない）
  beforeEach(() => {
    for (const name of ['config', 'provenance']) {
      rmSync(join(dir, name), { recursive: true, force: true });
      cpSync(join(ROOT, name), join(dir, name), { recursive: true });
    }
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('一覧の節を「ドメイン・エラー・警告」の件数で出し、一覧のエラーを合計に数える', () => {
    writeList([]);
    let result = runValidate();
    expect(result.status).toBe(0);
    expect(section(result.stdout)?.slice(1)).toEqual(['0件', '0', '0']);
    writeList([sammy, sammy]);
    result = runValidate();
    expect(result.status).toBe(1);
    // 一覧に問題があれば一覧を使わないので、ドメインの数を 0件（空の一覧）と書かない
    expect(section(result.stdout)?.slice(1)).toEqual(['使えない', '1', '0']);
    expect(result.stdout).toContain('合計: エラー 1件 / 警告 0件');
    expect(result.stdout).toContain(
      'ERROR [official-domains] config/official-domains.json: 公式ドメインの一覧で重複: sammy.co.jp'
    );
  });

  it('ファイルが無ければ、空の一覧として続けずにエラーにする（終了コード 1）', () => {
    rmSync(configPath());
    const result = runValidate();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('config/official-domains.json: 公式ドメインの一覧を読めない');
  });

  it('記録の公式の出典を、読み込んだ一覧と照らす（無い・ある・一覧を読めない）', () => {
    const { machines } = JSON.parse(readFileSync(join(ROOT, 'machines/index.json'), 'utf-8'));
    const target = machines[0];
    writeFileSync(
      join(dir, `provenance/${target.id}.json`),
      JSON.stringify({
        machineId: target.id,
        machineFile: target.file,
        reviewedAt: '2026-09-27',
        sources: [
          {
            key: 'sammy',
            kind: 'official',
            url: 'https://www.sammy.co.jp/japanese/product/',
            retrievedAt: '2026-09-27',
          },
        ],
        items: [],
        candidates: [],
        removed: [],
        retiredIds: [],
      })
    );
    const notListed =
      '公式の出典のドメインが一覧（config/official-domains.json）に無い: sammy.co.jp';
    const unreadable =
      '公式の出典を確かめられない（公式ドメインの一覧 config/official-domains.json を読めない）: sammy.co.jp';
    writeList([]);
    expect(runValidate().stdout).toContain(notListed);
    writeList([sammy]);
    const listed = runValidate().stdout;
    expect(listed).not.toContain(notListed);
    expect(listed).not.toContain(unreadable);
    writeFileSync(configPath(), '{');
    expect(runValidate().stdout).toContain(unreadable);
  });
});
