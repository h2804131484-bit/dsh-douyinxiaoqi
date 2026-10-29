// 大肥鱼·抖音版 —— 给总控台用的 HTTP 接口
// 只开这几条：状态、扫码登录、几个读动作、审批队列。写动作一律走工具（要过权限闸）。

import { catalogView, resolveCapability } from './catalog.js'
import { check } from './policy.js'

export const PREFIX = '/dafeiyu-douyin/api'

function sendJson(res, status, body) {
  try {
    const text = JSON.stringify(body ?? {})
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    res.end(text)
    return true
  } catch {
    try { res.end() } catch {}
    return false
  }
}

function truncate(text, max = 500) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export function createHttpHandler({ store, webServer, douyin }) {
  const configuredOrigin = () => {
    try {
      if (typeof webServer?.getOrigin === 'function') {
        const origin = webServer.getOrigin()
        if (origin) return origin
      }
    } catch {}
    const port = webServer?.port ?? webServer?.getPort?.()
    return port ? `http://127.0.0.1:${port}` : ''
  }
  const requestOrigin = (req) => {
    const host = req.headers.host
    if (!host) return ''
    const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    const proto = forwarded || (req.socket?.encrypted ? 'https' : 'http')
    return `${proto}://${host}`
  }

  function guard(req, res) {
    const origin = req.headers.origin
    const expected = configuredOrigin() || requestOrigin(req)
    if (origin && expected && origin !== expected) {
      sendJson(res, 403, { ok: false, error: '跨源请求被拒绝' })
      return false
    }
    if (req.method !== 'GET' && req.headers['x-dafeiyu'] !== '1') {
      sendJson(res, 403, { ok: false, error: '缺少 x-dafeiyu 请求头' })
      return false
    }
    return true
  }

  async function readBody(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return {}
    }
  }

  async function runRead(cap, args = {}) {
    const id = String(args.id ?? '').trim()
    try {
      switch (cap.action) {
        case 'status': return await douyin.status()
        case 'feed': return await douyin.feed({ limit: args.limit })
        case 'hot': return await douyin.hot({ limit: args.limit })
        case 'search': return await douyin.search({ keyword: args.keyword, limit: args.limit })
        case 'video': return await douyin.video({ id })
        case 'comments': return await douyin.comments({ id, limit: args.limit })
        case 'user': return await douyin.user({ secUid: args.secUid, keyword: args.keyword, limit: args.limit })
        case 'works': return await douyin.works({ limit: args.limit })
        default: return { ok: false, error: `页面里不支持跑 ${cap.action}` }
      }
    } catch (error) {
      return { ok: false, error: truncate(error?.message ?? String(error), 800) }
    }
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (!url.pathname.startsWith(PREFIX)) return sendJson(res, 404, { ok: false, error: 'not found' })
      if (!guard(req, res)) return true
      const sub = url.pathname.slice(PREFIX.length).replace(/\/+$/, '') || '/'
      const method = req.method ?? 'GET'

      if (method === 'GET') {
        if (sub === '/status') {
          const [status] = await Promise.all([douyin ? douyin.status() : null])
          return sendJson(res, 200, {
            ok: true,
            status,
            stats: store.stats(),
            thread: store.threadGet(),
            risk: store.riskGet(),
            login: store.loginGet(),
            policy: store.policyGet(),
            pending: store.pendingList('pending').length,
            catalog: catalogView(),
          })
        }
        if (sub === '/policy') return sendJson(res, 200, { ok: true, policy: store.policyGet() })
        if (sub === '/pending') {
          const status = url.searchParams.get('status') || 'pending'
          return sendJson(res, 200, { ok: true, items: store.pendingList(status) })
        }
        if (sub === '/actions') return sendJson(res, 200, { ok: true, items: store.recentActions(50) })
        if (sub === '/read') {
          const cap = resolveCapability(url.searchParams.get('action') || '')
          if (!cap || cap.kind !== 'read') return sendJson(res, 400, { ok: false, error: '只支持只读动作' })
          const verdict = check(store, cap, {})
          if (verdict.decision !== 'allow') return sendJson(res, 200, { ok: false, error: verdict.reason })
          const data = await runRead(cap, {
            keyword: url.searchParams.get('keyword') || undefined,
            id: url.searchParams.get('id') || undefined,
            limit: Number(url.searchParams.get('limit') || 10),
          })
          return sendJson(res, 200, { ok: data?.ok !== false, data })
        }
        return sendJson(res, 404, { ok: false, error: `未知接口 GET ${sub}` })
      }

      if (method === 'POST') {
        const body = await readBody(req)
        if (sub === '/setup') return sendJson(res, 200, { ok: true, data: await douyin.setup() })
        if (sub === '/open') return sendJson(res, 200, { ok: true, data: await douyin.openBrowser() })
        if (sub === '/close') return sendJson(res, 200, { ok: true, data: await douyin.close() })
        if (sub === '/login/qr') {
          const data = await douyin.loginQr()
          return sendJson(res, 200, { ok: data?.ok !== false, data })
        }
        if (sub === '/login/poll') {
          const key = String(body.key || '')
          if (!key) return sendJson(res, 400, { ok: false, error: '需要 key' })
          const data = await douyin.loginPoll(key)
          if (data?.ok && data.account) store.loginSet({ ok: true, ...data.account })
          return sendJson(res, 200, { ok: data?.ok !== false, data })
        }
        if (sub === '/login/check') {
          const data = await douyin.loginCheck()
          if (data?.ok !== false) store.loginSet({ ok: true, ...data })
          return sendJson(res, 200, { ok: data?.ok !== false, data })
        }
        if (sub === '/logout') {
          const data = await douyin.logout()
          store.loginSet({ ok: false })
          return sendJson(res, 200, { ok: true, data })
        }
        if (sub === '/policy') {
          if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, error: '需要策略片段' })
          return sendJson(res, 200, { ok: true, policy: store.policySet(body) })
        }
        if (sub === '/read') {
          const cap = resolveCapability(body.action || '')
          if (!cap || cap.kind !== 'read') return sendJson(res, 400, { ok: false, error: '只支持只读动作' })
          const verdict = check(store, cap, {})
          if (verdict.decision !== 'allow') return sendJson(res, 200, { ok: false, error: verdict.reason })
          const data = await runRead(cap, body.args ?? {})
          return sendJson(res, 200, { ok: data?.ok !== false, data })
        }
        return sendJson(res, 404, { ok: false, error: `未知接口 POST ${sub}` })
      }

      return sendJson(res, 405, { ok: false, error: 'method not allowed' })
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: truncate(error?.message ?? String(error), 500) })
    }
  }
}
