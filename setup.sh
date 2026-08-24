#!/bin/bash
# travel-agent setup —— 一键安装依赖
# 前置要求：Node 18+（pi）、Python 3.11+（cn-scraper）、curl、git
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

XHS_VERSION="${XHS_VERSION:-v2.5.0}"
SERVICES="$ROOT/services"

echo "==> 旅行 Agent 依赖安装"

# ---------- 1. pi 本体 ----------
if ! command -v pi >/dev/null 2>&1; then
  warn "未检测到 pi（本项目的 agent 宿主）"
  echo "    安装: npm install -g @earendil-works/pi-coding-agent"
  echo "    详见: https://github.com/earendil-works/pi-coding-agent"
else
  info "pi 已安装: $(pi --version 2>/dev/null || echo ok)"
fi

mkdir -p "$SERVICES/xhs"

# ---------- 2. xiaohongshu-mcp 二进制 ----------
# 参考: https://github.com/xpzouying/xiaohongshu-mcp （Go 实现，浏览器自动化）
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS/$ARCH" in
  darwin/arm64)  XHS_ARCH="darwin-arm64" ;;
  darwin/x86_64) XHS_ARCH="darwin-amd64" ;;
  linux/x86_64)  XHS_ARCH="linux-amd64" ;;
  linux/aarch64) XHS_ARCH="linux-arm64" ;;
  *) fail "不支持的系统: $OS/$ARCH，请到 xiaohongshu-mcp releases 手动下载: https://github.com/xpzouying/xiaohongshu-mcp/releases" ;;
esac

if [ -x "$SERVICES/xhs/xiaohongshu-mcp" ]; then
  info "xiaohongshu-mcp 已存在，跳过（删除后重跑可升级）"
else
  echo "    下载 xiaohongshu-mcp $XHS_VERSION ($XHS_ARCH) ..."
  BASE="https://github.com/xpzouying/xiaohongshu-mcp/releases/download/$XHS_VERSION"
  curl -L --fail -o "$SERVICES/xhs/xiaohongshu-mcp" "$BASE/xiaohongshu-mcp-$XHS_ARCH" \
    || fail "下载失败，请检查网络或手动下载到 $SERVICES/xhs/"
  curl -L --fail -o "$SERVICES/xhs/xiaohongshu-login" "$BASE/xiaohongshu-login-$XHS_ARCH" \
    || fail "登录工具下载失败"
  chmod +x "$SERVICES/xhs/xiaohongshu-mcp" "$SERVICES/xhs/xiaohongshu-login"
  info "xiaohongshu-mcp 安装完成"
fi

# ---------- 3. cn-scraper-mcp（大众点评等） ----------
# 参考: https://github.com/goesByhc/cn-scraper-mcp （MIT License）
if [ -x "$SERVICES/cn-scraper-venv/bin/cn-scraper-mcp" ]; then
  info "cn-scraper-mcp 已存在，跳过"
else
  echo "    创建 Python venv 并安装 cn-scraper-mcp（约1-3分钟）..."
  python3 -m venv "$SERVICES/cn-scraper-venv"
  "$SERVICES/cn-scraper-venv/bin/pip" install -q cn-scraper-mcp \
    || fail "安装失败（国内网络可加: PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple ./setup.sh）"
  info "cn-scraper-mcp 安装完成"
fi

# ---------- 4. 应用大众点评城市ID补丁 ----------
# 上游 bug: dianping_search 的 city 参数未生效（URL 写死城市ID=1 上海）
# 本补丁添加城市名→ID 映射。详见 docs/patches/cn-scraper-dianping-city-id.patch
PY_ENGINE=$(ls "$SERVICES"/cn-scraper-venv/lib/python*/site-packages/cn_scraper_mcp/engines/dianping.py 2>/dev/null | head -1)
if [ -n "$PY_ENGINE" ] && grep -q "_resolve_city_id" "$PY_ENGINE"; then
  info "城市ID补丁已生效"
elif [ -n "$PY_ENGINE" ]; then
  if (cd "$SERVICES/cn-scraper-venv/lib/python3.13/site-packages" 2>/dev/null \
       && patch --dry-run -N -p1 < "$ROOT/docs/patches/cn-scraper-dianping-city-id.patch" >/dev/null 2>&1) \
     || patch --dry-run -N -p0 -d "$(dirname "$PY_ENGINE")" < "$ROOT/docs/patches/cn-scraper-dianping-city-id.patch" >/dev/null 2>&1; then
    if patch -N -p0 -d "$(dirname "$PY_ENGINE")" < "$ROOT/docs/patches/cn-scraper-dianping-city-id.patch" >/dev/null 2>&1 \
       || patch -N -p1 -d "$SERVICES/cn-scraper-venv/lib/python3.13/site-packages" < "$ROOT/docs/patches/cn-scraper-dianping-city-id.patch" >/dev/null 2>&1; then
      info "城市ID补丁已应用"
    else
      warn "补丁应用失败——大众点评搜索将默认搜上海。请参考 docs/patches/ 手动应用"
    fi
  else
    warn "补丁与当前版本不匹配（上游可能已修复）。如遇城市不生效，参考 docs/patches/ 手动处理"
  fi
else
  warn "未找到 dianping.py，跳过补丁"
fi

# ---------- 5. 高德 API Key ----------
if grep -q "AMAP_API_KEY" ~/.zshrc 2>/dev/null || [ -n "$AMAP_API_KEY" ]; then
  info "AMAP_API_KEY 已配置"
else
  warn "未配置高德 API Key（高德工具将不可用，其余功能不受影响）"
  echo "    申请: https://console.amap.com → 创建应用 → 添加「Web服务」类型 key"
  echo "    配置: echo 'export AMAP_API_KEY=\"你的key\"' >> ~/.zshrc && source ~/.zshrc"
fi

echo ""
info "安装完成！接下来："
echo "  1. ./start-services.sh        # 启动小红书+点评服务"
echo "  2. 首次使用按提示扫码登录（小红书必登，点评遇风控时登）"
echo "  3. pi                         # 启动 agent，输入 /xhs /dp 检查状态"
