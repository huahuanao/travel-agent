# 架构说明：三个数据源如何连接、有何区别

## 一、总览

```
你的终端
  │
  │  cd travel-master && pi
  ▼
┌──────────────────────── pi（Agent 宿主）────────────────────────┐
│  .pi/extensions/travel-tools/   ← 自动加载的扩展（工具层）        │
│    ├─ index.ts   注册全部 11 个工具                               │
│    ├─ mcp.ts     极简 MCP HTTP 客户端（复用给两个 MCP 服务）      │
│    └─ amap.ts    高德 REST API 封装                              │
│  .pi/skills/travel-planner/     ← 攻略规划工作流（方法论）        │
│  AGENTS.md                      ← 项目规范（输出格式等）          │
└──────┬───────────────────┬───────────────────┬─────────────────┘
       │ MCP over HTTP     │ MCP over HTTP     │ 直接 HTTPS REST
       ▼                   ▼                   ▼
┌──────────────┐   ┌───────────────┐   ┌──────────────┐
│ xiaohongshu  │   │ cn-scraper    │   │ 高德开放平台   │
│ -mcp         │   │ -mcp          │   │ restapi.amap │
│ :18060       │   │ :8001         │   │ .com         │
│ (Go+浏览器)  │   │ (Python+网页) │   │ (官方API)    │
└──────────────┘   └───────────────┘   └──────────────┘
  小红书数据          大众点评数据         地图/POI/路线/天气
```

## 二、三个数据源详解

### 1. 小红书 —— xiaohongshu-mcp（浏览器自动化）

- **是什么**：[xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)（独立开源项目，Go 实现），
  本项目通过 `setup.sh` 下载其官方 release 二进制到 `services/xhs/`，不修改、不分发其源码
- **原理**：无头 Chromium 像真人一样操作小红书网页（搜索→翻结果→进笔记→滚动读评论）
- **连接方式**：MCP 协议，`mcp.ts` 客户端连 `http://localhost:18060/mcp`（可用 `XHS_MCP_URL` 覆盖）
- **登录**：需要，自己的小红书账号扫码；cookie 保存在二进制同目录（已在 .gitignore 排除）
- **速度**：⚠️ 慢（1~3 分钟/次），必须串行
- **本项目暴露的工具**：`xhs_search` / `xhs_note_detail` / `xhs_user_profile` / `xhs_login_status`
  （服务端还提供点赞/发布/评论等能力，**本项目有意不注册**，防止 agent 误操作账号）
- **适用**：观点类信息——游记、避坑、时效动态（闭馆/施工/管控）

### 2. 大众点评 —— cn-scraper-mcp（网页解析抓取）

- **是什么**：[goesByhc/cn-scraper-mcp](https://github.com/goesByhc/cn-scraper-mcp)（MIT License，独立开源项目），
  pip 安装在 `services/cn-scraper-venv/`；另支持淘宝/知乎/微博/B站等平台（本项目只用点评引擎）
- **原理**：模拟浏览器指纹直接解析点评公开网页
- **连接方式**：MCP 协议（HTTP），`http://127.0.0.1:8001/mcp`（可用 `CN_SCRAPER_URL` 覆盖）
- **登录**：扫一次码对抗风控，Cookie 持久化在 `~/.cn-scraper-cookies/`
- **本地补丁**：上游 `dianping_search` 的 city 参数不生效（URL 写死城市ID=1 上海），
  本项目提供补丁（`docs/patches/cn-scraper-dianping-city-id.patch`），`setup.sh` 自动应用；
  升级 cn-scraper 后需重打（或等上游修复后补丁自然失效）
- **本项目暴露的工具**：`dp_search` / `dp_shop` / `dp_reviews` / `dp_login`
- **适用**：存在性验证——把博主口语化的店名落到具体分店

### 3. 高德地图 —— 官方 REST API 直连

- **是什么**：[高德开放平台](https://lbs.amap.com/) Web 服务 API（非 MCP），`amap.ts` 直接 HTTPS 调用
- **凭证**：API Key（环境变量 `AMAP_API_KEY`），个人开发者免费申请
- **无需启动任何服务**，速度快、稳定性高
- **本项目暴露的工具**：`amap_poi_search`（坐标/评分/人均/营业时间）/ `amap_geocode`（地址→坐标）/ `amap_route`（四模式路线耗时）
- **适用**：硬事实——距离、耗时、评分、天气

## 三、对比速查

| 维度 | 小红书 | 大众点评 | 高德 |
|---|---|---|---|
| 连接方式 | 本地 MCP + 浏览器自动化 | 本地 MCP + 网页抓取 | 官方 API 直连 |
| 需要服务进程 | ✅ :18060 | ✅ :8001 | ❌ |
| 需要登录 | 扫码（可能丢） | 扫码一次（持久） | API Key |
| 速度 | 慢（分钟级） | 快（秒级，限速1/s） | 极快 |
| 稳定性 | 中（偶发卡死，重试即恢复） | 中（风控降级） | 高 |
| 信息类型 | **观点**（游记/避坑/时效） | **存在**（分店/商户） | **事实**（距离/评分/耗时） |
| 典型一问 | "最近有什么坑？" | "这家店在附近有分店吗？" | "两点之间多远？" |

**三角验证法**（travel-planner skill 内置流程）：
小红书找口碑 → 点评确认分店存在 → 高德核验评分/动线 → 每条建议标注来源。

## 四、扩展新数据源

在 `.pi/extensions/travel-tools/` 添加：
1. 若新源是 MCP 服务 → 复用 `mcp.ts` 的 `McpClient`，一行 `new McpClient(url)`
2. 若是 REST API → 仿照 `amap.ts` 写一个封装类
3. 在 `index.ts` 用 `pi.registerTool()` 注册工具（参数用 typebox 定义）
4. 若工作流需要变化 → 更新 `.pi/skills/travel-planner/SKILL.md`

参考 pi 扩展文档：`pi` 仓库内 `docs/extensions.md`。
