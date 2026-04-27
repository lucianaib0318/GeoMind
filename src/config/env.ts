import path from "node:path";
import { config as loadDotEnv } from "dotenv";

loadDotEnv();

export interface GeoMindConfig {
  tencentMapKey?: string;
  feishuCliCommandTemplate?: string;
  geocodeCachePath: string;
  geocodeTimeoutMs: number;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Loads runtime configuration from environment variables and project defaults. */
export function loadGeoMindConfig(): GeoMindConfig {
  const tencentMapKey = optionalEnv("TENCENT_MAP_KEY");
  const feishuCliCommandTemplate = optionalEnv("FEISHU_CLI_COMMAND_TEMPLATE");

  return {
    ...(tencentMapKey ? { tencentMapKey } : {}),
    ...(feishuCliCommandTemplate ? { feishuCliCommandTemplate } : {}),
    geocodeCachePath: optionalEnv("GEOMIND_GEOCODE_CACHE") ?? path.resolve("cache", "geocode-cache.json"),
    geocodeTimeoutMs: numberEnv("GEOMIND_GEOCODE_TIMEOUT_MS", 8000)
  };
}
