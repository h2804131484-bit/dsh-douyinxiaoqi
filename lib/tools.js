// 大肥鱼·抖音版 —— 工具注册
// 给 agent 三件东西：干活的手（dafeiyu_douyin）、看闸门（pending）、看线程（thread）。

import { catalogView, resolveCapability } from './catalog.js'
import { check, riskFromResult, approvalSummary } from './policy.js'

const MAX_RENDER = 24000

function renderValue(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return [{ type: 'text', text: text.length > MAX_RENDER ? `${text.slice(0, MAX_RENDER)}\n…（已截断）` : text }]
}

function defineTool(name, description, properties = {}, required = [], execute) {
  return {
    name,
    description,
    parameters: { type: 'object', properties, required, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => renderValue(value) },
    execute,
  }
}

const ok = (data) => ({ ok: true, ...data })
const fail = (message, extra = {}) => ({ ok: false, message, ...extra })

function summaryOf(capability, result) {
  if (!result || result.ok === false) return `${capability} 失败`
  return `${capability} 完成`
}

export function registerTools(ctx, store, rootDir, extras = {}) {
  const { douyin } = extras
  const disposers = []
  const add = (tool) => {
    disposers.push(ctx.effect(() => ctx.tools.register(tool), `dafeiyu-douyin: ${tool.name}`))
  }

  if (douyin) {
    add(defineTool(
      'dafeiyu_douyin',
      '抖音入口：用本机真实 Chrome 驱动抖音。看推荐流/热榜/搜作品/看评论/看主页，点赞、收藏、关注、发评论，把本地视频传到创作者中心。action=status 看环境和登录态；action=login 拿扫码二维码；action=poll 查扫码结果（args.key）；action=setup 首次安装 playwright 运行时；action=feed/hot/search/video/comments/user/works 读；action=like/collect/follow/comment 写；action=publish 分两步（mode=prepare 上传并填好标题，mode=commit 才真发，commit 一定走审批）。写动作要先有总线程（dafeiyu_douyin_thread start）。',
      {
        action: {
          type: 'string',
          enum: [
            'status', 'login', 'poll', 'check', 'logout', 'setup', 'open', 'close', 'shot',
            'feed', 'hot', 'search', 'video', 'comments', 'user', 'works',
            'like', 'collect', 'follow', 'comment', 'publish', 'catalog',
          ],
          description: '要做的动作',
        },
        args: { type: 'object', description: '动作参数，如 {limit}、{keyword}、{id}、{secUid|nickname}、{text}、{mode:"prepare"|"commit", videoPath, title, desc, tags}' },
        approvalId: { type: 'string', description: '人类批准后拿到的审批项 id' },
        dryRun: { type: 'boolean', description: '只查权限和限额，不真执行' },
      },
      ['action'],
      async (args) => {
        const action = String(args.action || '')
        const a = args.args ?? {}

        if (action === 'catalog') return ok(catalogView())

        // 账号类/环境类：不需要总线程，也不算互动。
        if (action === 'status') return ok({ data: await douyin.status() })
        if (action === 'setup') return ok({ data: await douyin.setup() })
        if (action === 'open') return ok({ data: await douyin.openBrowser() })
        if (action === 'close') return ok({ data: await douyin.close() })
        if (action === 'shot') return ok({ data: await douyin.shotCurrent(a.name || `shot-${Date.now()}`) })
        if (action === 'check') {
          const account = await douyin.loginCheck()
          if (account?.ok !== false) store.loginSet({ ok: true, ...account })
          return ok({ data: account })
        }
        if (action === 'logout') {
          const r = await douyin.logout()
          store.loginSet({ ok: false })
          return ok({ data: r })
        }
        if (action === 'login') {
          const qr = await douyin.loginQr()
          if (qr?.ok && qr.qr) {
            return ok({ data: qr, hint: '把二维码给人类扫；扫完调 action=poll，args.key 用返回的 key。' })
          }
          return ok({ data: qr })
        }
        if (action === 'poll') {
          const key = String(a.key || a.id || '')
          if (!key) return fail('poll 需要 args.key（login 返回的 key）')
          const r = await douyin.loginPoll(key)
          if (r?.ok && r.account) store.loginSet({ ok: true, ...r.account })
          return ok({ data: r })
        }

        // 其余都是能力动作，统一过闸。
        const cap = resolveCapability(action)
        if (!cap) return fail(`不认识的动作：${action}`, { code: 'UNKNOWN_ACTION' })

        const isWrite = cap.kind === 'write' || cap.kind === 'publish'
        if (isWrite && args.dryRun !== true && !store.ensureActiveThread()) {
          return fail('写动作要先有一件在手的活：先调 dafeiyu_douyin_thread start 开总线程。', {
            code: 'NO_THREAD',
            hint: 'thread: dafeiyu_douyin_thread action=start title=…',
          })
        }

        const verdict = check(store, cap, a, { dryRun: args.dryRun, approvalId: args.approvalId })
        if (verdict.decision === 'deny') {
          return fail(verdict.reason || '这个动作现在不能做', { code: verdict.code, decision: 'deny', until: verdict.until })
        }
        if (verdict.decision === 'pending') {
          return fail('已经放进审批队列，等人类在总控台点头。', {
            code: 'NEED_APPROVAL',
            decision: 'pending',
            pendingId: verdict.pendingId,
            summary: verdict.summary,
            next: `人类批准后带 approvalId=${verdict.pendingId} 再调一次`,
          })
        }
        if (verdict.decision === 'approved') {
          const consumed = store.pendingConsume(verdict.approvalId, cap.id, verdict.argsHash)
          if (!consumed.ok) return fail(consumed.error, { code: 'APPROVAL_INVALID' })
        }
        if (verdict.dryRun) {
          return ok({ dryRun: true, capability: cap.id, limit: verdict.limits, usedHour: verdict.usedHour, usedDay: verdict.usedDay, summary: approvalSummary(cap, a) })
        }

        const startedAt = Date.now()
        let result
        try {
          result = await runCapability(douyin, cap, a)
        } catch (error) {
          store.logAction({ capability: cap.id, kind: cap.kind, status: 'error', summary: String(error?.message || error), ms: Date.now() - startedAt })
          return fail(`${cap.label}失败：${error?.message || error}`, { code: 'EXECUTE_FAILED' })
        }

        const risk = riskFromResult(result)
        if (risk?.hit) store.riskSet(risk.minutes, risk.reason)

        store.logAction({
          capability: cap.id,
          kind: cap.kind,
          status: result?.ok === false ? 'error' : 'done',
          summary: summaryOf(cap.id, result),
          argsHash: verdict.argsHash ?? '',
          ms: Date.now() - startedAt,
        })

        return ok({
          capability: cap.id,
          label: cap.label,
          data: result,
          risk: risk?.hit ? risk : undefined,
          meta: { ms: Date.now() - startedAt },
        })
      },
    ))

    add(defineTool(
      'dafeiyu_douyin_thread',
      '抖音这边的总线程：一次只做一件事。current 看手头，start 开一件（已经有活会拒绝），step 记进展，finish 收尾，abandon 放弃。任何写动作之前都要先 start。',
      {
        action: { type: 'string', enum: ['current', 'start', 'step', 'finish', 'abandon'] },
        title: { type: 'string', description: 'start 的标题，写具体一点' },
        note: { type: 'string', description: 'start 的备注 / step 的进展' },
        result: { type: 'string', description: 'finish 的结果 / abandon 的原因' },
      },
      ['action'],
      async (args) => {
        const action = String(args.action)
        if (action === 'current') {
          const t = store.threadGet()
          return ok({ thread: t && t.status === 'active' ? t : null, raw: t ?? null })
        }
        if (action === 'start') {
          const r = store.threadStart({ title: String(args.title ?? ''), note: String(args.note ?? '') })
          return r.ok ? ok({ thread: r.thread }) : fail(r.error)
        }
        if (action === 'step') {
          const r = store.threadStep(String(args.note ?? ''))
          return r.ok ? ok({ thread: r.thread }) : fail(r.error)
        }
        if (action === 'finish') {
          const r = store.threadFinish(String(args.result ?? ''), 'done')
          return r.ok ? ok({ thread: r.thread }) : fail(r.error)
        }
        if (action === 'abandon') {
          const r = store.threadAbandon(String(args.result ?? ''))
          return r.ok ? ok({ thread: r.thread }) : fail(r.error)
        }
        return fail('未知 action')
      },
    ))

    add(defineTool(
      'dafeiyu_douyin_pending',
      '抖音审批队列：list 看等人类点头的动作，get 看单项详情。只能申请和查看，不能自己批自己。',
      {
        action: { type: 'string', enum: ['list', 'get'] },
        id: { type: 'string', description: '审批项 id（get 用）' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'executed'], description: 'list 的状态过滤，默认 pending' },
      },
      ['action'],
      async (args) => {
        if (String(args.action) === 'list') {
          return ok({ items: store.pendingList(String(args.status || 'pending')) })
        }
        const id = String(args.id || '')
        if (!id) return fail('get 需要 id')
        const item = store.pendingGet(id)
        return item ? ok({ item }) : fail('没找到这条审批')
      },
    ))

    add(defineTool(
      'dafeiyu_douyin_policy',
      '抖音权限设置：get 看当前策略（自主程度、自动放行的动作、安静时段、限额），set 改一部分。改策略是给人类用的开关，改完记得说一声。',
      {
        action: { type: 'string', enum: ['get', 'set'] },
        patch: { type: 'object', description: 'set 时要合并进去的策略片段，例如 {"quietHours":{"enabled":false}}' },
      },
      ['action'],
      async (args) => {
        if (String(args.action) === 'get') return ok({ policy: store.policyGet() })
        const patch = args.patch
        if (!patch || typeof patch !== 'object') return fail('set 需要 patch 对象')
        return ok({ policy: store.policySet(patch) })
      },
    ))
  }

  return () => {
    for (const dispose of disposers.splice(0)) {
      try { dispose?.() } catch {}
    }
  }
}

/** 能力 → douyin.js 方法。参数不猜，缺就直接报错。 */
async function runCapability(douyin, cap, a) {
  const need = (key, hint) => {
    const value = a[key]
    if (value === undefined || value === null || value === '') throw new Error(`需要 args.${key}${hint ? `（${hint}）` : ''}`)
    return value
  }
  switch (cap.action) {
    case 'feed':
      return douyin.feed({ limit: Number(a.limit ?? 8) })
    case 'hot':
      return douyin.hot({ limit: Number(a.limit ?? 10) })
    case 'search':
      return douyin.search({ keyword: String(need('keyword', '要搜的词')), limit: Number(a.limit ?? 10) })
    case 'video':
      return douyin.video({ id: String(need('id', '作品 id 或链接里的数字')) })
    case 'comments':
      return douyin.comments({ id: String(need('id')), limit: Number(a.limit ?? 20) })
    case 'user':
      return douyin.user({ secUid: a.secUid, keyword: a.keyword, limit: Number(a.limit ?? 12) })
    case 'works':
      return douyin.works({ limit: Number(a.limit ?? 10) })
    case 'like':
      return douyin.like({ id: String(need('id')) })
    case 'collect':
      return douyin.collect({ id: String(need('id')) })
    case 'follow':
      return douyin.follow({ secUid: a.secUid, nickname: a.nickname })
    case 'comment':
      return douyin.comment({ id: String(need('id')), text: String(need('text')) })
    case 'publish': {
      const mode = String(a.mode || 'prepare')
      if (mode === 'commit') return douyin.publishCommit({ note: a.note })
      return douyin.publishPrepare({
        videoPath: a.videoPath,
        title: a.title,
        desc: a.desc,
        tags: a.tags,
        cover: a.cover,
        declaration: a.declaration,
      })
    }
    default:
      throw new Error(`能力 ${cap.id} 还没有对应实现`)
  }
}
