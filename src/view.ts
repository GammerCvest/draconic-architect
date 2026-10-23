import type { Vec } from "./geometry";

const MIN_ZOOM = 8;
const MAX_ZOOM = 220;

export class View {
  zoom = 48;
  ox = 0;
  oy = 0;

  toWorld(sx: number, sy: number): Vec {
    return { x: (sx - this.ox) / this.zoom, y: (sy - this.oy) / this.zoom };
  }

  toScreen(wx: number, wy: number): Vec {
    return { x: wx * this.zoom + this.ox, y: wy * this.zoom + this.oy };
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    this.ox = sx - before.x * this.zoom;
    this.oy = sy - before.y * this.zoom;
  }
}
