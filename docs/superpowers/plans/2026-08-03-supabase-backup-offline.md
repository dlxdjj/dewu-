# Supabase 验收、JSON 备份与离线体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 真实验证已配置的 Supabase，并为每个认证用户提供可下载、可事务覆盖恢复的 JSON 业务备份及安全的离线应用壳。

**Architecture:** 保持 Supabase-only 数据模型。浏览器从现有 DbAdapter 导出已认证用户的业务行，恢复由新的 `restore_backup` security-definer RPC 原子执行；图片和附件均不导出。Service Worker 仅缓存公开应用壳，明确绕开 Supabase、signed URL 和用户数据请求。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Supabase RPC/RLS、Vitest、Playwright、原生 Service Worker。

## Global Constraints

- 使用根 Supabase URL 和 publishable/anon key；不写入数据库密码或 service-role key。
- 备份只包含 products、purchase_batches、inventory_units、sales、status_history；不包含附件元数据或图片。
- 导入必须先校验、显示摘要，再要求输入“恢复”；失败必须回滚。
- 不缓存 Supabase REST/RPC/Auth、signed URL、图片或用户输入；不实现离线写队列。

---

### Task 1: 真实 Supabase 配置与受控验收

**Files:**
- Modify: `.env.local`（仅本机，永不提交）
- Create: `docs/supabase-acceptance-2026-08-03.md`

- [ ] 以 `https://iswpkxgyadofufnuaubl.supabase.co`（去除 `/rest/v1/`）和提供的 publishable key 更新本机环境；确认 `.env.local` 仍被忽略。
- [ ] 启动开发服务器，向已授权测试邮箱发送 Magic Link；用户点击后记录认证回调与当前账号 ID（文档不记录 token）。
- [ ] 创建可识别测试采购，分别执行寄件、结算、退款及附件上传/读取/删除重试；检查 RPC 响应和页面状态。
- [ ] 使用未登录请求与第二测试用户（如可用）验证 RLS 拒绝跨用户读取；把通过、阻断和需人工操作的结果写入验收文档。
- [ ] 运行 `npm run typecheck`、`npm run lint`、`npm run test -- --run`；提交验收文档，不提交 `.env.local`。

### Task 2: 可版本化的 JSON 备份域模型

**Files:**
- Create: `src/lib/backup/types.ts`
- Create: `src/lib/backup/codec.ts`
- Test: `src/lib/backup/codec.test.ts`

- [ ] 先写失败测试：`createBackup` 去除 `user_id` 和附件、输出 `schemaVersion: 1`；`parseBackup` 拒绝未知版本、重复 ID、孤儿 batch/unit/sale/history 引用和非法金额。
- [ ] 实现 `BackupPayload`：`{schemaVersion:1, exportedAt:string, summary: BackupSummary, data:{products,batches,units,sales,history}}`；所有数据行使用现有数据库类型的无 `user_id` 形式。
- [ ] 实现 `createBackup(rows)`、`parseBackup(text)`、`summarizeBackup(payload)` 和 `downloadBackup(payload)`；文件名为 `dewu-pms-backup-YYYY-MM-DD.json`。
- [ ] 运行 `vitest --run src/lib/backup/codec.test.ts`，确认失败用例转绿后提交 `feat: add versioned backup codec`。

### Task 3: 原子覆盖恢复 RPC 与 Adapter

**Files:**
- Create: `supabase/migrations/0003_backup_restore.sql`
- Modify: `src/lib/data/types.ts`
- Modify: `src/lib/data/cloud.ts`
- Modify: `src/lib/data/memory.ts`
- Test: `src/lib/data/index.test.ts`

- [ ] 先写 adapter 测试：`restoreBackup({payload})` 只能影响当前用户；无效 payload 不改变任何现有行；有效 payload 清空并恢复五张业务表。
- [ ] 在迁移中创建 `restore_backup(p_payload jsonb)`：`require_uid()`、验证 `schemaVersion=1`，锁定当前用户数据，删除 products（级联业务行和附件元数据），按 product → batch → unit → sale → history 插入；所有插入的 `user_id` 强制为 `auth.uid()`，不信任 payload 的用户字段；异常使事务回滚。
- [ ] 在 `DbAdapter` 增加 `restoreBackup(input: { payload: BackupPayload }): Promise<BackupRestoreResult>`；cloud 调 RPC，memory 用 copy-on-write 模拟相同语义。
- [ ] 运行数据层测试、typecheck；提交 `feat: add atomic backup restore`。

### Task 4: 设置页的导出、导入预览与确认

**Files:**
- Modify: `src/app/settings/page.tsx`
- Create: `src/components/ui/BackupRestoreCard.tsx`
- Test: `src/components/ui/BackupRestoreCard.test.tsx`

- [ ] 写失败组件测试：导出调用五个 list 方法并下载 JSON；选择无效文件展示错误；有效文件展示数量；未输入“恢复”禁用按钮；恢复成功刷新并显示“不含图片”提示。
- [ ] 实现 `BackupRestoreCard`，文件用 `File.text()` 读取并调用 `parseBackup`；仅在预览通过后提供确认输入；恢复调用 `getDb().restoreBackup`，期间禁用按钮。
- [ ] 在设置页放置卡片，保留现有清理/清空逻辑；文案明确恢复会覆盖云端数据且历史图片不会恢复。
- [ ] 运行组件测试、全量测试和 390px Playwright 测试；提交 `feat: add JSON backup and restore UI`。

### Task 5: 隐私优先的离线应用壳

**Files:**
- Create: `public/sw.js`
- Create: `src/app/offline/page.tsx`
- Create: `src/components/layout/ServiceWorkerRegistration.tsx`
- Modify: `src/app/layout.tsx`
- Test: `e2e/offline-shell.spec.ts`

- [ ] 编写 e2e：注册成功后断网刷新已缓存应用壳可显示离线说明；请求 URL 含 Supabase host、`/rest/v1/`、`/auth/v1/` 或 signed URL 时不写入 Cache Storage。
- [ ] 实现 SW install/activate：预缓存 `/offline`、manifest、图标；删除旧 `dewu-pms-shell-*` cache；fetch 仅拦截同源 GET 导航和静态资源，网络失败返回 `/offline`。
- [ ] 实现客户端注册组件并放入根 layout；离线页说明需联网读取或修改数据，不显示任何缓存业务数据。
- [ ] 运行 Playwright、typecheck、lint、build；提交 `feat: add privacy-safe offline shell`。

### Task 6: 最终验证与交接

**Files:**
- Modify: `README.md`
- Modify: `HANDOFF.md`
- Modify: `docs/qa-report-simple.md`

- [ ] 更新配置说明、备份限制、恢复风险和离线策略；不写入凭据。
- [ ] 跑 `npm run typecheck && npm run lint && npm run test -- --run && npm run build`；记录实际输出与任何外部 Supabase 验收阻断。
- [ ] 检查 `git diff --check`、`git status --ignored`，确保 `.env.local`、缓存、截图和测试结果未暂存；提交 `docs: document backup and offline operations`。
