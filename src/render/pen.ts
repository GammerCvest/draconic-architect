/** The part of Path2D the mark generators draw with, so they can also feed other targets. */
export interface Pen {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
}

export type PenFactory = () => Pen;

export const canvasPen: PenFactory = () => new Path2D();
