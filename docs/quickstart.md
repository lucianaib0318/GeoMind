# Quickstart

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env`, then set `TENCENT_MAP_KEY`.

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## 3. Run the local demo

```bash
npm run demo
```

The demo reads `examples/sample-input.md`, runs extraction, geocoding, schema validation, and writes:

- `examples/sample-output.json`
- `output/geomind.html`
- `output/geomind.svg`
- Tencent geocode cache under `cache/geocode-cache.json`

## 4. Run against Feishu

Install and authenticate Feishu CLI first:

```bash
npm install -g @larksuite/cli
npx skills add larksuite/cli -y -g
lark-cli config init
lark-cli auth login --recommend
lark-cli doctor
```

On Windows, if `lark-cli` is not recognized after installation, add npm's global bin directory to PATH:

```powershell
$npmBin = npm prefix -g
$env:Path = "$npmBin;$env:Path"
[Environment]::SetEnvironmentVariable("Path", "$npmBin;$([Environment]::GetEnvironmentVariable('Path', 'User'))", "User")
lark-cli --version
```

If `npx skills add larksuite/cli -y -g` fails with `spawn git ENOENT`, install Git for Windows and reopen PowerShell:

```powershell
winget install --id Git.Git -e --source winget
```

Then configure a command template that prints document JSON:

```bash
FEISHU_CLI_COMMAND_TEMPLATE="lark-cli docs +fetch --doc {url} --api-version v2 --format json"
```

If your local Feishu CLI uses a different command, keep the placeholders and change only the command:

- `{url}`: original Feishu URL
- `{token}`: parsed wiki/doc/docx token
- `{kind}`: `doc`, `docx`, `wiki`, or `unknown`

Run:

```bash
npm run dev -- --url "https://your.feishu.cn/docx/xxx" --out output/geomind.json --whiteboard-out output/whiteboard.json --html-out output/geomind.html --svg-out output/geomind.svg
```

## 5. Useful commands

```bash
npm run typecheck
npm run build
npm test
```

Add `--print-json` to print the full structured payload in the terminal. For demos, prefer `--html-out output/geomind.html`.

## 6. Publish the visual result back to Feishu

After `npm run demo` or a Feishu document run has generated `output/geomind.html`, publish the visual preview and HTML artifact into a Feishu document:

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx"
```

Use an animated GIF preview:

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx" --gif
```

The publisher uses Feishu CLI to append a run summary, insert a Tencent Map screenshot or GIF, and upload `output/geomind.html` as a file card. Feishu document bodies do not execute arbitrary third-party JavaScript inline, so the document preview is an image/GIF while the attached HTML keeps the full draggable Tencent map.
