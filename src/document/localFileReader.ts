import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentInput, RawDocument } from "../types/index.js";

/** Reads a local text/markdown file through the same RawDocument contract used by Feishu. */
export async function readLocalDocument(filePath: string): Promise<RawDocument> {
  const absolutePath = path.resolve(filePath);
  const text = await readFile(absolutePath, "utf8");
  const input: DocumentInput = {
    source: "feishu",
    token: `local:${path.basename(absolutePath)}`,
    kind: "unknown"
  };

  return {
    input,
    title: readMarkdownTitle(text) ?? path.basename(absolutePath),
    text,
    fetchedAt: new Date().toISOString(),
    metadata: {
      localFile: absolutePath
    }
  };
}

function readMarkdownTitle(text: string): string | undefined {
  const match = /^#\s+(.+?)\s*$/m.exec(text);
  return match?.[1]?.trim() || undefined;
}
