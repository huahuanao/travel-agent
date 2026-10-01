# 已知问题（Known Issues）

## [2026-08-24 → 2026-10-01 已修复] 大众点评搜索全量返回空

**状态**：🟢 已修复（本地补丁，2026-10-01 实测通过）

### 当时现象与根因（更新后的完整结论）

原判断「店铺链接结构变化致 `_SHOP_RE` 失效」**不是主因**。真正的根因链：

1. **搜索页强制登录**：大众点评网页改版后，未登录访问 `/search/keyword/...` 会被 302 到
   `account.dianping.com/pclogin`，返回的是美团账号登录页（React 空壳），自然零店铺链接。
2. **登录信号 cookie 误配**：cn-scraper 的 `AuthProfile` 把 `dper` 当登录成功信号，但 `dper`
   只是设备指纹 cookie（**访问登录页即出现**）→ guided_login 在用户真正扫码前就收割保存了
   未登录 cookie。真登录态标志是 `fspop`（fs passport 家族）。
3. **店铺详情 JSON-LD 下线**：`dp_shop` 依赖的 `application/ld+json` 结构化数据已被点评移除，
   即使登录成功详情也解析为空。

### 修复内容（三个本地补丁，均在 docs/patches/）

| 补丁文件 | 修改 | 效果 |
|---|---|---|
| `cn-scraper-dianping-login-signal.patch` | auth.py：`login_signal=("fspop","fspassport","dponewsssid")`、登录页改 `account.dianping.com/pclogin`、`required_fields` 加 `fspop` | 引导登录能等到真登录态再收割 |
| `cn-scraper-dianping-shop-html-parse.patch` | dianping.py：`shop()` 在 JSON-LD 为空时回退 HTML 解析（按稳定 class：star-score/reviews/price/region/category/addressText/desc-addr-txt/biz-txt/biz-time） | `dp_shop` 恢复：评分/点评数/人均/商圈/品类/地址/交通/营业状态/营业时间（⚠️ 注意正则必须锚定 `class="` 前缀，否则会误抓 `<style>` 里的 CSS） |
| `cn-scraper-dianping-city-id.patch` | （原有）城市ID解析 | 不变 |

登录 cookie 手动收割存于 `~/.cn-scraper-cookies/dianping.json`（14 个，含 `fspop`）。
当时 guided_login 的 Chrome 启动还有 15 秒就绪超时过短的竞态问题，本次是手动启动 Chrome
（CDP 9222）+ 轮询 `harvest_raw` 完成收割的。

### 2026-10-01 实测（北京·月坛）

- `dp_search("月坛", "北京")` → 15 家商户：月坛公园、同和居(月坛店)、四季民福烤鸭店(三里河店)、
  鸦儿李记涮肉、护国寺小吃(月北店)… ✅
- `dp_shop` 四季民福 → 4.8 分 / 15441 条点评 / ¥168/人 / 月坛商圈·烤鸭 /
  三里河东路5号中商大厦18层 / 距木樨地站B1口步行1.0km / 营业中 10:00-22:30 ✅

### 仍然不可用

- **`dp_reviews`**：`/shop/{id}/review_all` 已整体 302 到 App 下载页——大众点评把评论全部
  迁移进 App，网页端无解。已让该工具返回明确错误 + 提示改用 `xhs_search`（小红书评论区）。
- **`telephone` 字段**：新版页面未渲染电话（在 App 内接口），`dp_shop` 该字段为空属正常。

### 后续维护

- 登录态 cookie 失效（再次出现 302 登录页/空结果）时：优先用 `dp_login` 重新扫码
  （补丁已修正收割时机）；若 guided_login 的 Chrome 启动报错（15 秒就绪超时竞态），用手动方式：
  按 `scripts/relogin-dianping.py` 文件头的步骤启动 Chrome → 扫码 → 运行该脚本收割。
- 升级 cn-scraper-mcp 后需重打全部补丁：`./setup.sh`（setup 需确认能重放 docs/patches/ 下三个补丁）。
