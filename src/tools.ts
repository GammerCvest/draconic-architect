import type { DrawMode, Editor, ToolId } from "./editor";
import { lang } from "./i18n";
import { assetInfo } from "./items/resolve";
import { image } from "./render/images";
import {
  bounds,
  boxesTouch,
  rectPolygon,
  translate,
  unionShapes,
  wallSlot,
  type Pair,
  type Polygon,
  type Vec,
} from "./geometry";

export interface PointerInfo {
  world: Vec;
  shift: boolean;
  ctrl: boolean;
}

export interface ToolHost {
  editor: Editor;
  snap(p: Vec, free: boolean): Vec;
  pixel(): number;
  redraw(): void;
}

export interface Tool {
  readonly id: ToolId;
  down(p: PointerInfo): void;
  move(p: PointerInfo, pressed: boolean): void;
  up(p: PointerInfo): void;
  doubleClick?(p: PointerInfo): void;
  key?(e: KeyboardEvent): boolean;
  cancel(): void;
  overlay(ctx: CanvasRenderingContext2D, zoom: number): void;
}

const ADD_FILL = "rgba(59, 110, 168, 0.16)";
const ADD_LINE = "rgba(59, 110, 168, 0.9)";
const CARVE_FILL = "rgba(176, 65, 62, 0.16)";
const CARVE_LINE = "rgba(176, 65, 62, 0.9)";
export const ROOM_FILL = "rgba(124, 82, 150, 0.12)";
export const ROOM_LINE = "rgba(124, 82, 150, 0.9)";

function previewStyle(ctx: CanvasRenderingContext2D, zoom: number, mode: DrawMode) {
  ctx.fillStyle = mode === "carve" ? CARVE_FILL : mode === "room" ? ROOM_FILL : ADD_FILL;
  ctx.strokeStyle = mode === "carve" ? CARVE_LINE : mode === "room" ? ROOM_LINE : ADD_LINE;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
}

function drawMode(host: ToolHost, ctrl: boolean): DrawMode {
  const mode = host.editor.drawMode;
  if (!ctrl || mode === "room") return mode;
  return mode === "floor" ? "carve" : "floor";
}

function addShapes(host: ToolHost, shapes: Polygon[], mode: DrawMode) {
  const shape = unionShapes([], shapes);
  if (shape.length > 0) host.editor.addDrawn(shape, mode);
}

export class SelectTool implements Tool {
  readonly id = "select";
  private start: Vec | null = null;
  private mode: "move" | "marquee" | null = null;
  private current: Vec | null = null;
  private additive = false;
  private moved = { x: 0, y: 0 };

  constructor(private host: ToolHost) {}

  private hit(p: PointerInfo) {
    return this.host.editor.pick(p.world, 6 * this.host.pixel());
  }

  down(p: PointerInfo) {
    const ed = this.host.editor;
    const hit = this.hit(p);
    if (ed.attachPicking) {
      if (hit && !ed.selection.has(hit.id)) ed.attachTo(hit.id);
      else ed.cancelAttach();
      return;
    }
    this.start = p.world;
    this.current = p.world;
    this.additive = p.shift;
    this.moved = { x: 0, y: 0 };
    if (hit) {
      const ids = p.ctrl ? [hit.id] : ed.expand([hit.id]);
      if (p.shift) ed.select(ids, true);
      else if (p.ctrl || !ed.selection.has(hit.id)) ed.select(ids);
      this.mode = ed.selection.has(hit.id) ? "move" : null;
    } else {
      if (!p.shift) ed.select([]);
      this.mode = "marquee";
    }
  }

  doubleClick(p: PointerInfo) {
    const hit = this.hit(p);
    if (hit) this.host.editor.select(this.host.editor.connected(hit.id), p.shift);
  }

  move(p: PointerInfo, pressed: boolean) {
    if (!pressed || !this.start) return;
    this.current = p.world;
    const ed = this.host.editor;
    if (this.mode === "move") {
      const s = ed.doc.settings.snap;
      const dx = Math.round((p.world.x - this.start.x) / s) * s;
      const dy = Math.round((p.world.y - this.start.y) / s) * s;
      if (dx === this.moved.x && dy === this.moved.y) return;
      this.moved = { x: dx, y: dy };
      ed.setPreview(dx === 0 && dy === 0 ? null : ed.mapPlaced((o) => ({ ...o, shape: translate(o.shape, dx, dy) })));
    } else if (this.mode === "marquee") {
      this.host.redraw();
    }
  }

  up() {
    const ed = this.host.editor;
    if (this.mode === "move" && ed.preview) {
      ed.commit(ed.preview);
    } else if (this.mode === "marquee" && this.start && this.current) {
      const box = {
        minX: Math.min(this.start.x, this.current.x),
        minY: Math.min(this.start.y, this.current.y),
        maxX: Math.max(this.start.x, this.current.x),
        maxY: Math.max(this.start.y, this.current.y),
      };
      if (box.maxX - box.minX > 0.05 || box.maxY - box.minY > 0.05) {
        const hits = ed.doc.objects.filter((o) => {
          const b = bounds(o.shape);
          return !o.hidden && ed.selectable(o) && b !== null && boxesTouch(b, box);
        });
        const ids = ed.expand(hits.map((o) => o.id));
        ed.select(this.additive ? ids.filter((id) => !ed.selection.has(id)) : ids, this.additive);
      }
    }
    this.cancel();
  }

  cancel() {
    if (this.host.editor.preview) this.host.editor.setPreview(null);
    this.start = this.current = null;
    this.mode = null;
    this.host.redraw();
  }

  overlay(ctx: CanvasRenderingContext2D, zoom: number) {
    if (this.mode !== "marquee" || !this.start || !this.current) return;
    ctx.fillStyle = "rgba(59, 110, 168, 0.08)";
    ctx.strokeStyle = ADD_LINE;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    const x = Math.min(this.start.x, this.current.x);
    const y = Math.min(this.start.y, this.current.y);
    const w = Math.abs(this.current.x - this.start.x);
    const h = Math.abs(this.current.y - this.start.y);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

export class RectTool implements Tool {
  readonly id = "rect";
  private start: Vec | null = null;
  private end: Vec | null = null;
  private ctrl = false;

  constructor(private host: ToolHost) {}

  down(p: PointerInfo) {
    this.start = this.host.snap(p.world, p.shift);
    this.end = this.start;
    this.ctrl = p.ctrl;
  }

  move(p: PointerInfo) {
    if (!this.start) return;
    this.end = this.host.snap(p.world, p.shift);
    this.ctrl = p.ctrl;
    this.host.redraw();
  }

  up() {
    const { start, end, ctrl } = this;
    this.cancel();
    if (!start || !end) return;
    if (Math.abs(end.x - start.x) < 1e-6 || Math.abs(end.y - start.y) < 1e-6) return;
    addShapes(this.host, [rectPolygon(start.x, start.y, end.x, end.y)], drawMode(this.host, ctrl));
  }

  cancel() {
    this.start = this.end = null;
    this.host.redraw();
  }

  overlay(ctx: CanvasRenderingContext2D, zoom: number) {
    if (!this.start || !this.end) return;
    previewStyle(ctx, zoom, drawMode(this.host, this.ctrl));
    const x = Math.min(this.start.x, this.end.x);
    const y = Math.min(this.start.y, this.end.y);
    const w = Math.abs(this.end.x - this.start.x);
    const h = Math.abs(this.end.y - this.start.y);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

export class PolygonTool implements Tool {
  readonly id = "polygon";
  private points: Vec[] = [];
  private hover: Vec | null = null;
  private ctrl = false;

  constructor(private host: ToolHost) {}

  down(p: PointerInfo) {
    const pt = this.host.snap(p.world, p.shift);
    this.ctrl = p.ctrl;
    const first = this.points[0];
    if (this.points.length >= 3 && first && Math.hypot(pt.x - first.x, pt.y - first.y) < 0.2) {
      this.finish();
      return;
    }
    const last = this.points[this.points.length - 1];
    if (!last || last.x !== pt.x || last.y !== pt.y) this.points.push(pt);
    this.host.redraw();
  }

  move(p: PointerInfo) {
    this.hover = this.host.snap(p.world, p.shift);
    this.ctrl = p.ctrl;
    if (this.points.length > 0) this.host.redraw();
  }

  up() {}

  doubleClick() {
    this.finish();
  }

  key(e: KeyboardEvent): boolean {
    if (this.points.length === 0) return false;
    if (e.key === "Enter") this.finish();
    else if (e.key === "Escape") this.cancel();
    else if (e.key === "Backspace") {
      this.points.pop();
      this.host.redraw();
    } else return false;
    return true;
  }

  private finish() {
    const pts = this.points;
    const ctrl = this.ctrl;
    this.cancel();
    if (pts.length < 3) return;
    addShapes(this.host, [[pts.map((v) => [v.x, v.y] as [number, number])]], drawMode(this.host, ctrl));
  }

  cancel() {
    this.points = [];
    this.host.redraw();
  }

  overlay(ctx: CanvasRenderingContext2D, zoom: number) {
    if (this.points.length === 0) return;
    previewStyle(ctx, zoom, drawMode(this.host, this.ctrl));
    const path = new Path2D();
    path.moveTo(this.points[0].x, this.points[0].y);
    for (const v of this.points.slice(1)) path.lineTo(v.x, v.y);
    if (this.hover) path.lineTo(this.hover.x, this.hover.y);
    path.closePath();
    ctx.fill(path);
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    for (const v of this.points) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 3.5 / zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export class BrushTool implements Tool {
  readonly id = "brush";
  private cells = new Set<string>();
  private last: Vec | null = null;
  private ctrl = false;

  constructor(private host: ToolHost) {}

  down(p: PointerInfo) {
    this.cells.clear();
    this.ctrl = p.ctrl;
    this.last = p.world;
    this.paint(p.world);
    this.host.redraw();
  }

  move(p: PointerInfo, pressed: boolean) {
    if (!pressed || !this.last) return;
    const steps = Math.ceil(Math.hypot(p.world.x - this.last.x, p.world.y - this.last.y) * 4);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.paint({ x: this.last.x + (p.world.x - this.last.x) * t, y: this.last.y + (p.world.y - this.last.y) * t });
    }
    this.last = p.world;
    this.host.redraw();
  }

  up() {
    const shapes: Polygon[] = [];
    for (const key of this.cells) {
      const [x, y] = key.split(",").map(Number);
      shapes.push(rectPolygon(x, y, x + 1, y + 1));
    }
    const ctrl = this.ctrl;
    this.cancel();
    addShapes(this.host, shapes, drawMode(this.host, ctrl));
  }

  private paint(v: Vec) {
    this.cells.add(`${Math.floor(v.x)},${Math.floor(v.y)}`);
  }

  cancel() {
    this.cells.clear();
    this.last = null;
    this.host.redraw();
  }

  overlay(ctx: CanvasRenderingContext2D, zoom: number) {
    if (this.cells.size === 0) return;
    previewStyle(ctx, zoom, drawMode(this.host, this.ctrl));
    ctx.setLineDash([]);
    for (const key of this.cells) {
      const [x, y] = key.split(",").map(Number);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export class ItemTool implements Tool {
  readonly id = "item";
  private hover: Vec | null = null;

  constructor(private host: ToolHost) {}

  down(p: PointerInfo) {
    const brush = this.host.editor.itemBrush;
    if (brush) this.host.editor.addItem(brush, p.world);
  }

  move(p: PointerInfo) {
    this.hover = p.world;
    if (this.host.editor.itemBrush) this.host.redraw();
  }

  up() {}

  cancel() {
    this.hover = null;
    this.host.redraw();
  }

  overlay(ctx: CanvasRenderingContext2D, zoom: number) {
    const ed = this.host.editor;
    if (!this.hover || !ed.itemBrush) return;
    const info = assetInfo(ed.doc, ed.itemBrush, lang());
    if (!info) return;
    const s = ed.doc.settings.snap;
    const x = Math.round((this.hover.x - info.w / 2) / s) * s;
    const y = Math.round((this.hover.y - info.h / 2) / s) * s;
    const img = image(info.src);
    ctx.save();
    if (img) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, x, y, info.w, info.h);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = ADD_LINE;
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeRect(x, y, info.w, info.h);
    ctx.restore();
  }
}

export class SegmentTool implements Tool {
  private start: Vec | null = null;
  private end: Vec | null = null;

  constructor(
    private host: ToolHost,
    readonly id: "door" | "barrier",
  ) {}

  down(p: PointerInfo) {
    this.start = this.end = this.host.snap(p.world, p.shift);
  }

  move(p: PointerInfo, pressed: boolean) {
    if (!pressed || !this.start) return;
    this.end = this.host.snap(p.world, p.shift);
    this.host.redraw();
  }

  up(p: PointerInfo) {
    const { start, end } = this;
    this.cancel();
    if (!start || !end) return;
    const ed = this.host.editor;
    let seg: [Pair, Pair] | null = null;
    if (Math.hypot(end.x - start.x, end.y - start.y) >= 0.3) {
      seg = [
        [start.x, start.y],
        [end.x, end.y],
      ];
    } else {
      seg = wallSlot(ed.floor(), p.world);
    }
    if (!seg) return;
    if (this.id === "door") ed.addDoor(seg[0], seg[1]);
    else ed.addBarrier(seg[0], seg[1]);
  }

  cancel() {
    this.start = this.end = null;
    this.host.redraw();
  }

  overlay(ctx: CanvasRenderingContext2D, zoom: number) {
    if (!this.start || !this.end) return;
    ctx.strokeStyle = ADD_LINE;
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.beginPath();
    ctx.moveTo(this.start.x, this.start.y);
    ctx.lineTo(this.end.x, this.end.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export class LightTool implements Tool {
  readonly id = "light";

  constructor(private host: ToolHost) {}

  down(p: PointerInfo) {
    this.host.editor.addLight(p.world);
  }

  move() {}
  up() {}
  cancel() {}
  overlay() {}
}
