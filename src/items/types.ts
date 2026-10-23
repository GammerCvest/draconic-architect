export type ItemSet = "sketch" | "classic";
export type ItemCategory = "furniture" | "storage" | "decor" | "features" | "nature" | "cave" | "markers";

export interface CatalogItem {
  id: string;
  set: ItemSet;
  category: ItemCategory;
  w: number;
  h: number;
  name: { uk: string; en: string };
}
