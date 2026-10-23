import type { MapDoc } from "../doc";
import type { Lang } from "../i18n";
import { CATALOG } from "./catalog";
import type { CatalogItem } from "./types";

export const BUILTIN = "builtin:";
export const USER = "user:";

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function builtinSrc(item: CatalogItem): string {
  return `${import.meta.env.BASE_URL}assets/items/${item.id}.png`;
}

export interface AssetInfo {
  src: string;
  name: string;
  w: number;
  h: number;
}

export function assetInfo(doc: MapDoc, key: string, lang: Lang): AssetInfo | null {
  if (key.startsWith(BUILTIN)) {
    const item = byId.get(key.slice(BUILTIN.length));
    return item ? { src: builtinSrc(item), name: item.name[lang], w: item.w, h: item.h } : null;
  }
  const own = doc.assets[key];
  return own ? { src: own.data, name: own.name, w: own.w, h: own.h } : null;
}
