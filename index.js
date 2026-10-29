// 大肥鱼·抖音版 —— 插件入口
// 一个插件只干一件事：让 agent 用本机真实 Chrome 操作抖音（看 + 互动 + 投稿）。

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStore, dshHome } from './lib/store.js'
import { createDouyin } from './lib/douyin.js'
import { registerTools } from './lib/tools.js'
import { createHttpHandler } from './lib/http.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const inject = ['tools', 'webServer', 'systemPrompt']

const PROMPT = [
  '【抖音】这台机器上装了「大肥鱼·抖音版」插件，用本机真实 Chrome 操作抖音（不是 API 爬虫）。',
  '- 看：dafeiyu_douyin action=feed / hot / search / video / comments / user / works',
  '- 互动：dafeiyu_douyin action=like / collect / follow / comment（写动作要先 dafeiyu_douyin_thread start 开总线程）',
  '- 投稿：action=publish args.mode=prepare 先传视频填标题，人类点头后 args.mode=commit 才真发',
  '- 登录：action=status 看状态，action=login 拿二维码给人类扫，action=poll 查结果',
  '- 权限闸：读动作随便跑；写动作过策略（安静时段/限额/自主名单）；发布永远要人类点头',
  '账号类/环境类动作（status/login/poll/check/logout/setup/open/close/shot）不需要总线程。',
].join('\n')

export function apply(ctx) {
  const logger = ctx.logger
  const store = createStore({ rootDir: HERE })
  store.ensure()

  const douyin = createDouyin({ store, rootDir: HERE, logger })

  registerTools(ctx, store, HERE, { douyin })

  ctx.effect(
    () => ctx.systemPrompt.section({
      name: 'dafeiyu-douyin',
      order: 34,
      text: () => PROMPT,
    }),
    'dafeiyu-douyin: prompt section',
  )

  const httpHandler = createHttpHandler({ store, webServer: ctx.webServer, douyin })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/dafeiyu-douyin/api', handler: httpHandler }),
    'dafeiyu-douyin: http api',
  )

  // 插件卸载时把浏览器收掉，别留野进程。
  ctx.effect(() => () => { douyin.close().catch(() => {}) }, 'dafeiyu-douyin: browser')

  logger?.info?.(`大肥鱼·抖音版已上线：${store.stateDir}（DSH_HOME=${dshHome()}）`)
}
