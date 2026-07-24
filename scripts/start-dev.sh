#!/bin/bash

# 清理 Puppeteer 配置文件
bash "$(dirname "$0")/cleanup-puppeteer-profiles.sh"

# 查找可用端口
START_PORT=3000
MAX_PORT=3010
AVAILABLE_PORT=""

for port in $(seq $START_PORT $MAX_PORT); do
  if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
    AVAILABLE_PORT=$port
    break
  fi
done

if [ -z "$AVAILABLE_PORT" ]; then
  echo "❌ 未找到可用端口 (尝试范围: $START_PORT-$MAX_PORT)"
  exit 1
fi

echo "🚀 在端口 $AVAILABLE_PORT 启动开发服务器..."
PORT=$AVAILABLE_PORT next dev
