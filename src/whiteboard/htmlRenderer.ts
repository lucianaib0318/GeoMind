import type { EntityType, GeoMindOutput, GeoMindSummary, GeocodeStatus, RelationType, WhiteboardDsl, WhiteboardEdge, WhiteboardNode } from "../types/index.js";

export interface GeoMindHtmlRenderOptions {
  tencentMapKey?: string;
}

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  research_institute: "\u79d1\u7814\u673a\u6784",
  university: "\u9ad8\u6821",
  company: "\u4f01\u4e1a",
  factory: "\u5de5\u5382",
  lab: "\u5b9e\u9a8c\u5ba4",
  industrial_park: "\u56ed\u533a",
  government_agency: "\u653f\u5e9c\u673a\u6784",
  supply_chain_node: "\u4f9b\u5e94\u94fe\u8282\u70b9",
  location: "\u5730\u70b9",
  other: "\u5176\u4ed6"
};

const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  collaboration: "\u534f\u540c\u5408\u4f5c",
  investment: "\u6295\u8d44",
  supply: "\u4f9b\u5e94",
  customer: "\u5ba2\u6237",
  joint_lab: "\u8054\u5408\u5b9e\u9a8c\u5ba4",
  located_in: "\u6240\u5728\u5730",
  subsidiary: "\u5b50\u516c\u53f8",
  technology_transfer: "\u6280\u672f\u8f6c\u79fb",
  competition: "\u7ade\u4e89",
  other: "\u5173\u8054"
};

const GEOCODE_STATUS_LABELS: Record<GeocodeStatus | "missing", string> = {
  resolved: "\u5df2\u89e3\u6790",
  cached: "\u7f13\u5b58\u547d\u4e2d",
  fallback: "\u5140\u5e95\u5750\u6807",
  failed: "\u5b9a\u4f4d\u5931\u8d25",
  missing: "\u672a\u5b9a\u4f4d"
};

/** Renders the whiteboard DSL into a standalone SVG image for direct visual inspection. */
export function renderWhiteboardSvg(whiteboard: WhiteboardDsl, summary?: GeoMindSummary): string {
  const nodeById = new Map(whiteboard.nodes.map((node) => [node.id, node]));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${whiteboard.canvas.width}" height="${whiteboard.canvas.height}" viewBox="0 0 ${whiteboard.canvas.width} ${whiteboard.canvas.height}" role="img" aria-label="${escapeXml(whiteboard.title)}">
  <defs>
    <marker id="arrow-default" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#475569" />
    </marker>
    <marker id="arrow-supply" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#CA8A04" />
    </marker>
    <marker id="arrow-neon" markerWidth="11" markerHeight="11" refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L10,3.5 z" fill="#00E5FF" />
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#0F172A" flood-opacity="0.14"/>
    </filter>
    <filter id="flow-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#F8FAFC"/>
  <rect x="36" y="32" width="${whiteboard.canvas.width - 72}" height="${whiteboard.canvas.height - 64}" rx="18" fill="#FFFFFF" stroke="#E2E8F0"/>
  ${renderTitle(whiteboard, summary)}
  ${whiteboard.edges.map((edge) => renderEdge(edge, nodeById)).join("\n  ")}
  ${whiteboard.nodes.map((node) => renderNode(node)).join("\n  ")}
  ${renderLegend(whiteboard)}
</svg>`;
}

/** Renders a complete HTML report containing the SVG map, summary, entities, and relations. */
export function renderGeoMindHtml(output: GeoMindOutput, options: GeoMindHtmlRenderOptions = {}): string {
  const svg = renderWhiteboardSvg(output.whiteboard, output.summary).replace(/^<\?xml[^>]+>\n/, "");
  const mapData = buildMapData(output);
  const displayTitle = normalizeDisplayTitle(output.whiteboard.title);
  const scriptSrc = options.tencentMapKey
    ? `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(options.tencentMapKey)}`
    : "";

  const entityRows = output.entities
    .map((entity) => {
      const geocode = entity.geocode;
      const coordinate = geocode?.coordinates ? `${geocode.coordinates.lat.toFixed(4)}, ${geocode.coordinates.lng.toFixed(4)}` : "-";
      return `<tr>
        <td>${escapeHtml(entity.name)}</td>
        <td>${escapeHtml(formatEntityTypeLabel(entity.type))}</td>
        <td>${escapeHtml(entity.locationText ?? "-")}</td>
        <td>${escapeHtml(entity.techFields.join(", ") || "-")}</td>
        <td>${escapeHtml(formatGeocodeStatusLabel(geocode?.status ?? "missing"))}</td>
        <td>${escapeHtml(coordinate)}</td>
      </tr>`;
    })
    .join("\n");

  const relationRows = output.relations
    .map((relation) => {
      const source = output.entities.find((entity) => entity.id === relation.source)?.name ?? relation.source;
      const target = output.entities.find((entity) => entity.id === relation.target)?.name ?? relation.target;
      return `<tr>
        <td>${escapeHtml(source)}</td>
        <td>${escapeHtml(formatRelationTypeLabel(relation.relationType))}</td>
        <td>${escapeHtml(target)}</td>
        <td>${escapeHtml(relation.evidence)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(displayTitle)} - GeoMind</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
      color: #111827;
      background:
        radial-gradient(circle at top left, rgba(8, 145, 178, 0.14), transparent 22%),
        linear-gradient(180deg, #f6fbff 0%, #eef4f8 52%, #eaf0f6 100%);
    }
    body { margin: 0; background: inherit; }
    header {
      padding: 26px 32px 22px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 252, 0.98));
      border-bottom: 1px solid #dbe5f0;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border: 1px solid #cfe0ef;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: #0369a1;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    h1 {
      margin: 12px 0 10px;
      font-size: 34px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    .header-copy {
      max-width: 980px;
      color: #334155;
      font-size: 14px;
      line-height: 1.7;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }
    .metric {
      border: 1px solid #d6e3ef;
      border-radius: 999px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
      font-size: 13px;
    }
    main { padding: 24px 32px 40px; }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 18px;
      min-height: 690px;
    }
    .map-shell {
      border: 1px solid #0ea5e9;
      border-radius: 8px;
      background: #edf3f8;
      box-shadow: 0 18px 44px rgba(8, 47, 73, 0.28), 0 0 0 1px rgba(34, 211, 238, 0.18);
      overflow: hidden;
      min-height: 690px;
      position: relative;
    }
    .map-badge {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 15;
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border: 1px solid rgba(125, 211, 252, 0.36);
      border-radius: 12px;
      background: rgba(7, 18, 34, 0.72);
      backdrop-filter: blur(10px);
      color: #f8fafc;
      box-shadow: 0 14px 30px rgba(2, 6, 23, 0.22);
    }
    .map-badge strong {
      font-size: 14px;
      font-weight: 700;
    }
    .map-badge span {
      font-size: 12px;
      color: #cbd5e1;
    }
    #tencent-map {
      height: 690px;
      width: 100%;
      background: #edf3f8;
    }
    .map-fallback {
      display: none;
      height: 690px;
      overflow: auto;
    }
    .map-fallback svg {
      min-width: 1080px;
      width: 100%;
      height: auto;
      display: block;
    }
    .map-error {
      display: none;
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 16px;
      padding: 10px 12px;
      border-radius: 8px;
      color: #7c2d12;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      font-size: 13px;
      z-index: 20;
    }
    .side-panel {
      border: 1px solid #d7dee9;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.98);
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
      height: 690px;
      min-height: 690px;
      display: flex;
      flex-direction: column;
    }
    .panel-head {
      flex: 0 0 auto;
      padding: 18px 16px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(180deg, #f8fbfe 0%, #f3f7fb 100%);
    }
    .panel-head strong {
      display: block;
      font-size: 15px;
      margin-bottom: 6px;
    }
    .panel-head span {
      color: #64748b;
      font-size: 12px;
    }
    .entity-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 10px;
      display: grid;
      gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #e2e8f0;
    }
    .entity-list::-webkit-scrollbar {
      width: 10px;
    }
    .entity-list::-webkit-scrollbar-track {
      background: #e2e8f0;
    }
    .entity-list::-webkit-scrollbar-thumb {
      background: #94a3b8;
      border-radius: 999px;
      border: 2px solid #e2e8f0;
    }
    .entity-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      padding: 10px;
      cursor: pointer;
      transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
    }
    .entity-card:hover {
      border-color: #94a3b8;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
      transform: translateY(-1px);
    }
    .entity-card.active {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }
    .entity-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 13px;
      line-height: 1.35;
    }
    .dot {
      flex: 0 0 auto;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--dot, #64748b);
    }
    .entity-meta {
      margin-top: 7px;
      color: #64748b;
      font-size: 12px;
      line-height: 1.45;
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      border: 1px solid #c7d6e6;
      background: linear-gradient(180deg, #ffffff 0%, #f6f9fc 100%);
      color: #0f172a;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
    }
    button:hover {
      border-color: #38bdf8;
    }
    section {
      margin-top: 24px;
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid #d7dee9;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.05);
    }
    h2 {
      margin: 0;
      padding: 14px 16px;
      font-size: 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f8fafc;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid #edf1f7;
    }
    th {
      color: #475569;
      font-weight: 650;
      background: #ffffff;
    }
    td { color: #1f2937; }
    .warning {
      margin-top: 16px;
      padding: 10px 12px;
      border: 1px solid #fde68a;
      background: #fffbeb;
      border-radius: 8px;
      color: #78350f;
      font-size: 13px;
    }
    @media (max-width: 1040px) {
      main { padding: 16px; }
      .workspace { grid-template-columns: 1fr; }
      .side-panel { height: 520px; min-height: 0; max-height: 520px; }
    }
  </style>
  ${scriptSrc ? `<script charset="utf-8" src="${scriptSrc}"></script>` : ""}
</head>
<body>
  <header>
    <div class="eyebrow">GeoMind \u00b7 \u817e\u8baf\u5730\u56fe\u4ea7\u4e1a\u5206\u5e03\u6f14\u793a</div>
    <h1>${escapeHtml(displayTitle)}</h1>
    <div class="header-copy">${escapeHtml(output.summary.text)}</div>
    <div class="summary">
      <div class="metric">\u5b9e\u4f53\u6570\uff1a${output.summary.entityCount}</div>
      <div class="metric">\u5173\u7cfb\u6570\uff1a${output.summary.relationCount}</div>
      <div class="metric">\u5df2\u5b9a\u4f4d\uff1a${output.summary.geocodedCount}</div>
      <div class="metric">\u91cd\u70b9\u9886\u57df\uff1a${escapeHtml(output.summary.topTechFields.join("\u3001") || "-")}</div>
    </div>
    ${output.warnings.length ? `<div class="warning">${escapeHtml(output.warnings.join(" | "))}</div>` : ""}
  </header>
  <main>
    <div class="workspace">
      <div class="map-shell">
        <div class="map-badge">
          <strong>${escapeHtml(displayTitle)}</strong>
          <span>\u817e\u8baf\u5730\u56fe\u5e95\u56fe \u00b7 \u56fd\u5185\u8282\u70b9\u5206\u5e03 \u00b7 \u52a8\u6001\u5173\u7cfb\u6d41\u5411</span>
        </div>
        <div id="tencent-map"></div>
        <div class="map-fallback" id="map-fallback">${svg}</div>
        <div class="map-error" id="map-error"></div>
      </div>
      <aside class="side-panel">
        <div class="panel-head">
          <strong>\u5730\u56fe\u63a7\u5236</strong>
          <span>\u652f\u6301\u62d6\u62fd\u3001\u6eda\u8f6e\u7f29\u653e\u3001\u8282\u70b9\u805a\u7126\u4e0e\u8fde\u7ebf\u663e\u9690\u5207\u6362\u3002</span>
          <div class="tools">
            <button id="fit-btn" type="button">\u9002\u914d\u89c6\u91ce</button>
            <button id="map-mode-btn" type="button">\u6807\u51c6\u5730\u56fe</button>
            <button id="toggle-lines-btn" type="button">\u9690\u85cf\u8fde\u7ebf</button>
          </div>
        </div>
        <div class="entity-list" id="entity-list"></div>
      </aside>
    </div>
    <section>
      <h2>\u5b9e\u4f53\u6e05\u5355</h2>
      <table>
        <thead><tr><th>\u540d\u79f0</th><th>\u7c7b\u578b</th><th>\u5730\u70b9</th><th>\u6280\u672f\u9886\u57df</th><th>\u5b9a\u4f4d\u72b6\u6001</th><th>\u5750\u6807</th></tr></thead>
        <tbody>${entityRows}</tbody>
      </table>
    </section>
    <section>
      <h2>\u5173\u7cfb\u6e05\u5355</h2>
      <table>
        <thead><tr><th>\u8d77\u70b9</th><th>\u5173\u7cfb\u7c7b\u578b</th><th>\u7ec8\u70b9</th><th>\u8bc1\u636e</th></tr></thead>
        <tbody>${relationRows}</tbody>
      </table>
    </section>
  </main>
  <script>
    const GEOMIND_MAP_DATA = ${safeJson(mapData)};
    const ENTITY_COLORS = ${safeJson(entityColorMap())};
    const relationLayerState = { visible: true };
    let currentBaseMap = 'satellite';

    async function waitForTencentMap(maxWaitMs) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < maxWaitMs) {
        if (window.TMap) return true;
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      return Boolean(window.TMap);
    }

    async function initGeoMindMap() {
      renderEntityList();
      updateRelationToggleButton();
      const hasTMap = await waitForTencentMap(8000);
      if (!hasTMap || !window.TMap) {
        showFallback('\u817e\u8baf\u5730\u56fe JSAPI GL \u52a0\u8f7d\u5931\u8d25\uff0c\u5df2\u5207\u6362\u4e3a SVG \u5140\u5e95\u9884\u89c8\u3002');
        return;
      }
      const entities = GEOMIND_MAP_DATA.entities.filter((entity) => Number.isFinite(entity.lat) && Number.isFinite(entity.lng));
      if (!entities.length) {
        showFallback('\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u5730\u7406\u5750\u6807\uff0c\u5df2\u5207\u6362\u4e3a SVG \u5140\u5e95\u9884\u89c8\u3002');
        return;
      }

      const center = getCenter(entities);
      let map;
      try {
        map = new TMap.Map('tencent-map', {
          center: new TMap.LatLng(center.lat, center.lng),
          zoom: getInitialZoom(entities),
          pitch: 0,
          rotation: 0,
          showControl: true,
          baseMap: {
            type: 'satellite',
            features: ['base', 'label']
          },
          renderOptions: {
            enableBloom: true
          }
        });
      } catch (error) {
        try {
          map = new TMap.Map('tencent-map', {
            center: new TMap.LatLng(center.lat, center.lng),
            zoom: getInitialZoom(entities),
            pitch: 0,
            rotation: 0,
            showControl: true
          });
          currentBaseMap = 'standard';
          const button = document.getElementById('map-mode-btn');
          if (button) button.textContent = '\u536b\u661f\u5f71\u50cf';
        } catch (fallbackError) {
          showFallback('\u817e\u8baf\u5730\u56fe\u521d\u59cb\u5316\u5931\u8d25\uff0c\u5df2\u5207\u6362\u4e3a SVG \u5140\u5e95\u9884\u89c8\u3002');
          console.error(fallbackError);
          return;
        }
      }

      window.__geomindMap = map;
      const infoWindow = new TMap.InfoWindow({
        map,
        position: new TMap.LatLng(center.lat, center.lng),
        content: '',
        offset: { x: 0, y: -36 }
      });
      if (typeof infoWindow.close === 'function') infoWindow.close();

      createMarkers(map, entities, infoWindow);
      createLabels(map, entities);
      const relationOutput = createRelationLines(map, entities);
      const relationLayers = relationOutput?.layers || [];
      const flowLayer = createDataFlowMarkers(map, relationOutput?.routes || []);
      fitMap(map, entities);

      document.getElementById('fit-btn')?.addEventListener('click', () => fitMap(map, entities));
      document.getElementById('map-mode-btn')?.addEventListener('click', () => toggleBaseMap(map));
      document.getElementById('toggle-lines-btn')?.addEventListener('click', () => {
        relationLayerState.visible = !relationLayerState.visible;
        relationLayers.forEach((layer) => {
          if (layer && typeof layer.setMap === 'function') {
            layer.setMap(relationLayerState.visible ? map : null);
          }
        });
        if (flowLayer && typeof flowLayer.setMap === 'function') {
          flowLayer.setMap(relationLayerState.visible ? map : null);
        }
        updateRelationToggleButton();
      });

      window.__geomindFocus = (id) => {
        const entity = entities.find((item) => item.id === id);
        if (!entity) return;
        setActiveEntity(id);
        map.setCenter(new TMap.LatLng(entity.lat, entity.lng));
        map.setZoom(Math.max(map.getZoom ? map.getZoom() : 6, 8));
        openInfo(infoWindow, entity);
      };
    }

    function createMarkers(map, entities, infoWindow) {
      const styles = {};
      Object.entries(ENTITY_COLORS).forEach(([type, color]) => {
        styles[type] = new TMap.MarkerStyle({
          width: 34,
          height: 34,
          anchor: { x: 17, y: 17 },
          src: markerIcon(color)
        });
      });

      const markerLayer = new TMap.MultiMarker({
        id: 'geomind-entity-markers',
        map,
        styles,
        geometries: entities.map((entity) => ({
          id: entity.id,
          styleId: ENTITY_COLORS[entity.type] ? entity.type : 'other',
          position: new TMap.LatLng(entity.lat, entity.lng),
          properties: entity
        }))
      });

      if (markerLayer.on) {
        markerLayer.on('click', (event) => {
          const entity = event.geometry?.properties || entities.find((item) => item.id === event.geometry?.id);
          if (entity) {
            setActiveEntity(entity.id);
            openInfo(infoWindow, entity);
          }
        });
      }

      return markerLayer;
    }

    function createLabels(map, entities) {
      if (!TMap.MultiLabel || !TMap.LabelStyle) return null;
      const labeledEntities = selectLabeledEntities(entities);
      try {
        return new TMap.MultiLabel({
          id: 'geomind-entity-labels',
          map,
          styles: {
            label: new TMap.LabelStyle({
              color: '#f8fafc',
              size: 13,
              offset: { x: 0, y: -38 },
              alignment: 'center',
              verticalAlignment: 'middle',
              strokeColor: '#0f172a',
              strokeWidth: 4
            })
          },
          geometries: labeledEntities.map((entity) => ({
            id: 'label-' + entity.id,
            styleId: 'label',
            position: new TMap.LatLng(entity.lat, entity.lng),
            content: entity.name
          }))
        });
      } catch {
        return null;
      }
    }

    function selectLabeledEntities(entities) {
      if (entities.length <= 14) return entities;
      const priorityTypes = new Set(['government_agency', 'research_institute', 'company', 'lab']);
      const prioritized = entities.filter((entity) => priorityTypes.has(entity.type) || /\u4e2d\u5fc3|\u5b9e\u9a8c\u5ba4/.test(entity.name));
      return prioritized.slice(0, 14);
    }

    function createRelationLines(map, entities) {
      if (!TMap.MultiPolyline || !TMap.PolylineStyle) return null;
      const byId = new Map(entities.map((entity) => [entity.id, entity]));
      const geometries = GEOMIND_MAP_DATA.relations
        .map((relation, index) => {
          const source = byId.get(relation.source);
          const target = byId.get(relation.target);
          if (!source || !target) return null;
          const route = createArcPath(source, target, index);
          return {
            id: relation.id,
            styleId: relation.relationType === 'supply' ? 'supply' : 'default',
            paths: route.map((point) => new TMap.LatLng(point.lat, point.lng)),
            plainPath: route,
            properties: relation
          };
        })
        .filter(Boolean);
      if (!geometries.length) return null;

      try {
        const glowLayer = new TMap.MultiPolyline({
          id: 'geomind-relation-glow',
          map,
          zIndex: 60,
          styles: {
            neon: new TMap.PolylineStyle({
              color: 'rgba(0, 229, 255, 0.26)',
              width: 11,
              borderWidth: 5,
              borderColor: 'rgba(14, 165, 233, 0.18)',
              lineCap: 'round',
              enableBloom: true,
              showArrow: false
            })
          },
          geometries: geometries.map((geometry) => ({
            id: 'glow-' + geometry.id,
            styleId: 'neon',
            paths: geometry.paths,
            properties: geometry.properties
          }))
        });

        const layer = new TMap.MultiPolyline({
          id: 'geomind-relation-neon-lines',
          map,
          zIndex: 70,
          styles: {
            default: new TMap.PolylineStyle({
              color: '#00E5FF',
              width: 3.6,
              borderWidth: 1.2,
              borderColor: '#E0FBFF',
              lineCap: 'round',
              enableBloom: true,
              showArrow: true,
              arrowOptions: { width: 10, height: 6, space: 84 }
            }),
            supply: new TMap.PolylineStyle({
              color: '#00E5FF',
              width: 3.6,
              borderWidth: 1.2,
              borderColor: '#E0FBFF',
              lineCap: 'round',
              enableBloom: true,
              showArrow: true,
              arrowOptions: { width: 10, height: 6, space: 84 }
            })
          },
          geometries
        });
        return {
          layer,
          layers: [glowLayer, layer],
          routes: geometries.map((geometry) => ({
            id: geometry.id,
            relationType: geometry.properties.relationType,
            path: geometry.paths,
            points: geometry.plainPath
          }))
        };
      } catch {
        return null;
      }
    }

    function createDataFlowMarkers(map, routes) {
      if (!routes.length || !TMap.MultiMarker || !TMap.MarkerStyle) return null;
      const pulseLayer = new TMap.MultiMarker({
        id: 'geomind-data-flow',
        map,
        styles: {
          default: new TMap.MarkerStyle({
            width: 22,
            height: 22,
            anchor: { x: 11, y: 11 },
            faceTo: 'screen',
            src: pulseIcon('#00E5FF')
          }),
          supply: new TMap.MarkerStyle({
            width: 22,
            height: 22,
            anchor: { x: 11, y: 11 },
            faceTo: 'screen',
            src: pulseIcon('#00E5FF')
          })
        },
        geometries: routes.map((route) => ({
          id: 'pulse-' + route.id,
          styleId: route.relationType === 'supply' ? 'supply' : 'default',
          position: route.path[0],
          properties: route
        }))
      });

      const startFlow = () => {
        if (!pulseLayer.moveAlong) return;
        const moves = {};
        routes.forEach((route, index) => {
          const distanceKm = estimateDistanceKm(route.points);
          const durationSeconds = 5.2 + (index % 3) * 1.1;
          moves["pulse-" + route.id] = {
            path: route.path,
            speed: Math.max(3000, distanceKm / (durationSeconds / 3600))
          };
        });
        try {
          pulseLayer.moveAlong(moves, { autoRotation: false });
        } catch {
          // Some restricted JSAPI builds may disable moveAlong; the static arcs remain visible.
        }
      };

      startFlow();
      window.setInterval(startFlow, 7600);
      return pulseLayer;
    }

    function renderEntityList() {
      const list = document.getElementById('entity-list');
      if (!list) return;
      list.innerHTML = GEOMIND_MAP_DATA.entities.map((entity) => {
        const color = ENTITY_COLORS[entity.type] || ENTITY_COLORS.other;
        const tech = entity.techFields.length ? entity.techFields.join(', ') : '-';
        return '<article class="entity-card" data-id="' + escapeAttr(entity.id) + '" style="--dot:' + color + '">' +
          '<div class="entity-title"><span class="dot"></span><span>' + escapeHtml(entity.name) + '</span></div>' +
          '<div class="entity-meta">\\u5730\\u70b9\\uff1a' + escapeHtml(entity.locationText || '-') + ' \\u00b7 \\u7c7b\\u578b\\uff1a' + escapeHtml(formatEntityTypeLabel(entity.type)) + '</div>' +
          '<div class="entity-meta">\\u6280\\u672f\\u9886\\u57df\\uff1a' + escapeHtml(tech) + '</div>' +
          '</article>';
      }).join('');
      list.querySelectorAll('.entity-card').forEach((card) => {
        card.addEventListener('click', () => window.__geomindFocus?.(card.dataset.id));
      });
    }

    function openInfo(infoWindow, entity) {
      infoWindow.setPosition(new TMap.LatLng(entity.lat, entity.lng));
      infoWindow.setContent(
        '<div style="min-width:240px;max-width:320px;font-family:Inter,Segoe UI,Microsoft YaHei,sans-serif">' +
          '<div style="font-weight:700;margin-bottom:6px">' + escapeHtml(entity.name) + '</div>' +
          '<div style="color:#475569;font-size:12px;margin-bottom:8px">\\u5730\\u70b9\\uff1a' + escapeHtml(entity.locationText || '-') + ' \\u00b7 \\u7c7b\\u578b\\uff1a' + escapeHtml(formatEntityTypeLabel(entity.type)) + '</div>' +
          '<div style="font-size:12px;line-height:1.5"><b>\\u6280\\u672f\\u9886\\u57df\\uff1a</b> ' + escapeHtml(entity.techFields.join(', ') || '-') + '</div>' +
          '<div style="font-size:12px;line-height:1.5"><b>\\u5b9a\\u4f4d\\u72b6\\u6001\\uff1a</b> ' + escapeHtml(formatGeocodeStatusLabel(entity.geocodeStatus || 'missing')) + '</div>' +
        '</div>'
      );
      if (typeof infoWindow.open === 'function') infoWindow.open();
    }

    function fitMap(map, entities) {
      if (entities.length < 2 || !TMap.LatLngBounds || !map.fitBounds) {
        const center = getCenter(entities);
        map.setCenter(new TMap.LatLng(center.lat, center.lng));
        return;
      }
      const latValues = entities.map((entity) => entity.lat);
      const lngValues = entities.map((entity) => entity.lng);
      const sw = new TMap.LatLng(Math.min(...latValues), Math.min(...lngValues));
      const ne = new TMap.LatLng(Math.max(...latValues), Math.max(...lngValues));
      const bounds = new TMap.LatLngBounds(sw, ne);
      map.fitBounds(bounds, { padding: 90 });
    }

    function showFallback(message) {
      const map = document.getElementById('tencent-map');
      const fallback = document.getElementById('map-fallback');
      const error = document.getElementById('map-error');
      if (map) map.style.display = 'none';
      if (fallback) fallback.style.display = 'block';
      if (error) {
        error.textContent = message;
        error.style.display = 'block';
      }
    }

    function toggleBaseMap(map) {
      if (!map || typeof map.setBaseMap !== 'function') return;
      const button = document.getElementById('map-mode-btn');
      currentBaseMap = currentBaseMap === 'standard' ? 'satellite' : 'standard';
      try {
        if (currentBaseMap === 'satellite') {
          map.setBaseMap({
            type: 'satellite',
            features: ['base', 'label']
          });
          if (button) button.textContent = '\u6807\u51c6\u5730\u56fe';
        } else {
          map.setBaseMap({
            type: 'vector'
          });
          if (button) button.textContent = '\u536b\u661f\u5f71\u50cf';
        }
      } catch (error) {
        console.error(error);
      }
    }

    function updateRelationToggleButton() {
      const button = document.getElementById('toggle-lines-btn');
      if (!button) return;
      button.textContent = relationLayerState.visible ? '\u9690\u85cf\u8fde\u7ebf' : '\u663e\u793a\u8fde\u7ebf';
    }

    function getCenter(entities) {
      return {
        lat: entities.reduce((sum, item) => sum + item.lat, 0) / entities.length,
        lng: entities.reduce((sum, item) => sum + item.lng, 0) / entities.length
      };
    }

    function getInitialZoom(entities) {
      const latValues = entities.map((entity) => entity.lat);
      const lngValues = entities.map((entity) => entity.lng);
      const span = Math.max(Math.max(...latValues) - Math.min(...latValues), Math.max(...lngValues) - Math.min(...lngValues));
      if (span > 20) return 4;
      if (span > 8) return 5;
      if (span > 2) return 7;
      return 9;
    }

    function createArcPath(source, target, index) {
      const dx = target.lng - source.lng;
      const dy = target.lat - source.lat;
      const length = Math.max(Math.sqrt(dx * dx + dy * dy), 0.000001);
      const direction = index % 2 === 0 ? 1 : -1;
      const curve = Math.min(8, Math.max(0.25, length * 0.22)) * direction;
      const control = {
        lng: (source.lng + target.lng) / 2 + (-dy / length) * curve,
        lat: (source.lat + target.lat) / 2 + (dx / length) * curve
      };
      const steps = 72;
      const path = [];
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const oneMinusT = 1 - t;
        path.push({
          lat: oneMinusT * oneMinusT * source.lat + 2 * oneMinusT * t * control.lat + t * t * target.lat,
          lng: oneMinusT * oneMinusT * source.lng + 2 * oneMinusT * t * control.lng + t * t * target.lng
        });
      }
      return path;
    }

    function estimateDistanceKm(points) {
      let total = 0;
      for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        if (!current || !next) continue;
        total += haversineKm(current, next);
      }
      return total;
    }

    function haversineKm(a, b) {
      const radius = 6371;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function toRad(value) {
      return value * Math.PI / 180;
    }

    function setActiveEntity(id) {
      document.querySelectorAll('.entity-card').forEach((card) => {
        card.classList.toggle('active', card.dataset.id === id);
      });
    }

    function markerIcon(color) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
        '<circle cx="17" cy="17" r="13" fill="' + color + '" stroke="white" stroke-width="4"/>' +
        '<circle cx="17" cy="17" r="5" fill="white" fill-opacity=".95"/></svg>';
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    function pulseIcon(color) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">' +
        '<filter id="g" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<circle cx="11" cy="11" r="10" fill="' + color + '" fill-opacity=".26" filter="url(#g)"/>' +
        '<circle cx="11" cy="11" r="5.4" fill="' + color + '" stroke="white" stroke-width="2"/>' +
        '</svg>';
      return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    }

    function formatEntityTypeLabel(type) {
      return ENTITY_TYPE_LABELS[type] || ENTITY_TYPE_LABELS.other;
    }

    function formatGeocodeStatusLabel(status) {
      return GEOCODE_STATUS_LABELS[status] || GEOCODE_STATUS_LABELS.missing;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    const ENTITY_TYPE_LABELS = {
      research_institute: '\\u79d1\\u7814\\u673a\\u6784',
      university: '\\u9ad8\\u6821',
      company: '\\u4f01\\u4e1a',
      factory: '\\u5de5\\u5382',
      lab: '\\u5b9e\\u9a8c\\u5ba4',
      industrial_park: '\\u56ed\\u533a',
      government_agency: '\\u653f\\u5e9c\\u673a\\u6784',
      supply_chain_node: '\\u4f9b\\u5e94\\u94fe\\u8282\\u70b9',
      location: '\\u5730\\u70b9',
      other: '\\u5176\\u4ed6'
    };

    const GEOCODE_STATUS_LABELS = {
      resolved: '\\u5df2\\u89e3\\u6790',
      cached: '\\u7f13\\u5b58\\u547d\\u4e2d',
      fallback: '\\u5140\\u5e95\\u5750\\u6807',
      failed: '\\u5b9a\\u4f4d\\u5931\\u8d25',
      missing: '\\u672a\\u5b9a\\u4f4d'
    };

    window.addEventListener('load', () => {
      initGeoMindMap().catch((error) => {
        console.error(error);
        showFallback('\u9875\u9762\u521d\u59cb\u5316\u5931\u8d25\uff0c\u5df2\u5207\u6362\u4e3a SVG \u5140\u5e95\u9884\u89c8\u3002');
      });
    });
  </script>
</body>
</html>`;
}

function buildMapData(output: GeoMindOutput) {
  return {
    entities: output.entities
      .filter((entity) => entity.geocode?.coordinates)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        locationText: entity.locationText ?? "",
        techFields: entity.techFields,
        lat: entity.geocode?.coordinates?.lat,
        lng: entity.geocode?.coordinates?.lng,
        geocodeStatus: entity.geocode?.status ?? "missing"
      })),
    relations: output.relations.map((relation) => ({
      id: relation.id,
      source: relation.source,
      target: relation.target,
      relationType: relation.relationType,
      evidence: relation.evidence
    }))
  };
}

function entityColorMap(): Record<string, string> {
  return {
    research_institute: "#2563EB",
    university: "#16A34A",
    company: "#EA580C",
    factory: "#52525B",
    lab: "#7C3AED",
    industrial_park: "#0891B2",
    government_agency: "#DB2777",
    supply_chain_node: "#CA8A04",
    location: "#0D9488",
    other: "#64748B"
  };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

function renderTitle(whiteboard: WhiteboardDsl, summary?: GeoMindSummary): string {
  return `<text x="72" y="76" font-size="28" font-weight="700" fill="#0F172A">${escapeXml(whiteboard.title)}</text>
  <text x="72" y="106" font-size="14" fill="#475569">${escapeXml(summary?.text ?? `${whiteboard.nodes.length} \u4e2a\u8282\u70b9\uff0c${whiteboard.edges.length} \u6761\u5173\u7cfb`)}</text>`;
}

function renderNode(node: WhiteboardNode): string {
  const lines = wrapText(node.label, 13, 2);
  const location = String(node.metadata?.["locationText"] ?? "");
  const status = formatGeocodeStatusLabel(String(node.metadata?.["geocodeStatus"] ?? "missing") as GeocodeStatus | "missing");
  const x = node.position.x;
  const y = node.position.y;
  const labelText = lines
    .map((line, index) => `<tspan x="${x + 16}" dy="${index === 0 ? 0 : 18}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${node.size.width}" height="${node.size.height}" rx="8" fill="${node.style.fill}" stroke="${node.style.stroke}" stroke-width="2"/>
    <text x="${x + 16}" y="${y + 26}" font-size="14" font-weight="700" fill="${node.style.textColor}">${labelText}</text>
    <text x="${x + 16}" y="${y + node.size.height - 14}" font-size="11" fill="#475569">${escapeXml([location, status].filter(Boolean).join(" | "))}</text>
  </g>`;
}

function renderEdge(edge: WhiteboardEdge, nodeById: Map<string, WhiteboardNode>): string {
  const source = nodeById.get(edge.sourceNodeId);
  const target = nodeById.get(edge.targetNodeId);
  if (!source || !target) {
    return "";
  }

  const start = center(source);
  const end = center(target);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const startX = start.x + (dx / length) * 98;
  const startY = start.y + (dy / length) * 42;
  const endX = end.x - (dx / length) * 104;
  const endY = end.y - (dy / length) * 44;
  const routeDx = endX - startX;
  const routeDy = endY - startY;
  const routeLength = Math.max(Math.sqrt(routeDx * routeDx + routeDy * routeDy), 1);
  const direction = hashNumber(edge.id) % 2 === 0 ? 1 : -1;
  const curve = Math.min(170, Math.max(48, routeLength * 0.22)) * direction;
  const controlX = (startX + endX) / 2 + (-routeDy / routeLength) * curve;
  const controlY = (startY + endY) / 2 + (routeDx / routeLength) * curve;
  const labelX = startX * 0.25 + controlX * 0.5 + endX * 0.25;
  const labelY = startY * 0.25 + controlY * 0.5 + endY * 0.25;
  const dash = edge.style.lineStyle === "dashed" ? ` stroke-dasharray="8 7"` : "";
  const edgeColor = "#00E5FF";
  const marker = "arrow-neon";
  const pathId = safeSvgId(`edge_path_${edge.id}`);
  const path = `M ${round(startX)} ${round(startY)} Q ${round(controlX)} ${round(controlY)} ${round(endX)} ${round(endY)}`;
  const flowDuration = 3.8 + (hashNumber(edge.id) % 4) * 0.35;

  return `<g>
    <path id="${pathId}" d="${path}" fill="none" stroke="#67E8F9" stroke-width="11" stroke-opacity="0.24" stroke-linecap="round" filter="url(#flow-glow)"/>
    <path d="${path}" fill="none" stroke="${edgeColor}" stroke-width="3"${dash} stroke-linecap="round" marker-end="url(#${marker})"/>
    <path d="${path}" fill="none" stroke="#E0FBFF" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 18" opacity="0.98">
      <animate attributeName="stroke-dashoffset" from="0" to="-120" dur="2.4s" repeatCount="indefinite"/>
    </path>
    <circle r="6" fill="${edgeColor}" stroke="#FFFFFF" stroke-width="2" filter="url(#flow-glow)">
      <animateMotion dur="${flowDuration}s" repeatCount="indefinite" rotate="auto">
        <mpath href="#${pathId}"/>
      </animateMotion>
    </circle>
    <rect x="${labelX - 48}" y="${labelY - 16}" width="96" height="24" rx="6" fill="#FFFFFF" stroke="#CBD5E1"/>
    <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#334155">${escapeXml(edge.label)}</text>
  </g>`;
}

function renderLegend(whiteboard: WhiteboardDsl): string {
  const x = 72;
  const y = whiteboard.canvas.height - 138;
  const items = whiteboard.legend.slice(0, 10);
  const rows = items
    .map((item, index) => {
      const row = Math.floor(index / 5);
      const col = index % 5;
      const itemX = x + col * 260;
      const itemY = y + row * 34;
      return `<g>
        <rect x="${itemX}" y="${itemY}" width="18" height="18" rx="4" fill="${item.color}"/>
        <text x="${itemX + 28}" y="${itemY + 14}" font-size="12" fill="#334155">${escapeXml(item.label)}</text>
      </g>`;
    })
    .join("\n    ");

  return `<g>
    <rect x="56" y="${y - 28}" width="${whiteboard.canvas.width - 112}" height="100" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/>
    <text x="${x}" y="${y - 7}" font-size="13" font-weight="700" fill="#0F172A">\u56fe\u4f8b</text>
    ${rows}
  </g>`;
}

function center(node: WhiteboardNode): { x: number; y: number } {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

function hashNumber(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function safeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  if (value.length <= maxChars) {
    return [value];
  }

  const lines: string[] = [];
  let remaining = value;
  while (remaining && lines.length < maxLines) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }

    lines.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }

  if (remaining && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]?.slice(0, Math.max(0, maxChars - 1))}...`;
  }

  return lines;
}

function normalizeDisplayTitle(value: string): string {
  return value.replace(/^GeoMind\s*[\-:：]\s*/i, "").trim();
}

function formatEntityTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_LABELS[type] ?? ENTITY_TYPE_LABELS.other;
}

function formatRelationTypeLabel(type: RelationType): string {
  return RELATION_TYPE_LABELS[type] ?? RELATION_TYPE_LABELS.other;
}

function formatGeocodeStatusLabel(status: GeocodeStatus | "missing"): string {
  return GEOCODE_STATUS_LABELS[status] ?? GEOCODE_STATUS_LABELS.missing;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}
