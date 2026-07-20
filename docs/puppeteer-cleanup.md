# Puppeteer 临时目录清理方案

## 问题背景

Puppeteer 每次启动 Chrome 实例时会在 `/tmp` 目录下创建临时 profile 目录（格式：`puppeteer_dev_chrome_profile-*`）。

即使调用 `browser.close()` 关闭浏览器进程，这些临时目录**不会自动删除**，长时间运行会导致：
- 磁盘空间占用增加
- inode 耗尽
- 系统性能下降

## 解决方案

### 1. 自动清理脚本

位置：`scripts/cleanup-puppeteer-profiles.sh`

功能：
- 删除 1 天前创建的 `puppeteer_dev_chrome_profile-*` 目录
- 记录清理日志到 `/tmp/puppeteer-cleanup.log`

### 2. 集成到启动流程

在 `package.json` 中已配置：
```json
{
  "scripts": {
    "dev": "bash scripts/cleanup-puppeteer-profiles.sh && next dev",
    "start": "bash scripts/cleanup-puppeteer-profiles.sh && next start",
    "cleanup": "bash scripts/cleanup-puppeteer-profiles.sh"
  }
}
```

每次启动应用时会自动执行清理。

### 3. PM2 定时清理（生产环境）

使用 `ecosystem.config.js` 配置：

```bash
# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs
```

**清理策略**：
- 主应用每天凌晨 2 点自动重启（触发启动清理）
- 独立清理任务每 6 小时执行一次

## 手动清理

如需立即清理，运行：

```bash
npm run cleanup
```

或直接执行：

```bash
bash scripts/cleanup-puppeteer-profiles.sh
```

## 监控

查看清理日志：

```bash
tail -f /tmp/puppeteer-cleanup.log
```

检查当前残留的临时目录数量：

```bash
ls -ld /tmp/puppeteer_dev_chrome_profile-* 2>/dev/null | wc -l
```

## 注意事项

1. 清理脚本只删除 **1 天前** 的目录，避免误删正在使用的实例
2. 如果发现目录堆积过快，可能是：
   - 浏览器实例没有正确关闭
   - 进程异常退出导致清理逻辑未执行
   - 建议检查代码中的 `browser.close()` 调用
3. 线上环境建议配合 PM2 的 `max_memory_restart` 限制内存使用

## 相关代码

- 浏览器池管理：`lib/cloner/browser-pool.ts`
- 渲染器：`lib/cloner/renderer/index.ts`
- 主引擎：`lib/cloner/index.ts`
