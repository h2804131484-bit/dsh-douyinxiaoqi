// 抖音-我才不是魔丸鱼（小七） —— 权限闸
// 每个写动作都从这里过一遍：冷却 → 安静时段 → 限额 → 自主/审批。

import { hashArgs } from './store.js'

function withinQuietHours(policy) {
  const quiet = policy.quietHours ?? {}
  if (!quiet.enabled) return false
  const [sh, sm] = String(quiet.start || '23:30').split(':').map(Number)
  const [eh, em] = String(quiet.end || '08:30').split(':').map(Number)
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const start = sh * 60 + sm
  const end = eh * 60 + em
  if (start === end) return false
  return start < end ? cur >= start && cur < end : cur >= start || cur < end
}

function windowStart(minutes) {
  return Date.now() - minutes * 60000
}

export function limitFor(policy, capabilityId) {
  return (policy.limits ?? {})[capabilityId] ?? null
}

export function approvalSummary(cap, args = {}) {
  const a = args ?? {}
  switch (cap?.id) {
    case 'douyin.comment':
      return `在抖音作品 ${a.id ?? '?'} 发评论：${String(a.text ?? '').slice(0, 60)}`
    case 'douyin.publish':
      return `发布抖音作品：${a.title || a.videoPath || '?'}`
    case 'douyin.follow':
      return `关注抖音用户：${a.secUid || a.nickname || '?'}`
    case 'douyin.like':
      return `给抖音作品 ${a.id ?? '?'} 点赞`
    case 'douyin.collect':
      return `收藏抖音作品 ${a.id ?? '?'}`
    default:
      return `${cap?.label ?? '动作'} ${JSON.stringify(a).slice(0, 80)}`
  }
}

/**
 * 判定一次动作能不能做。
 * 返回 { decision: 'allow' | 'deny' | 'ask' | 'pending' | 'approved', ... }
 */
export function check(store, capability, args = {}, options = {}) {
  const { dryRun = false, approvalId = null } = options
  const policy = store.policyGet()
  const cap = capability
  if (!cap) return { decision: 'deny', code: 'UNKNOWN_CAPABILITY', reason: '不认识这个动作' }

  const isWrite = cap.kind === 'write' || cap.kind === 'publish'

  // 只读动作：安静时段也允许（默认 allowRead），风控冷却期除外。
  if (!isWrite) {
    const risk = store.riskGet() || {}
    const riskUntil = risk.until ? Date.parse(risk.until) : 0
    if (Number.isFinite(riskUntil) && riskUntil > Date.now()) {
      return { decision: 'deny', code: 'RISK_COOLDOWN', reason: `风控冷却中：${risk.reason || '刚才碰到验证码'}`, until: risk.until }
    }
    return { decision: 'allow', capability: cap.id }
  }

  // 带了审批 id：校验通过就直接执行。
  if (approvalId) {
    const item = store.pendingGet(approvalId)
    if (!item) return { decision: 'deny', code: 'NO_APPROVAL', reason: '这条审批项不存在' }
    if (item.status === 'rejected') return { decision: 'deny', code: 'REJECTED', reason: '人类拒绝了这条' }
    if (item.status === 'executed') return { decision: 'deny', code: 'ALREADY_EXECUTED', reason: '这条审批已经用过了' }
    if (item.status !== 'approved') return { decision: 'deny', code: 'NOT_APPROVED', reason: '这条还在等人点头' }
    if (item.capability !== cap.id) return { decision: 'deny', code: 'MISMATCH', reason: '审批项和这次动作不是一回事' }
    const argsHash = hashArgs(args)
    if (item.argsHash !== argsHash) return { decision: 'deny', code: 'ARGS_CHANGED', reason: '参数和审批时不一样，重新申请' }
    return { decision: 'approved', approvalId, argsHash }
  }

  const risk = store.riskGet() || {}
  const riskUntil = risk.until ? Date.parse(risk.until) : 0
  if (Number.isFinite(riskUntil) && riskUntil > Date.now()) {
    return { decision: 'deny', code: 'RISK_COOLDOWN', reason: `风控冷却中：${risk.reason || '刚才碰到验证码'}`, until: risk.until }
  }

  if (withinQuietHours(policy)) {
    return {
      decision: 'deny',
      code: 'QUIET_HOURS',
      reason: `现在是安静时段（${policy.quietHours.start}–${policy.quietHours.end}），不写东西。可以看，可以想，别发。`,
    }
  }

  const limit = limitFor(policy, cap.id)
  if (limit?.perHour && store.countSince(cap.id, 3600000) >= limit.perHour) {
    return { decision: 'deny', code: 'LIMIT_HOUR', reason: `${cap.label}这一小时已经做了 ${limit.perHour} 次，歇会儿` }
  }
  if (limit?.perDay && store.countSince(cap.id, 86400000) >= limit.perDay) {
    return { decision: 'deny', code: 'LIMIT_DAY', reason: `${cap.label}今天已经做了 ${limit.perDay} 次，明天再说` }
  }

  if (dryRun) {
    return {
      decision: 'allow',
      dryRun: true,
      capability: cap.id,
      limits: limit ?? null,
      usedHour: store.countSince(cap.id, 3600000),
      usedDay: store.countSince(cap.id, 86400000),
    }
  }

  const alwaysAsk = (policy.alwaysAsk ?? []).includes(cap.id)
  const auto = policy.autonomy === 'high' && (policy.autoApprove ?? []).includes(cap.id)
  if (alwaysAsk || !auto) {
    const item = store.pendingCreate({
      capability: cap.id,
      args,
      summary: approvalSummary(cap, args),
      reason: alwaysAsk ? '这个动作固定要人类点头' : '策略里没给这个动作自主权',
    })
    return {
      decision: 'pending',
      code: 'NEED_APPROVAL',
      pendingId: item.id,
      summary: item.summary,
      reason: '已经放进审批队列，等人类点头',
    }
  }

  return { decision: 'allow', capability: cap.id }
}

/** 结果里带 -352 / -412 / captcha 就认为撞风控了。 */
export function riskFromResult(result) {
  if (!result) return null
  let text = ''
  try {
    text = JSON.stringify(result, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)) ?? ''
  } catch {
    text = ''
  }
  text = text.slice(0, 4000)
  if (/-352|-412|captcha|验证码中间页|too frequent|访客频繁/i.test(text)) {
    return { hit: true, minutes: 1440, reason: text.match(/验证码中间页|captcha|-352|-412[^"]*/i)?.[0] ?? '风控' }
  }
  return null
}
