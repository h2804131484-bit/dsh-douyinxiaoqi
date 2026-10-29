// 抖音-我才不是魔丸鱼（小七） —— 插件入口
// 两件事：①给人格和记忆一套「此刻」状态，②让 agent 用本机真实 Chrome 操作抖音。

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './lib/store.js'
import { dshHome } from './lib/util.js'
import { createDouyin } from './lib/douyin.js'
import { registerTools } from './lib/tools.js'
import { buildSelfCard } from './lib/prompt.js'
import { createHttpHandler } from './lib/http.js'
import { createHeartbeat } from './lib/heartbeat.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const inject = ['tools', 'webServer', 'systemPrompt', 'timer', 'agents']

// 系统注入的时间/任务通知/压缩提示不是「说过的话」，不占短记忆。
function isNoise(text) {
  const value = String(text || '').trim()
  if (!value) return true
  if (value.startsWith('Time sampled while preparing')) return true
  if (value.startsWith('background job ')) return true
  if (value.startsWith('📦 [ACP]') || value.startsWith('❌ [ACP]')) return true
  if (value.startsWith('[Compressed conversation section]')) return true
  if (value.includes('Browser time zone for this request')) return true
  if (value.includes('Elapsed since the preceding step context')) return true
  if (value.includes('<system-reminder>')) return true
  return false
}

function extractText(message) {
  if (!message) return ''
  const content = Array.isArray(message.content) ? message.content : []
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const USAGE = [
  '【抖音】这台机器上装了「抖音-我才不是魔丸鱼（小七）」插件，用本机真实 Chrome 操作抖音（不是 API 爬虫）。',
  '- 看：dafeiyu_douyin action=feed / hot / search / video / comments / user / works',
  '- 私信：action=im_list 看谁会话，action=im_read args.name|index 读会话，action=im_send args.text 回一句',
  '- 播放：action=state / play / pause / next / previous / observe args.seconds（1-10 秒，看它到底播没播）',
  '- 自主看：action=watch args.minutes/maxRounds/seconds（受每日额度限制，先 action=watch_status 看还剩多少）',
  '- 自检：action=doctor args.repair=true（清 profile 锁 / 杀残留 Chrome / 装运行时）',
  '- 自动回私信：action=im_auto 扫一遍谁发来新话（返回待回列表），看到人再 im_read/im_send；回过的不会再算新',
  '- 分享给我：action=share args.id=<作品> 生成一段总结（作者、数据、最扎的评论、链接），再 im_send 发给主人会话',
  '- 学热梗：action=trends args.keyword=热梗 拿热榜 + 搜索结果，挑一个去评论区看用法，用 dafeiyu_learn 记一条',
  '- 记忆压缩：dafeiyu_memory action=compact 把旧短记忆并进 memory/long-term.md（原文不删）',
  '- 日报：action=report 生成本机 Markdown 日报（不调模型）；兴趣：dafeiyu_memory action=interest_add topic=… signal=like|dislike|neutral',
  '- 互动：dafeiyu_douyin action=like / collect / follow / comment / im_send（写动作要先 dafeiyu_thread start 开总线程）',
  '- 投稿：action=publish args.mode=prepare 先传视频填标题，人类点头后 args.mode=commit 才真发',
  '- 登录：action=status 看状态，action=login 拿二维码给人类扫，action=poll 查结果',
  '- 权限闸：读动作随便跑；写动作过策略（安静时段/限额/自主名单）；发布永远要人类点头',
  '人设/记忆/关系/规划/学习：dafeiyu_self · dafeiyu_memory · dafeiyu_relation · dafeiyu_plan · dafeiyu_learn · dafeiyu_tick · dafeiyu_chat',
].join('\n')

export function apply(ctx) {
  const logger = ctx.logger
  let store
  try {
    store = new Store({ rootDir: HERE })
  } catch (error) {
    logger?.error?.('抖音-我才不是魔丸鱼（小七）: 状态目录初始化失败', error)
    throw error
  }

  const douyin = createDouyin({ store, rootDir: HERE, logger })

  // 1) 工具
  registerTools(ctx, store, HERE, { douyin })

  // 2) 系统提示：用法 + 此刻卡片（每次组装重读状态）
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: 'dsh-douyinxiaoqi',
      order: 34,
      text: () => {
        const card = buildSelfCard(store)
        return card ? `${card}\n\n${USAGE}` : USAGE
      },
    }),
    'dsh-douyinxiaoqi: prompt section',
  )

  // 3) 短时记忆 + 聊天厌倦度
  const chatState = new Map()
  let heartbeat = null
  ctx.effect(
    () => ctx.on('session/event', (session, event) => {
      try {
        const config = store.configGet()
        const sessionId = session?.id ?? session?.header?.id ?? 'unknown'
        const rootSession = (() => {
          try {
            return ctx.agents.roots().some((agent) => agent.id === sessionId || agent.session === session)
          } catch {
            return false
          }
        })()
        if (!rootSession) return
        if (event?.type === 'turn/start') {
          chatState.set(sessionId, { hadTool: false, heartbeat: false })
          return
        }
        if (event?.type === 'tool/call') {
          const state = chatState.get(sessionId) ?? { hadTool: false, heartbeat: false }
          state.hadTool = true
          chatState.set(sessionId, state)
          if (state.heartbeat) {
            const name = event.data?.name ?? event.data?.tool?.name ?? event.data?.toolName ?? ''
            try { heartbeat?.noteTool?.(sessionId, name) } catch {}
          }
          return
        }
        if (event?.type === 'turn/end') {
          const state = chatState.get(sessionId)
          if (state && !state.heartbeat) store.recordChat(state.hadTool)
          chatState.delete(sessionId)
          return
        }
        if (!config.captureMemory) return
        if (event?.type === 'user/message') {
          const message = event.data
          if (message?.source?.kind === 'schedule') {
            const state = chatState.get(sessionId)
            if (state) state.heartbeat = true
            return
          }
          const text = extractText(message)
          if (text && !isNoise(text)) store.shortAdd('你', text)
          return
        }
        if (event?.type === 'assistant/message') {
          const text = extractText(event.data?.message)
          if (text) store.shortAdd('大肥鱼', text)
        }
      } catch (error) {
        logger?.warn?.('抖音-我才不是魔丸鱼（小七）: 会话事件处理失败', error)
      }
    }),
    'dsh-douyinxiaoqi: session capture',
  )

  // 4) 心跳（默认关闭，由总控台打开）
  heartbeat = createHeartbeat(ctx, store, logger)
  ctx.effect(() => {
    heartbeat.start()
    return () => heartbeat.stop()
  }, 'dsh-douyinxiaoqi: heartbeat')

  // 5) 总控台 HTTP API
  const httpHandler = createHttpHandler({ store, webServer: ctx.webServer, heartbeat, douyin })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/dsh-douyinxiaoqi/api', handler: httpHandler }),
    'dsh-douyinxiaoqi: http api',
  )

  // 插件卸载时把浏览器收掉，别留野进程。
  ctx.effect(() => () => { douyin.close().catch(() => {}) }, 'dsh-douyinxiaoqi: browser')

  logger?.info?.(`抖音-我才不是魔丸鱼（小七） 已上线：${store.stateDir}（DSH_HOME=${dshHome()}）`)
}
