import OBR, { type Item, type Path } from "@owlbear-rodeo/sdk";
import { DEFAULT_STYLE_ID, PRESETS } from "../style/presets";
import type { MapStyle } from "../style/types";
import { buildArt, floorOf } from "./art";
import { ART, STYLE } from "./ids";
import { isSource, sourceData, sourceFill } from "./source";

const BATCH = 40;

export async function sceneStyle(): Promise<MapStyle> {
  const id = (await OBR.scene.getMetadata())[STYLE];
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_STYLE_ID)!;
}

// Every client sees the same changes; only one GM redraws, or the drawing would be made twice.
async function isLeader(): Promise<boolean> {
  if ((await OBR.player.getRole()) !== "GM") return false;
  const me = await OBR.player.getConnectionId();
  const others = await OBR.party.getPlayers();
  return !others.some((p) => p.role === "GM" && p.connectionId < me);
}

function signature(sources: Path[], style: MapStyle, dpi: number): string {
  return JSON.stringify([
    style.id,
    dpi,
    sources.map((s) => [s.id, s.zIndex, s.visible, s.position, s.rotation, s.scale, s.commands, sourceData(s).carve]),
  ]);
}

async function inBatches(items: Item[], add: (batch: Item[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += BATCH) await add(items.slice(i, i + BATCH));
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
      const sig = signature(sources, style, dpi);
      if (sig === last) return;
      last = sig;

      const stale = sources.filter((s) => s.style.fillColor !== sourceFill(style, sourceData(s).carve));
      if (stale.length) {
        await OBR.scene.items.updateItems<Path>(
          stale.map((s) => s.id),
          (drafts) => drafts.forEach((d) => (d.style.fillColor = sourceFill(style, sourceData(d).carve))),
        );
      }

      const old = items.filter((i) => ART in i.metadata).map((i) => i.id);
      const next = buildArt(floorOf(sources, dpi), style, dpi);
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
