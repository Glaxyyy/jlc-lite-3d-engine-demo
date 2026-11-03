/**
 * 预览器接入封装（对应文档 4.1 iframe + postMessage 协议）。
 *
 * 通信流程只有三步：
 *   ① 创建 iframe 加载官方预览器（https://viewerkit.forface3d.com/）
 *   ② iframe 加载完成（onload）后等 2 秒，开始向预览器发 tokenKey（循环重发直至
 *      收到就绪回执）；收到 message:'loaded' 时立即发送并停止重发
 *   ③ 预览器解析完成后回发 complete:true + info（模型信息），加载结束后回发 modelStatus
 *
 * 安全要点（协议要求）：
 *   - 接收消息必须校验 event.source === iframe.contentWindow，防止第三方页面伪造
 *   - 发送消息时 targetOrigin 必须是预览器的 https 源
 */
class jlcLite3DViewer {
  /**
   * @param {HTMLElement} container iframe 挂载容器
   * @param {{language?: 'zh'|'en'}} options 语言等 UI 配置
   */
  constructor(container, options = {}) {
    this.container = container
    this.handlers = [] // onModelStatus 注册的回调，destroy 时无需逐个移除（监听器随 window 移除）
    this.destroyed = false

    // ① 创建 iframe
    this.iframe = document.createElement('iframe')
    this.iframe.src = CONFIG.VIEWER_URL
    this.iframe.allowFullscreen = true
    container.appendChild(this.iframe)
  }

  /**
   * 发送 tokenKey 给预览器，模型开始加载。
   * 返回 Promise，在收到 complete（后端解析结果返回）时兑现，附带模型信息 info；
   * 预览器长时间未就绪（网络不通/被拦截）时 reject，页面给出明确提示。
   */
  load(tokenKey) {
    // 付费去版权的 copyright 凭证也发在与 tokenKey 平级的顶层（本 Demo 不涉及，仅注释说明）
    const data = {
      tokenKey,
      options: {
        showShare: false, // 隐藏预览器右上角的分享按钮
        language: 'zh',
        // 显式下发 computer：iframe 宽度 <768px 时预览器会自动切移动端布局，窄容器场景必须固定
        deviceConfig: 'computer',
      },
    }

    return new Promise((resolve, reject) => {
      const post = () => this.iframe.contentWindow.postMessage(data, CONFIG.VIEWER_URL)
      let ready = false
      let attempts = null
      let giveup = null

      // 发送启动器：iframe 加载完成（onload）后再等 2 秒才开始发凭证——
      // 给预览器内部初始化留足时间，避免早期 postMessage 打在不完整的接收环境上
      const startSending = () => {
        if (ready || this.destroyed) return
        // 循环重发直到收到就绪回执（官方协议要求处理首次加载被拦截的情况），
        // postMessage 异常（iframe 未就绪等）try/catch 吞掉等下一轮
        attempts = setInterval(() => {
          if (this.destroyed || ready) {
            clearInterval(attempts)
            return
          }
          try {
            post()
          } catch {
            /* iframe 尚未就绪，800ms 后重试 */
          }
        }, 800)

        // 开始发送后 20 秒仍未收到回执：判定为预览器加载失败，给出可操作的报错
        giveup = setTimeout(() => {
          if (ready || this.destroyed) return
          clearInterval(attempts)
          window.removeEventListener('message', onMessage)
          reject(new Error(
            '预览器加载失败：20 秒内未收到 viewerkit.forface3d.com 的就绪信号。'
            + '请检查网络能否访问该域名（公司内网/代理拦截常见）。'
          ))
        }, 20000)
      }

      // iframe 文档加载完成事件（错误页也会触发 load，因此不会漏掉失败场景）
      this.iframe.addEventListener('load', () => setTimeout(startSending, 2000), { once: true })

      const onMessage = (event) => {
        if (this.destroyed) return
        // 安全校验：只认自己 iframe 发来的消息
        if (event.source !== this.iframe.contentWindow) return

        if (event.data?.message === 'loaded') {
          // ② 就绪：立即发送凭证并停止重发
          ready = true
          clearInterval(attempts)
          clearTimeout(giveup)
          post()
        } else if (event.data?.complete === true) {
          // ③ 后端解析结果返回，模型开始加载
          window.removeEventListener('message', onMessage)
          resolve({ info: event.data.info || null })
        }

        if (event.data?.modelStatus) {
          // 模型加载结束：'success' | 'failure'
          this.handlers.forEach((fn) => fn(event.data.modelStatus))
        }
      }
      window.addEventListener('message', onMessage)
      // destroy 时统一移除监听器
      this._onMessage = onMessage
    })
  }

  /** 订阅模型加载状态（success / failure） */
  onModelStatus(callback) {
    this.handlers.push(callback)
  }

  /** 销毁：移除监听器与 iframe，页面回到上传页时调用 */
  destroy() {
    this.destroyed = true
    if (this._onMessage) window.removeEventListener('message', this._onMessage)
    this.iframe?.remove()
  }
}
