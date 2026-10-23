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
