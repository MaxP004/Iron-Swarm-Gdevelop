import { initialState, type State } from '../game/state';
const flags = [
  'perkGoldBought',
  'perkMaxLvBought',
  'perkDiscountBought',
  'perkMaxLv2Bought',
  'perkGoldPerSecBought',
  'perkMaxLv3Bought',
  'perkCostCapBought',
  'perkUnlimitedBought',
];
const activeKeys = ['abilityBoostRemaining', 'invincibilityRemaining', 'slowRemaining'];
const cooldownKeys = [
  'abilityCooldownRemaining',
  'invincibilityCooldownRemaining',
  'slowCooldownRemaining',
];
export function encode(s: State): Record<string, unknown> {
  const data: Record<string, unknown> = {
    gold: s.gold,
    diamonds: s.diamonds,
    wave: s.wave,
    health: s.health,
    levels: [...s.levels],
    perkMajorBought: [...s.majors],
  };
  flags.forEach((k, i) => (data[k] = s.perks[i]));
  activeKeys.forEach((k, i) => (data[k] = s.active[i]));
  cooldownKeys.forEach((k, i) => (data[k] = s.cooldown[i]));
  for (const key of [
    'tutorialGoldDone',
    'tutorialDiamondDone',
    'tutorialDone',
    'tutorialWave21Done',
    'tutorialRefundDone',
    'tutorialAbilityDialogueDone',
    'tutorialAbilityUsed',
    'endingDone',
  ] as const)
    data[key] = s[key];
  return data;
}
export function decode(raw: unknown): State {
  if (!raw || typeof raw !== 'object') throw Error('Invalid save');
  const d = raw as Record<string, unknown>,
    s = initialState();
  const number = (v: unknown, fallback = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : fallback;
  for (const k of ['gold', 'diamonds', 'wave'] as const) s[k] = Math.floor(number(d[k]));
  s.health = number(d.health, s.health);
  s.levels = Array.from({ length: 5 }, (_, i) =>
    Math.min(1000000, Math.floor(number(Array.isArray(d.levels) ? d.levels[i] : 0))),
  );
  s.perks = flags.map((k) => d[k] === true);
  s.majors = Array.from(
    { length: 3 },
    (_, i) => Array.isArray(d.perkMajorBought) && d.perkMajorBought[i] === true,
  );
  s.active = activeKeys.map((k, i) => (s.majors[i] ? number(d[k]) : 0));
  s.cooldown = cooldownKeys.map((k) => number(d[k]));
  for (const key of [
    'tutorialGoldDone',
    'tutorialDiamondDone',
    'tutorialDone',
    'tutorialWave21Done',
    'tutorialRefundDone',
    'tutorialAbilityDialogueDone',
    'tutorialAbilityUsed',
    'endingDone',
  ] as const)
    s[key] = d[key] === true;
  return s;
}
export class Saves {
  static key = 'iron-swarm.save.v1';
  load(): State | null {
    try {
      const raw = localStorage.getItem(Saves.key);
      return raw ? decode(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }
  save(state: State) {
    localStorage.setItem(Saves.key, JSON.stringify(encode(state)));
  }
}
