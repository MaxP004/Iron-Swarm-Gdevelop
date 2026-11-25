import { config as c, type Feedback, type State } from './state';
import { offsetBox, overlaps, type Point } from './math';
import type { Progression } from './progression';
import runtime from '../data/runtime.json';

export interface Enemy extends Point {
  id: number;
  wave: number;
  boss: boolean;
  hp: number;
  maxHp: number;
  gold: number;
  speed: number;
  damage: number;
  angle: number;
  scale: number;
  phase: number;
  elapsed: number;
  cooldown: number;
  start: Point;
  target: Point;
  flash: number;
}
export interface Coin extends Point {
  start: Point;
  age: number;
  gold: number;
}
export class Combat {
  enemies: Enemy[] = [];
  coins: Coin[] = [];
  bladeAngle = 0;
  bladeCount = 0;
  private nextId = 0;
  private contacts = new Set<string>();
  private physicsTime = 0;
  onDeath = () => {};
  constructor(
    private state: State,
    private progression: Progression,
    private feedback: Feedback,
    private random: () => number = Math.random,
  ) {}
  spawn(wave: number, boss: boolean, x = 0) {
    let y = 6;
    if (!boss) {
      const side = Math.floor(this.random() * 3),
        distance = c.spawnRadiusMin + this.random() * (c.spawnRadiusMax - c.spawnRadiusMin);
      if (side === 1) {
        x = (this.random() * 2 - 1) * distance;
        y = distance;
      } else {
        x = side === 0 ? -distance : distance;
        y = this.random() * distance * 0.7;
      }
    }
    const stats = this.progression.enemyStats(wave, boss);
    this.enemies.push({
      id: ++this.nextId,
      x,
      y,
      wave,
      boss,
      hp: stats.hp,
      maxHp: stats.hp,
      gold: stats.gold,
      speed: stats.speed,
      damage: stats.damage,
      scale: boss ? c.bossScale : 1,
      angle: 0,
      phase: 0,
      elapsed: 0,
      cooldown: 0,
      start: { x, y },
      target: { x, y },
      flash: 0,
    });
  }
  clear() {
    this.enemies = [];
    this.contacts.clear();
  }
  update(dt: number) {
    const stats = this.progression.stats(),
      s = this.state;
    s.health = Math.min(stats.maxHealth, s.health + stats.regen * dt);
    if (this.bladeCount !== stats.blades) {
      this.bladeAngle = 0;
      this.bladeCount = stats.blades;
      this.contacts.clear();
    }
    this.bladeAngle -= (stats.speed * dt * Math.PI) / 180;
    for (const coin of [...this.coins]) {
      coin.age += dt;
      const cfg = runtime.coin,
        flyStart = cfg.riseDuration + cfg.pauseDuration;
      if (coin.age < cfg.riseDuration) {
        coin.y = coin.start.y + Math.sin((coin.age / cfg.riseDuration) * Math.PI) * cfg.riseHeight;
      } else if (coin.age < flyStart) {
        coin.y = coin.start.y;
      } else {
        const t = Math.min(1, (coin.age - flyStart) / cfg.flyDuration);
        coin.x = coin.start.x + cfg.flyOffset.x * t * t;
        coin.y = coin.start.y + cfg.flyOffset.y * t * t;
      }
      if (coin.age >= flyStart + cfg.flyDuration) {
        s.gold += coin.gold;
        this.feedback.popup(coin.start.x, coin.start.y, `+${coin.gold}`, 0xffd650, 'gold');
        this.coins.splice(this.coins.indexOf(coin), 1);
      }
    }
    for (const e of [...this.enemies]) {
      e.flash = Math.max(0, e.flash - dt);
      e.cooldown = Math.max(0, e.cooldown - dt);
      const distance = Math.hypot(e.x, e.y),
        stop = e.boss ? c.bossStopDistance : 2.15;
      if (e.phase === 0) {
        if (distance <= stop) {
          if (e.cooldown === 0) {
            e.phase = 1;
            e.elapsed = 0;
          }
          continue;
        }
        const speed = e.speed * (s.active[2] > 0 ? 1 - c.major3_SlowPercent / 100 : 1);
        const dx = -e.x / distance,
          dy = -e.y / distance;
        e.x += dx * speed * dt;
        e.y += dy * speed * dt;
        e.angle = Math.atan2(dy, dx) - Math.PI / 2;
        continue;
      }
      e.elapsed += dt;
      const attack = runtime.attack;
      if (e.phase === 1) {
        if (e.elapsed >= attack.pauseDuration) this.beginMotion(e, 2, attack.backupDistance);
      } else if (e.phase === 2) {
        this.move(e, attack.backupDuration, false);
        if (e.elapsed >= attack.backupDuration) this.beginMotion(e, 3, -attack.lungeDistance);
      } else if (e.phase === 3) {
        this.move(e, attack.lungeDuration, true);
        if (e.elapsed >= attack.lungeDuration) {
          if (s.active[1] <= 0) s.health = Math.max(0, s.health - e.damage);
          this.feedback.sound('EnemyAttack');
          if (s.health <= 0) {
            this.feedback.sound('PlayerDeath');
            this.onDeath();
            return;
          }
          const d = Math.hypot(e.x, e.y) || 1;
          e.phase = 4;
          e.elapsed = 0;
          e.start = { x: e.x, y: e.y };
          e.target = { x: (e.x / d) * stop, y: (e.y / d) * stop };
        }
      } else if (e.phase === 4) {
        this.move(e, 0.3, false);
        if (e.elapsed >= 0.3) {
          e.phase = 0;
          e.elapsed = 0;
          e.cooldown = 1 * (s.majors[2] ? 1 + c.major3_AttackCdPercent / 100 : 1);
        }
      }
    }
    this.physicsTime += dt;
    if (this.physicsTime >= 0.02) {
      this.physicsTime %= 0.02;
      this.collisions();
    }
  }
  private beginMotion(e: Enemy, phase: number, distance: number) {
    const d = Math.hypot(e.x, e.y) || 1;
    e.phase = phase;
    e.elapsed = 0;
    e.start = { x: e.x, y: e.y };
    e.target = { x: e.x + (e.x / d) * distance, y: e.y + (e.y / d) * distance };
  }
  private move(e: Enemy, duration: number, ease: boolean) {
    let t = Math.min(1, e.elapsed / duration);
    if (ease) t = 1 - (1 - t) ** 2;
    e.x = e.start.x + (e.target.x - e.start.x) * t;
    e.y = e.start.y + (e.target.y - e.start.y) * t;
  }
  blade(i: number) {
    const angle = this.bladeAngle + (i * Math.PI * 2) / this.bladeCount;
    return { x: Math.cos(angle) * 2, y: Math.sin(angle) * 2, angle: angle - Math.PI / 2 };
  }
  private collisions() {
    const contacts = new Set<string>();
    for (const e of [...this.enemies]) {
      const enemy = offsetBox(
        e,
        e.angle,
        0.21672305 * e.scale,
        1.4212087 * e.scale,
        -0.0017376095 * e.scale,
        0.003180325 * e.scale,
      );
      for (let i = 0; i < this.bladeCount; i++) {
        const blade = this.blade(i),
          box = offsetBox(
            blade,
            blade.angle,
            0.05209535 * 6,
            0.3018976 * 6,
            0.0005381387 * 6,
            -0.004398197 * 6,
          ),
          key = `${e.id}:${i}`;
        if (!overlaps(enemy, box)) continue;
        contacts.add(key);
        if (this.contacts.has(key)) continue;
        const damage = this.progression.stats().damage;
        e.hp -= damage;
        e.flash = 0.3;
        this.feedback.popup(e.x, e.y, `${Math.round(damage)}`, 0xffe368);
        this.feedback.sound('PlayerAttack');
        if (e.hp <= 0) {
          this.feedback.sound('EnemyDeath');
          this.coins.push({ x: e.x, y: e.y, start: { x: e.x, y: e.y }, age: 0, gold: e.gold });
          this.enemies.splice(this.enemies.indexOf(e), 1);
          break;
        }
      }
    }
    this.contacts = contacts;
  }
}
