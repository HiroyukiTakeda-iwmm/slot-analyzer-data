import { describe, it, expect } from 'vitest';
import {
  checkDerivedIds,
  collectDerivedIds,
  compareDerivedIds,
} from '../scripts/lib/derived-ids.mjs';

const baseMachine = {
  name: 'テスト機種',
  type: 'AT',
  author: 'コミュニティ',
  version: '1.0',
  lastUpdated: '2026-09-26',
  roles: [
    { name: 'BIG', probabilities: { 1: 0.00338753 }, hasSettingDiff: false, displayOrder: 1 },
    { name: 'REG', probabilities: { 1: 0.0025 }, hasSettingDiff: false, displayOrder: 2 },
  ],
  zones: [
    {
      name: 'CZ',
      isDefault: false,
      roles: [{ name: 'Bell', probabilities: { 1: 0.1 }, hasSettingDiff: false, displayOrder: 1 }],
    },
  ],
  endScreens: [
    { name: 'Blue', type: 'at_end', hint: '' },
    { name: '赤', hint: '' },
    { name: '青', hint: '' },
  ],
  endScreenGroups: [{ name: 'End', endScreens: [{ name: 'Red', hint: '' }] }],
};

describe('collectDerivedIds', () => {
  it('アプリと同じ規則で ID を作る', () => {
    expect(Object.fromEntries(collectDerivedIds(baseMachine))).toEqual({
      'role::BIG': 'big_1',
      'role::REG': 'reg_2',
      'zone::CZ': 'cz',
      'zoneRole::CZ::Bell': 'bell_1',
      'endScreen::Blue': 'blue',
      'endScreen::赤': 'endscreen',
      'endScreen::青': 'endscreen_2',
      'endScreenGroup::End': 'end',
      'endScreenGroupItem::End::Red': 'red',
    });
  });

  it('同じ名前の項目は、2つ目から #2 を付けて区別する', () => {
    const machine = {
      ...baseMachine,
      endScreens: [
        { name: '仁', id: 'jin_bonus', hint: '' },
        { name: '仁', id: 'jin_at', hint: '' },
      ],
    };
    const ids = collectDerivedIds(machine);
    expect(ids.get('endScreen::仁')).toBe('jin_bonus');
    expect(ids.get('endScreen::仁#2')).toBe('jin_at');
  });
});

describe('compareDerivedIds', () => {
  const base = collectDerivedIds(baseMachine);

  it('役を後ろに足しても既存の ID は変わらない', () => {
    const roles = [
      ...baseMachine.roles,
      { name: 'Cherry', probabilities: { 1: 0.01 }, hasSettingDiff: false, displayOrder: 3 },
    ];
    expect(
      compareDerivedIds(base, collectDerivedIds({ ...baseMachine, roles }), new Set())
    ).toEqual([]);
  });

  it('displayOrder を変えると、ID が変わったと報告する', () => {
    const roles = [{ ...baseMachine.roles[0], displayOrder: 3 }, baseMachine.roles[1]];
    expect(
      compareDerivedIds(base, collectDerivedIds({ ...baseMachine, roles }), new Set())
    ).toEqual(['role::BIG: ID が変わった（big_1 → big_3）']);
  });

  it('漢字名の終了画面を外すと後ろの ID が繰り上がる。id を書いて固定すれば防げる', () => {
    const removed = new Set(['endScreen::赤']);
    const withoutAka = {
      ...baseMachine,
      endScreens: [baseMachine.endScreens[0], baseMachine.endScreens[2]],
    };
    expect(compareDerivedIds(base, collectDerivedIds(withoutAka), removed)).toEqual([
      'endScreen::青: ID が変わった（endscreen_2 → endscreen）',
    ]);
    const pinned = {
      ...baseMachine,
      endScreens: [baseMachine.endScreens[0], { ...baseMachine.endScreens[2], id: 'endscreen_2' }],
    };
    expect(compareDerivedIds(base, collectDerivedIds(pinned), removed)).toEqual([]);
  });

  it('記録なしに項目が消えると報告する', () => {
    const head = collectDerivedIds({ ...baseMachine, roles: [baseMachine.roles[0]] });
    expect(compareDerivedIds(base, head, new Set())).toEqual([
      'role::REG: 項目が消えたのに、出典記録の removed に無い',
    ]);
  });

  it('外した項目の ID を、新しく足した項目が使ったら報告する', () => {
    // 赤を外し、青の ID を固定して、漢字だけの名前の緑を足すと、緑が赤の ID（endscreen）になる
    const head = {
      ...baseMachine,
      endScreens: [
        baseMachine.endScreens[0],
        { ...baseMachine.endScreens[2], id: 'endscreen_2' },
        { name: '緑', hint: '' },
      ],
    };
    const removed = new Set(['endScreen::赤']);
    expect(compareDerivedIds(base, collectDerivedIds(head), removed)).toEqual([
      'endScreen::緑: 新しい項目が、基準の endScreen::赤 の ID（endscreen）を使っている（明示の id を付ける）',
    ]);
  });

  it('役でも、漢字だけの名前で外した項目の displayOrder を使い回すと報告する', () => {
    const role = (name, displayOrder) => ({
      name,
      probabilities: { 1: 0.01 },
      hasSettingDiff: false,
      displayOrder,
    });
    const before = collectDerivedIds({ ...baseMachine, roles: [role('BIG', 1), role('強', 2)] });
    const after = collectDerivedIds({ ...baseMachine, roles: [role('BIG', 1), role('弱', 2)] });
    expect(compareDerivedIds(before, after, new Set(['role::強']))).toEqual([
      'role::弱: 新しい項目が、基準の role::強 の ID（role_2）を使っている（明示の id を付ける）',
    ]);
  });

  it('種類やゾーンが違えば、同じ ID でも問題にしない', () => {
    const bell = {
      name: 'Bell',
      probabilities: { 1: 0.1 },
      hasSettingDiff: false,
      displayOrder: 1,
    };
    const head = {
      ...baseMachine,
      zones: [...baseMachine.zones, { name: 'AT', isDefault: false, roles: [bell] }],
    };
    expect(compareDerivedIds(base, collectDerivedIds(head), new Set())).toEqual([]);
  });
});

describe('checkDerivedIds', () => {
  const index = {
    version: '3.8.0',
    updatedAt: '2026-09-26T00:00:00Z',
    machines: [
      {
        id: 'test-machine',
        name: 'テスト機種',
        type: 'AT',
        author: 'コミュニティ',
        version: '1.0',
        file: 'test/test-machine.json',
      },
    ],
  };
  const files = (machine, idx = index) => ({
    'machines/index.json': JSON.stringify(idx),
    'machines/test/test-machine.json': JSON.stringify(machine),
  });
  const reader = (map) => (path) => {
    if (!(path in map)) throw new Error(`no such file: ${path}`);
    return map[path];
  };

  it('変化が無ければ問題なし', () => {
    const map = files(baseMachine);
    expect(
      checkDerivedIds({ readBase: reader(map), readHead: reader(map), provenanceFiles: [] })
    ).toEqual([]);
  });

  it('ID の変化と記録なしの削除を、機種 ID を付けて報告する', () => {
    const head = files({ ...baseMachine, roles: [{ ...baseMachine.roles[0], displayOrder: 3 }] });
    expect(
      checkDerivedIds({
        readBase: reader(files(baseMachine)),
        readHead: reader(head),
        provenanceFiles: [],
      })
    ).toEqual([
      'test-machine: role::BIG: ID が変わった（big_1 → big_3）',
      'test-machine: role::REG: 項目が消えたのに、出典記録の removed に無い',
    ]);
  });

  it('読めなかった出典記録は飛ばす（validate が報告する）', () => {
    const map = files(baseMachine);
    const provenanceFiles = [{ data: null }];
    expect(
      checkDerivedIds({ readBase: reader(map), readHead: reader(map), provenanceFiles })
    ).toEqual([]);
  });

  it('比べる側の機種ファイルは、比べる側の index.json の場所から読む', () => {
    const moved = { ...index.machines[0], file: 'moved/test-machine.json' };
    const head = {
      'machines/index.json': JSON.stringify({ ...index, machines: [moved] }),
      'machines/moved/test-machine.json': JSON.stringify(baseMachine),
    };
    expect(
      checkDerivedIds({
        readBase: reader(files(baseMachine)),
        readHead: reader(head),
        provenanceFiles: [],
      })
    ).toEqual([]);
  });

  it('removed に記録した項目の削除は許す', () => {
    const head = files({ ...baseMachine, roles: [baseMachine.roles[0]] });
    const provenanceFiles = [
      {
        data: {
          machineId: 'test-machine',
          removed: [{ kind: 'role', name: 'REG', previous: {}, reason: '出典なし' }],
        },
      },
    ];
    expect(
      checkDerivedIds({
        readBase: reader(files(baseMachine)),
        readHead: reader(head),
        provenanceFiles,
      })
    ).toEqual([]);
  });

  it('index から機種が消えたら報告する', () => {
    const head = files(baseMachine, { ...index, machines: [] });
    expect(
      checkDerivedIds({
        readBase: reader(files(baseMachine)),
        readHead: reader(head),
        provenanceFiles: [],
      })
    ).toEqual(['test-machine: index.json から機種が消えた']);
  });

  it('基準を読めなければ例外を投げる（CLI は終了コード 2 にする）', () => {
    expect(() =>
      checkDerivedIds({
        readBase: reader({}),
        readHead: reader(files(baseMachine)),
        provenanceFiles: [],
      })
    ).toThrow('no such file');
  });
});
