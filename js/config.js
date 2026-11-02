/**
 * ============================================
 *  Demo 配置（基础版，随仓库提交，只含占位符）
 * ============================================
 *
 * 填写真实凭据：把本文件复制一份为同目录下的 config.local.js，
 * 在 config.local.js 中填写 app_id / app_secret（该文件已被 .gitignore 忽略，
 * 不会被提交，见 README「填写配置」）。
 *
 * ⚠️ 优先级：config.local.js 先于本文件加载；它存在时其 CONFIG 生效，
 *    本文件自动跳过（见下方判断）。页面顶部的 AppID / Secret 输入框实时输入优先级最高。
 *
 * ⚠️ 安全提醒：app_secret 相当于密码。本 Demo 为了让纯前端零后端跑通，
 *    才把它放在浏览器侧；生产环境请务必放到自己的后端（见 README「安全说明」）。
 */
if (typeof CONFIG === 'undefined') {
  window.CONFIG = {
  // 开发者账户中心 https://account.forface3d.com 「我的应用」里获取
  // 推荐填在 config.local.js，本文件保持占位符
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
}
