// 抖音-我才不是魔丸鱼（小七） —— 工具注册
// 给 agent 三件东西：干活的手（dafeiyu_douyin）、看闸门（pending）、看线程（thread）。

import { catalogView, resolveCapability } from './catalog.js'
import { check, riskFromResult, approvalSummary } from './policy.js'
import { buildPulse } from './prompt.js'

const MAX_RENDER = 24000

function renderValue(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return [{ type: 'text', text: text.length > MAX_RENDER ? `${text.slice(0, MAX_RENDER)}\n…（已截断）` : text }]
}

// 工具返回值会被宿主序列化：undefined / NaN / Date / BigInt 都会让整次调用失败，
// 所以统一在这里洗一遍，别等到 agent 那边只看到 "value is not lossless JSON"。
function jsonSafe(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => (jsonSafe(item) === undefined ? null : jsonSafe(item)))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      const clean = jsonSafe(item)
      if (clean !== undefined) out[key] = clean
    }
    return out
  }
  return value
}

function defineTool(name, description, properties = {}, required = [], execute) {
  return {
    name,
    description,
    parameters: { type: 'object', properties, required, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => renderValue(value) },
    execute: async (...args) => jsonSafe(await execute(...args)),
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
      '抖音入口：用本机真实 Chrome 驱动抖音。看推荐流/热榜/搜作品/看评论/看主页/读私信，点赞、收藏、关注、发评论、回私信，把本地视频传到创作者中心。action=status 看环境和登录态；action=login 拿扫码二维码；action=poll 查扫码结果（args.key）；action=setup 首次安装 playwright 运行时；action=feed/hot/search/video/comments/user/works/state/observe/report/im_list/im_read 读；播放控制用 state/play/pause/next/previous/observe（args.seconds 1-10）（im_list 看谁会话来、im_read 用 args.name 或 args.index 读某个会话）；action=like/collect/follow/comment/im_send 写（im_send 用 args.text 回一句话）；action=publish 分两步（mode=prepare 上传并填好标题，mode=commit 才真发，commit 一定走审批）。写动作要先有总线程（dafeiyu_thread start）。',
      {
        action: {
          type: 'string',
          enum: [
            'status', 'login', 'poll', 'check', 'logout', 'setup', 'open', 'close', 'shot',
            'feed', 'hot', 'search', 'video', 'comments', 'user', 'works',
            'state', 'play', 'pause', 'next', 'previous', 'observe', 'watch', 'watch_status', 'report', 'doctor',
            'im_list', 'im_read', 'im_send',
            'like', 'collect', 'follow', 'comment', 'publish', 'catalog',
          ],
          description: '要做的动作',
        },
        args: { type: 'object', description: '动作参数，如 {limit}、{keyword}、{id}、{secUid|nickname}、{text}（评论/私信内容）、{name|index}（私信会话）、{mode:"prepare"|"commit", videoPath, title, desc, tags}' },
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
        if (action === 'report') return ok({ data: store.reportBuild(a.day ? String(a.day) : undefined) })
        if (action === 'watch_status') return ok({ data: store.watchQuota() })
        if (action === 'doctor') return ok({ data: await douyin.doctor({ repair: a.repair === true }) })
        if (action === 'im_auto') {
          const list = await douyin.imList({ limit: Math.max(1, Math.min(30, Number(a.limit ?? 10))) })
          const rows = Array.isArray(list?.sessions) ? list.sessions : (Array.isArray(list?.items) ? list.items : [])
          const seen = store.imSeenGet()
          const pending = []
          for (const row of rows) {
            const name = String(row?.name ?? row?.title ?? '').trim()
            const preview = String(row?.preview ?? row?.last ?? '').trim()
            const sig = `${preview}|${row?.time ?? ''}`
            const last = seen[name]?.sig ?? ''
            const unread = Number(String(row?.unread ?? '').replace(/\D/g, '')) || 0
            if (name && (unread > 0 || (last && sig !== last))) pending.push({ name, preview, time: row?.time ?? '', unread })
          }
          return ok({
            data: { count: rows.length, pending, seen: Object.keys(seen).length },
            hint: pending.length
              ? '有该回的：用 dafeiyu_douyin action=im_read 看清楚，再用 action=im_send 回一句（先 dafeiyu_thread start）。回完 action=im_auto 会重新标记。'
              : '没有新私信。可以换件事做，别盯着会话列表刷。',
          })
        }
        if (action === 'share') {
          const vid = String(a.id ?? '').trim()
          if (!vid) return fail('要分享哪条？给我 args.id（作品 id 或链接）')
          const detail = await douyin.video({ id: vid })
          const v = detail?.video ?? detail?.data?.video ?? {}
          const stats = v.stats ?? {}
          let tops = []
          try {
            const cs = await douyin.comments({ id: vid, limit: Math.max(1, Math.min(20, Number(a.comments ?? 6))) })
            const arr = Array.isArray(cs?.comments) ? cs.comments : (Array.isArray(cs?.data?.comments) ? cs.data.comments : [])
            tops = arr.slice(0, 3).map((c) => `${String(c?.text ?? '').trim()}（${Number(c?.digg) || 0} 赞${c?.user?.nickname ? ' · ' + c.user.nickname : ''}）`)
          } catch { tops = [] }
          const who = v.author?.nickname ?? '某个人'
          const text = [
            `刷到一条值得给你看的：${String(v.desc ?? '').trim() || who}`,
            `${who}｜${Number(stats.digg) || 0} 赞 / ${Number(stats.comment) || 0} 评 / ${Number(stats.collect) || 0} 藏`,
            tops.length ? `评论区最扎的：${tops[0]}` : '',
            `https://www.douyin.com/video/${v.id || vid}`,
          ].filter(Boolean).join('\n')
          store.shareLog({ id: v.id || vid, title: String(v.desc ?? ''), digg: Number(stats.digg) || 0, sent: false })
          return ok({
            data: { text, video: { id: v.id || vid, desc: v.desc, author: who, stats }, tops },
            hint: '想发给我就 dafeiyu_douyin action=im_send args.name="404." args.text=<上面这段>（私信算日常互动，过闸即可；要我确认时它会进审批）。',
          })
        }
        if (action === 'trends') {
          const kw = String(a.keyword ?? '热梗').trim() || '热梗'
          const hot = await douyin.hot({ limit: Math.max(5, Math.min(30, Number(a.limit ?? 12))) }).catch((err) => ({ ok: false, error: String(err?.message ?? err) }))
          const hotRows = Array.isArray(hot?.items) ? hot.items : (Array.isArray(hot?.data?.items) ? hot.data.items : [])
          let found = null
          try {
            const s2 = await douyin.search({ keyword: kw, limit: Math.max(3, Math.min(15, Number(a.limit ?? 8))) })
            const arr = Array.isArray(s2?.items) ? s2.items : (Array.isArray(s2?.data?.items) ? s2.data.items : [])
            found = arr.slice(0, 8).map((it) => ({ title: String(it?.desc ?? it?.title ?? '').trim(), author: it?.author ?? '', digg: Number(it?.stats?.digg ?? it?.digg) || 0 }))
          } catch (err) { found = [{ title: `搜索失败：${String(err?.message ?? err)}` }] }
          return ok({
            data: { keyword: kw, hot: hotRows.slice(0, 12).map((it) => String(it?.word ?? it?.title ?? it?.desc ?? '')).filter(Boolean), search: found },
            hint: '挑一个梗去原视频评论区看它怎么用，再用 dafeiyu_learn action=skill_add 记一条自己的用法；别只收藏不记。',
          })
        }
        if (action === 'watch') {
          const quota = store.watchQuota()
          if (!quota.allowed) return fail(quota.reason, { code: 'WATCH_NOT_ALLOWED', data: quota })
          const minutes = Math.max(1, Math.min(Number(a.minutes ?? quota.sessionMinutes) || quota.sessionMinutes, quota.leftMinutes))
          const rounds = Math.max(1, Math.min(Number(a.maxRounds ?? quota.stopAfterVideos) || quota.stopAfterVideos, 12))
          const seconds = Math.max(1, Math.min(Number(a.seconds ?? 4) || 4, 10))
          const startedAt = Date.now()
          const limitMs = minutes * 60000
          const seen = []
          while (seen.length < rounds && Date.now() - startedAt < limitMs) {
            const step = seen.length === 0 ? await douyin.watchState() : await douyin.next()
            const observed = await douyin.observe({ seconds })
            const row = {
              id: observed.id || step.id || '',
              title: observed.title || step.title || '',
              played: observed.played,
              stayed: observed.stayed,
              ratio: observed.ratio,
            }
            seen.push(row)
            try { store.watchLog({ at: new Date().toISOString(), action: 'observe', id: row.id, title: row.title, ratio: row.ratio, stayed: row.stayed, ms: seconds * 1000 }) } catch {}
          }
          const spent = Math.round(((Date.now() - startedAt) / 60000) * 10) / 10
          store.logAction({ capability: 'douyin.watch', kind: 'read', status: 'done', summary: `自主看了 ${seen.length} 条`, ms: Date.now() - startedAt })
          return ok({ data: { ok: true, watched: seen.length, minutes: spent, items: seen, quota: store.watchQuota() } })
        }
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
          return fail('写动作要先有一件在手的活：先调 dafeiyu_thread start 开总线程。', {
            code: 'NO_THREAD',
            hint: 'thread: dafeiyu_thread action=start title=…',
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
        if (risk?.hit) store.riskSet(Math.max(1, Math.round(Number(risk.minutes ?? 1440) / 60)), risk.reason, risk.code)

        store.logAction({
          capability: cap.id,
          kind: cap.kind,
          status: result?.ok === false ? 'error' : 'done',
          summary: summaryOf(cap.id, result),
          argsHash: verdict.argsHash ?? '',
          ms: Date.now() - startedAt,
        })

        if (['observe', 'next', 'play', 'pause'].includes(cap.action) && result) {
          try {
            store.watchLog({
              at: new Date().toISOString(),
              action: cap.action,
              id: String(result.id ?? result.before?.id ?? ''),
              title: String(result.title ?? result.before?.title ?? ''),
              ratio: Number(result.ratio ?? result.before?.ratio ?? 0),
              stayed: result.stayed === undefined ? undefined : Boolean(result.stayed),
              ms: Date.now() - startedAt,
            })
          } catch {}
        }

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
      'dafeiyu_thread',
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
      'dafeiyu_pending',
      '抖音审批队列：list 看等人类点头的动作，get 看单项详情。只能申请和查看，不能自己批自己。',
      {
        action: { type: 'string', enum: ['list', 'get'] },
        id: { type: 'string', description: '审批项 id（get 用）' },
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'executed'], description: 'list 的状态过滤，默认 pending' },
      },
      ['action'],
      async (args) => {
        if (String(args.action) === 'list') {
          return ok({ items: store.pendingList({ status: String(args.status || 'pending') }) })
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

  // ---------- 人设 / 记忆 / 关系 / 规划 / 学习 / 心跳 / 收尾 ----------
  // 这一组是「大肥鱼」自己的部分，和抖音动作解耦：换平台也照旧能用。

  add(defineTool(
    'dafeiyu_self',
    '读写大肥鱼自己的短文档：人设 persona、说话风格 style、偏好 preferences、规划 plan、进度 progress、心跳行动稿 heartbeat。heartbeat 是每次自主心跳的底稿，学完东西可以自己改。先 list 看有哪些，get 读全文；改的时候只改需要的那一段，别把文档写长。',
    {
      action: { type: 'string', enum: ['list', 'get', 'set', 'append'], description: 'list 列表 / get 读 / set 覆盖 / append 追加一行' },
      doc: { type: 'string', enum: ['persona', 'style', 'preferences', 'plan', 'progress', 'heartbeat'], description: '文档名' },
      content: { type: 'string', description: 'set 或 append 的内容（set 最多 12000 字）' },
    },
    ['action'],
    async (args) => {
      const action = String(args.action)
      if (action === 'list') return ok({ docs: store.listDocs(), hint: '文档都带 summary，先看 summary 再决定要不要 get 全文。' })
      const doc = String(args.doc ?? '')
      const docs = ['persona', 'style', 'preferences', 'plan', 'progress', 'heartbeat']
      if (!docs.includes(doc)) return fail(`doc 只能是 ${docs.join(' / ')}`)
      if (action === 'get') return ok({ doc, ...store.docInfo(doc) })
      const content = String(args.content ?? '')
      if (action === 'set') {
        if (!content.trim()) return fail('content 不能为空')
        if (content.length > 12000) return fail('这份文档太长了（>12000 字），删减后再写。')
        store.writeDoc(doc, content)
        return ok({ doc, written: true, summary: store.docInfo(doc).summary ?? '' })
      }
      if (action === 'append') {
        const line = String(content).replace(/\r?\n/g, ' ').trim().slice(0, 300)
        if (!line) return fail('content 不能为空')
        store.appendDoc(doc, line.startsWith('-') ? line : `- ${line}`)
        return ok({ doc, appended: line })
      }
      return fail('未知 action')
    },
  ))

  add(defineTool(
    'dafeiyu_memory',
    '大肥鱼的记忆入口：recall 按关键词检索长期记忆/最近对话；core_add 写一条核心记忆；recent 看最近聊过什么；mood_get/mood_set 读写即时情绪；boredom_get 看厌倦度，boredom_reset 把某项清零；satisfaction_get 看满足度（只有抖音上的真实动作/别人认可才会涨），satisfaction_reset 只在本人明确要求时手动清零。刚说过的话会自动进短时记忆，这里不用重复记。',
    {
      action: {
        type: 'string',
        enum: ['recall', 'core_add', 'recent', 'mood_get', 'mood_set', 'boredom_get', 'boredom_reset', 'satisfaction_get', 'satisfaction_reset', 'interest_list', 'interest_add', 'compact'],
      },
      query: { type: 'string', description: 'recall 的检索词' },
      limit: { type: 'integer', description: 'recent 返回条数，默认 8' },
      text: { type: 'string', description: 'core_add 的一句话' },
      mood: { type: 'string', description: 'mood_set 的情绪名，如 平静/好奇/有点累/兴奋/烦' },
      energy: { type: 'integer', description: 'mood_set 的能量 0-100，默认 60' },
      note: { type: 'string', description: 'mood_set 的补充说明' },
      group: { type: 'string', description: 'boredom_reset 的分组名，省略则全部清零' },
    },
    ['action'],
    async (args) => {
      const action = String(args.action)
      if (action === 'recall') {
        const query = String(args.query ?? '').trim()
        if (query) {
          const hits = store.searchAll(query, 8)
          return ok({ query, hits, hint: hits.length ? '这些是匹配到的片段。' : '没翻到相关的，可能还没记过。' })
        }
        return ok({ core: store.coreRaw(), recent: store.recentShort(12) })
      }
      if (action === 'core_add') {
        const text = String(args.text ?? '').replace(/\r?\n/g, ' ').trim()
        if (!text) return fail('text 不能为空')
        store.coreAdd(text)
        return ok({ added: text.slice(0, 300) })
      }
      if (action === 'recent') return ok({ recent: store.recentShort(Math.max(1, Math.min(30, Number(args.limit ?? 8)))) })
      if (action === 'mood_get') return ok({ emotion: store.emotionGet() })
      if (action === 'mood_set') {
        const mood = String(args.mood ?? '').trim()
        if (!mood) return fail('mood 不能为空')
        return ok({ emotion: store.emotionSet({ mood, energy: Math.max(0, Math.min(100, Number(args.energy ?? 60))), note: String(args.note ?? '') }) })
      }
      if (action === 'boredom_get') return ok({ boredom: store.boredomView(store.policyGet()), rule: '接近阈值就该换事；换一件别的事会让这项自然回落。' })
      if (action === 'boredom_reset') return ok({ boredom: store.boredomReset(args.group ? String(args.group) : undefined) })
      if (action === 'satisfaction_get') {
        return ok({
          satisfaction: store.satisfactionView(store.policyGet()),
          rule: '满足度只能在抖音上真实做事获得：刷推荐少量，点赞/收藏/评论中量，别人回复/点赞大量；满了才允许收尾关对话。',
        })
      }
      if (action === 'interest_list') return ok({ interests: store.interestList(Math.max(1, Math.min(60, Number(args.limit ?? 30)))) })
      if (action === 'interest_add') {
        const topic = String(args.topic ?? '').trim()
        if (!topic) return fail('topic 不能为空')
        return ok({
          interest: store.interestAdd({
            topic,
            signal: String(args.signal ?? 'neutral'),
            evidenceId: String(args.evidenceId ?? args.evidence ?? ''),
            reflection: String(args.reflection ?? ''),
            videoId: String(args.videoId ?? ''),
          }),
        })
      }
      if (action === 'compact') return ok({ data: store.compactMemory({ keepDays: args.keepDays, maxLines: args.maxLines }) })
      if (action === 'satisfaction_reset') {
        return ok({ satisfaction: store.satisfactionView(store.policyGet()), reset: store.satisfactionReset(), rule: '只在本人明确要求时清零。' })
      }
      return fail('未知 action')
    },
  ))

  add(defineTool(
    'dafeiyu_relation',
    '对抖音上具体账号的印象和关系：list 看所有认识的人，get 看某人档案，note 记一次互动或改印象。印象写具体（他关心什么、说话什么风格、上次聊到哪），别写空话。',
    {
      action: { type: 'string', enum: ['list', 'get', 'note'] },
      uid: { type: 'string', description: '对方 uid / secUid（note/get 必填）' },
      name: { type: 'string', description: '对方昵称' },
      impression: { type: 'string', description: '印象 / 这次互动的观察' },
      event: { type: 'string', description: '这次发生了什么（追加到互动记录）' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签，最多 8 个' },
      closeness: { type: 'integer', description: '关系变化 -2 到 +2，默认 0' },
    },
    ['action'],
    async (args) => {
      const action = String(args.action)
      if (action === 'list') {
        const relations = store.relationList()
        return ok({ relations, count: relations.length })
      }
      const uid = String(args.uid ?? '').trim()
      if (!uid) return fail('uid 不能为空')
      if (action === 'get') return ok({ relation: store.relationGet(uid) })
      if (action === 'note') {
        const meta = store.relationNote({
          uid,
          name: args.name,
          impression: args.impression,
          event: args.event ?? args.impression,
          tags: args.tags,
          closenessDelta: Math.max(-2, Math.min(2, Number(args.closeness ?? 0))),
        })
        return ok({ relation: meta, file: store.relationPath(uid) })
      }
      return fail('未知 action')
    },
  ))

  add(defineTool(
    'dafeiyu_plan',
    '规划与进度：get 读 plan + progress；set 重写规划（保持短，12 行内）；add 加一条待办；done 把某条待办打勾并写进进度。规划一次只留 1 件进行中。',
    {
      action: { type: 'string', enum: ['get', 'set', 'add', 'done'] },
      content: { type: 'string', description: 'set 的完整规划正文' },
      item: { type: 'string', description: 'add 的待办内容，或 done 要打勾的那条（包含关键词即可）' },
    },
    ['action'],
    async (args) => {
      const action = String(args.action)
      if (action === 'get') return ok({ plan: store.readDoc('plan'), progress: store.readDoc('progress') })
      if (action === 'set') {
        const content = String(args.content ?? '')
        if (!content.trim()) return fail('content 不能为空')
        if (content.split(/\r?\n/).length > 12) return fail('规划太长了，压到 12 行以内。')
        store.writeDoc('plan', content)
        return ok({ plan: store.readDoc('plan') })
      }
      if (action === 'add') {
        const item = String(args.item ?? '').replace(/\r?\n/g, ' ').trim().slice(0, 160)
        if (!item) return fail('item 不能为空')
        store.appendDoc('plan', `- [ ] ${item}`)
        return ok({ added: item })
      }
      if (action === 'done') {
        const item = String(args.item ?? '').trim()
        const lines = store.readDoc('plan').split(/\r?\n/)
        let hit = -1
        if (item) {
          hit = lines.findIndex((line) => /^-\s*\[ \]/.test(line) && line.toLowerCase().includes(item.toLowerCase()))
        }
        if (hit < 0) return fail(item ? `没找到包含「${item}」的待办。` : '要给 item 才知道勾哪条。', { open: lines.filter((line) => /^-\s*\[ \]/.test(line)) })
        lines[hit] = lines[hit].replace('[ ]', '[x]')
        store.writeDoc('plan', lines.join('\n'))
        const doneText = lines[hit].replace(/^-\s*\[x\]\s*/, '')
        store.appendDoc('progress', `- 完成：${doneText.slice(0, 120)}`)
        return ok({ done: doneText })
      }
      return fail('未知 action')
    },
  ))

  add(defineTool(
    'dafeiyu_learn',
    '学习模式：管理学习目标和已学会的技能。status 看目标/技能；goal_add 加目标；goal_update 改进度/状态；skill_add 记一条新技能；skill_update 改技能。目标要短、能落到具体动作。',
    {
      action: { type: 'string', enum: ['status', 'goal_add', 'goal_update', 'skill_add', 'skill_update'] },
      goalId: { type: 'string', description: '目标 id（goal_update）' },
      skillId: { type: 'string', description: '技能 id（skill_update）' },
      title: { type: 'string', description: '目标标题（goal_add）' },
      why: { type: 'string', description: '为什么要学（goal_add）' },
      targets: { type: 'string', description: '拆成几个可练的小点，逗号分隔' },
      progress: { type: 'number', description: '进度 0-100（goal_update）' },
      goalStatus: { type: 'string', enum: ['learning', 'paused', 'done'], description: '目标状态（goal_update）' },
      name: { type: 'string', description: '技能名' },
      level: { type: 'string', enum: ['入门', '会用', '熟练'], description: '技能熟练度' },
      summary: { type: 'string', description: '一句话说清学会了什么' },
      evidence: { type: 'string', description: '证据/例子' },
      source: { type: 'string', description: '从哪学的' },
    },
    ['action'],
    async (args = {}) => {
      try {
        const action = String(args.action)
        if (action === 'status') return ok(store.learningView())
        if (action === 'goal_add') return ok({ goal: store.learningGoalAdd(args) })
        if (action === 'goal_update') {
          const patch = { ...args }
          if (args.goalStatus !== undefined) patch.status = args.goalStatus
          return ok({ goal: store.learningGoalUpdate(args.goalId, patch) })
        }
        if (action === 'skill_add') return ok({ skill: store.learningSkillAdd(args) })
        if (action === 'skill_update') return ok({ skill: store.learningSkillUpdate(args.skillId, args) })
        return fail('未知 action')
      } catch (error) {
        return fail(String(error.message || error))
      }
    },
  ))

  add(defineTool(
    'dafeiyu_tick',
    '自主行动脉冲：把此刻的情绪、厌倦度、满足度、总线程、待审批、风控、心跳状态和建议的下一步一次给你。想找事做、或不确定现在该干嘛时调它。返回的建议只是建议。',
    { note: { type: 'string', description: '可选备注' } },
    [],
    async () => {
      const pulse = buildPulse(store)
      return ok({ pulse, rule: '一次只挑一件事；写动作先 dafeiyu_thread start；做了就记。' })
    },
  ))

  add(defineTool(
    'dafeiyu_chat',
    '聊天收尾闸。status 看满足度；只有满足度满了才能用 close 结束这段对话。close 前必须先在 plan 参数里给出更新后的规划（下一步做什么、放弃什么）。满足度只能靠抖音上的真实行为上涨：刷推荐少量，点赞/收藏/评论中量，别人回复/点赞大量。没满就继续做事。',
    {
      action: { type: 'string', enum: ['status', 'close'] },
      note: { type: 'string', description: 'close 的收尾语或原因' },
      plan: { type: 'string', description: 'close 时更新后的 plan 正文，最多 2000 字' },
    },
    ['action'],
    async (args = {}) => {
      const view = store.satisfactionView(store.policyGet())
      if (String(args.action) === 'status') {
        return ok({ satisfaction: view, canClose: view.full, currentPlan: store.readDoc('plan') })
      }
      if (!view.full) {
        return fail(`满足度还没满（${view.value}/${view.threshold}，还差 ${view.missing}），先别关对话。`, { code: 'NOT_SATISFIED', satisfaction: view })
      }
      const plan = String(args.plan ?? '').trim().slice(0, 2000)
      if (!plan) return fail('收尾前先改规划：在 close 的 plan 参数里写下一步做什么、放弃什么。', { code: 'PLAN_REQUIRED', currentPlan: store.readDoc('plan') })
      store.writeDoc('plan', plan)
      store.satisfactionMarkClosed(String(args.note ?? '').slice(0, 300))
      store.appendDoc('progress', `- 满足度满（${view.value}/${view.threshold}），收尾关对话。${args.note ? ` ${String(args.note).slice(0, 120)}` : ''}`)
      return ok({ closed: true, planUpdated: true, satisfaction: store.satisfactionView(store.policyGet()), message: '满足度已满，规划已更新，可以收尾了；收尾语短、具体，别写客服式总结。' })
    },
  ))

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
    case 'state':
      return douyin.watchState()
    case 'play':
      return douyin.play()
    case 'pause':
      return douyin.pause()
    case 'next':
      return douyin.next()
    case 'previous':
      return douyin.previous()
    case 'observe':
      return douyin.observe({ seconds: Number(a.seconds ?? 3) })
    case 'im_list':
      return douyin.imList({ limit: Number(a.limit ?? 20) })
    case 'im_read':
      return douyin.imRead({ name: String(a.name ?? ''), index: Number(a.index ?? 0), limit: Number(a.limit ?? 20) })
    case 'im_send':
      return douyin.imSend({ name: String(a.name ?? ''), index: Number(a.index ?? 0), text: String(need('text', '要回的那句话')) })
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
