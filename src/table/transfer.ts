import OBR, { type Item } from "@owlbear-rodeo/sdk";
import type { Editor } from "../editor";
import { lang } from "../i18n";
import { BUILTIN } from "../items/resolve";
import { PRESETS } from "../style/presets";
import { STYLE } from "./ids";
import { buildProp, catalogItem } from "./props";
import { sceneStyle } from "./reconcile";
import { buildSource } from "./source";

export interface TransferResult {
  rooms: number;
  items: number;
  skipped: number;
}

/**
 * Puts the editor's floor and furniture on the open scene as editable table items, so nothing has
 * to be uploaded. Uploaded pictures can't be carried this way and are counted as skipped.
 */
export async function transferToScene(editor: Editor): Promise<TransferResult> {
  const doc = editor.doc;
  const styleId = editor.style(doc.settings.style).id;
  if (PRESETS.some((p) => p.id === styleId)) await OBR.scene.setMetadata({ [STYLE]: styleId });
  const [dpi, style] = await Promise.all([OBR.scene.grid.getDpi(), sceneStyle()]);
  const now = Date.now();
  const out: Item[] = [];
  const result: TransferResult = { rooms: 0, items: 0, skipped: 0 };
  for (const o of editor.stacked()) {
    if (!editor.visible(o)) continue;
    if (o.kind === "floor") {
      const source = buildSource(o.shape, o.carve, dpi, style, o.name);
      source.zIndex = now + out.length;
      out.push(source);
      result.rooms++;
    } else if (o.kind === "item") {
      const item = o.asset.startsWith(BUILTIN) ? catalogItem(o.asset.slice(BUILTIN.length)) : undefined;
      const ring = o.shape[0]?.[0];
      if (!item || !ring) {
        result.skipped++;
        continue;
      }
      const prop = buildProp(item, [ring[0], ring[1], ring[3]], dpi, o.name || item.name[lang()]);
      prop.zIndex = now + out.length;
      out.push(prop);
      result.items++;
    }
  }
  for (let i = 0; i < out.length; i += 40) await OBR.scene.items.addItems(out.slice(i, i + 40));
  return result;
}
