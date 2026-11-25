import './style.css';
import './data/unity.css';
import './overrides.css';
import { Session, advance } from './game/session';
import { initialState, type Feedback } from './game/state';
import { World } from './view/world';
import { UI } from './view/ui';
import { chooseLanguage } from './view/language';
import { AudioSystem } from './platform/audio';
import { Saves } from './platform/saves';
import { PreferencesStore } from './platform/preferences';
import { Diagnostics } from './platform/diagnostics';

async function main() {
  const game = document.querySelector<HTMLElement>('#game')!;
  const resize = () => {
    game.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`;
  };
  resize();
  addEventListener('resize', resize);
  const boot = document.createElement('div');
  boot.id = 'boot';
  boot.innerHTML = 'IRON SWARM<small>Loading…</small>';
  game.appendChild(boot);
  const audio = new AudioSystem(),
    saves = new Saves(),
    world = new World();
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    // Браузер может запретить доступ к локальному хранилищу.
  }
  const preferences = new PreferencesStore(storage),
    diagnostics = new Diagnostics();
  audio.setPreferences(preferences.value);
  addEventListener('error', (event) => diagnostics.error(event.message));
  addEventListener('unhandledrejection', () => diagnostics.error('Unhandled asynchronous error'));
  let session: Session;
  const feedback: Feedback = {
    sound: audio.play.bind(audio),
    popup: (x, y, text, color, kind) =>
      world.popup(x, y, kind === 'rollback' ? ui.loc('wave_rollback', text) : text, color, kind),
  };
  const bootStatus = boot.querySelector('small')!;
  try {
    await document.fonts.load('30px Tiny5');
    await world.init(document.querySelector('#world')!, (share) => {
      bootStatus.textContent = `Loading… ${Math.round(share * 100)}%`;
    });
  } catch (error) {
    console.error(error);
    boot.querySelector('small')!.textContent =
      'Unable to start WebGL. Refresh the page or enable hardware acceleration.';
    // Игра уже показала причину сама, поэтому загрузчик не добавляет своё сообщение.
    if (parent !== window) parent.postMessage({ type: 'iron-swarm:failed' }, '*');
    return;
  }
  boot.remove();
  // Загрузчик сцены GDevelop ждёт этот сигнал, чтобы убедиться, что игра запустилась.
  if (parent !== window) parent.postMessage({ type: 'iron-swarm:ready' }, '*');
  const savedState = saves.load();
  const languageSaved = preferences.hasChosenLanguage || savedState !== null
    ? true
    : await chooseLanguage(game, preferences);
  session = new Session(feedback, savedState ?? initialState());
  if (session.state.wave > 0) session.resumeLoaded();
  const save = () => {
    try {
      saves.save(session.state);
      ui.notify(ui.language === 'ru' ? 'Игра сохранена' : 'Game saved');
    } catch {
      ui.notify(
        ui.language === 'ru'
          ? 'Браузер не разрешил сохранить игру.'
          : 'The browser could not save your game.',
      );
    }
  };
  const ui = new UI(() => session, {
    save,
    restart: () => {
      session = new Session(feedback);
      session.settingsOpen = true;
      ui.hidePopup();
      try {
        saves.save(session.state);
      } catch {}
    },
    preferences,
    setPreferences: (patch) => {
      if (!preferences.update(patch)) ui.notify(ui.loc('preferences_unsaved'));
      audio.setPreferences(preferences.value);
    },
  });
  if (!languageSaved) ui.notify(ui.loc('preferences_unsaved'));
  let previous = performance.now(),
    saveTimer = 0,
    uiElapsed = 0,
    wasPaused = false,
    renderedSession: Session | null = null;
  const frame = (now: number) => {
    const elapsed = (now - previous) / 1000,
      dt = Math.min(elapsed, 0.1);
    previous = now;
    const speed = preferences.value.speed;
    advance(session, dt, speed);
    const paused = session.paused;
    // На паузе сохраняем кадр, не перерисовывая сцену заново.
    if (!paused || !wasPaused || renderedSession !== session)
      world.render(session, paused ? 0 : dt * speed);
    wasPaused = paused;
    renderedSession = session;
    uiElapsed += dt;
    if (uiElapsed >= 1 / 30) {
      ui.update(uiElapsed);
      uiElapsed = 0;
    }
    diagnostics.frame(
      elapsed,
      !paused && !document.hidden,
      session.state.wave,
      session.combat.enemies.length,
    );
    saveTimer += dt;
    if (saveTimer >= 15) {
      saveTimer = 0;
      try {
        saves.save(session.state);
      } catch {}
    }
    requestAnimationFrame(frame);
  };
  const unlockAudio = () =>
    void audio.unlock().catch(() => diagnostics.error('Audio initialization failed'));
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
  addEventListener('pagehide', () => {
    try {
      saves.save(session.state);
    } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    previous = performance.now();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'F5') {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === 'F8') {
      e.preventDefault();
      const state = saves.load();
      if (state) {
        const settingsOpen = session.settingsOpen;
        session = new Session(feedback, state);
        session.resumeLoaded();
        session.settingsOpen = settingsOpen;
        ui.hidePopup();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (ui.popupOpen) {
        ui.hidePopup();
        return;
      }
      if (session.settingsOpen) {
        ui.settings.close();
        return;
      }
      ui.settings.open();
      return;
    }
    if ((e.target as HTMLElement).matches('input,textarea,select')) return;
    if (session.settingsOpen) return;
    if (
      (e.target as HTMLElement).matches('input,textarea,button,[role=button]') &&
      ['Enter', ' '].includes(e.key)
    )
      return;
    if (['1', '2', '3'].includes(e.key)) session.activate(Number(e.key) - 1);
  });
  if (new URLSearchParams(location.search).has('dev')) {
    Object.assign(window, {
      ironSwarm: {
        get session() {
          return session;
        },
        snapshot: () => session.snapshot(),
        step: (seconds: number) => {
          for (let t = 0; t < seconds; t += 1 / 60) session.update(1 / 60);
        },
        jump: (wave: number) => session.jump(wave),
      },
    });
    addEventListener('keydown', (e) => {
      if (session.settingsOpen || (e.target as HTMLElement).matches('input,textarea,select'))
        return;
      if (e.key.toLowerCase() === 'g') session.state.gold += 2000;
      if (e.key.toLowerCase() === 'c') session.state.diamonds += 2000;
      if (e.key === ' ') {
        e.preventDefault();
        session.jump(Math.min(100, (Math.floor(session.state.wave / 10) + 1) * 10));
      }
    });
  }
  ui.update(0);
  requestAnimationFrame(frame);
}
void main();
