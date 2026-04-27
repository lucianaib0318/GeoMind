# Architecture

GeoMind is a small Node.js pipeline with clear adapter boundaries.

```text
Feishu document / local markdown
        |
        v
document reader
        |
        v
text cleaner
        |
        v
entity + relation extractor
        |
        v
Tencent geocoder + cache
        |
        v
validated GeoMind JSON
        |
        +--> whiteboard DSL
        +--> SVG fallback preview
        +--> Tencent Map JSAPI GL HTML
        +--> Feishu document preview publisher
```

## Modules

- `src/document`: input adapters for Feishu CLI and local files
- `src/text`: normalization and section splitting
- `src/extraction`: deterministic MVP extraction rules
- `src/geocoding`: Tencent Location Service wrapper, cache, fallback coordinates
- `src/schemas`: JSON Schema validation
- `src/whiteboard`: DSL, SVG, and HTML rendering
- `src/feishu`: Feishu document publishing helper
- `src/orchestrator`: end-to-end pipeline
- `src/skill`: Skill-facing wrapper

## MVP Design Choices

The extractor is intentionally rule-based for the first version. It is predictable, testable, and does not require an LLM key. The intended next step is to add an optional structured LLM extractor behind the same `ExtractionResult` contract.

The Feishu document publisher inserts a PNG or GIF preview plus an HTML attachment because Feishu document bodies generally do not execute arbitrary third-party JavaScript inline. The HTML attachment keeps the full Tencent Map interaction.
