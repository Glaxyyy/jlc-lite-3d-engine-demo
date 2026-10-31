# Changelog

本项目的所有重要变更将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- **凭据移出 git 跟踪范围**：仓库只跟踪 `js/config.example.js` 模板（占位符），`js/config.js`（真实凭据所在）已从索引移除并加入 `.gitignore` —— 此前初始提交 `ac69a12` 中含真实凭据，待重置 secret 后以 amend + force push 覆盖远程历史

### Planned

- tokenKey 过期后凭据重取（reference/3.4，练手任务）
- Webhook 回调示例（reference/4.2，需自有后端）

## [1.0.0] - 2026-10-31

### Added

- 纯 HTML/CSS/JS 实现的上传预览 Demo：拖拽/点击上传（进度条）→ 上传即预览（iframe + postMessage）→ 模型信息面板（queryById 轮询）
- `server.js`：Node 内置模块零依赖本地服务器（静态文件 + `/api` 代理转发）—— 平台 API 未对 `http://localhost` 等常规来源开放 CORS，须代理转发；前端 api.js 自动探测代理存在与否并回退
- 双击 index.html（`file://`，Origin: null）实测可直接跑通全链路——平台放行 null 来源（2026-10 实测），README 已记录该行为及收紧风险
- 平台接口封装：getAccessToken（缓存复用）/ uploadFile（XHR 进度回调）/ queryById
- 官方预览器协议封装：loaded 握手 + 2s 兜底重发、complete/modelStatus 事件、event.source 安全校验、deviceConfig 显式下发
- GitHub 开源规范文件：README / LICENSE(MIT) / CHANGELOG / CONTRIBUTING / SECURITY / Issue 与 PR 模板
- CI（GitHub Actions）：gitleaks 凭据扫描（config.js 为凭据高危文件）+ `node --check` 全量 JS 语法兜底
