import { useEffect, useRef, useState } from "preact/hooks";
import type { BarrierObject, BarrierType, DoorObject, Group, ItemObject, Layer, MapObject } from "../doc";
import { LIGHT_PRESETS, LIGHT_SOURCES, type LightPreset } from "../light";
import { catalogItem } from "../table/props";
import { CATALOG } from "../items/catalog";
import { BUILTIN, builtinSrc } from "../items/resolve";
import type { DrawMode, Editor, ToolId } from "../editor";
import { lang, setLang, t, type Key } from "../i18n";
import { BASE_ZOOM, type Stage } from "../stage";
import { buildUvtt } from "../export/uvtt";
import { closeEditor, inOwlbear, placeOnScene, sendNewScene } from "../obr/table";
import { transferToScene } from "../table/transfer";
import { ask, say } from "./dialogs";
import { download } from "./download";
import { Icon, type IconName } from "./icons";
import { ItemsPanel } from "./ItemsPanel";
import { StylePanel } from "./StylePanel";

interface Props {
  editor: Editor;
  stage: Stage;
}

function useEditor(editor: Editor) {
  const [, setTick] = useState(0);
  useEffect(() => editor.subscribe(() => setTick((n) => n + 1)), [editor]);
}

function IconButton(props: { icon: IconName; title: Key; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      class={`icon-btn${props.active ? " active" : ""}`}
      title={t(props.title)}
      aria-label={t(props.title)}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

export function App({ editor, stage }: Props) {
  useEditor(editor);
  return (
    <>
      <TopBar editor={editor} stage={stage} />
      <ToolBar editor={editor} />
      <StageView editor={editor} stage={stage} />
      <Sidebar editor={editor} />
      <StatusBar editor={editor} />
      {editor.stylesOpen && <StylePanel editor={editor} />}
      {editor.settingsOpen && <SettingsDialog editor={editor} />}
    </>
  );
}

function TopBar({ editor, stage }: Props) {
  const h = editor.history;
  const openFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        editor.load(await file.text());
        stage.fit();
      } catch {
        say(t("badFile"), "ERROR");
      }
    });
    input.click();
  };
  const newMap = async () => {
    if (editor.doc.objects.length > 0 && !(await ask(t("confirmNew")))) return;
    editor.newMap();
    stage.fit();
  };
  const exportImage = async () => {
    try {
      const out = await stage.exportImage();
      if (!out) say(t("emptyMap"));
      else if (out.frame.pxPerCell < editor.doc.settings.exportPxPerCell)
        say(`${t("exportReduced")} ${out.frame.pxPerCell}`);
      return out;
    } catch {
      say(t("exportFailed"), "ERROR");
      return null;
    }
  };
  const exportPng = async () => {
    const out = await exportImage();
    if (out) download(out.png, "map.png");
  };
  const exportUvtt = async () => {
    const out = await exportImage();
    if (out) download(await buildUvtt(out.png, editor.mapFeatures(), out.frame), "map.dd2vtt");
  };
  const toTable = async (where: "here" | "picture" | "new") => {
    try {
      if (where === "here") {
        const r = await transferToScene(editor);
        say(
          `${t("transferDone")} ${r.rooms} / ${r.items}${r.skipped ? `. ${t("transferSkipped")} ${r.skipped}` : ""}`,
          "SUCCESS",
        );
        await closeEditor();
        return;
      }
      const out = await exportImage();
      if (!out) return;
      if (where === "new") {
        await sendNewScene(t("appName"), out.png, editor.mapFeatures(), out.frame);
        say(t("newSceneDone"), "SUCCESS");
      } else if (await placeOnScene(t("appName"), out.png, editor.mapFeatures(), out.frame)) {
        say(t("placedDone"), "SUCCESS");
        await closeEditor();
      }
    } catch (e) {
      console.error(e);
      say(`${t("toTableFailed")} ${e instanceof Error ? e.message : ""}`, "ERROR");
    }
  };
  return (
    <header class="topbar">
      <h1>{t("appName")}</h1>
      <div class="group">
        {MODES.map((m) => (
          <button
            key={m.id}
            class={`mode-${m.id}${editor.drawMode === m.id ? " active" : ""}`}
            title={t(m.hint)}
            onClick={() => editor.setDrawMode(m.id)}
          >
            {t(m.label)}
          </button>
        ))}
      </div>
      <div class="group">
        <IconButton icon="undo" title="undo" disabled={!h.canUndo} onClick={() => editor.undo()} />
        <IconButton icon="redo" title="redo" disabled={!h.canRedo} onClick={() => editor.redo()} />
      </div>
      <div class="group">
        <button onClick={newMap}>{t("newMap")}</button>
        <button onClick={openFile}>{t("open")}</button>
        <button onClick={() => download(new Blob([editor.save()], { type: "application/json" }), "map.draconic.json")}>
          {t("save")}
        </button>
        <button onClick={exportPng}>{t("exportPng")}</button>
        <button title={t("exportUvttHint")} onClick={exportUvtt}>
          {t("exportUvtt")}
        </button>
      </div>
      {tableMode && (
        <div class="group">
          <button class="primary" title={t("toTableHint")} onClick={() => toTable("here")}>
            {t("toTable")}
          </button>
          <button title={t("asPictureHint")} onClick={() => toTable("picture")}>
            {t("asPicture")}
          </button>
          <button title={t("newSceneHint")} onClick={() => toTable("new")}>
            {t("newScene")}
          </button>
          <button onClick={() => closeEditor()}>{t("closeEditor")}</button>
        </div>
      )}
      <div class="spacer" />
      <button class={editor.stylesOpen ? "active" : ""} onClick={() => editor.setStylesOpen(!editor.stylesOpen)}>
        <Icon name="palette" />
        {t("styles")}
      </button>
      <IconButton icon="gear" title="settings" onClick={() => editor.setSettingsOpen(true)} />
      <button
        title={t("language")}
        onClick={() => {
          setLang(lang() === "uk" ? "en" : "uk");
          editor.emit();
        }}
      >
        {lang() === "uk" ? "UA" : "EN"}
      </button>
    </header>
  );
}

const tableMode = inOwlbear && new URLSearchParams(location.search).has("table");

const MODES: { id: DrawMode; label: Key; hint: Key }[] = [
  { id: "floor", label: "modeFloor", hint: "modeFloorHint" },
  { id: "carve", label: "modeCarve", hint: "modeCarveHint" },
  { id: "room", label: "modeRoom", hint: "modeRoomHint" },
];

const TOOLS: { id: ToolId; icon: IconName; title: Key }[] = [
  { id: "select", icon: "select", title: "toolSelect" },
  { id: "rect", icon: "rect", title: "toolRect" },
  { id: "polygon", icon: "polygon", title: "toolPolygon" },
  { id: "brush", icon: "brush", title: "toolBrush" },
  { id: "item", icon: "chair", title: "toolItem" },
  { id: "door", icon: "door", title: "toolDoor" },
  { id: "barrier", icon: "window", title: "toolBarrier" },
  { id: "light", icon: "light", title: "toolLight" },
];

function ToolBar({ editor }: { editor: Editor }) {
  return (
    <nav class="toolbar">
      {TOOLS.map((tool) => (
        <IconButton
          key={tool.id}
          icon={tool.icon}
          title={tool.title}
          active={editor.tool === tool.id}
          onClick={() => editor.setTool(tool.id)}
        />
      ))}
    </nav>
  );
}

function StageView({ editor, stage }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) stage.mount(ref.current);
  }, [stage]);
  const percent = Math.round((editor.view.zoom / BASE_ZOOM) * 100);
  return (
    <main class="stage" ref={ref}>
      <div class="zoom">
        <IconButton icon="minus" title="zoomOut" onClick={() => stage.zoomBy(0.8)} />
        <button class="zoom-label" title={t("zoomReset")} onClick={() => stage.zoomReset()}>
          {percent}%
        </button>
        <IconButton icon="plus" title="zoomIn" onClick={() => stage.zoomBy(1.25)} />
        <IconButton icon="fit" title="fit" onClick={() => stage.fit()} />
      </div>
    </main>
  );
}

function Sidebar({ editor }: { editor: Editor }) {
  const doc = editor.doc;
  const listed = editor
    .stacked()
    .filter((o) => editor.allLayers || o.layer === editor.activeLayer)
    .reverse();
  const active = editor.layer(editor.activeLayer);
  const activeIndex = doc.layers.indexOf(active);
  const deleteLayer = async () => {
    const used = doc.objects.some((o) => o.layer === active.id);
    if (used && !(await ask(t("confirmDeleteLayer")))) return;
    editor.deleteLayer(active.id);
  };
  return (
    <aside class="sidebar">
      <section>
        <h2>{t("layers")}</h2>
        {[...doc.layers].reverse().map((layer) => (
          <LayerRow key={layer.id} editor={editor} layer={layer} />
        ))}
        <div class="actions">
          <IconButton icon="plus" title="addLayer" onClick={() => editor.addLayer()} />
          <IconButton
            icon="up"
            title="layerUp"
            disabled={activeIndex === doc.layers.length - 1}
            onClick={() => editor.moveLayer(active.id, 1)}
          />
          <IconButton
            icon="down"
            title="layerDown"
            disabled={activeIndex === 0}
            onClick={() => editor.moveLayer(active.id, -1)}
          />
          <IconButton icon="trash" title="deleteLayer" disabled={doc.layers.length <= 1} onClick={deleteLayer} />
        </div>
        <label class="field inline">
          <span>{t("layerStyle")}</span>
          <StyleSelect
            editor={editor}
            value={active.style}
            inheritLabel="followMap"
            onChange={(id) => editor.setLayerState(active.id, { style: id })}
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={editor.allLayers}
            onChange={(e) => editor.setAllLayers(e.currentTarget.checked)}
          />
          {t("allLayers")}
        </label>
      </section>
      {editor.tool === "item" ? (
        <ItemsPanel editor={editor} />
      ) : editor.tool === "barrier" || editor.tool === "light" ? (
        <ToolOptions editor={editor} />
      ) : (
        <section class="objects">
          {listed.length === 0 && <div class="muted">{t("empty")}</div>}
          <TreeRows editor={editor} nodes={buildTree(editor, listed)} depth={0} />
        </section>
      )}
      <Properties editor={editor} />
    </aside>
  );
}

function LayerRow({ editor, layer }: { editor: Editor; layer: Layer }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div
      class={`row layer${editor.activeLayer === layer.id ? " current" : ""}${layer.hidden ? " dim" : ""}`}
      title={t("renameHint")}
      onClick={() => editor.setActiveLayer(layer.id)}
      onDblClick={() => setRenaming(true)}
    >
      {renaming ? (
        <InlineName
          value={layer.name}
          onDone={(name) => {
            setRenaming(false);
            if (name && name !== layer.name) editor.setLayerState(layer.id, { name });
          }}
        />
      ) : (
        <span class="row-name">{layer.name}</span>
      )}
      <span onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon={layer.hidden ? "eyeOff" : "eye"}
          title={layer.hidden ? "show" : "hide"}
          onClick={() => editor.setLayerState(layer.id, { hidden: !layer.hidden })}
        />
        <IconButton
          icon={layer.locked ? "lock" : "unlock"}
          title={layer.locked ? "unlock" : "lock"}
          active={layer.locked}
          onClick={() => editor.setLayerState(layer.id, { locked: !layer.locked })}
        />
      </span>
    </div>
  );
}

function InlineName({ value, onDone }: { value: string; onDone: (name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      class="inline-name"
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

type TreeNode = { group: Group; children: TreeNode[] } | { object: MapObject };

function buildTree(editor: Editor, objects: MapObject[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodes = new Map<string, { group: Group; children: TreeNode[] }>();
  for (const o of objects) {
    let list = root;
    for (const gid of editor.groupChain(o).reverse()) {
      let node = nodes.get(gid);
      if (!node) {
        const group = editor.group(gid);
        if (!group) break;
        node = { group, children: [] };
        nodes.set(gid, node);
        list.push(node);
      }
      list = node.children;
    }
    list.push({ object: o });
  }
  return root;
}

function TreeRows({ editor, nodes, depth }: { editor: Editor; nodes: TreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((n) =>
        "group" in n ? (
          <div key={n.group.id}>
            <GroupRow editor={editor} group={n.group} depth={depth} />
            <TreeRows editor={editor} nodes={n.children} depth={depth + 1} />
          </div>
        ) : (
          <ObjectRow key={n.object.id} editor={editor} object={n.object} depth={depth} />
        ),
      )}
    </>
  );
}

function GroupRow({ editor, group, depth }: { editor: Editor; group: Group; depth: number }) {
  const members = editor.members(group.id);
  const selected = members.length > 0 && members.every((m) => editor.selection.has(m.id));
  const hidden = members.every((m) => m.hidden);
  return (
    <div
      class={`row group-row${selected ? " selected" : ""}${hidden ? " dim" : ""}`}
      style={{ paddingLeft: `${4 + depth * 14}px` }}
      onClick={(e) =>
        editor.select(
          members.filter((m) => !editor.layer(m.layer).locked).map((m) => m.id),
          e.shiftKey,
        )
      }
    >
      <span onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon={hidden ? "eyeOff" : "eye"}
          title={hidden ? "show" : "hide"}
          onClick={() =>
            editor.setHidden(
              members.map((m) => m.id),
              !hidden,
            )
          }
        />
      </span>
      <Icon name="group" />
      <span class="row-name">{group.name}</span>
    </div>
  );
}

const KIND_KEYS = { room: "kindRoom", item: "kindItem", door: "kindDoor", barrier: "kindBarrier" } as const;

function kindKey(o: MapObject): Key {
  if (o.kind === "floor") return o.carve ? "kindCarve" : "kindFloor";
  return KIND_KEYS[o.kind];
}

function ObjectRow({ editor, object, depth }: { editor: Editor; object: MapObject; depth: number }) {
  const selected = editor.selection.has(object.id);
  const locked = editor.layer(object.layer).locked;
  const parent = object.attachedTo ? editor.byId(object.attachedTo) : undefined;
  return (
    <div
      class={`row${selected ? " selected" : ""}${object.hidden ? " dim" : ""}`}
      style={{ paddingLeft: `${4 + depth * 14}px` }}
      onClick={(e) => !locked && editor.select([object.id], e.shiftKey || e.ctrlKey)}
    >
      <span onClick={(e) => e.stopPropagation()}>
        <IconButton
          icon={object.hidden ? "eyeOff" : "eye"}
          title={object.hidden ? "show" : "hide"}
          onClick={() => editor.update(object.id, { hidden: !object.hidden })}
        />
      </span>
      <span class="row-name">{object.name}</span>
      {parent && (
        <span class="link" title={`${t("attachedTo")} ${parent.name}`}>
          <Icon name="link" />
        </span>
      )}
      {object.z !== 0 && (
        <span class="z" title={t("priority")}>
          {object.z > 0 ? `+${object.z}` : object.z}
        </span>
      )}
      <span class={`tag kind-${object.kind === "floor" && object.carve ? "carve" : object.kind}`}>
        {t(kindKey(object))}
      </span>
    </div>
  );
}

function Properties({ editor }: { editor: Editor }) {
  const sel = editor.selected();
  if (sel.length === 0) return null;
  const single = sel.length === 1 ? sel[0] : null;
  const group = editor.selectedGroup();
  const sameZ = sel.every((o) => o.z === sel[0].z);
  const sameLayer = sel.every((o) => o.layer === sel[0].layer);
  const grouped = sel.some((o) => o.group);
  const parents = [...new Set(sel.map((o) => o.attachedTo))];
  const parent = parents.length === 1 && parents[0] ? editor.byId(parents[0]) : undefined;
  return (
    <section class="props">
      <h2>{t("selection")}</h2>
      {group && (
        <NameField
          key={group.id}
          label="groupName"
          value={group.name}
          onCommit={(name) => editor.renameGroup(group.id, name)}
        />
      )}
      {single && (
        <NameField
          key={single.id}
          label="name"
          value={single.name}
          onCommit={(name) => editor.update(single.id, { name })}
        />
      )}
      {!single && !group && (
        <div class="muted">
          {t("selectedCount")} {sel.length}
        </div>
      )}
      {single?.kind === "floor" && (
        <div class="segmented">
          <button
            class={!single.carve ? "active mode-floor" : ""}
            onClick={() => editor.update(single.id, { carve: false })}
          >
            {t("kindFloor")}
          </button>
          <button
            class={single.carve ? "active mode-carve" : ""}
            onClick={() => editor.update(single.id, { carve: true })}
          >
            {t("kindCarve")}
          </button>
        </div>
      )}
      <div class="field-row">
        <label class="field" title={t("priorityHint")}>
          <span>{t("priority")}</span>
          <div class="stepper">
            <IconButton icon="minus" title="lower" onClick={() => editor.reorder(-1)} />
            <input
              type="number"
              step="1"
              value={sameZ ? String(sel[0].z) : ""}
              onChange={(e) => editor.setPriority(Number(e.currentTarget.value))}
            />
            <IconButton icon="plus" title="raise" onClick={() => editor.reorder(1)} />
          </div>
        </label>
        <label class="field">
          <span>{t("layer")}</span>
          <select value={sameLayer ? sel[0].layer : ""} onChange={(e) => editor.moveToLayer(e.currentTarget.value)}>
            {!sameLayer && <option value="" disabled />}
            {[...editor.doc.layers].reverse().map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {single?.kind === "item" && <ItemFields editor={editor} item={single} />}
      {single?.kind === "item" && <LightFields editor={editor} item={single} />}
      {single?.kind === "door" && <DoorFields editor={editor} door={single} />}
      {single?.kind === "barrier" && <BarrierFields editor={editor} barrier={single} />}
      {sel.some((o) => o.kind !== "room") && (
        <label class="field">
          <span>{t("shapeStyle")}</span>
          <StyleSelect
            editor={editor}
            value={sel.every((o) => o.style === sel[0].style) ? sel[0].style : undefined}
            inheritLabel="followLayer"
            onChange={(id) => editor.setSelectionStyle(id)}
          />
        </label>
      )}
      <div class="attach">
        {parent ? (
          <>
            <span class="muted">
              {t("attachedTo")} <b>{parent.name}</b>
            </span>
            <button onClick={() => editor.detachSelected()}>{t("detach")}</button>
          </>
        ) : (
          <button class={editor.attachPicking ? "active" : ""} onClick={() => editor.startAttach()}>
            <Icon name="link" />
            {t("attach")}
          </button>
        )}
      </div>
      <div class="actions">
        <IconButton icon="rotL" title="rotateLeft" onClick={() => editor.rotateSelected(-1)} />
        <IconButton icon="rotR" title="rotateRight" onClick={() => editor.rotateSelected(1)} />
        <IconButton icon="flipH" title="flipH" onClick={() => editor.flipSelected("h")} />
        <IconButton icon="flipV" title="flipV" onClick={() => editor.flipSelected("v")} />
        <IconButton icon="group" title="group" disabled={sel.length < 2} onClick={() => editor.groupSelection()} />
        <IconButton icon="ungroup" title="ungroup" disabled={!grouped} onClick={() => editor.ungroupSelection()} />
        <IconButton icon="merge" title="merge" disabled={sel.length < 2} onClick={() => editor.mergeSelection()} />
        <IconButton icon="dup" title="duplicate" onClick={() => editor.duplicate()} />
        <IconButton icon="copy" title="copy" onClick={() => editor.copy()} />
        <IconButton icon="paste" title="paste" onClick={() => editor.paste()} />
        <IconButton icon="trash" title="remove" onClick={() => editor.deleteSelected()} />
      </div>
    </section>
  );
}

function ItemFields({ editor, item }: { editor: Editor; item: ItemObject }) {
  const ring = item.shape[0][0];
  const w = Math.round(Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]) * 100) / 100;
  const h = Math.round(Math.hypot(ring[3][0] - ring[0][0], ring[3][1] - ring[0][1]) * 100) / 100;
  return (
    <>
      <div class="field">
        <span>{t("itemSize")}</span>
        <div class="size-row">
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={w}
            onChange={(e) => editor.setItemSize(item.id, Number(e.currentTarget.value), h)}
          />
          ×
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={h}
            onChange={(e) => editor.setItemSize(item.id, w, Number(e.currentTarget.value))}
          />
        </div>
      </div>
      <label class="check" title={t("tintItemHint")}>
        <input
          type="checkbox"
          checked={item.tint}
          onChange={(e) => editor.update(item.id, { tint: e.currentTarget.checked })}
        />
        {t("tintItem")}
      </label>
    </>
  );
}

function StyleSelect(props: {
  editor: Editor;
  value: string | null | undefined;
  inheritLabel: Key;
  onChange: (id: string | null) => void;
}) {
  return (
    <select
      value={props.value === undefined ? "?" : (props.value ?? "")}
      onChange={(e) => props.onChange(e.currentTarget.value || null)}
    >
      {props.value === undefined && <option value="?" disabled />}
      <option value="">{t(props.inheritLabel)}</option>
      {props.editor.doc.styles.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

function NameField(props: { label: Key; value: string; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(props.value);
  useEffect(() => setValue(props.value), [props.value]);
  const commit = (input: HTMLInputElement) => {
    const name = input.value.trim();
    if (name && name !== props.value) props.onCommit(name);
    else setValue(props.value);
  };
  return (
    <label class="field">
      <span>{t(props.label)}</span>
      <input
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = props.value;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

const HINTS: Record<ToolId, Key> = {
  select: "hintSelect",
  rect: "hintRect",
  polygon: "hintPolygon",
  brush: "hintBrush",
  item: "hintItem",
  door: "hintDoor",
  barrier: "hintBarrier",
  light: "hintLight",
};

function StatusBar({ editor }: { editor: Editor }) {
  return (
    <footer class="status">
      {editor.attachPicking ? t("hintAttach") : `${t(HINTS[editor.tool])} · ${t("hintCommon")}`}
    </footer>
  );
}

function SettingsDialog({ editor }: { editor: Editor }) {
  const s = editor.doc.settings;
  const close = () => editor.setSettingsOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div class="backdrop" onClick={close}>
      <div class="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{t("settings")}</h2>
        <label class="check">
          <input
            type="checkbox"
            checked={s.grid}
            onChange={(e) => editor.setSettings({ grid: e.currentTarget.checked })}
          />
          {t("grid")}
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={s.fog}
            onChange={(e) => editor.setSettings({ fog: e.currentTarget.checked })}
          />
          {t("fogSetting")}
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={editor.showFog}
            onChange={(e) => editor.setShowFog(e.currentTarget.checked)}
          />
          {t("showFog")}
        </label>
        <div class="field">
          <span>{t("snap")}</span>
          <div class="segmented">
            <button class={s.snap === 1 ? "active" : ""} onClick={() => editor.setSettings({ snap: 1 })}>
              {t("snapCell")}
            </button>
            <button class={s.snap === 0.5 ? "active" : ""} onClick={() => editor.setSettings({ snap: 0.5 })}>
              {t("snapHalf")}
            </button>
          </div>
        </div>
        <label class="field">
          <span>{t("exportScale")}</span>
          <select
            value={String(s.exportPxPerCell)}
            onChange={(e) => editor.setSettings({ exportPxPerCell: Number(e.currentTarget.value) })}
          >
            {[50, 70, 100, 140, 150, 200].map((px) => (
              <option key={px} value={px}>
                {px}
              </option>
            ))}
          </select>
        </label>
        <div class="dialog-actions">
          <button onClick={close}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}

const BARRIER_TYPES: [BarrierType, Key][] = [
  ["window", "barrierWindow"],
  ["bars", "barrierBars"],
  ["curtain", "barrierCurtain"],
  ["bushes", "barrierBushes"],
  ["crayon", "barrierCrayon"],
];

const LIGHT_PRESET_KEYS: [LightPreset, Key][] = [
  ["torch", "lightTorch"],
  ["candle", "lightCandle"],
  ["brazier", "lightBrazier"],
  ["campfire", "lightCampfire"],
  ["lantern", "lightLantern"],
];

function ToolOptions({ editor }: { editor: Editor }) {
  return (
    <section class="objects">
      {editor.tool === "barrier" ? (
        <>
          <h2>{t("barrierKind")}</h2>
          <div class="segmented wrap">
            {BARRIER_TYPES.map(([type, key]) => (
              <button
                key={type}
                class={editor.barrierType === type ? "active" : ""}
                onClick={() => editor.setBarrierType(type)}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div class="muted small">{t("hintBarrier")}</div>
        </>
      ) : (
        <>
          <h2>{t("lightSources")}</h2>
          <div class="item-grid">
            {[
              ...LIGHT_SOURCES.map((l) => ({ id: l.id, item: catalogItem(l.lit) })),
              { id: "symbol", item: catalogItem("classic/light") },
            ].map(
              ({ id, item }) =>
                item && (
                  <button
                    key={id}
                    class={`item-cell${editor.lightSource === id ? " active" : ""}`}
                    title={item.name[lang()]}
                    onClick={() => editor.setLightSource(id)}
                  >
                    <img src={builtinSrc(item)} alt="" />
                    <span>{id === "symbol" ? t("lightSymbol") : item.name[lang()]}</span>
                  </button>
                ),
            )}
          </div>
          <div class="muted small">{t("hintLight")}</div>
        </>
      )}
    </section>
  );
}

function NumberSlider(props: {
  label: Key;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label class="slider">
      <span>{t(props.label)}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      />
      <span class="value">{props.value}</span>
    </label>
  );
}

function LightFields({ editor, item }: { editor: Editor; item: ItemObject }) {
  const light = item.light;
  return (
    <div class="sub">
      <label class="check" title={t("blocksLight")}>
        <input
          type="checkbox"
          checked={item.blocksLight}
          onChange={(e) => editor.update(item.id, { blocksLight: e.currentTarget.checked })}
        />
        {t("blocksLight")}
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={!!light}
          onChange={(e) => editor.setLight(item.id, e.currentTarget.checked ? {} : null)}
        />
        {t("lightOn")}
      </label>
      {light && (
        <>
          <div class="segmented wrap">
            {LIGHT_PRESET_KEYS.map(([preset, key]) => (
              <button key={preset} onClick={() => editor.setLight(item.id, { ...LIGHT_PRESETS[preset] })}>
                {t(key)}
              </button>
            ))}
          </div>
          <label class="check">
            <input
              type="checkbox"
              checked={light.lit}
              onChange={(e) => editor.setLight(item.id, { lit: e.currentTarget.checked })}
            />
            {t("lightLit")}
          </label>
          <NumberSlider
            label="lightRange"
            min={1}
            max={30}
            step={0.5}
            value={light.range}
            onChange={(v) => editor.setLight(item.id, { range: v })}
          />
          <NumberSlider
            label="lightSoftness"
            min={0}
            max={1}
            step={0.05}
            value={light.softness}
            onChange={(v) => editor.setLight(item.id, { softness: v })}
          />
          <NumberSlider
            label="lightAngle"
            min={20}
            max={360}
            step={5}
            value={light.angle}
            onChange={(v) => editor.setLight(item.id, { angle: v })}
          />
          <NumberSlider
            label="lightSize"
            min={0.02}
            max={1}
            step={0.02}
            value={light.size}
            onChange={(v) => editor.setLight(item.id, { size: v })}
          />
          <label class="check">
            <input
              type="checkbox"
              checked={light.dim}
              onChange={(e) => editor.setLight(item.id, { dim: e.currentTarget.checked })}
            />
            {t("lightDim")}
          </label>
        </>
      )}
    </div>
  );
}

const DOOR_LOOKS = CATALOG.filter((c) => c.category === "doors" && !/window|curtain|portcullis/.test(c.id));

function DoorFields({ editor, door }: { editor: Editor; door: DoorObject }) {
  return (
    <div class="sub">
      <label class="check">
        <input
          type="checkbox"
          checked={door.open}
          onChange={(e) => editor.update(door.id, { open: e.currentTarget.checked })}
        />
        {t("doorOpen")}
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={door.players}
          onChange={(e) => editor.update(door.id, { players: e.currentTarget.checked })}
        />
        {t("doorPlayers")}
      </label>
      <label class="field">
        <span>{t("doorLook")}</span>
        <select
          value={door.look ?? ""}
          onChange={(e) => editor.update(door.id, { look: e.currentTarget.value || null })}
        >
          <option value="">{t("doorSymbol")}</option>
          {DOOR_LOOKS.map((c) => (
            <option key={c.id} value={BUILTIN + c.id}>
              {c.name[lang()]} ({t(c.set === "sketch" ? "setSketch" : "setClassic")})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function BarrierFields({ editor, barrier }: { editor: Editor; barrier: BarrierObject }) {
  return (
    <div class="sub">
      <div class="segmented wrap">
        {BARRIER_TYPES.map(([type, key]) => (
          <button
            key={type}
            class={barrier.barrier === type ? "active" : ""}
            onClick={() => editor.update(barrier.id, { barrier: type })}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={barrier.blocksSight}
          onChange={(e) => editor.update(barrier.id, { blocksSight: e.currentTarget.checked })}
        />
        {t("blocksSight")}
      </label>
      {barrier.barrier === "crayon" && (
        <label class="slider">
          <span>{t("barrierColor")}</span>
          <input
            type="color"
            value={barrier.color}
            onChange={(e) => editor.update(barrier.id, { color: e.currentTarget.value })}
          />
        </label>
      )}
    </div>
  );
}
