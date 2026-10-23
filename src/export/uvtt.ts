import type { MultiPolygon } from "../geometry";

export interface ExportFrame {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  pxPerCell: number;
}

export function wallLines(floor: MultiPolygon): { x: number; y: number }[][] {
  const lines: { x: number; y: number }[][] = [];
  for (const poly of floor) {
    for (const ring of poly) {
      const pts = ring.map(([x, y]) => ({ x, y }));
      pts.push({ ...pts[0] });
      lines.push(pts);
    }
  }
  return lines;
}

export async function buildUvtt(png: Blob, floor: MultiPolygon, frame: ExportFrame): Promise<Blob> {
  const image = await blobToBase64(png);
  const toFrame = (p: { x: number; y: number }) => ({ x: p.x - frame.originX, y: p.y - frame.originY });
  const data = {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: frame.cols, y: frame.rows },
      pixels_per_grid: frame.pxPerCell,
    },
    line_of_sight: wallLines(floor).map((line) => line.map(toFrame)),
    objects_line_of_sight: [],
    portals: [],
    environment: { baked_lighting: false, ambient_light: "ffffffff" },
    lights: [],
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
