import { createHash } from "node:crypto";

/** Produces a short deterministic id that is stable across repeated runs. */
export function stableId(prefix: string, value: string): string {
  const digest = createHash("sha1").update(value).digest("hex").slice(0, 10);
  return `${prefix}_${digest}`;
}

/** Normalizes labels for matching while keeping the original display text elsewhere. */
export function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
