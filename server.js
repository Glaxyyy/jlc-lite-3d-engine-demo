/**
 * ============================================
 *  本地服务器 —— 可选，但推荐
 * ============================================
 *
 * 为什么需要它：平台 API 只面向服务端调用（CORS 未对浏览器来源开放，
 * 实测响应缺 Access-Control-Allow-Origin），浏览器直连必被拦。
 * 本文件用 Node 内置模块做两件事，零依赖、无需 npm install：
 *
 *   1. 静态文件服务（替代 python -m http.server）
 *   2. 把 /api/ 开头的请求原样转发到平台 API（绕开浏览器 CORS 限制，
 *      凭据仍然只在浏览器→本地服务器之间传输，不经过第三方）
 *
 * 运行：node server.js   然后打开 http://localhost:8080
 *
 * 注意：这只是「让 Demo 在本地跑通」的最小代理。生产环境请把它换成
 * 你自己后端里的一个接口（语言不限，逻辑完全相同）。
 */
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const PORT = 8080
const API_HOST = 'api.forface3d.com'
const WEB_ROOT = __dirname

// 静态文件 MIME 类型表（覆盖 Demo 用到的几种即可）
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
}

const server = http.createServer((req, res) => {
  // ---------- ① 健康检查：前端据此判断本地代理是否存在（必须在代理分支之前判断） ----------
  if (req.url === '/api/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true, proxy: true }))
    return
  }

  // ---------- ② API 代理：/api/xxx → https://api.forface3d.com/xxx ----------
  if (req.url.startsWith('/api/')) {
    const targetPath = req.url.replace(/^\/api/, '') || '/'
    // 只转发业务需要的头；去掉 origin/referer/cookie，对平台表现成普通服务端调用
    const headers = {}
    if (req.headers['authorization']) headers['authorization'] = req.headers['authorization']
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
    if (req.headers['content-length']) headers['content-length'] = req.headers['content-length']

    const proxyReq = https.request(
      { hostname: API_HOST, path: targetPath, method: req.method, headers },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res) // 响应流式回传（查询结果、token 等 JSON）
      },
    )
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: `本地代理请求平台失败：${err.message}` }))
    })
    req.pipe(proxyReq) // 请求体（含上传的模型文件）流式转发给平台
    return
  }

  // ---------- ③ 静态文件服务 ----------
  let filePath = path.normalize(path.join(WEB_ROOT, decodeURIComponent(req.url.split('?')[0])))
  // 安全兜底：禁止路径穿越到 WEB_ROOT 之外
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (req.url === '/' || req.url.startsWith('/?')) filePath = path.join(WEB_ROOT, 'index.html')

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`✅ Demo 已启动：http://localhost:${PORT}`)
  console.log(`   API 代理已就绪：/api/* → https://${API_HOST}/*`)
})
