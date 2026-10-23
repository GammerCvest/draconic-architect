import { boundarySegments, bounds, pointInside, type MultiPolygon, type Pair, type Segment } from "../geometry";
import type { ExportFrame } from "../export/uvtt";
import type { BarrierType } from "../doc";
import type { MapStyle } from "../style/types";
import { image, tintedImage } from "./images";
import { makeGrainTile, makePaperTile } from "./paper";
import { buildWalls, type WallPass, type WallRun } from "./pencil";
import { buildShade, type ShadeMarks } from "./shade";

export interface Camera {
  zoom: number;
  ox: number;
  oy: number;
}

export interface DrawItem {
  src: string;
  tint: string | null;
  corners: [Pair, Pair, Pair];
}

export type DrawFeature =
  | { kind: "door"; a: Pair; b: Pair; open: boolean; look: string | null; ink: string; fill: string }
  | { kind: "barrier"; a: Pair; b: Pair; type: BarrierType; color: string; ink: string; fill: string };

export interface RenderOptions {
  grid: boolean;
  items: DrawItem[];
  features: DrawFeature[];
}

export interface StyledRegion {
  style: MapStyle;
  shape: MultiPolygon;
}

export interface Scene {
  floor: MultiPolygon;
  regions: StyledRegion[];
  base: MapStyle;
}

const PIECE = 0.25;
const MAX_SIDE = 16000;
const MAX_AREA = 200e6;

interface Part {
  style: MapStyle;
  region: Path2D;
  wallLine: Path2D;
  walls: WallPass[];
  marks: ShadeMarks;
}

interface Cache {
  floor: Path2D;
  parts: Part[];
}

export class Renderer {
  private grain = makeGrainTile();
  private paperTiles = new Map<string, HTMLCanvasElement>();
  private ink = document.createElement("canvas");
  private scratch = document.createElement("canvas");
  private scene: Scene | null = null;
  private cache: Cache = { floor: new Path2D(), parts: [] };

  setScene(scene: Scene) {
    if (
      this.scene &&
      scene.floor === this.scene.floor &&
      scene.regions === this.scene.regions &&
      scene.base === this.scene.base
    ) {
      return;
    }
    this.scene = scene;
    this.cache = buildCache(scene);
  }

  get floorBounds() {
    return this.scene ? bounds(this.scene.floor) : null;
  }

  private paperTile(color: string): HTMLCanvasElement {
    let tile = this.paperTiles.get(color);
    if (!tile) {
      tile = makePaperTile(color);
      this.paperTiles.set(color, tile);
    }
    return tile;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, opts: RenderOptions) {
    const scene = this.scene;
    if (!scene) return;
    for (const c of [this.ink, this.scratch]) {
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    const ink = this.ink.getContext("2d")!;
    const { floor, parts } = this.cache;
    const paper = scene.base.paper;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = screenPattern(ctx, this.paperTile(paper.color), cam);
    ctx.fillRect(0, 0, w, h);
    const paperImg = image(paper.texture);
    if (paperImg) {
      ctx.fillStyle = worldPattern(ctx, paperImg, cam, paper.textureScale);
      ctx.fillRect(0, 0, w, h);
    }

    for (const part of parts) {
      const f = part.style.floor;
      setCamera(ctx, cam);
      ctx.fillStyle = f.color;
      ctx.fill(part.region, "evenodd");
      const img = image(f.texture);
      if (img) {
        ctx.save();
        ctx.clip(part.region, "evenodd");
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = f.textureOpacity;
        ctx.fillStyle = worldPattern(ctx, img, cam, f.textureScale);
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalCompositeOperation = "source-over";
    ink.globalAlpha = 1;
    ink.clearRect(0, 0, w, h);
    setCamera(ink, cam);
    ink.lineCap = "round";
    ink.lineJoin = "round";

    for (const part of parts) this.drawShade(ink, part, cam, w, h);
    ink.globalCompositeOperation = "destination-out";
    ink.fill(floor, "evenodd");
    ink.globalCompositeOperation = "source-over";

    if (opts.grid) for (const part of parts) this.drawGrid(ink, part, cam, w, h);
    for (const item of opts.items) drawItem(ink, item);
    setCamera(ink, cam);

    for (const part of parts) {
      const ws = part.style.walls;
      ink.strokeStyle = ws.color;
      for (const pass of part.walls) {
        ink.globalAlpha = pass.alpha;
        ink.lineWidth = Math.max(ws.width, 1.4 / cam.zoom) * pass.width;
        ink.stroke(pass.path as Path2D);
      }
    }
    ink.globalAlpha = 1;
    for (const f of opts.features) drawFeature(ink, f, cam.zoom);
    ink.globalAlpha = 1;
    ink.setLineDash([]);
    ink.globalCompositeOperation = "source-over";

    if (paper.grain > 0) {
      ink.setTransform(1, 0, 0, 1, 0, 0);
      ink.globalCompositeOperation = "destination-out";
      ink.globalAlpha = Math.min(1, paper.grain * 2.5);
      ink.fillStyle = screenPattern(ink, this.grain, cam);
      ink.fillRect(0, 0, w, h);
      ink.globalAlpha = 1;
      ink.globalCompositeOperation = "source-over";
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.ink, 0, 0);
    setCamera(ctx, cam);
  }

  private drawShade(ink: CanvasRenderingContext2D, part: Part, cam: Camera, w: number, h: number) {
    const s = part.style.shade;
    if (s.smudge > 0 && s.band > 0) {
      ink.save();
      ink.filter = `blur(${Math.max(1, s.band * 0.3 * cam.zoom)}px)`;
      ink.globalAlpha = s.smudge * 0.55;
      ink.strokeStyle = s.color;
      ink.lineWidth = s.band * 0.9;
      ink.stroke(part.wallLine);
      ink.restore();
    }
    ink.strokeStyle = s.color;
    ink.fillStyle = s.color;
    ink.globalAlpha = 0.7;
    ink.lineWidth = Math.max(s.lineWidth, 0.6 / cam.zoom);
    ink.stroke(part.marks.lines as Path2D);
    ink.globalAlpha = 0.85;
    ink.fill(part.marks.dots as Path2D);
    ink.globalAlpha = 1;
    if (s.kind === "stamps") {
      const imgs = s.stamps.map((src) => image(src));
      for (const st of part.marks.stamps) {
        const img = imgs[st.image];
        if (!img) continue;
        const k = (s.stampSize * st.scale) / Math.max(img.naturalWidth, img.naturalHeight);
        ink.save();
        ink.translate(st.x, st.y);
        ink.rotate(st.angle);
        ink.drawImage(
          img,
          (-img.naturalWidth * k) / 2,
          (-img.naturalHeight * k) / 2,
          img.naturalWidth * k,
          img.naturalHeight * k,
        );
        ink.restore();
      }
    }
    if (s.kind === "contours") this.drawContours(ink, part, cam, w, h);
  }

  private drawContours(ink: CanvasRenderingContext2D, part: Part, cam: Camera, w: number, h: number) {
    const s = part.style.shade;
    const sc = this.scratch.getContext("2d")!;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, w, h);
    setCamera(sc, cam);
    sc.lineCap = "round";
    sc.lineJoin = "round";
    sc.strokeStyle = s.color;
    const count = Math.max(1, Math.round(2 + s.density * 4));
    const gap = s.band / count;
    const lw = Math.max(s.lineWidth, 0.8 / cam.zoom);
    for (let k = count; k >= 1; k--) {
      sc.globalCompositeOperation = "source-over";
      sc.globalAlpha = 1 - ((k - 1) / count) * 0.6;
      sc.lineWidth = 2 * k * gap + lw;
      sc.stroke(part.wallLine);
      sc.globalCompositeOperation = "destination-out";
      sc.globalAlpha = 1;
      sc.lineWidth = 2 * k * gap - lw;
      sc.stroke(part.wallLine);
    }
    sc.globalCompositeOperation = "source-over";
    ink.save();
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.globalAlpha = 0.8;
    ink.drawImage(this.scratch, 0, 0);
    ink.restore();
  }

  private drawGrid(ink: CanvasRenderingContext2D, part: Part, cam: Camera, w: number, h: number) {
    const g = part.style.grid;
    const box = this.floorBounds;
    if (g.kind === "none" || !box) return;
    const minX = Math.max(Math.floor(-cam.ox / cam.zoom), Math.floor(box.minX));
    const minY = Math.max(Math.floor(-cam.oy / cam.zoom), Math.floor(box.minY));
    const maxX = Math.min(Math.ceil((w - cam.ox) / cam.zoom), Math.ceil(box.maxX));
    const maxY = Math.min(Math.ceil((h - cam.oy) / cam.zoom), Math.ceil(box.maxY));
    ink.save();
    ink.clip(part.region, "evenodd");
    ink.fillStyle = ink.strokeStyle = g.color;
    ink.globalAlpha = g.opacity;
    const marks = new Path2D();
    if (g.kind === "dots") {
      const r = Math.max(0.025, 1.1 / cam.zoom);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          marks.moveTo(x + r, y);
          marks.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ink.fill(marks);
    } else {
      for (let x = minX; x <= maxX; x++) {
        marks.moveTo(x, minY);
        marks.lineTo(x, maxY);
      }
      for (let y = minY; y <= maxY; y++) {
        marks.moveTo(minX, y);
        marks.lineTo(maxX, y);
      }
      ink.lineWidth = Math.max(0.012, 0.8 / cam.zoom);
      ink.stroke(marks);
    }
    ink.restore();
  }

  exportCanvas(pxPerCell: number, opts: RenderOptions): { canvas: HTMLCanvasElement; frame: ExportFrame } | null {
    const box = this.floorBounds;
    if (!box) return null;
    const pad = 1;
    const minX = Math.floor(box.minX) - pad;
    const minY = Math.floor(box.minY) - pad;
    const cols = Math.ceil(box.maxX) + pad - minX;
    const rows = Math.ceil(box.maxY) + pad - minY;
    pxPerCell = Math.max(
      8,
      Math.min(pxPerCell, Math.floor(MAX_SIDE / Math.max(cols, rows)), Math.floor(Math.sqrt(MAX_AREA / (cols * rows)))),
    );
    const out = document.createElement("canvas");
    out.width = cols * pxPerCell;
    out.height = rows * pxPerCell;
    const cam = { zoom: pxPerCell, ox: -minX * pxPerCell, oy: -minY * pxPerCell };
    this.draw(out.getContext("2d")!, out.width, out.height, cam, opts);
    return { canvas: out, frame: { originX: minX, originY: minY, cols, rows, pxPerCell } };
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: DrawItem) {
  const pic = item.tint ? tintedImage(item.src, item.tint) : image(item.src);
  if (!pic) return;
  const [p0, p1, p3] = item.corners;
  const w = pic.width;
  const h = pic.height;
  ctx.save();
  ctx.transform((p1[0] - p0[0]) / w, (p1[1] - p0[1]) / w, (p3[0] - p0[0]) / h, (p3[1] - p0[1]) / h, p0[0], p0[1]);
  ctx.drawImage(pic, 0, 0);
  ctx.restore();
}

function quad(ctx: CanvasRenderingContext2D, a: Pair, ux: number, uy: number, len: number, half: number) {
  const nx = -uy * half;
  const ny = ux * half;
  ctx.beginPath();
  ctx.moveTo(a[0] + nx, a[1] + ny);
  ctx.lineTo(a[0] + ux * len + nx, a[1] + uy * len + ny);
  ctx.lineTo(a[0] + ux * len - nx, a[1] + uy * len - ny);
  ctx.lineTo(a[0] - nx, a[1] - ny);
  ctx.closePath();
}

function drawFeature(ctx: CanvasRenderingContext2D, f: DrawFeature, zoom: number) {
  const [a, b] = [f.a, f.b];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len === 0) return;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const nx = -uy;
  const ny = ux;
  const thin = Math.max(0.035, 1.2 / zoom);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (!(f.kind === "barrier" && f.type === "crayon")) {
    ctx.globalCompositeOperation = "destination-out";
    quad(ctx, a, ux, uy, len, 0.14);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.strokeStyle = f.ink;
  ctx.fillStyle = f.fill;
  ctx.lineWidth = thin;
  const at = (t: number, o = 0): Pair => [a[0] + ux * t + nx * o, a[1] + uy * t + ny * o];
  const line = (p: Pair, q: Pair) => {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  if (f.kind === "door") {
    const pic = f.look ? tintedImage(f.look, f.ink) : null;
    if (pic) {
      ctx.save();
      ctx.globalAlpha = f.open ? 0.45 : 1;
      ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      ctx.rotate(Math.atan2(uy, ux));
      ctx.drawImage(pic, -len / 2, -len / 2, len, len);
      ctx.restore();
      return;
    }
    if (!f.open) {
      quad(ctx, a, ux, uy, len, 0.12);
      ctx.fill();
      ctx.stroke();
      return;
    }
    line(at(0, 0.12), at(0, -0.12));
    line(at(len, 0.12), at(len, -0.12));
    const leaf: Pair = at(0, -len);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(leaf[0], leaf[1]);
    ctx.lineWidth = thin * 2.5;
    ctx.stroke();
    ctx.lineWidth = thin * 0.7;
    ctx.setLineDash([0.08, 0.08]);
    const start = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.arc(a[0], a[1], len, start - Math.PI / 2, start);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  switch (f.type) {
    case "window":
      quad(ctx, a, ux, uy, len, 0.07);
      ctx.fill();
      ctx.stroke();
      line(a, b);
      line(at(0, 0.14), at(0, -0.14));
      line(at(len, 0.14), at(len, -0.14));
      break;
    case "bars":
      line(a, b);
      for (let t = 0.09; t < len; t += 0.18) line(at(t, 0.11), at(t, -0.11));
      break;
    case "curtain": {
      ctx.beginPath();
      for (let t = 0; t <= len + 1e-6; t += 0.02) {
        const p = at(t, Math.sin((t / 0.25) * Math.PI * 2) * 0.07);
        if (t === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
      break;
    }
    case "bushes": {
      const r = 0.1;
      let side = 1;
      for (let t = r; t < len; t += r * 1.8) {
        const c = at(t, 0);
        const ang = Math.atan2(uy, ux);
        ctx.beginPath();
        ctx.arc(c[0], c[1], r, ang + (side > 0 ? Math.PI : 0), ang + (side > 0 ? 2 * Math.PI : Math.PI));
        ctx.stroke();
        side = -side;
      }
      break;
    }
    case "crayon":
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 0.11;
      ctx.setLineDash([0.22, 0.12]);
      line(a, b);
      break;
  }
}

function setCamera(ctx: CanvasRenderingContext2D, cam: Camera) {
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.ox, cam.oy);
}

function screenPattern(ctx: CanvasRenderingContext2D, tile: CanvasImageSource, cam: Camera): CanvasPattern {
  const p = ctx.createPattern(tile, "repeat")!;
  p.setTransform(new DOMMatrix().translate(Math.round(cam.ox), Math.round(cam.oy)));
  return p;
}

function worldPattern(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cam: Camera, cells: number): CanvasPattern {
  const p = ctx.createPattern(img, "repeat")!;
  const k = (cells * cam.zoom) / Math.max(1, img.naturalWidth);
  p.setTransform(new DOMMatrix().translate(cam.ox, cam.oy).scale(k));
  return p;
}

function shapePath(shape: MultiPolygon): Path2D {
  const path = new Path2D();
  for (const poly of shape) {
    for (const ring of poly) {
      path.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], ring[i][1]);
      path.closePath();
    }
  }
  return path;
}

function buildCache(scene: Scene): Cache {
  const floorSegs = boundarySegments(scene.floor);
  const runsByPart = classifyWalls(scene, floorSegs);
  const parts = scene.regions.map((r, i): Part => {
    const runs = runsByPart[i];
    const wallLine = new Path2D();
    const segs: Segment[] = [];
    for (const run of runs) {
      const pts = run.points;
      wallLine.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) wallLine.lineTo(pts[k][0], pts[k][1]);
      if (run.closed) wallLine.closePath();
      const n = run.closed ? pts.length : pts.length - 1;
      for (let k = 0; k < n; k++) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1] });
      }
    }
    let box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    if (segs.length) {
      box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const s of segs) {
        box.minX = Math.min(box.minX, s.ax, s.bx);
        box.minY = Math.min(box.minY, s.ay, s.by);
        box.maxX = Math.max(box.maxX, s.ax, s.bx);
        box.maxY = Math.max(box.maxY, s.ay, s.by);
      }
    }
    return {
      style: r.style,
      region: shapePath(r.shape),
      wallLine,
      walls: buildWalls(runs, r.style.walls),
      marks: buildShade({ walls: segs, floor: floorSegs, box, style: r.style.shade }),
    };
  });
  return { floor: shapePath(scene.floor), parts };
}

function classifyWalls(scene: Scene, floorSegs: Segment[]): WallRun[][] {
  const out: WallRun[][] = scene.regions.map(() => []);
  if (scene.regions.length === 0) return out;
  const single = scene.regions.length === 1;
  const regionSegs = single ? [] : scene.regions.map((r) => boundarySegments(r.shape));
  const styleAt = (x: number, y: number) => {
    const i = regionSegs.findIndex((segs) => pointInside(x, y, segs));
    return i < 0 ? 0 : i;
  };
  for (const poly of scene.floor) {
    for (const ring of poly) {
      if (single) {
        out[0].push({ points: ring, closed: true });
        continue;
      }
      const pieces: { a: Pair; b: Pair; s: number }[] = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len === 0) continue;
        const nx = -(b[1] - a[1]) / len;
        const ny = (b[0] - a[0]) / len;
        const steps = Math.max(1, Math.ceil(len / PIECE));
        for (let k = 0; k < steps; k++) {
          const p: Pair = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
          const q: Pair = [a[0] + ((b[0] - a[0]) * (k + 1)) / steps, a[1] + ((b[1] - a[1]) * (k + 1)) / steps];
          const mx = (p[0] + q[0]) / 2;
          const my = (p[1] + q[1]) / 2;
          const side = pointInside(mx + nx * 0.01, my + ny * 0.01, floorSegs) ? 1 : -1;
          pieces.push({ a: p, b: q, s: styleAt(mx + nx * side * 0.05, my + ny * side * 0.05) });
        }
      }
      if (pieces.length === 0) continue;
      const startAt = pieces.findIndex((pc, i) => pc.s !== pieces[(i - 1 + pieces.length) % pieces.length].s);
      if (startAt < 0) {
        out[pieces[0].s].push({ points: ring, closed: true });
        continue;
      }
      let run: Pair[] = [];
      let style = pieces[startAt].s;
      for (let k = 0; k < pieces.length; k++) {
        const pc = pieces[(startAt + k) % pieces.length];
        if (pc.s !== style) {
          out[style].push({ points: run, closed: false });
          run = [];
          style = pc.s;
        }
        if (run.length === 0) run.push(pc.a);
        run.push(pc.b);
      }
      out[style].push({ points: run, closed: false });
    }
  }
  return out;
}
