import type { Pair } from "../geometry";
import { hash, noise1 } from "../rng";
import { canvasPen, type Pen, type PenFactory } from "./pen";
import type { WallStyle } from "../style/types";

const STEP = 0.2;

export interface WallRun {
  points: Pair[];
  closed: boolean;
}

export interface WallPass {
  path: Pen;
  alpha: number;
  width: number;
}

function shakyStroke(
  path: Pen,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  amplitude: number,
  pass: number,
  move: boolean,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  // seeded by the line itself, so editing one room doesn't change the wobble of the others
  const seed = Math.floor(hash(Math.round(nx * 100), Math.round(ny * 100), nx * ax + ny * ay, pass) * 1e6);
  const u0 = ux * ax + uy * ay;
  const steps = Math.max(1, Math.ceil(len / STEP));
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * len;
    const w = amplitude > 0 ? noise1((u0 + t) * 2.2, seed) * amplitude : 0;
    const x = ax + ux * t + nx * w;
    const y = ay + uy * t + ny * w;
    if (move && s === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
}

function corners(run: WallRun): Pair[] {
  const pts = run.points;
  const out: Pair[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    if (!run.closed && (i === 0 || i === n - 1)) {
      out.push(pts[i]);
      continue;
    }
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  return out;
}

export function buildWalls(runs: WallRun[], style: WallStyle, pen: PenFactory = canvasPen): WallPass[] {
  if (style.kind === "none") return [];
  const passes = Math.max(1, Math.round(style.passes));
  const out: WallPass[] = [];
  for (let p = 0; p < passes; p++) {
    const path = pen();
    for (const run of runs) {
      const pts = corners(run);
      if (pts.length < 2) continue;
      if (style.kind === "sketch") sketchRun(path, pts, run.closed, style, p);
      else continuousRun(path, pts, run.closed, style.kind === "ink" ? 0 : style.wobble * (1 + p * 1.5), p);
    }
    out.push({
      path,
      alpha: p === 0 ? 0.9 : 0.5 / p,
      width: style.kind === "ink" ? 1 : p === 0 ? 1 : 0.55,
    });
  }
  return out;
}

function continuousRun(path: Pen, pts: Pair[], closed: boolean, amplitude: number, pass: number) {
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    shakyStroke(path, ax, ay, bx, by, amplitude, pass, i === 0);
  }
  if (closed) path.closePath();
}

function sketchRun(path: Pen, pts: Pair[], closed: boolean, style: WallStyle, pass: number) {
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const key = [Math.round(ax * 100), Math.round(ay * 100), Math.round(bx * 100), Math.round(by * 100), pass] as const;
    const startOver = closed || i > 0 ? style.overshoot * (0.3 + 0.7 * hash(...key, 1)) : 0;
    const endOver = closed || i < last - 1 ? style.overshoot * (0.3 + 0.7 * hash(...key, 2)) : 0;
    const shift = (hash(...key, 3) - 0.5) * style.wobble * (pass === 0 ? 0.6 : 2.2);
    const ox = -uy * shift;
    const oy = ux * shift;
    shakyStroke(
      path,
      ax - ux * startOver + ox,
      ay - uy * startOver + oy,
      bx + ux * endOver + ox,
      by + uy * endOver + oy,
      style.wobble * 0.6,
      pass,
      true,
    );
  }
}
