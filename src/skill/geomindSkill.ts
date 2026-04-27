import type { GeoMindConfig } from "../config/env.js";
import { loadGeoMindConfig } from "../config/env.js";
import { runGeoMind, type RunGeoMindOptions } from "../orchestrator/index.js";
import type { GeoMindOutput } from "../types/index.js";

export interface GeoMindSkillInput {
  feishuUrl?: string;
  feishuToken?: string;
  inputFile?: string;
  title?: string;
  outputPath?: string;
  whiteboardPath?: string;
  skipGeocode?: boolean;
}

/** Skill-facing wrapper that hides CLI flags and returns structured JSON only. */
export async function runGeoMindSkill(
  input: GeoMindSkillInput,
  config: GeoMindConfig = loadGeoMindConfig()
): Promise<GeoMindOutput> {
  const options: RunGeoMindOptions = {
    ...(input.feishuUrl || input.feishuToken ? { input: input.feishuUrl ?? input.feishuToken } : {}),
    ...(input.inputFile ? { inputFile: input.inputFile } : {}),
    ...(input.title ? { title: input.title } : {}),
    ...(input.outputPath ? { outputPath: input.outputPath } : {}),
    ...(input.whiteboardPath ? { whiteboardPath: input.whiteboardPath } : {}),
    skipGeocode: Boolean(input.skipGeocode)
  };

  return runGeoMind(options, config);
}
