import OBR, { buildImageUpload, buildSceneUpload, buildWall } from "@owlbear-rodeo/sdk";
import type { MultiPolygon } from "../geometry";
import { wallLines, type ExportFrame } from "../export/uvtt";

const SCENE_DPI = 150;
export const EDITOR_MODAL = "dev.gammercvest.draconic-architect/editor";

export const inOwlbear = OBR.isAvailable;

export function whenReady(): Promise<void> {
  return new Promise((resolve) => OBR.onReady(() => resolve()));
}

export async function sendScene(name: string, png: Blob, floor: MultiPolygon, frame: ExportFrame) {
  await whenReady();
  const toScene = (p: { x: number; y: number }) => ({
    x: (p.x - frame.originX) * SCENE_DPI,
    y: (p.y - frame.originY) * SCENE_DPI,
  });
  const walls = wallLines(floor).map((line) =>
    buildWall().points(line.map(toScene)).doubleSided(true).blocking(true).locked(true).name(name).build(),
  );
  const baseMap = buildImageUpload(png).name(name).dpi(frame.pxPerCell).offset({ x: 0, y: 0 }).build();
  const scene = buildSceneUpload().name(name).baseMap(baseMap).items(walls).build();
  await OBR.assets.uploadScenes([scene]);
}

export async function closeEditor() {
  await whenReady();
  await OBR.modal.close(EDITOR_MODAL);
}
