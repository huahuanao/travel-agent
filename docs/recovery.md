# 重启恢复指南（电脑关机后如何继续使用）

## 哪些会丢、哪些不会丢

| 组件 | 重启后状态 | 需要做什么 |
|---|---|---|
| pi 扩展/技能（`.pi/` 目录） | ✅ 完好（磁盘上，自动加载） | 无 |
| 高德 API Key（`~/.zshrc`） | ✅ 完好 | 无 |
| 大众点评 Cookie（`~/.cn-scraper-cookies/`） | ✅ 已持久化 | 一般无需重扫（过期才需要） |
| 大众点评服务（cn-scraper-mcp） | ❌ 进程没了 | 脚本代劳启动 |
| 小红书服务（xiaohongshu-mcp） | ❌ 进程没了 | 脚本代劳启动 |
| 小红书登录态 | ⚠️ 视 cookie 持久化情况 | 以脚本检查结果为准 |

## 恢复三步

### 1. 一键启动数据服务

```bash
cd travel-agent
./start-services.sh
```

自动：启动小红书服务并检查登录态、启动点评服务、确认高德 key。
全绿 → 跳到第 3 步；提示小红书"未登录" → 先做第 2 步。

### 2.（仅小红书未登录时）重新扫码

```bash
./services/xhs/xiaohongshu-login
```

弹出浏览器二维码 → 手机小红书 App 扫码 → 重跑第 1 步确认。

### 3. 启动 pi

```bash
pi
```

验证（可选）：`/xhs` 应显示已登录；`/dp` 显示 Cookie 状态。

## 常见问题

**Q：小红书搜索报 "context deadline exceeded"？**
浏览器自动化偶发卡死。在 pi 里说"重试一下刚才的搜索"，通常 1-2 次内恢复。

**Q：大众点评一直报"触发风控"？**
Cookie 过期。在 pi 里说"大众点评需要重新登录"，agent 调 `dp_login` 弹浏览器扫码。

**Q：大众点评搜出来的城市不对？**
城市ID补丁未生效（可能升级 cn-scraper 后被覆盖）。重跑 `./setup.sh`，或参考
`docs/patches/cn-scraper-dianping-city-id.patch` 手动应用。

**Q：换端口？**
```bash
XHS_PORT=18061 DP_PORT=8002 ./start-services.sh
# 并在启动 pi 前 export：
export XHS_MCP_URL=http://localhost:18061/mcp
export CN_SCRAPER_URL=http://127.0.0.1:8002/mcp
```

**Q：不启动服务，pi 能用吗？**
能。工具层优雅降级——小红书/点评工具返回启动指引，高德与文件操作不受影响。

**Q：迁移到新机器？**
带走整个 `travel-agent/` 目录（或重新 clone + `./setup.sh`）、`~/.cn-scraper-cookies/`（点评登录）、
`~/.zshrc` 里的 `AMAP_API_KEY`。小红书重新扫码即可。
