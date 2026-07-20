#!/bin/bash

# 清理 Puppeteer 临时 profile 目录
# 删除 1 天前创建的目录

LOG_FILE="/tmp/puppeteer-cleanup.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始清理 Puppeteer 临时目录..." >> "$LOG_FILE"

# 统计清理前的数量
BEFORE_COUNT=$(find /tmp -maxdepth 1 -name "puppeteer_dev_chrome_profile-*" -type d 2>/dev/null | wc -l)

# 删除 1 天前的目录
DELETED=0
while IFS= read -r dir; do
  rm -rf "$dir" 2>/dev/null && ((DELETED++))
done < <(find /tmp -maxdepth 1 -name "puppeteer_dev_chrome_profile-*" -type d -mtime +1 2>/dev/null)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 清理完成: 发现 $BEFORE_COUNT 个，删除 $DELETED 个" >> "$LOG_FILE"
