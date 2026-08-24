/**
 * 极简 MCP Streamable HTTP 客户端
 * 用于连接本地 xiaohongshu-mcp 服务 (默认 http://localhost:18060/mcp)
 * 可通过环境变量 XHS_MCP_URL 覆盖
 */

const DEFAULT_BASE = process.env.XHS_MCP_URL || "http://localhost:18060/mcp";

const START_HINT = `请先启动小红书服务: 在项目目录运行 ./start-services.sh （或参考 README 的快速开始）; 首次使用需运行登录工具扫码: xiaohongshu-login`; 

let idCounter = 1;

export class McpClient {
  private sessionId: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private baseUrl: string = DEFAULT_BASE) {}

  get base() {
    return this.baseUrl;
  }

  private async post(body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`请求超时 (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      return await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    const resp = await this.post(
      {
        jsonrpc: "2.0",
        id: idCounter++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "pi-travel-tools", version: "1.0.0" },
        },
      },
      20_000,
      signal,
    );
    if (!resp.ok) throw new Error(`MCP initialize 失败: HTTP ${resp.status}`);
    const sid = resp.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    // 发送 initialized 通知（协议要求，失败可忽略）
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, 20_000, signal).catch(() => {});
  }

  private async ensureInitialized(signal?: AbortSignal): Promise<void> {
    if (this.sessionId) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize(signal).finally(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  /** 解析响应：兼容纯 JSON 与 SSE (data: ...) 两种格式 */
  private parseBody(text: string): any {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        const t = line.slice(5).trim();
        if (t) {
          try {
            return JSON.parse(t);
          } catch {
            /* 跳过非 JSON 的 data 行 */
          }
        }
      }
    }
    const t = text.trim();
    return t ? JSON.parse(t) : null;
  }

  /**
   * 调用 MCP 工具，返回拼接后的 text 内容
   * @param timeoutMs 默认 300s —— 浏览器自动化搜索/读详情本身就需要 1~3 分钟
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
    opts: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<string> {
    const timeoutMs = opts.timeoutMs ?? 300_000;
    await this.ensureInitialized(opts.signal);

    const request = {
      jsonrpc: "2.0",
      id: idCounter++,
      method: "tools/call",
      params: { name, arguments: args },
    };

    let resp: Response;
    try {
      resp = await this.post(request, timeoutMs, opts.signal);
    } catch (e: any) {
      if (opts.signal?.aborted) throw new Error("已取消");
      // 可能是服务重启导致连接失败，重置会话再试一次
      this.sessionId = null;
      try {
        await this.ensureInitialized(opts.signal);
        resp = await this.post(request, timeoutMs, opts.signal);
      } catch {
        throw new Error(`无法连接 xiaohongshu-mcp (${this.baseUrl}): ${e?.message ?? e}\n${START_HINT}`);
      }
    }

    // 会话失效 → 重新初始化重试一次
    if (resp.status === 404 || resp.status === 400) {
      this.sessionId = null;
      await this.ensureInitialized(opts.signal);
      resp = await this.post(request, timeoutMs, opts.signal);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      throw new Error(`MCP HTTP ${resp.status}: ${detail.slice(0, 300)}`);
    }

    const body = this.parseBody(await resp.text());
    if (!body) throw new Error("MCP 返回空响应");
    if (body.error) throw new Error(`MCP 错误: ${body.error.message}`);

    const result = body.result;
    if (result?.isError) {
      const txt = (result.content ?? []).map((c: any) => c.text ?? "").join("\n");
      throw new Error(txt || "MCP 工具执行失败");
    }
    return (result?.content ?? []).map((c: any) => c.text ?? "").join("\n");
  }
}
