import { describe, expect, it } from "vitest";
import { runGeoMind } from "../src/orchestrator/index.js";

describe("GeoMind MVP pipeline", () => {
  it("generates validated JSON and whiteboard DSL from the sample document", async () => {
    const output = await runGeoMind(
      {
        inputFile: "examples/sample-input.md",
        skipGeocode: true
      },
      {
        geocodeCachePath: "cache/test-geocode-cache.json",
        geocodeTimeoutMs: 1000
      }
    );

    expect(output.schemaVersion).toBe("0.1.0");
    expect(output.entities.length).toBeGreaterThanOrEqual(5);
    expect(output.relations.length).toBeGreaterThanOrEqual(4);
    expect(output.whiteboard.nodes.length).toBe(output.entities.length);
    expect(output.summary.entityCount).toBe(output.entities.length);
  });
});
