# 2026-08-04 功能与部署 QA 报告

## 结论

本轮实现覆盖商品图片、货号硬校验、库存平台筛选与分组、首页月度指标、报表累计/月度指标，并保持 GitHub Pages 静态导出。源码验证和 390px 浏览器 E2E 已通过；真实 Supabase `0003` 与登录/RPC/Storage 冒烟均已通过，部署状态以本轮 GitHub Actions 结果为准。

## 功能覆盖

| 范围 | 验证内容 | 结果 |
|---|---|---:|
| 货号 | UI、服务层、Memory adapter、数据库 RPC 均拒绝空白；历史无货号数据兼容 | PASS |
| 商品图片 | 已有图识别与复用、新图上传、部分失败后仅重试图片、signed URL 失败隔离 | PASS |
| 库存 | 先按平台筛选，再按忽略大小写的货号 + 尺码分组；批量选中映射到底层单件 | PASS |
| 首页 | 仅显示库存数量、库存成本、当月销量、当月利润；跨月记录不混入 | PASS |
| 报表 | 历史与指定月份的利润、实际到账销售额、销量；CSV 口径一致 | PASS |
| 手机布局 | 390px 登录页无横向溢出，采购日期输入框保持在视口内 | PASS |
| Auth | 无会话进入登录页；callback 错误退出 loading 并提供恢复操作 | PASS |

## 数据库迁移

- 实际执行文件：`supabase/migrations/0003_require_style_code.sql`。
- 执行结果：成功。
- 数据保护：没有清空、覆盖或重写业务表。
- 约束状态：`products_style_code_nonblank` 存在且保持 `NOT VALID`，用于兼容历史空货号行。
- RPC 验证：`create_purchase_simple(jsonb)` 函数定义包含 `STYLE_CODE_REQUIRED`。
- 真实 Auth/RPC 验证：邮箱密码登录成功，空白货号被拒绝，大小写不同的同一货号连续采购复用同一 `productId`。
- 真实 Storage 验证：临时商品图成功写入 private bucket、创建附件元数据、生成 signed URL 并读取图片。
- 清理验证：测试库存、批次、商品、附件和 Storage 文件均已删除，没有把自动化临时数据留在业务库。

## 自动化验证

- Vitest：22 个测试文件、77 项测试通过。
- Playwright：4/4 通过，系统 Chrome，390 × 844。
- TypeScript：通过。
- ESLint：通过。
- Next.js 生产构建：通过，14/14 静态路由生成。
- GitHub Pages 子路径检查：通过，验证 `/dewu-` 下 12 个 HTML 文件的资源与导航路径。

## 安全与边界

- Git 变更不包含 `.env.local`、数据库密码、个人登录密码、service role key 或真实会话 token。
- 浏览器只使用 publishable/anon key；数据库密码不进入前端构建。
- 图片保存在 private Storage，通过 signed URL 读取。
- 当前没有离线业务写入队列；断网时不会静默保存一份等待同步的数据。
- OCR 逻辑和得物挂牌价均未改动，符合本轮范围。

## 仍需真实设备观察

代码和桌面 390px 仿真不能代替长期 iPhone Safari/PWA 使用。部署完成后应在手机上重点观察登录保持、相机/相册选图、图片上传速度、库存图片加载与主屏幕更新缓存；这些观察项不改变本轮自动化通过结论。
