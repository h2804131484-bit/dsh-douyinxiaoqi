import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { nowIso } from './util.js'

const HOME = 'https://www.douyin.com'
const CREATOR = 'https://creator.douyin.com'
const UA_HINT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonSafe(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shorten(text, max = 120) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

// ---- aweme 归一化 -------------------------------------------------------

function walkAwemes(node, out, seen, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 14 || out.length >= 300) return
  if (Array.isArray(node)) {
    for (const item of node) walkAwemes(item, out, seen, depth + 1)
    return
  }
  const id = node.aweme_id
  if (typeof id === 'string' && id.length >= 10 && (node.author || node.desc !== undefined)) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(node)
    }
    return
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkAwemes(value, out, seen, depth + 1)
  }
}

function normAweme(item) {
  const author = item.author || {}
  const stats = item.statistics || {}
  const video = item.video || {}
  return {
    id: item.aweme_id,
    desc: shorten(item.desc),
    text: String(item.desc || '').trim(),
    url: `${HOME}/video/${item.aweme_id}`,
    createTime: item.create_time || 0,
    duration: video.duration ? Math.round(video.duration / 1000) : 0,
    cover: video.cover?.url_list?.[0] || video.origin_cover?.url_list?.[0] || '',
    author: {
      uid: author.uid || '',
      secUid: author.sec_uid || '',
      nickname: author.nickname || author.unique_id || '',
    },
    stats: {
      digg: stats.digg_count ?? 0,
      comment: stats.comment_count ?? 0,
      collect: stats.collect_count ?? 0,
      share: stats.share_count ?? 0,
      play: stats.play_count ?? 0,
    },
    music: item.music?.title || '',
  }
}

function walkUsers(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 10 || out.length >= 40) return out
  if (Array.isArray(node)) {
    for (const item of node) walkUsers(item, out, depth + 1)
    return out
  }
  if (typeof node.nickname === 'string' && node.nickname
    && typeof node.sec_uid === 'string' && node.sec_uid.length > 8) {
    out.push(node)
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') walkUsers(value, out, depth + 1)
  }
  return out
}

function normUser(user) {
  return {
    uid: user.uid || '',
    secUid: user.sec_uid || '',
    nickname: user.nickname || '',
    uniqueId: user.unique_id || '',
    signature: shorten(user.signature, 200),
    avatar: user.avatar_thumb?.url_list?.[0] || user.avatar_larger?.url_list?.[0] || '',
    follower: user.follower_count ?? null,
    following: user.following_count ?? null,
    totalFavorited: user.total_favorited ?? null,
    awemeCount: user.aweme_count ?? null,
    ipLocation: user.ip_location || '',
  }
}

function pickUser(users) {
  if (!users.length) return null
  const withStats = users.filter((item) => Number.isFinite(item.follower_count))
  const picked = (withStats.length ? withStats : users).sort((a, b) => {
    const score = (u) => Object.keys(u).length
    return score(b) - score(a)
  })[0]
  return normUser(picked)
}

// ---- 主模块 -------------------------------------------------------------

export function createDouyin({ store, rootDir, logger }) {
  const base = path.join(store.stateDir, 'douyin')
  const paths = {
    base,
    profile: path.join(base, 'profile'),
    runtime: path.join(base, 'runtime'),
    cache: path.join(base, '.npm-cache'),
    shots: path.join(base, 'shots'),
    state: path.join(base, 'state.json'),
    logs: path.join(base, 'install.log'),
  }

  let playwright = null
  let contextPromise = null
  let context = null
  let queue = Promise.resolve()
  let loginSession = null
  let publishSession = null

  function ensureDirs() {
    for (const dir of [base, paths.profile, paths.runtime, paths.shots]) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  function config() {
    const merged = store.configGet()?.douyin
    return {
      headless: merged?.headless === true,
      channel: String(merged?.channel || 'chrome'),
      chromePath: String(merged?.chromePath || ''),
      playwrightPath: String(merged?.playwrightPath || ''),
      autoInstall: merged?.autoInstall !== false,
      timeoutMs: Number(merged?.timeoutMs) > 0 ? Number(merged.timeoutMs) : 30000,
    }
  }

  function stateRead() {
    return readJsonSafe(paths.state, {})
  }

  function statePatch(patch) {
    const next = { ...stateRead(), ...patch, updatedAt: nowIso() }
    try { writeJsonSafe(paths.state, next) } catch (error) { logger?.warn?.('dafeiyu: 抖音状态写入失败', error) }
    return next
  }

  // 串行执行：同一个浏览器上下文，多个动作并发会互相抢焦点。
  function serial(task) {
    const run = queue.then(task, task)
    queue = run.catch(() => {})
    return run
  }

  async function loadPlaywright() {
    if (playwright) return playwright
    const cfg = config()
    const candidates = [
      cfg.playwrightPath,
      path.join(paths.runtime, 'node_modules', 'playwright-core'),
      path.join(rootDir, 'vendor', 'node_modules', 'playwright-core'),
    ].filter(Boolean)
    for (const dir of candidates) {
      const entry = path.join(dir, 'index.js')
      if (!fs.existsSync(entry)) continue
      try {
        const mod = await import(pathToFileURL(entry).href)
        // playwright-core 是 CJS：import() 后真正的导出在 default 上。
        playwright = mod?.chromium ? mod : (mod?.default?.chromium ? mod.default : mod)
        return playwright
      } catch (error) {
        logger?.warn?.('dafeiyu: playwright 加载失败', dir, error?.message)
      }
    }
    return null
  }

  function npmBin() {
    const candidates = [
      path.join(path.dirname(process.execPath), 'npm'),
      '/opt/homebrew/bin/npm',
      '/usr/local/bin/npm',
    ]
    for (const item of candidates) {
      try { fs.accessSync(item, fs.constants.X_OK); return item } catch {}
    }
    return 'npm'
  }

  async function installRuntime() {
    ensureDirs()
    const logStream = fs.createWriteStream(paths.logs, { flags: 'a' })
    const bin = npmBin()
    const args = ['install', 'playwright-core@latest', '--no-audit', '--no-fund', '--loglevel=error',
      '--prefix', paths.runtime, '--cache', paths.cache]
    logger?.info?.('dafeiyu: 安装 playwright-core', bin, args.join(' '))
    return new Promise((resolve) => {
      let child
      try {
        child = spawn(bin, args, { cwd: paths.runtime, env: { ...process.env, npm_config_cache: paths.cache } })
      } catch (error) {
        logStream.end(`spawn failed: ${error.message}\n`)
        resolve({ ok: false, error: error.message })
        return
      }
      let tail = ''
      child.stdout.on('data', (chunk) => { logStream.write(chunk); tail = (tail + chunk).slice(-2000) })
      child.stderr.on('data', (chunk) => { logStream.write(chunk); tail = (tail + chunk).slice(-2000) })
      child.on('error', (error) => { logStream.end(`error: ${error.message}\n`); resolve({ ok: false, error: error.message }) })
      child.on('close', (code) => {
        logStream.end(`exit ${code}\n`)
        playwright = null
        resolve({ ok: code === 0, code, tail: shorten(tail, 600) })
      })
    })
  }

  async function ensurePlaywright({ autoInstall = true } = {}) {
    let pw = await loadPlaywright()
    if (pw) return pw
    if (!autoInstall) throw new Error('playwright-core 未安装：先执行 douyin action=setup 安装运行时')
    const result = await installRuntime()
    if (!result.ok) throw new Error(`playwright-core 安装失败：${result.error || result.tail || '未知错误'}`)
    pw = await loadPlaywright()
    if (!pw) throw new Error('playwright-core 装完了但没加载出来，看看 install.log')
    return pw
  }

  async function ensureContext() {
    if (contextPromise) return contextPromise
    contextPromise = (async () => {
      const cfg = config()
      const pw = await ensurePlaywright({ autoInstall: cfg.autoInstall })
      ensureDirs()
      const launchOptions = {
        headless: cfg.headless,
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        acceptDownloads: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-features=Translate,OptimizationHints,MediaRouter',
          `--user-agent=${UA_HINT}`,
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      }
      if (cfg.channel && cfg.channel !== 'chromium') launchOptions.channel = cfg.channel
      else if (cfg.chromePath) launchOptions.executablePath = cfg.chromePath
      const ctx = await pw.chromium.launchPersistentContext(paths.profile, launchOptions)
      await ctx.addInitScript(() => {
        try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }) } catch {}
        try { window.chrome = window.chrome || { runtime: {} } } catch {}
      })
      context = ctx
      ctx.on('close', () => { context = null; contextPromise = null })
      return ctx
    })()
    contextPromise.catch(() => { contextPromise = null })
    return contextPromise
  }

  async function page() {
    const ctx = await ensureContext()
    const pages = ctx.pages().filter((item) => !item.isClosed())
    const reuse = pages.find((item) => item.url().startsWith(HOME) || item.url().startsWith(CREATOR))
    if (reuse) return reuse
    const existing = pages[0]
    if (existing) return existing
    return ctx.newPage()
  }

  async function shot(pageRef, name = 'shot') {
    try {
      ensureDirs()
      const file = path.join(paths.shots, `${name}-${Date.now()}.png`)
      await pageRef.screenshot({ path: file, type: 'png' })
      return file
    } catch {
      return ''
    }
  }

  function dataUrl(buffer, type = 'image/png') {
    return `data:${type};base64,${buffer.toString('base64')}`
  }

  // 收集页面自己发出的 JSON 响应；不逆向签名，让真实页面向抖音要数据。
  function collect(pageRef) {
    const bag = []
    const handler = async (res) => {
      try {
        const url = res.url()
        if (!url.includes('/aweme/v1/web/') && !url.includes('/aweme/v1/')) return
        if (res.status() !== 200) return
        const type = String(res.headers()['content-type'] || '')
        if (!type.includes('json')) return
        const text = await res.text()
        if (text.length > 8 * 1024 * 1024) return
        bag.push({ url, json: JSON.parse(text) })
      } catch {}
    }
    pageRef.on('response', handler)
    return {
      bag,
      stop: () => { try { pageRef.off('response', handler) } catch {} },
      awemes: () => {
        const out = []
        const seen = new Set()
        for (const entry of bag) walkAwemes(entry.json, out, seen)
        return out.map(normAweme)
      },
      users: () => {
        const out = []
        for (const entry of bag) walkUsers(entry.json, out)
        return out
      },
      find: (needle) => bag.filter((entry) => entry.url.includes(needle)),
    }
  }

  async function acceptLoginWall(pageRef) {
    try {
      await pageRef.keyboard.press('Escape')
      await pageRef.waitForTimeout(300)
    } catch {}
  }

  async function cookies() {
    const ctx = await ensureContext()
    try { return await ctx.cookies([HOME, CREATOR]) } catch { return [] }
  }

  function loginCookie(list) {
    const names = new Set(list.map((item) => item.name))
    if (names.has('sessionid') || names.has('sid_tt') || names.has('sessionid_ss')) return true
    return false
  }

  async function readAccount({ allowNav = true } = {}) {
    const pageRef = await page()
    const watch = collect(pageRef)
    try {
      if (allowNav) {
        await pageRef.goto(`${HOME}/user/self`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 15000 })
        await pageRef.waitForTimeout(4000)
        await acceptLoginWall(pageRef)
      }
      let picked = pickUser(watch.users())
      if (!picked) {
        const domName = await pageRef.evaluate(() => {
          const node = document.querySelector('[data-e2e="user-info"] h1, [data-e2e="user-name"], a[href="/user/self"]')
          return node?.textContent?.trim() || ''
        }).catch(() => '')
        if (domName) picked = { uid: '', secUid: '', nickname: domName, uniqueId: '', signature: '', avatar: '', follower: null, following: null, totalFavorited: null, awemeCount: null, ipLocation: '' }
      }
      return picked
    } finally {
      watch.stop()
    }
  }

  return {
    paths,
    config,
    state: stateRead,
    async status() {
      const cfg = config()
      const pw = await loadPlaywright()
      const list = pw ? await cookies() : []
      const loggedIn = list.length ? loginCookie(list) : false
      const saved = stateRead()
      return {
        ok: true,
        installed: Boolean(pw),
        running: Boolean(context),
        loggedIn,
        account: saved.account || null,
        lastLoginAt: saved.lastLoginAt || null,
        lastCheckAt: saved.lastCheckAt || null,
        profileDir: paths.profile,
        runtimeDir: paths.runtime,
        shotsDir: paths.shots,
        chrome: cfg.channel,
        headless: cfg.headless,
        loginSession: loginSession ? { key: loginSession.key, startedAt: loginSession.startedAt, state: loginSession.state } : null,
        publishSession: publishSession ? { title: publishSession.title, videoPath: publishSession.videoPath, startedAt: publishSession.startedAt } : null,
      }
    },
    async setup() {
      const result = await installRuntime()
      const pw = await loadPlaywright()
      return { ok: result.ok && Boolean(pw), installed: Boolean(pw), ...result, logDir: paths.logs }
    },
    async openBrowser() {
      const ctx = await ensureContext()
      const pageRef = await page()
      if (!pageRef.url().startsWith(HOME)) {
        await pageRef.goto(`${HOME}/`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 15000 }).catch(() => {})
      }
      await ctx.pages();
      return { ok: true, url: pageRef.url(), contextPages: ctx.pages().length }
    },
    async close() {
      try { await context?.close() } catch {}
      context = null
      contextPromise = null
      loginSession = null
      publishSession = null
    },

    // ---- 登录 ---------------------------------------------------------

    async loginQr() {
      return serial(async () => {
        const ctx = await ensureContext()
        const list = await ctx.cookies([HOME])
        if (loginCookie(list)) {
          const account = await readAccount().catch(() => null)
          if (account) statePatch({ account, lastLoginAt: nowIso() })
          return { ok: true, loggedIn: true, state: 'ok', account }
        }
        const pageRef = await page()
        if (!pageRef.url().startsWith(HOME)) {
          await pageRef.goto(`${HOME}/`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 15000 })
          await pageRef.waitForTimeout(2500)
        }
        await pageRef.bringToFront().catch(() => {})
        // 抖音首页不一定自动弹面板；先等一会儿，没有就点右上角「登录」。
        let captured = await waitQr(pageRef, 4000)
        if (!captured) {
          const btn = pageRef
            .locator('button:has-text("登录"), [data-e2e="login-button"], span:text-is("登录")')
            .first()
          if (await btn.count()) await btn.click({ timeout: 6000 }).catch(() => {})
          captured = await waitQr(pageRef, 12000)
        }
        if (!captured) {
          await shotCurrent(`qr-failed-${Date.now()}.png`).catch(() => {})
          return { ok: false, error: '没找到登录二维码：抖音可能换了登录面板，截图已存到 shots/，先在浏览器窗口里看看' }
        }
        const key = `dy-${Date.now().toString(36)}`
        loginSession = { key, page: pageRef, startedAt: Date.now(), state: 'waiting', qrAt: Date.now() }
        statePatch({ lastQrAt: nowIso() })
        return {
          ok: true,
          key,
          state: 'waiting',
          qr: dataUrl(captured.png),
          box: captured.box,
          hint: '打开抖音 App → 右上角扫一扫 → 扫这个二维码，然后在手机上确认',
          expiresInSec: 100,
        }
      })
    },

    async loginPoll(key) {
      return serial(async () => {
        const ctx = await ensureContext()
        const list = await ctx.cookies([HOME])
        if (loginCookie(list)) {
          const account = await readAccount().catch(() => null)
          const cookiesOut = list
            .filter((item) => item.domain.includes('douyin.com'))
            .map((item) => ({ name: item.name, value: item.value, domain: item.domain, path: item.path, expires: item.expires }))
          try { writeJsonSafe(path.join(base, 'secrets', 'cookies.json'), { savedAt: nowIso(), cookies: cookiesOut }) } catch {}
          statePatch({ account, lastLoginAt: nowIso(), lastCheckAt: nowIso() })
          const donePage = loginSession?.page
          loginSession = null
          try { await donePage?.close() } catch {}
          return { ok: true, state: 'ok', account, cookieCount: cookiesOut.length }
        }
        if (!loginSession) return { ok: false, state: 'idle', error: '没有正在进行的扫码登录，先点「扫码登录」' }
        if (key && loginSession.key !== key) return { ok: false, state: 'idle', error: '登录会话已经换了一轮，刷新页面再点一次' }
        const pageRef = loginSession.page
        let panelText = ''
        try {
          panelText = await pageRef.evaluate(() => {
            const panel = document.querySelector('[id^="login-full-panel"], [class*="login-panel"]')
            return panel?.textContent || ''
          })
        } catch {}
        if (/扫描成功|扫码成功|请在手机上确认|确认登录/.test(panelText)) {
          loginSession.state = 'scanned'
          return { ok: true, state: 'scanned', hint: '手机上点一下确认就好' }
        }
        if (/二维码.*(失效|过期)|点击刷新/.test(panelText)) {
          loginSession.state = 'expired'
          return { ok: false, state: 'expired', error: '二维码过期了，点「扫码登录」拿一张新的' }
        }
        if (Date.now() - loginSession.qrAt > 110000) {
          loginSession.state = 'expired'
          return { ok: false, state: 'expired', error: '二维码超过两分钟了，重新点「扫码登录」' }
        }
        loginSession.state = 'waiting'
        return { ok: true, state: 'waiting' }
      })
    },

    async loginCheck() {
      return serial(async () => {
        const ctx = await ensureContext()
        const list = await ctx.cookies([HOME])
        const loggedIn = loginCookie(list)
        if (!loggedIn) {
          statePatch({ lastCheckAt: nowIso(), account: null })
          return { ok: true, loggedIn: false, cookieCount: list.length }
        }
        const account = await readAccount().catch(() => null)
        statePatch({ account: account ?? stateRead().account ?? null, lastCheckAt: nowIso() })
        return { ok: true, loggedIn: true, account }
      })
    },

    async logout() {
      return serial(async () => {
        const ctx = await ensureContext()
        try { await ctx.clearCookies() } catch {}
        try { fs.rmSync(path.join(base, 'secrets', 'cookies.json'), { force: true }) } catch {}
        loginSession = null
        statePatch({ account: null, lastLogoutAt: nowIso() })
        return { ok: true, loggedOut: true }
      })
    },

    // ---- 读 -----------------------------------------------------------

    async feed({ limit = 12 } = {}) {
      return serial(async () => {
        const pageRef = await page()
        const watched = collect(pageRef)
        try {
          // 抖音首页（精选）要 8–10 秒才把第一条 multi/aweme/detail 发出来；等短了就是空。
          await pageRef.goto(`${HOME}/jingxuan`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(7000)
          await acceptLoginWall(pageRef)
          let items = watched.awemes()
          for (let i = 0; i < 3 && items.length < limit; i += 1) {
            await pageRef.mouse.wheel(0, 1700).catch(() => {})
            await pageRef.waitForTimeout(2400)
            items = watched.awemes()
          }
          if (!items.length) {
            await pageRef.waitForTimeout(4000)
            items = watched.awemes()
          }
          items = await mergeDom(pageRef, items, limit)
          if (!items.length) {
            items = await pageRef.evaluate(() => {
              const seen = new Set()
              const out = []
              for (const anchor of document.querySelectorAll('a[href*="/video/"]')) {
                const id = (anchor.getAttribute('href') || '').match(/\/video\/(\d+)/)?.[1]
                if (!id || seen.has(id)) continue
                seen.add(id)
                const card = anchor.closest('li, div')
                const text = (card?.textContent || '').replace(/\s+/g, ' ').trim()
                out.push({ id, url: `https://www.douyin.com/video/${id}`, desc: text.slice(0, 120), text, author: {}, stats: {}, cover: '', duration: 0, createTime: 0, music: '' })
              }
              return out
            }).catch(() => [])
          }
          return { ok: true, count: items.length, items: items.slice(0, limit), source: watched.bag.length ? 'api' : 'dom' }
        } finally {
          watched.stop()
        }
      })
    },

    async hot({ limit = 30 } = {}) {
      return serial(async () => {
        const pageRef = await page()
        const watched = collect(pageRef)
        try {
          await pageRef.goto(`${HOME}/hot`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(5000)
          const hit = watched.find('hot/search/list')[0]
          const words = hit?.json?.data?.word_list ?? []
          if (words.length) {
            return {
              ok: true,
              updatedAt: hit?.json?.data?.active_time || '',
              items: words.slice(0, limit).map((item) => ({
                word: item.word || '',
                hot: item.hot_value ?? null,
                label: item.label ?? null,
                url: `https://www.douyin.com/search/${encodeURIComponent(item.word || '')}`,
              })),
              source: 'api',
            }
          }
          const dom = await pageRef.evaluate(() => [...document.querySelectorAll('[data-e2e="hot-list"] li, .hot-list li')]
            .map((item) => (item.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean).slice(0, 40)).catch(() => [])
          return { ok: dom.length > 0, items: dom.map((word) => ({ word })), source: 'dom' }
        } finally {
          watched.stop()
        }
      })
    },

    async search({ keyword, limit = 12 } = {}) {
      const word = String(keyword || '').trim()
      if (!word) return { ok: false, error: '缺 keyword' }
      return serial(async () => {
        const pageRef = await page()
        const watched = collect(pageRef)
        try {
          // 直接拼 /search/ 会被抖音判成爬虫（标题「验证码中间页」），必须在页面里点搜索框真打字。
          await pageRef.goto(`${HOME}/jingxuan`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(3500)
          await acceptLoginWall(pageRef)
          const box = pageRef.locator('input[data-e2e="searchbar-input"], input[placeholder*="搜索"]').first()
          let typed = false
          try {
            await box.click({ timeout: 6000 })
            await box.fill(word)
            await box.press('Enter')
            typed = true
          } catch {}
          if (!typed) {
            await pageRef.goto(`${HOME}/search/${encodeURIComponent(word)}?type=video`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          }
          await pageRef.waitForTimeout(6500)
          await acceptLoginWall(pageRef)
          let items = watched.awemes()
          for (let i = 0; i < 2 && items.length < limit; i += 1) {
            await pageRef.mouse.wheel(0, 1600).catch(() => {})
            await pageRef.waitForTimeout(2400)
            items = watched.awemes()
          }
          if (!items.length) {
            await pageRef.waitForTimeout(4000)
            items = watched.awemes()
          }
          items = await mergeDom(pageRef, items, limit)
          const title = await pageRef.title().catch(() => '')
          return { ok: true, keyword: word, count: items.length, items: items.slice(0, limit), pageTitle: title }
        } finally {
          watched.stop()
        }
      })
    },

    async video({ id } = {}) {
      const awemeId = String(id || '').trim()
      if (!/^\d{8,}$/.test(awemeId)) return { ok: false, error: '缺合法的作品 id（纯数字）' }
      return serial(async () => {
        const pageRef = await page()
        const watched = collect(pageRef)
        try {
          await pageRef.goto(`${HOME}/video/${awemeId}`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(5000)
          const items = watched.awemes()
          const main = items.find((item) => item.id === awemeId) || items[0] || null
          const comments = extractComments(watched, 10)
          const title = await pageRef.title().catch(() => '')
          return { ok: true, pageTitle: title, video: main, comments, url: pageRef.url() }
        } finally {
          watched.stop()
        }
      })
    },

    async comments({ id, limit = 20 } = {}) {
      const awemeId = String(id || '').trim()
      if (!/^\d{8,}$/.test(awemeId)) return { ok: false, error: '缺合法的作品 id（纯数字）' }
      return serial(async () => {
        const pageRef = await page()
        const watched = collect(pageRef)
        try {
          await pageRef.goto(`${HOME}/video/${awemeId}`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(5000)
          await acceptLoginWall(pageRef)
          let list = extractComments(watched, limit)
          if (list.length < limit) {
            await pageRef.mouse.wheel(0, 900).catch(() => {})
            await pageRef.waitForTimeout(2000)
            list = extractComments(watched, limit)
          }
          return { ok: true, id: awemeId, count: list.length, comments: list }
        } finally {
          watched.stop()
        }
      })
    },

    async user({ secUid, keyword, limit = 12 } = {}) {
      let target = String(secUid || '').trim()
      return serial(async () => {
        const pageRef = await page()
        if (!target && keyword) {
          const watched = collect(pageRef)
          try {
            await pageRef.goto(`${HOME}/search/${encodeURIComponent(String(keyword))}?type=user`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
            await pageRef.waitForTimeout(5500)
            const users = watched.users().map(normUser)
            return { ok: users.length > 0, keyword: String(keyword), users: users.slice(0, 10) }
          } finally {
            watched.stop()
          }
        }
        if (!target) return { ok: false, error: '缺 secUid 或 keyword' }
        const watched = collect(pageRef)
        try {
          await pageRef.goto(`${HOME}/user/${encodeURIComponent(target)}`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(7000)
          let profile = pickUser(watched.users())
          let works = watched.awemes()
          for (let i = 0; i < 2 && works.length < limit; i += 1) {
            await pageRef.mouse.wheel(0, 1600).catch(() => {})
            await pageRef.waitForTimeout(2400)
            works = watched.awemes()
            profile = profile || pickUser(watched.users())
          }
          if (!works.length && !profile) {
            await pageRef.waitForTimeout(4000)
            works = watched.awemes()
            profile = pickUser(watched.users())
          }
          works = await mergeDom(pageRef, works, limit)
          return { ok: true, secUid: target, profile, works: works.slice(0, limit) }
        } finally {
          watched.stop()
        }
      })
    },

    async shotCurrent(name = 'current') {
      const pageRef = await page()
      const file = await shot(pageRef, name)
      return { ok: Boolean(file), file, url: pageRef.url() }
    },

    // ---- 写（都要过权限闸，调用方负责审批） -----------------------------

    async like({ id } = {}) {
      const awemeId = String(id || '').trim()
      if (!/^\d{8,}$/.test(awemeId)) return { ok: false, error: '缺合法的作品 id（纯数字）' }
      return serial(() => tapAction({ pageRef: null, getPage: page, url: `${HOME}/video/${awemeId}`, kind: 'like', logger }))
    },

    async collect({ id } = {}) {
      const awemeId = String(id || '').trim()
      if (!/^\d{8,}$/.test(awemeId)) return { ok: false, error: '缺合法的作品 id（纯数字）' }
      return serial(() => tapAction({ getPage: page, url: `${HOME}/video/${awemeId}`, kind: 'collect', logger }))
    },

    async follow({ secUid, nickname } = {}) {
      const target = String(secUid || '').trim()
      if (!target && !nickname) return { ok: false, error: '缺 secUid 或 nickname' }
      const url = target
        ? `${HOME}/user/${encodeURIComponent(target)}`
        : `${HOME}/search/${encodeURIComponent(String(nickname))}?type=user`
      return serial(() => tapAction({ getPage: page, url, kind: 'follow', logger }))
    },

    async comment({ id, text } = {}) {
      const awemeId = String(id || '').trim()
      const body = String(text || '').trim()
      if (!/^\d{8,}$/.test(awemeId)) return { ok: false, error: '缺合法的作品 id（纯数字）' }
      if (!body) return { ok: false, error: '评论内容不能为空' }
      if (body.length > 200) return { ok: false, error: '评论太长了，抖音限 200 字以内' }
      return serial(async () => {
        const pageRef = await page()
        try {
          await pageRef.goto(`${HOME}/video/${awemeId}`, { waitUntil: 'domcontentloaded', timeout: config().timeoutMs + 20000 })
          await pageRef.waitForTimeout(4500)
          await acceptLoginWall(pageRef)
          const box = await firstVisible(pageRef, [
            '.comment-input-inner-container',
            '[class*="comment-input"]',
            '[data-e2e="comment-input"]',
            'div[contenteditable="true"]',
            'textarea[placeholder*="评论"]',
          ])
          if (!box) return { ok: false, error: '没找到评论输入框（可能没登录，或页面结构变了）' }
          await box.click()
          await pageRef.waitForTimeout(500)
          await pageRef.click('.comment-input-inner-container').catch(() => {})
          await pageRef.keyboard.type(body, { delay: 40 })
          await pageRef.waitForTimeout(400)
          await pageRef.keyboard.press('Enter')
          let visible = false
          for (let i = 0; i < 10 && !visible; i += 1) {
            await pageRef.waitForTimeout(700)
            visible = await pageRef.evaluate((needle) => document.body.innerText.includes(needle), body.slice(0, 20)).catch(() => false)
          }
          return { ok: visible, id: awemeId, text: body, confirmed: visible, note: visible ? '评论已经出现在评论区' : '点了发送，但没在页面上确认到，可能还在审核' }
        } finally {
          await pageRef.waitForTimeout(300)
        }
      })
    },

    async publishPrepare({ videoPath, title, desc = '', tags = [], cover = '' } = {}) {
      const file = String(videoPath || '').trim()
      if (!file || !fs.existsSync(file)) return { ok: false, error: `找不到视频文件：${file || '（空）'}` }
      const stat = fs.statSync(file)
      if (!stat.isFile()) return { ok: false, error: 'videoPath 不是文件' }
      if (!/\.(mp4|mov|webm|mkv|avi|flv)$/i.test(file)) return { ok: false, error: '抖音只吃常见视频格式：mp4/mov/webm/mkv/avi/flv' }
      const headline = String(title || '').trim().slice(0, 30)
      const body = String(desc || '').trim()
      const tagList = (Array.isArray(tags) ? tags : String(tags || '').split(/[,，\s#]+/)).map((item) => String(item).trim().replace(/^#/, '')).filter(Boolean).slice(0, 5)
      return serial(async () => {
        const pageRef = await page()
        try {
          await pageRef.goto(`${CREATOR}/creator-micro/content/upload`, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await pageRef.waitForTimeout(3500)
          if (/login/i.test(pageRef.url()) || /扫码登录|登录后发布|手机号登录/.test(await pageRef.evaluate(() => document.body.innerText).catch(() => ''))) {
            return { ok: false, needsLogin: true, error: '抖音创作服务平台还没登录，先登录一次（登录态会存在同一个浏览器里）' }
          }
          const input = await firstVisible(pageRef, ['input[type="file"]'], { visible: false })
          if (!input) return { ok: false, error: '没找到上传入口（页面结构变了？）' }
          await input.setInputFiles(file)
          await pageRef.waitForTimeout(2500)
          const titleBox = await waitFor(pageRef, ['input[placeholder*="标题"]', 'input[placeholder*="作品标题"]'], 120000)
          if (!titleBox) {
            return { ok: false, error: '视频传上去了，但没等到发布编辑页（可能在转码/审核），过一会儿再点一次', stage: 'editor' }
          }
          await titleBox.click()
          await pageRef.keyboard.type(headline, { delay: 20 })
          const descBox = await firstVisible(pageRef, ['div[contenteditable="true"]', 'textarea[placeholder*="简介"]', '[data-e2e="video-desc"]'])
          if (descBox && (body || tagList.length)) {
            await descBox.click()
            if (body) await pageRef.keyboard.type(body, { delay: 25 })
            for (const tag of tagList) {
              await pageRef.keyboard.type(` #${tag}`, { delay: 30 })
              await pageRef.waitForTimeout(500)
              await pageRef.keyboard.press('Space')
              await pageRef.waitForTimeout(400)
            }
          }
          if (cover && fs.existsSync(cover)) {
            try {
              const coverInput = await firstVisible(pageRef, ['input[type="file"][accept*="image"]'], { visible: false })
              if (coverInput) await coverInput.setInputFiles(cover)
            } catch {}
          }
          await pageRef.waitForTimeout(1500)
          const ready = await pageRef.evaluate(() => {
            const buttons = [...document.querySelectorAll('button')]
            const target = buttons.find((btn) => /^发布$/.test((btn.textContent || '').trim()))
            if (!target) return { found: false }
            return { found: true, disabled: target.disabled || target.getAttribute('aria-disabled') === 'true' }
          }).catch(() => ({ found: false }))
          const file2 = await shot(pageRef, 'publish-prepare')
          publishSession = { page: pageRef, videoPath: file, title: headline, startedAt: Date.now() }
          return {
            ok: true,
            stage: 'ready_to_publish',
            ready: ready.found && !ready.disabled,
            url: pageRef.url(),
            title: headline,
            desc: body,
            tags: tagList,
            screenshot: file2,
            note: ready.disabled ? '「发布」按钮现在还是灰的，等它亮（视频还在转码）' : '内容都填好了，点「确认发布」才会真的发出去',
          }
        } catch (error) {
          return { ok: false, error: `发布准备失败：${error?.message || error}` }
        }
      })
    },

    async publishCommit({ note = '' } = {}) {
      return serial(async () => {
        if (!publishSession) return { ok: false, error: '没有待发布的稿件，先 publish_prepare' }
        const pageRef = publishSession.page
        try {
          const btn = await waitFor(pageRef, ['button:has-text("发布")'], 20000)
          if (!btn) return { ok: false, error: '没找到「发布」按钮' }
          const disabled = await btn.evaluate((el) => el.disabled || el.getAttribute('aria-disabled') === 'true').catch(() => false)
          if (disabled) return { ok: false, error: '「发布」还是灰的：视频没转码完，等一会儿再确认' }
          await btn.click()
          let confirmed = false
          for (let i = 0; i < 25 && !confirmed; i += 1) {
            await pageRef.waitForTimeout(1200)
            const text = await pageRef.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '')
            if (/发布成功|已发布|作品审核中/.test(text) || /content\/manage/.test(pageRef.url())) confirmed = true
          }
          const file = await shot(pageRef, 'publish-commit')
          const title = publishSession.title
          publishSession = null
          statePatch({ lastPublishAt: nowIso(), lastPublishTitle: title })
          return { ok: confirmed, confirmed, title, screenshot: file, note: confirmed ? `《${title}》发布成功` : '点了发布但没确认到成功提示，去创作服务平台的作品管理看一眼' }
        } catch (error) {
          return { ok: false, error: `发布失败：${error?.message || error}` }
        }
      })
    },

    async works({ limit = 10 } = {}) {
      return serial(async () => {
        const pageRef = await page()
        try {
          await pageRef.goto(`${CREATOR}/creator-micro/content/manage`, { waitUntil: 'domcontentloaded', timeout: 60000 })
          await pageRef.waitForTimeout(5000)
          if (/login/i.test(pageRef.url())) return { ok: false, needsLogin: true, error: '创作服务平台没登录' }
          const rows = await pageRef.evaluate((max) => {
            const items = [...document.querySelectorAll('tr, [class*="content-card"], [class*="video-card"]')]
            const out = []
            for (const item of items) {
              const text = (item.textContent || '').replace(/\s+/g, ' ').trim()
              if (!text || text.length < 6) continue
              const nums = text.match(/(\d[\d,.]*[万亿]?)/g) || []
              out.push({ text: text.slice(0, 160), numbers: nums.slice(0, 6) })
              if (out.length >= max) break
            }
            return out
          }, limit).catch(() => [])
          // 空列表不是故障：这个号本来就没作品时 rows 就是 0 条。
          return { ok: true, count: rows.length, works: rows, note: rows.length ? undefined : '这个号还没有作品，或者作品管理页结构变了' }
        } finally {}
      })
    },
  }
}

// ---- 页面工具（模块级） --------------------------------------------------

// 未登录时抖音会把 aweme/post 这类接口返回成空 body，只能退回去读 DOM 上的卡片链接。
async function domAwemes(pageRef, limit = 20) {
  try {
    const rows = await pageRef.evaluate(() => [...document.querySelectorAll('a[href*="/video/"]')].map((a) => {
      const m = (a.getAttribute('href') || '').match(/\/video\/(\d{6,})/)
      const card = a.closest('li, div[data-e2e], article') || a
      const text = (card.textContent || a.textContent || '').replace(/\s+/g, ' ').trim()
      const img = card.querySelector('img')
      return {
        id: m ? m[1] : '',
        desc: text.slice(0, 140),
        cover: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
        author: (card.querySelector('[data-e2e="video-author"]')?.textContent || '').trim(),
      }
    }))
    const seen = new Set()
    const out = []
    for (const row of rows) {
      if (!row.id || seen.has(row.id)) continue
      seen.add(row.id)
      out.push({
        id: row.id,
        desc: row.desc,
        text: row.desc,
        url: `https://www.douyin.com/video/${row.id}`,
        cover: row.cover,
        author: { nickname: row.author },
        stats: {},
        source: 'dom',
      })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}

// 读结果统一收口：接口拿不到就补 DOM。
async function mergeDom(pageRef, items, limit) {
  if (items && items.length) return items.slice(0, limit)
  return domAwemes(pageRef, limit)
}


async function firstVisible(pageRef, selectors, { visible = true } = {}) {
  for (const selector of selectors) {
    try {
      const locator = pageRef.locator(selector)
      const total = await locator.count().catch(() => 0)
      if (!total) continue
      if (!visible) return locator.first()
      // 同一个 data-e2e 在页面里可能出现两份（一份隐藏的占位），逐个看可见性。
      for (let i = 0; i < Math.min(total, 6); i += 1) {
        const one = locator.nth(i)
        if (await one.isVisible().catch(() => false)) return one
      }
    } catch {}
  }
  return null
}

async function waitFor(pageRef, selectors, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = await firstVisible(pageRef, selectors, { visible: false })
    if (found) return found
    await sleep(800)
  }
  return null
}

async function waitQr(pageRef, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const shot = await captureQr(pageRef)
    if (shot) return shot
    await sleep(400)
  }
  return null
}

async function captureQr(pageRef) {
  const handle = await pageRef.evaluateHandle(() => {
    const ranked = []
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || ''
      if (!src.startsWith('data:image')) continue
      const rect = img.getBoundingClientRect()
      if (rect.width < 110 || rect.height < 110) continue
      ranked.push({ img, area: rect.width * rect.height })
    }
    ranked.sort((a, b) => b.area - a.area)
    return ranked[0]?.img || null
  })
  const element = handle.asElement()
  if (!element) return null
  const box = await element.boundingBox().catch(() => null)
  const png = await element.screenshot({ type: 'png' })
  return { png, box }
}

function extractComments(watched, limit = 20) {
  const hits = watched.find('comment/list')
  const out = []
  const seen = new Set()
  for (const hit of hits) {
    const list = hit?.json?.comments ?? []
    for (const item of list) {
      const cid = String(item.cid || '')
      if (!cid || seen.has(cid)) continue
      seen.add(cid)
      out.push({
        cid,
        text: shorten(item.text, 200),
        digg: item.digg_count ?? 0,
        replyCount: item.reply_comment_total ?? 0,
        createTime: item.create_time || 0,
        user: { uid: item.user?.uid || '', secUid: item.user?.sec_uid || '', nickname: item.user?.nickname || '' },
      })
      if (out.length >= limit) return out
    }
  }
  return out
}

const ACTION_CANDIDATES = {
  like: ['[data-e2e="video-player-digg"]', '[data-e2e="video-like-icon-container"]', '[aria-label*="点赞"]', '[aria-label*="赞"]'],
  collect: ['[data-e2e="video-player-collect"]', '[data-e2e="video-collect-icon-container"]', '[aria-label*="收藏"]'],
  follow: ['[data-e2e="user-info-follow-btn"]', '[data-e2e="user-follow"]', '[data-e2e="follow-button"]', '[aria-label*="关注"]'],
}

// 抖音 PC 端这版的点赞/评论/收藏按钮既没有 data-e2e 也没有 aria-label，class 全是构建 hash。
// 唯一稳定的是「分享」按钮带 data-e2e="video-share-icon-container"，它和点赞是操作条里的兄弟节点。
// 所以按「分享所在那一行的第 N 个可见子节点」定位：0 点赞 / 1 评论 / 2 收藏 / 3 分享。
const BAR_INDEX = { like: 0, comment: 1, collect: 2, share: 3 }

function barKidsScript(idx) {
  const share = document.querySelector('[data-e2e="video-share-icon-container"]')
  if (!share) return null
  let row = share.parentElement
  for (let up = 0; up < 3 && row; up += 1) {
    const kids = [...row.children].filter((el) => {
      const b = el.getBoundingClientRect()
      return b.height >= 28 && b.height <= 90 && b.width >= 28 && b.width <= 150
    })
    if (kids.length >= 3) return idx === undefined ? kids : kids[idx] || null
    row = row.parentElement
  }
  return null
}

async function waitVideoBar(pageRef, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await pageRef
      .evaluate(() => !!document.querySelector('[data-e2e="video-share-icon-container"]'))
      .catch(() => false)
    if (ready) return true
    await pageRef.waitForTimeout(500)
  }
  return false
}

async function resolveBarItem(pageRef, kind) {
  const index = BAR_INDEX[kind]
  if (index === undefined) return null
  const handle = await pageRef.evaluateHandle(barKidsScript, index).catch(() => null)
  const el = handle?.asElement ? handle.asElement() : null
  if (!el) return null
  const box = await el.boundingBox().catch(() => null)
  return box ? el : null
}

async function tapAction({ getPage, url, kind, logger }) {
  const pageRef = await getPage()
  try {
    // 数字会漂（全网都在点），所以不看数字，看接口里的「我到底点没点」：
    // like → user_digged，collect → collect_stat。这两个字段要重新请求 /aweme/v1/web/aweme/detail/ 才有。
    const bag = { state: null }
    const onResp = async (res) => {
      if (!/aweme\/detail/.test(res.url())) return
      try {
        const json = await res.json()
        const item = json.aweme_detail || (json.aweme_details || [])[0]
        if (!item) return
        bag.state = {
          id: String(item.aweme_id),
          digged: Number(item.user_digged || 0),
          collected: Number(item.collect_stat || 0) || Number(item.user_collect || 0),
          digg: item.statistics?.digg_count,
          collect: item.statistics?.collect_count,
        }
      } catch {}
    }
    pageRef.on('response', onResp)
    const waitState = async (ms = 15000) => {
      const deadline = Date.now() + ms
      while (!bag.state && Date.now() < deadline) await pageRef.waitForTimeout(250)
      const got = bag.state
      bag.state = null
      return got
    }

    await pageRef.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await waitVideoBar(pageRef, 20000)
    await pageRef.keyboard.press('Escape').catch(() => {})
    const before = await waitState(8000)

    let target = await firstVisible(pageRef, ACTION_CANDIDATES[kind] || [])
    let how = 'selector'
    if (!target) {
      target = await resolveBarItem(pageRef, kind)
      how = 'bar-index'
    }
    if (!target) {
      pageRef.off('response', onResp)
      return { ok: false, error: `没找到「${kind}」按钮：操作条没渲染出来，或者页面结构换了`, kind }
    }
    await target.click({ timeout: 8000 }).catch(async () => {
      await target.click({ timeout: 8000, force: true })
    })
    // 服务端要一两秒才落库，读太早会读到旧值；读不到变化就再刷一次。
    await pageRef.waitForTimeout(4000)
    await pageRef.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await waitVideoBar(pageRef, 20000)
    let after = await waitState(15000)
    const probeKey = kind === 'like' ? 'digged' : kind === 'collect' ? 'collected' : null
    if (probeKey && before && after && before[probeKey] === after[probeKey]) {
      await pageRef.waitForTimeout(2500)
      await pageRef.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await waitVideoBar(pageRef, 20000)
      after = (await waitState(15000)) || after
    }
    pageRef.off('response', onResp)

    if (kind === 'follow') {
      // 关注按钮没有接口字段，退回到看按钮自己的文案。
      const label = await pageRef
        .evaluate(() => {
          const btn = document.querySelector('[data-e2e="user-info-follow-btn"]')
          return btn ? (btn.innerText || '').replace(/\s+/g, ' ').trim() : ''
        })
        .catch(() => '')
      const followed = /已关注|相互关注/.test(label || (await pageRef.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '')))
      logger?.info?.('dafeiyu: 抖音动作', kind, { how, followed })
      return { ok: true, kind, how, followed, note: followed ? '按钮已经是「已关注」' : '点了，但没读到「已关注」文案，去主页确认一下' }
    }

    const key = kind === 'like' ? 'digged' : 'collected'
    const beforeVal = before ? before[key] : null
    const afterVal = after ? after[key] : null
    const on = afterVal === 1
    const changed = beforeVal !== null && afterVal !== null && beforeVal !== afterVal
    logger?.info?.('dafeiyu: 抖音动作', kind, { how, before, after, changed, on })
    return {
      ok: true,
      kind,
      how,
      on,
      changed,
      before,
      after,
      note: afterVal === null
        ? '点了，但没抓到接口状态，去页面上确认一下'
        : on
          ? '已经点上了（接口里 ' + key + '=1）'
          : '现在是取消状态（接口里 ' + key + '=0）',
    }
  } catch (error) {
    return { ok: false, error: `${kind} 失败：${error?.message || error}` }
  }
}
