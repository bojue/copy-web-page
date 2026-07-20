
# Web Page Cloner

一个网页资源克隆工具，能够完整提取目标网页的静态资源并重构为可独立部署的静态站点。


![Web](./public/demo.png)




## 产品特点

- **完整资源捕获** - HTML、CSS、JavaScript、图片、字体等所有静态资源
- **智能路径重写** - 自动转换为相对路径，确保离线可用
- **多级深度爬取** - 支持跟踪站内链接，批量克隆多个页面
- **实时进度反馈** - 基于 SSE 的实时进度推送
- **ZIP 打包下载** - 一键打包，可直接部署

## 效果

<img width="2560" height="1440" alt="截屏2026-07-14 17 31 22" src="https://github.com/user-attachments/assets/8a4a964b-a627-49dd-ad42-3a1c60ef089e" />

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 即可使用。

### 生产构建

```bash
npm run build
npm run start
```

## PM2 部署（推荐）

使用 PM2 进行生产环境部署，支持自动清理 Puppeteer 临时目录：

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 设置开机自启
pm2 startup
pm2 save
```

**PM2 配置说明**：
- 主应用每天凌晨 2 点自动重启（触发清理）
- 独立清理任务每 6 小时执行一次
- 自动清理 1 天前的 Puppeteer 临时目录

详细说明见 [Puppeteer 临时目录清理方案](./docs/puppeteer-cleanup.md)

## 维护与监控

### 手动清理临时目录

```bash
npm run cleanup
```

### 查看清理日志

```bash
tail -f /tmp/puppeteer-cleanup.log
```

### 检查临时目录数量

```bash
ls -ld /tmp/puppeteer_dev_chrome_profile-* 2>/dev/null | wc -l
```

## 开源协议

MIT License - 详见 [LICENSE](https://opensource.org/licenses/MIT)

本工具仅供技术研究和授权测试使用，使用者应遵守目标网站的 robots.txt 和服务条款。


> ⚠️ **警告**: 本项目仅供学习和技术研究使用，请勿用于任何商业或非法用途。使用时请遵守目标网站的服务条款。
