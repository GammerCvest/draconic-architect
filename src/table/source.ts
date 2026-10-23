import { buildPath, Command, isPath, type Item, type Path, type PathCommand } from "@owlbear-rodeo/sdk";
import { bounds, xorRings, type MultiPolygon, type Pair, type Ring } from "../geometry";
import type { MapStyle } from "../style/types";
import { SOURCE, type SourceData } from "./ids";

export function isSource(item: Item): item is Path {
  return isPath(item) && SOURCE in item.metadata;
}

export function sourceData(item: Path): SourceData {
  const data = item.metadata[SOURCE] as Partial<SourceData> | undefined;
  return { carve: Boolean(data?.carve) };
}

// Owlbear places a point at position + rotate(scale * local)
function toWorld(item: Item, x: number, y: number): Pair {
  const sx = x * item.scale.x;
  const sy = y * item.scale.y;
  const a = (item.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [item.position.x + sx * c - sy * s, item.position.y + sx * s + sy * c];
}

/** The source's area in grid cells. Paths may hold several rings, read with the even-odd rule. */
export function sourceShape(item: Path, dpi: number): MultiPolygon {
  const rings: Ring[] = [];
  let ring: Ring = [];
  const flush = () => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  for (const cmd of item.commands) {
    if (cmd[0] === Command.MOVE) {
      flush();
      ring.push(scaled(toWorld(item, cmd[1], cmd[2]), dpi));
    } else if (cmd[0] === Command.LINE) {
      ring.push(scaled(toWorld(item, cmd[1], cmd[2]), dpi));
    } else if (cmd[0] === Command.CLOSE) {
      flush();
    }
  }
  flush();
  return xorRings(rings);
}

function scaled([x, y]: Pair, dpi: number): Pair {
  return [x / dpi, y / dpi];
}

export function sourceFill(style: MapStyle, carve: boolean) {
  return carve ? style.paper.color : style.floor.color;
}

/** A new source item drawing `shape` (grid cells), placed at its top-left corner. */
export function buildSource(shape: MultiPolygon, carve: boolean, dpi: number, style: MapStyle, name: string): Path {
  const box = bounds(shape)!;
  const ox = box.minX * dpi;
  const oy = box.minY * dpi;
  const commands: PathCommand[] = [];
  for (const poly of shape) {
    for (const ring of poly) {
      ring.forEach(([x, y], i) => commands.push([i === 0 ? Command.MOVE : Command.LINE, x * dpi - ox, y * dpi - oy]));
      commands.push([Command.CLOSE]);
    }
  }
  return buildPath()
    .commands(commands)
    .fillRule("evenodd")
    .fillColor(sourceFill(style, carve))
    .fillOpacity(1)
    .strokeOpacity(0)
    .strokeWidth(0)
    .position({ x: ox, y: oy })
    .layer("MAP")
    .name(name)
    .metadata({ [SOURCE]: { carve } satisfies SourceData })
    .build();
}
