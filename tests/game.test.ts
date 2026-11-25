import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, config } from '../src/game/state';
import { Progression } from '../src/game/progression';
import { Session, advance } from '../src/game/session';
import { Combat } from '../src/game/combat';
import { Abilities } from '../src/game/abilities';
import { wavePlan } from '../src/game/waves';
import { round, overlaps } from '../src/game/math';
import { encode, decode } from '../src/platform/saves';
const feedback = { sound: () => {}, popup: () => {} };
const step = (session: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) session.update(1 / 60);
};
const seeded = () => {
  let seed = 371;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

test('serialized scene balance overrides the C# defaults', () => {
  assert.deepEqual(config.baseCosts, [500, 500, 500, 500, 8000]);
  assert.deepEqual(config.maxLevels, [50, 50, 50, 50, 3]);
  assert.deepEqual(config.maxLvPerkBonus, [50, 50, 50, 50, 1]);
  assert.deepEqual(config.maxLv2PerkBonus, [50, 50, 50, 50, 2]);
  assert.deepEqual(config.maxLv3PerkBonus, [50, 50, 50, 50, 3]);
  assert.equal(config.baseDamage, 500);
  assert.equal(config.baseRotationSpeed, 30);
});
test('Unity midpoint rounding uses even numbers', () => {
  assert.deepEqual([0.5, 1.5, 2.5, 3.5, -0.5, -1.5].map(round), [0, 2, 2, 4, 0, -2]);
});
test('initial stats and first upgrade prices match the legacy game', () => {
  const s = initialState(),
    p = new Progression(s);
  assert.deepEqual(p.stats(), { maxHealth: 100, regen: 10, damage: 500, speed: 30, blades: 2 });
  assert.equal(p.cost(0), 500);
  s.health = 40;
  assert.equal(p.buyUpgrade(0), true);
  assert.equal(s.gold, 500);
  assert.equal(s.health, 90);
  assert.equal(p.cost(0), 525);
});
test('insufficient currency and capped levels do not spend gold', () => {
  const s = initialState(),
    p = new Progression(s);
  assert.equal(p.buyUpgrade(4), false);
  assert.equal(s.gold, 1000);
  s.gold = 1e12;
  s.levels[0] = 50;
  assert.equal(p.buyUpgrade(0), false);
  assert.equal(p.cost(0), Infinity);
});
test('cost rounding, discount and cap use the original order', () => {
  const s = initialState(),
    p = new Progression(s);
  s.levels[0] = 63;
  s.perks[1] = true;
  assert.equal(p.cost(0), 10000);
  s.perks[2] = true;
  assert.equal(p.cost(0), 4325);
  s.perks[7] = true;
  s.levels[0] = 200;
  s.perks[6] = true;
  assert.equal(p.cost(0), 500000);
});
test('perk dependencies follow purchases rather than wave milestones', () => {
  const s = initialState(),
    p = new Progression(s);
  s.wave = 1000;
  s.diamonds = 100000;
  assert.equal(p.buyPerk(0, true), false);
  assert.equal(p.buyPerk(2), false);
  assert.equal(p.buyPerk(0), true);
  assert.equal(p.buyPerk(1), true);
  s.wave = 1;
  assert.equal(p.buyPerk(0, true), true);
  assert.equal(p.regularLocked(2), false);
  assert.equal(p.regularLocked(4), true);
  assert.equal(p.buyPerk(0, true), false);
});
test('major bonuses apply per upgrade level, with the original delayed recalculation', () => {
  const s = initialState();
  s.levels = [3, 4, 5, 0, 0];
  s.diamonds = 99999;
  s.perks.fill(true);
  const p = new Progression(s);
  p.buyPerk(0, true);
  p.buyPerk(1, true);
  assert.equal(p.stats().damage, 575);
  assert.equal(p.bonus()[2], 20);
  s.gold = 999999;
  p.buyUpgrade(3);
  assert.equal(p.stats().damage, 600);
  assert.equal(p.stats().maxHealth, 400);
  assert.equal(p.stats().regen, 18);
});
test('all level extensions stack, but blades always stop at ten', () => {
  const s = initialState(),
    p = new Progression(s);
  s.perks[1] = s.perks[3] = s.perks[5] = true;
  assert.equal(p.maxLevel(0), 200);
  assert.equal(p.maxLevel(4), 9);
  s.perks[7] = true;
  s.levels[4] = 99;
  assert.equal(p.stats().blades, 10);
  assert.equal(p.maxLevel(0), 2147483647);
});
test('difficulty spikes multiply cumulatively and enemy speed caps at eight', () => {
  const p = new Progression(initialState());
  assert.equal(p.difficulty(49), 1);
  assert.equal(p.difficulty(50), 1.2);
  assert.equal(p.difficulty(90), 1.2 * 1.4 * 1.6);
  assert.equal(p.enemyStats(1).hp, 200);
  assert.equal(p.enemyStats(1).damage, 1.5);
  assert.equal(p.enemyStats(10, true).hp, 7750);
  assert.equal(p.enemyStats(1000).speed, 8);
});
test('kill rewards include gold perk and boss multiplier', () => {
  const s = initialState(),
    p = new Progression(s);
  assert.equal(p.enemyStats(10, true).gold, 2750);
  s.perks[0] = true;
  assert.equal(p.enemyStats(10, true).gold, 4125);
});
test('wave one has three enemies and the original spawn interval', () => {
  const p = wavePlan(1, new Progression(initialState()));
  assert.equal(p.batch, 1);
  assert.equal(p.spawns.length, 3);
  assert.equal(p.spawns[1].at, 0.795);
  assert.equal(p.spawns[2].at, 1.59);
});
test('boss wave waits one second before spawning normal enemies', () => {
  const p = wavePlan(10, new Progression(initialState()));
  assert.deepEqual(p.spawns[0], { at: 0, wave: 10, boss: true, x: 0 });
  assert.equal(p.spawns[1].at, 1);
  assert.equal(p.spawns.filter((e) => !e.boss).length, 12);
});
test('hundredth wave keeps the three boss stat variants and offsets', () => {
  const p = wavePlan(100, new Progression(initialState()));
  assert.deepEqual(p.spawns.slice(0, 3), [
    { at: 0, wave: 101, boss: true, x: -5 },
    { at: 0.5, wave: 100, boss: true, x: 0 },
    { at: 1, wave: 102, boss: true, x: 5 },
  ]);
  assert.equal(p.spawns[3].at, 2);
  assert.equal(p.spawns.filter((e) => !e.boss).length, 60);
});
test('highest major perk replaces earlier wave batching', () => {
  const s = initialState();
  s.majors.fill(true);
  const p = new Progression(s);
  assert.equal(wavePlan(20, p).batch, 4);
  assert.equal(wavePlan(85, p).batch, 4);
  assert.equal(wavePlan(86, p).batch, 1);
  assert.equal(wavePlan(60, p).spawns.filter((e) => !e.boss).length, 120);
});
test('batch crossing a boss wave preserves that boss and alternates skins', () => {
  const s = initialState();
  s.majors[0] = true;
  const plan = wavePlan(9, new Progression(s));
  assert.deepEqual(plan.spawns[0], { at: 0, wave: 10, boss: true });
  assert.deepEqual(
    plan.spawns.slice(1, 5).map((e) => e.wave),
    [9, 10, 9, 10],
  );
  assert.equal(plan.spawns[1].at, 1);
});
test('beyond wave 100, normal enemy stats stay clamped to 100 as in Unity', () => {
  const plan = wavePlan(111, new Progression(initialState()));
  assert.ok(plan.spawns.every((e) => e.wave === 100));
});
test('abilities use cooldowns starting at activation', () => {
  const s = initialState();
  s.majors.fill(true);
  const a = new Abilities(s);
  assert.equal(a.activate(0), true);
  assert.equal(a.activate(0), false);
  a.update(15);
  assert.equal(s.active[0], 0);
  assert.equal(s.cooldown[0], 15);
  a.update(15);
  assert.equal(a.activate(0), true);
});
test('menu pause freezes abilities, combat, passive income and delayed waves', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.tutorialWave21Done = true;
  s.majors[0] = true;
  s.tutorialAbilityDialogueDone = true;
  s.perks[4] = true;
  const game = new Session(feedback, s);
  game.activate(0);
  game.toggleMenu();
  const before = structuredClone(s);
  step(game, 40);
  assert.deepEqual(s, before);
  game.toggleMenu();
  step(game, 1.1);
  assert.equal(s.wave, 1);
  assert.equal(s.gold, 51000);
});
test('six dialogue lines gate the initial wave without pausing the clock', () => {
  const game = new Session(feedback);
  step(game, 10);
  assert.equal(game.state.wave, 0);
  for (let i = 0; i < 6; i++) game.advanceDialogue();
  assert.equal(game.state.tutorialDone, true);
  step(game, 1.1);
  assert.equal(game.state.wave, 1);
});
test('prestige awards triangular diamonds and preserves permanent perks', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.wave = 21;
  s.levels.fill(3);
  s.perks[0] = true;
  s.diamonds = 40;
  const game = new Session(feedback, s);
  assert.equal(game.refund(), true);
  assert.equal(s.diamonds, 271);
  assert.equal(s.gold, 1000);
  assert.deepEqual(s.levels, [0, 0, 0, 0, 0]);
  assert.equal(s.perks[0], true);
  step(game, 1.1);
  assert.equal(s.wave, 1);
});
test('prestige is unavailable below wave 21', () => {
  const game = new Session(feedback);
  game.state.wave = 20;
  assert.equal(game.refund(), false);
});
test('death rolls wave counter back five and resumes at the next wave', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.wave = 20;
  s.gold = 54321;
  s.levels[2] = 3;
  const game = new Session(feedback, s);
  game.jump(20);
  game.combat.onDeath();
  assert.equal(s.wave, 15);
  assert.equal(s.gold, 54321);
  assert.equal(s.levels[2], 3);
  assert.equal(s.health, 100);
  step(game, 1.1);
  assert.equal(s.wave, 16);
});
test('oriented box collision checks edges and rotated shapes', () => {
  const a = { x: 0, y: 0, width: 1, height: 4, angle: 0 };
  assert.equal(overlaps(a, { ...a, x: 1 }), true);
  assert.equal(overlaps(a, { ...a, x: 1.01 }), false);
  assert.equal(overlaps(a, { ...a, x: 1.8, angle: Math.PI / 2 }), true);
});
test('spawn locations and boss size match prefab configuration', () => {
  const s = initialState(),
    combat = new Combat(s, new Progression(s), feedback, seeded());
  for (let i = 0; i < 30; i++) combat.spawn(1, false);
  assert.ok(combat.enemies.every((e) => e.y >= 0 && (e.y >= 9 || Math.abs(e.x) >= 9)));
  combat.spawn(10, true, -5);
  const boss = combat.enemies.at(-1)!;
  assert.equal(boss.x, -5);
  assert.equal(boss.y, 6);
  assert.equal(boss.scale, 1.7);
});
test('a seeded battle clears waves and gold is delivered after the coin animation', () => {
  const s = initialState();
  s.tutorialDone = true;
  const game = new Session(feedback, s, seeded());
  step(game, 40);
  assert.ok(s.wave >= 3, `wave ${s.wave}`);
  assert.ok(s.gold > 1300, `gold ${s.gold}`);
  assert.ok(s.health > 0);
});
test('Unity-compatible save data round-trips all progression and timers', () => {
  const s = initialState();
  s.gold = 98765;
  s.wave = 73;
  s.levels = [1, 2, 3, 4, 5];
  s.perks.fill(true);
  s.majors.fill(true);
  s.active = [9, 4, 7];
  s.cooldown = [24, 19, 22];
  s.tutorialDone = true;
  s.tutorialRefundDone = true;
  s.health = 55;
  assert.deepEqual(decode(JSON.parse(JSON.stringify(encode(s)))), s);
});

test('settings pause freezes combat and restores an already open perk menu', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.tutorialWave21Done = true;
  s.majors.fill(true);
  s.tutorialAbilityDialogueDone = true;
  const game = new Session(feedback, s, seeded());
  game.jump(21);
  game.activate(0);
  game.settingsOpen = true;
  const before = game.snapshot();
  step(game, 40);
  assert.deepEqual(game.snapshot(), before);
  assert.equal(game.activate(1), false);
  game.toggleMenu();
  assert.equal(game.menuOpen, false);
  game.settingsOpen = false;
  game.toggleMenu();
  game.settingsOpen = true;
  game.settingsOpen = false;
  assert.equal(game.paused, true);
  assert.equal(game.menuOpen, true);
  game.toggleMenu();
  step(game, 0.2);
  assert.notDeepEqual(game.snapshot(), before);
});

test('refund hint is completed by the first reset and persists in browser saves', () => {
  const game = new Session(feedback);
  assert.equal(game.refund(), false);
  assert.equal(game.state.tutorialRefundDone, false);
  game.state.wave = 21;
  assert.equal(game.refund(), true);
  assert.equal(decode(encode(game.state)).tutorialRefundDone, true);
  assert.equal(decode({ wave: 21, tutorialWave21Done: true }).tutorialRefundDone, false);
});

test('first major perk introduces the ability after leaving the tree and pauses its explanation', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.tutorialWave21Done = true;
  s.wave = 21;
  s.perks[0] = s.perks[1] = true;
  s.diamonds = config.major1_DiamondCost;
  const game = new Session(feedback, s, seeded());
  game.toggleMenu();
  assert.equal(game.buyPerk(0, true), true);
  game.update(1);
  assert.equal(game.dialogue, null);
  game.toggleMenu();
  game.update(0);
  assert.equal(game.dialogue?.keys[0], 'dialogue_ability_1');
  assert.deepEqual(game.dialogue?.icons, ['King', 'King']);
  assert.equal(game.paused, true);
  const before = game.snapshot();
  step(game, 40);
  assert.deepEqual(game.snapshot(), before);
  assert.equal(game.activate(0), false);
  assert.equal(s.tutorialAbilityUsed, false);
  game.advanceDialogue();
  assert.equal(game.dialogue?.keys[game.dialogue.index], 'dialogue_ability_2');
  game.advanceDialogue();
  assert.equal(game.paused, false);
  assert.equal(s.tutorialAbilityDialogueDone, true);
  assert.equal(game.activate(1), false);
  assert.equal(s.tutorialAbilityUsed, false);
  assert.equal(game.activate(0), true);
  assert.equal(s.tutorialAbilityUsed, true);
  game.update(0.1);
  assert.equal(game.dialogue, null);
  assert.equal(game.refund(), true);
  assert.equal(s.tutorialAbilityDialogueDone, true);
  assert.equal(s.tutorialAbilityUsed, true);
});

test('ability tutorial resumes from an old or interrupted save and stays completed after use', () => {
  const s = decode({
    wave: 5,
    tutorialDone: true,
    tutorialWave21Done: true,
    perkMajorBought: [true],
  });
  let game = new Session(feedback, s);
  game.resumeLoaded();
  game.update(0);
  assert.equal(game.dialogue?.keys[0], 'dialogue_ability_1');
  game.advanceDialogue();
  game = new Session(feedback, decode(encode(game.state)));
  game.resumeLoaded();
  game.update(0);
  assert.equal(game.dialogue?.keys[0], 'dialogue_ability_1');
  game.advanceDialogue();
  game.advanceDialogue();
  const beforeUse = decode(encode(game.state));
  assert.equal(beforeUse.tutorialAbilityDialogueDone, true);
  assert.equal(beforeUse.tutorialAbilityUsed, false);
  game.state.cooldown[0] = 10;
  assert.equal(game.activate(0), false);
  assert.equal(game.state.tutorialAbilityUsed, false);
  game.state.cooldown[0] = 0;
  assert.equal(game.activate(0), true);
  game = new Session(feedback, decode(encode(game.state)));
  game.resumeLoaded();
  game.update(0);
  assert.equal(game.dialogue, null);
  assert.equal(game.state.tutorialAbilityUsed, true);
});
test('invalid saves cannot inject non-finite numbers or arbitrary properties', () => {
  assert.throws(() => decode(null));
  const s = decode({
    gold: -3,
    health: Infinity,
    levels: [NaN, 'bad', 2],
    perkMajorBought: [true],
    abilityBoostRemaining: 10,
  });
  assert.equal(s.gold, 0);
  assert.equal(s.health, 100);
  assert.deepEqual(s.levels, [0, 0, 2, 0, 0]);
  assert.deepEqual(s.active, [10, 0, 0]);
});

test('an overlapping blade hits once until the colliders separate and re-enter', () => {
  const s = initialState();
  const combat = new Combat(s, new Progression(s), feedback, seeded());
  combat.spawn(10, false);
  const enemy = combat.enemies[0];
  Object.assign(enemy, { x: 2, y: 0, angle: -Math.PI / 2, phase: 1 });
  combat.update(0.02);
  assert.equal(enemy.hp, 1050);
  combat.bladeAngle = 0;
  combat.update(0.02);
  assert.equal(enemy.hp, 1050);
  enemy.x = 6;
  combat.bladeAngle = 0;
  combat.update(0.02);
  enemy.x = 2;
  combat.bladeAngle = 0;
  combat.update(0.02);
  assert.equal(enemy.hp, 550);
});

test('a coin pays only after all three serialized animation phases', () => {
  const s = initialState();
  const combat = new Combat(s, new Progression(s), feedback);
  combat.coins.push({ x: 0, y: 0, start: { x: 0, y: 0 }, age: 0, gold: 250 });
  for (let i = 0; i < 71; i++) combat.update(1 / 60);
  assert.equal(s.gold, 1000);
  for (let i = 0; i < 2; i++) combat.update(1 / 60);
  assert.equal(s.gold, 1250);
  assert.equal(combat.coins.length, 0);
});

test('invincibility blocks enemy attack damage while an ordinary hit lands', () => {
  for (const invincible of [false, true]) {
    const s = initialState();
    s.active[1] = invincible ? 10 : 0;
    const combat = new Combat(s, new Progression(s), feedback);
    combat.spawn(10, true);
    const enemy = combat.enemies[0];
    Object.assign(enemy, {
      x: 0,
      y: 3,
      phase: 3,
      elapsed: 0.19,
      start: { x: 0, y: 3 },
      target: { x: 0, y: 2 },
    });
    combat.update(0.02);
    assert.equal(s.health, invincible ? 100 : 87.25);
  }
});

test('wave 21 dialogue does not stop the enemy spawn schedule', () => {
  const s = initialState();
  s.tutorialDone = true;
  const game = new Session(feedback, s, seeded());
  game.jump(21);
  step(game, 0.1);
  assert.equal(game.dialogue?.keys[0], 'dialogue_wave21_1');
  assert.equal(game.combat.enemies.length, 1);
  game.advanceDialogue();
  assert.equal(s.tutorialWave21Done, true);
  assert.equal(s.tutorialDiamondDone, false);
  assert.equal(game.skillTreeUnlocked, true);
  game.toggleMenu();
  assert.equal(game.menuOpen, true);
  assert.equal(s.tutorialDiamondDone, true);
});

test('skill tree stays locked until its dialogue completes, including keyboard access', () => {
  const s = initialState();
  s.tutorialDone = true;
  const game = new Session(feedback, s);
  game.toggleMenu();
  assert.equal(game.menuOpen, false);
  assert.equal(s.tutorialDiamondDone, false);
  // Also introduce the tree if a wave batch or loaded save has passed wave 21.
  game.jump(22);
  assert.equal(game.dialogue?.keys[0], 'dialogue_wave21_1');
  assert.equal(game.skillTreeUnlocked, false);
  game.toggleMenu();
  assert.equal(game.menuOpen, false);
  game.advanceDialogue();
  game.toggleMenu();
  assert.equal(game.menuOpen, true);
  game.toggleMenu();
  game.refund();
  assert.equal(game.skillTreeUnlocked, true);
});

test('the ending dialogue unlocks endless waves after completion', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.levels = [10000, 10000, 10000, 0, 8];
  const game = new Session(feedback, s, seeded());
  game.jump(100);
  step(game, 70);
  assert.equal(game.dialogue?.keys[0], 'dialogue_end_1');
  assert.equal(game.state.wave, 100);
  game.advanceDialogue();
  game.advanceDialogue();
  assert.equal(s.endingDone, true);
  step(game, 3.2);
  assert.equal(s.wave, 101);
});

test('loading a save resumes its current wave and clamps health to max HP', () => {
  const s = initialState();
  s.tutorialDone = true;
  s.wave = 37;
  s.health = 9999;
  const game = new Session(feedback, s);
  game.resumeLoaded();
  assert.equal(s.health, 100);
  step(game, 0.1);
  assert.equal(s.wave, 37);
  assert.equal(game.combat.enemies.length, 1);
});

test('loading a wave zero save does not create an invalid boss', () => {
  const game = new Session(feedback);
  game.resumeLoaded();
  step(game, 1.1);
  assert.equal(game.state.wave, 1);
  assert.ok(game.combat.enemies.every((enemy) => !enemy.boss));
});

test('double speed runs two ordinary steps per frame and matches twice the play time', () => {
  const normal = initialState();
  normal.tutorialDone = true;
  step(new Session(feedback, normal, seeded()), 40);
  const fast = initialState();
  fast.tutorialDone = true;
  const game = new Session(feedback, fast, seeded());
  for (let i = 0; i < 20 * 60; i++) advance(game, 1 / 60, 2);
  assert.equal(fast.wave, normal.wave);
  assert.equal(fast.gold, normal.gold);
  assert.equal(fast.health, normal.health);
});
test('double speed stops at a pause that starts between its two steps', () => {
  const s = initialState();
  s.tutorialDone = true;
  const game = new Session(feedback, s, seeded());
  step(game, 5);
  game.menuOpen = true;
  const before = JSON.stringify(game.snapshot());
  advance(game, 1 / 60, 2);
  assert.equal(JSON.stringify(game.snapshot()), before);
});
