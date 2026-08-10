# GitHub Pages 子路径部署修复设计

## 目标

让 Next.js 静态导出在 `https://dlxdjj.github.io/dewu-/` 下正确加载、完成 Supabase 登录状态检查，并保持本地开发继续运行在 `/`。

## 根因

GitHub Pages 使用仓库子路径 `/dewu-`，当前构建却把脚本、样式、PWA 清单、图标和部分页面跳转生成为域名根路径。浏览器收到 HTML 后无法加载 `/_next/*`，React 因而不能水合，页面永久停留在服务端预渲染的“正在确认登录状态”。

## 已批准方案

- 由 `NEXT_PUBLIC_BASE_PATH` 控制生产子路径，GitHub Actions 设置为 `/dewu-`。
- Next.js 使用 `basePath` 生成脚本、样式和路由地址；不使用不适合子路径托管的 `assetPrefix`。
- PWA 清单的 `start_url`、`scope` 和图标路径使用同一子路径。
- 登录、退出跳转使用 Next.js 路由器，让框架自动应用 `basePath`。
- 部署前运行类型检查、测试和静态构建；构建后检查 HTML 与清单路径。

## 数据与安全边界

此修复不修改 Supabase 数据、表结构、Storage 文件或认证用户。现有项目没有 Service Worker 和离线写入队列，本次不新增离线数据能力。

## 验收标准

1. 本地未设置 `NEXT_PUBLIC_BASE_PATH` 时仍以 `/` 运行。
2. 生产构建的脚本和样式都以 `/dewu-/_next/` 开头。
3. 清单使用 `/dewu-/` 作为 `start_url` 和 `scope`，图标地址位于 `/dewu-/icons/`。
4. GitHub Pages 首页不再停留在 Supabase 连接提示；未登录用户可进入 `/dewu-/login/`。
5. GitHub Pages 构建成功，线上关键资源均返回 200。
