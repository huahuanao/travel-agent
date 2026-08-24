# 🧭 Travel Agent —— 三源交叉验证的旅行攻略规划 Agent

基于 [pi](https://github.com/earendil-works/pi-coding-agent) 的旅行攻略规划 agent。
整合 **小红书**（真实游记/避坑）、**大众点评**（商户/分店）、**高德地图**（距离/耗时/评分）三个数据源，
通过"三角验证法"产出**每条建议都可溯源**的 HTML 旅行攻略。

```
你说："帮我规划昆明 7 天游，两代三人，8 月底出发，酒店已订"

Agent：
  ① 向你确认细节（预算/忌口/体力/硬约束）
  ② 小红书串行采集：高赞攻略 + 避坑帖 + 评论区 + 最新时效帖
  ③ 大众点评验证：博主说的店真的存在吗？离动线最近的分店是哪家？
  ④ 高德核验：每个 POI 坐标/营业时间/评分 + 每日动线的真实耗时
  ⑤ 输出带来源标注的自包含 HTML 攻略（逐日时间轴/雨天备案/费用/预约清单）

→ 产出示例见 examples/kunming-7days-itinerary.html
```

## ✨ 特性

- **11 个 agent 工具**：小红书 4（搜索/详情/博主主页/状态）+ 点评 4（搜索/详情/评价/登录）+ 高德 3（POI/地理编码/路线）
- **travel-planner 工作流**：5 阶段方法论固化为 skill（澄清→采集→核验→排程→输出）
- **三角验证**：观点（小红书）×存在（点评）×事实（高德），冲突信息如实呈现
- **安全设计**：小红书只暴露只读工具，不注册点赞/发布/评论；登录态全部本地存储
- **优雅降级**：任一数据源不可用不影响其余功能
- **实测精神**：交通耗时全部跑高德 API 核验，非拍脑袋估计

## 🚀 快速开始

### 前置要求

| 依赖 | 说明 |
|---|---|
| Node.js 18+ | pi 的运行环境 |
| [pi](https://github.com/earendil-works/pi-coding-agent) | `npm install -g @earendil-works/pi-coding-agent` |
| Python 3.11+ | cn-scraper-mcp 运行环境 |
| ~500MB 磁盘 | 浏览器内核 + Python venv |
| 高德 API Key（可选） | [免费申请](https://console.amap.com)：创建应用 → 添加「**Web服务**」类型 key |
| 小红书/大众点评账号（可选） | 用于扫码登录采集 |

### 四步安装

```bash
git clone <本仓库> travel-master && cd travel-master

# 1. 安装依赖（下载 xiaohongshu-mcp 二进制、装 cn-scraper、打点评城市补丁）
./setup.sh

# 2. 配置高德 key（已有可跳过）
echo 'export AMAP_API_KEY="你的key"' >> ~/.zshrc && source ~/.zshrc

# 3. 启动数据服务
./start-services.sh
#    若提示小红书未登录：
./services/xhs/xiaohongshu-login   # 弹出浏览器，用小红书App扫码

# 4. 启动 agent
pi
#    首次会询问是否信任本项目 → 选择信任（加载 .pi/ 下的扩展与技能）
#    输入 /xhs 和 /dp 验证服务状态
```

> 💡 大众点评无需预先登录：首次搜索若返回"触发风控"，直接对 agent 说
> **"大众点评需要重新登录"**，会弹出浏览器扫码（Cookie 持久化，之后很久不用再扫）。

### 日常使用（每次开机后）

```bash
cd travel-master && ./start-services.sh && pi
```

## 💬 使用示例

直接用自然语言提需求，agent 会按 travel-planner 工作流执行：

```
帮我规划大理 3 天 2 晚攻略，两个人，喜欢自然风光和拍照，预算中等

帮我看看昆明 8 月底有什么最新的避坑信息（闭馆/施工/管控）

把小红书上关于滇池一日游的高赞笔记总结一下，哪些点值得去哪些是坑

我是带爸妈出行（60 岁左右），帮我把这个行程改得轻松一点

查一下"爱尚菌"在官渡古镇有没有店，评分人均多少，离省博物馆多远

我酒店订在环城南路地铁站附近，帮我优化动线，减少折返
```

进阶玩法：
- **项目记忆**：复制 `templates/memory.template.md` 为 `.workbuddy-ai/memory/MEMORY.md`，
  写入行程硬约束（日期/航班/已订酒店/同行人），agent 每次会话自动参考，不用重复交代
- **多轮修订**：产出 HTML 后继续说"把 D3 和 D6 对调""换成父母友好版"，agent 会增量修订

## 🔧 工具一览（agent 自动调用）

| 工具 | 数据源 | 用途 | 注意 |
|---|---|---|---|
| `xhs_search` | 小红书 | 搜笔记（可按最多点赞/最新排序） | 慢（1-3分钟），**串行** |
| `xhs_note_detail` | 小红书 | 笔记正文+图片+评论（避坑金矿） | 慢 |
| `xhs_user_profile` | 小红书 | 博主主页与系列内容 | 可选 |
| `xhs_login_status` | 小红书 | 服务/登录状态检查 | 排障先调它 |
| `dp_search` | 大众点评 | 商户/分店搜索 | 限速1次/秒 |
| `dp_shop` / `dp_reviews` | 大众点评 | 商户详情/评价 | 风控期常降级为链接 |
| `dp_login` | 大众点评 | 弹浏览器扫码登录 | Cookie 过期时用 |
| `amap_poi_search` | 高德 | POI 坐标/评分/人均/营业时间 | 餐厅评分也用它 |
| `amap_geocode` | 高德 | 地址→坐标 | 定位酒店/民宿 |
| `amap_route` | 高德 | 步行/公交/驾车/骑行耗时 | 校验日程可行性 |

命令：`/xhs` `/dp` 快速检查两个服务的登录状态。

## 📐 工作流（travel-planner skill）

1. **需求澄清**：目的地/日期/同行人/偏好/预算/已订住宿/硬约束，一次问清
2. **小红书采集**（串行）：`{目的地} {天数}天 攻略`（最多点赞）→ `避坑/踩雷`（重点）→ `美食 本地人` → `小众/路线`；近期出行加"最新"排序；高收藏比优先；避坑帖必读评论区
3. **点评+高德核验**：POI 标准化（存在性/坐标/营业时间）→ 餐饮三角验证（分店/评分/人均）→ 按地理聚类排日程 → 动线耗时逐段核验
4. **HTML 输出**：行程总览表 / 逐日时间轴（时间-地点-交通与实测耗时-门票-贴士-来源） / 美食清单 / 住宿逻辑 / 避坑汇总（❗醒目） / 费用估算 / 数据来源
5. **原则**：每条建议可溯源；冲突评价两方并呈；不确定标"出发前请核实"

## 📁 目录结构

```
travel-master/
├── README.md                        # 本文档
├── setup.sh                         # 首次安装：依赖下载+补丁
├── start-services.sh                # 日常启动：两个 MCP 服务+环境检查
├── AGENTS.md                        # agent 读的项目规范
├── .pi/
│   ├── extensions/travel-tools/     # 工具层（TypeScript，pi 扩展）
│   │   ├── index.ts                 #   11 个工具注册
│   │   ├── mcp.ts                   #   MCP HTTP 客户端（两服务复用）
│   │   └── amap.ts                  #   高德 REST 封装
│   └── skills/travel-planner/       # 工作流方法论
├── docs/
│   ├── architecture.md              # 架构与三源对比
│   ├── recovery.md                  # 重启恢复指南
│   └── patches/cn-scraper-dianping-city-id.patch   # 点评城市补丁
├── examples/
│   └── kunming-7days-itinerary.html # 产出示例（昆明7天，三源修订版）
├── templates/memory.template.md     # 项目记忆模板
└── services/                        # 本地依赖（git 忽略）
```

## ⚙️ 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `AMAP_API_KEY` | - | 高德 key（不配则高德工具不注册） |
| `XHS_MCP_URL` | `http://localhost:18060/mcp` | 小红书 MCP 地址 |
| `CN_SCRAPER_URL` | `http://127.0.0.1:8001/mcp` | 点评 MCP 地址 |
| `XHS_PORT` / `DP_PORT` | `18060` / `8001` | start-services.sh 启动端口 |

高德 key 也支持写在 `~/.zshrc` / `~/.bashrc` 等 rc 文件（extension 自动兜底读取）。

## ❓ 常见问题

- **小红书搜索超时/报 deadline exceeded**：浏览器自动化偶发卡死，让 agent 重试即可
- **点评城市搜索结果不对**：补丁未生效，重跑 `./setup.sh`（详见 `docs/patches/`）
- **小红书要重新扫码？**：`./services/xhs/xiaohongshu-login`
- **完整排障手册**：`docs/recovery.md`

## 🙏 致谢与参考（本项目站在谁的肩膀上）

| 项目/服务 | 用途 | 本项目如何使用 |
|---|---|---|
| **[earendil-works/pi-coding-agent](https://github.com/earendil-works/pi-coding-agent)** | Agent 宿主（扩展/技能/会话体系） | pi 通过 npm 安装，本项目按其扩展 API 编写 `.pi/extensions/` 与技能规范 |
| **[xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)** | 小红书 MCP 服务（Go，浏览器自动化） | `setup.sh` 从其 GitHub Releases 下载官方二进制，原样运行于 `services/xhs/`，不分发不修改；遵循其开源协议 |
| **[goesByhc/cn-scraper-mcp](https://github.com/goesByhc/cn-scraper-mcp)** | 多平台抓取 MCP（MIT License），本项目使用其大众点评引擎 | pip 安装于本地 venv；对 `dianping.py` 打了城市ID补丁（上游 bug，已提交说明于 `docs/patches/`，欢迎上游采纳） |
| **[高德开放平台 Web 服务 API](https://lbs.amap.com/)** | 地图/POI/路线/天气 | 官方 REST API 直连，用户自备 key，遵守其配额与条款 |

方法论参考（非代码）：
- "带父母出行原则"（打车>1.5km、三人餐预算、观光车省腿）源自小红书公开游记的实战经验（原帖 1684 赞）
- "西山懒人版路线"（大巴上山+索道下山约3000步）参考小红书公开游记（原帖 1344 赞）
- 示例攻略中的每条建议均在文内标注了来源博主与数据出处

如引用/二次开发本项目，请同样保留对上述项目的致谢。

## ⚠️ 免责声明

- 本项目**仅供个人学习与研究**。小红书/大众点评数据的采集行为请遵守各平台用户协议与 robots 声明，控制请求频率，产生的账号风险（限流/封号）由使用者自担
- 登录凭据（cookie）仅保存在你本机，本项目不含任何上传/中转逻辑（相关代码开源可审计）
- 产出的攻略信息（价格/营业时间/路况）具有时效性，出行前请自行核实
- 不对任何第三方服务的可用性作保证

## 📄 许可证

本项目代码以 [MIT](LICENSE) 开源。所依赖的第三方项目归其作者所有，遵循各自协议。
