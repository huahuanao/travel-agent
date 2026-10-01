#!/usr/bin/env python
"""大众点评登录态收割工具（配合手动启动的 Chrome CDP 使用）。

背景：cn-scraper 的 guided_login 有两个坑——Chrome 就绪仅等 15 秒（macOS 冷启动
常超时）、且依赖补丁后的登录信号才不会提前收割。登录态 cookie（含 fspop）失效
再次出现「搜索返回空」时，用本脚本重新收割。

用法（在仓库根目录）：

  # 1. 手动启动带 CDP 的 Chrome 并打开登录页
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --remote-debugging-port=9222 \
    --user-data-dir="$HOME/.cn_scraper_login_dianping" \
    --no-first-run --no-default-browser-check \
    "https://account.dianping.com/pclogin" &

  # 2. 用大众点评 App 扫码登录，然后运行本脚本（最长等 5 分钟）
  services/cn-scraper-venv/bin/python scripts/relogin-dianping.py

  # 3. 成功后可关闭该 Chrome 窗口；若 cn-scraper 服务在跑无需重启（引擎每次调用都重读 cookie 文件）
"""
import json
import sys
import time

from cn_scraper_mcp.auth import AuthRegistry
from cn_scraper_mcp.cookie_harvest import CookieHarvester

PORT = 9222
SIGNALS = ("fspop", "fspassport", "dponewsssid")  # 任一出现即视为真登录态


def main() -> int:
    harvester = CookieHarvester()
    profile = AuthRegistry.get("dianping")
    deadline = time.monotonic() + 300
    last_names: list[str] = []

    print("等待扫码登录…（每3秒检测一次，最长5分钟）", flush=True)
    while time.monotonic() < deadline:
        try:
            raw = harvester.harvest_raw("dianping", port=PORT)
        except Exception as exc:
            print(f"CDP 未就绪（先启动上面的 Chrome 命令）: {exc}", flush=True)
            time.sleep(5)
            continue
        names = sorted(raw.keys())
        if names != last_names:
            print(f"当前 cookie({len(names)}): {names}", flush=True)
            last_names = names
        hit = [s for s in SIGNALS if raw.get(s)]
        if hit:
            print(f"\n✅ 检测到登录态 cookie: {hit} → 收割保存…", flush=True)
            result = harvester._save_cookies("dianping", raw, profile)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        time.sleep(3)

    print("超时：5分钟内未检测到登录态。浏览器保持打开，可稍后重跑本脚本。", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(main())
