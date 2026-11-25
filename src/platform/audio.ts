import settings from '../data/audio.json';
import type { Sound } from '../game/state';
import { defaultPreferences, type Preferences } from './preferences';
interface AudioConfig {
  url: string;
  volume: number;
  pitch: number;
  loop: boolean;
}
export class AudioSystem {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Map<string, AudioBufferSourceNode>();
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private loading: Promise<void> | null = null;
  private preferences = defaultPreferences();
  setPreferences(preferences: Preferences) {
    this.preferences = { ...preferences };
    if (this.music)
      this.music.gain.value = preferences.musicEnabled ? preferences.musicVolume / 100 : 0;
    if (this.effects)
      this.effects.gain.value = preferences.soundEnabled ? preferences.soundVolume / 100 : 0;
  }
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.music = this.context.createGain();
      this.effects = this.context.createGain();
      this.music.connect(this.context.destination);
      this.effects.connect(this.context.destination);
      this.setPreferences(this.preferences);
    }
    try {
      await this.context.resume();
    } catch {
      return;
    }
    this.loading ??= this.load();
    await this.loading;
    if (!this.sources.has('Music')) this.play('Music');
  }
  private async load() {
    await Promise.all(
      Object.entries(settings as Record<string, AudioConfig>).map(async ([name, cfg]) => {
        try {
          const response = await fetch(cfg.url);
          this.buffers.set(name, await this.context!.decodeAudioData(await response.arrayBuffer()));
        } catch (error) {
          console.warn(`Audio unavailable: ${name}`, error);
        }
      }),
    );
  }
  play(name: Sound | 'Music') {
    const cfg = (settings as Record<string, AudioConfig>)[name],
      buffer = this.buffers.get(name);
    if (!this.context || !buffer || !cfg) return;
    this.sources.get(name)?.stop();
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = cfg.loop;
    const range =
      name === 'PlayerAttack'
        ? 0.1
        : name === 'EnemyDeath'
          ? 0.15
          : name === 'EnemyAttack'
            ? 0.05
            : 0;
    source.playbackRate.value = Math.max(0.1, cfg.pitch + (Math.random() * 2 - 1) * range);
    gain.gain.value = cfg.volume;
    source.connect(gain);
    gain.connect(name === 'Music' ? this.music! : this.effects!);
    source.start();
    this.sources.set(name, source);
    source.onended = () => {
      gain.disconnect();
      if (this.sources.get(name) === source) this.sources.delete(name);
    };
  }
}
