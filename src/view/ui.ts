import markup from '../data/ui.html?raw';
import ru from '../data/ru.json';
import en from '../data/en.json';
import interfaceRu from '../data/interface-ru.json';
import interfaceEn from '../data/interface-en.json';
import { config as c } from '../game/state';
import type { Session } from '../game/session';
import { regularCosts, majorCosts } from '../game/progression';
import { round } from '../game/math';
import { SettingsMenu, type SettingsActions } from './settings';
import { healthBar, abilityRow } from './layout';
const keys = ['HealthMax', 'HealthRegen', 'Damage', 'RotationSpeed', 'BladeCount'];
const iconNames = [
  'UpgradeHealth',
  'UpgradeHealthRegen',
  'UpgradeDamage',
  'UpgradeRotationSpeed',
  'UpgradeNumberOfBlades',
];
const descriptions = [
  'buy_gold_confirm',
  'buy_maxlv_confirm',
  'buy_discount_confirm',
  'buy_maxlv2_confirm',
  'buy_goldsec_confirm',
  'buy_maxlv3_confirm',
  'buy_perk7_confirm',
  'buy_perk8_confirm',
];
const fmt = (n: number) =>
  n >= 1000000
    ? `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
      : `${n}`;
export type MenuActions = SettingsActions;
export class UI {
  settings: SettingsMenu;
  language: 'ru' | 'en' = 'en';
  private nodes = new Map<string, HTMLElement>();
  private confirm: (() => void) | null = null;
  private version = '';
  private elapsed = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private session: () => Session,
    private actions: MenuActions,
  ) {
    document.querySelector('#ui')!.innerHTML = markup;
    this.language = actions.preferences.value.language;
    document.documentElement.lang = this.language;
    document
      .getElementById('GameArea')!
      .insertAdjacentHTML(
        'beforeend',
        '<div class="tutorial-arrow" id="TutRefundArrow"></div><div class="tutorial-arrow" id="TutAbilityArrow"></div>',
      );
    document.querySelectorAll<HTMLElement>('#ui [id]').forEach((e) => this.nodes.set(e.id, e));
    const abilities = this.node('MajorButtonsRow');
    abilities.style.left = `${healthBar.x - abilityRow.width / 2}px`;
    abilities.style.top = `${healthBar.y + healthBar.height / 2 + abilityRow.healthGap}px`;
    abilities.style.width = `${abilityRow.width}px`;
    abilities.style.setProperty('--ability-size', `${abilityRow.buttonSize}px`);
    abilities.style.setProperty('--ability-gap', `${abilityRow.gap}px`);
    for (let i = 0; i < 5; i++) {
      this.icon(`Icon_${keys[i]}`, iconNames[i]);
      this.node(`Btn_${keys[i]}`).onclick = () => this.session().buyUpgrade(i);
    }
    for (const [id, icon] of Object.entries({
      GoldIcon: 'Coin',
      DiamondIcon: 'Diamond',
      MenuToggle: 'TreeOfUpgrades',
      PopupYes: 'Yes',
      PopupNo: 'No',
      PopupDiamondIcon: 'Diamond',
    }))
      this.icon(id, icon);
    document
      .querySelectorAll<HTMLElement>('.upgrade-cost-icon')
      .forEach((e) => (e.style.backgroundImage = 'url("assets/Textures/UI/Coin.png")'));
    for (let i = 0; i < 3; i++) {
      this.icon(`MajorBtn_${i + 1}`, `Active${i + 1}`);
      this.node(`MajorBtn_${i + 1}`).onclick = () => this.session().activate(i);
      this.node(`MajorBtn_${i + 1}`).innerHTML =
        '<span class="cooldown-fill"></span><span class="cooldown-text"></span>';
      this.node(`Major_Perk${i + 1}`).onclick = () => this.perk(i, true);
      this.node(`MajorBtn_${i + 1}`).setAttribute(
        'aria-label',
        ['Ускорение', 'Бессмертие', 'Замедление'][i],
      );
    }
    for (let i = 0; i < 8; i++) this.node(`Perk_0${i + 1}`).onclick = () => this.perk(i, false);
    this.node('MenuToggle').onclick = () => {
      this.session().toggleMenu();
      this.hidePopup();
    };
    this.node('MenuToggle').setAttribute('aria-label', 'Древо навыков / Вернуться в игру');
    this.node('DialogueNextBtn').onclick = () => this.session().advanceDialogue();
    this.node('RefundBtn').onclick = () => {
      const wave = this.session().state.wave;
      if (wave >= 21) this.session().state.tutorialRefundDone = true;
      if (wave < 21) this.popup(this.loc('refund_need_wave', wave));
      else
        this.popup(
          this.loc('refund_confirm'),
          () => this.session().refund(),
          (wave * (wave + 1)) / 2,
        );
    };
    this.node('PopupYes').onclick = () => {
      const action = this.confirm;
      this.hidePopup();
      action?.();
    };
    this.node('PopupNo').onclick = () => this.hidePopup();
    this.node('PopupOverlay').onclick = (e) => {
      if (e.target === e.currentTarget) this.hidePopup();
    };
    this.node('PopupOverlay').setAttribute('role', 'dialog');
    this.node('PopupOverlay').setAttribute('aria-modal', 'true');
    for (const [id, label] of [
      ['PopupYes', 'Подтвердить'],
      ['PopupNo', 'Отмена'],
    ]) {
      const node = this.node(id);
      node.role = 'button';
      node.tabIndex = 0;
      node.setAttribute('aria-label', label);
      node.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          node.click();
        }
      };
    }
    for (const e of document.querySelectorAll<HTMLElement>('.perk,.major-perk')) {
      e.role = 'button';
      e.tabIndex = 0;
      e.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          e.click();
        }
      };
    }
    this.settings = new SettingsMenu(this.session, actions, (key) => this.loc(key));
    // Все стрелки размещаются в координатах арены.
    for (const e of document.querySelectorAll<HTMLElement>('.tutorial-arrow')) {
      this.node('GameArea').appendChild(e);
      e.setAttribute('aria-hidden', 'true');
    }
    const notice = document.createElement('div');
    notice.id = 'notice';
    notice.role = 'status';
    document.querySelector('#game')!.appendChild(notice);
  }
  private node(id: string) {
    const node = this.nodes.get(id);
    if (!node) throw Error(`Missing UI ${id}`);
    return node;
  }
  loc(key: string, ...args: unknown[]) {
    const table = (this.language === 'ru' ? ru : en) as Record<string, string>;
    const uiTable = (this.language === 'ru' ? interfaceRu : interfaceEn) as Record<string, string>;
    return (uiTable[key] || table[key] || key).replace(/\{(\d+)\}/g, (_, i) =>
      String(args[Number(i)] ?? ''),
    );
  }
  private text(id: string, value: string) {
    const e = this.node(id);
    if (e.textContent !== value) e.textContent = value;
  }
  private icon(id: string, name: string) {
    const url = `url("assets/Textures/UI/${name}.png")`,
      e = this.node(id);
    if (e.style.backgroundImage !== url) e.style.backgroundImage = url;
  }
  private visible(id: string, visible: boolean) {
    this.node(id).style.display = visible ? 'flex' : 'none';
  }
  popup(text: string, action?: () => void, cost?: number) {
    this.confirm = action || null;
    this.text('PopupText', text);
    this.visible('PopupOverlay', true);
    this.visible('PopupCostRow', cost !== undefined);
    if (cost !== undefined) this.text('PopupCostLabel', `${cost}`);
    this.visible('PopupNo', !!action);
    this.node('PopupYes').focus({ preventScroll: true });
  }
  get popupOpen() {
    return this.node('PopupOverlay').style.display !== 'none';
  }
  hidePopup() {
    this.visible('PopupOverlay', false);
    this.confirm = null;
  }
  notify(text: string) {
    const e = document.querySelector<HTMLElement>('#notice')!;
    e.textContent = text;
    e.classList.add('visible');
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => e.classList.remove('visible'), 2500);
  }
  private perk(i: number, major: boolean) {
    const game = this.session(),
      p = game.progression,
      s = game.state;
    if (major ? p.majorLocked(i) : p.regularLocked(i)) return;
    let desc: string;
    if (major) {
      const wave = c.majorPerkWaveConfigs[i];
      desc =
        i === 0
          ? this.loc(
              'buy_major_0',
              c.major1_SpeedBoost,
              c.major1_Duration,
              c.major1_DamageBonus,
              wave.affectUntilWave,
              wave.wavesPerBatch,
            )
          : i === 1
            ? this.loc(
                'buy_major_1',
                c.major2_InvDuration,
                c.major2_InvCooldown,
                c.major2_HpBonus,
                c.major2_RegenBonus,
                wave.affectUntilWave,
                wave.wavesPerBatch,
              )
            : this.loc(
                'buy_major_2',
                c.major3_SlowPercent,
                c.major3_SlowDuration,
                c.major3_AttackCdPercent,
                wave.affectUntilWave,
                wave.wavesPerBatch,
              );
    } else
      desc = this.loc(
        descriptions[i],
        i === 0 ? c.goldPerkBonus : i === 2 ? c.discountPercent : i === 4 ? c.goldPerSecond : '',
      );
    const bought = (major ? s.majors : s.perks)[i],
      cost = (major ? majorCosts : regularCosts)[i];
    if (bought) {
      this.popup(
        desc + '\n' + (this.language === 'ru' ? 'Этот перк уже куплен' : 'Already purchased'),
      );
      return;
    }
    this.popup(
      desc,
      s.diamonds >= cost
        ? () => {
            if (game.buyPerk(i, major))
              this.notify(this.language === 'ru' ? 'Перк куплен' : 'Perk purchased');
          }
        : undefined,
      cost,
    );
  }
  update(dt: number) {
    this.elapsed += dt;
    const language = this.actions.preferences.value.language;
    if (language !== this.language) {
      this.language = language;
      document.documentElement.lang = language;
      this.settings.translate();
      this.version = '';
    }
    const game = this.session(),
      s = game.state,
      p = game.progression,
      stats = p.stats(),
      dialogue = game.dialogue;
    this.visible('MenuPanel', game.menuOpen);
    this.visible('MenuToggle', game.skillTreeUnlocked || game.menuOpen);
    this.icon('MenuToggle', game.menuOpen ? 'Return' : 'TreeOfUpgrades');
    this.text(
      'WaveLabel',
      s.wave > 100 ? this.loc('wave_infinite', s.wave) : this.loc('wave', s.wave, 100),
    );
    this.text('ScoreLabel', this.loc('gold', fmt(s.gold)));
    this.text('DiamondLabel', this.loc('diamonds', s.diamonds));
    const version = JSON.stringify([s.levels, s.perks, s.majors, s.gold, stats, this.language]);
    if (version !== this.version) {
      this.version = version;
      this.text('UpgradesTitle', this.loc('upgrades_title'));
      this.text('PerksHeader', this.loc('perks'));
      this.text('RefundBtn', this.loc('refund_btn'));
      for (let i = 0; i < 5; i++) {
        const key = keys[i],
          max = s.levels[i] >= p.maxLevel(i),
          cost = p.cost(i);
        this.node(`Upgrade_${key}`).querySelector('.upgrade-name')!.textContent = this.loc(
          `upgrade_name_${i}`,
        );
        this.text(`Level_${key}`, this.loc('lv', s.levels[i]));
        this.text(
          `Total_${key}`,
          this.loc(
            ['maxhp', 'regen', 'dmg', 'speed', 'blades'][i],
            fmt(round([stats.maxHealth, stats.regen, stats.damage, stats.speed, stats.blades][i])),
          ),
        );
        this.text(`CostPart_${key}`, max ? this.loc('max') : fmt(cost));
        this.text(`Btn_${key}`, max ? this.loc('max') : `+${p.bonus()[i]}`);
        (this.node(`Btn_${key}`) as HTMLButtonElement).disabled = max || s.gold < cost;
        this.node(`Upgrade_${key}`).classList.toggle('max-level', max);
      }
      for (let i = 0; i < 11; i++) {
        const major = i >= 8,
          index = major ? i - 8 : i,
          id = major ? `Major_Perk${index + 1}` : `Perk_0${index + 1}`,
          locked = major ? p.majorLocked(index) : p.regularLocked(index),
          bought = (major ? s.majors : s.perks)[index];
        this.icon(
          id,
          locked
            ? 'Locked'
            : major
              ? `MajorPerk${index + 1}`
              : index % 2 === 0
                ? 'CoinUpgrade'
                : 'Upgrade',
        );
        this.node(id).classList.toggle('locked', locked);
        this.node(id).classList.toggle('bought', bought);
        this.node(id).setAttribute('aria-disabled', `${locked}`);
        this.node(id).setAttribute(
          'aria-label',
          major
            ? `Major ${index + 1}`
            : this.loc(
                descriptions[index],
                index === 0
                  ? c.goldPerkBonus
                  : index === 2
                    ? c.discountPercent
                    : index === 4
                      ? c.goldPerSecond
                      : '',
              ),
        );
      }
    }
    for (let i = 0; i < 3; i++) {
      const id = `MajorBtn_${i + 1}`;
      this.visible(id, s.majors[i]);
      this.node(id).classList.toggle('active', s.active[i] > 0);
      (this.node(id).querySelector('.cooldown-fill') as HTMLElement).style.height =
        `${(s.cooldown[i] / 30) * 100}%`;
      this.node(id).querySelector('.cooldown-text')!.textContent =
        s.cooldown[i] > 0 ? `${Math.ceil(s.cooldown[i])}` : '';
    }
    this.visible('DialoguePanel', !!dialogue);
    if (dialogue) {
      this.text('DialogueText', this.loc(dialogue.keys[dialogue.index]));
      this.icon('DialogueIcon', `${dialogue.icons[dialogue.index]}Icon`);
      this.text(
        'DialogueNextBtn',
        this.loc(dialogue.index === dialogue.keys.length - 1 ? 'done' : 'next'),
      );
    }
    const showGoldArrows =
      !dialogue &&
      !game.settingsOpen &&
      !game.menuOpen &&
      s.tutorialDone &&
      !s.tutorialGoldDone &&
      !game.skillTreeUnlocked;
    for (let i = 0; i < 3; i++) {
      const id = `TutArrow_${i}`;
      this.visible(id, showGoldArrows);
      if (showGoldArrows) this.positionTutorialArrow(id, `Btn_${keys[i]}`, `Upgrade_${keys[i]}`);
    }
    const showAbilityArrow =
      !dialogue &&
      !game.paused &&
      s.majors[0] &&
      s.tutorialAbilityDialogueDone &&
      !s.tutorialAbilityUsed &&
      s.cooldown[0] <= 0;
    this.visible('TutAbilityArrow', showAbilityArrow);
    if (showAbilityArrow)
      this.positionTutorialArrow('TutAbilityArrow', 'MajorBtn_1', 'MajorBtn_1', 128);
    const showTreeArrow =
      !dialogue &&
      !game.paused &&
      !showAbilityArrow &&
      game.skillTreeUnlocked &&
      !s.tutorialDiamondDone;
    this.visible('TutDiamondArrow', showTreeArrow);
    if (showTreeArrow) this.positionTutorialArrow('TutDiamondArrow', 'MenuToggle');
    const showRefundArrow =
      game.menuOpen &&
      !game.settingsOpen &&
      !s.tutorialRefundDone &&
      !this.popupOpen &&
      s.wave >= 21;
    this.visible('TutRefundArrow', showRefundArrow);
    if (showRefundArrow) this.positionTutorialArrow('TutRefundArrow', 'RefundBtn');
  }
  private positionTutorialArrow(id: string, targetId: string, edgeId = targetId, size = 224) {
    const arrow = this.node(id),
      area = this.node('GameArea'),
      origin = area.getBoundingClientRect(),
      target = this.node(targetId).getBoundingClientRect(),
      edge = edgeId === targetId ? target : this.node(edgeId).getBoundingClientRect(),
      scale = origin.width / area.offsetWidth;
    arrow.style.left = `${(edge.left - origin.left) / scale - size - 24}px`;
    arrow.style.top = `${(target.top + target.height / 2 - origin.top) / scale - size / 2}px`;
    // Поворачивается изображение, а сама стрелка смещается по X.
    arrow.style.transform = `translateX(${Math.sin(this.elapsed * 4) * 12}px)`;
  }
}
