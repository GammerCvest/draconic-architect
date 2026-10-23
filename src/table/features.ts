import OBR, {
  buildPath,
  Command,
  isImage,
  isPath,
  type Image,
  type Item,
  type Path,
  type PathCommand,
} from "@owlbear-rodeo/sdk";
import type { Pair, Ring } from "../geometry";
import type { MapStyle } from "../style/types";
import { BARRIER, BLOCKS, DOOR, type BarrierData, type DoorData } from "./ids";

const THICK = 0.12;

function local(item: Item, x: number, y: number): Pair {
  const sx = x * item.scale.x;
  const sy = y * item.scale.y;
  const a = (item.rotation * Math.PI) / 180;
  return [item.position.x + sx * Math.cos(a) - sy * Math.sin(a), item.position.y + sx * Math.sin(a) + sy * Math.cos(a)];
}

export function isDoor(item: Item): item is Path {
  return isPath(item) && DOOR in item.metadata;
}

export function isBarrier(item: Item): item is Path {
  return isPath(item) && BARRIER in item.metadata;
}

export function doorData(item: Item): DoorData {
  return item.metadata[DOOR] as DoorData;
}

export function barrierData(item: Item): BarrierData {
  return item.metadata[BARRIER] as BarrierData;
}

export function segmentOf(item: Item, length: number, dpi: number): [Pair, Pair] {
  const a = local(item, 0, 0);
  const b = local(item, length, 0);
  return [
    [a[0] / dpi, a[1] / dpi],
    [b[0] / dpi, b[1] / dpi],
  ];
}

function rect(x0: number, y0: number, x1: number, y1: number): PathCommand[] {
  return [
    [Command.MOVE, x0, y0],
    [Command.LINE, x1, y0],
    [Command.LINE, x1, y1],
    [Command.LINE, x0, y1],
    [Command.CLOSE],
  ];
}

export function doorCommands(length: number, open: boolean, dpi: number): PathCommand[] {
  const t = THICK * dpi;
  if (!open) return rect(0, -t, length, t);
  return [...rect(0, -t, length, t), ...rect(0, 0, t * 0.6, -length)];
}

export function barrierCommands(data: BarrierData, dpi: number): PathCommand[] {
  const len = data.length;
  const out: PathCommand[] = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    out.push([Command.MOVE, x0, y0], [Command.LINE, x1, y1]);
  };
  switch (data.type) {
    case "window":
      out.push(...rect(0, -0.07 * dpi, len, 0.07 * dpi));
      line(0, 0, len, 0);
      break;
    case "bars":
      line(0, 0, len, 0);
      for (let x = 0.09 * dpi; x < len; x += 0.18 * dpi) line(x, -0.11 * dpi, x, 0.11 * dpi);
      break;
    case "curtain":
      for (let x = 0; x <= len; x += 0.02 * dpi) {
        out.push([x === 0 ? Command.MOVE : Command.LINE, x, Math.sin((x / (0.25 * dpi)) * Math.PI * 2) * 0.07 * dpi]);
      }
      break;
    case "bushes": {
      const r = 0.1 * dpi;
      let side = 1;
      for (let c = r; c < len; c += r * 1.8) {
        for (let k = 0; k <= 8; k++) {
          const ang = Math.PI * (k / 8);
          out.push([k === 0 ? Command.MOVE : Command.LINE, c - Math.cos(ang) * r, -side * Math.sin(ang) * r]);
        }
        side = -side;
      }
      break;
    }
    case "crayon":
      line(0, 0, len, 0);
      break;
  }
  return out;
}

function placed(a: Pair, b: Pair, dpi: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * dpi;
  return {
    len,
    position: { x: a[0] * dpi, y: a[1] * dpi },
    rotation: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  };
}

export function buildDoor(
  a: Pair,
  b: Pair,
  open: boolean,
  players: boolean,
  dpi: number,
  style: MapStyle,
  name: string,
) {
  const p = placed(a, b, dpi);
  const data: DoorData = { open, players, length: p.len };
  return buildPath()
    .commands(doorCommands(p.len, open, dpi))
    .position(p.position)
    .rotation(p.rotation)
    .fillColor(style.floor.color)
    .fillOpacity(1)
    .strokeColor(style.walls.color)
    .strokeWidth(0.04 * dpi)
    .layer("PROP")
    .name(name)
    .metadata({ [DOOR]: data })
    .build();
}

export function buildBarrier(
  a: Pair,
  b: Pair,
  data: Omit<BarrierData, "length">,
  dpi: number,
  style: MapStyle,
  name: string,
) {
  const p = placed(a, b, dpi);
  const full: BarrierData = { ...data, length: p.len };
  const crayon = data.type === "crayon";
  return buildPath()
    .commands(barrierCommands(full, dpi))
    .position(p.position)
    .rotation(p.rotation)
    .fillColor(style.floor.color)
    .fillOpacity(data.type === "window" ? 1 : 0)
    .strokeColor(crayon ? data.color : style.walls.color)
    .strokeOpacity(crayon ? 0.7 : 1)
    .strokeWidth((crayon ? 0.11 : 0.035) * dpi)
    .strokeDash(crayon ? [0.22 * dpi, 0.12 * dpi] : [])
    .layer("PROP")
    .name(name)
    .metadata({ [BARRIER]: full })
    .build();
}

export function blocksLight(item: Item): boolean {
  return isImage(item) && item.metadata[BLOCKS] === true;
}

export function imageFrame(item: Image, dpi: number): Ring {
  const k = dpi / item.grid.dpi;
  const ox = -item.grid.offset.x * k;
  const oy = -item.grid.offset.y * k;
  const w = item.image.width * k;
  const h = item.image.height * k;
  return [
    [ox, oy],
    [ox + w, oy],
    [ox + w, oy + h],
    [ox, oy + h],
  ].map(([x, y]) => {
    const p = local(item, x, y);
    return [p[0] / dpi, p[1] / dpi] as Pair;
  });
}

export async function setDoorOpen(id: string, open: boolean) {
  const dpi = await OBR.scene.grid.getDpi();
  await OBR.scene.items.updateItems<Path>([id], (drafts) => {
    for (const d of drafts) {
      const data = d.metadata[DOOR] as DoorData;
      d.metadata[DOOR] = { ...data, open };
      d.commands = doorCommands(data.length, open, dpi);
    }
  });
}
