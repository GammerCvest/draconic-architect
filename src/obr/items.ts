import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang, t, type Key } from "../i18n";
import { CATALOG } from "../items/catalog";
import { builtinSrc } from "../items/resolve";
import type { ItemCategory, ItemSet } from "../items/types";
import { TOOL } from "../table/ids";
import { whenReady } from "./table";
import "./popover.css";

setLang(lang());

const SETS: [ItemSet, Key][] = [
  ["sketch", "setSketch"],
  ["classic", "setClassic"],
];
const CATEGORIES: [ItemCategory | "all", Key][] = [
  ["all", "catAll"],
  ["furniture", "catFurniture"],
  ["storage", "catStorage"],
  ["decor", "catDecor"],
  ["features", "catFeatures"],
  ["nature", "catNature"],
  ["cave", "catCave"],
  ["markers", "catMarkers"],
];

let set: ItemSet = "sketch";
let category: ItemCategory | "all" = "all";
let query = "";
let picked = "";

const root = document.getElementById("items")!;
root.className = "items";

function chips<T extends string>(options: [T, Key][], current: T, pick: (v: T) => void) {
  const row = document.createElement("div");
  row.className = "chips";
  for (const [value, key] of options) {
    const b = document.createElement("button");
    b.textContent = t(key);
    b.className = value === current ? "chip active" : "chip";
    b.addEventListener("click", () => pick(value));
    row.append(b);
  }
  return row;
}

function render() {
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = t("searchItems");
  search.value = query;
  search.addEventListener("input", () => {
    query = search.value;
    renderGrid();
  });
  const grid = document.createElement("div");
  grid.className = "grid";
  const hint = document.createElement("p");
  hint.textContent = t("tableItemsHint");
  root.replaceChildren(
    chips(SETS, set, (v) => ((set = v), render())),
    chips(CATEGORIES, category, (v) => ((category = v), render())),
    search,
    grid,
    hint,
  );
  renderGrid();
}

function renderGrid() {
  const grid = root.querySelector(".grid")!;
  const q = query.trim().toLowerCase();
  const list = CATALOG.filter(
    (c) =>
      c.set === set &&
      c.category !== "doors" &&
      (category === "all" || c.category === category) &&
      c.name[lang()].toLowerCase().includes(q),
  );
  grid.replaceChildren(
    ...list.map((c) => {
      const b = document.createElement("button");
      b.className = c.id === picked ? "cell active" : "cell";
      b.title = c.name[lang()];
      const img = document.createElement("img");
      img.src = builtinSrc(c);
      img.loading = "lazy";
      b.append(img);
      b.addEventListener("click", async () => {
        picked = c.id;
        renderGrid();
        await whenReady();
        await OBR.tool.setMetadata(TOOL, { item: c.id });
      });
      return b;
    }),
  );
}

render();
whenReady().then(async () => {
  picked = String((await OBR.tool.getMetadata(TOOL))?.item ?? "");
  renderGrid();
});
