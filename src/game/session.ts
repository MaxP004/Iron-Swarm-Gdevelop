import { initialState, config as c, type State, type Feedback } from './state';
import { Progression } from './progression';
import { Abilities } from './abilities';
import { Combat } from './combat';
import { wavePlan, type Spawn } from './waves';
export interface Dialogue {
  keys: string[];
  icons: string[];
  index: number;
  complete: () => void;
  pauseGame: boolean;
}
export class Session {
  state: State;
  progression: Progression;
  abilities: Abilities;
  combat: Combat;
  menuOpen = false;
  settingsOpen = false;
  get paused() {
    return this.menuOpen || this.settingsOpen || this.dialogue?.pauseGame === true;
  }
  dialogue: Dialogue | null = null;
  waveActive = false;
  private queue: Spawn[] = [];
  private waveTime = 0;
  private spawnDuration = 0;
  private nextDelay: number | null = null;
  private batch = 1;
  private goldTimer = 0;
  private clock = 0;
  constructor(
    private feedback: Feedback,
    state = initialState(),
    random: () => number = Math.random,
  ) {
    this.state = state;
    this.progression = new Progression(state);
    this.abilities = new Abilities(state);
    this.combat = new Combat(state, this.progression, feedback, random);
    this.combat.onDeath = () => this.die();
    if (!state.tutorialDone)
      this.startDialogue(
        Array.from({ length: 6 }, (_, i) => `dialogue_tut_${i + 1}`),
        ['King', 'King', 'King', 'Chronomancer', 'Chronomancer', 'Chronomancer'],
        () => {
          state.tutorialDone = true;
          this.nextDelay = 1;
        },
      );
    else this.nextDelay = 1;
  }
  update(dt: number) {
    this.showAbilityTutorialIfNeeded();
    if (this.paused) return;
    this.clock += dt;
    this.abilities.update(dt);
    this.combat.update(dt);
    if (this.state.perks[4]) {
      this.goldTimer += dt;
      if (this.goldTimer >= 1) {
        this.goldTimer -= 1;
        this.state.gold += Math.round(c.goldPerSecond);
      }
    }
    if (this.nextDelay !== null) {
      this.nextDelay -= dt;
      if (this.nextDelay <= 0) {
        this.nextDelay = null;
        this.startWave(this.state.wave + this.batch);
      }
      return;
    }
    if (!this.waveActive) return;
    this.waveTime += dt;
    while (this.queue.length && this.queue[0].at <= this.waveTime) {
      const spawn = this.queue.shift()!;
      this.combat.spawn(spawn.wave, spawn.boss, spawn.x);
    }
    if (!this.queue.length && this.waveTime >= this.spawnDuration && !this.combat.enemies.length)
      this.waveCleared();
  }
  private showAbilityTutorialIfNeeded() {
    const state = this.state;
    if (
      this.paused ||
      this.dialogue ||
      !state.tutorialDone ||
      !state.majors[0] ||
      state.tutorialAbilityDialogueDone
    )
      return;
    this.startDialogue(
      ['dialogue_ability_1', 'dialogue_ability_2'],
      ['King', 'King'],
      () => {
        state.tutorialAbilityDialogueDone = true;
      },
      true,
    );
  }
  startWave(wave: number) {
    this.nextDelay = null;
    this.state.wave = wave;
    this.waveActive = true;
    this.waveTime = 0;
    const plan = wavePlan(wave, this.progression);
    this.queue = plan.spawns;
    this.spawnDuration = plan.duration;
    this.batch = plan.batch;
    if (wave >= 21 && !this.state.tutorialWave21Done)
      this.startDialogue(['dialogue_wave21_1'], ['Chronomancer'], () => {
        this.state.tutorialWave21Done = true;
        this.state.tutorialDiamondDone = false;
      });
  }
  private waveCleared() {
    this.waveActive = false;
    if (this.state.wave >= c.totalWaves && !this.state.endingDone) {
      this.startDialogue(['dialogue_end_1', 'dialogue_end_2'], ['King', 'Chronomancer'], () => {
        this.state.endingDone = true;
        this.nextDelay = c.timeBetweenWaves;
      });
    } else this.nextDelay = c.timeBetweenWaves;
  }
  startDialogue(keys: string[], icons: string[], complete: () => void, pauseGame = false) {
    this.dialogue = { keys, icons, index: 0, complete, pauseGame };
  }
  advanceDialogue() {
    if (!this.dialogue) return;
    this.feedback.sound('Click');
    this.dialogue.index++;
    if (this.dialogue.index >= this.dialogue.keys.length) {
      const done = this.dialogue.complete;
      this.dialogue = null;
      done();
    }
  }
  get skillTreeUnlocked() {
    return this.state.tutorialWave21Done;
  }
  toggleMenu() {
    if (this.settingsOpen) return;
    if (!this.menuOpen && (!this.skillTreeUnlocked || this.dialogue)) return;
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) this.state.tutorialDiamondDone = true;
    this.feedback.sound('Click');
  }
  buyUpgrade(i: number) {
    const ok = this.progression.buyUpgrade(i);
    if (ok) this.feedback.sound('ClickUpgrade');
    return ok;
  }
  buyPerk(i: number, major = false) {
    const ok = this.progression.buyPerk(i, major);
    if (ok) this.feedback.sound('ClickUpgrade');
    return ok;
  }
  activate(i: number) {
    if (this.paused) return false;
    const ok = this.abilities.activate(i);
    if (ok && i === 0) this.state.tutorialAbilityUsed = true;
    if (ok)
      this.feedback.sound((['AbilitySpeed', 'AbilityInvincibility', 'AbilitySlow'] as const)[i]);
    return ok;
  }
  refund() {
    const s = this.state;
    if (s.wave < 21) return false;
    s.tutorialRefundDone = true;
    s.diamonds += (s.wave * (s.wave + 1)) / 2;
    s.levels.fill(0);
    s.gold = c.startGold;
    s.wave = 0;
    this.progression.recalculate();
    s.health = this.progression.stats().maxHealth;
    this.restartAfter(1);
    return true;
  }
  private restartAfter(delay: number) {
    this.combat.clear();
    this.queue = [];
    this.waveActive = false;
    this.batch = 1;
    this.nextDelay = delay;
  }
  private die() {
    const s = this.state,
      wave = Math.max(0, s.wave - 5);
    this.feedback.popup(0, 1.5, `${s.wave - wave}`, 0xff5555, 'rollback');
    s.wave = wave;
    s.health = this.progression.stats().maxHealth;
    this.restartAfter(1);
  }
  resumeLoaded() {
    this.dialogue = null;
    this.combat.clear();
    this.combat.coins = [];
    this.state.health = Math.max(
      0,
      Math.min(this.state.health, this.progression.stats().maxHealth),
    );
    if (this.state.wave === 0) {
      this.nextDelay = 1;
      return;
    }
    this.startWave(this.state.wave);
  }
  // Переход на выбранную волну для режима отладки.
  jump(wave: number) {
    this.combat.clear();
    this.queue = [];
    this.batch = 1;
    this.startWave(wave);
  }
  snapshot() {
    return {
      time: this.clock,
      state: structuredClone(this.state),
      enemies: this.combat.enemies.length,
      waveActive: this.waveActive,
      spawning: this.queue.length,
    };
  }
}
// Ускорение 2x выполняет два обычных шага за кадр: столкновения и таймеры
// считаются с тем же шагом, что и на обычной скорости.
export function advance(session: Session, dt: number, speed: 1 | 2) {
  for (let step = 0; step < speed; step++) session.update(dt);
}
