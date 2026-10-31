# 安全策略

## 支持的版本

| 版本  | 支持情况 |
| ----- | -------- |
| 1.0.x | ✅       |

## 报告漏洞

**请不要通过公开 Issue 报告安全漏洞。**

请通过以下方式私下报告：

- 邮件：[service@forface3d.com](mailto:service@forface3d.com)（标题注明「[jlc-lite-3d-engine-demo] 安全漏洞」）
- GitHub 私密漏洞报告（Security → Report a vulnerability）

请在报告中包含：

- 漏洞类型与影响范围
- 复现步骤或 PoC
- 修复建议（如有）

## 特别提醒

本仓库是教学 Demo，**按设计**将 `app_secret` 写在前端配置文件中（仅限演示）。请：

- 不要向本仓库或任何公开仓库提交真实凭据
- 不要将本 Demo 的前端直连方案用于生产环境，`app_secret` 必须存放于服务端
