# 项目交接文档

## 项目与部署

这是一个供个人在 iPhone Safari/PWA 使用的鞋服进销存，采购平台包括淘宝、京东、拼多多、唯品会等，销售侧以得物结算为主。

- 线上 PWA：<https://dlxdjj.github.io/dewu-/>
- GitHub：<https://github.com/dlxdjj/dewu->
- 部署分支：`agent/supabase-backup-offline`
- 技术栈：Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、Supabase Auth/Postgres/Storage
- 部署方式：Next.js 静态导出 + GitHub Actions + GitHub Pages，base path 为 `/dewu-`

## 2026-08-04 当前基线

- 生产数据源为 **Supabase-only**；未配置或未登录明确阻断，MemoryDbAdapter 只用于测试。
- 登录方式为邮箱 + 密码。Supabase Auth 回调仍兼容 PKCE/错误恢复，但日常登录不依赖 Magic Link。
- `0001_init.sql`、`0002_simple_secure.sql`、`0003_require_style_code.sql` 已应用到真实项目。`0003` 已验证 RPC 含 `STYLE_CODE_REQUIRED` 防线，历史无货号行不会被删除或覆盖；邮箱密码、采购 RPC、同货号商品复用、private Storage 上传和 signed URL 读取均完成真实冒烟，临时数据已清理。
- 新增采购的货号为前端、服务层、Memory adapter 和数据库 RPC 的硬性条件。
- 商品图片复用现有 `attachments` 表与 private `attachments` bucket；上传前最长边压缩至 1200px、JPEG 0.82，库存通过 signed URL 联网显示。
- 输入货号时会查找该货号最新图片：不选择新图则复用，选择新图则新增附件并成为最新图。图片上传失败不会回滚已创建的采购，并允许只重试图片。
- 库存先按购入平台筛选，再按标准化“货号 + 尺码”分组；成本、状态和采购批次不同仍合并，详情页展示底层单件。
- 首页只显示库存数量、库存成本、当月销量、当月利润。
- 报表显示历史总利润/总销售额/总销量，并支持指定月份的同三项指标与 CSV 导出。
- 得物挂牌价不在本次范围；OCR 逻辑未改动。

设计与实施记录：

- `docs/superpowers/specs/2026-08-04-catalog-images-inventory-reports-design.md`
- `docs/superpowers/plans/2026-08-04-catalog-images-inventory-reports.md`
- `docs/qa-report-simple.md`

## 关键规则

### 数据与离线行为

结构化业务数据和图片元数据都在 Supabase；图片二进制在 Supabase Storage。PWA 的静态壳可被浏览器缓存，但库存、报表和图片需要联网读取。当前没有离线写入队列，因此无网络时不会在手机本地产生“稍后自动上传”的业务记录，也不存在恢复云端备份覆盖手机未上传业务数据的问题。

### 货号与图片

- 货号比较会去除首尾空格并忽略大小写。
- 新采购拒绝空值、空字符串和纯空格货号。
- 库存图片按货号对应商品的最新 `product_image` 附件展示。
- signed URL 或图片加载失败时显示占位图，不阻塞库存、筛选和业务操作。

### 库存与经营指标

- 当前库存状态：`pending`、`arrived`、`shipping`、`in_stock_dewu`、`returned`。
- 库存成本为上述状态的 `unit_cost_cents` 合计。
- 月度销量、销售额和利润均按 `settled_at` 归月，只统计已结算且未退款记录。
- 销售额采用实际到账 `actual_payout_cents`。
- 利润 = 实际到账 − 单件成本 − 单件寄出快递费。

### 状态变更

状态变更统一通过 `src/lib/services/status.ts`。结算、退款、深度删除、批量寄出等复合写继续使用 Supabase RPC，避免前端多次写入造成半完成状态。每次状态变化写入 `status_history`。

## 页面

- `/`：库存数量、库存成本、当月销量、当月利润。
- `/add`：必填货号、商品图片查找/复用/替换、采购信息和批量建库存。
- `/add/ocr`：Tesseract.js 浏览器端识别，人工确认后回填添加页。
- `/inventory`：搜索、购入平台筛选、其他现有筛选与排序、货号 + 尺码分组、批量选择。
- `/inventory/group`：组内每件商品的平台、成本、状态和操作。
- `/inventory/[id]`：单件详情、销售信息和状态时间线。
- `/reports`：历史累计三指标、指定月份三指标、明细与 CSV。
- `/settings`：账户、附件清理重试、清空全部数据。

## 本地与部署

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:ci
npm run build
npm run verify:export
npm run e2e
```

本地默认 <http://localhost:3000>。GitHub Pages 构建需要三个 Repository secrets：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_AUTH_REDIRECT_URL`。生产 redirect 必须是 `https://dlxdjj.github.io/dewu-/`。

不要提交 `.env.local`、数据库密码、登录密码、service role key、测试结果目录、构建目录或真实会话 token。

## 后续可选项

- 真实 iPhone Safari 添加到主屏幕后的长期使用回归。
- JSON 数据导出/恢复及冲突策略。
- Service Worker 离线只读缓存或显式离线写入队列。
- 登记售出时显示同货号历史成交价。
- 若以后明确需要，再设计得物挂牌价入口；当前不要加入。
