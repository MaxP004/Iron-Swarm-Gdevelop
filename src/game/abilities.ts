import { config as c, type State } from './state';
export class Abilities {
  constructor(private state: State) {}
  activate(i: number) {
    const s = this.state;
    if (i < 0 || i > 2 || !s.majors[i] || s.cooldown[i] > 0) return false;
    s.active[i] = [c.major1_Duration, c.major2_InvDuration, c.major3_SlowDuration][i];
    s.cooldown[i] = [c.major1_Cooldown, c.major2_InvCooldown, c.major3_SlowCooldown][i];
    return true;
  }
  update(dt: number) {
    for (let i = 0; i < 3; i++) {
      this.state.active[i] = Math.max(0, this.state.active[i] - dt);
      this.state.cooldown[i] = Math.max(0, this.state.cooldown[i] - dt);
    }
  }
}
