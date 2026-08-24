#!/bin/bash
# 旅行 Agent 数据服务一键启动/检查（幂等，可重复运行）
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

XHS_PORT="${XHS_PORT:-18060}"
DP_PORT="${DP_PORT:-8001}"
XHS_DIR="$ROOT/services/xhs"
VENV="$ROOT/services/cn-scraper-venv"

[ -x "$XHS_DIR/xiaohongshu-mcp" ] || { echo -e "${RED}[✗]${NC} 未安装依赖，请先运行 ./setup.sh"; exit 1; }

check_xhs_login() {
  local SID STATUS
  SID=$(curl -s -i -m 20 -X POST http://localhost:$XHS_PORT/mcp \
    -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"boot","version":"1"}}}' \
    | grep -i '^mcp-session-id' | tr -d '\r' | awk '{print $2}')
  [ -z "$SID" ] && return 1
  curl -s -o /dev/null -m 10 -X POST http://localhost:$XHS_PORT/mcp \
    -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SID" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  STATUS=$(curl -s -m 40 -X POST http://localhost:$XHS_PORT/mcp \
    -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SID" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"check_login_status","arguments":{}}}')
  echo "$STATUS" | grep -q "已登录"
}

echo "==> [1/3] 小红书 xiaohongshu-mcp (:$XHS_PORT)"
if lsof -ti :$XHS_PORT > /dev/null 2>&1; then
  echo -e "    ${GREEN}已在运行${NC} (PID $(lsof -ti :$XHS_PORT))"
else
  (cd "$XHS_DIR" && nohup ./xiaohongshu-mcp -port :$XHS_PORT > /tmp/xhs-mcp.log 2>&1 &)
  sleep 3
  echo -e "    ${GREEN}已启动${NC}，日志 /tmp/xhs-mcp.log"
fi
if check_xhs_login; then
  echo -e "    ${GREEN}登录态正常${NC}"
else
  echo -e "    ${YELLOW}未登录${NC} → 运行 $XHS_DIR/xiaohongshu-login 用小红书App扫码，完成后重跑本脚本"
fi

echo "==> [2/3] 大众点评 cn-scraper-mcp (:$DP_PORT)"
if lsof -ti :$DP_PORT > /dev/null 2>&1; then
  echo -e "    ${GREEN}已在运行${NC} (PID $(lsof -ti :$DP_PORT))"
else
  CN_SCRAPER_TRANSPORT=http CN_SCRAPER_HOST=127.0.0.1 CN_SCRAPER_PORT=$DP_PORT CN_SCRAPER_PATH=/mcp \
    nohup "$VENV/bin/cn-scraper-mcp" > /tmp/cn-scraper.log 2>&1 &
  sleep 3
  echo -e "    ${GREEN}已启动${NC}，日志 /tmp/cn-scraper.log"
  echo "    （登录 Cookie 存于 ~/.cn-scraper-cookies/，首次遇风控时在 pi 里说「大众点评需要重新登录」）"
fi

echo "==> [3/3] 高德地图 API"
if grep -q "AMAP_API_KEY" ~/.zshrc 2>/dev/null || [ -n "$AMAP_API_KEY" ]; then
  echo -e "    ${GREEN}OK${NC}（key 在环境变量/.zshrc，无需启动服务）"
else
  echo -e "    ${RED}未找到 AMAP_API_KEY${NC}，高德工具不可用（申请: https://console.amap.com 「Web服务」key）"
fi

echo ""
echo "全部就绪。接下来: cd $ROOT && pi   （进入后可用 /xhs /dp 验证）"
