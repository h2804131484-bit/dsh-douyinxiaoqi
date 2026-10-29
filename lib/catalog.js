// 抖音-我才不是魔丸鱼（小七） —— 能力表
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
  read('report', '账号', '生成本机观看日报（不调模型）', 2, { kind: 'account' }),
  read('im_list', '找人', '看私信会话列表（谁发来、最后一句话、未读）', 4),
  read('im_read', '找人', '读某个会话的私信', 4),
  read('state', '看', '看当前播放状态（哪个作品、播到哪、是不是暂停）', 2),
  read('play', '看', '点播放', 3),
  read('pause', '看', '暂停', 3),
  read('next', '看', '划到下一个作品', 3),
  read('previous', '看', '回到上一个作品', 3),
  read('observe', '看', '观察当前作品几秒，看它播没播、我停没停住', 4),
  read('watch', '看', '自主看一会儿（划下一个、停留观察，受每日额度限制）', 3),
  read('watch_status', '看', '看今天的观看额度（还能看多久）', 1),
  read('doctor', '账号', '自检并修：运行时 / profile 锁 / 残留 Chrome / 登录态', 1, { kind: 'account' }),

  write('like', '互动', '给作品点赞', 6),
  write('collect', '互动', '收藏作品', 6),
  write('follow', '互动', '关注一个人', 10),
  write('comment', '互动', '在作品下评论', 18),
  write('im_send', '互动', '回复私信', 16, { autoApproveOk: true }),
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
  ['inbox', 'im_list'],
  ['messages', 'im_list'],
  ['dm', 'im_read'],
  ['im', 'im_list'],
  ['reply', 'im_send'],
  ['star', 'collect'],
  ['current', 'state'],
  ['skip', 'next'],
  ['back', 'previous'],
  ['daily', 'report'],
  ['watch_report', 'report'],
  ['autowatch', 'watch'],
  ['binge', 'watch'],
  ['quota', 'watch_status'],
  ['budget', 'watch_status'],
  ['checkup', 'doctor'],
  ['repair', 'doctor'],
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
