/**
 * travel-tools — 旅行 Agent 工具集
 *
 * 小红书（经本地 xiaohongshu-mcp, 默认 http://localhost:18060/mcp）：
 *   xhs_login_status / xhs_search / xhs_note_detail / xhs_user_profile
 *   仅暴露只读工具；不注册点赞/评论/发布，避免误操作账号。
 *
 * 大众点评（经本地 cn-scraper-mcp, 默认 http://127.0.0.1:8001/mcp）：
 *   dp_search / dp_shop / dp_reviews
 *   服务不可用时工具返回启动指引，不影响其他工具。
 *
 * 高德地图（需环境变量 AMAP_API_KEY）：
 *   amap_poi_search / amap_geocode / amap_route
 *   未配置 key 时跳过注册并给出申请指引。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpClient } from "./mcp.ts";
import { Amap } from "./amap.ts";

/** 环境变量缺失时，从 shell rc 文件兜底读取 export AMAP_API_KEY=... */
function resolveAmapKey(): string | undefined {
  if (process.env.AMAP_API_KEY) return process.env.AMAP_API_KEY;
  const rcFiles = [".zshenv", ".zshrc", ".bashrc", ".bash_profile", ".profile"];
  for (const f of rcFiles) {
    try {
      const content = readFileSync(join(homedir(), f), "utf8");
      const m = content.match(/^\s*export\s+AMAP_API_KEY\s*=\s*["']?([0-9a-f]{32})["']?\s*$/m);
      if (m) return m[1];
    } catch {
      /* 文件不存在则跳过 */
    }
  }
  return undefined;
}

const SLOW_HINT = "浏览器自动化操作，通常需要 1~3 分钟，请耐心等待，不要并行发起多个小红书调用";

export default function (pi: ExtensionAPI) {
  const xhs = new McpClient();
  const dp = new McpClient(process.env.CN_SCRAPER_URL || "http://127.0.0.1:8001/mcp");
  const amapKey = resolveAmapKey();
  const amap = amapKey ? new Amap(amapKey) : null;

  /* ---------------- 小红书工具 ---------------- */

  pi.registerTool({
    name: "xhs_login_status",
    label: "小红书登录状态",
    description: "检查小红书 MCP 服务连通性与登录状态。返回已登录用户名。排查问题时先用这个。",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      const text = await xhs.callTool("check_login_status", {}, { timeoutMs: 60_000, signal });
      return { content: [{ type: "text", text }] };
    },
  });

  const XhsFilters = Type.Optional(
    Type.Object(
      {
        sort_by: Type.Optional(
          Type.String({ description: "排序: 综合|最新|最多点赞|最多评论|最多收藏" }),
        ),
        note_type: Type.Optional(Type.String({ description: "笔记类型: 不限|视频|图文" })),
        publish_time: Type.Optional(Type.String({ description: "发布时间: 不限|一天内|一周内|半年内" })),
      },
      { description: "搜索筛选（可选）" },
    ),
  );

  pi.registerTool({
    name: "xhs_search",
    label: "小红书搜索",
    description: `搜索小红书笔记，返回标题/作者/赞藏数据/xsecToken。${SLOW_HINT}。获取正文用 xhs_note_detail（需要本结果里的 id 和 xsecToken）。`,
    parameters: Type.Object({
      keyword: Type.String({ description: "搜索关键词，如 '昆明 3天 攻略'" }),
      filters: XhsFilters,
    }),
    async execute(_id, params, signal, onUpdate) {
      onUpdate?.("小红书搜索中（浏览器自动化，约1-3分钟）…");
      const args: Record<string, unknown> = { keyword: params.keyword };
      if (params.filters && Object.keys(params.filters).length > 0) args.filters = params.filters;
      const text = await xhs.callTool("search_feeds", args, { signal });
      return { content: [{ type: "text", text }] };
    },
  });

  pi.registerTool({
    name: "xhs_note_detail",
    label: "小红书笔记详情",
    description: `读取笔记正文、图片、互动数据与评论。评论是避坑信息金矿。${SLOW_HINT}。feed_id/xsec_token 来自 xhs_search 结果。`,
    parameters: Type.Object({
      feed_id: Type.String({ description: "笔记ID（xhs_search 结果里的 id）" }),
      xsec_token: Type.String({ description: "访问令牌（xhs_search 结果里的 xsecToken）" }),
      load_all_comments: Type.Optional(Type.Boolean({ description: "true 时加载更多评论（默认只取前10条）" })),
      limit: Type.Optional(Type.Number({ description: "加载的一级评论数上限，默认20（需 load_all_comments=true）" })),
      click_more_replies: Type.Optional(Type.Boolean({ description: "true 展开二级回复（需 load_all_comments=true）" })),
    }),
    async execute(_id, params, signal, onUpdate) {
      onUpdate?.("正在打开笔记并读取内容（约1-2分钟）…");
      const text = await xhs.callTool("get_feed_detail", params as Record<string, unknown>, { signal });
      return { content: [{ type: "text", text }] };
    },
  });

  pi.registerTool({
    name: "xhs_user_profile",
    label: "小红书用户主页",
    description: "获取指定博主主页与其笔记列表。找到优质博主后可深挖其系列攻略。user_id 来自搜索/详情结果。",
    parameters: Type.Object({
      user_id: Type.String({ description: "用户ID" }),
      tab: Type.Optional(Type.String({ description: "note(笔记,默认)|like|collect" })),
    }),
    async execute(_id, params, signal) {
      const text = await xhs.callTool("user_profile", params as Record<string, unknown>, { timeoutMs: 240_000, signal });
      return { content: [{ type: "text", text }] };
    },
  });

  /* ---------------- 大众点评工具 ---------------- */

  const DP_HINT =
    "服务不可用时请在项目目录运行 ./start-services.sh；首次/风控需登录时，在对话中说“大众点评需要重新登录”让 agent 调 dp_login 扫码";

  pi.registerTool({
    name: "dp_search",
    label: "大众点评搜索",
    description:
      "搜大众点评商户（餐厅/景点/酒店），返回分店列表与链接。选餐厅用：先搜关键词+城市拿分店，再结合 amap_poi_search 查评分/人均。每秒限 1 次，风控时稍后重试。",
    parameters: Type.Object({
      keyword: Type.String({ description: "商户关键词，如 '野生菌火锅'" }),
      city: Type.String({ description: "城市名，如 '昆明'（已内置常用城市ID映射）" }),
      limit: Type.Optional(Type.Number({ description: "返回条数，默认10" })),
    }),
    async execute(_id, params, signal) {
      try {
        const text = await dp.callTool("dianping_search", params as Record<string, unknown>, { timeoutMs: 90_000, signal });
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ ${e.message}\n${DP_HINT}` }], isError: true };
      }
    },
  });

  pi.registerTool({
    name: "dp_shop",
    label: "大众点评商户详情",
    description: "按 shop_id 获取商户详情（评分页面风控时可能仅返回链接，属正常降级）。shop_id 来自 dp_search。",
    parameters: Type.Object({
      shop_id: Type.String({ description: "商户ID" }),
    }),
    async execute(_id, params, signal) {
      try {
        const text = await dp.callTool("dianping_shop", params as Record<string, unknown>, { timeoutMs: 90_000, signal });
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ ${e.message}\n${DP_HINT}` }], isError: true };
      }
    },
  });

  pi.registerTool({
    name: "dp_reviews",
    label: "大众点评评价",
    description: "按 shop_id 获取用户评价（风控期可能为空）。shop_id 来自 dp_search。",
    parameters: Type.Object({
      shop_id: Type.String({ description: "商户ID" }),
      limit: Type.Optional(Type.Number({ description: "条数，默认10" })),
    }),
    async execute(_id, params, signal) {
      try {
        const text = await dp.callTool("dianping_reviews", params as Record<string, unknown>, { timeoutMs: 90_000, signal });
        return { content: [{ type: "text", text }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ ${e.message}\n${DP_HINT}` }], isError: true };
      }
    },
  });

  pi.registerTool({
    name: "dp_login",
    label: "大众点评登录",
    description:
      "打开浏览器引导登录大众点评（手动扫码后自动保存 Cookie 到 ~/.cn-scraper-cookies/）。仅当 dp_search 持续返回风控错误时使用；登录窗口会弹出，需人在场扫码。",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      const text = await dp.callTool("guided_login", { platform: "dianping" }, { timeoutMs: 180_000, signal });
      return { content: [{ type: "text", text: `${text}\n（若超时：浏览器窗口保持打开，完成扫码后让 agent 调 dp_search 重试即可自动收割）` }] };
    },
  });

  /* ---------------- 高德工具（有 key 才注册） ---------------- */

  if (amap) {
    pi.registerTool({
      name: "amap_poi_search",
      label: "高德POI搜索",
      description:
        "关键词搜索地点（景点/餐厅/酒店/车站），返回标准名称、坐标(lng,lat)、地址、评分、费用、营业时间。用于把小红书游记里的说法标准化并校验是否真实存在。",
      parameters: Type.Object({
        keywords: Type.String({ description: "POI 关键词，如 '翠湖公园'" }),
        city: Type.String({ description: "城市名，如 '昆明'" }),
        citylimit: Type.Optional(Type.Boolean({ description: "是否限定城市内，默认 true" })),
        page: Type.Optional(Type.Number({ description: "页码，默认1" })),
      }),
      async execute(_id, params, signal) {
        const result = await amap.poiSearch({ ...params, citylimit: params.citylimit ?? true, signal });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    pi.registerTool({
      name: "amap_geocode",
      label: "高德地理编码",
      description: "地址文本 → 坐标(lng,lat)。用于酒店/民宿等非标准 POI 定位。",
      parameters: Type.Object({
        address: Type.String({ description: "地址，如 '昆明市五华区南屏街'" }),
        city: Type.Optional(Type.String({ description: "城市，提升准确度" })),
      }),
      async execute(_id, params, signal) {
        const result = await amap.geocode(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    });

    pi.registerTool({
      name: "amap_route",
      label: "高德路线规划",
      description:
        "两点间路线：步行/驾车/公交/骑行。返回距离与耗时（秒），用于校验日程可行性（点间距>打车/公交时长的要调整）。origin/destination 格式 'lng,lat'（来自 poi_search/geocode）。",
      parameters: Type.Object({
        mode: Type.Union([Type.Literal("walking"), Type.Literal("driving"), Type.Literal("transit"), Type.Literal("bicycling")], {
          description: "出行方式",
        }),
        origin: Type.String({ description: "起点坐标 'lng,lat'" }),
        destination: Type.String({ description: "终点坐标 'lng,lat'" }),
        city: Type.Optional(Type.String({ description: "城市名，transit 模式必填" })),
      }),
      async execute(_id, params, signal) {
        const result = await amap.route(params);
        // 附加人类可读摘要
        const mins = Math.round(result.duration / 60);
        const km = (result.distance / 1000).toFixed(1);
        const summary = `≈ ${km} km / ${mins} 分钟 (${params.mode})`;
        return { content: [{ type: "text", text: JSON.stringify({ ...result, summary }, null, 2) }] };
      },
    });
  }

  pi.registerCommand("dp", {
    description: "大众点评 cn-scraper 服务状态 / 启动指引",
    handler: async (_args, ctx) => {
      try {
        const text = await dp.callTool("check_cookies", {}, { timeoutMs: 30_000 });
        ctx.ui.notify(text, "info");
      } catch (e: any) {
        ctx.ui.notify(`${e.message}\n${DP_HINT}`, "error");
      }
    },
  });

  /* ---------------- /xhs 命令：服务状态速查 ---------------- */

  pi.registerCommand("xhs", {
    description: "小红书 MCP 服务状态 / 启动指引",
    handler: async (_args, ctx) => {
      try {
        const text = await xhs.callTool("check_login_status", {}, { timeoutMs: 20_000 });
        ctx.ui.notify(text, "info");
      } catch (e: any) {
        ctx.ui.notify(`${e.message}`, "error");
      }
      if (!amap) {
        ctx.ui.notify("AMAP_API_KEY 未设置，高德工具未启用。申请: https://console.amap.com (Web服务key) 后 export AMAP_API_KEY=...", "info");
      }
    },
  });
}
