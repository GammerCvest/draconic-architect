const PLUGIN = "dev.gammercvest.draconic-architect";

export const id = (name: string) => `${PLUGIN}/${name}`;

export const SOURCE = id("floor");
export const ART = id("art");
export const STYLE = id("style");
export const TOOL = id("tool");
export const MODE_RECT = id("mode-rect");
export const MODE_POLYGON = id("mode-polygon");
export const MODE_BRUSH = id("mode-brush");
export const ACTION_CARVE = id("action-carve");

export interface SourceData {
  carve: boolean;
}
