import type { DocumentInput, FeishuDocumentKind } from "../types/index.js";

const TOKEN_PATTERNS: Array<{ kind: FeishuDocumentKind; pattern: RegExp }> = [
  { kind: "docx", pattern: /\/docx\/([A-Za-z0-9]+)/ },
  { kind: "doc", pattern: /\/docs?\/([A-Za-z0-9]+)/ },
  { kind: "wiki", pattern: /\/wiki\/([A-Za-z0-9]+)/ }
];

/** Parses a Feishu/Lark URL or raw token into the normalized document input shape. */
export function parseFeishuInput(value: string): DocumentInput {
  const trimmed = value.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = parseTokenFromUrl(trimmed);
    return {
      source: "feishu",
      url: trimmed,
      ...(parsed.token ? { token: parsed.token } : {}),
      kind: parsed.kind
    };
  }

  return {
    source: "feishu",
    token: trimmed,
    kind: "unknown"
  };
}

/** Extracts token and best-effort document kind from common Feishu URL forms. */
export function parseTokenFromUrl(url: string): { token?: string; kind: FeishuDocumentKind } {
  for (const candidate of TOKEN_PATTERNS) {
    const match = candidate.pattern.exec(url);
    if (match?.[1]) {
      return { token: match[1], kind: candidate.kind };
    }
  }

  return { kind: "unknown" };
}
