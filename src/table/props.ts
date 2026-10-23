import { buildImage, type Image } from "@owlbear-rodeo/sdk";
import type { Pair } from "../geometry";
import { CATALOG } from "../items/catalog";
import { builtinSrc } from "../items/resolve";
import type { CatalogItem } from "../items/types";
import { id } from "./ids";

export const PROP = id("prop");

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function catalogItem(itemId: string): CatalogItem | undefined {
  return byId.get(itemId);
}

/**
 * A catalogue picture placed by its top-left, top-right and bottom-left corners in grid cells,
 * so the editor's turns, flips and resizes carry over.
 */
export function buildProp(item: CatalogItem, corners: [Pair, Pair, Pair], dpi: number, name: string): Image {
  const [p0, p1, p3] = corners;
  const ux = p1[0] - p0[0];
  const uy = p1[1] - p0[1];
  const vx = p3[0] - p0[0];
  const vy = p3[1] - p0[1];
  const width = Math.hypot(ux, uy);
  const height = Math.hypot(vx, vy);
  const mirrored = ux * vy - uy * vx < 0;
  const url = new URL(builtinSrc(item), location.href).href;
  return buildImage(
    { url, mime: "image/png", width: item.px[0], height: item.px[1] },
    { dpi: item.px[0] / item.w, offset: { x: 0, y: 0 } },
  )
    .position({ x: p0[0] * dpi, y: p0[1] * dpi })
    .rotation((Math.atan2(uy, ux) * 180) / Math.PI)
    .scale({ x: width / item.w, y: (mirrored ? -1 : 1) * (height / item.h) })
    .layer("PROP")
    .name(name)
    .metadata({ [PROP]: item.id })
    .build();
}

/** The picture centred on `at` (grid cells), its corner on the grid. */
export function propAt(item: CatalogItem, at: { x: number; y: number }, dpi: number, name: string): Image {
  const x = Math.round(at.x - item.w / 2);
  const y = Math.round(at.y - item.h / 2);
  return buildProp(
    item,
    [
      [x, y],
      [x + item.w, y],
      [x, y + item.h],
    ],
    dpi,
    name,
  );
}
