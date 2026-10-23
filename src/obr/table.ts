import OBR, {
  buildImage,
  buildImageUpload,
  buildPath,
  buildSceneUpload,
  Command,
  type Item,
  type PathCommand,
  type Vector2,
} from "@owlbear-rodeo/sdk";
import type { MultiPolygon } from "../geometry";
import { wallLines, type ExportFrame } from "../export/uvtt";

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

function fogWalls(floor: MultiPolygon, frame: ExportFrame, origin: Vector2, dpi: number): Item[] {
  return wallLines(floor).map((line) => {
    const commands: PathCommand[] = line.map((p, i) => [
      i === 0 ? Command.MOVE : Command.LINE,
      origin.x + (p.x - frame.originX) * dpi,
      origin.y + (p.y - frame.originY) * dpi,
    ]);
    return buildPath()
      .commands(commands)
      .fillOpacity(0)
      .strokeColor("#000000")
      .strokeOpacity(1)
      .strokeWidth(2)
      .layer("FOG")
      .name("Wall")
      .locked(true)
      .build();
  });
}

export async function sendNewScene(name: string, png: Blob, floor: MultiPolygon, frame: ExportFrame) {
  await whenReady();
  const baseMap = buildImageUpload(mapFile(name, png)).name(name).dpi(frame.pxPerCell).build();
  const scene = buildSceneUpload()
    .name(name)
    .gridType("SQUARE")
    .baseMap(baseMap)
    .items(fogWalls(floor, frame, { x: 0, y: 0 }, NEW_SCENE_DPI))
    .fogFilled(true)
    .build();
  await OBR.assets.uploadScenes([scene]);
}

export async function placeOnScene(name: string, png: Blob, floor: MultiPolygon, frame: ExportFrame): Promise<boolean> {
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
  await OBR.scene.items.addItems([map, ...fogWalls(floor, frame, origin, dpi)]);
  return true;
}

export async function closeEditor() {
  await whenReady();
  await OBR.modal.close(EDITOR_MODAL);
}
