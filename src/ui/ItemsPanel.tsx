import { useState } from "preact/hooks";
import type { Editor } from "../editor";
import { lang, t, type Key } from "../i18n";
import { CATALOG } from "../items/catalog";
import { BUILTIN, builtinSrc } from "../items/resolve";
import type { ItemCategory, ItemSet } from "../items/types";
import { imageFileToData, pickFile } from "../style/library";

type Tab = ItemSet | "mine";

const TABS: [Tab, Key][] = [
  ["sketch", "setSketch"],
  ["classic", "setClassic"],
  ["mine", "setMine"],
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

interface Entry {
  key: string;
  src: string;
  name: string;
}

export function ItemsPanel({ editor }: { editor: Editor }) {
  const [tab, setTab] = useState<Tab>("sketch");
  const [category, setCategory] = useState<ItemCategory | "all">("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  let entries: Entry[];
  if (tab === "mine") {
    entries = Object.entries(editor.doc.assets).map(([key, a]) => ({ key, src: a.data, name: a.name }));
  } else {
    entries = CATALOG.filter((c) => c.set === tab && (category === "all" || c.category === category)).map((c) => ({
      key: BUILTIN + c.id,
      src: builtinSrc(c),
      name: c.name[lang()],
    }));
  }
  if (q) entries = entries.filter((e) => e.name.toLowerCase().includes(q));

  const upload = async () => {
    const files = await pickFile("image/*", true);
    let last: string | null = null;
    for (const file of files) {
      try {
        const data = await imageFileToData(file);
        const size = await naturalSize(data);
        last = editor.addAsset({
          name: file.name.replace(/\.[^.]+$/, ""),
          data,
          w: 1,
          h: Math.max(0.25, Math.round((size.h / size.w) * 4) / 4),
        });
      } catch {
        alert(t("badImage"));
      }
    }
    if (last) editor.setItemBrush(last);
  };

  return (
    <div class="items-panel">
      <section>
        <h2>{t("items")}</h2>
        <div class="segmented">
          {TABS.map(([id, key]) => (
            <button key={id} class={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {t(key)}
            </button>
          ))}
        </div>
        {tab !== "mine" && (
          <div class="chips">
            {CATEGORIES.map(([id, key]) => (
              <button key={id} class={category === id ? "active" : ""} onClick={() => setCategory(id)}>
                {t(key)}
              </button>
            ))}
          </div>
        )}
        <input
          class="search"
          type="search"
          placeholder={t("searchItems")}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </section>
      <section class="item-grid">
        {entries.map((e) => (
          <button
            key={e.key}
            class={`item-cell${editor.itemBrush === e.key ? " active" : ""}`}
            title={e.name}
            onClick={() => editor.setItemBrush(e.key)}
          >
            <img src={e.src} alt="" loading="lazy" />
            <span>{e.name}</span>
          </button>
        ))}
        {entries.length === 0 && <div class="muted">{t(tab === "mine" ? "noOwnItems" : "empty")}</div>}
      </section>
      <section>
        {tab === "mine" && <button onClick={upload}>{t("uploadItems")}</button>}
        <div class="muted small">{t("itemsHint")}</div>
        {tab !== "mine" && <div class="muted small">{t("itemsCredit")}</div>}
      </section>
    </div>
  );
}

function naturalSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = reject;
    img.src = src;
  });
}
