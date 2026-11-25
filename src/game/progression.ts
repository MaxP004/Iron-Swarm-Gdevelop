import { config as c, type State } from './state';
import { round } from './math';
export const regularCosts = [
  c.goldPerkDiamondCost,
  c.maxLvPerkDiamondCost,
  c.discountPerkDiamondCost,
  c.maxLv2PerkDiamondCost,
  c.goldPerSecDiamondCost,
  c.maxLv3DiamondCost,
  c.costCapDiamondCost,
  c.unlimitedDiamondCost,
];
export const majorCosts = [c.major1_DiamondCost, c.major2_DiamondCost, c.major3_DiamondCost];
export class Progression {
  private appliedMajors: boolean[];
  constructor(public state: State) {
    this.appliedMajors = [...state.majors];
  }
  bonus(majors = this.state.majors) {
    const s = this.state;
    return [
      c.bonusPerLevel[0] + (majors[1] ? c.major2_HpBonus : 0),
      c.bonusPerLevel[1] + (majors[1] ? c.major2_RegenBonus : 0),
      c.bonusPerLevel[2] + (majors[0] ? c.major1_DamageBonus : 0),
      c.bonusPerLevel[3],
      1,
    ];
  }
  stats() {
    const s = this.state,
      b = this.bonus(this.appliedMajors);
    return {
      maxHealth: c.baseHealth + s.levels[0] * b[0],
      regen: c.baseHealthRegen + s.levels[1] * b[1],
      damage: c.baseDamage + s.levels[2] * b[2],
      speed:
        (c.baseRotationSpeed + s.levels[3] * b[3]) *
        (s.active[0] > 0 ? 1 + c.major1_SpeedBoost / 100 : 1),
      blades: Math.min(c.baseBladeCount + s.levels[4], 10),
    };
  }
  maxLevel(i: number) {
    const s = this.state;
    return s.perks[7]
      ? 2147483647
      : c.maxLevels[i] +
          (s.perks[1] ? c.maxLvPerkBonus[i] : 0) +
          (s.perks[3] ? c.maxLv2PerkBonus[i] : 0) +
          (s.perks[5] ? c.maxLv3PerkBonus[i] : 0);
  }
  cost(i: number) {
    if (this.state.levels[i] >= this.maxLevel(i)) return Infinity;
    // Считаем цену с точностью float32, как в исходной версии.
    let cost = Math.fround(
      Math.fround(c.baseCosts[i]) *
        Math.fround(Math.pow(Math.fround(c.costMultipliers[i]), this.state.levels[i])),
    );
    if (this.state.perks[2]) cost = Math.fround(cost * Math.fround(1 - c.discountPercent / 100));
    let result = round(cost);
    if (result >= 10000) result = Math.floor(result / 1000) * 1000;
    return this.state.perks[6] ? Math.min(result, c.costCapAmount) : result;
  }
  buyUpgrade(i: number) {
    if (i < 0 || i > 4) return false;
    const cost = this.cost(i),
      s = this.state;
    if (s.gold < cost || !Number.isFinite(cost)) return false;
    const old = this.stats().maxHealth;
    s.gold -= cost;
    s.levels[i]++;
    s.tutorialGoldDone = true;
    this.appliedMajors = [...s.majors];
    s.health = Math.max(
      0,
      Math.min(this.stats().maxHealth, s.health + this.stats().maxHealth - old),
    );
    return true;
  }
  regularLocked(i: number) {
    return i >= 2 && !this.state.majors[Math.floor(i / 2) - 1];
  }
  majorLocked(i: number) {
    return !this.state.perks[i * 2] || !this.state.perks[i * 2 + 1];
  }
  buyPerk(i: number, major = false) {
    const s = this.state,
      flags = major ? s.majors : s.perks,
      costs = major ? majorCosts : regularCosts;
    if (
      i < 0 ||
      i >= flags.length ||
      flags[i] ||
      (major ? this.majorLocked(i) : this.regularLocked(i)) ||
      s.diamonds < costs[i]
    )
      return false;
    s.diamonds -= costs[i];
    flags[i] = true;
    // Бонус мажорного перка применяется при следующем пересчёте характеристик.
    if (!major && (i === 5 || i === 7)) this.recalculate();
    return true;
  }
  recalculate() {
    const old = this.stats().maxHealth;
    this.appliedMajors = [...this.state.majors];
    this.state.health = Math.max(
      0,
      Math.min(this.stats().maxHealth, this.state.health + this.stats().maxHealth - old),
    );
  }
  difficulty(wave: number) {
    return c.difficultySpikes.reduce(
      (m, spike) => (wave >= spike.wave ? m * spike.multiplier : m),
      1,
    );
  }
  enemyStats(wave: number, boss = false) {
    return {
      hp:
        (c.enemyBaseHP + wave * c.enemyHPPerWave) *
        this.difficulty(wave) *
        (boss ? c.bossHPMultiplier : 1),
      damage: (c.enemyBaseDamage + wave * c.enemyDamagePerWave) * this.difficulty(wave),
      speed: Math.min(c.enemyBaseSpeed + wave * c.enemySpeedPerWave, c.enemyMaxSpeed),
      gold: round(
        round(
          (c.enemyBaseGold + wave * c.enemyGoldPerWave) *
            (1 + (this.state.perks[0] ? c.goldPerkBonus / 100 : 0)),
        ) * (boss ? c.bossGoldMultiplier : 1),
      ),
    };
  }
  batch(wave: number) {
    const highest = this.state.majors.lastIndexOf(true),
      cfg = c.majorPerkWaveConfigs[highest];
    return cfg && wave <= cfg.affectUntilWave ? cfg : null;
  }
}
