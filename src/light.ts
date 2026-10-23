export interface LightData {
  lit: boolean;
  range: number;
  softness: number;
  angle: number;
  size: number;
  dim: boolean;
}

export type LightPreset = "torch" | "candle" | "brazier" | "campfire" | "lantern";

export const LIGHT_PRESETS: Record<LightPreset, Omit<LightData, "lit">> = {
  torch: { range: 6, softness: 0.2, angle: 360, size: 0.17, dim: false },
  candle: { range: 2, softness: 0.5, angle: 360, size: 0.08, dim: true },
  brazier: { range: 8, softness: 0.2, angle: 360, size: 0.25, dim: false },
  campfire: { range: 10, softness: 0.3, angle: 360, size: 0.3, dim: false },
  lantern: { range: 9, softness: 0.15, angle: 70, size: 0.1, dim: false },
};

export function presetLight(preset: LightPreset, lit = true): LightData {
  return { ...LIGHT_PRESETS[preset], lit };
}

export function dynamicFogLight(light: LightData, dpi: number) {
  return {
    attenuationRadius: light.range * dpi,
    sourceRadius: light.size * dpi,
    falloff: light.softness * 2,
    innerAngle: light.angle,
    outerAngle: light.angle,
    lightType: light.dim ? "SECONDARY" : "PRIMARY",
  };
}

export interface LightSource {
  id: string;
  preset: LightPreset;
  lit: string;
  unlit: string;
}

export const LIGHT_SOURCES: LightSource[] = [
  { id: "wall-torch", preset: "torch", lit: "sketch/wall-torch", unlit: "sketch/wall-torch-unlit" },
  { id: "standing-torch", preset: "torch", lit: "sketch/standing-torch", unlit: "sketch/standing-torch-unlit" },
  { id: "candle", preset: "candle", lit: "sketch/candle", unlit: "sketch/candle-unlit" },
  { id: "candelabra", preset: "candle", lit: "sketch/candelabra", unlit: "sketch/candelabra-unlit" },
  { id: "brazier", preset: "brazier", lit: "sketch/brazier", unlit: "sketch/brazier-unlit" },
  { id: "firepit", preset: "campfire", lit: "sketch/firepit", unlit: "sketch/firepit-unlit" },
  { id: "lantern", preset: "lantern", lit: "sketch/lantern", unlit: "sketch/lantern-unlit" },
];

export function sourceOf(catalogId: string): LightSource | undefined {
  return LIGHT_SOURCES.find((s) => s.lit === catalogId || s.unlit === catalogId);
}

export function pictureFor(catalogId: string, lit: boolean): string {
  const source = sourceOf(catalogId);
  return source ? (lit ? source.lit : source.unlit) : catalogId;
}
