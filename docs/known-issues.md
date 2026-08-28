# 已知问题（Known Issues）

## [2026-08-24] 大众点评搜索全量返回空（上游解析失效）

**状态**：🔴 不可用（等待上游适配）

**现象**
- `dp_search`（即服务端 `dianping_search`）对任何关键词都返回 `{"count":0,"items":[]}`
- **没有** `error` 字段（区别于风控报错「大众点评页面触发风控」）

**已排查（均可排除）**

| 检查项 | 结果 |
|---|---|
| 服务进程 / MCP 协议 | ✅ 正常（工具可调用） |
| 登录 Cookie | ✅ 已重新扫码（`guided_login` 保存 13 个 cookie，仍复现） |
| 城市ID补丁（docs/patches/） | ✅ 在位（`_resolve_city_id` 存在） |

**根因**
大众点评网页改版：搜索结果页的店铺链接结构变化，cn-scraper-mcp 引擎中
`_SHOP_RE = re.compile(r"/shop/([A-Za-z0-9]+)")` 匹配不到任何链接 → 解析结果为空。
属上游项目 [goesByhc/cn-scraper-mcp](https://github.com/goesByhc/cn-scraper-mcp) 需要适配的问题。

**影响范围**
- 仅大众点评三个工具（search / shop / reviews）
- 小红书、高德完全不受影响

**临时替代方案**
- 餐厅/酒店的存在性、评分、人均、电话、营业时间 → `amap_poi_search`（数据更稳定）
- 酒店可订性/房价 → 以携程/美团等预订平台为准（本来也应如此）
- 口碑/避坑 → `xhs_search` 小红书

**恢复方式（上游适配后）**
```bash
# 升级 cn-scraper-mcp（会覆盖城市补丁）
~/.workbuddy/cn-scraper/bin/pip install -U cn-scraper-mcp   # 或 services/cn-scraper-venv/bin/pip
# 重跑 setup.sh（自动重打城市补丁；若上游已自行修复城市参数，补丁会跳过）
./setup.sh
```
若上游迟迟未适配，可自行分析新版页面结构，修改
`services/cn-scraper-venv/lib/python3.13/site-packages/cn_scraper_mcp/engines/dianping.py`
中的 `_SHOP_RE` 正则与解析逻辑后重启服务（`./start-services.sh`）。

**验证恢复的命令**
在 pi 中说：「用 dp_search 搜 '过桥米线' 城市 昆明」——返回非空即恢复。
