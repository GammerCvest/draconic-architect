import { Command, type PathCommand } from "@owlbear-rodeo/sdk";
import type { Pen } from "../render/pen";

const MAX_SEGMENTS = 400;

export class CommandPen implements Pen {
  readonly chunks: PathCommand[][] = [[]];
  private segments = 0;

  constructor(private scale: number) {}

  private get current() {
    return this.chunks[this.chunks.length - 1];
  }

  moveTo(x: number, y: number) {
    if (this.segments >= MAX_SEGMENTS) {
      this.chunks.push([]);
      this.segments = 0;
    }
    this.current.push([Command.MOVE, x * this.scale, y * this.scale]);
  }

  lineTo(x: number, y: number) {
    this.current.push([Command.LINE, x * this.scale, y * this.scale]);
    this.segments++;
  }

  closePath() {
    this.current.push([Command.CLOSE]);
  }

  arc(x: number, y: number, radius: number) {
    this.moveTo(x - radius, y);
    this.lineTo(x, y - radius);
    this.lineTo(x + radius, y);
    this.lineTo(x, y + radius);
    this.closePath();
  }

  commands(): PathCommand[][] {
    return this.chunks.filter((c) => c.length > 0);
  }
}
