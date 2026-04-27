import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeocodedLocation, JsonValue } from "../types/index.js";
import { errorMessage } from "../utils/errors.js";

export interface TencentGeocoderOptions {
  apiKey?: string;
  cachePath: string;
  timeoutMs?: number;
}

type CacheRecord = Record<string, GeocodedLocation>;

interface TencentGeocoderResponse {
  status: number;
  message?: string;
  result?: {
    title?: string;
    address?: string;
    location?: {
      lat: number;
      lng: number;
    };
    address_components?: {
      nation?: string;
      province?: string;
      city?: string;
      district?: string;
    };
  };
}

const FALLBACK_LOCATIONS: Array<{ pattern: RegExp; location: Omit<GeocodedLocation, "query" | "provider" | "status"> }> = [
  { pattern: /北京|海淀|中关村/, location: { coordinates: { lat: 39.9042, lng: 116.4074 }, city: "北京" } },
  { pattern: /上海|张江|浦东/, location: { coordinates: { lat: 31.2304, lng: 121.4737 }, city: "上海" } },
  { pattern: /深圳|南山/, location: { coordinates: { lat: 22.5431, lng: 114.0579 }, city: "深圳" } },
  { pattern: /广州|黄埔/, location: { coordinates: { lat: 23.1291, lng: 113.2644 }, city: "广州" } },
  { pattern: /苏州|昆山/, location: { coordinates: { lat: 31.2989, lng: 120.5853 }, city: "苏州" } },
  { pattern: /杭州|滨江/, location: { coordinates: { lat: 30.2741, lng: 120.1551 }, city: "杭州" } },
  { pattern: /武汉|光谷/, location: { coordinates: { lat: 30.5928, lng: 114.3055 }, city: "武汉" } },
  { pattern: /合肥/, location: { coordinates: { lat: 31.8206, lng: 117.2272 }, city: "合肥" } },
  { pattern: /天津|滨海新区/, location: { coordinates: { lat: 39.3434, lng: 117.3616 }, city: "天津" } },
  { pattern: /沈阳|浑南/, location: { coordinates: { lat: 41.8057, lng: 123.4315 }, city: "沈阳" } },
  { pattern: /长春|净月/, location: { coordinates: { lat: 43.8171, lng: 125.3235 }, city: "长春" } },
  { pattern: /青岛|西海岸/, location: { coordinates: { lat: 36.0671, lng: 120.3826 }, city: "青岛" } },
  { pattern: /济南高新区|济南/, location: { coordinates: { lat: 36.6512, lng: 117.1201 }, city: "济南" } },
  { pattern: /郑州|航空港/, location: { coordinates: { lat: 34.7466, lng: 113.6254 }, city: "郑州" } },
  { pattern: /太原|综改区/, location: { coordinates: { lat: 37.8706, lng: 112.5489 }, city: "太原" } },
  { pattern: /呼和浩特|和林格尔/, location: { coordinates: { lat: 40.8415, lng: 111.7519 }, city: "呼和浩特" } },
  { pattern: /西安高新区|西安/, location: { coordinates: { lat: 34.3416, lng: 108.9398 }, city: "西安" } },
  { pattern: /兰州|兰州新区/, location: { coordinates: { lat: 36.0611, lng: 103.8343 }, city: "兰州" } },
  { pattern: /乌鲁木齐高新区|乌鲁木齐/, location: { coordinates: { lat: 43.8256, lng: 87.6168 }, city: "乌鲁木齐" } },
  { pattern: /成都高新区|成都/, location: { coordinates: { lat: 30.5728, lng: 104.0668 }, city: "成都" } },
  { pattern: /重庆|两江新区/, location: { coordinates: { lat: 29.563, lng: 106.5516 }, city: "重庆" } },
  { pattern: /贵阳|贵安新区/, location: { coordinates: { lat: 26.647, lng: 106.6302 }, city: "贵阳" } },
  { pattern: /昆明|呈贡/, location: { coordinates: { lat: 24.8801, lng: 102.8329 }, city: "昆明" } },
  { pattern: /长沙|经开区/, location: { coordinates: { lat: 28.2282, lng: 112.9388 }, city: "长沙" } },
  { pattern: /南昌高新区|南昌/, location: { coordinates: { lat: 28.682, lng: 115.8579 }, city: "南昌" } },
  { pattern: /南京|江宁/, location: { coordinates: { lat: 32.0603, lng: 118.7969 }, city: "南京" } },
  { pattern: /宁波|北仑/, location: { coordinates: { lat: 29.8683, lng: 121.544 }, city: "宁波" } },
  { pattern: /福州|马尾/, location: { coordinates: { lat: 26.0745, lng: 119.2965 }, city: "福州" } },
  { pattern: /厦门|集美/, location: { coordinates: { lat: 24.4798, lng: 118.0894 }, city: "厦门" } },
  { pattern: /珠海|金湾/, location: { coordinates: { lat: 22.2711, lng: 113.5767 }, city: "珠海" } },
  { pattern: /南宁|五象新区/, location: { coordinates: { lat: 22.817, lng: 108.3669 }, city: "南宁" } },
  { pattern: /海口|江东新区/, location: { coordinates: { lat: 20.044, lng: 110.1999 }, city: "海口" } },
  { pattern: /新加坡|Singapore/i, location: { coordinates: { lat: 1.3521, lng: 103.8198 }, country: "Singapore" } },
  { pattern: /Boston|剑桥|Cambridge/i, location: { coordinates: { lat: 42.3601, lng: -71.0589 }, city: "Boston" } },
  { pattern: /San Jose|硅谷|Silicon Valley/i, location: { coordinates: { lat: 37.3382, lng: -121.8863 }, city: "San Jose" } },
  { pattern: /Munich|慕尼黑/i, location: { coordinates: { lat: 48.1351, lng: 11.582 }, city: "Munich" } },
  { pattern: /Tokyo|东京/i, location: { coordinates: { lat: 35.6762, lng: 139.6503 }, city: "Tokyo" } }
];

/** Wraps Tencent Location geocoder with disk cache and deterministic fallback coordinates. */
export class TencentGeocoder {
  private readonly apiKey: string | undefined;
  private readonly cachePath: string;
  private readonly timeoutMs: number;
  private cache?: CacheRecord;

  constructor(options: TencentGeocoderOptions) {
    this.apiKey = options.apiKey;
    this.cachePath = options.cachePath;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async geocode(query: string): Promise<GeocodedLocation> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        provider: "tencent",
        query,
        status: "failed",
        error: "Empty geocode query."
      };
    }

    const cache = await this.loadCache();
    const cached = cache[normalizedQuery];
    if (cached?.coordinates && (cached.status === "resolved" || !this.apiKey)) {
      return {
        ...cached,
        status: "cached"
      };
    }

    if (!this.apiKey) {
      const fallback = fallbackGeocode(normalizedQuery, "TENCENT_MAP_KEY is not configured.");
      cache[normalizedQuery] = fallback;
      await this.saveCache(cache);
      return fallback;
    }

    try {
      const resolved = await this.fetchTencent(normalizedQuery);
      cache[normalizedQuery] = resolved;
      await this.saveCache(cache);
      return resolved;
    } catch (error) {
      const fallback = fallbackGeocode(normalizedQuery, errorMessage(error));
      cache[normalizedQuery] = fallback;
      await this.saveCache(cache);
      return fallback;
    }
  }

  private async fetchTencent(query: string): Promise<GeocodedLocation> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = new URL("https://apis.map.qq.com/ws/geocoder/v1/");
    url.searchParams.set("address", query);
    url.searchParams.set("key", this.apiKey ?? "");

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: "application/json"
        }
      });
      if (!response.ok) {
        throw new Error(`Tencent geocoder HTTP ${response.status}`);
      }

      const payload = (await response.json()) as TencentGeocoderResponse;
      if (payload.status !== 0 || !payload.result?.location) {
        throw new Error(payload.message || `Tencent geocoder status ${payload.status}`);
      }

      const components = payload.result.address_components;
      return {
        provider: "tencent",
        query,
        status: "resolved",
        coordinates: payload.result.location,
        ...optionalString("formattedAddress", payload.result.address ?? payload.result.title),
        ...optionalString("country", components?.nation),
        ...optionalString("province", components?.province),
        ...optionalString("city", components?.city),
        ...optionalString("district", components?.district),
        cachedAt: new Date().toISOString(),
        raw: payload as unknown as JsonValue
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async loadCache(): Promise<CacheRecord> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await readFile(this.cachePath, "utf8");
      this.cache = JSON.parse(raw) as CacheRecord;
    } catch {
      this.cache = {};
    }

    return this.cache;
  }

  private async saveCache(cache: CacheRecord): Promise<void> {
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  }
}

function optionalString<K extends string>(key: K, value: string | undefined): { [P in K]: string } | Record<string, never> {
  return value ? { [key]: value } as { [P in K]: string } : {};
}

function fallbackGeocode(query: string, reason: string): GeocodedLocation {
  const matched = FALLBACK_LOCATIONS.find((entry) => entry.pattern.test(query));
  if (matched) {
    return {
      provider: "tencent",
      query,
      status: "fallback",
      ...matched.location,
      formattedAddress: query,
      cachedAt: new Date().toISOString(),
      error: reason
    };
  }

  return {
    provider: "tencent",
    query,
    status: "failed",
    cachedAt: new Date().toISOString(),
    error: reason
  };
}
