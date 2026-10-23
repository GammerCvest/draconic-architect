export type ImageSrc = string;

export interface PaperStyle {
  color: string;
  grain: number;
  texture: ImageSrc | null;
  textureScale: number;
}

export interface FloorStyle {
  color: string;
  texture: ImageSrc | null;
  textureScale: number;
  textureOpacity: number;
}

export type WallKind = "sketch" | "pencil" | "ink" | "none";

export interface WallStyle {
  kind: WallKind;
  color: string;
  width: number;
  wobble: number;
  overshoot: number;
  passes: number;
}

export type ShadeKind = "diagonal" | "crosshatch" | "clusters" | "stipple" | "contours" | "stamps" | "none";

export interface ShadeStyle {
  kind: ShadeKind;
  color: string;
  band: number;
  density: number;
  angle: number;
  lineWidth: number;
  smudge: number;
  stamps: ImageSrc[];
  stampSize: number;
}

export type GridKind = "lines" | "dots" | "none";

export interface GridStyle {
  kind: GridKind;
  color: string;
  opacity: number;
}

export interface MapStyle {
  id: string;
  name: string;
  paper: PaperStyle;
  floor: FloorStyle;
  walls: WallStyle;
  shade: ShadeStyle;
  grid: GridStyle;
}

export const STYLE_FILE_KIND = "draconic-architect-style";
