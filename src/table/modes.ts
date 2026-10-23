import OBR, { buildImage, Command, isImage, type ToolEvent, type Vector2 } from "@owlbear-rodeo/sdk";
import { distToSegment, wallSlot, type Pair } from "../geometry";
import { t } from "../i18n";
import { presetLight, type LightPreset } from "../light";
import { floorOf } from "./art";
import { buildBarrier, buildDoor, doorData, isDoor, segmentOf, setDoorOpen } from "./features";
import {
  BARRIER,
  BLOCKS,
  DOOR,
  DOOR_CHANNEL,
  DYNAMIC_FOG_LIGHT,
  ITEMS_POPOVER,
  LIGHT,
  MODE_BARRIER,
  MODE_DOOR,
  MODE_LIGHT,
  MODE_PLAYER_DOOR,
  PLAYER_TOOL,
  TOOL,
  id,
  type BarrierData,
  type DoorData,
} from "./ids";
import { catalogItem, propAt } from "./props";
import { sceneStyle } from "./reconcile";
import { isSource } from "./source";
import { cellPoint, hidePreview, icon, showPreview } from "./tools";

const BARRIER_NAMES = {
  window: "barrierWindow",
  bars: "barrierBars",
  curtain: "barrierCurtain",
  bushes: "barrierBushes",
  crayon: "barrierCrayon",
} as const;

const LIGHT_NAMES = {
  torch: "lightTorch",
  candle: "lightCandle",
  brazier: "lightBrazier",
  campfire: "lightCampfire",
  lantern: "lightLantern",
} as const;

async function openOptions(mode: string, height: number) {
  await OBR.popover.open({
    id: ITEMS_POPOVER,
    url: `${import.meta.env.BASE_URL}items.html?mode=${mode}`,
    width: 300,
    height,
    anchorReference: "POSITION",
    anchorPosition: { left: 80, top: 80 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    disableClickAway: true,
  });
}

async function nearestDoor(at: Vector2, dpi: number) {
  const doors = await OBR.scene.items.getItems(isDoor);
  let best: { id: string; data: DoorData } | null = null;
  let bestD = 0.6;
  for (const d of doors) {
    const data = doorData(d);
    const [a, b] = segmentOf(d, data.length, dpi);
    const dist = distToSegment(at.x, at.y, { ax: a[0], ay: a[1], bx: b[0], by: b[1] });
    if (dist < bestD) {
      bestD = dist;
      best = { id: d.id, data };
    }
  }
  return best;
}

async function slotAt(at: Vector2, dpi: number): Promise<[Pair, Pair] | null> {
  const sources = await OBR.scene.items.getItems(isSource);
  return wallSlot(floorOf(sources, dpi), at);
}

function segmentMode(
  modeId: string,
  iconName: string,
  label: string,
  options: [string, number],
  create: (a: Pair, b: Pair, metadata: Record<string, unknown>, dpi: number) => Promise<void>,
  click?: (at: Vector2, dpi: number) => Promise<boolean>,
) {
  let dpi = 150;
  let start: Vector2 | null = null;
  let end: Vector2 | null = null;
  const line = () =>
    start && end
      ? [
          [Command.MOVE, start.x * dpi, start.y * dpi] as [Command.MOVE, number, number],
          [Command.LINE, end.x * dpi, end.y * dpi] as [Command.LINE, number, number],
        ]
      : [];
  return OBR.tool.createMode({
    id: modeId,
    icons: [{ icon: icon(iconName), label, filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onActivate() {
      await openOptions(...options);
    },
    async onDeactivate() {
      await hidePreview();
      await OBR.popover.close(ITEMS_POPOVER);
    },
    async onToolClick(context, event: ToolEvent) {
      dpi = await OBR.scene.grid.getDpi();
      const at = { x: event.pointerPosition.x / dpi, y: event.pointerPosition.y / dpi };
      if (click && (await click(at, dpi))) return;
      const slot = await slotAt(at, dpi);
      if (slot) await create(slot[0], slot[1], context.metadata, dpi);
    },
    async onToolDragStart(_context, event) {
      dpi = await OBR.scene.grid.getDpi();
      start = end = await cellPoint(event, dpi);
    },
    async onToolDragMove(_context, event) {
      if (!start) return;
      end = await cellPoint(event, dpi);
      await showPreview(line(), false);
    },
    async onToolDragEnd(context) {
      const [s, e] = [start, end];
      start = end = null;
      await hidePreview();
      if (s && e && Math.hypot(e.x - s.x, e.y - s.y) >= 0.3)
        await create([s.x, s.y], [e.x, e.y], context.metadata, dpi);
    },
    async onToolDragCancel() {
      start = end = null;
      await hidePreview();
    },
  });
}

function lightMode() {
  return OBR.tool.createMode({
    id: MODE_LIGHT,
    icons: [{ icon: icon("light"), label: t("toolLight"), filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onActivate() {
      await openOptions("light", 300);
    },
    async onDeactivate() {
      await OBR.popover.close(ITEMS_POPOVER);
    },
    async onToolClick(context, event) {
      const preset = (context.metadata.lightPreset as LightPreset) ?? "torch";
      const light = presetLight(preset, context.metadata.newLightsLit !== false);
      if (event.target && isImage(event.target) && !event.target.locked) {
        await OBR.scene.items.updateItems([event.target.id], (d) => d.forEach((i) => (i.metadata[LIGHT] = light)));
        return;
      }
      const symbol = catalogItem("classic/light");
      if (!symbol) return;
      const dpi = await OBR.scene.grid.getDpi();
      const at = { x: event.pointerPosition.x / dpi, y: event.pointerPosition.y / dpi };
      const prop = propAt(symbol, at, dpi, t(LIGHT_NAMES[preset]));
      const half = 0.25;
      const x = Math.round(at.x * 2) / 2;
      const y = Math.round(at.y * 2) / 2;
      const item = buildImage(prop.image, prop.grid)
        .position({ x: (x - half) * dpi, y: (y - half) * dpi })
        .scale({ x: 0.5, y: 0.5 })
        .layer("PROP")
        .name(prop.name)
        .metadata({ [LIGHT]: light })
        .build();
      await OBR.scene.items.addItems([item]);
    },
  });
}

export function featureModes() {
  return [
    segmentMode(
      MODE_DOOR,
      "door",
      t("toolDoor"),
      ["door", 150],
      async (a, b, metadata, dpi) => {
        const style = await sceneStyle();
        await OBR.scene.items.addItems([
          buildDoor(a, b, false, metadata.newDoorsPlayers === true, dpi, style, t("defaultDoor")),
        ]);
      },
      async (at, dpi) => {
        const door = await nearestDoor(at, dpi);
        if (!door) return false;
        await setDoorOpen(door.id, !door.data.open);
        return true;
      },
    ),
    segmentMode(MODE_BARRIER, "window", t("toolBarrier"), ["barrier", 230], async (a, b, metadata, dpi) => {
      const style = await sceneStyle();
      const type = (metadata.barrierType as BarrierData["type"]) ?? "window";
      const data = { type, blocks: metadata.barrierBlocks === true, color: "#c0392b" };
      await OBR.scene.items.addItems([buildBarrier(a, b, data, dpi, style, t(BARRIER_NAMES[type]))]);
    }),
    lightMode(),
  ];
}

export async function registerPlayerTool() {
  await OBR.tool.create({
    id: PLAYER_TOOL,
    icons: [{ icon: icon("door"), label: t("toolDoor"), filter: { roles: ["PLAYER"] } }],
    defaultMode: MODE_PLAYER_DOOR,
  });
  await OBR.tool.createMode({
    id: MODE_PLAYER_DOOR,
    icons: [{ icon: icon("door"), label: t("toolDoor"), filter: { activeTools: [PLAYER_TOOL] } }],
    cursors: [{ cursor: "pointer" }],
    async onToolClick(_context, event) {
      const dpi = await OBR.scene.grid.getDpi();
      const door = await nearestDoor({ x: event.pointerPosition.x / dpi, y: event.pointerPosition.y / dpi }, dpi);
      if (!door) return;
      if (!door.data.players) {
        await OBR.notification.show(t("doorLocked"), "WARNING");
        return;
      }
      await OBR.broadcast.sendMessage(DOOR_CHANNEL, { id: door.id }, { destination: "REMOTE" });
    },
  });
}

export function listenForPlayerDoors(isLeader: () => Promise<boolean>) {
  OBR.broadcast.onMessage(DOOR_CHANNEL, async (event) => {
    if (!(await isLeader())) return;
    const doorId = (event.data as { id?: string })?.id;
    if (!doorId) return;
    const [door] = await OBR.scene.items.getItems([doorId]);
    if (!door || !isDoor(door) || !doorData(door).players) return;
    await setDoorOpen(door.id, !doorData(door).open);
  });
}

function menu(
  key: string,
  icons: { icon: string; label: string; every: { key: string | string[]; value: unknown; operator?: "==" | "!=" }[] }[],
  onClick: (ids: string[], first: Record<string, unknown>) => Promise<void>,
) {
  return OBR.contextMenu.create({
    id: id(`menu-${key}`),
    icons: icons.map((i) => ({ icon: icon(i.icon), label: i.label, filter: { roles: ["GM"], every: i.every } })),
    async onClick(context) {
      const ids = context.items.map((i) => i.id);
      await onClick(ids, context.items[0]?.metadata ?? {});
    },
  });
}

export async function registerFeatureMenus() {
  const open = (v: boolean) => ({ key: ["metadata", DOOR, "open"], value: v });
  await menu(
    "door-open",
    [
      { icon: "door-open", label: t("ctxOpen"), every: [open(false)] },
      { icon: "door", label: t("ctxClose"), every: [open(true)] },
    ],
    async (ids, first) => {
      const next = !(first[DOOR] as DoorData).open;
      for (const doorId of ids) await setDoorOpen(doorId, next);
    },
  );
  const players = (v: boolean) => ({ key: ["metadata", DOOR, "players"], value: v });
  await menu(
    "door-players",
    [
      { icon: "players", label: t("ctxPlayersOn"), every: [players(false)] },
      { icon: "players-off", label: t("ctxPlayersOff"), every: [players(true)] },
    ],
    async (ids, first) => {
      const next = !(first[DOOR] as DoorData).players;
      await OBR.scene.items.updateItems(ids, (d) =>
        d.forEach((i) => (i.metadata[DOOR] = { ...(i.metadata[DOOR] as DoorData), players: next })),
      );
    },
  );
  const blocks = (v: boolean) => ({ key: ["metadata", BARRIER, "blocks"], value: v });
  await menu(
    "barrier-sight",
    [
      { icon: "eye-off", label: t("ctxBlocksSight"), every: [blocks(false)] },
      { icon: "eye", label: t("ctxPassesSight"), every: [blocks(true)] },
    ],
    async (ids, first) => {
      const next = !(first[BARRIER] as BarrierData).blocks;
      await OBR.scene.items.updateItems(ids, (d) =>
        d.forEach((i) => (i.metadata[BARRIER] = { ...(i.metadata[BARRIER] as BarrierData), blocks: next })),
      );
    },
  );
  const image = { key: "type", value: "IMAGE" };
  await menu(
    "blocks-light",
    [
      {
        icon: "block",
        label: t("ctxBlockLight"),
        every: [image, { key: ["metadata", BLOCKS], value: true, operator: "!=" }],
      },
      { icon: "unblock", label: t("ctxUnblockLight"), every: [image, { key: ["metadata", BLOCKS], value: true }] },
    ],
    async (ids, first) => {
      const next = first[BLOCKS] !== true;
      await OBR.scene.items.updateItems(ids, (d) => d.forEach((i) => (i.metadata[BLOCKS] = next)));
    },
  );
  const lit = (v: boolean) => ({ key: ["metadata", LIGHT, "lit"], value: v });
  await menu(
    "light",
    [
      { icon: "light", label: t("ctxAddLight"), every: [image, { key: ["metadata", LIGHT], value: undefined }] },
      { icon: "light", label: t("ctxLightOn"), every: [lit(false)] },
      { icon: "light-off", label: t("ctxLightOff"), every: [lit(true)] },
    ],
    async (ids, first) => {
      const current = first[LIGHT] as { lit: boolean } | undefined;
      await OBR.scene.items.updateItems(ids, (d) =>
        d.forEach((i) => {
          i.metadata[LIGHT] = current ? { ...(i.metadata[LIGHT] as object), lit: !current.lit } : presetLight("torch");
        }),
      );
    },
  );
  await menu(
    "light-remove",
    [
      {
        icon: "light-off",
        label: t("ctxRemoveLight"),
        every: [{ key: ["metadata", LIGHT], value: undefined, operator: "!=" }],
      },
    ],
    async (ids) => {
      await OBR.scene.items.updateItems(ids, (d) =>
        d.forEach((i) => {
          delete i.metadata[LIGHT];
          delete i.metadata[DYNAMIC_FOG_LIGHT];
        }),
      );
    },
  );
}
