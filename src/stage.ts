import type { DrawMode, Editor, ToolId } from "./editor";
import { bounds, type MultiPolygon, type Vec } from "./geometry";
import type { ExportFrame } from "./export/uvtt";
import { onImageLoad } from "./render/images";
import { Renderer } from "./render/renderer";
import {
  BrushTool,
  ItemTool,
  PolygonTool,
  RectTool,
  ROOM_FILL,
  ROOM_LINE,
  SelectTool,
  type PointerInfo,
  type Tool,
  type ToolHost,
} from "./tools";

export const BASE_ZOOM = 48;
const KEY_PAN = 60;

const TOOL_KEYS: Record<string, ToolId> = {
  KeyV: "select",
  KeyR: "rect",
  KeyP: "polygon",
  KeyB: "brush",
  KeyI: "item",
};
const MODE_KEYS: Record<string, DrawMode> = { Digit1: "floor", Digit2: "carve", Digit3: "room" };
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  KeyA: [1, 0],
  KeyS: [0, -1],
  KeyD: [-1, 0],
  ArrowUp: [0, 1],
  ArrowLeft: [1, 0],
  ArrowDown: [0, -1],
  ArrowRight: [-1, 0],
};

export class Stage {
  readonly canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private renderer = new Renderer();
  private tools: Record<ToolId, Tool>;
  private activeTool: Tool;
  private frame = 0;
  private pressed = false;
  private panning: Vec | null = null;
  private spaceHeld = false;
  private touches = new Map<number, Vec>();
  private gesture: { mid: Vec; dist: number } | null = null;

  constructor(private editor: Editor) {
    const host: ToolHost = {
      editor,
      snap: (p, free) => {
        if (free) return p;
        const s = editor.doc.settings.snap;
        return { x: Math.round(p.x / s) * s, y: Math.round(p.y / s) * s };
      },
      pixel: () => 1 / editor.view.zoom,
      redraw: () => this.requestDraw(),
    };
    this.tools = {
      select: new SelectTool(host),
      rect: new RectTool(host),
      polygon: new PolygonTool(host),
      brush: new BrushTool(host),
      item: new ItemTool(host),
    };
    this.activeTool = this.tools[editor.tool];
    onImageLoad(() => this.requestDraw());
    editor.subscribe(() => {
      if (this.activeTool.id !== editor.tool) {
        this.activeTool.cancel();
        this.activeTool = this.tools[editor.tool];
      }
      this.updateCursor();
      this.requestDraw();
    });
    this.bindPointer();
    this.bindKeys();
    this.updateCursor();
  }

  mount(parent: HTMLElement) {
    parent.append(this.canvas);
    new ResizeObserver(() => this.requestDraw()).observe(parent);
    this.fit();
  }

  private size() {
    const r = this.canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  zoomBy(factor: number) {
    const { w, h } = this.size();
    this.editor.view.zoomAt(w / 2, h / 2, factor);
    this.editor.emit();
  }

  zoomReset() {
    this.zoomBy(BASE_ZOOM / this.editor.view.zoom);
  }

  fit() {
    const view = this.editor.view;
    const { w, h } = this.size();
    const { minX, minY, maxX, maxY } = bounds(this.editor.floor()) ?? { minX: -8, minY: -6, maxX: 8, maxY: 6 };
    const pad = 2;
    const zoom = Math.min(w / (maxX - minX + pad * 2), h / (maxY - minY + pad * 2));
    view.zoom = Math.max(8, Math.min(BASE_ZOOM * 2, zoom));
    view.ox = w / 2 - ((minX + maxX) / 2) * view.zoom;
    view.oy = h / 2 - ((minY + maxY) / 2) * view.zoom;
    this.editor.emit();
  }

  private panBy(dx: number, dy: number) {
    this.editor.view.ox += dx;
    this.editor.view.oy += dy;
    this.requestDraw();
  }

  private pointerInfo(e: MouseEvent): PointerInfo {
    const r = this.canvas.getBoundingClientRect();
    const world = this.editor.view.toWorld(e.clientX - r.left, e.clientY - r.top);
    return { world, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }

  private bindPointer() {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (e.pointerType === "touch") {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          this.activeTool.cancel();
          this.pressed = false;
          this.gesture = this.measureGesture();
          return;
        }
        if (this.touches.size > 2) return;
      }
      if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceHeld)) {
        e.preventDefault();
        this.panning = { x: e.clientX, y: e.clientY };
        this.updateCursor();
        return;
      }
      if (e.button !== 0) return;
      this.pressed = true;
      this.activeTool.down(this.pointerInfo(e));
    });
    c.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.gesture) {
          const next = this.measureGesture();
          const r = c.getBoundingClientRect();
          this.panBy(next.mid.x - this.gesture.mid.x, next.mid.y - this.gesture.mid.y);
          if (this.gesture.dist > 0) {
            this.editor.view.zoomAt(next.mid.x - r.left, next.mid.y - r.top, next.dist / this.gesture.dist);
          }
          this.gesture = next;
          this.editor.emit();
          return;
        }
      }
      const info = this.pointerInfo(e);
      this.editor.pointer = info.world;
      if (this.panning) {
        this.panBy(e.clientX - this.panning.x, e.clientY - this.panning.y);
        this.panning = { x: e.clientX, y: e.clientY };
        return;
      }
      this.activeTool.move(info, this.pressed);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        this.touches.delete(e.pointerId);
        if (this.gesture) {
          if (this.touches.size < 2) this.gesture = null;
          return;
        }
      }
      if (this.panning) {
        this.panning = null;
        this.updateCursor();
        return;
      }
      if (!this.pressed) return;
      this.pressed = false;
      this.activeTool.up(this.pointerInfo(e));
    };
    c.addEventListener("pointerup", release);
    c.addEventListener("pointercancel", release);
    c.addEventListener("pointerleave", () => (this.editor.pointer = null));
    c.addEventListener("dblclick", (e) => this.activeTool.doubleClick?.(this.pointerInfo(e)));
    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this.editor.view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
        this.editor.emit();
      },
      { passive: false },
    );
  }

  private measureGesture() {
    const [a, b] = [...this.touches.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  private bindKeys() {
    window.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA"))
        return;
      // the settings dialog is modal
      if (this.editor.settingsOpen) return;
      if (this.activeTool.key?.(e)) {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const handled = mod ? this.modKey(e) : this.plainKey(e);
      if (handled) e.preventDefault();
      if (e.key === "Control") this.requestDraw();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spaceHeld = false;
        this.updateCursor();
      }
      if (e.key === "Control") this.requestDraw();
    });
    window.addEventListener("blur", () => (this.spaceHeld = false));
  }

  private modKey(e: KeyboardEvent): boolean {
    const ed = this.editor;
    switch (e.code) {
      case "KeyZ":
        if (this.pressed) return true;
        if (e.shiftKey) ed.redo();
        else ed.undo();
        return true;
      case "KeyY":
        if (!this.pressed) ed.redo();
        return true;
      case "KeyC":
        ed.copy();
        return true;
      case "KeyX":
        ed.cut();
        return true;
      case "KeyV":
        ed.paste();
        return true;
      case "KeyD":
        ed.duplicate();
        return true;
      case "KeyA":
        ed.selectAll();
        return true;
      case "KeyG":
        if (e.shiftKey) ed.ungroupSelection();
        else ed.groupSelection();
        return true;
      case "KeyE":
        ed.mergeSelection();
        return true;
    }
    return false;
  }

  private plainKey(e: KeyboardEvent): boolean {
    const ed = this.editor;
    if (e.code === "Space") {
      this.spaceHeld = true;
      this.updateCursor();
      return true;
    }
    if (e.code === "Escape") {
      if (ed.attachPicking) {
        ed.cancelAttach();
        return true;
      }
      if (ed.tool === "item" && ed.itemBrush) {
        ed.setItemBrush(null);
        return true;
      }
      this.activeTool.cancel();
      ed.select([]);
      return true;
    }
    if (e.code === "Delete" || e.code === "Backspace") {
      ed.deleteSelected();
      return true;
    }
    const arrow = e.code.startsWith("Arrow");
    if (arrow && ed.selection.size > 0 && ed.tool === "select") {
      const s = ed.doc.settings.snap * (e.shiftKey ? 5 : 1);
      const [px, py] = PAN_KEYS[e.code];
      ed.moveSelected(-px * s, -py * s);
      return true;
    }
    if (PAN_KEYS[e.code]) {
      const [px, py] = PAN_KEYS[e.code];
      const step = KEY_PAN * (e.shiftKey ? 4 : 1);
      this.panBy(px * step, py * step);
      return true;
    }
    if (TOOL_KEYS[e.code] && !e.altKey) {
      ed.setTool(TOOL_KEYS[e.code]);
      return true;
    }
    if (MODE_KEYS[e.code]) {
      ed.setDrawMode(MODE_KEYS[e.code]);
      return true;
    }
    switch (e.code) {
      case "KeyQ":
        ed.rotateSelected(-1);
        return true;
      case "KeyE":
        ed.rotateSelected(1);
        return true;
      case "KeyF":
        ed.flipSelected(e.shiftKey ? "v" : "h");
        return true;
      case "KeyX":
        ed.setDrawMode(ed.drawMode === "floor" ? "carve" : "floor");
        return true;
      case "KeyG":
        ed.setSettings({ grid: !ed.doc.settings.grid });
        return true;
      case "Home":
        this.fit();
        return true;
      case "Equal":
      case "NumpadAdd":
        this.zoomBy(1.25);
        return true;
      case "Minus":
      case "NumpadSubtract":
        this.zoomBy(0.8);
        return true;
      case "PageUp":
        ed.reorder(1);
        return true;
      case "PageDown":
        ed.reorder(-1);
        return true;
    }
    return false;
  }

  private updateCursor() {
    let cursor = "crosshair";
    if (this.panning) cursor = "grabbing";
    else if (this.editor.attachPicking) cursor = "alias";
    else if (this.spaceHeld) cursor = "grab";
    else if (this.editor.tool === "select") cursor = "default";
    this.canvas.style.cursor = cursor;
  }

  requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const ed = this.editor;
    const settings = ed.doc.settings;
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const view = ed.view;
    const cam = { zoom: view.zoom * dpr, ox: view.ox * dpr, oy: view.oy * dpr };
    this.renderer.setScene(ed.scene());
    this.renderer.draw(this.ctx, w, h, cam, { grid: settings.grid, items: ed.drawItems() });
    this.drawRooms(cam.zoom, dpr);
    this.drawSelection(cam.zoom);
    this.activeTool.overlay(this.ctx, cam.zoom);
  }

  private drawRooms(zoom: number, dpr: number) {
    const ed = this.editor;
    const ctx = this.ctx;
    ctx.save();
    for (const o of ed.stacked()) {
      if (o.kind !== "room" || !ed.visible(o)) continue;
      const path = shapePath(o.shape);
      ctx.fillStyle = ROOM_FILL;
      ctx.globalAlpha = 0.5;
      ctx.fill(path, "evenodd");
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ROOM_LINE;
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([8 / zoom, 5 / zoom]);
      ctx.stroke(path);
      const box = bounds(o.shape);
      if (!box || zoom < 14 * dpr) continue;
      const size = Math.max(12 * dpr, Math.min(22 * dpr, zoom * 0.32));
      ctx.font = `600 ${size / zoom}px "Segoe UI", "Noto Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ROOM_LINE;
      ctx.fillText(o.name, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, box.maxX - box.minX);
    }
    ctx.restore();
  }

  private drawSelection(zoom: number) {
    const ed = this.editor;
    const ctx = this.ctx;
    const attached = ed.withAttached(ed.selection);
    for (const o of ed.doc.objects) {
      const selected = ed.selection.has(o.id);
      if (!selected && !attached.has(o.id)) continue;
      const path = shapePath(o.shape);
      const color =
        o.kind === "room"
          ? "124, 82, 150"
          : o.kind === "item"
            ? "58, 120, 90"
            : o.carve
              ? "176, 65, 62"
              : "59, 110, 168";
      if (selected) {
        ctx.fillStyle = `rgba(${color}, ${o.hidden ? 0.04 : 0.06})`;
        ctx.fill(path, "evenodd");
      }
      ctx.strokeStyle = `rgba(${color}, ${selected ? 0.95 : 0.5})`;
      ctx.lineWidth = (selected ? 2 : 1.5) / zoom;
      ctx.setLineDash(o.hidden || !selected ? [5 / zoom, 4 / zoom] : []);
      ctx.stroke(path);
    }
    const box = ed.selectionBox();
    if (box) {
      const pad = 6 / zoom;
      ctx.strokeStyle = "rgba(59, 110, 168, 0.7)";
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 3 / zoom]);
      ctx.strokeRect(box.minX - pad, box.minY - pad, box.maxX - box.minX + pad * 2, box.maxY - box.minY + pad * 2);
    }
    ctx.setLineDash([]);
  }

  async exportImage(): Promise<{ png: Blob; frame: ExportFrame } | null> {
    const settings = this.editor.doc.settings;
    this.renderer.setScene(this.editor.scene());
    const out = this.renderer.exportCanvas(settings.exportPxPerCell, {
      grid: settings.grid,
      items: this.editor.drawItems(),
    });
    if (!out) return null;
    const png = await new Promise<Blob | null>((resolve) => out.canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("export failed");
    return { png, frame: out.frame };
  }
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
