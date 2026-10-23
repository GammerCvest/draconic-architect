import { pointInside, SegmentIndex, type Box, type Segment } from "../geometry";
import { hash, noise1 } from "../rng";
import type { ShadeStyle } from "../style/types";
import { canvasPen, type Pen, type PenFactory } from "./pen";

export interface ShadeInput {
  walls: Segment[];
  floor: Segment[];
  box: Box;
  style: ShadeStyle;
}

export interface Stamp {
  x: number;
  y: number;
  angle: number;
  scale: number;
  image: number;
}

export interface ShadeMarks {
  lines: Pen;
  dots: Pen;
  stamps: Stamp[];
}

export function buildShade(input: ShadeInput, pen: PenFactory = canvasPen): ShadeMarks {
  const marks: ShadeMarks = { lines: pen(), dots: pen(), stamps: [] };
  const { style } = input;
  if (input.walls.length === 0 || style.band <= 0) return marks;
  const index = new SegmentIndex(input.walls, style.band);
  const near = (x: number, y: number) => {
    const d = index.nearest(x, y);
    return d !== Infinity && !pointInside(x, y, input.floor) ? d : Infinity;
  };
  switch (style.kind) {
    case "diagonal":
      parallelLines(marks.lines, input, near, style.angle, 1);
      break;
    case "crosshatch":
      parallelLines(marks.lines, input, near, style.angle, 1);
      parallelLines(marks.lines, input, near, style.angle + 90, 0.6);
      break;
    case "clusters":
      clusters(marks.lines, input, near);
      break;
    case "stipple":
      stipple(marks.dots, input, near);
      break;
    case "stamps":
      stamps(marks.stamps, input, near);
      break;
  }
  return marks;
}

function parallelLines(
  path: Pen,
  input: ShadeInput,
  near: (x: number, y: number) => number,
  angleDeg: number,
  reach: number,
) {
  const { box, style } = input;
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const vx = -uy;
  const vy = ux;
  const pad = style.band;
  const corners = [
    [box.minX - pad, box.minY - pad],
    [box.maxX + pad, box.minY - pad],
    [box.minX - pad, box.maxY + pad],
    [box.maxX + pad, box.maxY + pad],
  ];
  const us = corners.map(([x, y]) => x * ux + y * uy);
  const vs = corners.map(([x, y]) => x * vx + y * vy);
  const spacing = 0.06 + (1 - style.density) * 0.16;
  const step = 0.06;
  const seed = Math.round(angleDeg);
  const tMin = Math.min(...us);
  const tMax = Math.max(...us);
  for (let c = Math.min(...vs), k = 0; c <= Math.max(...vs); c += spacing, k++) {
    let start: [number, number] | null = null;
    let last: [number, number] = [0, 0];
    const finish = () => {
      if (start && (start[0] !== last[0] || start[1] !== last[1])) {
        path.moveTo(start[0], start[1]);
        path.lineTo(last[0], last[1]);
      }
      start = null;
    };
    for (let t = tMin; t <= tMax; t += step) {
      const x = ux * t + vx * c;
      const y = uy * t + vy * c;
      const limit = style.band * reach * (0.45 + 0.55 * (0.5 + 0.5 * noise1(t * 1.7, k * 31 + seed)));
      if (near(x, y) < limit) {
        if (!start) start = [x, y];
        last = [x, y];
      } else {
        finish();
      }
    }
    finish();
  }
}

function clusters(path: Pen, input: ShadeInput, near: (x: number, y: number) => number) {
  const { box, style } = input;
  const spacing = 0.22 + (1 - style.density) * 0.2;
  const band = style.band;
  eachJittered(box, band, spacing, (x, y, gx, gy) => {
    const d = near(x, y);
    if (d === Infinity) return;
    const fade = d < band * 0.45 ? 1 : 1 - (d - band * 0.45) / (band * 0.55);
    if (hash(gx, gy, 3) > fade) return;
    const angle = hash(gx, gy, 4) * Math.PI;
    const count = 3 + Math.floor(hash(gx, gy, 5) * 3);
    const len = 0.34 + hash(gx, gy, 6) * 0.16;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.085;
      const slide = (hash(gx, gy, 10 + i) - 0.5) * 0.08;
      const l = len * (0.8 + hash(gx, gy, 20 + i) * 0.3);
      const cx = x - dy * off + dx * slide;
      const cy = y + dx * off + dy * slide;
      path.moveTo(cx - (dx * l) / 2, cy - (dy * l) / 2);
      path.lineTo(cx + (dx * l) / 2, cy + (dy * l) / 2);
    }
  });
}

function stipple(path: Pen, input: ShadeInput, near: (x: number, y: number) => number) {
  const { box, style } = input;
  const spacing = 0.045 + (1 - style.density) * 0.07;
  eachJittered(box, style.band, spacing, (x, y, gx, gy) => {
    const d = near(x, y);
    if (d === Infinity) return;
    const keep = Math.pow(1 - d / style.band, 1.6);
    if (hash(gx, gy, 7) > keep) return;
    const r = (style.lineWidth / 2) * (0.6 + hash(gx, gy, 8) * 0.9);
    path.moveTo(x + r, y);
    path.arc(x, y, r, 0, Math.PI * 2);
  });
}

function stamps(out: Stamp[], input: ShadeInput, near: (x: number, y: number) => number) {
  const { box, style } = input;
  if (style.stamps.length === 0) return;
  const spacing = Math.max(0.08, style.stampSize * (0.45 + (1 - style.density) * 0.6));
  eachJittered(box, style.band, spacing, (x, y, gx, gy) => {
    const d = near(x, y);
    if (d === Infinity) return;
    const fade = d < style.band * 0.4 ? 1 : 1 - (d - style.band * 0.4) / (style.band * 0.6);
    if (hash(gx, gy, 9) > fade) return;
    out.push({
      x,
      y,
      angle: hash(gx, gy, 11) * Math.PI * 2,
      scale: 0.75 + hash(gx, gy, 12) * 0.5,
      image: Math.floor(hash(gx, gy, 13) * style.stamps.length),
    });
  });
}

function eachJittered(
  box: Box,
  pad: number,
  spacing: number,
  fn: (x: number, y: number, gx: number, gy: number) => void,
) {
  const x0 = Math.floor((box.minX - pad) / spacing);
  const x1 = Math.ceil((box.maxX + pad) / spacing);
  const y0 = Math.floor((box.minY - pad) / spacing);
  const y1 = Math.ceil((box.maxY + pad) / spacing);
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      fn((gx + hash(gx, gy, 1)) * spacing, (gy + hash(gx, gy, 2)) * spacing, gx, gy);
    }
  }
}
