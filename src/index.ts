#!/usr/bin/env node
import { Command } from "commander";
import { loadGeoMindConfig } from "./config/env.js";
import { runGeoMind } from "./orchestrator/index.js";
import { errorMessage } from "./utils/errors.js";

const program = new Command();

program
  .name("geomind")
  .description("Generate geo-intelligence JSON and Feishu whiteboard DSL from a Feishu document.")
  .option("--url <url>", "Feishu document URL")
  .option("--token <token>", "Feishu wiki/doc/docx token")
  .option("--input-file <path>", "Local markdown/text file for demos and tests")
  .option("--out <path>", "Write full GeoMind JSON output to a file")
  .option("--whiteboard-out <path>", "Write only the whiteboard DSL to a file")
  .option("--html-out <path>", "Write a human-readable HTML visualization to a file")
  .option("--svg-out <path>", "Write a standalone SVG map to a file")
  .option("--title <title>", "Whiteboard title")
  .option("--feishu-command <template>", "Feishu CLI command template with {url}, {token}, {kind}")
  .option("--print-json", "Print the full GeoMind JSON payload to stdout")
  .option("--skip-geocode", "Skip Tencent geocoding")
  .parse(process.argv);

const options = program.opts<{
  url?: string;
  token?: string;
  inputFile?: string;
  out?: string;
  whiteboardOut?: string;
  htmlOut?: string;
  svgOut?: string;
  title?: string;
  feishuCommand?: string;
  printJson?: boolean;
  skipGeocode?: boolean;
}>();

try {
  const input = options.url ?? options.token;
  const output = await runGeoMind(
    {
      ...(input ? { input } : {}),
      ...(options.inputFile ? { inputFile: options.inputFile } : {}),
      ...(options.out ? { outputPath: options.out } : {}),
      ...(options.whiteboardOut ? { whiteboardPath: options.whiteboardOut } : {}),
      ...(options.htmlOut ? { htmlPath: options.htmlOut } : {}),
      ...(options.svgOut ? { svgPath: options.svgOut } : {}),
      ...(options.title ? { title: options.title } : {}),
      ...(options.feishuCommand ? { feishuCliCommandTemplate: options.feishuCommand } : {}),
      skipGeocode: Boolean(options.skipGeocode)
    },
    loadGeoMindConfig()
  );

  if (options.printJson) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          ok: true,
          summary: output.summary,
          files: {
            ...(options.out ? { json: options.out } : {}),
            ...(options.whiteboardOut ? { whiteboard: options.whiteboardOut } : {}),
            ...(options.htmlOut ? { html: options.htmlOut } : {}),
            ...(options.svgOut ? { svg: options.svgOut } : {})
          }
        },
        null,
        2
      )
    );
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: errorMessage(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
