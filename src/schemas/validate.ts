import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { GeoMindOutput } from "../types/index.js";

const require = createRequire(import.meta.url);
const schema = require("./geomind-output.schema.json") as object;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false
});

const validateGeoMindOutput = ajv.compile<GeoMindOutput>(schema);

/** Validates the final GeoMind JSON payload before it is written or returned. */
export function assertValidGeoMindOutput(output: GeoMindOutput): void {
  if (validateGeoMindOutput(output)) {
    return;
  }

  const message = ajv.errorsText(validateGeoMindOutput.errors, {
    separator: "\n"
  });
  throw new Error(`GeoMind output schema validation failed:\n${message}`);
}
