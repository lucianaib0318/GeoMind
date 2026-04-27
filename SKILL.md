---
name: geomind
description: Build geographic intelligence visualizations from Feishu documents using Feishu CLI, structured extraction, Tencent Location Service, Tencent Map JSAPI GL, and Feishu document publishing.
---

# GeoMind Skill

GeoMind turns a Feishu research or industry document into a geographic relationship map. Use this skill when the user wants to extract organizations, factories, labs, parks, supply-chain nodes, or collaboration relationships from a document and render them as a Tencent Map visualization plus Feishu-ready artifacts.

## Capability

GeoMind currently supports:

- Feishu document input through `lark-cli docs +fetch`
- local Markdown input for demos and tests
- text cleanup and sectioning
- rule-based MVP extraction for explicit `实体:` and `关系:` lines
- schema-validated JSON output
- Tencent Location Service geocoding with disk cache and fallback coordinates
- Feishu whiteboard-oriented DSL
- Tencent Map JSAPI GL HTML visualization
- Feishu document publishing with PNG or GIF preview plus an HTML attachment

## Required Environment

Create `.env` from `.env.example` and set:

```bash
TENCENT_MAP_KEY=your-tencent-location-service-key
FEISHU_CLI_COMMAND_TEMPLATE=lark-cli docs +fetch --doc {url} --api-version v2 --format json
```

Do not hard-code API keys in source files, examples, generated HTML, README snippets, or Skill docs.

## Main Commands

Run the sample pipeline:

```bash
npm run demo
```

Run against a Feishu document:

```bash
npm run dev -- --url "https://your.feishu.cn/wiki/xxx" --out output/geomind.json --whiteboard-out output/whiteboard.json --html-out output/geomind.html --svg-out output/geomind.svg
```

Publish a static preview and HTML attachment back to Feishu:

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx"
```

Publish an animated GIF preview:

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx" --gif
```

## Extraction Input Hints

Prefer explicit lines in source documents. The current MVP parser is intentionally simple and deterministic:

```text
实体: 北京智能制造协调中心 | 类型: government_agency | 地点: 北京海淀 | 技术: 智能制造、大模型、工业互联网 | 证据: 负责全国智能制造示范工厂的数据协同与标准评估。
关系: 北京智能制造协调中心 -> 深圳南山AI计算中心 | 类型: collaboration | 证据: 双方共建全国工厂数据治理平台。
```

Supported entity types include:

- `research_institute`
- `university`
- `company`
- `factory`
- `lab`
- `industrial_park`
- `government_agency`
- `supply_chain_node`
- `location`
- `other`

Supported relation types include:

- `collaboration`
- `investment`
- `supply`
- `customer`
- `joint_lab`
- `located_in`
- `subsidiary`
- `technology_transfer`
- `competition`
- `other`

## Output Contract

The pipeline returns validated structured data:

- `entities`: extracted and geocoded nodes
- `relations`: typed source-target relationships with evidence
- `whiteboard`: Feishu whiteboard-oriented layout DSL
- `summary`: counts and top technology fields
- `warnings`: non-fatal extraction or geocoding issues

## Publishing Notes

Feishu documents generally do not execute arbitrary third-party HTML or JavaScript inline. For that reason, GeoMind publishes:

- an in-document image or GIF preview for immediate visual inspection
- an HTML file attachment for full Tencent Map interaction

This keeps the Feishu document presentation clean while preserving the draggable, zoomable, clickable Tencent Map experience.
