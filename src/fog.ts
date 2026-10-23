import { insideIntervals, segmentQuad, type MultiPolygon, type Pair, type Ring } from "./geometry";

export interface FogDoor {
  a: Pair;
  b: Pair;
  open: boolean;
}

export interface FogBarrier {
  a: Pair;
  b: Pair;
  blocksSight: boolean;
}

export interface FogInput {
  floor: MultiPolygon;
  doors: FogDoor[];
  barriers: FogBarrier[];
  blockers: Ring[];
}

export interface Fog {
  walls: Pair[][];
  doors: FogDoor[];
}

const GAP = 0.2;

function lerp(a: Pair, b: Pair, t: number): Pair {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function cutSegment(a: Pair, b: Pair, gaps: Ring[]): [number, number][] {
  let keep: [number, number][] = [[0, 1]];
  for (const gap of gaps) {
    const hit = insideIntervals(a, b, gap);
    if (!hit) continue;
    const next: [number, number][] = [];
    for (const [s, e] of keep) {
      if (hit[1] <= s || hit[0] >= e) {
        next.push([s, e]);
        continue;
      }
      if (hit[0] > s) next.push([s, hit[0]]);
      if (hit[1] < e) next.push([hit[1], e]);
    }
    keep = next;
  }
  return keep.filter(([s, e]) => e - s > 1e-6);
}

export function computeFog(input: FogInput): Fog {
  const gaps = [
    ...input.doors.map((d) => segmentQuad(d.a, d.b, GAP)[0][0]),
    ...input.barriers.filter((b) => !b.blocksSight).map((b) => segmentQuad(b.a, b.b, GAP)[0][0]),
  ];
  const walls: Pair[][] = [];
  for (const poly of input.floor) {
    for (const ring of poly) {
      const start = walls.length;
      let line: Pair[] = [];
      const flush = () => {
        if (line.length >= 2) walls.push(line);
        line = [];
      };
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        for (const [s, e] of cutSegment(a, b, gaps)) {
          const p = lerp(a, b, s);
          const q = lerp(a, b, e);
          const last = line[line.length - 1];
          if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) {
            flush();
            line.push(p);
          }
          line.push(q);
        }
      }
      flush();
      const mine = walls.length - start;
      if (mine >= 2) {
        const first = walls[start];
        const last = walls[walls.length - 1];
        const end = last[last.length - 1];
        if (Math.hypot(end[0] - first[0][0], end[1] - first[0][1]) < 1e-6) {
          walls[start] = [...last, ...first.slice(1)];
          walls.pop();
        }
      }
    }
  }
  for (const b of input.barriers) if (b.blocksSight) walls.push([b.a, b.b]);
  for (const ring of input.blockers) walls.push([...ring, ring[0]]);
  return { walls, doors: input.doors };
}

export function sightLines(fog: Fog): Pair[][] {
  return [...fog.walls, ...fog.doors.filter((d) => !d.open).map((d) => [d.a, d.b])];
}
