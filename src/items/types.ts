export type ItemSet = "sketch" | "classic";
export type ItemCategory = "furniture" | "storage" | "decor" | "features" | "nature" | "cave" | "markers";

export interface CatalogItem {
  id: string;
  set: ItemSet;
  category: ItemCategory;
  w: number;
  h: number;
  /** Picture size in pixels. */
  px: [number, number];
  name: { uk: string; en: string };
}
