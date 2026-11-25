import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PreferencesStore,
  decodePreferences,
  defaultPreferences,
} from '../src/platform/preferences';
import { AudioSystem } from '../src/platform/audio';
import { Diagnostics } from '../src/platform/diagnostics';

test('new players default to English and a chosen Russian language survives reload', () => {
  assert.equal(defaultPreferences().language, 'en');
  assert.equal(decodePreferences({ language: 'unknown' }).language, 'en');
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  const preferences = new PreferencesStore(storage);
  assert.equal(preferences.hasChosenLanguage, false);
  assert.equal(preferences.update({ language: 'ru' }), true);
  assert.equal(preferences.hasChosenLanguage, true);
  assert.equal(new PreferencesStore(storage).value.language, 'ru');
  assert.equal(new PreferencesStore(storage).hasChosenLanguage, true);
  assert.equal(preferences.update({ language: 'en' }), true);
  assert.equal(new PreferencesStore(storage).value.language, 'en');
});

test('existing preferences skip language selection, while missing or corrupt language does not', () => {
  const store = (raw: string | null) => new PreferencesStore({ getItem: () => raw, setItem: () => {} });
  assert.equal(store('{"language":"ru","musicVolume":25}').hasChosenLanguage, true);
  assert.equal(store('{"language":"en"}').hasChosenLanguage, true);
  assert.equal(store('{"musicVolume":25}').hasChosenLanguage, false);
  assert.equal(store('{"language":"invalid"}').hasChosenLanguage, false);
  assert.equal(store('broken').hasChosenLanguage, false);
  assert.equal(store(null).hasChosenLanguage, false);
});

test('preferences reject malformed values and clamp independent channel volumes', () => {
  assert.deepEqual(decodePreferences(null), defaultPreferences());
  assert.deepEqual(
    decodePreferences({
      musicVolume: -5,
      soundVolume: 999,
      language: 'en',
      musicEnabled: false,
      soundEnabled: 'false',
    }),
    {
      ...defaultPreferences(),
      musicVolume: 0,
      soundVolume: 100,
      language: 'en',
      musicEnabled: false,
    },
  );
  assert.equal(decodePreferences({ musicVolume: NaN }).musicVolume, 100);
});
test('preferences persist separately from game progress and survive corrupt or blocked storage', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const store = new PreferencesStore(storage);
  store.update({ musicVolume: 25, soundEnabled: false, language: 'en' });
  assert.deepEqual(new PreferencesStore(storage).value, store.value);
  data.set(PreferencesStore.key, 'broken');
  assert.deepEqual(new PreferencesStore(storage).value, defaultPreferences());
  const blocked = new PreferencesStore({
    getItem: () => {
      throw Error();
    },
    setItem: () => {
      throw Error();
    },
  });
  assert.equal(blocked.update({ musicVolume: 12 }), false);
  assert.equal(blocked.value.musicVolume, 12);
  assert.equal(new PreferencesStore(null).update({ soundEnabled: false }), false);
});
test('music and effects gain channels respect preferences before and after audio unlock', async () => {
  const gains: Array<{ gain: { value: number }; connect: () => void }> = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  class FakeContext {
    destination = {};
    createGain() {
      const gain = { gain: { value: 1 }, connect: () => {} };
      gains.push(gain);
      return gain;
    }
    async resume() {}
  }
  Object.defineProperty(globalThis, 'AudioContext', { value: FakeContext, configurable: true });
  try {
    const audio = new AudioSystem();
    // Avoid HTTP decoding: this test exercises actual mixer wiring only.
    (audio as unknown as { load: () => Promise<void> }).load = async () => {};
    audio.setPreferences({
      ...defaultPreferences(),
      musicVolume: 25,
      soundVolume: 70,
      soundEnabled: false,
    });
    await audio.unlock();
    assert.equal(gains[0].gain.value, 0.25);
    assert.equal(gains[1].gain.value, 0);
    audio.setPreferences({ ...defaultPreferences(), musicEnabled: false, soundVolume: 40 });
    assert.equal(gains[0].gain.value, 0);
    assert.equal(gains[1].gain.value, 0.4);
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
test('local diagnostics exclude paused play time and bound error reports', () => {
  const diagnostics = new Diagnostics();
  for (let i = 0; i < 120; i++) diagnostics.frame(1 / 60, i < 60, 21, 8);
  diagnostics.frame(30, true, 999, 999);
  for (let i = 0; i < 20; i++) diagnostics.error(`error ${i}`);
  const report = diagnostics.report('x'.repeat(3000), 21, { width: 1280, height: 720 });
  assert.equal(report.activeSeconds, 1);
  assert.equal(report.maxWave, 21);
  assert.equal(report.peakEnemies, 8);
  assert.equal(report.fps, 60);
  assert.equal(report.errors.length, 10);
  assert.equal(report.message.length, 2000);
});

test('game speed defaults to normal, accepts only 1x or 2x and survives reload', () => {
  assert.equal(defaultPreferences().speed, 1);
  for (const bad of [3, 0, '2', null, 1.5]) assert.equal(decodePreferences({ speed: bad }).speed, 1);
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
  assert.equal(new PreferencesStore(storage).update({ speed: 2 }), true);
  assert.equal(new PreferencesStore(storage).value.speed, 2);
});
