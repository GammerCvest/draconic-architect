import OBR, {
  buildPath,
  Command,
  type Path,
  type PathCommand,
  type ToolContext,
  type ToolEvent,
  type Vector2,
} from "@owlbear-rodeo/sdk";
import { rectPolygon, unionShapes, type MultiPolygon, type Polygon } from "../geometry";
import { lang, t } from "../i18n";
import { ACTION_CARVE, id, ITEMS_POPOVER, MODE_BRUSH, MODE_ITEM, MODE_POLYGON, MODE_RECT, TOOL } from "./ids";
import { catalogItem, propAt } from "./props";
import { sceneStyle } from "./reconcile";
import { featureModes, registerFeatureMenus, registerPlayerTool } from "./modes";
import { buildSource } from "./source";

export const icon = (name: string) => `${import.meta.env.BASE_URL}tools/${name}.svg`;
const PREVIEW = id("preview");
const ADD = "#3b6ea8";
const CARVE = "#b0413e";

function carving(context: ToolContext, event?: { ctrlKey: boolean }) {
  return Boolean(context.metadata.carve) !== Boolean(event?.ctrlKey);
}

export async function cellPoint(event: ToolEvent, dpi: number): Promise<Vector2> {
  const p = event.pointerPosition;
  if (event.shiftKey) return { x: p.x / dpi, y: p.y / dpi };
  return { x: Math.round(p.x / dpi), y: Math.round(p.y / dpi) };
}

function commandsOf(shape: MultiPolygon, dpi: number, close = true): PathCommand[] {
  const out: PathCommand[] = [];
  for (const poly of shape) {
    for (const ring of poly) {
      ring.forEach(([x, y], i) => out.push([i === 0 ? Command.MOVE : Command.LINE, x * dpi, y * dpi]));
      if (close) out.push([Command.CLOSE]);
    }
  }
  return out;
}

let previewShown = false;
export async function showPreview(commands: PathCommand[], carve: boolean) {
  const color = carve ? CARVE : ADD;
  if (previewShown) {
    await OBR.scene.local.updateItems<Path>(
      [PREVIEW],
      (d) =>
        d.forEach((p) => {
          p.commands = commands;
          p.style.strokeColor = color;
          p.style.fillColor = color;
        }),
      true,
    );
    return;
  }
  const preview = buildPath()
    .id(PREVIEW)
    .commands(commands)
    .fillColor(color)
    .fillOpacity(0.15)
    .strokeColor(color)
    .strokeWidth(3)
    .strokeDash([12, 8])
    .layer("DRAWING")
    .disableHit(true)
    .build();
  previewShown = true;
  await OBR.scene.local.addItems([preview]);
}

export async function hidePreview() {
  if (!previewShown) return;
  previewShown = false;
  await OBR.scene.local.deleteItems([PREVIEW]);
}

async function commit(shape: MultiPolygon, carve: boolean) {
  const normalized = unionShapes([], shape);
  if (normalized.length === 0) return;
  const [dpi, style] = await Promise.all([OBR.scene.grid.getDpi(), sceneStyle()]);
  const name = t(carve ? "defaultCarve" : "defaultFloor");
  await OBR.scene.items.addItems([buildSource(normalized, carve, dpi, style, name)]);
}

function rectMode() {
  let dpi = 150;
  let start: Vector2 | null = null;
  let end: Vector2 | null = null;
  let carve = false;
  const shape = (): MultiPolygon => (start && end ? [rectPolygon(start.x, start.y, end.x, end.y)] : []);
  return OBR.tool.createMode({
    id: MODE_RECT,
    icons: [{ icon: icon("rect"), label: t("toolRect"), filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onToolDragStart(context, event) {
      dpi = await OBR.scene.grid.getDpi();
      start = end = await cellPoint(event, dpi);
      carve = carving(context, event);
    },
    async onToolDragMove(context, event) {
      if (!start) return;
      end = await cellPoint(event, dpi);
      carve = carving(context, event);
      await showPreview(commandsOf(shape(), dpi), carve);
    },
    async onToolDragEnd() {
      const s = shape();
      start = end = null;
      await hidePreview();
      const box = s[0]?.[0];
      if (box && box[0][0] !== box[1][0] && box[1][1] !== box[2][1]) await commit(s, carve);
    },
    async onToolDragCancel() {
      start = end = null;
      await hidePreview();
    },
  });
}

function polygonMode() {
  let points: Vector2[] = [];
  let hover: Vector2 | null = null;
  let carve = false;
  const draw = async () => {
    const dpi = await OBR.scene.grid.getDpi();
    const pts = hover ? [...points, hover] : points;
    if (pts.length === 0) return hidePreview();
    await showPreview(commandsOf([[pts.map((p) => [p.x, p.y] as [number, number])]], dpi), carve);
  };
  const finish = async () => {
    const pts = points;
    points = [];
    hover = null;
    await hidePreview();
    if (pts.length >= 3) await commit([[pts.map((p) => [p.x, p.y] as [number, number])]], carve);
  };
  return OBR.tool.createMode({
    id: MODE_POLYGON,
    icons: [{ icon: icon("polygon"), label: t("toolPolygon"), filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onToolClick(context, event) {
      const dpi = await OBR.scene.grid.getDpi();
      const p = await cellPoint(event, dpi);
      carve = carving(context, event);
      const first = points[0];
      if (points.length >= 3 && first && Math.hypot(p.x - first.x, p.y - first.y) < 0.2) {
        await finish();
        return;
      }
      const last = points[points.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) points.push(p);
      await draw();
    },
    async onToolDoubleClick() {
      await finish();
    },
    async onToolMove(_context, event) {
      if (points.length === 0) return;
      hover = await cellPoint(event, await OBR.scene.grid.getDpi());
      await draw();
    },
    async onKeyDown(_context, event) {
      if (event.key === "Enter") await finish();
      else if (event.key === "Escape") {
        points = [];
        hover = null;
        await hidePreview();
      } else if (event.key === "Backspace") {
        points.pop();
        await draw();
      }
    },
    async onDeactivate() {
      points = [];
      hover = null;
      await hidePreview();
    },
  });
}

function brushMode() {
  let dpi = 150;
  const cells = new Set<string>();
  let carve = false;
  const shape = (): Polygon[] =>
    [...cells].map((key) => {
      const [x, y] = key.split(",").map(Number);
      return rectPolygon(x, y, x + 1, y + 1);
    });
  const paint = async (event: ToolEvent) => {
    const p = event.pointerPosition;
    cells.add(`${Math.floor(p.x / dpi)},${Math.floor(p.y / dpi)}`);
    await showPreview(commandsOf(unionShapes([], shape()), dpi), carve);
  };
  return OBR.tool.createMode({
    id: MODE_BRUSH,
    icons: [{ icon: icon("brush"), label: t("toolBrush"), filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onToolDragStart(context, event) {
      dpi = await OBR.scene.grid.getDpi();
      cells.clear();
      carve = carving(context, event);
      await paint(event);
    },
    async onToolDragMove(_context, event) {
      await paint(event);
    },
    async onToolDragEnd() {
      const s = shape();
      cells.clear();
      await hidePreview();
      await commit(unionShapes([], s), carve);
    },
    async onToolDragCancel() {
      cells.clear();
      await hidePreview();
    },
  });
}

const GHOST = id("ghost");

function itemMode() {
  let ghost = false;
  const clearGhost = async () => {
    if (!ghost) return;
    ghost = false;
    await OBR.scene.local.deleteItems([GHOST]);
  };
  return OBR.tool.createMode({
    id: MODE_ITEM,
    icons: [{ icon: icon("item"), label: t("toolItem"), filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onActivate() {
      await OBR.popover.open({
        id: ITEMS_POPOVER,
        url: `${import.meta.env.BASE_URL}items.html`,
        width: 320,
        height: 520,
        anchorReference: "POSITION",
        anchorPosition: { left: 80, top: 80 },
        anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
        transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
        disableClickAway: true,
      });
    },
    async onDeactivate() {
      await clearGhost();
      await OBR.popover.close(ITEMS_POPOVER);
    },
    async onToolMove(context, event) {
      const item = catalogItem(String(context.metadata.item ?? ""));
      if (!item) return clearGhost();
      const dpi = await OBR.scene.grid.getDpi();
      const preview = propAt(item, { x: event.pointerPosition.x / dpi, y: event.pointerPosition.y / dpi }, dpi, "");
      if (ghost) {
        await OBR.scene.local.updateItems([GHOST], (d) => d.forEach((g) => (g.position = preview.position)), true);
      } else {
        ghost = true;
        await OBR.scene.local.addItems([{ ...preview, id: GHOST, disableHit: true }]);
      }
    },
    async onToolClick(context, event) {
      const item = catalogItem(String(context.metadata.item ?? ""));
      if (!item) return;
      const dpi = await OBR.scene.grid.getDpi();
      const name = item.name[lang()];
      const at = { x: event.pointerPosition.x / dpi, y: event.pointerPosition.y / dpi };
      await OBR.scene.items.addItems([propAt(item, at, dpi, name)]);
    },
    async onKeyDown(_context, event) {
      if (event.key === "Escape") {
        await clearGhost();
        await OBR.tool.setMetadata(TOOL, { item: null });
      }
    },
  });
}

export async function registerTools() {
  await OBR.tool.create({
    id: TOOL,
    icons: [{ icon: icon("architect"), label: t("appName"), filter: { roles: ["GM"] } }],
    defaultMode: MODE_RECT,
    defaultMetadata: {
      carve: false,
      newDoorsPlayers: false,
      barrierType: "window",
      barrierBlocks: false,
      lightPreset: "torch",
      newLightsLit: true,
    },
  });
  await Promise.all([rectMode(), polygonMode(), brushMode(), itemMode(), ...featureModes()]);
  await OBR.tool.createAction({
    id: ACTION_CARVE,
    icons: [
      {
        icon: icon("floor"),
        label: t("tableCarveOff"),
        filter: { activeTools: [TOOL], metadata: [{ key: "carve", value: true, operator: "!=" }] },
      },
      {
        icon: icon("carve"),
        label: t("tableCarveOn"),
        filter: { activeTools: [TOOL], metadata: [{ key: "carve", value: true }] },
      },
    ],
    async onClick(context) {
      await OBR.tool.setMetadata(TOOL, { carve: !context.metadata.carve });
    },
  });
  await registerPlayerTool();
  await registerFeatureMenus();
}
