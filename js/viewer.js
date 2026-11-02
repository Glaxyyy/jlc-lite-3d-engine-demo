/**
 * 预览器接入封装（对应文档 4.1 iframe + postMessage 协议）。
 *
 * 通信流程只有三步：
 *   ① 创建 iframe 加载官方预览器（https://viewerkit.forface3d.com/）
 *   ② 预览器就绪后会向页面发 message:'loaded'，页面收到后立刻把 tokenKey 发回去
 *      （若 2 秒内没等到就绪信号——首次加载可能被拦截——就兜底直接发，协议要求必须处理）
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
   * 返回 Promise，在收到 complete（后端解析结果返回）时兑现，附带模型信息 info。
   */
  load(tokenKey) {
    // 付费去版权的 copyright 凭证也发在与 tokenKey 平级的顶层（本 Demo 不涉及，仅注释说明）
    const data = {
      tokenKey,
      options: {
        showShare: true,
        language: 'zh',
        // 显式下发 computer：iframe 宽度 <768px 时预览器会自动切移动端布局，窄容器场景必须固定
        deviceConfig: 'computer',
      },
    }

    return new Promise((resolve) => {
      // 就绪信号防拦截：2s 内没收到 loaded 就直接发送
      const fallback = setTimeout(() => this.iframe.contentWindow.postMessage(data, CONFIG.VIEWER_URL), 2000)

      const onMessage = (event) => {
        if (this.destroyed) return
        // 安全校验：只认自己 iframe 发来的消息
        if (event.source !== this.iframe.contentWindow) return

        if (event.data?.message === 'loaded') {
          // ② 就绪：立即发送凭证
          clearTimeout(fallback)
          this.iframe.contentWindow.postMessage(data, CONFIG.VIEWER_URL)
        } else if (event.data?.complete === true) {
          // ③ 后端解析结果返回，模型开始加载
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
