import { performance } from 'node:perf_hooks';
import { Session } from '../src/game/session';
import { initialState } from '../src/game/state';
const feedback = { sound: () => {}, popup: () => {} };
const state = initialState();
state.tutorialDone = true;
state.tutorialWave21Done = true;
state.levels = [200, 200, 100, 200, 8];
state.majors.fill(true);
state.tutorialAbilityDialogueDone = true;
state.active = [0, 3600, 0];
let seed = 123456;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const game = new Session(feedback, state, random);
game.jump(100);
const samples: number[] = [];
let peakEnemies = 0;
for (let i = 0; i < 3600; i++) {
  const start = performance.now();
  game.update(1 / 60);
  samples.push(performance.now() - start);
  peakEnemies = Math.max(peakEnemies, game.combat.enemies.length);
}
samples.sort((a, b) => a - b);
const sum = samples.reduce((a, b) => a + b, 0);
console.log(
  JSON.stringify(
    {
      scenario:
        'Seeded wave 100, 60 simulated seconds, empowered invincible character; CPU logic only',
      node: process.version,
      steps: samples.length,
      peakEnemies,
      totalCpuMs: Number(sum.toFixed(2)),
      medianStepMs: Number(samples[1800].toFixed(4)),
      p95StepMs: Number(samples[Math.floor(samples.length * 0.95)].toFixed(4)),
      finalWave: state.wave,
    },
    null,
    2,
  ),
);
