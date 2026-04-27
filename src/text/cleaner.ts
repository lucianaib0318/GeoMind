import type { CleanedDocument, CleanedSection, RawDocument } from "../types/index.js";
import { stableId } from "../utils/id.js";

const HEADING_PATTERN = /^(#{1,6}\s+.+|[\u4e00-\u9fa5A-Za-z0-9][^。；;]{0,40}[：:]?)$/;

/** Cleans raw document text and splits it into lightweight sections for extraction. */
export function cleanDocument(raw: RawDocument): CleanedDocument {
  const normalized = normalizeText(raw.text);
  const sections = splitIntoSections(normalized);

  return {
    ...(raw.title ? { title: raw.title } : {}),
    text: normalized,
    sections,
    stats: {
      originalChars: raw.text.length,
      cleanedChars: normalized.length,
      sectionCount: sections.length
    }
  };
}

/** Removes low-value formatting noise while preserving paragraph boundaries. */
export function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").replace(/[ \u00A0]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoSections(text: string): CleanedSection[] {
  if (!text) {
    return [];
  }

  const lines = text.split("\n");
  const sections: CleanedSection[] = [];
  let currentHeading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content && !currentHeading) {
      return;
    }

    const order = sections.length;
    const sectionText = [currentHeading, content].filter(Boolean).join("\n");
    sections.push({
      id: stableId("section", `${order}:${sectionText}`),
      ...(currentHeading ? { heading: currentHeading } : {}),
      content: content || currentHeading || "",
      order
    });
    buffer = [];
  };

  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      currentHeading = line.replace(/^#{1,6}\s+/, "").replace(/[：:]$/, "").trim();
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (sections.length === 0) {
    return [
      {
        id: stableId("section", text),
        content: text,
        order: 0
      }
    ];
  }

  return sections;
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
    return false;
  }

  return HEADING_PATTERN.test(trimmed) && trimmed.length <= 48;
}
