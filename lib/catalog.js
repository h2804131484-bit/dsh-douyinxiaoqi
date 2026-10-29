// 大肥鱼·抖音版 —— 能力表
// 一个动作 = 一条能力：id 形如 douyin.feed。读的随便跑，写的过权限闸。

export const GROUPS = ['看', '找人', '互动', '发布', '账号']

function read(action, group, label, weight, extra = {}) {
  return { id: `douyin.${action}`, action, group, label, weight, kind: 'read', default: 'allow', ...extra }
}

function write(action, group, label, weight, extra = {}) {
  return {
    id: `douyin.${action}`,
    action,
    group,
    label,
    weight,
    kind: 'write',
    default: 'ask',
    needsThread: true,
    ...extra,
  }
}

export const CAPABILITIES = [
  read('status', '账号', '看抖音环境与登录态', 1, { kind: 'account' }),
  read('feed', '看', '刷推荐流', 4),
  read('hot', '看', '看热榜', 3),
  read('search', '看', '搜作品', 3),
  read('video', '看', '看作品详情', 2),
  read('comments', '看', '读作品评论', 3),
  read('user', '找人', '看某个人的主页与作品', 3),
  read('works', '账号', '看自己发过的作品', 2, { kind: 'account' }),

  write('like', '互动', '给作品点赞', 6),
  write('collect', '互动', '收藏作品', 6),
  write('follow', '互动', '关注一个人', 10),
  write('comment', '互动', '在作品下评论', 18),
  write('publish', '发布', '发布作品', 25, { kind: 'publish', default: 'ask' }),
]

export const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]))

const ALIASES = new Map([
  ['recommend', 'feed'],
  ['home_feed', 'feed'],
  ['trending', 'hot'],
  ['rank', 'hot'],
  ['detail', 'video'],
  ['info', 'video'],
  ['comment_list', 'comments'],
  ['profile', 'user'],
  ['mine', 'works'],
  ['favorite', 'collect'],
  ['star', 'collect'],
])

/** 接受 feed / douyin.feed 两种写法，返回能力对象或 null。 */
export function resolveCapability(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  const name = raw.replace(/^douyin[.:]/, '')
  if (BY_ID.has(`douyin.${name}`)) return BY_ID.get(`douyin.${name}`)
  const alias = ALIASES.get(name)
  if (alias && BY_ID.has(`douyin.${alias}`)) return BY_ID.get(`douyin.${alias}`)
  return null
}

export function capabilitiesByKind(kind) {
  return CAPABILITIES.filter((c) => c.kind === kind)
}

export function groupOf(cap) {
  return cap?.group ?? '其他'
}

export function catalogView() {
  const rows = CAPABILITIES.map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group,
    kind: c.kind,
    needsThread: Boolean(c.needsThread),
  }))
  return {
    read: rows.filter((r) => r.kind === 'read' || r.kind === 'account').length,
    write: rows.filter((r) => r.kind === 'write' || r.kind === 'publish').length,
    capabilities: rows,
  }
}
