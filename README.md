# 得物个人进销存 PWA

面向个人鞋服采购与得物销售的移动端进销存。技术栈为 Next.js 16、React 19、TypeScript、Tailwind CSS v4 和 Supabase。正式运行只使用 Supabase；未配置或未登录时会明确阻断，不回退到浏览器本地数据库。

线上地址：<https://dlxdjj.github.io/dewu-/>

## 当前功能

- 新增采购必须填写货号；同一货号自动识别并复用已上传的最新商品图片，也可以选择新图替换。
- 图片在上传前压缩为最长边 1200 像素、JPEG 质量 0.82，原始图片不进入 Git 仓库；文件保存在 Supabase 私有 Storage，页面通过短期 signed URL 联网加载。
- 库存可按购入平台筛选，再按“货号 + 尺码”合并显示；分组明细仍保留每一件商品的平台、成本和状态。
- 首页固定显示库存数量、库存成本、当月销量、当月利润。
- 报表显示历史总利润、总销售额、总销量，并可选择月份查看该月利润、销售额、销量及导出 CSV。
- OCR 仍为浏览器端 Tesseract.js + 正则提取 + 人工确认，本轮未调整识别逻辑。

## Supabase 配置与迁移

1. 复制 `.env.example` 为 `.env.local`，填写 Supabase URL、publishable/anon key 与 Auth redirect URL。
2. 新项目按顺序执行：
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_simple_secure.sql`
   - `supabase/migrations/0003_require_style_code.sql`
   - `supabase/migrations/0004_state_integrity.sql`
3. 已执行过 `0001`、`0002` 的现有项目按未执行版本继续执行 `0003`、`0004`，不要重复执行带初始化职责的旧迁移。
4. 在 Supabase Auth 创建个人邮箱/密码账户，并关闭不需要的开放注册方式。
5. 运行 `npm install` 和 `npm run dev`。

`0003` 只强化后续新增采购的货号必填规则。约束采用 `NOT VALID`，不会删除、覆盖或阻塞历史无货号数据；采购 RPC 会对新写入显式返回 `STYLE_CODE_REQUIRED`。`0004` 统一维护库存状态与销售记录：离开销售态会清除旧销售数据，进入“已售”会创建未结算销售记录，结算和退款只能走专用 RPC。

不得在前端、GitHub Secrets 以外的文件或 Git 历史中保存 service role key、数据库密码或个人登录密码。附件 bucket 为 private，路径以用户 UID 开头。

## 业务口径

- 库存数量：状态属于 `pending`、`arrived`、`shipping`、`in_stock_dewu`、`returned` 的单件库存数量。
- 库存成本：上述库存单件 `unit_cost_cents` 的合计。
- 销量：已结算且非退款的销售记录数量，以 `settled_at` 归属月份。
- 销售额：实际到账 `actual_payout_cents` 的合计。
- 利润：实际到账 − 单件成本 − 单件寄出快递费；退款不计入销量、销售额和利润。
- 所有金额在数据库中以整数分保存，页面显示时再格式化为人民币。

## GitHub Pages 部署

部署工作流监听 `main`，先执行审计、类型检查、Lint、覆盖率、静态导出和两套 390px E2E，再将站点发布到 `/dewu-` 子路径。仓库 `Settings → Secrets and variables → Actions → Repository secrets` 需要配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_AUTH_REDIRECT_URL`，生产值为 `https://dlxdjj.github.io/dewu-/`

这些值只在 GitHub Actions 构建时注入；Pages 不会在浏览器运行时读取仓库变量。

## 质量命令

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run test:coverage -- --run
npm run pages:check
npm run e2e:all
```

常规 E2E 默认使用 3000 端口，未配置态 E2E 使用 3001。端口被占用时可分别设置 `PLAYWRIGHT_PORT`、`PLAYWRIGHT_CONFIGURATION_PORT`；只有确认目标端口已经运行当前项目时，才设置 `PLAYWRIGHT_REUSE_SERVER=1`。

MemoryDbAdapter 仅供自动化测试显式注入，绝不是生产回退。
