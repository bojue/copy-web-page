
![Web](./public/demo.png)

一个网页资源克隆工具，能够完整提取目标网页的静态资源并重构为可独立部署的静态站点。

![Demo](./public/录屏.gif)


## 产品特点

- **完整资源捕获** - HTML、CSS、JavaScript、图片、字体等所有静态资源
- **智能路径重写** - 自动转换为相对路径，确保离线可用
- **多级深度爬取** - 支持跟踪站内链接，批量克隆多个页面
- **实时进度反馈** - 基于 SSE 的实时进度推送
- **ZIP 打包下载** - 一键打包，可直接部署

## 效果
<img width="2560" height="1440" alt="image" src="https://github.com/user-attachments/assets/423c32bc-5ea8-42ce-8f5a-f6a27523b9e3" />

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

## 开源协议

MIT License - 详见 [LICENSE](https://opensource.org/licenses/MIT)

本工具仅供技术研究和授权测试使用，使用者应遵守目标网站的 robots.txt 和服务条款。


> ⚠️ **警告**: 本项目仅供学习和技术研究使用，请勿用于任何商业或非法用途。使用时请遵守目标网站的服务条款。
