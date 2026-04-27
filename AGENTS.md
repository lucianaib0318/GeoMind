# GeoMind Agent Guide

This file is for AI coding agents such as Codex, Claude Code, OpenClaw, Cursor agents, and other repo-aware assistants.

## Project Summary

GeoMind converts Feishu documents into geographic intelligence visualizations:

1. read a Feishu document through Feishu CLI or a local Markdown file
2. clean and section the text
3. extract entities and relationships
4. geocode locations with Tencent Location Service
5. validate structured JSON with JSON Schema
6. render Tencent Map JSAPI GL HTML, SVG fallback, and Feishu whiteboard DSL
7. optionally publish a PNG/GIF preview and HTML attachment back to Feishu

## Fast Recognition

If you are an AI agent, treat this as a TypeScript Node.js CLI project.

Primary entry points:

- CLI: `src/index.ts`
- Orchestrator: `src/orchestrator/runGeoMind.ts`
- Skill wrapper: `src/skill/geomindSkill.ts`
- Feishu publisher: `src/feishu/publishToFeishu.ts`
- HTML/Tencent map renderer: `src/whiteboard/htmlRenderer.ts`
- Whiteboard DSL renderer: `src/whiteboard/dslGenerator.ts`
- Schema: `src/schemas/geomind-output.schema.json`
- Types: `src/types/core.ts`

## Commands

Install dependencies:

```bash
npm install
```

Run without external API calls:

```bash
npm run demo:offline
```

Run the full demo with geocoding if `.env` has `TENCENT_MAP_KEY`:

```bash
npm run demo
```

Validate the repo:

```bash
npm run check
```

Publish generated artifacts to a Feishu document:

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx"
```

Publish a GIF preview:

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx" --gif
```

## Environment

Use `.env.example` as the template.

Required for Tencent geocoding and live map rendering:

```bash
TENCENT_MAP_KEY=your-tencent-map-key
```

Required for Feishu document reading:

```bash
FEISHU_CLI_COMMAND_TEMPLATE="lark-cli docs +fetch --doc {url} --api-version v2 --format json"
```

## Safety Rules

Do not commit or print secrets:

- `.env`
- Tencent Location Service real keys
- private Feishu document URLs or internal tokens
- generated HTML files that embed map keys
- `output/`
- `cache/`
- `dist/`
- SSH keys or browser profiles

The `.gitignore` already excludes these paths. Keep it that way.

## Editing Guidance

- Keep public docs free of real API keys and private Feishu links.
- Keep generated artifacts out of Git.
- Prefer adding small focused modules over large rewrites.
- Preserve the structured output contract in `src/types/core.ts`.
- If extraction behavior changes, update tests and sample input expectations.
- If the renderer changes, run `npm run demo` and inspect `output/geomind.html`.

## Expected Outputs

The pipeline produces:

- validated GeoMind JSON
- `whiteboard` DSL
- `output/geomind.html`
- `output/geomind.svg`
- optional Feishu PNG/GIF preview

Only source code, docs, schemas, tests, and sample input should be committed.
