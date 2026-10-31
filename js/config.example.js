/**
 * ============================================
 *  Demo 配置模板
 * ============================================
 *
 * 使用方法：把本文件复制为同目录下的 config.js（该文件已被 .gitignore 忽略，
 * 不会进入仓库），再填入你的凭据。js/config.js 被加载，本模板仅作参考。
 *
 * 1. 到开发者账户中心 https://account.forface3d.com 「我的应用」
 *    创建应用，拿到 app_id 和 app_secret，填到下面两行。
 * 2. 保存后刷新页面即可上传模型、在线预览。
 *
 * ⚠️ 安全提醒：app_secret 相当于密码。本 Demo 为了让纯前端零后端跑通，
 *    才把它写在这里；生产环境请务必放到自己的后端（见 README「安全说明」）。
 */
const CONFIG = {
  // 开发者账户中心「我的应用」里获取

  APP_ID: '在此填入你的AppID',
  APP_SECRET: '在此填入你的AppSecret',

  // 平台开放 API 地址（一般不用改）
  API_BASE: 'https://api.forface3d.com',

  // 官方预览器 iframe 地址（一般不用改）
  VIEWER_URL: 'https://viewerkit.forface3d.com/',

  // 支持的模型格式（与官方查看器口径一致，平台按扩展名识别文件类型）
  ACCEPT_EXTS: [
    'step', 'stp', 'stl', 'obj', '3mf', 'glb', 'igs', 'x_t', 'sat',
    '3dm', 'gltf', 'jt', 'prt', 'sldprt', 'sldasm', 'ifc', 'dwg', 'dxf',
  ],

  // 单文件大小上限（平台限制 100M）
  MAX_FILE_SIZE: 100 * 1024 * 1024,
}
