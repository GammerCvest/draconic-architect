import OBR, {
  buildImage,
  buildImageUpload,
  buildPath,
  buildSceneUpload,
  buildShape,
  Command,
  type Item,
  type PathCommand,
  type Vector2,
} from "@owlbear-rodeo/sdk";
import { sightLines } from "../fog";
import type { Pair } from "../geometry";
import { dynamicFogLight } from "../light";
import type { ExportFrame, MapFeatures } from "../export/uvtt";

export const DYNAMIC_FOG_LIGHT = "rodeo.owlbear.dynamic-fog/light";

const NEW_SCENE_DPI = 150;
export const EDITOR_MODAL = "dev.gammercvest.draconic-architect/editor";

export const inOwlbear = OBR.isAvailable;

export function whenReady(): Promise<void> {
  return new Promise((resolve) => OBR.onReady(() => resolve()));
}

export async function notify(message: string, variant: "INFO" | "SUCCESS" | "ERROR" = "INFO") {
  await whenReady();
  await OBR.notification.show(message, variant);
}

function mapFile(name: string, png: Blob): File {
  return new File([png], `${name}.png`, { type: "image/png" });
}

function fogItems(features: MapFeatures, frame: ExportFrame, origin: Vector2, dpi: number): Item[] {
  const at = ([x, y]: Pair) => ({ x: origin.x + (x - frame.originX) * dpi, y: origin.y + (y - frame.originY) * dpi });
  const items: Item[] = [];
  if (features.fog) {
    for (const line of sightLines(features.fog)) {
      const commands: PathCommand[] = line.map((p, i) => {
        const q = at(p);
        return [i === 0 ? Command.MOVE : Command.LINE, q.x, q.y];
      });
      items.push(
        buildPath()
          .commands(commands)
          .fillOpacity(0)
          .strokeColor("#000000")
          .strokeOpacity(1)
          .strokeWidth(2)
          .layer("FOG")
          .name("Wall")
          .locked(true)
          .build(),
      );
    }
  }
  for (const l of features.lights) {
    if (!l.light.lit) continue;
    const size = dpi * 0.3;
    const c = at([l.x, l.y]);
    items.push(
      buildShape()
        .shapeType("CIRCLE")
        .width(size)
        .height(size)
        .position({ x: c.x, y: c.y })
        .fillOpacity(0)
        .strokeOpacity(0)
        .layer("PROP")
        .name("Light")
        .metadata({ [DYNAMIC_FOG_LIGHT]: dynamicFogLight(l.light, dpi) })
        .build(),
    );
  }
  return items;
}

export async function sendNewScene(name: string, png: Blob, features: MapFeatures, frame: ExportFrame) {
  await whenReady();
  const baseMap = buildImageUpload(mapFile(name, png)).name(name).dpi(frame.pxPerCell).build();
  const scene = buildSceneUpload()
    .name(name)
    .gridType("SQUARE")
    .baseMap(baseMap)
    .items(fogItems(features, frame, { x: 0, y: 0 }, NEW_SCENE_DPI))
    .fogFilled(true)
    .build();
  await OBR.assets.uploadScenes([scene]);
}

export async function placeOnScene(
  name: string,
  png: Blob,
  features: MapFeatures,
  frame: ExportFrame,
): Promise<boolean> {
  await whenReady();
  if (!(await OBR.scene.isReady())) throw new Error("no scene open");
  const upload = buildImageUpload(mapFile(name, png)).name(name).dpi(frame.pxPerCell).locked(true).build();
  const picker = OBR.assets.downloadImages(false, name, "MAP");
  await new Promise((r) => setTimeout(r, 300));
  await OBR.assets.uploadImages([upload], "MAP");
  const [picked] = await picker;
  if (!picked) return false;
  const dpi = await OBR.scene.grid.getDpi();
  const origin = { x: 0, y: 0 };
  const map = buildImage(picked.image, picked.grid).name(name).layer("MAP").position(origin).locked(true).build();
  await OBR.scene.items.addItems([map, ...fogItems(features, frame, origin, dpi)]);
  return true;
}

export async function closeEditor() {
  await whenReady();
  await OBR.modal.close(EDITOR_MODAL);
}
