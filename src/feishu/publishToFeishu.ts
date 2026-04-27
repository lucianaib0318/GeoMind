import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import GIFEncoder from "gif-encoder-2";
import { PNG } from "pngjs";

const execFile = promisify(execFileCallback);

interface PublishOptions {
  doc?: string;
  html?: string;
  json?: string;
  image?: string;
  gif?: boolean;
  gifFrames?: string;
  gifDelayMs?: string;
  markdownOut?: string;
  previewUrl?: string;
  port?: string;
}

interface SummaryFile {
  summary?: {
    text?: string;
    entityCount?: number;
    relationCount?: number;
    geocodedCount?: number;
    failedGeocodeCount?: number;
    topTechFields?: string[];
  };
}

const program = new Command();

program
  .name("geomind-feishu-publish")
  .description("Publish the GeoMind visual preview and interactive HTML artifact back into a Feishu document.")
  .requiredOption("--doc <urlOrToken>", "Feishu document URL or token")
  .option("--html <path>", "Generated GeoMind HTML file", "output/geomind.html")
  .option("--json <path>", "Generated GeoMind JSON file", "examples/sample-output.json")
  .option("--image <path>", "Preview image output path. Use .gif together with --gif for animation.")
  .option("--gif", "Generate and insert an animated GIF preview instead of a PNG screenshot")
  .option("--gif-frames <count>", "Animated GIF frame count", "10")
  .option("--gif-delay-ms <ms>", "Animated GIF delay per frame", "560")
  .option("--markdown-out <path>", "Generated Feishu markdown section", "output/feishu-publish.md")
  .option("--preview-url <url>", "Existing preview URL to capture instead of starting a static server")
  .option("--port <port>", "Local static preview port", "4173")
  .parse(process.argv);

const options = program.opts<PublishOptions>();

try {
  await publishToFeishu(options);
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}

async function publishToFeishu(options: PublishOptions): Promise<void> {
  if (!options.doc) {
    throw new Error("Missing --doc.");
  }

  const htmlPath = path.resolve(options.html ?? "output/geomind.html");
  const jsonPath = path.resolve(options.json ?? "examples/sample-output.json");
  const wantsGif = Boolean(options.gif) || Boolean(options.image?.toLowerCase().endsWith(".gif"));
  const imagePath = path.resolve(options.image ?? (wantsGif ? "output/geomind-feishu-preview.gif" : "output/geomind-feishu-preview.png"));
  const markdownPath = path.resolve(options.markdownOut ?? "output/feishu-publish.md");
  const port = Number.parseInt(options.port ?? "4173", 10);
  const gifFrames = boundedInteger(options.gifFrames, 10, 4, 24);
  const gifDelayMs = boundedInteger(options.gifDelayMs, 560, 160, 1600);

  await assertFile(htmlPath);
  await assertFile(jsonPath);
  await mkdir(path.dirname(imagePath), { recursive: true });
  await mkdir(path.dirname(markdownPath), { recursive: true });

  const staticServer = options.previewUrl ? undefined : await startStaticServer(path.dirname(htmlPath), port);
  const previewUrl = options.previewUrl
    ? options.previewUrl
    : `${staticServer?.baseUrl ?? `http://127.0.0.1:${port}`}/${encodeURIComponent(path.basename(htmlPath))}`;

  try {
    if (wantsGif) {
      await captureAnimatedGif(previewUrl, imagePath, { frames: gifFrames, delayMs: gifDelayMs });
    } else {
      await capturePngScreenshot(previewUrl, imagePath);
    }
  } finally {
    await staticServer?.close();
  }

  const summaryFile = JSON.parse(await readFile(jsonPath, "utf8")) as SummaryFile;
  const markdown = buildFeishuMarkdown(summaryFile, {
    htmlPath,
    imagePath,
    previewKind: wantsGif ? "gif" : "png",
    previewUrl
  });
  await writeFile(markdownPath, markdown, "utf8");

  const warnings: string[] = [];
  try {
    await runLarkCli([
      "docs",
      "+update",
      "--api-version",
      "v2",
      "--doc",
      options.doc,
      "--command",
      "append",
      "--doc-format",
      "markdown",
      "--content",
      `@${toCliPath(markdownPath)}`
    ]);
  } catch (error) {
    warnings.push(`Feishu markdown append failed: ${errorMessage(error)}`);
  }

  await runLarkCli([
    "docs",
    "+media-insert",
    "--doc",
    options.doc,
    "--file",
    toCliPath(imagePath),
    "--type",
    "image",
    "--align",
    "center",
    "--caption",
    wantsGif
      ? "\u0047\u0065\u006f\u004d\u0069\u006e\u0064 \u817e\u8baf\u5730\u56fe\u4ea4\u4e92\u524d\u7aef\u52a8\u6001\u9884\u89c8"
      : "\u0047\u0065\u006f\u004d\u0069\u006e\u0064 \u817e\u8baf\u5730\u56fe\u4ea4\u4e92\u524d\u7aef\u9884\u89c8"
  ]);

  await runLarkCli([
    "docs",
    "+media-insert",
    "--doc",
    options.doc,
    "--file",
    toCliPath(htmlPath),
    "--type",
    "file",
    "--file-view",
    "card"
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        doc: options.doc,
        previewUrl,
        files: {
          markdown: markdownPath,
          image: imagePath,
          html: htmlPath
        },
        warnings
      },
      null,
      2
    )
  );
}

async function assertFile(filePath: string): Promise<void> {
  const fileStat = await stat(filePath).catch(() => undefined);
  if (!fileStat?.isFile()) {
    throw new Error(`File not found: ${filePath}`);
  }
}

async function capturePngScreenshot(url: string, imagePath: string, virtualTimeBudgetMs = 15000): Promise<void> {
  const chromePath = findBrowserExecutable();
  if (!chromePath) {
    throw new Error("Chrome or Edge was not found. Set CHROME_PATH to enable screenshot capture.");
  }

  await execFile(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--window-size=1600,1200",
      "--hide-scrollbars",
      `--virtual-time-budget=${virtualTimeBudgetMs}`,
      `--screenshot=${imagePath}`,
      url
    ],
    { maxBuffer: 1024 * 1024 * 8 }
  );
}

async function captureAnimatedGif(
  url: string,
  gifPath: string,
  options: {
    frames: number;
    delayMs: number;
  }
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "geomind-gif-"));
  const framePaths: string[] = [];

  try {
    for (let index = 0; index < options.frames; index += 1) {
      const framePath = path.join(tempDir, `frame-${String(index).padStart(3, "0")}.png`);
      framePaths.push(framePath);
      await capturePngScreenshot(url, framePath, 9000 + index * options.delayMs);
    }

    await encodeGifFromPngFrames(framePaths, gifPath, options.delayMs);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function encodeGifFromPngFrames(framePaths: string[], gifPath: string, delayMs: number): Promise<void> {
  if (!framePaths.length) {
    throw new Error("No frames were captured for GIF preview.");
  }

  const frames = await Promise.all(framePaths.map(async (framePath) => PNG.sync.read(await readFile(framePath))));
  const firstFrame = frames[0];
  if (!firstFrame) {
    throw new Error("No readable frames were captured for GIF preview.");
  }

  const encoder = new GIFEncoder(firstFrame.width, firstFrame.height, "octree", true, frames.length);
  encoder.setDelay(delayMs);
  encoder.setRepeat(0);
  encoder.start();

  for (const frame of frames) {
    if (frame.width !== firstFrame.width || frame.height !== firstFrame.height) {
      throw new Error("Captured GIF frames have inconsistent dimensions.");
    }
    encoder.addFrame(frame.data);
  }

  encoder.finish();
  await writeFile(gifPath, encoder.out.getData());
}

function findBrowserExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => existsSync(candidate));
}

async function startStaticServer(rootDir: string, preferredPort: number): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const root = path.resolve(rootDir);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const requestedPath = requestUrl.pathname === "/" ? "/geomind.html" : requestUrl.pathname;
      const filePath = path.resolve(root, `.${decodeURIComponent(requestedPath)}`);
      const relative = path.relative(root, filePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath).catch(() => undefined);
      if (!fileStat?.isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "content-type": contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  const port = await listen(server, preferredPort).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      return preferredPort;
    }
    throw error;
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    });
  });
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function buildFeishuMarkdown(
  output: SummaryFile,
  context: {
    htmlPath: string;
    imagePath: string;
    previewKind: "gif" | "png";
    previewUrl: string;
  }
): string {
  const summary = output.summary ?? {};
  const topTechFields = summary.topTechFields?.join("\u3001") || "-";
  const generatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  }).format(new Date());

  return [
    "## GeoMind \u6587\u6863\u5185\u53ef\u89c6\u5316\u9884\u89c8",
    "",
    "\u672c\u533a\u57df\u7531 GeoMind \u901a\u8fc7\u98de\u4e66 CLI \u81ea\u52a8\u5199\u5165\uff1a\u8bfb\u53d6\u5f53\u524d\u98de\u4e66\u6587\u6863\uff0c\u62bd\u53d6\u4ea7\u4e1a\u8282\u70b9\u4e0e\u5173\u7cfb\uff0c\u8c03\u7528\u817e\u8baf\u4f4d\u7f6e\u670d\u52a1\u5b8c\u6210\u5730\u7406\u7f16\u7801\uff0c\u518d\u751f\u6210\u817e\u8baf\u5730\u56fe JSAPI GL \u4ea4\u4e92\u524d\u7aef\u3002",
    "",
    `- \u5c55\u793a\u6807\u9898\uff1a\u4e2d\u56fd\u65b0\u80fd\u6e90\u4e0e\u667a\u80fd\u5236\u9020\u4ea7\u4e1a\u5206\u5e03\u7f51\u7edc`,
    `- \u5b9e\u4f53\u6570\uff1a${summary.entityCount ?? "-"}`,
    `- \u5173\u7cfb\u6570\uff1a${summary.relationCount ?? "-"}`,
    `- \u5df2\u5b9a\u4f4d\u8282\u70b9\uff1a${summary.geocodedCount ?? "-"}`,
    `- \u672a\u5b9a\u4f4d\u8282\u70b9\uff1a${summary.failedGeocodeCount ?? 0}`,
    `- \u91cd\u70b9\u6280\u672f\u9886\u57df\uff1a${topTechFields}`,
    "",
    context.previewKind === "gif"
      ? "\u4e0b\u65b9 GIF \u662f\u4ea4\u4e92\u524d\u7aef\u7684\u52a8\u6001\u9884\u89c8\uff0c\u53ef\u76f4\u63a5\u5728\u98de\u4e66\u6587\u6863\u5185\u5c55\u793a\u817e\u8baf\u5730\u56fe\u4e0a\u7684\u8282\u70b9\u4e0e\u6570\u636e\u6d41\u52a8\u6548\u679c\uff1b\u540c\u6b65\u63d2\u5165\u7684 HTML \u9644\u4ef6\u53ef\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00\uff0c\u67e5\u770b\u53ef\u62d6\u62fd\u3001\u7f29\u653e\u3001\u70b9\u51fb\u8282\u70b9\u7684\u817e\u8baf\u5730\u56fe\u7248\u672c\u3002"
      : "\u4e0b\u65b9\u56fe\u7247\u662f\u4ea4\u4e92\u524d\u7aef\u7684\u5f53\u524d\u6e32\u67d3\u622a\u56fe\uff1b\u540c\u6b65\u63d2\u5165\u7684 HTML \u9644\u4ef6\u53ef\u5728\u6d4f\u89c8\u5668\u4e2d\u6253\u5f00\uff0c\u67e5\u770b\u53ef\u62d6\u62fd\u3001\u7f29\u653e\u3001\u70b9\u51fb\u8282\u70b9\u7684\u817e\u8baf\u5730\u56fe\u7248\u672c\u3002",
    "",
    `- \u672c\u5730\u9884\u89c8\uff1a${context.previewUrl}`,
    `- HTML \u4ea7\u7269\uff1a${context.htmlPath}`,
    `- \u622a\u56fe\u4ea7\u7269\uff1a${context.imagePath}`,
    `- \u53d1\u5e03\u65f6\u95f4\uff1a${generatedAt}`
  ].join("\n");
}

async function runLarkCli(args: string[]): Promise<void> {
  const executable = process.platform === "win32" ? "lark-cli.cmd" : "lark-cli";
  const retryable = new Set(["EOF", "ECONNRESET", "ETIMEDOUT", "socket hang up"]);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await execFile(executable, args, { maxBuffer: 1024 * 1024 * 8 });
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = [...retryable].some((keyword) => message.includes(keyword));
      if (!shouldRetry || attempt === 3) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }

  throw lastError;
}

function toCliPath(filePath: string): string {
  const relativePath = path.relative(process.cwd(), filePath);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return filePath;
}

function boundedInteger(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
