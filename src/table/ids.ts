const PLUGIN = "dev.gammercvest.draconic-architect";

export const id = (name: string) => `${PLUGIN}/${name}`;

export const SOURCE = id("floor");
export const ART = id("art");
export const STYLE = id("style");
export const TOOL = id("tool");
export const MODE_RECT = id("mode-rect");
export const MODE_POLYGON = id("mode-polygon");
export const MODE_BRUSH = id("mode-brush");
export const MODE_ITEM = id("mode-item");
export const ITEMS_POPOVER = id("items");
export const ACTION_CARVE = id("action-carve");
export const MODE_DOOR = id("mode-door");
export const MODE_BARRIER = id("mode-barrier");
export const MODE_LIGHT = id("mode-light");
export const PLAYER_TOOL = id("player-tool");
export const MODE_PLAYER_DOOR = id("mode-player-door");
export const DOOR = id("door");
export const BARRIER = id("barrier");
export const LIGHT = id("light");
export const BLOCKS = id("blocks-light");
export const FOG_OFF = id("fog-off");
export const DOOR_CHANNEL = id("door-toggle");
export const DYNAMIC_FOG_LIGHT = "rodeo.owlbear.dynamic-fog/light";

export interface DoorData {
  open: boolean;
  players: boolean;
  length: number;
}

export interface BarrierData {
  type: "window" | "bars" | "curtain" | "bushes" | "crayon";
  blocks: boolean;
  color: string;
  length: number;
}

export interface SourceData {
  carve: boolean;
}
