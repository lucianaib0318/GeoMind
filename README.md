# GeoMind

## 开发背景

对于腾讯位置服务的开发，很多项目停留在地图可视化本身：把点、线、面展示在地图上，或者做一些常见的旅游攻略、POI 推荐、轨迹展示。但真正把地图能力和 AI Agent 的信息抽取、结构化推理、自动化发布结合起来的作品并不多。

飞书 CLI 是一个很强的自动化入口，但飞书自身已经具备大量基础能力。通过飞书 Aily，文档分析展示、消息提醒、多维表到期自动化提醒、飞书群实时监控等飞书原生场景，本身已经可以被很好地覆盖。也就是说，如果只是把飞书已有能力重新包装一遍，并不能形成新的产品价值。

那么，当飞书 CLI 和腾讯位置服务真正碰撞以后，会发生什么？

GeoMind 给出的答案是：把飞书文档中的科研机构、企业、工厂、实验室、园区、供应链和合作关系，自动抽取成结构化地理情报，再通过腾讯地图生成可视化的产业关系网络。这就是本项目带来的参赛作品：**科研与产业地理情报可视化 Skill**。

GeoMind 是一个基于 TypeScript + Node.js 的地理情报可视化 Skill。它通过飞书 CLI 读取飞书文档，抽取科研机构、企业、工厂、实验室、园区和供应链关系，调用腾讯位置服务完成地理编码，并生成可演示的腾讯地图 JSAPI GL 前端、结构化 JSON 和白板 DSL。

当前 Demo 标题：**中国新能源与智能制造产业分布网络**。

## 核心能力

- 读取飞书文档 URL、wiki token、doc/docx token，或本地 Markdown 示例
- 清洗文档文本并抽取实体、地点、技术领域和关系证据
- 使用腾讯位置服务地理编码，并带缓存和失败兜底
- 输出经过 JSON Schema 校验的结构化结果
- 生成腾讯地图 JSAPI GL 前端：卫星底图、节点、蓝色荧光弧线、流动数据点、右侧滚动面板
- 生成飞书白板可转换的中间 DSL
- 通过飞书 CLI 把运行结果发布回飞书文档：说明区、地图截图、HTML 交互附件

## 目录结构

```text
src
|-- config          # 环境变量与运行配置
|-- document        # 飞书 CLI 读取适配层与本地文档读取
|-- extraction      # 实体与关系抽取
|-- feishu          # 飞书文档发布脚本
|-- geocoding       # 腾讯位置服务封装
|-- orchestrator    # 主流程编排
|-- schemas         # JSON Schema 校验
|-- skill           # Skill 封装入口
|-- text            # 文本清洗
|-- types           # 核心 TypeScript 类型
|-- utils           # ID 与错误处理工具
`-- whiteboard      # 白板 DSL、SVG 和 HTML 地图渲染
```

## 快速开始

```bash
npm install
npm run demo
```

Demo 会读取 `examples/sample-input.md`，并生成：

- `examples/sample-output.json`
- `output/geomind.html`
- `output/geomind.svg`

## 环境变量

复制 `.env.example` 为 `.env`，然后配置腾讯位置服务 key：

```bash
TENCENT_MAP_KEY=your-tencent-map-key
```

如果要读取飞书文档，配置飞书 CLI 的读取命令模板：

```bash
FEISHU_CLI_COMMAND_TEMPLATE="lark-cli docs +fetch --doc {url} --api-version v2 --format json"
```

## 常用命令

本地 Demo：

```bash
npm run demo
```

读取飞书文档并生成前端：

```bash
npm run dev -- --url "https://your.feishu.cn/wiki/xxx" --out output/geomind.json --whiteboard-out output/whiteboard.json --html-out output/geomind.html --svg-out output/geomind.svg
```

把可视化结果发布回飞书文档：

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx"
```

使用 GIF 动态预览：

```bash
npm run publish:feishu -- --doc "https://your.feishu.cn/wiki/xxx" --gif
```

`publish:feishu` 会自动截取 `output/geomind.html` 的腾讯地图前端，并通过飞书 CLI 向文档追加：

- 运行摘要和产品说明
- 腾讯地图前端截图，或使用 `--gif` 生成动态预览
- `geomind.html` 交互页面附件

说明：飞书文档正文通常不会直接执行第三方 HTML/JS，所以文档内展示采用截图预览；真正可拖拽、缩放、点击节点的腾讯地图保留在 HTML 附件中。

## 飞书 CLI

安装并认证：

```bash
npm install -g @larksuite/cli
npx skills add larksuite/cli -y -g
lark-cli config init
lark-cli auth login --recommend
lark-cli doctor
```

Windows PowerShell 如果无法识别 `lark-cli`，可以把 npm 全局 bin 加入 PATH：

```powershell
$npmBin = npm prefix -g
$env:Path = "$npmBin;$env:Path"
[Environment]::SetEnvironmentVariable("Path", "$npmBin;$([Environment]::GetEnvironmentVariable('Path', 'User'))", "User")
```

## 验证

```bash
npm run typecheck
npm run build
npm test
```

## 输出结构

最终 JSON 包含：

- `entities`：实体名称、类型、地点文本、技术领域、证据、地理编码结果
- `relations`：source、target、relation_type、evidence、confidence
- `whiteboard`：节点、连线、图例、画布和说明
- `summary`：实体数、关系数、地理编码数量和重点技术领域
- `warnings`：非致命问题，例如地理编码失败

## 下一步

- 将白板 DSL 直接写入飞书白板块
- 接入 LLM 结构化抽取，替换当前规则抽取 MVP
- 增加热力图、POI 分布、轨迹和区域潜力分析
- 将交互地图发布到 HTTPS 地址，用于飞书链接卡片和团队共享
