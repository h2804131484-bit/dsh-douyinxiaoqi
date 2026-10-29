// 大肥鱼·抖音版 —— 状态存储
// 只做这一个插件要用的东西：配置、策略、审批队列、总线程、动作日志、风控冷却。
// 全部落在 <DSH_HOME>/dafeiyu-douyin 下，纯 JSON，删目录等于重置。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  return path.join(os.homedir(), '.dsh')
}

export function nowIso() {
  return new Date().toISOString()
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function hashArgs(args) {
  const clean = JSON.stringify(args ?? {}, Object.keys(args ?? {}).sort())
  return crypto.createHash('sha1').update(clean).digest('hex').slice(0, 16)
}

export const DEFAULT_CONFIG = {
  // 浏览器跑在你自己机器上，用真实 Chrome + 持久化 profile。
  douyin: {
    headless: false,          // 无头模式会被抖音识别成爬虫，别关
    channel: 'chrome',
    chromePath: '',
    playwrightPath: '',       // 想复用已装的 playwright-core，填绝对路径
    autoInstall: true,        // 首次使用时把 playwright-core 装进状态目录
    timeoutMs: 30000,
  },
  // 权限闸：写动作默认按这里判。
  policy: {
    autonomy: 'high',         // high = 日常互动走 autoApprove，不用人工点头
    autoApprove: [
      'douyin.like',
      'douyin.collect',
      'douyin.follow',
      'douyin.comment',
    ],
    // 发布作品永远要人类点头，不受 autonomy 影响。
    alwaysAsk: ['douyin.publish'],
    quietHours: { enabled: true, start: '23:30', end: '08:30', allowRead: true },
    limits: {
      'douyin.like': { perHour: 30, perDay: 300 },
      'douyin.collect': { perHour: 20, perDay: 200 },
      'douyin.follow': { perDay: 10 },
      'douyin.comment': { perHour: 2, perDay: 20 },
      'douyin.publish': { perDay: 2 },
    },
    approvalTtlMin: 120,
  },
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch
  if (typeof base !== 'object' || base === null) return patch === undefined ? base : patch
  if (typeof patch !== 'object' || patch === null) return patch === undefined ? base : patch
  const out = { ...base }
  for (const key of Object.keys(patch)) out[key] = deepMerge(base[key], patch[key])
  return out
}

export function createStore({ rootDir }) {
  const stateDir = path.join(dshHome(), 'dafeiyu-douyin')
  const files = {
    config: path.join(stateDir, 'config.json'),
    policy: path.join(stateDir, 'policy.json'),
    state: path.join(stateDir, 'state.json'),
    thread: path.join(stateDir, 'thread.json'),
    pending: path.join(stateDir, 'pending.json'),
    actions: path.join(stateDir, 'actions.jsonl'),
    risk: path.join(stateDir, 'risk.json'),
  }

  function ensure() {
    fs.mkdirSync(stateDir, { recursive: true })
  }

  return {
    rootDir,
    stateDir,
    files,
    ensure,

    // ---- 配置 ----
    configGet() {
      ensure()
      return deepMerge(structuredClone(DEFAULT_CONFIG), readJson(files.config, {}))
    },
    configSet(patch) {
      ensure()
      const next = deepMerge(this.configGet(), patch ?? {})
      writeJson(files.config, next)
      return next
    },

    // ---- 策略 ----
    policyGet() {
      ensure()
      return deepMerge(DEFAULT_CONFIG.policy, readJson(files.policy, {}))
    },
    policySet(patch) {
      ensure()
      const next = deepMerge(this.policyGet(), patch ?? {})
      writeJson(files.policy, next)
      return next
    },

    // ---- 登录态快照（真 cookie 由 douyin.js 自己存在 douyin/secrets 下）----
    loginGet() {
      const s = readJson(files.state, {})
      return s.login ?? { ok: false }
    },
    loginSet(data) {
      const s = readJson(files.state, {})
      const next = { ...s, login: { ...(data ?? {}), checkedAt: nowIso() } }
      writeJson(files.state, next)
      return next.login
    },
    stateGet() {
      return readJson(files.state, {})
    },

    // ---- 总线程：一次只做一件事 ----
    threadGet() {
      return readJson(files.thread, null)
    },
    threadStart({ title, capability = 'task.social', note = '' }) {
      const current = this.threadGet()
      if (current && current.status === 'active') {
        return { ok: false, error: `已经有活了：《${current.title}》，先收尾或放弃`, thread: current }
      }
      const thread = {
        id: `t${Date.now().toString(36)}`,
        title: String(title || '').trim() || '未命名任务',
        capability,
        note,
        status: 'active',
        startedAt: nowIso(),
        steps: note ? [{ at: nowIso(), note }] : [],
      }
      writeJson(files.thread, thread)
      return { ok: true, thread }
    },
    threadStep(note) {
      const t = this.threadGet()
      if (!t || t.status !== 'active') return { ok: false, error: '现在没有进行中的活' }
      t.steps = [...(t.steps ?? []), { at: nowIso(), note: String(note ?? '') }].slice(-40)
      t.updatedAt = nowIso()
      writeJson(files.thread, t)
      return { ok: true, thread: t }
    },
    threadFinish(result = '', outcome = 'done') {
      const t = this.threadGet()
      if (!t || t.status !== 'active') return { ok: false, error: '现在没有进行中的活' }
      t.status = outcome
      t.result = String(result ?? '')
      t.outcome = outcome
      t.finishedAt = nowIso()
      writeJson(files.thread, t)
      return { ok: true, thread: t }
    },
    threadAbandon(reason = '') {
      return this.threadFinish(reason, 'abandoned')
    },
    ensureActiveThread() {
      const t = this.threadGet()
      return Boolean(t && t.status === 'active')
    },

    // ---- 审批队列 ----
    pendingList(status = 'pending') {
      const all = readJson(files.pending, [])
      const list = status ? all.filter((x) => x.status === status) : all
      return list.slice(-50).reverse()
    },
    pendingGet(id) {
      return readJson(files.pending, []).find((x) => x.id === id) ?? null
    },
    pendingCreate({ capability, args, summary, reason }) {
      const all = readJson(files.pending, [])
      const policy = this.policyGet()
      const ttl = Number(policy.approvalTtlMin ?? 120)
      const item = {
        id: `ap${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`,
        capability,
        args: args ?? {},
        argsHash: hashArgs(args ?? {}),
        summary,
        reason,
        status: 'pending',
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + ttl * 60000).toISOString(),
      }
      all.push(item)
      writeJson(files.pending, all.slice(-200))
      return item
    },
    pendingDecide(id, decision, note = '') {
      const all = readJson(files.pending, [])
      const item = all.find((x) => x.id === id)
      if (!item) return { ok: false, error: '没这条审批' }
      if (item.status !== 'pending') return { ok: false, error: `这条已经是 ${item.status} 了` }
      item.status = decision === 'approve' ? 'approved' : 'rejected'
      item.decidedAt = nowIso()
      item.note = note
      writeJson(files.pending, all)
      return { ok: true, item }
    },
    pendingConsume(id, capability, argsHash) {
      const all = readJson(files.pending, [])
      const item = all.find((x) => x.id === id)
      if (!item) return { ok: false, error: '审批项不存在' }
      if (item.status !== 'approved') return { ok: false, error: '这条还没被批准' }
      if (item.capability !== capability) return { ok: false, error: '审批项和这次动作不是一回事' }
      if (item.argsHash !== argsHash) return { ok: false, error: '审批通过时带的参数和这次不一样，重新申请一次' }
      if (item.expiresAt && Date.parse(item.expiresAt) < Date.now()) return { ok: false, error: '审批过期了，重新申请一次' }
      item.status = 'executed'
      item.executedAt = nowIso()
      writeJson(files.pending, all)
      return { ok: true, item }
    },

    // ---- 动作日志 & 限额 ----
    logAction(entry) {
      ensure()
      try {
        fs.appendFileSync(files.actions, `${JSON.stringify({ at: nowIso(), ...entry })}\n`)
      } catch {}
    },
    recentActions(limit = 200) {
      try {
        return fs
          .readFileSync(files.actions, 'utf8')
          .split('\n')
          .filter(Boolean)
          .slice(-limit)
          .map((line) => {
            try { return JSON.parse(line) } catch { return null }
          })
          .filter(Boolean)
          .reverse()
      } catch {
        return []
      }
    },
    countSince(capability, sinceMs) {
      const since = Date.now() - sinceMs
      return this.recentActions(500).filter(
        (x) => x.capability === capability && x.status === 'done' && Date.parse(x.at) >= since,
      ).length
    },
    stats() {
      const list = this.recentActions(500)
      const done = list.filter((x) => x.status === 'done')
      return {
        total: list.length,
        done: done.length,
        failed: list.filter((x) => x.status === 'error').length,
        lastAt: list[0]?.at ?? null,
      }
    },

    // ---- 风控冷却 ----
    riskGet() {
      return readJson(files.risk, { until: 0, reason: '' })
    },
    riskSet(minutes, reason = '') {
      const risk = { until: Date.now() + Math.max(1, minutes) * 60000, reason, at: nowIso() }
      writeJson(files.risk, risk)
      return risk
    },
    riskClear() {
      const risk = { until: 0, reason: '' }
      writeJson(files.risk, risk)
      return risk
    },
  }
}
