# 交接文档（给本地开发 / CodeBuddy 会话）

> 本文档是让新会话快速进入状态的唯一入口。读完这份文档 ≈ 读完整个项目历史。

## 项目是什么

个人使用的商品进销存与利润管理 PWA。从淘宝/京东/拼多多/唯品会采购鞋服，发往得物销售。主要使用场景：iPhone Safari + 添加到主屏幕。

- 线上预览（云端沙箱，可能失效）：https://a63bc50d9b2a6f964.sh4.agentos-app.net
- 技术栈：Next.js 16（App Router）+ TypeScript + Tailwind CSS v4 + Supabase（真实项目已完成数据库迁移；等待测试用户通过 Magic Link 登录后做业务验收）
- 设计：苹果简约风。浅灰底 `#F2F2F7`、白色卡片 `rounded-2xl`、系统字体栈、无渐变无发光

## 本地启动

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 提交前必须通过
npx eslint src     # 必须零错误零警告
```

## 2026-08-02 极简增量后的当前基线

> 下方旧历史描述仅用于追溯；最新实现以 `docs/incremental-prd-simple.md`、`docs/incremental-architecture-simple.md` 和 `docs/engineering-delivery-simple.md` 为准。

- 正式运行已改为 **Supabase-only**：未配置/未登录明确阻断，不再回退 localStorage/IndexedDB 完整数据库；`MemoryDbAdapter` 仅供自动化测试。
- 金额统一为整数分：进价、单件均摊寄出运费、实际到手价；唯一利润 = 到手价 - 进价 - 均摊寄出运费，未到账为 `null`/“未结算”。
- 关键复合写使用 Supabase RPC：极简采购、批量寄出、结算、状态变更、采购退款、深度删除和清库。Storage 为 private，读取 signed URL，删除失败进入可重试清理队列。
- OCR 仍为 tesseract.js + 正则 + 人工确认，已增加 worker 复用/释放与错误反馈；没有引入新 OCR 引擎。
- 净化 Node 22 环境最终质量关卡已通过：干净 `npm ci` 安装 528 packages、TypeScript、原生 ESLint、Next.js 生产构建全部通过。通用状态 RPC 服务端拒绝 `refunded`/`settled`，分别强制走专用退款与结算 RPC。真实 Supabase 已在空库依次应用 `0001`、`0002` 并通过匿名安全检查。
- 2026-08-03 已修复 Auth/DataSource 无限 loading：开发与 E2E origin 统一为 `http://localhost:3000`，`127.0.0.1` 会保留 callback 后规范跳转；PKCE code 显式 `exchangeCodeForSession`，hash session 显式写入，回调完成后才执行 `getSession`/订阅 auth；Auth 12 秒、数据 15 秒超时，失败显示错误、重试/返回登录，首页空库显示 0。发布前 BugFix 复核确认原 8 项失败均为 Vitest Mock 未拦截别名/包导出的测试隔离缺陷，已改为显式依赖注入且未弱化断言，并新增超时、不完整 callback、session 错误覆盖。净化 Node 22 干净副本 `npm ci`、Vitest 12 files / 46 tests、TypeScript、原生 ESLint、Next build 13/13 和系统 Chrome production smoke（HTTP 200、未配置页退出 loading）通过。未重发 Magic Link；旧链接仅在明确过期/已使用/origin 不允许时重发。Playwright bundled Chromium 下载及 runner 受宿主网络/进程 I/O 阻断，详见工程交付报告。

## 历史架构决策（已被本次增量部分替代）

### 1. 双数据层（src/lib/data/）

`DbAdapter` 接口（`types.ts`）有两个实现：
- `local.ts`：localStorage 存结构化数据 + IndexedDB 存图片 Blob。**当前生效的实现**
- `cloud.ts`：Supabase 实现，代码已写好**未实测**
- `index.ts` 的 `getDb()` 按环境变量 `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` 是否存在自动切换，业务代码不感知

接 Supabase 的步骤：SQL Editor 执行 `supabase/migrations/0001_init.sql` → 填 `.env.local` → 重启。注意：本地已有数据不会自动迁移到云端；RLS 对 anon 全放开（单租户，切勿公开部署地址）。

### 2. 状态直达（src/lib/constants/status.ts）

8 个状态，**任意互转**，没有流程约束（用户明确要求，2026-08-02 重构）：
`pending 未到货 / arrived 已到货 / shipping 发往得物途中 / in_stock_dewu 得物仓未售 / sold 已售待结算 / settled 已结算 / returned 退回 / refunded 退款`

所有状态变更**必须**走 `src/lib/services/status.ts` 的 `changeUnitStatus`，它负责：
- sold/settled → 写入销售记录；离开销售态 → 删销售记录
- refunded → 清结算数据（退款不计利润），可再转回 in_stock_dewu 重新销售
- 每次变更自动写 `status_history`（时间轴数据源）

UI 入口：`StatusChips` 组件（详情页/组页），sold/settled 会弹 `SaleFormSheet`（统一销售表单，含「已到账」开关：开了直接 settled——用户不分开登记售出和回款）。

### 3. 利润计算唯一入口（src/lib/utils/profit.ts）

```
分摊成本 = 单价 + (运费 − 优惠) ÷ 数量        （入库时算好存 unit_cost）
实际利润 = 实际到账 − 分摊成本 − 快递费 − 其他费用        （有 actual_payout 优先）
预计利润 = 售价 − 分摊成本 − 平台费 − 快递费 − 其他费用 + 平台补贴
```
任何页面需要利润数字都调这里的函数，禁止页面内自己算。正绿 `#34C759` 负红 `#FF3B30`。

## 数据表（6 张，见 0001_init.sql）

`products`（商品）/ `purchase_batches`（采购批次）/ `inventory_units`（单件库存，每件独立 id，含 unit_cost、status、listing_price）/ `sales`（与单件 1:1）/ `attachments`（图片附件）/ `status_history`（状态变更记录）

## 页面与特色功能

- `/` 首页：在库资金占用、得物仓货值、现货/仓未售/本月利润/本月售出 + **待办**（待结算、退回、**滞留提醒**：未到货>10天、在途>5天、在仓>14天，规则在 `STALE_RULES`）
- `/inventory` 库存：搜索（品名/货号/订单号）、状态/平台/尺码筛选、3 种排序、**合并视图**（同产品+尺码+成本+状态合并 ×N，`lib/utils/group.ts`）、**批量模式**（勾选后状态下拉直达任意状态）
- `/inventory/group` 组页：数量 +/−（复制/删除单件）、全组状态直达、组内利润合计
- `/inventory/[id]` 详情：状态选择器、成本/销售明细、**同批次区块**、时间轴、回退到上一状态
- `/add` 添加：三分组表单、图片上传（自动压缩）、金额数字键盘、保存按数量生成 N 件库存、货号联想复用商品
- `/add/ocr` OCR：tesseract.js 前端识别订单截图 → 正则提取字段 → 人工校对 → 回填添加页
- `/reports` 报表：月份切换、结算/售出口径切换、9 项统计、每日趋势、平台排行、三榜、CSV 导出（含 BOM）

## 验证状态（诚实清单）

已实测通过：状态直达跳转（时间轴记录正确）、合并卡片、组数量加减、全组状态推进含表单、单件/组/批量售出登记（利润数字精确验证）、状态回退（含销售记录删除）、报表统计与口径切换、CSV 导出、OCR 链路（5/6 字段提取成功）、刷新持久化、390px 无横向溢出。

未实测（代码完成、构建类型检查通过，与已验证路径同构）：
- 「已到账」开关直接结算（SaleFormSheet 新组件）
- 退款确认弹层与退款→在售回转（新逻辑）
- 滞留提醒（测试数据达不到阈值天数，需真实使用或改 history 时间验证）
- Supabase cloud.ts（等用户建项目）

## 待办（按用户优先级）

1. 用户点击测试邮箱中的 Magic Link 登录；随后完成真实 Supabase CRUD/RPC/RLS/private Storage/signed URL/清理队列回归
2. 数据备份/恢复（导出/导入 JSON，防 Safari 清本地存储）
3. 滞留提醒真实场景验证、阈值是否可调
4. 登记售出时显示该商品上次成交价（定价参考）
5. 得物仓挂牌价编辑入口（listing_price，详情页）
6. Service Worker 离线缓存

## 约定

- 改动后必须：`npm run build` 通过 + `npx eslint src` 零问题 + 390px 视口检查
- 发布：云端沙箱用 `发布为应用` skill；本地长期用建议部署到自己的服务器/Vercel
- 用户偏好：点击率要低、不要强制流程、数字要一眼看到、苹果简约风
