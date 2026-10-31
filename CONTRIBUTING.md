# 贡献指南

感谢关注本 Demo！这是一个刻意保持**极简**的教学项目：纯 HTML/CSS/JS，无框架、无构建、无 npm 依赖。所有贡献请尊重这一前提。

## 提交变更前

- [ ] 不引入任何框架 / 构建工具 / npm 依赖（连 CSS 预处理器也不要）
- [ ] 保持代码注释密度：每个非显然的步骤都应有一句「为什么」
- [ ] 手动验证上传 → 预览 → 信息面板 → 重新上传全链路可用
- [ ] 涉及行为或配置变化的，同步更新 README 与 CHANGELOG
- [ ] **绝不提交真实 app_id / app_secret**（js/config.js 中只保留占位符）

## 提交流程

1. Fork 仓库并新建分支：`git checkout -b feat/your-feature`
2. 提交变更（清晰中文描述）
3. 发起 Pull Request，按模板填写说明

## 反馈问题

请使用 [Issue 模板](.github/ISSUE_TEMPLATE/)提交，描述复现步骤、浏览器环境与控制台报错。
