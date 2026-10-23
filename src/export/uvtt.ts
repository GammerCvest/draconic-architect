import type { Fog } from "../fog";
import type { Pair } from "../geometry";
import type { LightData } from "../light";

export interface ExportFrame {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  pxPerCell: number;
}

export interface MapLight {
  x: number;
  y: number;
  light: LightData;
}

export interface MapFeatures {
  fog: Fog | null;
  lights: MapLight[];
}

export async function buildUvtt(png: Blob, features: MapFeatures, frame: ExportFrame): Promise<Blob> {
  const image = await blobToBase64(png);
  const toFrame = ([x, y]: Pair) => ({ x: x - frame.originX, y: y - frame.originY });
  const fog = features.fog;
  const data = {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: frame.cols, y: frame.rows },
      pixels_per_grid: frame.pxPerCell,
    },
    line_of_sight: fog ? fog.walls.map((line) => line.map(toFrame)) : [],
    objects_line_of_sight: [],
    portals: (fog?.doors ?? []).map((d) => ({
      position: toFrame([(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2]),
      bounds: [toFrame(d.a), toFrame(d.b)],
      rotation: Math.atan2(d.b[1] - d.a[1], d.b[0] - d.a[0]),
      closed: !d.open,
      freestanding: false,
    })),
    environment: { baked_lighting: false, ambient_light: "ffffffff" },
    lights: features.lights
      .filter((l) => l.light.lit)
      .map((l) => ({
        position: toFrame([l.x, l.y]),
        range: l.light.range,
        intensity: l.light.dim ? 0.5 : 1,
        color: "ffffd9a0",
        shadows: true,
      })),
    image,
  };
  return new Blob([JSON.stringify(data)], { type: "application/json" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
