import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  normalizeMachineName,
  verifyYearCatalog,
  verifyYearRepository,
} from '../scripts/verify-year-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = JSON.parse(readFileSync(resolve(ROOT, 'docs/catalog-2026.json'), 'utf8'));

function fixture() {
  const catalog = structuredClone(CATALOG);
  const files = new Map();
  const machines = new Map();
  for (const row of catalog.machines) {
    const file = `${row.dataId}/${row.dataId}.json`;
    machines.set(row.dataId, { id: row.dataId, name: row.catalogName, file });
    files.set(`machines/${file}`, { name: row.catalogName, roles: [{ name: 'BIG' }] });
    files.set(`provenance/${row.dataId}.json`, {
      machineId: row.dataId,
      machineFile: file,
      sources: [{ url: 'https://example.com/analysis', retrievedAt: '2026-09-30' }],
      items: [{ kind: 'role', name: 'BIG' }],
    });
  }
  const index = { machines: [...machines.values()] };
  const readJson = (path) => {
    if (!files.has(path)) throw new Error('fixture: file missing');
    return files.get(path);
  };
  return { catalog, index, files, readJson };
}

function errorsAfter(change) {
  const input = fixture();
  change(input);
  return verifyYearCatalog(input).errors.join('\n');
}

const addedRow = (catalog) => catalog.machines.find((row) => row.status === 'added');

function writeFixture(input) {
  const root = mkdtempSync(resolve(tmpdir(), 'year-catalog-'));
  const files = new Map(input.files);
  files.set('docs/catalog-2026.json', input.catalog);
  files.set('machines/index.json', input.index);
  for (const [file, data] of files) {
    const path = resolve(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  }
  return root;
}

describe('2026年導入済みの全対象台帳', () => {
  it('52掲載行・51データID・9か月を照合して、2筐体共用を許可する', () => {
    expect(verifyYearCatalog(fixture()).errors).toEqual([]);
  });

  it('NFKC・先頭機種区分・空白・読み仮名を同一視する', () => {
    expect(normalizeMachineName('Ｌパチスロ 喰霊‐零‐Re')).toBe(
      normalizeMachineName('スマスロ 喰霊-零-Re')
    );
    expect(normalizeMachineName('スマスロ 甲鉄城のカバネリ 海門(うなと)決戦')).toBe(
      normalizeMachineName('スマスロ 甲鉄城のカバネリ 海門決戦')
    );
    expect(normalizeMachineName('スマスロ ゴブリンスレイヤーⅡ')).toBe(
      normalizeMachineName('スマスロ ゴブリンスレイヤーII')
    );
    expect(normalizeMachineName('L ULTRAMAN 最終決戦')).not.toBe(
      normalizeMachineName('L ULTRAMAN')
    );
  });

  it.each([null, {}, [], { machines: null }])('壊れた台帳を例外や成功へ変えない: %j', (catalog) => {
    const input = fixture();
    expect(verifyYearCatalog({ ...input, catalog }).errors.length).toBeGreaterThan(0);
  });

  it('不正型の日付・出典と壊れたindexを例外にしない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[0].introducedAt = { startsWith: 1 };
      })
    ).toContain('導入日');
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[0].sources = [null];
      })
    ).toContain('出典');
    expect(verifyYearCatalog({ ...fixture(), index: null }).errors.join('\n')).toContain('index');
  });

  it('対象締日を書き換えて未調査月を隠せない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.scope.through = '2026-08-31';
      })
    ).toContain('対象期間');
  });

  it('対象機種の削除とsummaryの同時減算でも漏れを検出する', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines.pop();
        catalog.summary.total -= 1;
        catalog.summary.added -= 1;
      })
    ).toContain('52件');
  });

  it('追加対象をexcludedに偽装できない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        addedRow(catalog).status = 'excluded';
      })
    ).toContain('登録状態');
  });

  it('追加対象をexistingに偽装できない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        addedRow(catalog).status = 'existing';
      })
    ).toContain('登録状態');
  });

  it('summaryの不整合と未解決状態を検出する', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.summary.unresolved = 1;
      })
    ).toContain('集計');
  });

  it('9か月の欠落、重複月、月別件数の誤りを検出する', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.monthlyCoverage.pop();
      })
    ).toContain('月別');
    expect(
      errorsAfter(({ catalog }) => {
        catalog.monthlyCoverage[8].month = '2026-08';
      })
    ).toContain('月別');
    expect(
      errorsAfter(({ catalog }) => {
        catalog.monthlyCoverage[0].total = 5;
      })
    ).toContain('月別');
  });

  it('日付の範囲外と実在しない日を検出する', () => {
    for (const date of ['2026-10-01', '2026-02-30', '2026-00-01']) {
      expect(
        errorsAfter(({ catalog }) => {
          catalog.machines[0].introducedAt = date;
        })
      ).toContain('導入日');
    }
  });

  it('calendarKeyの重複を検出する', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[1].calendarKey = catalog.machines[0].calendarKey;
      })
    ).toContain('calendarKey');
  });

  it('対象dataIdがindexになければ一覧だけの追加を検出する', () => {
    expect(
      errorsAfter(({ catalog, index }) => {
        index.machines = index.machines.filter((row) => row.id !== addedRow(catalog).dataId);
      })
    ).toContain('index');
  });

  it('index中の重複IDを検出する', () => {
    expect(
      errorsAfter(({ index }) => {
        index.machines.push(index.machines[0]);
      })
    ).toContain('indexのID重複');
  });

  it('対象を前作のデータIDへ結び付ける誤りを検出する', () => {
    expect(
      errorsAfter(({ catalog }) => {
        addedRow(catalog).dataId = catalog.machines[0].dataId;
      })
    ).toContain('機種名');
  });

  it('機種名表記が違う場合は説明を必要とする', () => {
    expect(
      errorsAfter(({ catalog }) => {
        const row = catalog.machines.find((item) => item.calendarKey === 'l_kabaneri2');
        delete row.identityNote;
      })
    ).toContain('表記差');
  });

  it('機種ファイルの欠落・null・異なる名前を検出する', () => {
    expect(
      errorsAfter(({ catalog, files }) => {
        const id = addedRow(catalog).dataId;
        files.delete(`machines/${id}/${id}.json`);
      })
    ).toContain('機種ファイル');
    expect(
      errorsAfter(({ catalog, files }) => {
        const id = addedRow(catalog).dataId;
        files.set(`machines/${id}/${id}.json`, null);
      })
    ).toContain('機種ファイル');
    expect(
      errorsAfter(({ catalog, files }) => {
        const id = addedRow(catalog).dataId;
        files.get(`machines/${id}/${id}.json`).name = '別機種';
      })
    ).toContain('機種名');
  });

  it('機種ファイル経路の親ディレクトリ参照を拒否する', () => {
    expect(
      errorsAfter(({ index }) => {
        index.machines[0].file = '../outside.json';
      })
    ).toContain('機種ファイル経路');
  });

  it('追加機種の出典記録なし・別ID・空記録を検出する', () => {
    expect(
      errorsAfter(({ catalog, files }) => {
        files.delete(`provenance/${addedRow(catalog).dataId}.json`);
      })
    ).toContain('出典記録');
    expect(
      errorsAfter(({ catalog, files }) => {
        files.get(`provenance/${addedRow(catalog).dataId}.json`).machineId = 'wrong';
      })
    ).toContain('出典記録');
    expect(
      errorsAfter(({ catalog, files }) => {
        files.get(`provenance/${addedRow(catalog).dataId}.json`).items = [];
      })
    ).toContain('出典記録');
  });

  it('導入元URL欠落・日付不一致・取得日欠落を検出する', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[0].sources[0].url = 'file:///private/x';
      })
    ).toContain('出典');
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[0].sources[0].introducedAt = '2025-01-01';
      })
    ).toContain('出典');
    expect(
      errorsAfter(({ catalog }) => {
        delete catalog.machines[0].sources[0].retrievedAt;
      })
    ).toContain('出典');
  });

  it('2媒体照合を同一媒体の複製で置き換えられない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[0].sources = [
          catalog.machines[0].sources[0],
          catalog.machines[0].sources[0],
        ];
      })
    ).toContain('2媒体');
  });

  it('ローカル保存先を公開JSONへ混入できない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.snapshot = '/Users/example/work/source.html';
      })
    ).toContain('ローカル');
  });

  it('筐体共用の理由・型式・区分が欠けたら通さない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines.find((row) => row.variant).variant.kind = 'unknown';
      })
    ).toContain('筐体');
    expect(
      errorsAfter(({ catalog }) => {
        delete catalog.machines.find((row) => row.variant).identityNote;
      })
    ).toContain('筐体');
    expect(
      errorsAfter(({ catalog }) => {
        delete catalog.machines.find((row) => row.variant).variant.modelNumber;
      })
    ).toContain('筐体');
  });

  it('任意の2行に同じdataIdを割り当てて欠落を隠せない', () => {
    expect(
      errorsAfter(({ catalog }) => {
        catalog.machines[0].dataId = catalog.machines[1].dataId;
      })
    ).toContain('同じdataId');
  });
});

describe('実ファイルを読む入口', () => {
  it('ディスク上のindex・機種・出典ファイルを全件読む', () => {
    const root = writeFixture(fixture());
    expect(verifyYearRepository(root).errors).toEqual([]);
  });

  it('読めない台帳を成功扱いしない', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'year-catalog-missing-'));
    expect(verifyYearRepository(root).errors.join('\n')).toContain('台帳');
  });

  it('CLIの未知引数は終了コード2で拒否する', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-year-catalog.mjs', '--skip'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('引数');
  });
});
