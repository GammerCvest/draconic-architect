import {
  deserialize,
  emptyDoc,
  History,
  newId,
  newLayer,
  serialize,
  type FloorObject,
  type ItemObject,
  type MapAsset,
  type Group,
  type Layer,
  type LayerRole,
  type MapDoc,
  type MapObject,
  type MapSettings,
} from "./doc";
import {
  boundarySegments,
  bounds,
  shapesTouch,
  containsPoint,
  distToSegment,
  flip,
  rotate90,
  subtractShapes,
  translate,
  unionBox,
  unionShapes,
  type Box,
  type MultiPolygon,
  type Pair,
  type Vec,
} from "./geometry";
import { lang, t } from "./i18n";
import { assetInfo, USER } from "./items/resolve";
import type { DrawItem } from "./render/renderer";
import type { Scene, StyledRegion } from "./render/renderer";
import { DEFAULT_STYLE_ID, PRESETS } from "./style/presets";
import type { MapStyle } from "./style/types";
import { View } from "./view";

export type ToolId = "select" | "rect" | "polygon" | "brush" | "item";
export type DrawMode = "floor" | "carve" | "room";

const AUTOSAVE_KEY = "da.autosave";

interface Clip {
  objects: MapObject[];
  groups: Group[];
  assets: Record<string, MapAsset>;
}

export class Editor {
  readonly history: History;
  readonly view = new View();
  selection: ReadonlySet<string> = new Set();
  activeLayer: string;
  allLayers = false;
  tool: ToolId = "select";
  drawMode: DrawMode = "floor";
  settingsOpen = false;
  stylesOpen = false;
  itemBrush: string | null = null;
  attachPicking = false;
  preview: MapDoc | null = null;
  pointer: Vec | null = null;
  private clipboard: Clip = { objects: [], groups: [], assets: {} };
  private listeners = new Set<() => void>();
  private stackKey: MapObject[] | null = null;
  private stackLayers: Layer[] | null = null;
  private stackCache: MapObject[] = [];
  private floorKey: MapObject[] | null = null;
  private floorCache: MultiPolygon = [];
  private sceneKey: unknown[] = [];
  private sceneCache: Scene | null = null;
  private autosaveTimer = 0;

  constructor() {
    this.history = new History(loadAutosave(), () => this.onDocChange());
    this.activeLayer = this.history.doc.layers[0].id;
  }

  get doc(): MapDoc {
    return this.preview ?? this.history.doc;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  private onDocChange() {
    const layers = new Map(this.history.doc.layers.map((l) => [l.id, l]));
    const editable = new Set(
      this.history.doc.objects
        .filter((o) => {
          const l = layers.get(o.layer);
          return l && !l.hidden && !l.locked;
        })
        .map((o) => o.id),
    );
    const kept = [...this.selection].filter((id) => editable.has(id));
    if (kept.length !== this.selection.size) this.selection = new Set(kept);
    if (!layers.has(this.activeLayer)) this.activeLayer = this.history.doc.layers[0].id;
    this.emit();
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, serialize(this.history.doc));
      } catch {}
    }, 400);
  }

  undo() {
    this.preview = null;
    this.history.undo();
  }

  redo() {
    this.preview = null;
    this.history.redo();
  }

  commit(next: MapDoc) {
    this.preview = null;
    this.history.commit(tidy(next));
  }

  setPreview(doc: MapDoc | null) {
    this.preview = doc;
    this.emit();
  }

  layer(id: string): Layer {
    return this.doc.layers.find((l) => l.id === id) ?? this.doc.layers[0];
  }

  byId(id: string): MapObject | undefined {
    return this.doc.objects.find((o) => o.id === id);
  }

  stacked(): MapObject[] {
    const doc = this.doc;
    if (doc.objects === this.stackKey && doc.layers === this.stackLayers) return this.stackCache;
    const rank = new Map(doc.layers.map((l, i) => [l.id, i]));
    const order = new Map(doc.objects.map((o, i) => [o.id, i]));
    this.stackCache = [...doc.objects].sort(
      (a, b) => (rank.get(a.layer) ?? 0) - (rank.get(b.layer) ?? 0) || a.z - b.z || order.get(a.id)! - order.get(b.id)!,
    );
    this.stackKey = doc.objects;
    this.stackLayers = doc.layers;
    return this.stackCache;
  }

  floor(): MultiPolygon {
    const stack = this.stacked();
    if (stack === this.floorKey) return this.floorCache;
    let floor: MultiPolygon = [];
    for (const o of stack) {
      if (o.kind !== "floor" || !this.visible(o)) continue;
      floor = o.carve ? subtractShapes(floor, o.shape) : unionShapes(floor, o.shape);
    }
    this.floorKey = stack;
    this.floorCache = floor;
    return floor;
  }

  style(id: string | null | undefined): MapStyle {
    const styles = this.doc.styles;
    return styles.find((s) => s.id === id) ?? styles.find((s) => s.id === this.doc.settings.style) ?? styles[0];
  }

  styleOf(o: MapObject): string {
    return this.style(o.style ?? this.layer(o.layer).style ?? this.doc.settings.style).id;
  }

  scene(): Scene {
    const doc = this.doc;
    const key = [this.stacked(), doc.styles, doc.settings.style, doc.layers];
    if (this.sceneCache && key.every((k, i) => k === this.sceneKey[i])) return this.sceneCache;
    const pieces = new Map<string, MultiPolygon>();
    for (const o of this.stacked()) {
      if (o.kind !== "floor" || !this.visible(o)) continue;
      const sid = this.styleOf(o);
      for (const [id, shape] of pieces) {
        if (o.carve || id !== sid) pieces.set(id, subtractShapes(shape, o.shape));
      }
      if (!o.carve) pieces.set(sid, unionShapes(pieces.get(sid) ?? [], o.shape));
    }
    const regions: StyledRegion[] = doc.styles
      .filter((st) => (pieces.get(st.id)?.length ?? 0) > 0)
      .map((st) => ({ style: st, shape: pieces.get(st.id)! }));
    this.sceneKey = key;
    this.sceneCache = { floor: this.floor(), regions, base: this.style(doc.settings.style) };
    return this.sceneCache;
  }

  drawItems(): DrawItem[] {
    const out: DrawItem[] = [];
    for (const o of this.stacked()) {
      if (o.kind !== "item" || !this.visible(o)) continue;
      const info = assetInfo(this.doc, o.asset, lang());
      const ring = o.shape[0]?.[0];
      if (!info || !ring || ring.length < 4) continue;
      out.push({
        src: info.src,
        tint: o.tint ? this.style(o.style ?? this.layer(o.layer).style ?? this.doc.settings.style).walls.color : null,
        corners: [ring[0], ring[1], ring[3]],
      });
    }
    return out;
  }

  visible(o: MapObject): boolean {
    return !o.hidden && !this.layer(o.layer).hidden;
  }

  groupChain(o: MapObject): string[] {
    const chain: string[] = [];
    const groups = this.doc.groups;
    let id = o.group;
    while (id && !chain.includes(id)) {
      chain.push(id);
      id = groups.find((g) => g.id === id)?.parent ?? null;
    }
    return chain;
  }

  outerGroup(o: MapObject): string | null {
    const chain = this.groupChain(o);
    return chain.length ? chain[chain.length - 1] : null;
  }

  group(id: string): Group | undefined {
    return this.doc.groups.find((g) => g.id === id);
  }

  members(groupId: string): MapObject[] {
    return this.doc.objects.filter((o) => this.groupChain(o).includes(groupId));
  }

  expand(ids: Iterable<string>): string[] {
    const out = new Set<string>();
    for (const id of ids) {
      const o = this.byId(id);
      if (!o) continue;
      const top = this.outerGroup(o);
      if (top) for (const m of this.members(top)) out.add(m.id);
      else out.add(id);
    }
    return [...out];
  }

  withAttached(ids: Iterable<string>, doc = this.doc): Set<string> {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of doc.objects) {
        if (o.attachedTo && out.has(o.attachedTo) && !out.has(o.id)) {
          out.add(o.id);
          grew = true;
        }
      }
    }
    return out;
  }

  selectedGroup(): Group | null {
    const sel = this.selected();
    if (sel.length === 0) return null;
    const top = this.outerGroup(sel[0]);
    if (!top) return null;
    const members = this.members(top);
    if (members.length !== sel.length || !members.every((m) => this.selection.has(m.id))) return null;
    return this.group(top) ?? null;
  }

  groupSelection() {
    const sel = this.selected();
    if (sel.length < 2) return;
    const doc = this.history.doc;
    const g: Group = { id: newId(), name: `${t("defaultGroup")} ${doc.groups.length + 1}`, parent: null };
    const whole = new Set<string>();
    for (const o of sel) {
      const top = this.outerGroup(o);
      if (top && this.members(top).every((m) => this.selection.has(m.id))) whole.add(top);
    }
    const groups = [...doc.groups.map((x) => (whole.has(x.id) ? { ...x, parent: g.id } : x)), g];
    const objects = doc.objects.map((o) => {
      if (!this.selection.has(o.id)) return o;
      const top = this.outerGroup(o);
      return top && whole.has(top) ? o : { ...o, group: g.id };
    });
    this.commit({ ...doc, groups, objects });
  }

  ungroupSelection() {
    const doc = this.history.doc;
    const tops = new Set<string>();
    for (const o of this.selected()) {
      const top = this.outerGroup(o);
      if (top) tops.add(top);
    }
    if (tops.size === 0) return;
    const parentOf = new Map(doc.groups.map((g) => [g.id, g.parent]));
    const lift = (id: string | null) => (id && tops.has(id) ? (parentOf.get(id) ?? null) : id);
    this.commit({
      ...doc,
      groups: doc.groups.filter((g) => !tops.has(g.id)).map((g) => ({ ...g, parent: lift(g.parent) })),
      objects: doc.objects.map((o) => (o.group && tops.has(o.group) ? { ...o, group: lift(o.group) } : o)),
    });
  }

  renameGroup(id: string, name: string) {
    const doc = this.history.doc;
    this.commit({ ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, name } : g)) });
  }

  connected(id: string): string[] {
    const pool = this.doc.objects.filter((o) => !o.hidden && this.selectable(o));
    const start = pool.find((o) => o.id === id);
    if (!start) return [];
    const found = new Set([start.id]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const o of pool) {
        if (!found.has(o.id) && shapesTouch(cur.shape, o.shape)) {
          found.add(o.id);
          queue.push(o);
        }
      }
    }
    return this.expand(found);
  }

  mergeSelection() {
    const doc = this.history.doc;
    const stack = this.stacked();
    const sel = stack.filter((o) => this.selection.has(o.id) && this.visible(o));
    const made = new Map<string, MapObject>();
    const gone = new Map<string, string>();
    const fuse = (items: MapObject[]) => {
      if (items.length < 2) return;
      const from = stack.indexOf(items[0]);
      const to = stack.indexOf(items[items.length - 1]);
      let shape: MultiPolygon = [];
      for (const o of stack.slice(from, to + 1)) {
        const picked = items.includes(o);
        if (o.kind === "floor" && o.carve && (picked || (items[0].kind === "floor" && this.visible(o)))) {
          shape = subtractShapes(shape, o.shape);
        } else if (picked) {
          shape = unionShapes(shape, o.shape);
        }
      }
      if (shape.length === 0) return;
      const top = items[items.length - 1];
      const first = items.find((o) => !(o.kind === "floor" && o.carve)) ?? top;
      const sameGroup = items.every((o) => o.group === items[0].group);
      const base = {
        ...top,
        id: newId(),
        name: first.name,
        style: first.style,
        group: sameGroup ? top.group : null,
        shape,
      };
      const obj: MapObject =
        top.kind === "room" ? { ...base, kind: "room" } : ({ ...base, kind: "floor", carve: false } as MapObject);
      made.set(top.id, obj);
      for (const o of items) gone.set(o.id, obj.id);
    };
    fuse(sel.filter((o) => o.kind === "floor"));
    fuse(sel.filter((o) => o.kind === "room"));
    if (made.size === 0) return;
    const objects: MapObject[] = [];
    for (const o of doc.objects) {
      const replacement = made.get(o.id);
      if (replacement) objects.push(replacement);
      else if (!gone.has(o.id))
        objects.push(o.attachedTo && gone.has(o.attachedTo) ? { ...o, attachedTo: gone.get(o.attachedTo)! } : o);
    }
    this.commit({ ...doc, objects });
    this.select([...made.values()].map((o) => o.id));
  }

  startAttach() {
    if (this.selection.size === 0) return;
    this.tool = "select";
    this.attachPicking = true;
    this.emit();
  }

  cancelAttach() {
    if (!this.attachPicking) return;
    this.attachPicking = false;
    this.emit();
  }

  attachTo(parentId: string) {
    this.attachPicking = false;
    const doc = this.history.doc;
    const ancestors = new Set<string>();
    let cur: string | null = parentId;
    while (cur && !ancestors.has(cur)) {
      ancestors.add(cur);
      cur = doc.objects.find((o) => o.id === cur)?.attachedTo ?? null;
    }
    const ids = new Set([...this.selection].filter((id) => !ancestors.has(id)));
    this.commit(this.mapIds(ids, (o) => ({ ...o, attachedTo: parentId })));
  }

  detachSelected() {
    this.commit(this.mapIds(this.selection, (o) => ({ ...o, attachedTo: null })));
  }

  selectable(o: MapObject): boolean {
    const layer = this.layer(o.layer);
    return !layer.hidden && !layer.locked && (this.allLayers || o.layer === this.activeLayer);
  }

  pick(p: Vec, tolerance: number): MapObject | null {
    const objs = this.stacked().filter((o) => !o.hidden && this.selectable(o));
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.kind === "room") {
        if (boundarySegments(o.shape).some((s) => distToSegment(p.x, p.y, s) <= tolerance)) return o;
      } else if (containsPoint(o.shape, p.x, p.y)) {
        return o;
      }
    }
    for (let i = objs.length - 1; i >= 0; i--) {
      if (objs[i].kind === "room" && containsPoint(objs[i].shape, p.x, p.y)) return objs[i];
    }
    return null;
  }

  select(ids: Iterable<string>, additive = false) {
    const list = [...ids];
    let next: Set<string>;
    if (additive) {
      next = new Set(this.selection);
      const all = list.length > 0 && list.every((id) => next.has(id));
      for (const id of list) all ? next.delete(id) : next.add(id);
    } else {
      next = new Set(list);
    }
    this.selection = next;
    this.emit();
  }

  selectAll() {
    this.select(this.doc.objects.filter((o) => !o.hidden && this.selectable(o)).map((o) => o.id));
  }

  selected(): MapObject[] {
    return this.doc.objects.filter((o) => this.selection.has(o.id));
  }

  selectionBox(doc = this.doc): Box | null {
    let box: Box | null = null;
    for (const o of doc.objects) if (this.selection.has(o.id)) box = unionBox(box, bounds(o.shape));
    return box;
  }

  setActiveLayer(layer: string) {
    this.activeLayer = layer;
    if (!this.allLayers) this.selection = new Set([...this.selection].filter((id) => this.byId(id)?.layer === layer));
    this.emit();
  }

  setAllLayers(on: boolean) {
    this.allLayers = on;
    this.emit();
  }

  addDrawn(shape: MultiPolygon, mode: DrawMode) {
    const doc = this.history.doc;
    const layer = this.layer(this.activeLayer);
    if (layer.locked) return;
    const base = {
      id: newId(),
      layer: layer.id,
      hidden: false,
      z: 0,
      group: null,
      attachedTo: null,
      style: null,
      shape,
    };
    let obj: MapObject;
    if (mode === "room") {
      const n = doc.objects.filter((o) => o.kind === "room").length + 1;
      obj = { ...base, kind: "room", name: `${t("defaultRoom")} ${n}` };
    } else {
      const carve = mode === "carve";
      const n = doc.objects.filter((o) => o.kind === "floor" && o.carve === carve).length + 1;
      obj = { ...base, kind: "floor", carve, name: `${t(carve ? "defaultCarve" : "defaultFloor")} ${n}` };
    }
    const layers = layer.hidden ? doc.layers.map((l) => (l.id === layer.id ? { ...l, hidden: false } : l)) : doc.layers;
    this.commit({ ...doc, layers, objects: [...doc.objects, obj] });
  }

  addItem(asset: string, at: Vec) {
    const doc = this.history.doc;
    const layer = this.layer(this.activeLayer);
    const info = assetInfo(doc, asset, lang());
    if (layer.locked || !info) return;
    const s = doc.settings.snap;
    const x = Math.round((at.x - info.w / 2) / s) * s;
    const y = Math.round((at.y - info.h / 2) / s) * s;
    const item: ItemObject = {
      id: newId(),
      kind: "item",
      layer: layer.id,
      name: info.name,
      hidden: false,
      z: 0,
      group: null,
      attachedTo: null,
      style: null,
      asset,
      tint: true,
      shape: [
        [
          [
            [x, y],
            [x + info.w, y],
            [x + info.w, y + info.h],
            [x, y + info.h],
          ],
        ],
      ],
    };
    const layers = layer.hidden ? doc.layers.map((l) => (l.id === layer.id ? { ...l, hidden: false } : l)) : doc.layers;
    this.commit({ ...doc, layers, objects: [...doc.objects, item] });
  }

  addAsset(asset: MapAsset): string {
    const key = USER + newId();
    const doc = this.history.doc;
    this.commit({ ...doc, assets: { ...doc.assets, [key]: asset } });
    return key;
  }

  setItemSize(id: string, w: number, h: number) {
    if (!(w > 0 && h > 0)) return;
    this.commit(
      this.mapIds(new Set([id]), (o) => {
        const ring = o.shape[0]?.[0];
        if (o.kind !== "item" || !ring || ring.length < 4) return o;
        const [p0, p1, , p3] = ring;
        const ux = p1[0] - p0[0];
        const uy = p1[1] - p0[1];
        const vx = p3[0] - p0[0];
        const vy = p3[1] - p0[1];
        const lu = Math.hypot(ux, uy) || 1;
        const lv = Math.hypot(vx, vy) || 1;
        const a: Pair = [p0[0] + (ux / lu) * w, p0[1] + (uy / lu) * w];
        const c: Pair = [p0[0] + (vx / lv) * h, p0[1] + (vy / lv) * h];
        return { ...o, shape: [[[p0, a, [a[0] + c[0] - p0[0], a[1] + c[1] - p0[1]], c]]] };
      }),
    );
  }

  setItemBrush(asset: string | null) {
    this.itemBrush = asset;
    this.emit();
  }

  private mapIds(ids: ReadonlySet<string>, fn: (o: MapObject) => MapObject, base = this.history.doc): MapDoc {
    let changed = false;
    const objects = base.objects.map((o) => {
      if (!ids.has(o.id)) return o;
      const next = fn(o);
      if (sameObject(o, next)) return o;
      changed = true;
      return next;
    });
    return changed ? { ...base, objects } : base;
  }

  mapPlaced(fn: (o: MapObject) => MapObject, base = this.history.doc): MapDoc {
    const ids = new Set(
      [...this.withAttached(this.selection, base)].filter((id) => {
        const o = base.objects.find((x) => x.id === id);
        return this.selection.has(id) || (o && !this.layer(o.layer).locked);
      }),
    );
    return this.mapIds(ids, fn, base);
  }

  update(id: string, patch: Partial<Omit<FloorObject, "kind">> & Partial<Omit<ItemObject, "kind">>) {
    this.commit(this.mapIds(new Set([id]), (o) => ({ ...o, ...patch }) as MapObject));
  }

  setHidden(ids: Iterable<string>, hidden: boolean) {
    this.commit(this.mapIds(new Set(ids), (o) => ({ ...o, hidden })));
  }

  moveSelected(dx: number, dy: number) {
    if (this.selection.size === 0) return;
    this.commit(this.mapPlaced((o) => ({ ...o, shape: translate(o.shape, dx, dy) })));
  }

  rotateSelected(dir: 1 | -1) {
    const c = this.pivot();
    if (!c) return;
    this.commit(this.mapPlaced((o) => ({ ...o, shape: rotate90(o.shape, c.x, c.y, dir) })));
  }

  flipSelected(axis: "h" | "v") {
    const c = this.pivot();
    if (!c) return;
    this.commit(this.mapPlaced((o) => ({ ...o, shape: flip(o.shape, c.x, c.y, axis) })));
  }

  private pivot(): Vec | null {
    const box = this.selectionBox(this.history.doc);
    if (!box) return null;
    const s = this.doc.settings.snap;
    return { x: Math.round((box.minX + box.maxX) / 2 / s) * s, y: Math.round((box.minY + box.maxY) / 2 / s) * s };
  }

  deleteSelected() {
    if (this.selection.size === 0) return;
    const doc = this.history.doc;
    this.commit({ ...doc, objects: doc.objects.filter((o) => !this.selection.has(o.id)) });
  }

  copy() {
    const doc = this.history.doc;
    const ids = this.withAttached(this.selection, doc);
    const objects = doc.objects.filter((o) => ids.has(o.id));
    const groups = doc.groups.filter((g) => {
      const members = doc.objects.filter((o) => this.groupChain(o).includes(g.id));
      return members.length > 0 && members.every((m) => ids.has(m.id));
    });
    const assets: Record<string, MapAsset> = {};
    for (const o of objects) if (o.kind === "item" && doc.assets[o.asset]) assets[o.asset] = doc.assets[o.asset];
    this.clipboard = structuredClone({ objects, groups, assets });
  }

  cut() {
    this.copy();
    this.deleteSelected();
  }

  paste() {
    if (this.clipboard.objects.length === 0) return;
    let box: Box | null = null;
    for (const o of this.clipboard.objects) box = unionBox(box, bounds(o.shape));
    let dx = 1;
    let dy = 1;
    if (box && this.pointer) {
      const s = this.doc.settings.snap;
      dx = Math.round((this.pointer.x - box.minX) / s) * s;
      dy = Math.round((this.pointer.y - box.minY) / s) * s;
    }
    this.insertCopies(this.clipboard, dx, dy);
  }

  duplicate() {
    if (this.selection.size === 0) return;
    const saved = this.clipboard;
    this.copy();
    const clip = this.clipboard;
    this.clipboard = saved;
    this.insertCopies(clip, 1, 1);
  }

  private insertCopies(clip: Clip, dx: number, dy: number) {
    const ids = new Map(clip.objects.map((o) => [o.id, newId()]));
    const gids = new Map(clip.groups.map((g) => [g.id, newId()]));
    const parentOf = new Map(clip.groups.map((g) => [g.id, g.parent]));
    const nearestCopied = (id: string | null): string | null => {
      const seen = new Set<string>();
      while (id && !gids.has(id) && !seen.has(id)) {
        seen.add(id);
        id = parentOf.get(id) ?? null;
      }
      return id && gids.has(id) ? gids.get(id)! : null;
    };
    const groups = clip.groups.map((g) => ({ ...g, id: gids.get(g.id)!, parent: nearestCopied(g.parent) }));
    const doc = this.history.doc;
    const layerIds = new Set(doc.layers.map((l) => l.id));
    const objects = clip.objects.map((o) => ({
      ...structuredClone(o),
      id: ids.get(o.id)!,
      layer: layerIds.has(o.layer) ? o.layer : this.activeLayer,
      group: nearestCopied(o.group),
      attachedTo: o.attachedTo ? (ids.get(o.attachedTo) ?? o.attachedTo) : null,
      shape: translate(o.shape, dx, dy),
    }));
    this.commit({
      ...doc,
      assets: { ...clip.assets, ...doc.assets },
      groups: [...doc.groups, ...groups],
      objects: [...doc.objects, ...objects],
    });
    this.select(objects.map((o) => o.id));
  }

  reorder(dir: 1 | -1) {
    if (this.selection.size === 0) return;
    this.commit(this.mapIds(this.selection, (o) => ({ ...o, z: o.z + dir })));
  }

  setPriority(z: number) {
    if (this.selection.size === 0 || !Number.isFinite(z)) return;
    this.commit(this.mapIds(this.selection, (o) => ({ ...o, z: Math.round(z) })));
  }

  moveToLayer(layerId: string) {
    if (this.selection.size === 0) return;
    this.commit(this.mapIds(this.selection, (o) => ({ ...o, layer: layerId })));
    if (!this.allLayers) {
      this.activeLayer = layerId;
      this.emit();
    }
  }

  private setLayers(layers: Layer[], objects = this.history.doc.objects) {
    this.commit({ ...this.history.doc, layers, objects });
  }

  setLayerState(id: string, patch: Partial<Layer>) {
    this.setLayers(this.history.doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  addLayer() {
    const layers = [...this.history.doc.layers];
    const layer = newLayer(`${t("defaultLayer")} ${layers.length + 1}`);
    const at = layers.findIndex((l) => l.id === this.activeLayer);
    layers.splice(at + 1, 0, layer);
    this.activeLayer = layer.id;
    this.setLayers(layers);
  }

  deleteLayer(id: string) {
    const doc = this.history.doc;
    if (doc.layers.length <= 1) return;
    this.setLayers(
      doc.layers.filter((l) => l.id !== id),
      doc.objects.filter((o) => o.layer !== id),
    );
  }

  moveLayer(id: string, dir: 1 | -1) {
    const layers = [...this.history.doc.layers];
    const i = layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    this.setLayers(layers);
  }

  setSettings(patch: Partial<MapSettings>) {
    const doc = this.history.doc;
    this.commit({ ...doc, settings: { ...doc.settings, ...patch } });
  }

  addStyle(style: MapStyle, fresh = false): string {
    const doc = this.history.doc;
    if (!fresh && doc.styles.some((s) => s.id === style.id)) return style.id;
    const copy: MapStyle = { ...structuredClone(style), id: fresh ? newId() : style.id };
    this.commit({ ...doc, styles: [...doc.styles, copy] });
    return copy.id;
  }

  updateStyle(id: string, fn: (s: MapStyle) => MapStyle) {
    const doc = this.history.doc;
    this.commit({ ...doc, styles: doc.styles.map((s) => (s.id === id ? fn(s) : s)) });
  }

  removeStyle(id: string) {
    const doc = this.history.doc;
    if (doc.styles.length <= 1 || id === doc.settings.style) return;
    this.commit({
      ...doc,
      styles: doc.styles.filter((s) => s.id !== id),
      layers: doc.layers.map((l) => (l.style === id ? { ...l, style: null } : l)),
      objects: doc.objects.map((o) => (o.style === id ? { ...o, style: null } : o)),
    });
  }

  setMapStyle(id: string) {
    this.setSettings({ style: id });
  }

  setSelectionStyle(id: string | null) {
    if (this.selection.size === 0) return;
    this.commit(this.mapIds(this.selection, (o) => ({ ...o, style: id })));
  }

  setTool(tool: ToolId) {
    this.tool = tool;
    this.attachPicking = false;
    if (tool === "item") {
      const target = this.roleLayer("objects");
      if (target && target.id !== this.activeLayer) this.setActiveLayer(target.id);
    }
    this.emit();
  }

  private roleLayer(role: LayerRole): Layer | undefined {
    return [...this.doc.layers].reverse().find((l) => l.role === role && !l.locked);
  }

  setDrawMode(mode: DrawMode) {
    this.drawMode = mode;
    this.emit();
  }

  setStylesOpen(open: boolean) {
    this.stylesOpen = open;
    this.emit();
  }

  setSettingsOpen(open: boolean) {
    this.settingsOpen = open;
    this.emit();
  }

  newMap() {
    this.selection = new Set();
    this.history.replace(freshDoc());
  }

  load(text: string) {
    const doc = deserialize(text);
    this.selection = new Set();
    this.history.replace(doc);
  }

  save(): string {
    return serialize(this.history.doc);
  }
}

function tidy(doc: MapDoc): MapDoc {
  const ids = new Set(doc.objects.map((o) => o.id));
  const parentOf = new Map(doc.groups.map((g) => [g.id, g.parent]));
  const used = new Set<string>();
  for (const o of doc.objects) {
    let id = o.group;
    while (id && !used.has(id)) {
      used.add(id);
      id = parentOf.get(id) ?? null;
    }
  }
  const groups = doc.groups.length === used.size ? doc.groups : doc.groups.filter((g) => used.has(g.id));
  const stale = doc.objects.some((o) => o.attachedTo && !ids.has(o.attachedTo));
  const objects = stale
    ? doc.objects.map((o) => (o.attachedTo && !ids.has(o.attachedTo) ? { ...o, attachedTo: null } : o))
    : doc.objects;
  return groups === doc.groups && objects === doc.objects ? doc : { ...doc, groups, objects };
}

function loadAutosave(): MapDoc {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) return deserialize(saved);
  } catch {}
  return freshDoc();
}

export function presetCopy(id: string): MapStyle {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return { ...structuredClone(preset), name: t(preset.name as never) };
}

function freshDoc(): MapDoc {
  return emptyDoc(
    { floor: t("defaultFloorLayer"), rooms: t("defaultRoomsLayer"), objects: t("defaultObjectsLayer") },
    presetCopy(DEFAULT_STYLE_ID),
  );
}

function sameObject(a: MapObject, b: MapObject): boolean {
  const ka = Object.keys(a) as (keyof MapObject)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}
