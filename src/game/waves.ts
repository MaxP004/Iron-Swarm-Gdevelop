import { config as c } from './state';
import type { Progression } from './progression';
export interface Spawn {
  at: number;
  wave: number;
  boss: boolean;
  x?: number;
}
export function wavePlan(
  wave: number,
  progression: Progression,
): { batch: number; spawns: Spawn[]; duration: number } {
  const batchCfg = progression.batch(wave),
    batch = batchCfg?.wavesPerBatch ?? 1,
    spawns: Spawn[] = [];
  let at = 0;
  if (wave % 10 === 0) {
    if (wave === 100) {
      spawns.push(
        { at: 0, wave: 101, boss: true, x: -5 },
        { at: 0.5, wave: 100, boss: true, x: 0 },
        { at: 1, wave: 102, boss: true, x: 5 },
      );
      at = 2;
    } else {
      spawns.push({ at, wave, boss: true, x: 0 });
      at = 1;
    }
  } else if (batch > 1) {
    for (let i = 1; i < batch; i++)
      if ((wave + i) % 10 === 0) {
        spawns.push({ at, wave: wave + i, boss: true });
        at++;
      }
  }
  let count = 0;
  for (let i = 0; i < batch; i++)
    count += Math.min(c.baseEnemyCount + (wave + i - 1) * c.extraEnemiesPerWave, 60);
  if (batch > 1) count = Math.min(count, 120);
  const interval =
    Math.max(c.spawnInterval - wave * c.spawnIntervalDecreasePerWave, c.minSpawnInterval) *
    (batchCfg?.spawnIntervalMultiplier ?? 1);
  for (let i = 0; i < count; i++) {
    spawns.push({ at, wave: Math.min(wave + (i % batch), 100), boss: false });
    at += interval;
  }
  return { batch, spawns, duration: at };
}
