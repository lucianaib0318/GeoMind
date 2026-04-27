# Claude Code Guide

Claude Code should start with `AGENTS.md`.

GeoMind is a TypeScript Node.js CLI project for converting Feishu documents into Tencent Map geographic intelligence visualizations.

Useful commands:

```bash
npm install
npm run demo:offline
npm run check
```

Main files:

- `src/index.ts`
- `src/orchestrator/runGeoMind.ts`
- `src/whiteboard/htmlRenderer.ts`
- `src/feishu/publishToFeishu.ts`
- `SKILL.md`
- `AGENTS.md`

Do not commit `.env`, generated `output/`, `cache/`, real Tencent keys, or private Feishu document URLs.
