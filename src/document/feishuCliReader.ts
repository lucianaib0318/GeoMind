import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { DocumentInput, JsonValue, RawDocument } from "../types/index.js";
import { parseTokenFromUrl } from "./feishuInput.js";

const execAsync = promisify(exec);

export interface FeishuCliReaderOptions {
  commandTemplate?: string;
  timeoutMs?: number;
}

interface ParsedCliOutput {
  title?: string;
  text: string;
  blocks?: JsonValue[];
  metadata?: Record<string, JsonValue>;
}

/** Reads document content by invoking a user-configurable Feishu CLI command template. */
export class FeishuCliDocumentReader {
  private readonly commandTemplate: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: FeishuCliReaderOptions = {}) {
    this.commandTemplate = options.commandTemplate;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  async read(input: DocumentInput): Promise<RawDocument> {
    const normalized = normalizeInput(input);

    if (!this.commandTemplate) {
      throw new Error(
        "Missing FEISHU_CLI_COMMAND_TEMPLATE. Set it to a command that prints document text or JSON; placeholders: {url}, {token}, {kind}."
      );
    }

    const command = renderCommandTemplate(this.commandTemplate, normalized);
    const { stdout, stderr } = await execAsync(command, {
      timeout: this.timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    });

    const parsed = parseCliOutput(stdout);
    return {
      input: normalized,
      ...(parsed.title ? { title: parsed.title } : {}),
      text: parsed.text,
      ...(parsed.blocks ? { blocks: parsed.blocks } : {}),
      fetchedAt: new Date().toISOString(),
      metadata: {
        adapter: "feishu-cli",
        commandTemplate: this.commandTemplate,
        ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
        ...(parsed.metadata ?? {})
      }
    };
  }
}

function normalizeInput(input: DocumentInput): DocumentInput {
  if (input.token || !input.url) {
    return input;
  }

  const parsed = parseTokenFromUrl(input.url);
  return {
    ...input,
    ...(parsed.token ? { token: parsed.token } : {}),
    kind: input.kind ?? parsed.kind
  };
}

function renderCommandTemplate(template: string, input: DocumentInput): string {
  return template
    .replaceAll("{url}", shellQuote(input.url ?? ""))
    .replaceAll("{token}", shellQuote(input.token ?? ""))
    .replaceAll("{kind}", shellQuote(input.kind ?? "unknown"));
}

function shellQuote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function parseCliOutput(stdout: string): ParsedCliOutput {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Feishu CLI command returned empty output.");
  }

  try {
    const json = JSON.parse(trimmed) as JsonValue;
    return parseJsonOutput(json);
  } catch {
    return { text: trimmed };
  }
}

function parseJsonOutput(value: JsonValue): ParsedCliOutput {
  if (!isRecord(value)) {
    return { text: String(value) };
  }

  const larkCliDocument = parseLarkCliDocumentOutput(value);
  if (larkCliDocument) {
    return larkCliDocument;
  }

  const title = firstString(value, ["title", "name"]);
  const directText = firstString(value, ["text", "content", "markdown", "plain_text"]);
  const blocks = firstArray(value, ["blocks", "children"]);
  const text = directText ?? collectText(value).join("\n").trim();

  if (!text) {
    throw new Error("Feishu CLI JSON output did not contain readable text.");
  }

  return {
    ...(title ? { title } : {}),
    text,
    ...(blocks ? { blocks } : {}),
    metadata: {
      outputFormat: "json"
    }
  };
}

function parseLarkCliDocumentOutput(record: Record<string, JsonValue>): ParsedCliOutput | undefined {
  const data = record["data"] ?? null;
  if (!isRecord(data)) {
    return undefined;
  }

  const document = data["document"] ?? null;
  if (!isRecord(document)) {
    return undefined;
  }

  const content = firstString(document, ["content", "markdown", "text", "plain_text"]);
  if (content === undefined) {
    return undefined;
  }

  const cleanedContent = stripFeishuDocumentMarkup(content);
  const title = readTitleFromFeishuMarkup(content);
  const documentId = firstString(document, ["document_id"]);
  const revisionId = document["revision_id"];

  return {
    ...(title ? { title } : {}),
    text: cleanedContent,
    metadata: {
      outputFormat: "lark-cli-docs-fetch",
      ...(documentId ? { documentId } : {}),
      ...(typeof revisionId === "number" ? { revisionId } : {})
    }
  };
}

function stripFeishuDocumentMarkup(content: string): string {
  return content
    .replace(/<\/title>/gi, "\n")
    .replace(/<title>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readTitleFromFeishuMarkup(content: string): string | undefined {
  const match = /<title>(.*?)<\/title>/is.exec(content);
  return match?.[1]?.trim() || undefined;
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(record: Record<string, JsonValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function firstArray(record: Record<string, JsonValue>, keys: string[]): JsonValue[] | undefined {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function collectText(value: JsonValue, depth = 0): string[] {
  if (depth > 8) {
    return [];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item, depth + 1));
  }

  const preferredKeys = ["text", "plain_text", "content", "title"];
  const preferred = preferredKeys.flatMap((key) => collectText(value[key] ?? null, depth + 1));
  const nested = Object.entries(value)
    .filter(([key]) => !preferredKeys.includes(key))
    .flatMap(([, nestedValue]) => collectText(nestedValue, depth + 1));

  return [...preferred, ...nested];
}
