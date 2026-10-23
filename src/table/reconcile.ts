import OBR, { isImage, type Image, type Item, type Path } from "@owlbear-rodeo/sdk";
import { DEFAULT_STYLE_ID, PRESETS } from "../style/presets";
import type { MapStyle } from "../style/types";
import { buildArt, floorOf } from "./art";
import { computeFog, sightLines } from "../fog";
import { dynamicFogLight, type LightData } from "../light";
import { barrierData, blocksLight, doorData, imageFrame, isBarrier, isDoor, segmentOf } from "./features";
import { ART, DYNAMIC_FOG_LIGHT, FOG_OFF, LIGHT, STYLE } from "./ids";
import { isSource, sourceData, sourceFill } from "./source";

const BATCH = 40;

export async function sceneStyle(): Promise<MapStyle> {
  const id = (await OBR.scene.getMetadata())[STYLE];
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_STYLE_ID)!;
}

export async function isLeader(): Promise<boolean> {
  if ((await OBR.player.getRole()) !== "GM") return false;
  const me = await OBR.player.getConnectionId();
  const others = await OBR.party.getPlayers();
  return !others.some((p) => p.role === "GM" && p.connectionId < me);
}

function signature(items: Item[], style: MapStyle, dpi: number, fogOn: boolean): string {
  const relevant = items.filter((i) => !(ART in i.metadata));
  return JSON.stringify([
    style.id,
    dpi,
    fogOn,
    relevant
      .filter((i) => isSource(i) || isDoor(i) || isBarrier(i) || blocksLight(i) || LIGHT in i.metadata)
      .map((i) => {
        const { [DYNAMIC_FOG_LIGHT]: _ignored, ...metadata } = i.metadata;
        return [i.id, i.zIndex, i.visible, i.position, i.rotation, i.scale, metadata, isPath(i) ? i.commands : 0];
      }),
  ]);
}

function isPath(item: Item): item is Path {
  return item.type === "PATH";
}

async function inBatches(items: Item[], add: (batch: Item[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += BATCH) await add(items.slice(i, i + BATCH));
}

async function syncLights(items: Item[], dpi: number) {
  const changes = new Map<string, unknown>();
  for (const i of items) {
    if (!isImage(i) || !(LIGHT in i.metadata)) continue;
    const light = i.metadata[LIGHT] as LightData;
    const want = light.lit ? dynamicFogLight(light, dpi) : undefined;
    if (JSON.stringify(want) !== JSON.stringify(i.metadata[DYNAMIC_FOG_LIGHT])) changes.set(i.id, want);
  }
  if (changes.size === 0) return;
  await OBR.scene.items.updateItems([...changes.keys()], (drafts) => {
    for (const d of drafts) {
      const want = changes.get(d.id);
      if (want === undefined) delete d.metadata[DYNAMIC_FOG_LIGHT];
      else d.metadata[DYNAMIC_FOG_LIGHT] = want;
    }
  });
}

export function startReconciler() {
  let last = "";
  let timer = 0;
  let running = false;
  let again = false;

  const redraw = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      if (!(await OBR.scene.isReady()) || !(await isLeader())) return;
      const [items, style, dpi] = await Promise.all([
        OBR.scene.items.getItems(),
        sceneStyle(),
        OBR.scene.grid.getDpi(),
      ]);
      const sources = items.filter(isSource);
      const fogOn = (await OBR.scene.getMetadata())[FOG_OFF] !== true;
      const sig = signature(items, style, dpi, fogOn);
      if (sig === last) return;
      last = sig;

      const stale = sources.filter((s) => s.style.fillColor !== sourceFill(style, sourceData(s).carve));
      if (stale.length) {
        await OBR.scene.items.updateItems<Path>(
          stale.map((s) => s.id),
          (drafts) => drafts.forEach((d) => (d.style.fillColor = sourceFill(style, sourceData(d).carve))),
        );
      }
      const recolor = items.filter(
        (i): i is Path =>
          (isDoor(i) || (isBarrier(i) && barrierData(i).type !== "crayon")) &&
          (i.style.fillColor !== style.floor.color || i.style.strokeColor !== style.walls.color),
      );
      if (recolor.length) {
        await OBR.scene.items.updateItems<Path>(
          recolor.map((i) => i.id),
          (drafts) =>
            drafts.forEach((d) => {
              d.style.fillColor = style.floor.color;
              d.style.strokeColor = style.walls.color;
            }),
        );
      }
      await syncLights(items, dpi);

      const floor = floorOf(sources, dpi);
      const doors = items.filter((i) => isDoor(i) && i.visible);
      const barriers = items.filter((i) => isBarrier(i) && i.visible);
      const fog = computeFog({
        floor,
        doors: doors.map((d) => {
          const data = doorData(d);
          const [a, b] = segmentOf(d, data.length, dpi);
          return { a, b, open: data.open };
        }),
        barriers: barriers.map((w) => {
          const data = barrierData(w);
          const [a, b] = segmentOf(w, data.length, dpi);
          return { a, b, blocksSight: data.blocks };
        }),
        blockers: items.filter((i): i is Image => blocksLight(i) && i.visible).map((i) => imageFrame(i, dpi)),
      });

      const old = items.filter((i) => ART in i.metadata).map((i) => i.id);
      const next = buildArt(floor, style, dpi, fogOn ? sightLines(fog) : []);
      if (old.length) await OBR.scene.items.deleteItems(old);
      await inBatches(next, (batch) => OBR.scene.items.addItems(batch));
    } catch (e) {
      console.error("Draconic Architect: redraw failed", e);
      last = "";
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(redraw, 150);
  };

  OBR.scene.items.onChange(schedule);
  OBR.scene.onMetadataChange(schedule);
  OBR.scene.grid.onChange(schedule);
  OBR.scene.onReadyChange((ready) => {
    last = "";
    if (ready) schedule();
  });
  schedule();
}
