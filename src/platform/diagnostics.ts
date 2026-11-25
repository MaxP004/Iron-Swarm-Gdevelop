export const VERSION = '1.2.0';
// Данные текущего запуска для отчёта об ошибке.
export class Diagnostics {
  private frames = 0;
  private elapsed = 0;
  fps = 0;
  activeSeconds = 0;
  peakEnemies = 0;
  maxWave = 0;
  private errors: string[] = [];
  frame(seconds: number, active: boolean, wave: number, enemies: number) {
    if (seconds <= 0 || seconds > 0.5) return;
    this.frames++;
    this.elapsed += seconds;
    if (active) this.activeSeconds += seconds;
    this.maxWave = Math.max(this.maxWave, wave);
    this.peakEnemies = Math.max(this.peakEnemies, enemies);
    if (this.elapsed >= 1) {
      this.fps = Math.round(this.frames / this.elapsed);
      this.frames = 0;
      this.elapsed = 0;
    }
  }
  error(message: string) {
    this.errors = [...this.errors.slice(-9), message.slice(0, 300)];
  }
  report(message: string, wave: number, viewport: { width: number; height: number }) {
    return {
      version: VERSION,
      message: message.slice(0, 2000),
      wave,
      maxWave: this.maxWave,
      activeSeconds: Math.round(this.activeSeconds),
      fps: this.fps,
      peakEnemies: this.peakEnemies,
      viewport,
      errors: [...this.errors],
    };
  }
}
