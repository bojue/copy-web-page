#!/bin/bash

# 清理 Puppeteer 配置文件
bash "$(dirname "$0")/cleanup-puppeteer-profiles.sh"

# 首选端口
PREFERRED_PORT=3000

# 检查端口是否被占用
if lsof -Pi :$PREFERRED_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "⚠️  端口 $PREFERRED_PORT 已被占用"

  # 获取占用进程信息
  PROCESS_INFO=$(lsof -Pi :$PREFERRED_PORT -sTCP:LISTEN -n -P 2>/dev/null | tail -n +2)
  echo "占用进程信息:"
  echo "$PROCESS_INFO"

  # 提示用户选择
  echo ""
  echo "选择操作:"
  echo "  1) 自动切换到下一个可用端口 (3001, 3002...)"
  echo "  2) 终止占用进程并使用 $PREFERRED_PORT (需要手动确认)"
  echo "  3) 取消启动"
  read -p "请输入选择 [1]: " choice
  choice=${choice:-1}

  case $choice in
    1)
      # 查找下一个可用端口
      for port in $(seq 3001 3010); do
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
          echo "🚀 在端口 $port 启动开发服务器..."
          PORT=$port next dev
          exit 0
        fi
      done
      echo "❌ 未找到可用端口 (3001-3010)"
      exit 1
      ;;
    2)
      # 获取进程 PID
      PIDS=$(lsof -Pi :$PREFERRED_PORT -sTCP:LISTEN -t 2>/dev/null)
      if [ -n "$PIDS" ]; then
        echo "将要终止的进程 PID: $PIDS"
        read -p "确认终止? [y/N]: " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
          echo "$PIDS" | xargs kill 2>/dev/null
          sleep 1
          echo "🚀 在端口 $PREFERRED_PORT 启动开发服务器..."
          PORT=$PREFERRED_PORT next dev
        else
          echo "已取消"
          exit 1
        fi
      fi
      ;;
    3)
      echo "已取消"
      exit 1
      ;;
    *)
      echo "❌ 无效选择"
      exit 1
      ;;
  esac
else
  echo "🚀 在端口 $PREFERRED_PORT 启动开发服务器..."
  PORT=$PREFERRED_PORT next dev
fi
