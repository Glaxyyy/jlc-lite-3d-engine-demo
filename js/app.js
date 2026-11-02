/**
 * 页面主逻辑：三个状态来回切换
 *
 *   idle（等待上传） → uploading（上传中，进度条） → previewing（预览中，iframe + 信息面板） → 回到 idle
 *
 * 核心链路（对应文档 4.4 端到端指南）：
 *   选文件 → getAccessToken() → uploadModel() 拿到 tokenKey → viewer.load(tokenKey) 直接预览
 *   （不需要等平台解析！tokenKey 上传即得，建模等待由预览器内部消化）
 *   预览期间后台每 3 秒 queryById 轮询一次，只为补充几何信息面板，不阻塞预览。
 */

// ---------- DOM 引用 ----------
const els = {
  uploadView: document.getElementById('upload-view'),
  previewView: document.getElementById('preview-view'),
  errorMsg: document.getElementById('error-msg'),
  stageErrorMsg: document.getElementById('stage-error-msg'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  fileBtn: document.getElementById('file-btn'),
  progressLine: document.getElementById('progress-line'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  fmts: document.getElementById('fmts'),
  panelBody: document.getElementById('panel-body'),
  viewerContainer: document.getElementById('viewer-container'),
  stageTitle: document.getElementById('stage-title'),
  backHome: document.getElementById('brand-home'),
  restartBtn: document.getElementById('restart-btn'),
}

// ---------- 运行时状态 ----------
let phase = 'idle' // 'idle' | 'uploading' | 'previewing'
let viewer = null // 当前预览实例（同时至多一个，重建前先 destroy）
let infoTimer = null // 几何信息轮询句柄
let accessToken = null // 与 tokenCache 对应的当前凭证（轮询复用）
let dragDepth = 0 // dragenter/dragleave 成对触发，计数归零才算真正离开拖拽区

/** 扩展名是否在支持清单内（大小写不敏感；无扩展名视为不支持） */
function isSupported(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return CONFIG.ACCEPT_EXTS.includes(ext)
}

/** 渲染格式标签（上传页那排小胶囊） */
function renderFormats() {
  els.fmts.innerHTML = CONFIG.ACCEPT_EXTS
    .map((ext) => `<i>${ext.toUpperCase()}</i>`)
    .join('')
}

// ---------- 状态切换 ----------

/** 回到上传页（清空预览器、轮询、错误提示；平台任务保留不删除） */
function backToUpload() {
  stopInfoPolling()
  viewer?.destroy()
  viewer = null
  phase = 'idle'
  els.errorMsg.hidden = true
  els.stageErrorMsg.hidden = true
  els.previewView.hidden = true
  els.uploadView.hidden = false
  els.progressLine.hidden = true
  els.fileBtn.classList.remove('file-btn-disabled')
  els.fileInput.disabled = false
}

/** 上传页 / 预览页分别展示错误提示 */
function showError(message, onStage) {
  const el = onStage ? els.stageErrorMsg : els.errorMsg
  el.textContent = `⚠️ ${message}`
  el.hidden = false
}

// ---------- 上传流程 ----------

async function upload(file) {
  if (phase !== 'idle') return // 上传中/预览中禁止重复上传

  // 前置校验：拖拽可绕过 accept 过滤，不支持的直接拦下
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    showError('文件超过 100M 限制（平台错误码 10001）')
    return
  }
  if (!isSupported(file.name)) {
    showError(`不支持的文件格式，请使用：${CONFIG.ACCEPT_EXTS.map((e) => e.toUpperCase()).join(' / ')}`)
    return
  }

  phase = 'uploading'
  els.errorMsg.hidden = true
  els.fileBtn.classList.add('file-btn-disabled')
  els.fileInput.disabled = true
  els.progressLine.hidden = false
  let progress = 0

  // 本地传输瞬间完成，进度会一闪而过：进度条平滑爬升，100% 只在服务端返回后出现
  const creep = setInterval(() => {
    if (progress >= 99.9) return
    if (progress < 90) progress += 4
    else if (progress < 96) progress += 0.8
    else if (progress < 98) progress += 0.3
    else progress += Math.max(0.01, (99.9 - progress) / 20)
    setProgress(Math.min(progress, 99.9))
  }, 100)

  try {
    accessToken = await getAccessToken()
    const { id, tokenKey } = await uploadModel(file, accessToken, (pct) => {
      if (pct > progress) {
        progress = pct
        setProgress(pct)
      }
    })
    clearInterval(creep)
    setProgress(100)
    // 完成态短暂停留，保证进度条肉眼可见
    await new Promise((resolve) => setTimeout(resolve, 400))
    enterPreview(id, tokenKey, file.name)
  } catch (error) {
    clearInterval(creep)
    backToUpload()
    showError(error.message)
  }
}

function setProgress(pct) {
  els.progressFill.style.width = pct + '%'
  // 99 之前显示整数，之后显示两位小数（避免长时间停在 99% 看似卡住）
  els.progressText.textContent = (pct >= 99 ? pct.toFixed(2) : Math.floor(pct)) + '%'
}

// ---------- 预览流程 ----------

function enterPreview(id, tokenKey, filename) {
  phase = 'previewing'
  els.uploadView.hidden = true
  els.previewView.hidden = false
  els.stageTitle.textContent = filename
  els.panelBody.innerHTML = '<p class="panel-loading">模型信息解析中…</p>'

  viewer = new jlcLite3DViewer(els.viewerContainer, { language: 'zh' })
  viewer.onModelStatus((status) => {
    if (status === 'failure') {
      showError('模型加载失败（预览器回报 failure），可重新上传更换文件', true)
    }
  })

  // 关键路径：tokenKey 来自上传响应，直接进预览器（不等 analysisStatus）
  viewer.load(tokenKey).then(({ info }) => {
    if (info) mergeInfo(info)
  })

  // 几何信息后台轮询补充，不阻塞预览展示
  startInfoPolling(id)
}

/** 后台每 3 秒查询一次任务结果，解析结束（analysisStatus !== 0）自动停止 */
function startInfoPolling(id) {
  infoTimer = setInterval(async () => {
    const info = await queryById(id, accessToken)
    if (!info) return
    mergeInfo(info)
    if (info.analysisStatus !== 0) stopInfoPolling()
  }, 3000)
}

function stopInfoPolling() {
  if (infoTimer) {
    clearInterval(infoTimer)
    infoTimer = null
  }
}

/** 合并模型信息：预览器回报与平台查询互相补充，缺字段不覆盖 */
function mergeInfo(info) {
  const rows = [
    ['模型名称', info.modelName],
    ['文件类型', info.fileType],
    ['最小包围盒', info.minBox],
    ['体积', info.volume],
    ['表面积', info.area],
    ['解析消息', info.message],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')

  if (rows.length === 0) return
  els.panelBody.innerHTML =
    '<dl>' +
    rows.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`).join('') +
    '</dl>'
}

/** 防止文件名等内容注入 HTML */
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]))
}

// ---------- 事件绑定 ----------

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0]
  if (file) upload(file)
  els.fileInput.value = '' // 允许重复选择同一个文件
})

// 拖拽上传：dragenter/dragleave 在进入子元素时也会触发，用计数抵消
els.dropzone.addEventListener('dragover', (e) => e.preventDefault()) // 必须 preventDefault，浏览器才允许 drop
els.dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault()
  dragDepth++
  els.dropzone.classList.add('dropzone-active')
})
els.dropzone.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) els.dropzone.classList.remove('dropzone-active')
})
els.dropzone.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  els.dropzone.classList.remove('dropzone-active')
  if (phase === 'uploading') return // 上传进行中禁止再次投递
  const file = e.dataTransfer?.files?.[0]
  if (file) upload(file)
})

els.backHome.addEventListener('click', backToUpload)
els.restartBtn.addEventListener('click', backToUpload)

// ---------- 启动 ----------
renderFormats()
