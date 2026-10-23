import type { MultiPolygon } from "./geometry";
import type { LightData } from "./light";
import type { MapStyle } from "./style/types";

const FILE_KIND = "draconic-architect";
export const FILE_VERSION = 7;

export type LayerRole = "floor" | "rooms" | "objects";

export interface Layer {
  id: string;
  name: string;
  role?: LayerRole;
  hidden: boolean;
  locked: boolean;
  style: string | null;
}

export interface Group {
  id: string;
  name: string;
  parent: string | null;
}

interface BaseObject {
  id: string;
  layer: string;
  name: string;
  hidden: boolean;
  z: number;
  group: string | null;
  attachedTo: string | null;
  style: string | null;
  shape: MultiPolygon;
}

export interface FloorObject extends BaseObject {
  kind: "floor";
  carve: boolean;
}

export interface RoomObject extends BaseObject {
  kind: "room";
}

export interface ItemObject extends BaseObject {
  kind: "item";
  asset: string;
  tint: boolean;
  light: LightData | null;
  blocksLight: boolean;
}

export interface DoorObject extends BaseObject {
  kind: "door";
  open: boolean;
  players: boolean;
  look: string | null;
}

export type BarrierType = "window" | "bars" | "curtain" | "bushes" | "crayon";

export interface BarrierObject extends BaseObject {
  kind: "barrier";
  barrier: BarrierType;
  blocksSight: boolean;
  color: string;
}

export type MapObject = FloorObject | RoomObject | ItemObject | DoorObject | BarrierObject;

export interface MapAsset {
  name: string;
  data: string;
  w: number;
  h: number;
}

export interface MapSettings {
  grid: boolean;
  snap: 1 | 0.5;
  exportPxPerCell: number;
  style: string;
  fog: boolean;
}

export interface MapDoc {
  objects: MapObject[];
  groups: Group[];
  assets: Record<string, MapAsset>;
  styles: MapStyle[];
  layers: Layer[];
  settings: MapSettings;
}

function defaultSettings(style: string): MapSettings {
  return { grid: true, snap: 1, exportPxPerCell: 100, style, fog: true };
}

export function newLayer(name: string, role?: LayerRole): Layer {
  return { id: newId(), name, hidden: false, locked: false, style: null, ...(role && { role }) };
}

export function emptyDoc(names: { floor: string; rooms: string; objects: string }, style: MapStyle): MapDoc {
  return {
    objects: [],
    groups: [],
    assets: {},
    styles: [style],
    layers: [newLayer(names.floor, "floor"), newLayer(names.rooms, "rooms"), newLayer(names.objects, "objects")],
    settings: defaultSettings(style.id),
  };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function serialize(doc: MapDoc): string {
  return JSON.stringify({ kind: FILE_KIND, version: FILE_VERSION, ...doc });
}

export function deserialize(text: string): MapDoc {
  const data = JSON.parse(text);
  if (
    !data ||
    data.kind !== FILE_KIND ||
    data.version !== FILE_VERSION ||
    !Array.isArray(data.objects) ||
    !Array.isArray(data.layers) ||
    !Array.isArray(data.groups) ||
    !Array.isArray(data.styles) ||
    data.styles.length === 0 ||
    data.layers.length === 0
  ) {
    throw new Error("not a map file");
  }
  return {
    objects: data.objects,
    groups: data.groups,
    assets: data.assets ?? {},
    styles: data.styles,
    layers: data.layers,
    settings: { ...defaultSettings(data.styles[0].id), ...data.settings },
  };
}

const HISTORY_LIMIT = 200;

export class History {
  private past: MapDoc[] = [];
  private future: MapDoc[] = [];

  constructor(
    public doc: MapDoc,
    private onChange: () => void,
  ) {}

  commit(next: MapDoc) {
    if (next === this.doc) return;
    this.past.push(this.doc);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.doc = next;
    this.onChange();
  }

  replace(next: MapDoc) {
    this.past = [];
    this.future = [];
    this.doc = next;
    this.onChange();
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.doc);
    this.doc = prev;
    this.onChange();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.doc);
    this.doc = next;
    this.onChange();
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }
}
