#!/usr/bin/env bash
cd "$(dirname "$0")"
PORT=8080
echo "正在启动 POWER 抽奖系统..."
echo "控制端: http://localhost:$PORT"
echo "大屏页: http://localhost:$PORT/screen.html"
echo "按 Ctrl+C 停止"
echo ""
if command -v python3 &>/dev/null; then
  python3 -m http.server "$PORT"
elif command -v python &>/dev/null; then
  python -m http.server "$PORT"
else
  echo "未检测到 Python，请安装 Python 或使用: npx -y serve -p $PORT"
  exit 1
fi
