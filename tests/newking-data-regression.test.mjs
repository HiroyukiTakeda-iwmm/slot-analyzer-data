import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// メーカー公式POPの設定段階とボーナス表（2026-09-30確認）を独立の期待値にする。
const machine = JSON.parse(
  readFileSync(new URL('../machines/hanahana/new-king-hanahana-v.json', import.meta.url), 'utf8')
);
const settings = ['1', '2', '3', '4', 'V'];

describe('ニューキングハナハナVのメーカー公表仕様', () => {
  it('スマスロ・30パイ共通の5段階設定だけを比較する', () => {
    expect(machine.availableSettings).toEqual(settings);
    for (const entry of [...machine.roles, ...(machine.trialSuccessRates ?? [])]) {
      expect(Object.keys(entry.probabilities)).toEqual(settings);
    }
  });
  it.each([
    ['BIG確率', [299, 291, 281, 268, 253]],
    ['REG確率', [496, 471, 442, 409, 372]],
    ['ボーナス合算', [186, 180, 172, 162, 150]],
  ])('%sを公表分母の確率で保存する', (name, denominators) => {
    const role = machine.roles.find((entry) => entry.name === name);
    expect(role).toBeDefined();
    settings.forEach((setting, index) => {
      expect(role.probabilities[setting]).toBe(Number((1 / denominators[index]).toPrecision(6)));
    });
  });
  it('設定別数値が未公表のBIG中スイカ確率を計算へ渡さない', () => {
    expect(machine.trialSuccessRates ?? []).not.toContainEqual(
      expect.objectContaining({ name: 'BIG中スイカ確率' })
    );
  });
});
