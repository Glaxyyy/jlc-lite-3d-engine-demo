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
  credAppId: document.getElementById('cred-appid'),
  credSecret: document.getElementById('cred-secret'),
  qrOpenBtn: document.getElementById('qr-open-btn'),
  qrModal: document.getElementById('qr-modal'),
  qrMask: document.getElementById('qr-mask'),
  qrCloseBtn: document.getElementById('qr-close-btn'),
}

// ---------- 运行时状态 ----------
let phase = 'idle' // 'idle' | 'uploading' | 'previewing'
let viewer = null // 当前预览实例（同时至多一个，重建前先 destroy）
let infoTimer = null // 几何信息轮询句柄
let modelData = {} // 当前模型信息聚合（预览器回报 + queryById 轮询两路合并）
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

  // 凭据前置校验（输入框实时输入 > config.local.js > config.js）
  if (!CONFIG.APP_ID || !CONFIG.APP_SECRET) {
    showError('请先填写 AppID 和 Secret（页面顶部输入框，或点击「扫码加群获取」申请）')
    return
  }

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
  // 进度条归零必须在显示进度行【之前】：上一轮可能停在 100%，
  // 若先显示再归零，会看到条从 100% 倒冲回低位的「回退」动画（二轮上传必现）
  lastRenderedPct = 0
  els.progressFill.style.transition = 'none' // 归零不做动画
  els.progressFill.style.width = '0%'
  void els.progressFill.offsetWidth // 强制重排，确保归零立即生效
  els.progressFill.style.transition = '' // 恢复爬升动画
  els.progressLine.hidden = false
  let progress = 0

  // 假进度曲线：四段减速——先快、再慢、更慢，97% 后按两位小数蠕动
  // （逼近 99.4 但永远到不了 100）——100% 只在接口响应完成后出现
  const creep = setInterval(() => {
    if (progress >= 99.4) return
    if (progress < 50) progress += 5 // 先快（~1 秒到 50%）
    else if (progress < 80) progress += 1 // 再慢（~4 秒到 80%）
    else if (progress < 90) progress += 0.167 // 更慢（80→90 用 6 秒）
    else if (progress < 97) progress += 0.0583 // 90→97 用 12 秒
    else progress += Math.max(0.01, (99.4 - progress) / 40) // 97 后两位小数蠕动
    setProgress(Math.min(progress, 99.4))
  }, 100)

  try {
    accessToken = await getAccessToken()
    const { id, tokenKey } = await uploadModel(file, accessToken)
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

// 进度渲染基线：进度条只增不减（两个写入源——平滑爬升定时器与 XHR 回调——
// 存在乱序可能，任何较低值一律不渲染，杜绝「到 100% 又回退」的观感）
let lastRenderedPct = 0

function setProgress(pct) {
  if (pct < lastRenderedPct) {
    // 被单调基线拦下的写入：正常情况不应出现，留痕便于诊断进度回退问题
    console.warn(`[progress] 忽略回退写入 ${pct}%（已渲染 ${lastRenderedPct}%）`)
    return
  }
  lastRenderedPct = pct
  els.progressFill.style.width = pct + '%'
  // 99 之前显示整数，之后显示两位小数（避免长时间停在 99% 看似卡住）
  els.progressText.textContent = (pct >= 97 ? pct.toFixed(2) : Math.floor(pct)) + '%'
}

// ---------- 预览流程 ----------

function enterPreview(id, tokenKey, filename) {
  phase = 'previewing'
  els.uploadView.hidden = true
  els.previewView.hidden = false
  els.stageTitle.textContent = filename
  modelData = { modelName: filename } // 本地文件名兜底，平台返回后覆盖
  els.panelBody.innerHTML = '<p class="panel-loading">模型信息解析中…</p>'

  mountViewer(tokenKey)

  // 几何信息后台轮询补充，不阻塞预览展示
  startInfoPolling(id)
}

/** 挂载预览器实例并发送凭证 */
function mountViewer(tokenKey) {
  els.stageErrorMsg.hidden = true // 清掉上一轮的失败提示
  viewer = new jlcLite3DViewer(els.viewerContainer, { language: 'zh' })
  viewer.onModelStatus((status) => {
    if (status === 'failure') {
      showError('模型加载失败（预览器回报 failure），可重新上传更换文件', true)
    }
  })

  // 关键路径：tokenKey 来自上传响应，直接进预览器（不等 analysisStatus）
  viewer.load(tokenKey).then(({ info }) => {
    if (info) mergeInfo(info)
  }).catch((error) => {
    // 预览器 20s 未就绪（网络不通/被拦截）：给出可操作的提示
    showError(error.message, true)
  })
}

/** 后台每 3 秒查询一次任务结果：以 coverStatus（1 = 封面已生成）判断封面就绪；
 *  封面生成略滞后于模型解析，解析完成后仍轮询直至 coverStatus 就绪，
 *  最多再等 15 轮（45 秒）防止无限轮询 */
function startInfoPolling(id) {
  let polls = 0
  infoTimer = setInterval(async () => {
    polls++
    const info = await queryById(id, accessToken)
    if (!info) return
    mergeInfo(info)
    const analysisDone = info.analysisStatus !== 0
    const coverReady = info.coverStatus === 1
    if (analysisDone && (coverReady || polls > 15)) stopInfoPolling()
  }, 3000)
}

function stopInfoPolling() {
  if (infoTimer) {
    clearInterval(infoTimer)
    infoTimer = null
  }
}

/** 合并模型信息并重渲染面板；两路数据互补，仅填充缺失字段 */
function mergeInfo(info) {
  for (const [key, value] of Object.entries(info)) {
    if (value !== undefined && value !== null && value !== '') {
      modelData[key] = value
    }
  }
  renderInfoPanel()
}

/** 渲染信息面板：封面图置顶 + 名称/徽章 + 分隔线字段行 */
function renderInfoPanel() {
  const d = modelData
  const rows = []
  const add = (label, value, unit) => {
    if (value !== undefined && value !== null && value !== '') {
      rows.push([label, value, unit])
    }
  }
  // 纯数字加千分位（体积/表面积等），非数字（包围盒等）原样
  const fmtNum = (v) =>
    /^\d+(\.\d+)?$/.test(v)
      ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : v

  add('最小包围盒', d.minBox, 'mm')
  add('体积', d.volume !== undefined && d.volume !== null ? fmtNum(String(d.volume)) : undefined, 'mm³')
  add('表面积', d.area !== undefined && d.area !== null ? fmtNum(String(d.area)) : undefined, 'mm²')
  add(
    '处理耗时',
    d.processTime !== undefined && d.processTime !== null && d.processTime !== ''
      ? `${Number(d.processTime).toLocaleString('en-US')} ms` // 整数毫秒，不带小数
      : undefined,
  )
  add('解析消息', d.message)

  // 封面图：cover 与 coverTempUrl 只返回其一，哪个有值用哪个（临时链接 2h 过期）
  const cover = d.cover || d.coverTempUrl
  const coverHtml = cover
    ? `<img class="cover-img" src="${escapeHtml(String(cover))}" alt="模型封面" onerror="this.classList.add('cover-failed')">`
    : '<div class="cover-empty">封面生成中…</div>'

  // 名称 + 类型徽章（模型名称从字段行升级为标题，类型/装配体做成胶囊徽章）
  const badges = []
  if (d.fileType) badges.push(String(d.fileType).toUpperCase())
  if (d.isAssemble === 1) badges.push('装配体')
  const badgeHtml = badges.length
    ? `<div class="field-badges">${badges.map((b) => `<i>${escapeHtml(b)}</i>`).join('')}</div>`
    : ''

  els.panelBody.innerHTML =
    coverHtml +
    `<h4 class="model-name">${escapeHtml(String(d.modelName || ''))}</h4>` +
    badgeHtml +
    rows.map(([label, value, unit]) => {
      const v = escapeHtml(String(value))
      const u = unit ? `<em class="u">${unit}</em>` : ''
      return `<div class="info-row"><span class="k">${label}</span><span class="v">${v} ${u}</span></div>`
    }).join('')
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

// 凭据：输入框默认留空；生效值 = 输入框实时输入，留空则回落到配置文件
// （config.local.js / config.js 已在 CONFIG 中，顺序由脚本加载序保证）
const fileCreds = { appId: CONFIG.APP_ID, secret: CONFIG.APP_SECRET }

/** 按优先级合成生效凭据写回 CONFIG：输入框实时输入 > 配置文件 */
function applyCreds() {
  CONFIG.APP_ID = els.credAppId.value.trim() || fileCreds.appId
  CONFIG.APP_SECRET = els.credSecret.value.trim() || fileCreds.secret
  resetTokenCache() // 凭据变了旧 token 作废
}

els.credAppId.addEventListener('input', applyCreds)
els.credSecret.addEventListener('input', applyCreds)

// 群二维码弹框：按钮 / 遮罩 / × / Esc 均可关闭
els.qrOpenBtn.addEventListener('click', () => { els.qrModal.hidden = false })
els.qrMask.addEventListener('click', () => { els.qrModal.hidden = true })
els.qrCloseBtn.addEventListener('click', () => { els.qrModal.hidden = true })
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') els.qrModal.hidden = true
})

// 凭据输入框的眼睛图标：点击在脱敏（password）与明文（text）间切换
document.querySelectorAll('.cred-eye').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target)
    const reveal = input.type === 'password'
    input.type = reveal ? 'text' : 'password'
    btn.querySelector('.eye-on').hidden = reveal
    btn.querySelector('.eye-off').hidden = !reveal
  })
})

// ---------- 启动 ----------
renderFormats()
// 文件选择器按支持清单过滤（平台按扩展名识别类型，多数格式无标准 MIME，用扩展名声明最准确）
els.fileInput.accept = CONFIG.ACCEPT_EXTS.map((ext) => '.' + ext).join(',')
// 归一化：config 文件里保留的「在此填入…」占位文案视为未填写
if (CONFIG.APP_ID === '在此填入你的AppID') CONFIG.APP_ID = ''
if (CONFIG.APP_SECRET === '在此填入你的AppSecret') CONFIG.APP_SECRET = ''
// 输入框回显配置文件的生效凭据（密码型脱敏展示），避免「配置是否已读取」的误解；
// 手动修改输入框仍会实时覆盖 CONFIG（留空则上传时回落到配置文件）
els.credAppId.value = CONFIG.APP_ID || ''
els.credSecret.value = CONFIG.APP_SECRET || ''
