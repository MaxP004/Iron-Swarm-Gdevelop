// На середине интервала Unity округляет к чётному числу.
export function round(value: number): number {
  const floor = Math.floor(value),
    fraction = value - floor;
  return fraction === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
}
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export type Point = { x: number; y: number };
export type Box = Point & { angle: number; width: number; height: number };
// Пересечение повёрнутых прямоугольников по разделяющим осям (SAT).
export function overlaps(a: Box, b: Box): boolean {
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2];
  for (const axis of axes) {
    const x = Math.cos(axis),
      y = Math.sin(axis);
    const radius = (r: Box) =>
      (Math.abs(Math.cos(r.angle) * x + Math.sin(r.angle) * y) * r.width) / 2 +
      (Math.abs(-Math.sin(r.angle) * x + Math.cos(r.angle) * y) * r.height) / 2;
    if (Math.abs((b.x - a.x) * x + (b.y - a.y) * y) > radius(a) + radius(b)) return false;
  }
  return true;
}
export function offsetBox(
  p: Point,
  angle: number,
  width: number,
  height: number,
  ox: number,
  oy: number,
): Box {
  return {
    x: p.x + Math.cos(angle) * ox - Math.sin(angle) * oy,
    y: p.y + Math.sin(angle) * ox + Math.cos(angle) * oy,
    angle,
    width,
    height,
  };
}
