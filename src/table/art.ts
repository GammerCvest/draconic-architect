import { buildPath, Command, type Item, type Path, type PathCommand } from "@owlbear-rodeo/sdk";
import { boundarySegments, bounds, subtractShapes, unionShapes, type MultiPolygon, type Pair } from "../geometry";
import { buildWalls } from "../render/pencil";
import { buildShade } from "../render/shade";
import type { MapStyle } from "../style/types";
import { ART } from "./ids";
import { CommandPen } from "./pen";
import { sourceData, sourceShape } from "./source";

const ART_Z = 9e12;
const PAPER_MARGIN = 2;

export function floorOf(sources: Path[], dpi: number): MultiPolygon {
  let floor: MultiPolygon = [];
  for (const s of [...sources].sort((a, b) => a.zIndex - b.zIndex)) {
    if (!s.visible) continue;
    const shape = sourceShape(s, dpi);
    floor = sourceData(s).carve ? subtractShapes(floor, shape) : unionShapes(floor, shape);
  }
  return floor;
}

function art(commands: PathCommand[], z: number) {
  return buildPath()
    .commands(commands)
    .layer("MAP")
    .locked(true)
    .disableHit(true)
    .disableAutoZIndex(true)
    .zIndex(z)
    .name("Draconic Architect")
    .metadata({ [ART]: true });
}

function strokes(pen: CommandPen, color: string, width: number, opacity: number, z: number): Item[] {
  return pen.commands().map((c, i) =>
    art(c, z + i)
      .fillOpacity(0)
      .strokeColor(color)
      .strokeWidth(width)
      .strokeOpacity(opacity)
      .build(),
  );
}

export function buildArt(floor: MultiPolygon, style: MapStyle, dpi: number, fogLines: Pair[][]): Item[] {
  const box = bounds(floor);
  if (!box) return [];
  const items: Item[] = [];
  const pad = style.shade.band + PAPER_MARGIN;

  const paper: PathCommand[] = [
    [Command.MOVE, (box.minX - pad) * dpi, (box.minY - pad) * dpi],
    [Command.LINE, (box.maxX + pad) * dpi, (box.minY - pad) * dpi],
    [Command.LINE, (box.maxX + pad) * dpi, (box.maxY + pad) * dpi],
    [Command.LINE, (box.minX - pad) * dpi, (box.maxY + pad) * dpi],
    [Command.CLOSE],
  ];
  items.push(art(paper, 1).fillColor(style.paper.color).fillOpacity(1).strokeOpacity(0).build());

  const segs = boundarySegments(floor);
  const shade = buildShade({ walls: segs, floor: segs, box, style: style.shade }, () => new CommandPen(dpi));
  const s = style.shade;
  items.push(...strokes(shade.lines as CommandPen, s.color, s.lineWidth * dpi, 0.7, ART_Z));
  for (const c of (shade.dots as CommandPen).commands()) {
    items.push(
      art(c, ART_Z + 100)
        .fillColor(s.color)
        .fillOpacity(0.85)
        .strokeOpacity(0)
        .build(),
    );
  }

  const runs = floor.flatMap((poly) => poly.map((ring) => ({ points: ring, closed: true })));
  const w = style.walls;
  buildWalls(runs, w, () => new CommandPen(dpi)).forEach((pass, i) => {
    items.push(
      ...strokes(pass.path as CommandPen, w.color, w.width * dpi * pass.width, pass.alpha, ART_Z + 200 + i * 50),
    );
  });

  for (const line of fogLines) {
    const commands: PathCommand[] = line.map(([x, y], i) => [i === 0 ? Command.MOVE : Command.LINE, x * dpi, y * dpi]);
    items.push(
      buildPath()
        .commands(commands)
        .layer("FOG")
        .fillOpacity(0)
        .strokeColor("#000000")
        .strokeOpacity(1)
        .strokeWidth(2)
        .locked(true)
        .disableHit(true)
        .name("Wall")
        .metadata({ [ART]: true })
        .build(),
    );
  }
  return items;
}
