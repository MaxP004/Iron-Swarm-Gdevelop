export interface Preferences {
  musicEnabled: boolean;
  soundEnabled: boolean;
  musicVolume: number;
  soundVolume: number;
  language: 'ru' | 'en';
  speed: 1 | 2;
}
export const defaultPreferences = (): Preferences => ({
  musicEnabled: true,
  soundEnabled: true,
  musicVolume: 100,
  soundVolume: 100,
  language: 'en',
  speed: 1,
});
export function decodePreferences(raw: unknown): Preferences {
  const p = defaultPreferences();
  if (!raw || typeof raw !== 'object') return p;
  const d = raw as Record<string, unknown>;
  for (const key of ['musicEnabled', 'soundEnabled'] as const)
    if (typeof d[key] === 'boolean') p[key] = d[key];
  for (const key of ['musicVolume', 'soundVolume'] as const)
    if (typeof d[key] === 'number' && Number.isFinite(d[key]))
      p[key] = Math.round(Math.max(0, Math.min(100, d[key])));
  if (d.language === 'en' || d.language === 'ru') p.language = d.language;
  if (d.speed === 1 || d.speed === 2) p.speed = d.speed;
  return p;
}
export class PreferencesStore {
  static key = 'iron-swarm.preferences.v1';
  value = defaultPreferences();
  hasChosenLanguage = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    try {
      const raw = JSON.parse(storage?.getItem(PreferencesStore.key) || 'null');
      this.value = decodePreferences(raw);
      // Existing preferences already contain the player's language, including
      // saves made before the first-launch screen was introduced.
      this.hasChosenLanguage = raw?.language === 'en' || raw?.language === 'ru';
    } catch {
      // При ошибке остаются стандартные настройки.
    }
  }
  update(patch: Partial<Preferences>) {
    this.value = decodePreferences({ ...this.value, ...patch });
    if (patch.language === 'en' || patch.language === 'ru') this.hasChosenLanguage = true;
    try {
      if (!this.storage) return false;
      this.storage.setItem(PreferencesStore.key, JSON.stringify(this.value));
      return true;
    } catch {
      return false;
    }
  }
}
