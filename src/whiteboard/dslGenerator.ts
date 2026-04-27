import type {
  EnrichedEntity,
  EntityType,
  GeoMindRelation,
  RelationType,
  WhiteboardDsl,
  WhiteboardLegendItem
} from "../types/index.js";
import { GEOMIND_SCHEMA_VERSION } from "../types/index.js";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const NODE_WIDTH = 190;
const NODE_HEIGHT = 72;

const ENTITY_COLORS: Record<EntityType, { fill: string; stroke: string; textColor: string; label: string }> = {
  research_institute: { fill: "#E8F3FF", stroke: "#2563EB", textColor: "#172554", label: "\u79d1\u7814\u673a\u6784" },
  university: { fill: "#ECFDF3", stroke: "#16A34A", textColor: "#14532D", label: "\u9ad8\u6821" },
  company: { fill: "#FFF7ED", stroke: "#EA580C", textColor: "#7C2D12", label: "\u4f01\u4e1a" },
  factory: { fill: "#F4F4F5", stroke: "#52525B", textColor: "#18181B", label: "\u5de5\u5382" },
  lab: { fill: "#F5F3FF", stroke: "#7C3AED", textColor: "#3B0764", label: "\u5b9e\u9a8c\u5ba4" },
  industrial_park: { fill: "#ECFEFF", stroke: "#0891B2", textColor: "#164E63", label: "\u56ed\u533a" },
  government_agency: { fill: "#FDF2F8", stroke: "#DB2777", textColor: "#831843", label: "\u653f\u5e9c\u673a\u6784" },
  supply_chain_node: { fill: "#FEFCE8", stroke: "#CA8A04", textColor: "#713F12", label: "\u4f9b\u5e94\u94fe\u8282\u70b9" },
  location: { fill: "#F0FDFA", stroke: "#0D9488", textColor: "#134E4A", label: "\u5730\u70b9" },
  other: { fill: "#F8FAFC", stroke: "#64748B", textColor: "#0F172A", label: "\u5176\u4ed6" }
};

const RELATION_LABELS: Record<RelationType, string> = {
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

/** 生成适配飞书白板的中间 DSL，优先保证布局可读和演示效果。 */
export function generateWhiteboardDsl(
  entities: EnrichedEntity[],
  relations: GeoMindRelation[],
  title = "\u4e2d\u56fd\u65b0\u80fd\u6e90\u4e0e\u667a\u80fd\u5236\u9020\u4ea7\u4e1a\u5206\u5e03\u7f51\u7edc"
): WhiteboardDsl {
  const positions = computePositions(entities);
  const nodes = entities.map((entity, index) => {
    const colors = ENTITY_COLORS[entity.type];
    return {
      id: `node_${entity.id}`,
      entityId: entity.id,
      label: entity.name,
      type: entity.type,
      position: positions[index] ?? gridPosition(index),
      size: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT
      },
      style: {
        fill: colors.fill,
        stroke: colors.stroke,
        textColor: colors.textColor
      },
      metadata: {
        locationText: entity.locationText ?? "",
        techFields: entity.techFields.join(", "),
        geocodeStatus: entity.geocode?.status ?? "missing"
      }
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.entityId));
  const edges = relations
    .filter((relation) => nodeIds.has(relation.source) && nodeIds.has(relation.target))
    .map((relation) => ({
      id: `edge_${relation.id}`,
      relationId: relation.id,
      sourceNodeId: `node_${relation.source}`,
      targetNodeId: `node_${relation.target}`,
      label: RELATION_LABELS[relation.relationType],
      style: {
        stroke: relation.relationType === "supply" ? "#CA8A04" : "#475569",
        lineStyle: relation.confidence && relation.confidence < 0.7 ? "dashed" as const : "solid" as const
      },
      metadata: {
        evidence: relation.evidence,
        confidence: relation.confidence ?? 0
      }
    }));

  return {
    schemaVersion: GEOMIND_SCHEMA_VERSION,
    title,
    canvas: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      projection: "geo-grid-mvp"
    },
    nodes,
    edges,
    legend: buildLegend(entities, relations),
    notes: [
      "\u5f53\u524d MVP \u5e03\u5c40\u6309\u7ecf\u7eac\u5ea6\u5f52\u4e00\u5316\u5b89\u6392\u8282\u70b9\uff0c\u672a\u89e3\u6790\u5730\u7406\u5750\u6807\u7684\u8282\u70b9\u4f1a\u56de\u843d\u5230\u7f51\u683c\u4f4d\u3002",
      "\u8be5 DSL \u4fdd\u6301\u7ed3\u6784\u7b80\u5355\uff0c\u65b9\u4fbf\u540e\u7eed Skill \u8f6c\u6362\u4e3a\u98de\u4e66\u767d\u677f\u5f62\u72b6\u4e0e\u8fde\u7ebf\u3002"
    ]
  };
}

function computePositions(entities: EnrichedEntity[]) {
  const resolved = entities
    .map((entity, index) => ({ entity, index }))
    .filter(({ entity }) => Boolean(entity.geocode?.coordinates));

  if (resolved.length < 2) {
    return spreadOverlappingPositions(entities.map((_, index) => gridPosition(index)));
  }

  const lngValues = resolved.map(({ entity }) => entity.geocode?.coordinates?.lng ?? 0);
  const latValues = resolved.map(({ entity }) => entity.geocode?.coordinates?.lat ?? 0);
  const minLng = Math.min(...lngValues);
  const maxLng = Math.max(...lngValues);
  const minLat = Math.min(...latValues);
  const maxLat = Math.max(...latValues);
  const positions = entities.map((_, index) => gridPosition(index));

  for (const { entity, index } of resolved) {
    const coordinates = entity.geocode?.coordinates;
    if (!coordinates) {
      continue;
    }

    positions[index] = {
      x: scale(coordinates.lng, minLng, maxLng, 160, CANVAS_WIDTH - 260),
      y: scale(maxLat - coordinates.lat + minLat, minLat, maxLat, 140, CANVAS_HEIGHT - 180)
    };
  }

  return spreadOverlappingPositions(positions);
}

function gridPosition(index: number) {
  const columns = 4;
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: 160 + col * 340,
    y: 140 + row * 150
  };
}

function scale(value: number, min: number, max: number, outMin: number, outMax: number): number {
  if (min === max) {
    return (outMin + outMax) / 2;
  }

  return outMin + ((value - min) / (max - min)) * (outMax - outMin);
}

function spreadOverlappingPositions(positions: Array<{ x: number; y: number }>) {
  const groups = new Map<string, number[]>();
  positions.forEach((position, index) => {
    const key = `${Math.round(position.x)}:${Math.round(position.y)}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });

  const adjusted = positions.map((position) => ({ ...position }));
  for (const indexes of groups.values()) {
    if (indexes.length < 2) {
      continue;
    }

    const radius = 72;
    indexes.forEach((nodeIndex, offsetIndex) => {
      const position = adjusted[nodeIndex];
      if (!position) {
        return;
      }

      const angle = (Math.PI * 2 * offsetIndex) / indexes.length;
      position.x = clamp(position.x + Math.cos(angle) * radius, 80, CANVAS_WIDTH - NODE_WIDTH - 80);
      position.y = clamp(position.y + Math.sin(angle) * radius, 100, CANVAS_HEIGHT - NODE_HEIGHT - 100);
    });
  }

  return adjusted;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildLegend(entities: EnrichedEntity[], relations: GeoMindRelation[]): WhiteboardLegendItem[] {
  const usedEntityTypes = new Set(entities.map((entity) => entity.type));
  const usedRelationTypes = new Set(relations.map((relation) => relation.relationType));
  const entityLegend = [...usedEntityTypes].map((type) => ({
    label: ENTITY_COLORS[type].label,
    color: ENTITY_COLORS[type].stroke,
    entityType: type
  }));
  const relationLegend = [...usedRelationTypes].map((type) => ({
    label: RELATION_LABELS[type],
    color: type === "supply" ? "#CA8A04" : "#475569",
    relationType: type
  }));

  return [...entityLegend, ...relationLegend];
}
