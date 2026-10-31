/**
 * 平台开放 API 封装（共 3 个接口，完整文档见官方文档站 reference/ 分册）：
 *
 *   ① 获取 token   GET  /forface/external/oauth/getAccessToken  —— 用 app_id + app_secret 换 access_token（2 小时有效，必须缓存复用，限流 60 次/分）
 *   ② 上传模型     POST /forface/external/viewer/uploadFile    —— 直传文件，响应直接返回任务 id 和预览凭证 tokenKey（tokenKey 上传即得，预览不用等解析）
 *   ③ 查询任务结果 POST /forface/external/viewer/queryById     —— 轮询解析进度与几何属性（体积/表面积/包围盒），可选增强
 *
 * 统一约定：
 *   - ② ③ 需要请求头 Authorization: Bearer {access_token}
 *   - ① 的成功码是数字 200（特殊！），② ③ 的成功码是字符串 "00000"
 *   - 本文件所有请求都从浏览器直接发往平台 API —— 仅演示用途，生产环境请走自己的后端
 */

/** token 内存缓存：全局一份，2 小时有效，过期前 5 分钟提前刷新 */
let tokenCache = { value: null, expireAt: 0 }

/**
 * API 基地址自动探测（结果缓存）：
 *   - 用 node server.js 启动时，页面同源下有 /api 前缀代理 → 走代理（平台 API 未对浏览器开放 CORS，直连必被拦）
 *   - 用其他静态服务器（如 python http.server）时探测不到代理 → 回退直连平台（可能被 CORS 拦截）
 */
let apiBaseCache = null
async function resolveApiBase() {
  if (apiBaseCache) return apiBaseCache
  try {
    const response = await fetch('/api/health')
    if (response.ok) {
      apiBaseCache = '/api'
      return apiBaseCache
    }
  } catch {
    /* 没有本地代理，走下面的直连 */
  }
  apiBaseCache = CONFIG.API_BASE
  return apiBaseCache
}

/** 把接口返回包装成带错误码的 Error，页面直接展示 msg 即可 */
function throwApiError(code, msg) {
  throw new Error(`平台错误 ${code}：${msg}`)
}

/** 判断接口是否成功（兼容 token 接口的数字 200 与业务接口的字符串 "00000"） */
function isOk(res) {
  return res.code === 200 || res.code === '00000' || res.success === true
}

/** ① 获取 access_token（带缓存：多次上传共用同一个 token，避免触发限流） */
async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expireAt) {
    return tokenCache.value
  }
  const query = new URLSearchParams({
    app_id: CONFIG.APP_ID,
    app_secret: CONFIG.APP_SECRET,
  })
  let res
  const apiBase = await resolveApiBase()
  try {
    const response = await fetch(`${apiBase}/forface/external/oauth/getAccessToken?${query}`)
    res = await response.json()
  } catch (error) {
    throw new Error(
      '无法获取 token。常见原因：① 没有启动本地代理 —— 请用 node server.js 启动（平台 API 未对浏览器开放 CORS，'
      + '其他静态服务器的直连方式会被浏览器拦截）；② 网络不通。'
    )
  }
  if (!isOk(res)) throwApiError(res.code, res.msg)
  // expires_in 单位是秒（7200 = 2 小时）；提前 5 分钟过期，避免边界失效
  tokenCache = {
    value: res.data.access_token,
    expireAt: Date.now() + (res.data.expires_in - 300) * 1000,
  }
  return tokenCache.value
}

/** ② 上传模型文件。onProgress(0~100) 回调上传进度；成功返回 { id, tokenKey } */
async function uploadModel(file, accessToken, onProgress) {
  const apiBase = await resolveApiBase()
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    // 用 XHR 而不是 fetch：只有 XHR 能监听上传进度
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${apiBase}/forface/external/viewer/uploadFile`)
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)

    // 发送完成只计入 90%：收到服务端响应（受理完成）才允许到 100%
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 90))
      }
    }
    xhr.onload = () => {
      if (onProgress) onProgress(100)
      try {
        const res = JSON.parse(xhr.responseText)
        if (!isOk(res)) {
          // 01009 = access_token 过期：清掉缓存，下次重新获取
          if (res.code === '01009') tokenCache = { value: null, expireAt: 0 }
          reject(new Error(`平台错误 ${res.code}：${res.msg}`))
          return
        }
        resolve({ id: res.data.id, tokenKey: res.data.tokenKey })
      } catch {
        reject(new Error(`上传失败（HTTP ${xhr.status}，响应不是有效 JSON）`))
      }
    }
    xhr.onerror = () => {
      reject(new Error(
        '上传请求失败。常见原因：没有启动本地代理（node server.js）或网络不通 —— 平台 API 未对浏览器开放 CORS，直连会被拦截。'
      ))
    }
    xhr.send(form)
  })
}

/** ③ 查询任务结果（解析进度 + 几何属性）。返回 data 字段，失败返回 null（轮询场景不抛错，下一轮再试） */
async function queryById(id, accessToken) {
  const apiBase = await resolveApiBase()
  try {
    const response = await fetch(`${apiBase}/forface/external/viewer/queryById`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    })
    const res = await response.json()
    if (!isOk(res)) {
      if (res.code === '01009') tokenCache = { value: null, expireAt: 0 }
      return null
    }
    return res.data
  } catch {
    return null
  }
}
