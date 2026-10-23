export type ImageSrc = string;

export interface PaperStyle {
  color: string;
  grain: number;
  texture: ImageSrc | null;
  textureScale: number; // cells per tile
}

export interface FloorStyle {
  color: string;
  texture: ImageSrc | null;
  textureScale: number; // cells per tile
  textureOpacity: number;
}

export type WallKind = "sketch" | "pencil" | "ink" | "none";

export interface WallStyle {
  kind: WallKind;
  color: string;
  width: number; // cells
  wobble: number; // cells
  overshoot: number; // cells
  passes: number;
}

export type ShadeKind = "diagonal" | "crosshatch" | "clusters" | "stipple" | "contours" | "stamps" | "none";

export interface ShadeStyle {
  kind: ShadeKind;
  color: string;
  band: number; // cells
  density: number;
  angle: number;
  lineWidth: number; // cells
  smudge: number;
  stamps: ImageSrc[];
  stampSize: number; // cells
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
