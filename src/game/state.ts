import config from '../data/balance.json';
export { config };
export interface State {
  gold: number;
  diamonds: number;
  wave: number;
  health: number;
  levels: number[];
  perks: boolean[];
  majors: boolean[];
  active: number[];
  cooldown: number[];
  tutorialGoldDone: boolean;
  tutorialDiamondDone: boolean;
  tutorialDone: boolean;
  tutorialWave21Done: boolean;
  tutorialRefundDone: boolean;
  tutorialAbilityDialogueDone: boolean;
  tutorialAbilityUsed: boolean;
  endingDone: boolean;
}
export function initialState(): State {
  return {
    gold: config.startGold,
    diamonds: 0,
    wave: 0,
    health: config.baseHealth,
    levels: [0, 0, 0, 0, 0],
    perks: Array(8).fill(false),
    majors: Array(3).fill(false),
    active: [0, 0, 0],
    cooldown: [0, 0, 0],
    tutorialGoldDone: false,
    tutorialDiamondDone: false,
    tutorialDone: false,
    tutorialWave21Done: false,
    tutorialRefundDone: false,
    tutorialAbilityDialogueDone: false,
    tutorialAbilityUsed: false,
    endingDone: false,
  };
}
export type Sound =
  | 'PlayerAttack'
  | 'EnemyDeath'
  | 'EnemyAttack'
  | 'AbilitySpeed'
  | 'AbilityInvincibility'
  | 'AbilitySlow'
  | 'PlayerDeath'
  | 'Click'
  | 'ClickUpgrade';
export interface Feedback {
  sound: (sound: Sound) => void;
  popup: (
    x: number,
    y: number,
    text: string,
    color: number,
    kind?: 'damage' | 'gold' | 'rollback',
  ) => void;
}
