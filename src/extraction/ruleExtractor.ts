import type {
  CleanedDocument,
  EntityType,
  ExtractionResult,
  GeoMindEntity,
  GeoMindRelation,
  RelationType
} from "../types/index.js";
import { stableId, normalizeKey } from "../utils/id.js";

const ENTITY_LABELS = new Set(["实体", "机构", "企业", "公司", "节点", "实验室", "园区", "厂址", "entity"]);
const RELATION_LABELS = new Set(["关系", "relation"]);

const ENTITY_SUFFIX_PATTERN =
  /([\u4e00-\u9fa5A-Za-z0-9·（）()&.\- ]{2,60}(?:大学|研究院|研究所|实验室|公司|集团|工厂|基地|园区|中心|科学院|Institute|University|Lab|Labs|Corporation|Inc\.?|Ltd\.?))/g;

const TECH_KEYWORDS = [
  "AI",
  "人工智能",
  "大模型",
  "机器人",
  "自动驾驶",
  "半导体",
  "芯片",
  "新能源",
  "电池",
  "光伏",
  "生物医药",
  "材料",
  "量子",
  "云计算",
  "边缘计算",
  "物联网",
  "卫星",
  "航空航天",
  "储能",
  "智能制造"
];

/** Extracts MVP entities and relations with explicit-line parsing plus heuristic fallback. */
export function extractEntitiesAndRelations(document: CleanedDocument): ExtractionResult {
  const warnings: string[] = [];
  const entitiesByName = new Map<string, GeoMindEntity>();
  const relations: GeoMindRelation[] = [];
  const lines = document.text.split("\n").map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const structuredEntity = parseStructuredEntity(line);
    if (structuredEntity) {
      upsertEntity(entitiesByName, structuredEntity);
      continue;
    }

    const structuredRelation = parseStructuredRelation(line);
    if (structuredRelation) {
      relations.push(structuredRelation);
    }
  }

  const heuristicText = document.sections.map((section) => removeStructuredLines(section.content)).join("\n");

  for (const entity of extractHeuristicEntities(heuristicText)) {
      upsertEntity(entitiesByName, entity);
  }

  const entities = [...entitiesByName.values()];
  const nameToId = new Map(entities.map((entity) => [normalizeKey(entity.name), entity.id]));

  const normalizedRelations = relations
    .map((relation) => normalizeRelationEntityIds(relation, nameToId))
    .filter((relation): relation is GeoMindRelation => Boolean(relation));

  normalizedRelations.push(...extractHeuristicRelations(heuristicText, entities));

  const uniqueRelations = dedupeRelations(normalizedRelations);
  if (entities.length === 0) {
    warnings.push("No entities were extracted. Use explicit '实体:' lines or connect an LLM extractor.");
  }

  return {
    entities,
    relations: uniqueRelations,
    warnings
  };
}

function parseStructuredEntity(line: string): GeoMindEntity | undefined {
  const normalized = stripBullet(line);
  const firstField = readLeadingField(normalized);
  if (!firstField || !ENTITY_LABELS.has(firstField.key)) {
    return undefined;
  }

  const fields = parseFieldList(firstField.rest);
  const name = firstField.value || fields.get("名称") || fields.get("name");
  if (!name) {
    return undefined;
  }

  const type = parseEntityType(fields.get("类型") ?? fields.get("type") ?? firstField.key);
  const locationText = fields.get("地点") ?? fields.get("位置") ?? fields.get("location");
  const techFields = splitList(fields.get("技术") ?? fields.get("领域") ?? fields.get("tech") ?? fields.get("technology"));
  const evidence = fields.get("证据") ?? fields.get("evidence") ?? line;

  return compactEntity({
    id: stableId("ent", name),
    name,
    type,
    ...(locationText ? { locationText } : {}),
    techFields,
    evidence: [evidence],
    confidence: 0.92
  });
}

function parseStructuredRelation(line: string): GeoMindRelation | undefined {
  const normalized = stripBullet(line);
  const firstField = readLeadingField(normalized);
  if (!firstField || !RELATION_LABELS.has(firstField.key)) {
    return undefined;
  }

  const fields = parseFieldList(firstField.rest);
  const pair = firstField.value || fields.get("主体") || fields.get("pair") || "";
  const match = /(.+?)(?:->|→|=>|-->|到|至)(.+)/.exec(pair);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const source = match[1].trim();
  const target = match[2].trim();
  const relationType = parseRelationType(fields.get("类型") ?? fields.get("type") ?? fields.get("关系类型"));
  const evidence = fields.get("证据") ?? fields.get("evidence") ?? line;

  return {
    id: stableId("rel", `${source}:${target}:${relationType}:${evidence}`),
    source,
    target,
    relationType,
    evidence,
    confidence: 0.9
  };
}

function readLeadingField(line: string): { key: string; value: string; rest: string } | undefined {
  const match = /^([^:：|]+)\s*[:：]\s*([^|]*)(?:\|(.*))?$/.exec(line);
  if (!match?.[1]) {
    return undefined;
  }

  return {
    key: match[1].trim(),
    value: (match[2] ?? "").trim(),
    rest: match[3] ?? ""
  };
}

function parseFieldList(value: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const part of value.split("|")) {
    const match = /^\s*([^:：]+)\s*[:：]\s*(.+?)\s*$/.exec(part);
    if (match?.[1] && match[2]) {
      fields.set(match[1].trim(), match[2].trim());
    }
  }

  return fields;
}

function stripBullet(line: string): string {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+[.)、]\s*/, "").trim();
}

function splitList(value?: string): string[] {
  if (!value) {
    return [];
  }

  return [...new Set(value.split(/[、,，;/；]/).map((item) => item.trim()).filter(Boolean))];
}

function parseEntityType(value?: string): EntityType {
  const text = value?.toLowerCase() ?? "";
  if (/大学|university/.test(text)) return "university";
  if (/研究院|研究所|institute|科学院/.test(text)) return "research_institute";
  if (/实验室|lab/.test(text)) return "lab";
  if (/园区|park/.test(text)) return "industrial_park";
  if (/工厂|厂址|基地|factory/.test(text)) return "factory";
  if (/政府|agency/.test(text)) return "government_agency";
  if (/供应|仓储|节点|supply/.test(text)) return "supply_chain_node";
  if (/公司|集团|企业|corp|inc|ltd|company/.test(text)) return "company";
  if (/地点|location/.test(text)) return "location";
  return "other";
}

function parseRelationType(value?: string): RelationType {
  const text = value?.toLowerCase() ?? "";
  if (/合作|collab|联合/.test(text)) return "collaboration";
  if (/投资|invest/.test(text)) return "investment";
  if (/供应|supply|供货/.test(text)) return "supply";
  if (/客户|customer|采购/.test(text)) return "customer";
  if (/联合实验室|joint/.test(text)) return "joint_lab";
  if (/位于|located/.test(text)) return "located_in";
  if (/子公司|subsidiary/.test(text)) return "subsidiary";
  if (/转移|transfer|授权/.test(text)) return "technology_transfer";
  if (/竞争|competition/.test(text)) return "competition";
  return "other";
}

function extractHeuristicEntities(text: string): GeoMindEntity[] {
  const entities: GeoMindEntity[] = [];
  const sentences = text.split(/[。；;\n]/).map((sentence) => sentence.trim()).filter(Boolean);

  for (const sentence of sentences) {
    const matches = sentence.matchAll(ENTITY_SUFFIX_PATTERN);
    for (const match of matches) {
      const name = cleanEntityName(match[1] ?? "");
      if (!isLikelyEntityName(name)) {
        continue;
      }

      const techFields = TECH_KEYWORDS.filter((keyword) => sentence.includes(keyword));
      const locationText = extractLocationText(sentence);
      entities.push(
        compactEntity({
          id: stableId("ent", name),
          name,
          type: parseEntityType(name),
          ...(locationText ? { locationText } : {}),
          techFields,
          evidence: [sentence],
          confidence: 0.62
        })
      );
    }
  }

  return entities;
}

function cleanEntityName(value: string): string {
  const cleaned = value
    .replace(/^[与和及、，,。；;\s]+/, "")
    .replace(/[，,。；;\s]+$/, "")
    .trim();
  const segments = cleaned.split(/[与和及、]/).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments[segments.length - 1] ?? cleaned : cleaned;
}

function isLikelyEntityName(name: string): boolean {
  if (name.length < 2 || name.length > 60) {
    return false;
  }

  if (/^(智能制造|新能源|高端装备|工业互联网|供应链|制造)(工厂|基地|中心|网络)$/.test(name)) {
    return false;
  }

  return !/^(该|其中|包括|以及|通过|围绕|建设|形成)/.test(name);
}

function extractLocationText(sentence: string): string | undefined {
  const explicit = /(?:地点|位置|总部|厂址|地址)\s*[:：]\s*([^|，,。；;\n]{2,40})/.exec(sentence);
  if (explicit?.[1]) {
    return explicit[1].trim();
  }

  const narrative = /(?:位于|坐落于|落地于|设在|部署在|总部在)([^|，,。；;\n]{2,40})/.exec(sentence);
  return narrative?.[1]?.trim();
}

function extractHeuristicRelations(text: string, entities: GeoMindEntity[]): GeoMindRelation[] {
  const relations: GeoMindRelation[] = [];
  const sentences = text.split(/[。；;\n]/).map((sentence) => sentence.trim()).filter(Boolean);

  for (const sentence of sentences) {
    const mentioned = entities.filter((entity) => sentence.includes(entity.name));
    if (mentioned.length < 2) {
      continue;
    }

    const relationType = inferRelationType(sentence);
    for (let index = 0; index < mentioned.length - 1; index += 1) {
      const source = mentioned[index];
      const target = mentioned[index + 1];
      if (!source || !target || source.id === target.id) {
        continue;
      }

      relations.push({
        id: stableId("rel", `${source.id}:${target.id}:${relationType}:${sentence}`),
        source: source.id,
        target: target.id,
        relationType,
        evidence: sentence,
        confidence: 0.58
      });
    }
  }

  return relations;
}

function inferRelationType(sentence: string): RelationType {
  if (/联合实验室|共建实验室/.test(sentence)) return "joint_lab";
  if (/供应|供货|供给|供应链/.test(sentence)) return "supply";
  if (/投资|参股|融资/.test(sentence)) return "investment";
  if (/客户|采购|订单/.test(sentence)) return "customer";
  if (/转移|授权|许可/.test(sentence)) return "technology_transfer";
  if (/竞争|对标/.test(sentence)) return "competition";
  if (/合作|联合|协同|共建|签署/.test(sentence)) return "collaboration";
  return "other";
}

function upsertEntity(map: Map<string, GeoMindEntity>, next: GeoMindEntity): void {
  const key = normalizeKey(next.name);
  const previous = map.get(key);
  if (!previous) {
    map.set(key, next);
    return;
  }

  const locationText = previous.locationText ?? next.locationText;
  map.set(key, {
    ...previous,
    type: previous.type !== "other" ? previous.type : next.type,
    ...(locationText ? { locationText } : {}),
    techFields: [...new Set([...previous.techFields, ...next.techFields])],
    evidence: [...new Set([...(previous.evidence ?? []), ...(next.evidence ?? [])])],
    confidence: Math.max(previous.confidence ?? 0, next.confidence ?? 0)
  });
}

function normalizeRelationEntityIds(
  relation: GeoMindRelation,
  nameToId: Map<string, string>
): GeoMindRelation | undefined {
  const source = nameToId.get(normalizeKey(relation.source)) ?? relation.source;
  const target = nameToId.get(normalizeKey(relation.target)) ?? relation.target;
  if (source === relation.source || target === relation.target) {
    return undefined;
  }

  return {
    ...relation,
    source,
    target,
    id: stableId("rel", `${source}:${target}:${relation.relationType}:${relation.evidence}`)
  };
}

function dedupeRelations(relations: GeoMindRelation[]): GeoMindRelation[] {
  const byKey = new Map<string, GeoMindRelation>();

  for (const relation of relations) {
    const key = `${relation.source}:${relation.target}:${relation.relationType}`;
    const previous = byKey.get(key);
    if (previous && (previous.confidence ?? 0) >= (relation.confidence ?? 0)) {
      continue;
    }

    byKey.set(key, relation);
  }

  return [...byKey.values()];
}

function compactEntity(entity: GeoMindEntity): GeoMindEntity {
  return {
    ...entity,
    techFields: [...new Set(entity.techFields)]
  };
}

function removeStructuredLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const stripped = stripBullet(line);
      const field = readLeadingField(stripped);
      return !field || (!ENTITY_LABELS.has(field.key) && !RELATION_LABELS.has(field.key));
    })
    .join("\n");
}
