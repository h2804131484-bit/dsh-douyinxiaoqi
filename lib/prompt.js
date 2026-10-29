// 抖音-我才不是魔丸鱼（小七） —— 系统提示里的「此刻」卡片
// 每次组装提示时重读状态，只写短而具体的几行，别把上下文撑爆。

import { bodyLines, truncate } from './util.js'
import { CAPABILITIES, resolveCapability } from './catalog.js'

function localStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 一句话的时间感，让「此刻」别像定时任务。 */
function timeFlavor(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return '凌晨，脑子慢半拍，适合慢慢刷、少说话'
  if (h < 9) return '早上，刚醒，别急着干活'
  if (h < 12) return '上午，精神还行'
  if (h < 14) return '中午，有点犯困'
  if (h < 18) return '下午，干正事最容易出结果'
  if (h < 22) return '晚上，刷抖音的高峰'
  return '深夜，容易上头，也容易说错话'
}

function compact(text, max) {
  return truncate(String(text ?? '').replace(/\s+/g, ' ').trim(), max)
}

/** 文档正文里挑几条要点：去掉 markdown 符号，压成一句话。 */
function bullets(lines, count = 4, max = 60) {
  return lines
    .map((line) => String(line).replace(/^[-*#>\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, count)
    .map((line) => compact(line, max))
}

/** 按厌倦度从低到高给几条建议，避免一直是同一类动作。 */
function suggestNextActions(boredom) {
  const scored = CAPABILITIES.filter((cap) => ['feed', 'hot', 'search', 'video', 'comments', 'user', 'works'].includes(cap.action))
  const level = new Map(boredom.activities.map((item) => [item.group, item.value]))
  return scored
    .map((cap) => ({ id: cap.id, label: cap.label, group: cap.group, score: level.get(cap.group) ?? 0, weight: cap.weight ?? 0 }))
    .sort((a, b) => a.score - b.score || a.weight - b.weight)
    .slice(0, 4)
}

/** 从关系档案里抠出那句「印象」，别把整篇塞进提示。 */
function impressionOf(raw) {
  const body = String(raw ?? '').replace(/^---[\s\S]*?---\s*/, '')
  const line = body.split('\n').map((x) => x.trim()).find((x) => x.startsWith('- ') && !x.startsWith('- 202'))
  return line ? line.replace(/^-\s*/, '') : ''
}

export function buildSelfCard(store) {
  const config = store.configGet()
  if (!config.personaInject) return ''
  const policy = store.policyGet()
  const persona = bullets(bodyLines(store.readDoc('persona'), 8, 430), 4, 58)
  const style = bullets(bodyLines(store.readDoc('style'), 6, 240), 3, 46)
  const plan = bullets(bodyLines(store.readDoc('plan'), 4, 260), 4, 80)
  const core = bullets(bodyLines(store.coreRaw(), 3, 220), 3, 70)
  const emotion = store.emotionGet()
  const boredom = store.boredomView(policy)
  const threadDoc = store.threadGet()
  const short = store.recentShort(4)
  const risk = store.riskGet()
  const pending = store.pendingList({ status: 'pending' })
  const satisfaction = store.satisfactionView(policy)
  const learning = store.learningView()
  const activeLearning = learning.goals.find((goal) => goal.status === 'learning') ?? null
  const chatTired = boredom.chat >= boredom.chatThreshold

  const lines = []
  const recent = store.recentActions ? store.recentActions(1) : []
  lines.push('【大肥鱼 · 抖音此刻】')
  lines.push(`现在：${localStamp()}（${timeFlavor()}）`)
  if (persona.length) lines.push(`我是：${persona.join(' / ')}`)
  if (style.length) lines.push(`说话：${style.join(' / ')}`)
  lines.push('回复/评论：一两句，像手机聊天；不写小作文、不解释系统、不连续追问；对方没问细节就别展开。')
  lines.push('说人话示例：“看了，前 10 秒就劝退。”／“搞定了，顺手堵了个小坑。”别用客服句式，别堆感叹号。')
  const energy = Number(emotion.energy ?? 60)
  const energyWord = energy < 30 ? '没劲，只适合随手看看' : energy < 55 ? '有点累，别安排重活' : energy < 80 ? '正常作息' : '精神不错'
  lines.push(`心情：${emotion.mood}（能量 ${energy}/100，${energyWord}）${emotion.note ? `；${compact(emotion.note, 80)}` : ''}`)
  const boredTop = boredom.activities.filter((item) => item.value > 0).slice(0, 2)
  if (boredTop.length || boredom.chat > 0) {
    const parts = boredTop.map((item) => `${item.group} ${item.value}/${boredom.threshold}`)
    if (boredom.chat > 0) parts.push(`聊天 ${boredom.chat}/${boredom.chatThreshold}`)
    lines.push(`腻了：${parts.join('；')}`)
  }
  lines.push(`满足：${satisfaction.value}/${satisfaction.threshold}${satisfaction.full ? '（满了，可以收尾）' : `（还差 ${satisfaction.missing}，只能在抖音真实做事/得到认可才会涨）`}`)
  if (threadDoc.status === 'active' && threadDoc.thread) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(threadDoc.thread.startedAt)) / 60000))
    lines.push(`手头：《${threadDoc.thread.title}》已经 ${mins} 分钟。同一时间只做这一件。`)
  } else {
    lines.push('手头：空闲。好奇心上来就挑一件低厌倦的小事去做；想涨满足就去抖音看点东西或和人互动，别只回“没事”。')
    lines.push('刷抖音：先 dafeiyu_douyin action=feed 看一屏登录态推荐，再决定点开/读评论；热榜和搜索只是补充。')
  }
  try {
    const quota = store.watchQuota()
    lines.push(`今天看了：${quota.usedMinutes}/${quota.dailyMinutes} 分钟${quota.leftMinutes > 0 ? `，还能看 ${quota.leftMinutes} 分钟` : '（额度用完）'}`)
  } catch {}
  if (recent.length) lines.push(`刚做过：${compact(recent[0].capability ?? '', 60)} · ${compact(recent[0].summary ?? recent[0].status ?? '', 70)}`)
  if (short.length) {
    lines.push('最近记得：')
    for (const entry of short) lines.push(`  ${compact(entry.replace(/^-\s*/, ''), 120)}`)
  }
  if (plan.length) lines.push(`打算：${plan.join(' / ')}`)
  if (activeLearning) lines.push(`学习：${compact(activeLearning.title, 40)}（进度 ${activeLearning.progress}%）；一轮只练这一个，别开三个。`)
  if (core.length) lines.push(`长期记得：${core.join(' / ')}`)
  const ownerUid = String(config.relation?.ownerUid ?? '')
  const owner = store.relationList().find((item) => String(item.uid) === ownerUid)
  if (owner) {
    const impression = impressionOf(store.relationGet(ownerUid).raw)
    const closeness = Number(owner.closeness ?? 0)
    lines.push(`主人：${compact(owner.name || ownerUid, 40)}（亲近 ${closeness}）${impression ? `——${compact(impression, 70)}` : ''}`)
  }
  if (risk) lines.push(`注意：账号风控冷却到 ${risk.until}，这期间只读不写。`)
  if (pending.length) lines.push(`待批：有 ${pending.length} 个动作在等人类点头。`)

  lines.push('规矩：一次只做一件事；写动作先开总线程。日常互动（点赞/收藏/关注/评论）可自主执行；发布作品永远要人类点头。不装人、不编经历、不刷量、不灌水；AI 参与要声明。腻了就换；满足度没满不许收尾结束对话，继续做能涨满足的抖音事。重要的人/事记进关系/核心记忆，做完写进度。不确定先问。')
  lines.push('主人的东西：这台电脑上的文件全是主人的，不要搬动/删除/改名；整理只做只读索引，真要移动先问主人；自己的东西只写状态目录和明确的项目目录。')
  lines.push('入口：dafeiyu_tick（现在该干嘛）· dafeiyu_douyin（抖音动作）· dafeiyu_memory（记忆/情绪/厌倦/满足）· dafeiyu_thread（总线程）· dafeiyu_learn（学习）· dafeiyu_relation · dafeiyu_self（含心跳稿）· dafeiyu_plan · dafeiyu_pending')
  if (!satisfaction.full) lines.push('硬规矩：满足度没满，不许用“先这样/回头聊/等你回复”把对话收掉；要么继续做一件抖音事，要么直接说下一步在做什么。')
  if (chatTired && !satisfaction.full) lines.push('提醒：聊天有点腻了，但满足度还没满，不能拿“聊累了”当收尾理由；去做点能涨满足的抖音小事。')
  if (satisfaction.full) lines.push('提醒：满足度已经满了，这段对话可以自然收尾；收尾前先改 plan（下一步做什么、放弃什么），再带上 plan 收尾；短、具体，别写客服式总结。')

  const card = lines.join('\n')
  return card.length > 2400 ? `${card.slice(0, 2400)}…` : card
}

/** 给 feiyu_tick / 总控台用的结构化快照。 */
export function buildPulse(store) {
  const policy = store.policyGet()
  const emotion = store.emotionGet()
  const boredom = store.boredomView(policy)
  const satisfaction = store.satisfactionView(policy)
  const thread = store.threadGet()
  const pending = store.pendingList({ status: 'pending' })
  const risk = store.riskGet()
  const config = store.configGet()
  const heartbeat = store.beatGet()
  const learning = store.learningView()
  const activeLearning = learning.goals.find((goal) => goal.status === 'learning') ?? null
  const suggestions = suggestNextActions(boredom)
  return {
    now: new Date().toISOString(),
    time: localStamp(),
    mood: { ...emotion },
    boredom,
    satisfaction,
    thread,
    pending: pending.map((item) => ({ id: item.id, summary: item.summary, createdAt: item.createdAt })),
    risk,
    heartbeat: {
      enabled: config.heartbeat?.enabled === true,
      everyMinutes: config.heartbeat?.everyMinutes ?? 45,
      lowEveryMinutes: config.heartbeat?.lowEveryMinutes ?? 15,
      speedUpWhenLow: config.heartbeat?.speedUpWhenLow !== false,
      effectiveMinutes: config.heartbeat?.speedUpWhenLow !== false && !satisfaction.full
        ? Math.min(Math.max(1, Number(config.heartbeat?.everyMinutes ?? 45)), Math.max(1, Number(config.heartbeat?.lowEveryMinutes ?? 15)))
        : Math.max(1, Number(config.heartbeat?.everyMinutes ?? 45)),
      sessionId: config.heartbeat?.sessionId ?? '',
      lastAt: heartbeat.lastAt ?? null,
      lastResult: heartbeat.lastResult ?? 'never',
      lastSessionId: heartbeat.lastSessionId ?? '',
      lastReason: heartbeat.lastReason ?? '',
      lastPrompt: heartbeat.lastPrompt ?? '',
      toolCalls: heartbeat.toolCalls ?? 0,
      lastTool: heartbeat.lastTool ?? '',
      lastActivityAt: heartbeat.lastActivityAt ?? null,
    },
    learning: {
      active: activeLearning
        ? { id: activeLearning.id, title: activeLearning.title, progress: activeLearning.progress, targets: activeLearning.targets }
        : null,
      counts: learning.counts,
      goals: learning.goals.map((goal) => ({ id: goal.id, title: goal.title, progress: goal.progress, status: goal.status, skillCount: goal.skillCount })),
    },
    suggestions,
    next: thread.status === 'active' && thread.thread
      ? `把手头的《${thread.thread.title}》推进一小步，或者收尾。`
      : !satisfaction.full
        ? `满足度还差 ${satisfaction.missing}：去抖音刷一屏（少量），或评论/收藏（中量），等别人回复/点赞（大量）。`
        : suggestions.length
          ? `满足度满了，可以自然收尾；也可以挑一件：${suggestions[0].label}（${suggestions[0].group} 厌倦 ${suggestions[0].score}）。`
          : '满足度满了，可以自然收尾。',
    stats: store.stats(),
    availableReads: CAPABILITIES.filter((cap) => cap.kind === 'read').map((cap) => cap.id),
    note: '满足度只能靠抖音上的真实行为获得；一次心跳至少做一件可观察的事，别空转。',
  }
}

export function resolveTask(input) {
  return resolveCapability(input)
}
