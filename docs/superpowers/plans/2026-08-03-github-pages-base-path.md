# GitHub Pages 子路径部署修复实施计划

1. 为 base path 规范化和路径拼接添加失败测试。
2. 实现共享 base path 工具并接入 `next.config.ts`。
3. 修正 PWA 清单以及登录、退出跳转。
4. 在 GitHub Actions 中配置 `/dewu-`，并加入类型检查、测试和构建后路径审计。
5. 修复已发现的测试环境依赖问题，执行全部检查。
6. 推送源分支，等待 `gh-pages` 发布并在线验证资源和认证跳转。
