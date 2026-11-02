# 嘉立创三维轻量化引擎示例 Demo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

纯 **HTML + CSS + JavaScript** 实现的[嘉立创 Forface3D 开放平台的三维轻量化引擎](https://3dlite.forface3d.com/docs)接入示例 —— 零框架、零构建、零依赖，克隆下来改一个配置文件就能跑通「上传模型 → 在线轻量化 → 浏览器内 3D 预览」全链路。

适合第一次接入开放平台、想用最短路径理解接入流程的开发者。

![演示动图](.github/assets/demo.gif)

## 功能

- 📤 **拖拽 / 点击上传**模型文件（18 种格式，单文件 ≤ 100M），带平滑上传进度条
- 🧊 **在线 3D 预览**：iframe 嵌入官方预览器（viewerkit），旋转 / 缩放 / 测量 / 爆炸开箱即用
- 📊 **模型信息面板**：后台轮询解析结果，展示体积、表面积、最小包围盒等几何属性

## 快速开始

### 1. 获取凭据

到开发者账户中心 [account.forface3d.com](https://account.forface3d.com)「我的应用」创建应用，拿到 **app_id** 和 **app_secret**。

### 2. 填写配置

凭据有三个入口，**优先级从高到低**：

1. **页面顶部的输入框**（AppID / Secret，输入后脱敏展示，实时生效，刷新后需重填）
2. `js/config.local.js` —— **本地覆盖配置**，git 已忽略、不会进仓库，**推荐方式**
3. `js/config.js` —— 仓库内置的基础配置，只含占位符

推荐做法：复制 config.js 为 config.local.js 再填入凭据：

```bash
cp js/config.js js/config.local.js
```

```js
APP_ID: '在此填入你的AppID',
APP_SECRET: '在此填入你的AppSecret',
```

> 📌 `config.js` 与 `config.local.js` 同时存在时，**以 config.local.js 为准**。
> 没有创建 config.local.js 时，浏览器控制台会出现一条它的 404 记录，属正常现象，不影响使用。

### 3. 启动

双击 index.html（或拖进浏览器）即可上传、预览。仓库自带两个示例模型（[assets/models/](assets/models/)）：`BHJA-F-D10-L8.step` 与 `MARK5.stl`，拖入即可体验。

## 它是怎么工作的？

整个 Demo 只涉及 **3 个平台接口 + 1 套 iframe 协议**（详细参数见[官方文档站](https://3dlite.forface3d.com/docs) reference/ 与 guides/ 分册）：

![上传即预览全链路架构](.github/assets/architecture.svg)

三条关键规则（也是平台设计的精髓）：

1. **tokenKey 上传即得，预览不用等解析** —— 轻量化的等待由预览器内部消化，前端零轮询门槛
2. **`app_secret` 永远只该存在于后端**；`tokenKey` 不是密钥，它就是设计给 iframe 用的（2 小时有效）
3. **预览器 iframe 由浏览器直连平台**，不经过你的后端，这是官方设计


## 目录结构

```
jlc-lite-3d-engine-demo/
├── index.html          # 页面结构（上传页 + 预览页两个视图）
├── css/
│   └── style.css       # 工程蓝图风样式
├── js/
│   ├── config.js          # ⚙️ 基础配置（入库，只含占位符）
│   ├── config.local.js    # ⚙️ 本地覆盖配置（git 忽略，填真实凭据，优先于 config.js）
│   ├── api.js             # 平台 3 个接口封装（token / 上传 / 查询）
│   ├── viewer.js          # 官方预览器 iframe + postMessage 协议封装
│   └── app.js             # 页面状态机与交互（凭据 / 上传 / 进度 / 预览 / 信息面板）
├── assets/
│   ├── models/            # 示例模型（BHJA-F-D10-L8.step / MARK5.stl）
│   └── ...                # 品牌图标、群二维码
└── .github/               # Issue/PR 模板 + README 配图（architecture.svg）
```


## 常见问题

<details>
<summary><b>请求平台接口报错 / 控制台出现 CORS 跨域报错</b></summary>

平台开放 API 的跨域策略：放行 `Origin: null`（双击以 `file://` 打开），**不放行** `http://localhost` 等常规网页来源。因此**请直接双击 index.html 打开**；若挂在静态服务器（如 `python -m http.server`）上打开，接口请求会被浏览器拦截。生产环境请把 `js/api.js` 里的三个接口搬到自己的后端（语言不限，就是普通的 HTTP 调用），前端只调你自己的接口。
</details>

<details>
<summary><b>把 app_secret 写在前端安全吗？</b></summary>

**不安全**。这只是为了让你零后端跑通流程的教学简化。任何人打开浏览器 DevTools 都能看到它，等于把密码公开。生产环境务必放后端 —— 平台侧也按此设计（`tokenKey` 例外，它 2 小时过期、仅对应单个任务，可下发前端）。
</details>

<details>
<summary><b>预览页停留超过 2 小时后空白 / 刷新后预览失效</b></summary>

`tokenKey` 有效期 2 小时。带着任务 `id` 调用「获取预览凭证」接口（reference/3.4）重取一个新 `tokenKey` 重新喂给 iframe 即可，本 Demo 未实现该增强，可作为练手任务。
</details>

<details>
<summary><b>上传报错 00001 / 10001</b></summary>

- `10001`：文件超过 100M 限制
- `00001`：大概率是文件名缺少格式扩展名（平台按扩展名识别文件类型），或中文文件名编码问题
</details>

<details>
<summary><b>预览器变成了移动端布局</b></summary>

iframe 宽度小于 768px 时预览器会自动切换移动端 UI。窄容器（侧栏 / 弹窗）场景请像本 Demo 一样显式下发 `options.deviceConfig: 'computer'`。
</details>

## 安全说明

`app_secret` 只在本地 `js/config.local.js`（被 git 忽略）中出现，仓库内置的 `js/config.js` 仅含占位符；请勿把真实凭据提交到任何公开仓库。

## 📚 官方文档

本 Demo 覆盖的只是最小接入链路。完整的接口参考（token / 上传 / 查询 / 凭证重取 / 临时链接 / 删除）、集成指南（iframe 协议 / Webhook / 自有后端）、支持格式与全局错误码说明，见[嘉立创三维轻量化引擎官方文档](https://3dlite.forface3d.com/docs)。

## 相关仓库

- [jlc-lite-3d-engine](https://github.com/Glaxyyy/jlc-lite-3d-engine) —— 基于官方文档封装的开源 SDK + Vue 示例 + 服务端代理（含 Webhook 验签、token 缓存等生产级能力）

## 💬 联系我们

- **APP_ID / APP_SECRET 申请 / 使用咨询**：加入「嘉立创 Forface3D 技术交流群」（企业微信，Demo 首页顶部的「扫码加群获取」弹的也是这个码）

  ![嘉立创 Forface3D 技术交流群二维码](assets/qr-group.png)

- **邮箱**：service@forface3d.com（二维码失效或不想加群时使用）
- **Bug / 功能建议**：提 [GitHub Issue](https://github.com/Glaxyyy/jlc-lite-3d-engine-demo/issues)
- **安全漏洞**：请勿公开提交，走 [Security Advisories](https://github.com/Glaxyyy/jlc-lite-3d-engine-demo/security/advisories)

> ⚠️ 请勿在群里或任何公开渠道张贴 `app_secret` / token。

## License

[MIT](LICENSE)
