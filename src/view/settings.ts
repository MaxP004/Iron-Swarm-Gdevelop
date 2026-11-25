import markup from './settings.html?raw';
import type { Session } from '../game/session';
import type { Preferences, PreferencesStore } from '../platform/preferences';
import { VERSION } from '../platform/diagnostics';
export interface SettingsActions {
  save: () => void;
  restart: () => void;
  preferences: PreferencesStore;
  setPreferences: (patch: Partial<Preferences>) => void;
}
export class SettingsMenu {
  private overlay: HTMLElement;
  private dialog: HTMLElement;
  private toggle: HTMLButtonElement;
  private speed: HTMLButtonElement;
  private previousFocus: HTMLElement | null = null;
  constructor(
    private session: () => Session,
    actions: SettingsActions,
    private loc: (key: string) => string,
  ) {
    document.querySelector('#ui')!.insertAdjacentHTML('beforeend', markup);
    this.overlay = document.getElementById('SettingsOverlay')!;
    this.dialog = document.getElementById('SettingsDialog')!;
    this.toggle = document.getElementById('SettingsToggle') as HTMLButtonElement;
    this.toggle.onclick = () => this.open();
    this.speed = document.getElementById('SpeedToggle') as HTMLButtonElement;
    const showSpeed = () => {
      const value = actions.preferences.value.speed;
      document.getElementById('SpeedValue')!.textContent = `${value}x`;
      this.speed.classList.toggle('fast', value === 2);
      this.speed.setAttribute('aria-pressed', `${value === 2}`);
    };
    this.speed.onclick = () => {
      actions.setPreferences({ speed: actions.preferences.value.speed === 2 ? 1 : 2 });
      showSpeed();
    };
    showSpeed();
    document.getElementById('SettingsClose')!.onclick = () => this.close();
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) this.close();
    };
    this.overlay.onkeydown = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = [
        ...this.dialog.querySelectorAll<HTMLElement>('button,select,input,textarea'),
      ].filter((e) => e.getClientRects().length > 0);
      const first = focusable[0],
        last = focusable.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    for (const channel of ['music', 'sound'] as const) {
      const enabled = document.getElementById(`${channel}-enabled`) as HTMLInputElement;
      const volume = document.getElementById(`${channel}-volume`) as HTMLInputElement;
      enabled.checked = actions.preferences.value[`${channel}Enabled`];
      volume.value = `${actions.preferences.value[`${channel}Volume`]}`;
      enabled.onchange = () => actions.setPreferences({ [`${channel}Enabled`]: enabled.checked });
      volume.oninput = () => {
        actions.setPreferences({ [`${channel}Volume`]: Number(volume.value) });
        document.getElementById(`${channel}-value`)!.textContent = `${volume.value}%`;
        volume.style.setProperty('--range-fill', `${volume.value}%`);
      };
      document.getElementById(`${channel}-value`)!.textContent = `${volume.value}%`;
      volume.style.setProperty('--range-fill', `${volume.value}%`);
    }
    (document.getElementById('language') as HTMLSelectElement).value =
      actions.preferences.value.language;
    document.getElementById('language')!.onchange = (e) =>
      actions.setPreferences({ language: (e.target as HTMLSelectElement).value as 'ru' | 'en' });
    document.getElementById('save-browser')!.onclick = actions.save;
    const restartConfirm = document.getElementById('SettingsRestartConfirm')!;
    document.getElementById('new-game')!.onclick = () => {
      restartConfirm.style.display = 'flex';
      document.getElementById('SettingsRestartNo')!.focus({ preventScroll: true });
    };
    document.getElementById('SettingsRestartNo')!.onclick = () => {
      restartConfirm.style.display = 'none';
    };
    document.getElementById('SettingsRestartYes')!.onclick = () => {
      restartConfirm.style.display = 'none';
      actions.restart();
    };
    document.getElementById('fullscreen')!.onclick = () => {
      const request = document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
      void request.catch(() => {});
    };
    this.translate();
  }
  translate() {
    this.dialog
      .querySelectorAll<HTMLElement>('[data-setting-text]')
      .forEach((e) => (e.textContent = this.loc(e.dataset.settingText!)));
    this.toggle.setAttribute('aria-label', this.loc('settings_title'));
    this.speed.setAttribute('aria-label', this.loc('game_speed'));
    this.speed.title = this.loc('game_speed');
    document.getElementById('SettingsVersion')!.textContent = `IRON SWARM · ${VERSION}`;
    for (const channel of ['music', 'sound'])
      document
        .getElementById(`${channel}-enabled`)!
        .setAttribute('aria-label', this.loc(channel === 'music' ? 'music' : 'sounds'));
  }
  open() {
    this.previousFocus = document.activeElement as HTMLElement;
    this.session().settingsOpen = true;
    this.overlay.style.display = 'flex';
    document.getElementById('SettingsClose')!.focus({ preventScroll: true });
    // Пока открыты настройки, фоновые кнопки не принимают ввод.
    document.getElementById('RootContainer')!.inert = true;
    this.toggle.inert = true;
    this.speed.inert = true;
  }
  close() {
    this.session().settingsOpen = false;
    this.overlay.style.display = 'none';
    document.getElementById('RootContainer')!.inert = false;
    this.toggle.inert = false;
    this.speed.inert = false;
    const target = this.previousFocus?.isConnected ? this.previousFocus : this.toggle;
    target.focus({ preventScroll: true });
  }
}
