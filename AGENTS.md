# Travel Agent（旅行攻略规划 Agent，基于 pi）

本工作区是一个旅行攻略规划 agent：整合小红书真实游记、大众点评商户数据、高德地图硬数据，
产出带来源标注的自包含 HTML 攻略。

## 快速开始

```bash
./setup.sh           # 首次：安装依赖（下载 xiaohongshu-mcp、装 cn-scraper、打补丁）
./start-services.sh  # 每次开机后：启动小红书+点评服务（高德无需启动）
pi                   # 开工；进入后可用 /xhs 和 /dp 验证服务状态
```

详细文档：`README.md`（使用说明）、`docs/architecture.md`（架构）、`docs/recovery.md`（重启恢复）。

## 工具链（pi 启动自动加载）

- **小红书**（经本地 xiaohongshu-mcp，浏览器自动化，`localhost:18060`）
  - 工具：`xhs_search` / `xhs_note_detail` / `xhs_user_profile` / `xhs_login_status`
  - ⚠️ 浏览器自动化较慢（1~3 分钟/次），**必须串行调用，严禁并行**
  - 只读：未注册点赞/发布/评论类工具，避免误操作账号
- **大众点评**（经本地 cn-scraper-mcp，网页抓取，`127.0.0.1:8001`）
  - 工具：`dp_search` / `dp_shop` / `dp_reviews` / `dp_login`
  - 评分/人均被风控时用 `amap_poi_search` 补齐（三角验证）
  - ⚠️ 已知问题（2026-08）：点评网页改版致上游解析失效，搜索全空；商户验证临时改用 `amap_poi_search` + 预订平台，详见 `docs/known-issues.md`
- **高德地图**（需 `AMAP_API_KEY` 环境变量，官方 API 直连）
  - 工具：`amap_poi_search` / `amap_geocode` / `amap_route`
- **工作流**：详见 travel-planner skill（需求澄清 → 小红书采集 → 点评/高德核验 → HTML 输出）

服务不可用时优雅降级：工具返回启动指引，高德与文件操作不受影响。

## 输出规范

- 攻略为单个自包含 HTML 文件（内嵌 CSS，无外部依赖），命名 `{目的地}{天数}天攻略.html`
- 设计风格参考 `examples/kunming-7days-itinerary.html`：浅色卡片、圆角、`trip-*` class、逐日时间轴 + 雨天备案 + 实测交通标注
- 所有建议标注来源（小红书博主@昵称+赞数 / 大众点评+高德验证 / 实测时间戳）
- 冲突评价如实呈现两方；不确定信息标注「出发前请核实」

## 项目记忆

可选：将 `templates/memory.template.md` 复制为 `.workbuddy-ai/memory/MEMORY.md`
（或任意项目记忆文件），记录行程约束（日期/同行人/已订酒店等），agent 每次会话自动参考。
该目录已被 .gitignore 排除，个人行程不会进入版本库。
