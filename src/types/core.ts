export const GEOMIND_SCHEMA_VERSION = "0.1.0" as const;

export type GeoMindSchemaVersion = typeof GEOMIND_SCHEMA_VERSION;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type FeishuDocumentKind = "doc" | "docx" | "wiki" | "unknown";

export interface DocumentInput {
  source: "feishu";
  /** Feishu document URL copied from the browser. */
  url?: string;
  /** Feishu wiki/doc/docx token parsed from the URL or provided directly. */
  token?: string;
  /** Best-effort document kind. Adapters may refine this after parsing the URL. */
  kind?: FeishuDocumentKind;
}

export interface RawDocument {
  input: DocumentInput;
  title?: string;
  /** Plain text assembled from Feishu CLI output or a compatible adapter. */
  text: string;
  /** Optional block-level payload retained for future whiteboard/source tracing. */
  blocks?: JsonValue[];
  fetchedAt: string;
  metadata?: Record<string, JsonValue>;
}

export interface CleanedSection {
  id: string;
  heading?: string;
  content: string;
  order: number;
}

export interface CleanedDocument {
  title?: string;
  text: string;
  sections: CleanedSection[];
  stats: {
    originalChars: number;
    cleanedChars: number;
    sectionCount: number;
  };
}

export type EntityType =
  | "research_institute"
  | "university"
  | "company"
  | "factory"
  | "lab"
  | "industrial_park"
  | "government_agency"
  | "supply_chain_node"
  | "location"
  | "other";

export type RelationType =
  | "collaboration"
  | "investment"
  | "supply"
  | "customer"
  | "joint_lab"
  | "located_in"
  | "subsidiary"
  | "technology_transfer"
  | "competition"
  | "other";

export interface GeoMindEntity {
  id: string;
  name: string;
  type: EntityType;
  /** Raw location phrase from source text, for example "上海张江" or "Boston, MA". */
  locationText?: string;
  techFields: string[];
  aliases?: string[];
  evidence?: string[];
  /** Confidence score in [0, 1]. */
  confidence?: number;
}

export interface GeoMindRelation {
  id: string;
  /** Entity id of the source node. */
  source: string;
  /** Entity id of the target node. */
  target: string;
  relationType: RelationType;
  evidence: string;
  /** Confidence score in [0, 1]. */
  confidence?: number;
}

export interface ExtractionResult {
  entities: GeoMindEntity[];
  relations: GeoMindRelation[];
  warnings: string[];
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type GeocodeProvider = "tencent";
export type GeocodeStatus = "resolved" | "cached" | "fallback" | "failed";

export interface GeocodedLocation {
  provider: GeocodeProvider;
  query: string;
  status: GeocodeStatus;
  coordinates?: Coordinates;
  formattedAddress?: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  cachedAt?: string;
  error?: string;
  raw?: JsonValue;
}

export interface EnrichedEntity extends GeoMindEntity {
  geocode?: GeocodedLocation;
}

export interface WhiteboardPoint {
  x: number;
  y: number;
}

export interface WhiteboardNode {
  id: string;
  entityId: string;
  label: string;
  type: EntityType;
  position: WhiteboardPoint;
  size: {
    width: number;
    height: number;
  };
  style: {
    fill: string;
    stroke: string;
    textColor: string;
  };
  metadata?: Record<string, JsonValue>;
}

export interface WhiteboardEdge {
  id: string;
  relationId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string;
  style: {
    stroke: string;
    lineStyle: "solid" | "dashed";
  };
  metadata?: Record<string, JsonValue>;
}

export interface WhiteboardLegendItem {
  label: string;
  color: string;
  entityType?: EntityType;
  relationType?: RelationType;
}

export interface WhiteboardDsl {
  schemaVersion: GeoMindSchemaVersion;
  title: string;
  canvas: {
    width: number;
    height: number;
    projection: "geo-grid-mvp";
  };
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
  legend: WhiteboardLegendItem[];
  notes: string[];
}

export interface GeoMindSummary {
  text: string;
  entityCount: number;
  relationCount: number;
  geocodedCount: number;
  failedGeocodeCount: number;
  topTechFields: string[];
}

export interface GeoMindOutput {
  schemaVersion: GeoMindSchemaVersion;
  generatedAt: string;
  input: DocumentInput;
  document: {
    title?: string;
    stats: CleanedDocument["stats"];
  };
  extraction: ExtractionResult;
  entities: EnrichedEntity[];
  relations: GeoMindRelation[];
  whiteboard: WhiteboardDsl;
  summary: GeoMindSummary;
  warnings: string[];
}
