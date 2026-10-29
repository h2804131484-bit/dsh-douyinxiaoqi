// 抖音-我才不是魔丸鱼（小七） —— 给总控台用的 HTTP 接口
// 只开这几条：状态、扫码登录、几个读动作、审批队列。写动作一律走工具（要过权限闸）。

import { catalogView, resolveCapability } from './catalog.js'
import { check } from './policy.js'
import { buildPulse } from './prompt.js'

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

export function createHttpHandler({ store, webServer, douyin, heartbeat = null }) {
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
        case 'state': return await douyin.watchState()
        case 'play': return await douyin.play()
        case 'pause': return await douyin.pause()
        case 'next': return await douyin.next()
        case 'previous': return await douyin.previous()
        case 'observe': return await douyin.observe({ seconds: Number(args.seconds ?? 3) })
        case 'im_list': return await douyin.imList({ limit: args.limit })
        case 'im_read': return await douyin.imRead({ name: String(args.name ?? ''), index: Number(args.index ?? 0), limit: args.limit })
        case 'watch_status': return store.watchQuota()
        case 'report': return store.reportBuild(args.day)
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
          const policy = store.policyGet()
          return sendJson(res, 200, {
            ok: true,
            status: douyin ? await douyin.status() : null,
            stats: store.stats(),
            thread: store.threadGet(),
            risk: store.riskGet(),
            login: store.loginGet(),
            policy,
            pending: store.pendingList({ status: 'pending' }).length,
            catalog: catalogView(),
            emotion: store.emotionGet(),
            boredom: store.boredomView(policy),
            satisfaction: store.satisfactionView(policy),
            learning: store.learningView(),
            heartbeat: heartbeat ? heartbeat.status() : null,
            docs: store.listDocs().map((doc) => ({ name: doc.name, summary: doc.summary, lines: doc.lines, bytes: doc.bytes })),
          })
        }
        if (sub === '/tick') return sendJson(res, 200, { ok: true, pulse: buildPulse(store) })
        if (sub === '/docs') return sendJson(res, 200, { ok: true, docs: store.listDocs() })
        if (sub === '/doc') {
          const name = url.searchParams.get('name') || ''
          if (!name) return sendJson(res, 400, { ok: false, error: '需要 name' })
          return sendJson(res, 200, { ok: true, name, body: store.readDoc(name), info: store.docInfo(name) })
        }
        if (sub === '/memory') {
          const policy = store.policyGet()
          return sendJson(res, 200, {
            ok: true,
            core: store.coreRaw(),
            recent: store.recentShort(20),
            emotion: store.emotionGet(),
            boredom: store.boredomView(policy),
            satisfaction: store.satisfactionView(policy),
            learning: store.learningView(),
          })
        }
        if (sub === '/relations') {
          const relations = store.relationList()
          return sendJson(res, 200, { ok: true, relations, count: relations.length })
        }
        if (sub === '/relation') {
          const uid = url.searchParams.get('uid') || ''
          if (!uid) return sendJson(res, 400, { ok: false, error: '需要 uid' })
          const relation = store.relationGet(uid)
          return sendJson(res, 200, { ok: true, relation: { ...relation, name: relation.meta?.name ?? relation.uid } })
        }
        if (sub === '/plan') return sendJson(res, 200, { ok: true, plan: store.readDoc('plan'), progress: store.readDoc('progress') })
        if (sub === '/ledger') return sendJson(res, 200, { ok: true, items: store.recentActions(80) })
        if (sub === '/policy') return sendJson(res, 200, { ok: true, policy: store.policyGet() })
        if (sub === '/pending') {
          const status = url.searchParams.get('status') || 'pending'
          return sendJson(res, 200, { ok: true, items: store.pendingList({ status }) })
        }
        if (sub === '/actions') return sendJson(res, 200, { ok: true, items: store.recentActions(50) })
        if (sub === '/watch') {
          return sendJson(res, 200, {
            ok: true,
            quota: store.watchQuota(),
            recent: store.watchRecent(40),
            interests: store.interestList(12),
          })
        }
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
        if (sub === '/report') return sendJson(res, 200, { ok: true, data: store.reportBuild(body.day ? String(body.day) : undefined) })
        if (sub === '/policy') {
          if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, error: '需要策略片段' })
          return sendJson(res, 200, { ok: true, policy: store.policySet(body) })
        }
        if (!douyin && sub !== '/policy' && sub !== '/doc' && sub !== '/memory' && sub !== '/relation' && sub !== '/plan' && sub !== '/pending/decide' && sub !== '/heartbeat') {
          return sendJson(res, 200, { ok: false, error: '抖音模块没加载' })
        }
        if (sub === '/doctor') {
          if (!douyin) return sendJson(res, 200, { ok: false, error: '抖音模块没加载' })
          return sendJson(res, 200, { ok: true, data: await douyin.doctor({ repair: body.repair === true }) })
        }
        if (sub === '/read') {
          const cap = resolveCapability(body.action || '')
          if (!cap || cap.kind !== 'read') return sendJson(res, 400, { ok: false, error: '只支持只读动作' })
          const verdict = check(store, cap, {})
          if (verdict.decision !== 'allow') return sendJson(res, 200, { ok: false, error: verdict.reason })
          const data = await runRead(cap, body.args ?? {})
          return sendJson(res, 200, { ok: data?.ok !== false, data })
        }
        if (sub === '/doc') {
          const name = String(body.name || '')
          const content = String(body.content ?? '')
          if (!name || !content.trim()) return sendJson(res, 400, { ok: false, error: '需要 name 和 content' })
          store.writeDoc(name, content)
          return sendJson(res, 200, { ok: true, info: store.docInfo(name) })
        }
        if (sub === '/memory') {
          const action = String(body.action || '')
          if (action === 'mood') {
            const mood = String(body.mood || '').trim()
            if (!mood) return sendJson(res, 400, { ok: false, error: '需要 mood' })
            return sendJson(res, 200, { ok: true, emotion: store.emotionSet({ mood, energy: Number(body.energy ?? 60), note: String(body.note || '') }) })
          }
          if (action === 'core_add') {
            const text = String(body.text || '').trim()
            if (!text) return sendJson(res, 400, { ok: false, error: '需要 text' })
            store.coreAdd(text)
            return sendJson(res, 200, { ok: true, core: store.coreRaw() })
          }
          if (action === 'boredom_reset') return sendJson(res, 200, { ok: true, boredom: store.boredomReset(body.group ? String(body.group) : undefined) })
          if (action === 'satisfaction_reset') return sendJson(res, 200, { ok: true, satisfaction: store.satisfactionView(store.policyGet()) })
          return sendJson(res, 400, { ok: false, error: `未知 memory action ${action}` })
        }
        if (sub === '/relation') {
          const uid = String(body.uid || '').trim()
          if (!uid) return sendJson(res, 400, { ok: false, error: '需要 uid' })
          const meta = store.relationNote({
            uid,
            name: body.name,
            impression: body.impression,
            event: body.event,
            tags: body.tags,
            closenessDelta: Number(body.closeness ?? 0),
          })
          return sendJson(res, 200, { ok: true, relation: meta })
        }
        if (sub === '/plan') {
          const content = String(body.content ?? '')
          if (!content.trim()) return sendJson(res, 400, { ok: false, error: '需要 content' })
          store.writeDoc('plan', content)
          return sendJson(res, 200, { ok: true, plan: store.readDoc('plan') })
        }
        if (sub === '/pending/decide') {
          const id = String(body.id || '')
          const decision = String(body.decision || '')
          const mapped = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : ''
          if (!id || !mapped) return sendJson(res, 400, { ok: false, error: '需要 id 和 decision(approve|reject)' })
          const result = store.pendingDecide(id, mapped, String(body.note || '人类在总控台操作'))
          return sendJson(res, 200, result?.ok ? { ok: true, item: result.pending } : { ok: false, error: result?.error || '没有这条审批' })
        }
        if (sub === '/heartbeat') {
          if (!heartbeat) return sendJson(res, 200, { ok: false, error: '心跳没装好' })
          if (body.action === 'run') return sendJson(res, 200, { ok: true, result: await heartbeat.runNow('manual') })
          if (body.action === 'config') {
            const patch = body.config && typeof body.config === 'object' ? body.config : {}
            const config = store.configSet({ heartbeat: patch })
            heartbeat.reload?.()
            return sendJson(res, 200, { ok: true, heartbeat: config.heartbeat, status: heartbeat.status() })
          }
          return sendJson(res, 200, { ok: true, status: heartbeat.status() })
        }
        return sendJson(res, 404, { ok: false, error: `未知接口 POST ${sub}` })
      }

      return sendJson(res, 405, { ok: false, error: 'method not allowed' })
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: truncate(error?.message ?? String(error), 500) })
    }
  }
}
