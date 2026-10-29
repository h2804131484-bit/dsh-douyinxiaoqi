// 大肥鱼·抖音版 —— 总控台页面
// 设置 → 大肥鱼·抖音：看状态、扫码登录、刷一屏推荐、改权限开关。

window.__ModuleLoader__.load({
  id: '@local/dafeiyu-douyin',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useCallback, useRef } = React
    const h = React.createElement

    const C = {
      text: 'var(--dsw-alias-label-primary, #e9e9ee)',
      sub: 'var(--dsw-alias-label-secondary, #9b9ba4)',
      faint: 'var(--dsw-alias-label-tertiary, #77777f)',
      border: 'var(--dsw-alias-border-secondary, #3a3a42)',
      panel: 'var(--dsw-alias-bg-secondary, #1d1d22)',
      base: 'var(--dsw-alias-bg-primary, #151518)',
      accent: 'var(--dsw-alias-state-success, #35c88a)',
      warn: 'var(--dsw-alias-state-warning, #e5a53a)',
      danger: 'var(--dsw-alias-state-danger, #e06060)',
      info: 'var(--dsw-alias-state-info, #5aa7ff)',
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 2px 28px', color: C.text, fontSize: '13px', lineHeight: 1.55 },
      header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '20px', fontWeight: 650 },
      sub: { margin: '6px 0 0', color: C.sub, fontSize: '12px' },
      row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      card: { border: `1px solid ${C.border}`, borderRadius: '10px', background: C.panel, padding: '14px', minWidth: 0 },
      cardTitle: { margin: '0 0 10px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
      grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' },
      input: { width: '100%', boxSizing: 'border-box', background: C.base, color: C.text, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '6px 8px', fontSize: '12px', outline: 'none' },
      btn: { border: `1px solid ${C.border}`, background: 'transparent', color: C.text, borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' },
      btnPrimary: { border: '1px solid transparent', background: C.info, color: '#fff', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' },
      pill: { display: 'inline-flex', alignItems: 'center', gap: '5px', border: `1px solid ${C.border}`, borderRadius: '999px', padding: '2px 9px', fontSize: '11px', color: C.sub, whiteSpace: 'nowrap' },
      dot: (on) => ({ width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', background: on ? C.accent : C.faint }),
      notice: { border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: C.sub, background: C.panel },
      item: { display: 'flex', gap: '10px', padding: '8px 0', borderBottom: `1px solid var(--dsw-alias-border-tertiary, #2c2c33)` },
      cover: { width: '84px', height: '112px', borderRadius: '6px', objectFit: 'cover', background: C.base, flex: '0 0 auto' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '11.5px', color: C.sub },
      qr: { width: '190px', height: '190px', borderRadius: '8px', background: '#fff', padding: '6px' },
    }

    async function api(path, options = {}) {
      const res = await fetch(`/dafeiyu-douyin/api${path}`, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json', 'x-dafeiyu': '1' } : { 'x-dafeiyu': '1' },
        body: options.body ? JSON.stringify(options.body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data
    }

    function Pill({ on, children }) {
      return h('span', { style: S.pill }, h('span', { style: S.dot(on) }), children)
    }

    function DouyinTab() {
      const [status, setStatus] = useState(null)
      const [qr, setQr] = useState(null)
      const [feed, setFeed] = useState([])
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const [note, setNote] = useState('')
      const pollRef = useRef(null)

      const load = useCallback(async () => {
        try {
          const data = await api('/status')
          setStatus(data)
          setError('')
        } catch (e) {
          setError(String(e?.message || e))
        }
      }, [])

      useEffect(() => {
        load()
        return () => {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      }, [load])

      const run = async (label, fn) => {
        setBusy(label)
        setNote('')
        try {
          await fn()
        } catch (e) {
          setError(String(e?.message || e))
        } finally {
          setBusy('')
        }
      }

      const startLogin = () => run('login', async () => {
        const data = await api('/login/qr', { method: 'POST', body: {} })
        const payload = data.data ?? {}
        if (!payload.ok) throw new Error(payload.error || '拿不到二维码')
        setQr({ key: payload.key, img: payload.qr })
        setNote('用抖音 App 扫码，扫完这里会自动变')
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
          try {
            const r = await api('/login/poll', { method: 'POST', body: { key: payload.key } })
            const p = r.data ?? {}
            if (p.status === 'ok' || p.account) {
              clearInterval(pollRef.current)
              pollRef.current = null
              setQr(null)
              setNote(`已登录：${p.account?.nickname ?? ''}`)
              await load()
            } else if (p.status === 'scanned') {
              setNote('扫到了，等手机确认')
            } else if (p.status === 'expired') {
              clearInterval(pollRef.current)
              pollRef.current = null
              setQr(null)
              setNote('二维码过期了，再点一次扫码登录')
            }
          } catch {}
        }, 2600)
      })

      const readFeed = () => run('feed', async () => {
        const r = await api('/read', { method: 'POST', body: { action: 'feed', args: { limit: 8 } } })
        const data = r.data ?? {}
        if (data.ok === false) throw new Error(data.error || '刷不到，稍后再试')
        setFeed(Array.isArray(data.awemes) ? data.awemes : Array.isArray(data.items) ? data.items : [])
        setNote(`拿到 ${(data.awemes ?? data.items ?? []).length} 条`)
      })

      const st = status?.status ?? {}
      const policy = status?.policy ?? {}

      return h('div', { style: S.page },
        h('div', { style: S.header },
          h('div', null,
            h('h2', { style: S.title }, '大肥鱼 · 抖音'),
            h('p', { style: S.sub }, '用本机真实 Chrome 驱动抖音：看推荐、搜作品、读评论、互动、投稿。'),
          ),
          h('div', { style: S.row },
            h(Pill, { on: Boolean(st.installed) }, st.installed ? '运行时就绪' : '缺 playwright'),
            h(Pill, { on: Boolean(st.running) }, st.running ? '浏览器开' : '浏览器关'),
            h(Pill, { on: Boolean(st.loggedIn) }, st.loggedIn ? `已登录 ${st.account?.nickname ?? ''}` : '未登录'),
          ),
        ),

        busy ? h('div', { style: S.notice }, `正在跑：${busy}…`) : null,
        note ? h('div', { style: { ...S.notice, color: C.accent, borderColor: C.accent } }, note) : null,
        error ? h('div', { style: { ...S.notice, color: C.danger, borderColor: C.danger } }, error) : null,

        h('div', { style: S.grid2 },
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '环境与登录'),
            h('div', { style: S.row },
              h('button', { style: S.btn, onClick: () => run('setup', async () => { await api('/setup', { method: 'POST', body: {} }); await load() }) }, '装/更新运行时'),
              h('button', { style: S.btn, onClick: () => run('open', async () => { await api('/open', { method: 'POST', body: {} }); await load() }) }, '打开浏览器'),
              h('button', { style: S.btn, onClick: () => run('close', async () => { await api('/close', { method: 'POST', body: {} }); await load() }) }, '关掉浏览器'),
              h('button', { style: S.btnPrimary, onClick: startLogin }, '扫码登录'),
            ),
            qr ? h('div', { style: { marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' } },
              h('img', { src: qr.img, style: S.qr, alt: '抖音登录二维码' }),
              h('div', { style: S.mono }, '打开抖音 App → 右上角扫一扫。', h('br'), '别关这个页面，扫完会自动刷新状态。'),
            ) : null,
            h('div', { style: { ...S.mono, marginTop: '10px' } },
              `状态目录：${status?.status?.profileDir ?? '-'}`, h('br'),
              `最近动作：${status?.stats?.total ?? 0} 条 · 待批 ${status?.pending ?? 0}`,
            ),
          ),

          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '权限'),
            h('div', { style: S.mono },
              `自主程度：${policy.autonomy ?? '-'}`, h('br'),
              `自动放行：${(policy.autoApprove ?? []).join('、') || '无'}`, h('br'),
              `一定要人点头：${(policy.alwaysAsk ?? []).join('、') || '无'}`, h('br'),
              `安静时段：${policy.quietHours?.enabled ? `${policy.quietHours.start}–${policy.quietHours.end}` : '关'}`,
            ),
            h('div', { style: { ...S.row, marginTop: '10px' } },
              h('button', {
                style: S.btn,
                onClick: () => run('quiet', async () => {
                  const on = !policy.quietHours?.enabled
                  await api('/policy', { method: 'POST', body: { quietHours: { enabled: on } } })
                  await load()
                  setNote(`安静时段已${on ? '开启' : '关闭'}`)
                }),
              }, policy.quietHours?.enabled ? '关掉安静时段' : '开回安静时段'),
              h('button', {
                style: S.btn,
                onClick: () => run('reload', async () => { await load(); setNote('已刷新') }),
              }, '刷新'),
            ),
          ),
        ),

        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '刷一屏推荐', h('button', { style: S.btn, onClick: readFeed }, busy === 'feed' ? '刷着…' : '刷一屏')),
          feed.length === 0
            ? h('div', { style: S.notice }, '点「刷一屏」看看抖音现在推什么。第一次要等 10 秒左右。')
            : feed.map((item) => h('div', { key: item.id, style: S.item },
              item.cover ? h('img', { src: item.cover, style: S.cover, alt: '' }) : h('div', { style: S.cover }),
              h('div', { style: { minWidth: 0 } },
                h('div', { style: { fontWeight: 500 } }, String(item.desc || item.text || item.id).slice(0, 90)),
                h('div', { style: { ...S.mono, marginTop: '4px' } },
                  `${item.author?.nickname ?? ''} · ❤ ${item.stats?.digg ?? 0} · 💬 ${item.stats?.comment ?? 0} · ⭐ ${item.stats?.collect ?? 0}`),
                item.url ? h('a', { href: item.url, target: '_blank', rel: 'noreferrer', style: { ...S.mono, color: C.info } }, '打开') : null,
              ),
            )),
        ),

        h('div', { style: S.notice },
          '写动作（点赞/收藏/关注/评论）由 agent 用工具发起，会过权限闸；发布作品一定进审批队列。',
          h('br'),
          '这个页面只管环境、登录和看数据——不做写操作，避免手滑。',
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dafeiyu-douyin',
          order: 59,
          label: () => '大肥鱼·抖音',
        }, DouyinTab))
      },
    }
  },
})
