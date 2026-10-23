import * as PCModule from "polygon-clipping";
import type { MultiPolygon, Pair, Polygon, Ring } from "polygon-clipping";

export type { MultiPolygon, Pair, Polygon, Ring };

const pc = ((PCModule as unknown as { default?: typeof PCModule }).default ?? PCModule) as typeof PCModule;

export interface Vec {
  x: number;
  y: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function unionShapes(base: MultiPolygon, shapes: Polygon[]): MultiPolygon {
  if (shapes.length === 0) return base;
  return clean(pc.union(base, ...shapes));
}

export function subtractShapes(base: MultiPolygon, shapes: Polygon[]): MultiPolygon {
  if (shapes.length === 0 || base.length === 0) return base;
  return clean(pc.difference(base, ...shapes));
}

export function rectPolygon(x0: number, y0: number, x1: number, y1: number): Polygon {
  const l = Math.min(x0, x1);
  const r = Math.max(x0, x1);
  const t = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  return [
    [
      [l, t],
      [r, t],
      [r, b],
      [l, b],
    ],
  ];
}

function clean(mp: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const poly of mp) {
    const rings: Polygon = [];
    for (const ring of poly) {
      const r = simplifyRing(ring);
      if (r.length >= 3) rings.push(r);
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

function simplifyRing(ring: Ring): Ring {
  const pts = ring.slice();
  if (pts.length > 1) {
    const f = pts[0];
    const l = pts[pts.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 1e-9) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

export function boundarySegments(mp: MultiPolygon): Segment[] {
  const segs: Segment[] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1] });
      }
    }
  }
  return segs;
}

export function bounds(mp: MultiPolygon): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of mp) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function distToSegment(px: number, py: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - s.ax) * dx + (py - s.ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = s.ax + t * dx - px;
  const cy = s.ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

export function pointInside(px: number, py: number, segs: Segment[]): boolean {
  let inside = false;
  for (const s of segs) {
    if (s.ay > py !== s.by > py) {
      const x = s.ax + ((py - s.ay) / (s.by - s.ay)) * (s.bx - s.ax);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

export class SegmentIndex {
  private cells = new Map<string, Segment[]>();

  constructor(
    readonly segments: Segment[],
    private reach: number,
  ) {
    for (const s of segments) {
      const x0 = Math.floor(Math.min(s.ax, s.bx) - reach);
      const x1 = Math.floor(Math.max(s.ax, s.bx) + reach);
      const y0 = Math.floor(Math.min(s.ay, s.by) - reach);
      const y1 = Math.floor(Math.max(s.ay, s.by) + reach);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${x},${y}`;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(s);
        }
      }
    }
  }

  nearest(px: number, py: number): number {
    const list = this.cells.get(`${Math.floor(px)},${Math.floor(py)}`);
    if (!list) return Infinity;
    let best = Infinity;
    for (const s of list) {
      const d = distToSegment(px, py, s);
      if (d < best) best = d;
    }
    return best <= this.reach ? best : Infinity;
  }
}

function mapPoints(mp: MultiPolygon, fn: (x: number, y: number) => Pair): MultiPolygon {
  return mp.map((poly) => poly.map((ring) => ring.map(([x, y]) => fn(x, y))));
}

export function translate(mp: MultiPolygon, dx: number, dy: number): MultiPolygon {
  return mapPoints(mp, (x, y) => [x + dx, y + dy]);
}

export function rotate90(mp: MultiPolygon, cx: number, cy: number, dir: 1 | -1): MultiPolygon {
  return mapPoints(mp, (x, y) => (dir === 1 ? [cx - (y - cy), cy + (x - cx)] : [cx + (y - cy), cy - (x - cx)]));
}

export function flip(mp: MultiPolygon, cx: number, cy: number, axis: "h" | "v"): MultiPolygon {
  return mapPoints(mp, (x, y) => (axis === "h" ? [2 * cx - x, y] : [x, 2 * cy - y]));
}

export function containsPoint(mp: MultiPolygon, x: number, y: number): boolean {
  return pointInside(x, y, boundarySegments(mp));
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

function segmentsDistance(a: Segment, b: Segment): number {
  const d1x = a.bx - a.ax;
  const d1y = a.by - a.ay;
  const d2x = b.bx - b.ax;
  const d2y = b.by - b.ay;
  const den = d1x * d2y - d1y * d2x;
  if (den !== 0) {
    const t = ((b.ax - a.ax) * d2y - (b.ay - a.ay) * d2x) / den;
    const u = ((b.ax - a.ax) * d1y - (b.ay - a.ay) * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    distToSegment(a.ax, a.ay, b),
    distToSegment(a.bx, a.by, b),
    distToSegment(b.ax, b.ay, a),
    distToSegment(b.bx, b.by, a),
  );
}

export function shapesTouch(a: MultiPolygon, b: MultiPolygon): boolean {
  const ba = bounds(a);
  const bb = bounds(b);
  if (!ba || !bb || !boxesTouch(ba, bb)) return false;
  const sa = boundarySegments(a);
  const sb = boundarySegments(b);
  for (const x of sa) for (const y of sb) if (segmentsDistance(x, y) < 1e-6) return true;
  return pointInside(sa[0].ax, sa[0].ay, sb) || pointInside(sb[0].ax, sb[0].ay, sa);
}

export function xorRings(rings: Ring[]): MultiPolygon {
  if (rings.length === 0) return [];
  const [first, ...rest] = rings.map((r): Polygon => [r]);
  return clean(pc.xor(first, ...rest));
}
