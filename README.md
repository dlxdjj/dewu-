# 得物个人进销存（极简版）

Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 + Supabase。正式运行只使用 Supabase；未配置时应用明确阻断，不回退到 localStorage/IndexedDB 完整数据库。

## 配置与启动

1. 复制 `.env.example` 为 `.env.local`，填写 Supabase URL、publishable/anon key 与 Auth redirect URL。
2. 在空 Supabase 项目顺序执行 `supabase/migrations/0001_init.sql`、`0002_simple_secure.sql`。
3. 在 Supabase Auth 创建个人账户、配置 Redirect URLs；生产环境建议关闭开放注册。
4. 运行 `npm install && npm run dev`。

不得在前端使用 service role key。附件 bucket 为 private，路径以用户 UID 开头，读取使用 signed URL。

## 业务口径

- 单件进价、批量寄出总运费、到手价均以整数分保存。
- 运费按 `created_at ASC, id ASC` 稳定均摊，前余数件多 1 分。
- 唯一利润：到手价 − 进价 − 单件均摊寄出快递费；未到账显示“未结算”。
- 采购退款删除销售记录并排除库存/销量/利润；误录走深度硬删除。
- Storage 删除采用持久化清理任务，失败会明确报告并可在设置页重试。

## 质量命令

```bash
npm run typecheck
npm run lint
npm run test -- --run
npm run test:coverage -- --run
npm run build
npm run e2e
```

真实 Supabase CRUD/RPC/RLS/Storage 与 magic-link 验收需要有效项目配置、迁移权限和测试账户。MemoryDbAdapter 仅供自动化测试显式注入，绝不是生产回退。
