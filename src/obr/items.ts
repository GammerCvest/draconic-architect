import OBR from "@owlbear-rodeo/sdk";
import { lang, setLang, t, type Key } from "../i18n";
import { CATALOG } from "../items/catalog";
import { LIGHT_SOURCES } from "../light";
import { catalogItem } from "../table/props";
import { builtinSrc } from "../items/resolve";
import type { ItemCategory, ItemSet } from "../items/types";
import { TOOL } from "../table/ids";
import { whenReady } from "./table";
import "./popover.css";

setLang(lang());
document.addEventListener("dragstart", (e) => e.preventDefault());

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
  ["lighting", "catLighting"],
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
      c.category !== "lights" &&
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
      img.draggable = false;
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

const mode = new URLSearchParams(location.search).get("mode");

const BARRIERS: [string, Key][] = [
  ["window", "barrierWindow"],
  ["bars", "barrierBars"],
  ["curtain", "barrierCurtain"],
  ["bushes", "barrierBushes"],
  ["crayon", "barrierCrayon"],
];

async function renderOptions() {
  await whenReady();
  const meta = (await OBR.tool.getMetadata(TOOL)) ?? {};
  const set = async (update: Record<string, unknown>) => {
    Object.assign(meta, update);
    await OBR.tool.setMetadata(TOOL, update);
    await renderOptions();
  };
  const check = (key: string, label: Key) => {
    const l = document.createElement("label");
    l.className = "check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = meta[key] === true || (key === "newLightsLit" && meta[key] !== false);
    box.addEventListener("change", () => set({ [key]: box.checked }));
    l.append(box, t(label));
    return l;
  };
  const hint = (key: Key) => {
    const p = document.createElement("p");
    p.textContent = t(key);
    return p;
  };
  if (mode === "door") {
    root.replaceChildren(hint("tableDoorHint"), check("newDoorsPlayers", "newDoorsPlayers"));
  } else if (mode === "barrier") {
    root.replaceChildren(
      hint("tableBarrierHint"),
      chips(BARRIERS, String(meta.barrierType ?? "window"), (v) => set({ barrierType: v })),
      check("barrierBlocks", "blocksSight"),
    );
  } else {
    const grid = document.createElement("div");
    grid.className = "grid";
    const current = String(meta.lightSource ?? "wall-torch");
    const sources = [
      ...LIGHT_SOURCES.map((l) => ({ id: l.id, item: catalogItem(l.lit) })),
      { id: "symbol", item: catalogItem("classic/light") },
    ];
    for (const { id, item } of sources) {
      if (!item) continue;
      const b = document.createElement("button");
      b.className = id === current ? "cell active" : "cell";
      b.title = id === "symbol" ? t("lightSymbol") : item.name[lang()];
      const img = document.createElement("img");
      img.src = builtinSrc(item);
      img.draggable = false;
      b.append(img);
      b.addEventListener("click", () => set({ lightSource: id }));
      grid.append(b);
    }
    root.replaceChildren(hint("tableLightHint"), grid, check("newLightsLit", "newLightsLit"), hint("hintLight"));
  }
}

if (mode) void renderOptions();
else render();
whenReady().then(async () => {
  picked = String((await OBR.tool.getMetadata(TOOL))?.item ?? "");
  renderGrid();
});
