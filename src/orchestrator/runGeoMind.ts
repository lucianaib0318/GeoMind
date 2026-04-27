import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeoMindConfig } from "../config/env.js";
import { FeishuCliDocumentReader, parseFeishuInput, readLocalDocument } from "../document/index.js";
import { extractEntitiesAndRelations } from "../extraction/index.js";
import { TencentGeocoder } from "../geocoding/index.js";
import { assertValidGeoMindOutput } from "../schemas/validate.js";
import { cleanDocument } from "../text/index.js";
import {
  GEOMIND_SCHEMA_VERSION,
  type DocumentInput,
  type EnrichedEntity,
  type GeoMindOutput,
  type GeoMindSummary
} from "../types/index.js";
import { generateWhiteboardDsl, renderGeoMindHtml, renderWhiteboardSvg } from "../whiteboard/index.js";

export interface RunGeoMindOptions {
  input?: string;
  inputFile?: string;
  outputPath?: string;
  whiteboardPath?: string;
  htmlPath?: string;
  svgPath?: string;
  title?: string;
  feishuCliCommandTemplate?: string;
  skipGeocode?: boolean;
}

/** Runs the complete MVP pipeline from document input to validated GeoMind JSON output. */
export async function runGeoMind(options: RunGeoMindOptions, config: GeoMindConfig): Promise<GeoMindOutput> {
  const rawDocument = options.inputFile
    ? await readLocalDocument(options.inputFile)
    : await readFeishuDocument(options, config);

  const cleanedDocument = cleanDocument(rawDocument);
  const extraction = extractEntitiesAndRelations(cleanedDocument);
  const entities = await enrichEntitiesWithGeocoding(extraction.entities, options, config);
  const whiteboard = generateWhiteboardDsl(entities, extraction.relations, options.title ?? rawDocument.title ?? "GeoMind");
  const summary = buildSummary(entities, extraction.relations);
  const warnings = [
    ...extraction.warnings,
    ...entities
      .filter((entity) => entity.locationText && entity.geocode?.status === "failed")
      .map((entity) => `Geocoding failed for ${entity.name}: ${entity.locationText}`)
  ];

  const output: GeoMindOutput = {
    schemaVersion: GEOMIND_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    input: rawDocument.input,
    document: {
      ...(cleanedDocument.title ? { title: cleanedDocument.title } : {}),
      stats: cleanedDocument.stats
    },
    extraction,
    entities,
    relations: extraction.relations,
    whiteboard,
    summary,
    warnings
  };

  assertValidGeoMindOutput(output);

  if (options.outputPath) {
    await writeJson(options.outputPath, output);
  }

  if (options.whiteboardPath) {
    await writeJson(options.whiteboardPath, whiteboard);
  }

  if (options.htmlPath) {
    await writeText(options.htmlPath, renderGeoMindHtml(output, config.tencentMapKey ? { tencentMapKey: config.tencentMapKey } : {}));
  }

  if (options.svgPath) {
    await writeText(options.svgPath, renderWhiteboardSvg(whiteboard, summary));
  }

  return output;
}

async function readFeishuDocument(options: RunGeoMindOptions, config: GeoMindConfig) {
  if (!options.input) {
    throw new Error("Missing input. Provide --url, --token, or --input-file.");
  }

  const input: DocumentInput = parseFeishuInput(options.input);
  const reader = new FeishuCliDocumentReader({
    ...((options.feishuCliCommandTemplate ?? config.feishuCliCommandTemplate)
      ? { commandTemplate: options.feishuCliCommandTemplate ?? config.feishuCliCommandTemplate }
      : {})
  });
  return reader.read(input);
}

async function enrichEntitiesWithGeocoding(
  entities: EnrichedEntity[],
  options: RunGeoMindOptions,
  config: GeoMindConfig
): Promise<EnrichedEntity[]> {
  if (options.skipGeocode) {
    return entities;
  }

  const geocoder = new TencentGeocoder({
    ...(config.tencentMapKey ? { apiKey: config.tencentMapKey } : {}),
    cachePath: config.geocodeCachePath,
    timeoutMs: config.geocodeTimeoutMs
  });

  const enriched: EnrichedEntity[] = [];
  for (const entity of entities) {
    if (!entity.locationText) {
      enriched.push(entity);
      continue;
    }

    const geocode = await geocoder.geocode(entity.locationText);
    enriched.push({
      ...entity,
      geocode
    });
  }

  return enriched;
}

function buildSummary(entities: EnrichedEntity[], relations: GeoMindOutput["relations"]): GeoMindSummary {
  const geocodedCount = entities.filter((entity) => Boolean(entity.geocode?.coordinates)).length;
  const failedGeocodeCount = entities.filter((entity) => entity.locationText && !entity.geocode?.coordinates).length;
  const topTechFields = topValues(entities.flatMap((entity) => entity.techFields), 5);
  const text = `共提取 ${entities.length} 个实体、${relations.length} 条关系，${geocodedCount} 个实体已完成地理定位。`;

  return {
    text,
    entityCount: entities.length,
    relationCount: relations.length,
    geocodedCount,
    failedGeocodeCount,
    topTechFields
  };
}

function topValues(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, data: string): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, data, "utf8");
}
