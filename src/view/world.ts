import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from 'pixi.js';
import manifest from '../data/textures.json';
import type { Session } from '../game/session';
import { round } from '../game/math';
import runtime from '../data/runtime.json';
import { healthBar } from './layout';
interface Floating {
  node: Text;
  age: number;
  x: number;
  y: number;
  gold: boolean;
  rollback: boolean;
}
const W = 1920,
  H = 1080,
  PPU = 108;
export class World {
  app = new Application();
  private textures = new Map<string, Texture>();
  private entities = new Container();
  private labels = new Container();
  private effects = new Container();
  private player!: Sprite;
  private shield!: Sprite;
  private health = new Graphics();
  private healthText = new Text({
    text: '',
    style: { fontFamily: 'Tiny5', fontSize: 30, fill: 0xffffff, fontWeight: 'bold' },
  });
  private enemyViews = new Map<number, { sprite: Sprite; text: Text }>();
  private blades: Sprite[] = [];
  private coins: Sprite[] = [];
  private floating: Floating[] = [];
  private fog = new Graphics();
  async init(element: HTMLElement, onProgress: (share: number) => void = () => {}) {
    await this.app.init({
      width: W,
      height: H,
      background: 0x14141e,
      antialias: false,
      preference: 'webgl',
      resolution: 1,
      autoStart: false,
    });
    element.appendChild(this.app.canvas);
    const entries = Object.entries(manifest);
    let loaded = 0;
    await Promise.all(
      entries.map(async ([name, cfg]) => {
        const texture = await Assets.load<Texture>(cfg.url);
        texture.source.scaleMode = 'nearest';
        this.textures.set(name, texture);
        onProgress(++loaded / entries.length);
      }),
    );
    // Камера исходной сцены: (2.55, 2.5), ortho size 5; масштаб фоновой плитки — 7.
    const background = new TilingSprite({
      texture: this.texture('Textures/Background/background'),
      width: W,
      height: H,
    });
    background.tileScale.set((7 * PPU) / 100);
    this.app.stage.addChild(background);
    this.fog.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.8 });
    this.app.stage.addChild(this.fog);
    this.app.stage.addChild(this.entities, this.labels, this.effects);
    this.player = this.sprite('Textures/Player/Armor0', 8);
    this.position(this.player, 0, 0);
    this.entities.addChild(this.player);
    this.shield = this.sprite('Textures/UI/BarrierShield', 6.7806);
    this.position(this.shield, 0, 0.065);
    this.entities.addChild(this.shield);
    this.labels.addChild(this.health, this.healthText);
    this.healthText.anchor.set(0.5);
  }
  private texture(name: string) {
    const t = this.textures.get(name);
    if (!t) throw Error(`Missing texture ${name}`);
    return t;
  }
  private sprite(name: string, scale: number) {
    const sprite = new Sprite(this.texture(name));
    sprite.anchor.set(0.5);
    sprite.scale.set((scale * PPU) / 100);
    return sprite;
  }
  private position(node: Container, x: number, y: number) {
    node.position.set(W / 2 + (x - 2.55) * PPU, H / 2 - (y - 2.5) * PPU);
  }
  popup(
    x: number,
    y: number,
    text: string,
    color: number,
    kind: 'damage' | 'gold' | 'rollback' = 'damage',
  ) {
    const gold = kind === 'gold',
      rollback = kind === 'rollback';
    if (kind === 'damage') {
      x += (Math.random() * 2 - 1) * runtime.damagePopup.spreadAmount;
      y += runtime.damagePopup.positionOffsetY;
    }
    const node = new Text({
      text,
      style: {
        fontFamily: 'Tiny5',
        fontSize: rollback ? 108 : 43.2,
        fill: kind === 'damage' ? 0xffffff : color,
      },
    });
    node.anchor.set(0.5);
    this.effects.addChild(node);
    this.floating.push({ node, age: 0, x, y, gold, rollback });
  }
  render(session: Session, dt: number) {
    const { state: s, combat, progression } = session,
      stats = progression.stats(),
      skin = ['0', '1', '12', '123'][s.majors.filter(Boolean).length];
    this.player.texture = this.texture(`Textures/Player/Armor${skin}`);
    this.shield.visible = s.active[1] > 0;
    this.fog.visible = !s.endingDone;
    while (this.blades.length < stats.blades) {
      const sprite = this.sprite(`Textures/Player/Sword${skin}`, 6);
      this.entities.addChild(sprite);
      this.blades.push(sprite);
    }
    while (this.blades.length > stats.blades) this.blades.pop()!.destroy();
    this.blades.forEach((sprite, i) => {
      const blade = combat.blade(i);
      this.position(sprite, blade.x, blade.y);
      sprite.rotation = -blade.angle;
      sprite.texture = this.texture(`Textures/Player/Sword${skin}`);
    });
    const alive = new Set(combat.enemies.map((e) => e.id));
    for (const [id, view] of this.enemyViews)
      if (!alive.has(id)) {
        view.sprite.destroy();
        view.text.destroy();
        this.enemyViews.delete(id);
      }
    for (const e of combat.enemies) {
      let view = this.enemyViews.get(e.id);
      if (!view) {
        const name = e.boss
          ? `Boss${((Math.floor(e.wave / 10) - 1) % 5) + 1}`
          : `Enemy${((e.wave - 1) % 10) + 1}`;
        const sprite = this.sprite(`Textures/Enemies/${name}`, 5 * e.scale),
          text = new Text({
            text: '',
            style: {
              fontFamily: 'Tiny5',
              fontSize: 30 * e.scale,
              fill: 0xff2020,
              fontWeight: 'bold',
            },
          });
        text.anchor.set(0.5);
        this.entities.addChild(sprite);
        this.labels.addChild(text);
        view = { sprite, text };
        this.enemyViews.set(e.id, view);
      }
      this.position(view.sprite, e.x, e.y);
      view.sprite.rotation = -e.angle;
      view.sprite.tint = e.flash > 0 ? 0xff7777 : 0xffffff;
      this.position(view.text, e.x, e.y);
      view.text.text = `${Math.max(0, Math.trunc(e.hp))}`;
    }
    while (this.coins.length < combat.coins.length) {
      const sprite = this.sprite('Textures/UI/Coin', runtime.coin.scale.x);
      this.effects.addChild(sprite);
      this.coins.push(sprite);
    }
    while (this.coins.length > combat.coins.length) this.coins.pop()!.destroy();
    combat.coins.forEach((coin, i) => {
      this.position(this.coins[i], coin.x, coin.y);
      this.coins[i].rotation =
        (-coin.age *
          (coin.age < runtime.coin.riseDuration
            ? runtime.coin.spinSpeedRise
            : runtime.coin.spinSpeedFly) *
          Math.PI) /
        180;
    });
    const { x, y, width, height } = healthBar;
    this.health
      .clear()
      .rect(x - width / 2, y - height / 2, width, height)
      .fill(0xaaaaaa)
      .rect(x - width / 2, y - height / 2, width * Math.max(0, s.health / stats.maxHealth), height)
      .fill(0x159e24);
    this.healthText.position.set(x, y);
    this.healthText.text = `${round(s.health)}/${round(stats.maxHealth)}`;
    for (const f of [...this.floating]) {
      f.age += dt;
      const duration = f.rollback
        ? 1.4
        : f.gold
          ? runtime.goldPopup.duration
          : runtime.damagePopup.duration;
      this.position(
        f.node,
        f.x,
        f.y + f.age * (f.gold ? -runtime.goldPopup.fallSpeed : runtime.damagePopup.riseSpeed),
      );
      f.node.alpha = Math.max(0, 1 - (f.gold ? (f.age / duration) ** 2 : f.age / duration));
      if (f.age >= duration) {
        f.node.destroy();
        this.floating.splice(this.floating.indexOf(f), 1);
      }
    }
    this.app.render();
  }
}
