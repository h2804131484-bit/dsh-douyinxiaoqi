// 抖音 · 我才不是魔丸鱼（小七）—— 总控台（完整版，10 个页签）
// 设置 → 抖音…：人格、记忆、关系、规划、看片、自检都在一页；写动作只有审批和文档编辑两条人工路径。

window.__ModuleLoader__.load({
  id: 'dafeiyu-douyin',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useCallback, useRef } = React
    const h = React.createElement

    const C = {
      text: 'var(--dsw-alias-label-primary, #e9e9ee)',
      sub: 'var(--dsw-alias-label-secondary, #9b9ba4)',
      faint: 'var(--dsw-alias-label-tertiary, #77777f)',
      border: 'var(--dsw-alias-border-secondary, #3a3a42)',
      hair: 'var(--dsw-alias-border-tertiary, #2c2c33)',
      panel: 'var(--dsw-alias-bg-secondary, #1d1d22)',
      base: 'var(--dsw-alias-bg-primary, #151518)',
      accent: 'var(--dsw-alias-state-success, #35c88a)',
      warn: 'var(--dsw-alias-state-warning, #e5a53a)',
      danger: 'var(--dsw-alias-state-danger, #e06060)',
      info: 'var(--dsw-alias-state-info, #5aa7ff)',
      purple: '#a78bfa',
      pink: '#f472b6',
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 2px 32px', color: C.text, fontSize: '13px', lineHeight: 1.55 },
      header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '20px', fontWeight: 680, letterSpacing: '-0.02em' },
      sub: { margin: '4px 0 0', color: C.sub, fontSize: '12px' },
      row: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      col: { display: 'flex', flexDirection: 'column', gap: '10px' },
      tabs: { display: 'flex', gap: '2px', borderBottom: `1px solid ${C.hair}`, overflowX: 'auto' },
      tab: (on) => ({
        border: 'none', background: 'transparent', color: on ? C.text : C.faint, padding: '8px 12px',
        fontSize: '12.5px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'color .15s',
        borderBottom: `2px solid ${on ? C.info : 'transparent'}`, fontWeight: on ? 620 : 400,
      }),
      card: { border: `1px solid ${C.border}`, borderRadius: '12px', background: C.panel, padding: '14px', minWidth: 0 },
      cardTitle: { margin: '0 0 10px', fontSize: '12.5px', fontWeight: 620, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
      grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' },
      grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' },
      split: { display: 'grid', gridTemplateColumns: 'minmax(150px, 200px) minmax(0, 1fr)', gap: '12px' },
      input: { width: '100%', boxSizing: 'border-box', background: C.base, color: C.text, border: `1px solid ${C.border}`, borderRadius: '7px', padding: '7px 9px', fontSize: '12px', outline: 'none', fontFamily: 'inherit' },
      area: { width: '100%', boxSizing: 'border-box', background: C.base, color: C.text, border: `1px solid ${C.border}`, borderRadius: '7px', padding: '9px', fontSize: '12px', outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.65, resize: 'vertical' },
      btn: { border: `1px solid ${C.border}`, background: 'transparent', color: C.text, borderRadius: '7px', padding: '5px 11px', fontSize: '12px', cursor: 'pointer' },
      btnPrimary: { border: '1px solid transparent', background: C.info, color: '#fff', borderRadius: '7px', padding: '5px 11px', fontSize: '12px', cursor: 'pointer' },
      btnDanger: { border: '1px solid transparent', background: 'transparent', color: C.danger, borderRadius: '7px', padding: '5px 11px', fontSize: '12px', cursor: 'pointer' },
      pill: { display: 'inline-flex', alignItems: 'center', gap: '5px', border: `1px solid ${C.border}`, borderRadius: '999px', padding: '2px 9px', fontSize: '11px', color: C.sub, whiteSpace: 'nowrap' },
      dot: (on, warn) => ({ width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', background: on ? (warn ? C.warn : C.accent) : C.faint }),
      notice: { border: `1px solid ${C.border}`, borderRadius: '9px', padding: '9px 11px', fontSize: '12px', color: C.sub, background: C.panel },
      item: { display: 'flex', gap: '11px', padding: '9px 0', borderBottom: `1px solid ${C.hair}` },
      cover: { width: '72px', height: '96px', borderRadius: '7px', objectFit: 'cover', background: C.base, flex: '0 0 auto' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11.5px', color: C.sub },
      qr: { width: '184px', height: '184px', borderRadius: '10px', background: '#fff', padding: '6px' },
      docRow: (on) => ({ padding: '7px 9px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', background: on ? C.base : 'transparent', border: `1px solid ${on ? C.border : 'transparent'}`, marginBottom: '4px' }),
      bar: { height: '7px', borderRadius: '999px', background: C.base, overflow: 'hidden', border: `1px solid ${C.hair}` },
      barFill: (pct, color) => ({ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, transition: 'width .4s' }),
      hero: {
        border: `1px solid ${C.border}`, borderRadius: '14px', padding: '16px',
        display: 'flex', flexDirection: 'column', gap: '12px',
        background: 'linear-gradient(135deg, rgba(90,167,255,0.16), rgba(167,139,250,0.10) 48%, rgba(244,114,182,0.10))',
      },
      stat: { border: `1px solid ${C.hair}`, borderRadius: '10px', padding: '10px 12px', background: 'rgba(0,0,0,0.18)', minWidth: 0 },
      statLabel: { fontSize: '11px', color: C.faint },
      statValue: { fontSize: '17px', fontWeight: 650, marginTop: '2px' },
      th: { textAlign: 'left', padding: '6px 8px', color: C.faint, fontWeight: 500, fontSize: '11px', borderBottom: `1px solid ${C.hair}` },
      td: { padding: '6px 8px', borderBottom: `1px solid ${C.hair}`, verticalAlign: 'top' },
    }

    async function api(path, options = {}) {
      try {
        const res = await fetch(`/dafeiyu-douyin/api${path}`, {
          ...options,
          headers: { 'content-type': 'application/json', 'x-dafeiyu': '1', ...(options.headers || {}) },
        })
        const data = await res.json().catch(() => ({}))
        return data || {}
      } catch (error) {
        return { ok: false, error: String(error?.message || error) }
      }
    }

    function fmtClock(iso) {
      if (!iso) return '—'
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return '—'
      const p = (n) => String(n).padStart(2, '0')
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }
    function fmtNum(n) {
      const v = Number(n || 0)
      if (v >= 100000000) return `${(v / 100000000).toFixed(1)}亿`
      if (v >= 10000) return `${(v / 10000).toFixed(1)}万`
      return String(v)
    }

    function Pill({ on, children, warn }) {
      return h('span', { style: S.pill }, h('span', { style: S.dot(on, warn) }), children)
    }
    function Bar({ value = 0, max = 100, color = C.info }) {
      return h('div', { style: S.bar }, h('div', { style: S.barFill(max ? (value / max) * 100 : 0, color) }))
    }
    function Ring({ value = 0, max = 100, size = 64, color = C.info, label = '' }) {
      const pct = max ? Math.max(0, Math.min(1, value / max)) : 0
      const r = (size - 9) / 2
      const c = 2 * Math.PI * r
      return h('div', { style: { position: 'relative', width: `${size}px`, height: `${size}px`, flex: '0 0 auto' } },
        h('svg', { width: size, height: size, style: { transform: 'rotate(-90deg)' } },
          h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: C.hair, strokeWidth: 6 }),
          h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, strokeWidth: 6, strokeLinecap: 'round', strokeDasharray: `${c * pct} ${c}` })),
        h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
          h('div', { style: { fontSize: '13px', fontWeight: 650 } }, Math.round(value)),
          label ? h('div', { style: { fontSize: '9px', color: C.faint } }, label) : null))
    }
    function Btn({ children, onClick, disabled, style, primary, danger }) {
      return h('button', {
        type: 'button',
        style: { ...(primary ? S.btnPrimary : danger ? S.btnDanger : S.btn), ...style, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' },
        onClick: disabled ? undefined : onClick,
      }, children)
    }
    function Field({ label, children }) {
      return h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
        h('span', { style: { fontSize: '11px', color: C.faint } }, label), children)
    }
    function JsonBox({ value }) {
      let text = ''
      try { text = JSON.stringify(value, null, 2) } catch { text = String(value) }
      return h('pre', { style: { ...S.area, margin: 0, maxHeight: '340px', overflow: 'auto', whiteSpace: 'pre-wrap' } }, text)
    }
    function Empty({ text }) {
      return h('div', { style: { ...S.notice, textAlign: 'center', padding: '22px 10px', color: C.faint } }, text)
    }
    function AwemeCard({ item }) {
      const author = item.author?.nickname || item.author || item.nickname || '未知'
      const digg = item.stats?.digg ?? item.digg
      const comment = item.stats?.comment ?? item.comment
      return h('div', { style: S.item },
        item.cover ? h('img', { src: item.cover, alt: '', style: S.cover, loading: 'lazy' })
          : h('div', { style: { ...S.cover, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontSize: '18px' } }, '🎬'),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontSize: '12.5px', fontWeight: 560, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } }, item.desc || item.text || item.title || '（无文案）'),
          h('div', { style: { ...S.mono, marginTop: '5px' } }, `@${author} · ${fmtNum(digg)} 赞 · ${fmtNum(comment)} 评`),
          h('div', { style: { ...S.mono, marginTop: '3px' } }, item.id || item.aweme_id || '')))
    }

    // ---- 总览
    function Overview({ st, beat, act, busy, docOpen }) {
      const emo = st.emotion || {}
      const sat = st.satisfaction || {}
      const bor = st.boredom || {}
      const watch = st.watch || {}
      const login = st.status || {}
      const pending = st.pending ?? 0
      const bored = (bor.activities || []).filter((a) => a.value > 0).slice(0, 3)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('section', { style: S.hero },
          h('div', { style: { ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' } },
            h('div', null,
              h('div', { style: { fontSize: '15px', fontWeight: 660 } }, '🐟 小七现在'),
              h('div', { style: { ...S.sub, marginTop: '3px' } }, `${emo.mood || '平静'} · 能量 ${emo.energy ?? '—'}/100 · ${emo.note || '没写备注'}`),
              h('div', { style: { ...S.mono, marginTop: '4px' } }, `更新于 ${fmtClock(emo.updatedAt)}`)),
            h('div', { style: S.row },
              h(Ring, { value: sat.value || 0, max: sat.threshold || 70, color: C.accent, label: '满足' }),
              h(Ring, { value: emo.energy ?? 60, max: 100, color: C.info, label: '能量' }))),
          h('div', { style: S.grid3 },
            h('div', { style: S.stat }, h('div', { style: S.statLabel }, '心情'), h('div', { style: S.statValue }, emo.mood || '平静'), h(Bar, { value: emo.energy ?? 60, max: 100, color: C.info })),
            h('div', { style: S.stat }, h('div', { style: S.statLabel }, '满足'), h('div', { style: S.statValue }, `${sat.value || 0}/${sat.threshold || 70}`), h(Bar, { value: sat.value || 0, max: sat.threshold || 70, color: C.accent })),
            h('div', { style: S.stat }, h('div', { style: S.statLabel }, '今天看了'), h('div', { style: S.statValue }, `${watch.usedMinutes ?? 0}/${watch.dailyMinutes ?? 30} 分`), h(Bar, { value: watch.usedMinutes ?? 0, max: watch.dailyMinutes ?? 30, color: C.purple }))),
          h('div', { style: S.row },
            h(Pill, { on: Boolean(login.loggedIn) }, login.loggedIn ? `已登录 ${login.account?.nickname || ''}` : '未登录'),
            h(Pill, { on: Boolean(login.running) }, login.running ? '浏览器在跑' : '浏览器没开'),
            h(Pill, { on: watch.allowed !== false, warn: watch.allowed === false }, watch.allowed === false ? '现在不能自主看' : '可以自主看'),
            h(Pill, { on: pending > 0, warn: pending > 0 }, pending ? `${pending} 条等审批` : '没有待审批'),
            h(Pill, { on: Boolean(st.thread && st.thread.status === 'active') }, st.thread?.thread?.title ? `手头：${st.thread.thread.title}` : '手头空闲'))),

        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '快捷操作', h('span', { style: S.mono }, beat?.next || '')),
          h('div', { style: S.row },
            h(Btn, { primary: true, disabled: busy, onClick: () => act('刷一屏推荐', async () => (await api('/read?action=feed&limit=6')).data) }, '刷一屏推荐'),
            h(Btn, { disabled: busy, onClick: () => act('看额度', async () => api('/watch')) }, '看额度'),
            h(Btn, { disabled: busy, onClick: () => act('自检', async () => api('/doctor', { method: 'POST', body: JSON.stringify({ repair: false }) })) }, '自检'),
            h(Btn, { disabled: busy, onClick: () => act('开浏览器', async () => api('/open', { method: 'POST', body: '{}' })) }, '开浏览器'),
            h(Btn, { disabled: busy, onClick: () => act('心跳', async () => api('/heartbeat', { method: 'POST', body: JSON.stringify({ action: 'run' }) })) }, '踢一下心跳'),
            h(Btn, { onClick: () => docOpen('heartbeat') }, '看心跳稿'))),

        h('div', { style: S.grid2 },
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '最近动作', h(Btn, { onClick: () => act('刷新', async () => api('/ledger')) }, '刷新')),
            (st.ledger || []).slice(0, 8).map((row, i) => h('div', { key: i, style: { ...S.item, padding: '6px 0' } },
              h('div', { style: { flex: 1, minWidth: 0, fontSize: '12px' } }, row.capability || row.action || ''),
              h('div', { style: { ...S.mono, color: row.status === 'error' ? C.danger : C.faint } }, row.status || ''),
              h('div', { style: { ...S.mono, minWidth: '44px', textAlign: 'right' } }, fmtClock(row.at)))),
            (st.ledger || []).length ? null : h(Empty, { text: '还没有动作记录' })),
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '腻了 / 想干什么'),
            bored.length ? bored.map((a) => h('div', { key: a.group, style: { marginBottom: '7px' } },
              h('div', { style: { ...S.row, justifyContent: 'space-between' } }, h('span', { style: { fontSize: '12px' } }, a.group), h('span', { style: S.mono }, `${a.value}/${bor.threshold || 70}`)),
              h(Bar, { value: a.value, max: bor.threshold || 70, color: a.value > (bor.threshold || 70) * 0.7 ? C.warn : C.info })))
              : h(Empty, { text: '一点都不腻，可以去刷一屏' }),
            h('div', { style: { marginTop: '10px', fontSize: '12px' } }, `建议：${(beat?.suggestions || []).join('、') || '随便看看'}`),
            h('div', { style: { marginTop: '10px' } },
              h('div', { style: { ...S.row, justifyContent: 'space-between', marginBottom: '4px' } }, h('span', { style: { fontSize: '11px', color: C.faint } }, '聊天厌倦'), h('span', { style: S.mono }, `${bor.chat || 0}/${bor.chatThreshold || 65}`)),
              h(Bar, { value: bor.chat || 0, max: bor.chatThreshold || 65, color: C.pink })))),

        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '文档', h('span', { style: S.mono }, `${(st.docs || []).length} 份`)),
          h('div', { style: S.grid3 },
            (st.docs || []).map((doc) => h('div', {
              key: doc.name, onClick: () => docOpen(doc.name),
              style: { border: `1px solid ${C.hair}`, borderRadius: '9px', padding: '9px 11px', cursor: 'pointer', background: 'rgba(0,0,0,0.14)' },
            },
              h('div', { style: { fontSize: '12px', fontWeight: 560 } }, doc.name),
              h('div', { style: { ...S.mono, marginTop: '2px' } }, `${doc.lines || 0} 行 · ${doc.bytes || 0} B`),
              h('div', { style: { fontSize: '11px', color: C.faint, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, doc.summary || '（没有摘要）')))))
      )
    }

    // ---- 抖音
    function DouyinTab({ st, act, busy }) {
      const [action, setAction] = useState('feed')
      const [keyword, setKeyword] = useState('')
      const [id, setId] = useState('')
      const [limit, setLimit] = useState('6')
      const [seconds, setSeconds] = useState('3')
      const [name, setName] = useState('')
      const [result, setResult] = useState(null)
      const [qr, setQr] = useState(null)
      const [polling, setPolling] = useState(false)
      const pollRef = useRef(null)
      useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

      const run = () => act(action, async () => {
        const q = new URLSearchParams({ action, limit })
        if (keyword) q.set('keyword', keyword)
        if (id) q.set('id', id)
        if (seconds) q.set('seconds', seconds)
        if (name) q.set('name', name)
        const data = await api(`/read?${q.toString()}`)
        setResult({ action, data: data.data ?? data })
        return data.data ?? data
      })

      const startLogin = () => act('扫码登录', async () => {
        const data = await api('/login/qr', { method: 'POST', body: '{}' })
        const d = data.data || {}
        setQr(d)
        if (d?.key) {
          if (pollRef.current) clearInterval(pollRef.current)
          setPolling(true)
          pollRef.current = setInterval(async () => {
            const r = await api('/login/poll', { method: 'POST', body: JSON.stringify({ key: d.key }) })
            const v = r.data || {}
            if (v.state === 'ok') {
              clearInterval(pollRef.current); pollRef.current = null
              setPolling(false); setQr({ ...d, state: 'ok', account: v.account })
            }
          }, 2600)
        }
        return d
      })

      const reads = ['feed', 'hot', 'search', 'video', 'comments', 'user', 'works', 'state', 'observe']
      const items = Array.isArray(result?.data?.items) ? result.data.items
        : Array.isArray(result?.data?.works) ? result.data.works
          : Array.isArray(result?.data?.messages) ? result.data.messages
            : Array.isArray(result?.data?.conversations) ? result.data.conversations : null

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '读一读', h(Pill, { on: false }, '只读，随便跑')),
          h('div', { style: { ...S.grid3, marginBottom: '10px' } },
            h(Field, { label: '动作' }, h('select', { style: S.input, value: action, onChange: (e) => setAction(e.target.value) }, reads.map((a) => h('option', { key: a, value: a }, a)))),
            h(Field, { label: '关键词' }, h('input', { style: S.input, value: keyword, onChange: (e) => setKeyword(e.target.value), placeholder: 'search / user 用' })),
            h(Field, { label: '作品 id' }, h('input', { style: S.input, value: id, onChange: (e) => setId(e.target.value), placeholder: 'video / comments 用' })),
            h(Field, { label: '条数' }, h('input', { style: S.input, value: limit, onChange: (e) => setLimit(e.target.value) })),
            h(Field, { label: '观察秒数' }, h('input', { style: S.input, value: seconds, onChange: (e) => setSeconds(e.target.value) }))),
          h('div', { style: S.row },
            h(Btn, { primary: true, disabled: busy, onClick: run }, busy ? '跑…' : '开始读'),
            h('span', { style: S.mono }, result ? `${result.action} · ${result.data?.count ?? ''}` : '')),
          result ? h('div', { style: { marginTop: '11px' } },
            items ? h('div', null, items.slice(0, 20).map((item, i) => item && typeof item === 'object' && (item.desc !== undefined || item.aweme_id)
              ? h(AwemeCard, { key: i, item })
              : h('div', { key: i, style: { ...S.item, fontSize: '12px' } },
                h('span', { style: { flex: 1 } }, item.text || item.name || item.nickname || item.label || item.title || ''),
                h('span', { style: S.mono }, item.direction || item.time || ''))))
              : h(JsonBox, { value: result.data })) : null),

        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '播放控制'),
          h('div', { style: S.row },
            [['play', '播放'], ['pause', '暂停'], ['next', '下一个'], ['previous', '上一个']].map(([a, label]) => h(Btn, {
              key: a, disabled: busy,
              onClick: () => act(a, async () => { const d = await api(`/read?action=${a}`); setResult({ action: a, data: d.data ?? d }); return d.data }),
            }, label)),
            h(Btn, {
              disabled: busy,
              onClick: () => act('observe', async () => { const d = await api(`/read?action=observe&seconds=${seconds || 3}`); setResult({ action: 'observe', data: d.data ?? d }); return d.data }),
            }, `观察 ${seconds || 3} 秒`))),

        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '登录', h(Pill, { on: Boolean(st.status?.loggedIn) }, st.status?.loggedIn ? st.status?.account?.nickname || '已登录' : '未登录')),
          h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' } },
            qr?.qr ? h('img', { src: qr.qr, alt: '抖音登录二维码', style: S.qr }) : null,
            h('div', { style: { ...S.col, flex: 1, minWidth: '220px' } },
              h('div', { style: S.row },
                h(Btn, { primary: true, disabled: busy || polling, onClick: startLogin }, polling ? '等扫码…' : '扫码登录'),
                h(Btn, { disabled: busy, onClick: () => act('检查登录', async () => api('/login/check', { method: 'POST', body: '{}' })) }, '检查登录'),
                h(Btn, { disabled: busy, onClick: () => act('退出', async () => api('/logout', { method: 'POST', body: '{}' })) }, '退出登录')),
              h('div', { style: { ...S.mono, marginTop: '6px' } }, qr?.state === 'ok' ? `登录成功：${qr.account?.nickname || ''}` : polling ? '用抖音 App 扫上面的码' : '点「扫码登录」生成二维码')))),

        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '私信'),
          h('div', { style: { ...S.grid3, marginBottom: '9px' } },
            h(Field, { label: '会话名（可空）' }, h('input', { style: S.input, value: name, onChange: (e) => setName(e.target.value), placeholder: '404.' }))),
          h('div', { style: S.row },
            h(Btn, { disabled: busy, onClick: () => act('会话列表', async () => { const d = await api('/read?action=im_list&limit=20'); setResult({ action: 'im_list', data: d.data ?? d }); return d.data }) }, '看会话列表'),
            h(Btn, { disabled: busy, onClick: () => act('读会话', async () => { const q = new URLSearchParams({ action: 'im_read', limit: 20 }); if (name) q.set('name', name); const d = await api(`/read?${q}`); setResult({ action: 'im_read', data: d.data ?? d }); return d.data }) }, '读这个会话')))
      )
    }

    // ---- 看片
    function WatchTab({ st, act, busy }) {
      const [view, setView] = useState(null)
      const [report, setReport] = useState(null)
      useEffect(() => { api('/watch').then(setView) }, [])
      const quota = view?.quota || st.watch || {}
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { style: S.grid2 },
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '今天的额度', h(Btn, { onClick: () => api('/watch').then(setView) }, '刷新')),
            h('div', { style: { ...S.row, gap: '18px', alignItems: 'center' } },
              h(Ring, { value: quota.usedMinutes || 0, max: quota.dailyMinutes || 30, size: 82, color: C.purple, label: '分钟' }),
              h('div', { style: S.col },
                h(Pill, { on: quota.allowed !== false, warn: quota.allowed === false }, quota.allowed === false ? '现在不能自主看' : '可以自主看'),
                h('div', { style: S.mono }, `可看时段 ${quota.window?.start || '—'} – ${quota.window?.end || '—'}`),
                h('div', { style: S.mono }, `单次 ${quota.sessionMinutes || 0} 分钟 · 每天 ${quota.dailyMinutes || 0} 分钟`),
                quota.reason ? h('div', { style: { fontSize: '11.5px', color: C.warn } }, quota.reason) : null)),
            h('div', { style: { ...S.notice, marginTop: '10px' } }, '要看片在对话里说：dafeiyu_douyin action=watch。这个页面只显示额度和流水。')),
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '日报', h(Btn, { disabled: busy, onClick: () => act('生成日报', async () => { const d = await api('/report', { method: 'POST', body: '{}' }); setReport(d.data); return d }) }, '生成今天的')),
            report ? h('pre', { style: { ...S.area, margin: 0, maxHeight: '260px', overflow: 'auto' } }, report.text || '')
              : h(Empty, { text: '点「生成今天的」，存到 state/reports/' }))),
        h('div', { style: S.grid2 },
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '看片流水'),
            (view?.recent || []).slice(0, 14).map((row, i) => h('div', { key: i, style: { ...S.item, padding: '6px 0', fontSize: '12px' } },
              h('span', { style: { width: '58px', ...S.mono } }, String(row.at || '').slice(11, 16)),
              h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.title || row.id || '—'),
              h('span', { style: S.mono }, row.ratio ? `${Math.round(Number(row.ratio) * 100)}%` : row.action || ''))),
            (view?.recent || []).length ? null : h(Empty, { text: '还没看过片' })),
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '兴趣'),
            (view?.interests || []).map((it) => h('div', { key: it.topic, style: { marginBottom: '8px' } },
              h('div', { style: { ...S.row, justifyContent: 'space-between' } }, h('span', { style: { fontSize: '12px' } }, it.topic), h('span', { style: S.mono }, `👍${it.likes || 0} 👎${it.dislikes || 0}`)),
              it.lastReflection ? h('div', { style: { fontSize: '11px', color: C.faint } }, it.lastReflection) : null)),
            (view?.interests || []).length ? null : h(Empty, { text: '还没有带证据的兴趣' }))))
    }

    // ---- 文档
    function DocTab({ name, act, busy }) {
      const [body, setBody] = useState('')
      const [info, setInfo] = useState(null)
      const [dirty, setDirty] = useState(false)
      useEffect(() => {
        let alive = true
        api(`/doc?name=${encodeURIComponent(name)}`).then((d) => {
          if (!alive) return
          setBody(d.body || ''); setInfo(d.info || null); setDirty(false)
        })
        return () => { alive = false }
      }, [name])
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: S.row },
          h('div', { style: { fontSize: '13px', fontWeight: 600 } }, name),
          info ? h('span', { style: S.mono }, `${info.lines || 0} 行 · ${info.bytes || 0} B`) : null,
          h(Pill, { on: !dirty, warn: dirty }, dirty ? '没保存' : '已同步'),
          h(Btn, { primary: true, disabled: busy || !dirty, onClick: () => act('保存', async () => { await api('/doc', { method: 'POST', body: JSON.stringify({ name, content: body }) }); setDirty(false); return null }) }, '保存')),
        h('textarea', { style: { ...S.area, minHeight: '380px' }, value: body, onChange: (e) => { setBody(e.target.value); setDirty(true) } }))
    }

    // ---- 记忆
    function MemoryTab({ act, busy }) {
      const [mem, setMem] = useState(null)
      const [text, setText] = useState('')
      const [mood, setMood] = useState('')
      const [energy, setEnergy] = useState('60')
      const load = useCallback(() => { api('/memory').then(setMem) }, [])
      useEffect(() => { load() }, [load])
      const emo = mem?.emotion || {}
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { style: S.grid2 },
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '情绪'),
            h('div', { style: S.grid3 },
              h(Field, { label: '心情' }, h('input', { style: S.input, value: mood, onChange: (e) => setMood(e.target.value), placeholder: emo.mood || '平静' })),
              h(Field, { label: '能量' }, h('input', { style: S.input, value: energy, onChange: (e) => setEnergy(e.target.value) }))),
            h('div', { style: { ...S.row, marginTop: '9px' } },
              h(Btn, {
                primary: true, disabled: busy,
                onClick: () => act('改情绪', async () => { await api('/memory', { method: 'POST', body: JSON.stringify({ action: 'mood', mood: mood || emo.mood || '平静', energy: Number(energy) || 60, note: '总控台改的' }) }); setMood(''); load(); return null }),
              }, '保存'),
              h(Btn, { disabled: busy, onClick: () => act('清厌倦', async () => { await api('/memory', { method: 'POST', body: JSON.stringify({ action: 'boredom_reset' }) }); load(); return null }) }, '厌倦清零')),
            h('div', { style: { ...S.mono, marginTop: '9px' } }, `当前：${emo.mood || '—'} · ${emo.energy ?? '—'}/100 · ${fmtClock(emo.updatedAt)}`),
            h('div', { style: { ...S.mono, marginTop: '5px' } }, (mem?.boredom?.activities || []).map((a) => `${a.group} ${a.value}`).join(' · '))),
          h('section', { style: S.card },
            h('h3', { style: S.cardTitle }, '核心记忆'),
            h('textarea', { style: { ...S.area, minHeight: '86px' }, value: text, placeholder: '一条说清：谁、什么、要记住什么', onChange: (e) => setText(e.target.value) }),
            h('div', { style: { ...S.row, marginTop: '8px' } },
              h(Btn, { primary: true, disabled: busy || !text.trim(), onClick: () => act('记一条', async () => { await api('/memory', { method: 'POST', body: JSON.stringify({ action: 'core_add', text }) }); setText(''); load(); return null }) }, '记一条')),
            h('pre', { style: { ...S.area, marginTop: '9px', maxHeight: '240px', overflow: 'auto', whiteSpace: 'pre-wrap' } }, mem?.core || '（空）'))),
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '最近说过的话', h(Btn, { onClick: load }, '刷新')),
          (mem?.recent || []).slice(0, 14).map((m, i) => h('div', { key: i, style: { ...S.item, padding: '5px 0', fontSize: '12px' } },
            h('span', { style: { ...S.mono, width: '52px' } }, String(m.at || '').slice(11, 16)),
            h('span', { style: { width: '52px', color: C.info } }, m.role === 'user' ? '你' : '小七'),
            h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, m.text || '')))),
        (mem?.recent || []).length ? null : h(Empty, { text: '还没聊过' }))
    }

    // ---- 关系
    function RelationsTab({ act, busy }) {
      const [list, setList] = useState([])
      const [uid, setUid] = useState('')
      const [detail, setDetail] = useState(null)
      const [form, setForm] = useState({ name: '', impression: '', event: '', closeness: '0' })
      const load = useCallback(() => { api('/relations').then((d) => setList(d.relations || [])) }, [])
      useEffect(() => { load() }, [load])
      const open = (u) => { setUid(u); api(`/relation?uid=${encodeURIComponent(u)}`).then((d) => setDetail(d.relation || null)) }
      return h('div', { style: S.split },
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '认识的人', h('span', { style: S.mono }, String(list.length))),
          list.map((r) => {
            const u = r.uid || r.meta?.uid || ''
            const nm = r.name || r.meta?.name || u
            return h('div', { key: u, style: S.docRow(uid === u), onClick: () => open(u) },
              h('div', { style: { fontSize: '12px', fontWeight: 520 } }, nm),
              h('div', { style: S.mono }, `${r.closeness ?? r.meta?.closeness ?? 0} 分`))
          }),
          list.length ? null : h(Empty, { text: '还不认识谁' })),
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, detail ? `${detail.name || detail.uid}` : '选一个人'),
          detail ? h('div', { style: { ...S.col, marginBottom: '10px' } },
            h('div', { style: S.mono }, `uid ${detail.uid} · 亲密度 ${detail.meta?.closeness ?? 0}`),
            h('div', { style: { fontSize: '12px' } }, detail.meta?.impression || '（还没写印象）')) : null,
          h('div', { style: S.grid3 },
            h(Field, { label: 'uid / secUid' }, h('input', { style: S.input, value: uid, onChange: (e) => setUid(e.target.value) })),
            h(Field, { label: '昵称' }, h('input', { style: S.input, value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }) })),
            h(Field, { label: '亲密度变化' }, h('input', { style: S.input, value: form.closeness, onChange: (e) => setForm({ ...form, closeness: e.target.value }) }))),
          h('div', { style: { marginTop: '8px' } }, h(Field, { label: '印象' }, h('textarea', { style: { ...S.area, minHeight: '64px' }, value: form.impression, onChange: (e) => setForm({ ...form, impression: e.target.value }) }))),
          h('div', { style: { marginTop: '8px' } }, h(Field, { label: '这次发生了什么' }, h('textarea', { style: { ...S.area, minHeight: '56px' }, value: form.event, onChange: (e) => setForm({ ...form, event: e.target.value }) }))),
          h('div', { style: { ...S.row, marginTop: '9px' } },
            h(Btn, {
              primary: true, disabled: busy || !uid,
              onClick: () => act('记一笔', async () => { await api('/relation', { method: 'POST', body: JSON.stringify({ uid, ...form, closeness: Number(form.closeness) || 0 }) }); load(); open(uid); return null }),
            }, '记一笔')))
      )
    }

    // ---- 规划
    function PlanTab({ act, busy, docOpen }) {
      const [plan, setPlan] = useState('')
      const [progress, setProgress] = useState('')
      useEffect(() => { api('/plan').then((d) => { setPlan(d.plan || ''); setProgress(d.progress || '') }) }, [])
      return h('div', { style: S.grid2 },
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '规划', h('div', { style: S.row },
            h(Btn, { onClick: () => docOpen('plan') }, '编辑器'),
            h(Btn, { primary: true, disabled: busy, onClick: () => act('保存规划', async () => { await api('/plan', { method: 'POST', body: JSON.stringify({ content: plan }) }); return null }) }, '保存'))),
          h('textarea', { style: { ...S.area, minHeight: '260px' }, value: plan, onChange: (e) => setPlan(e.target.value) })),
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '进度', h(Btn, { onClick: () => docOpen('progress') }, '编辑器')),
          h('pre', { style: { ...S.area, minHeight: '260px', maxHeight: '420px', overflow: 'auto', whiteSpace: 'pre-wrap' } }, progress || '（空）')))
    }

    // ---- 审批
    function PendingTab({ act, busy }) {
      const [items, setItems] = useState([])
      const [status, setStatus] = useState('pending')
      const load = useCallback(() => { api(`/pending?status=${status}`).then((d) => setItems(d.items || [])) }, [status])
      useEffect(() => { load() }, [load])
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div', { style: S.row },
          ['pending', 'approved', 'rejected', 'executed'].map((s) => h(Btn, { key: s, primary: status === s, onClick: () => setStatus(s) }, s)),
          h(Btn, { onClick: load }, '刷新')),
        items.length ? items.map((item) => h('section', { key: item.id, style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('div', { style: { fontSize: '12.5px', fontWeight: 600 } }, item.summary || item.capability || item.id),
            h(Pill, { on: status === 'pending', warn: true }, status)),
          h('div', { style: { ...S.mono, marginTop: '5px' } }, `${item.capability || ''} · ${fmtClock(item.createdAt)} · ${item.id}`),
          h('pre', { style: { ...S.area, marginTop: '8px', maxHeight: '160px', overflow: 'auto' } }, JSON.stringify(item.args || {}, null, 2)),
          status === 'pending' ? h('div', { style: { ...S.row, marginTop: '8px' } },
            h(Btn, { primary: true, disabled: busy, onClick: () => act('批准', async () => { await api('/pending/decide', { method: 'POST', body: JSON.stringify({ id: item.id, decision: 'approve' }) }); load(); return null }) }, '批准'),
            h(Btn, { danger: true, disabled: busy, onClick: () => act('拒绝', async () => { await api('/pending/decide', { method: 'POST', body: JSON.stringify({ id: item.id, decision: 'reject' }) }); load(); return null }) }, '拒绝')) : null))
          : h(Empty, { text: `没有 ${status} 的条目` }))
    }

    // ---- 权限
    function PolicyTab({ act, busy }) {
      const [policy, setPolicy] = useState(null)
      const [text, setText] = useState('')
      useEffect(() => { api('/policy').then((d) => { setPolicy(d.policy || null); setText(JSON.stringify(d.policy || {}, null, 2)) }) }, [])
      return h('div', { style: S.grid2 },
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '策略', h(Btn, {
            primary: true, disabled: busy,
            onClick: () => act('保存策略', async () => {
              let patch
              try { patch = JSON.parse(text) } catch { return { ok: false, error: 'JSON 不合法' } }
              const d = await api('/policy', { method: 'POST', body: JSON.stringify(patch) })
              setPolicy(d.policy); return d
            }),
          }, '保存')),
          h('textarea', { style: { ...S.area, minHeight: '300px' }, value: text, onChange: (e) => setText(e.target.value) })),
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '闸门顺序'),
          ['1 审批项对得上 → 放行', '2 风控冷却 → 拒', '3 安静时段：写动作不干，读可以', '4 限额：每小时/每天', '5 dryRun：只回限额', '6 alwaysAsk / 非自动放行 → 进审批', '7 其余 → 放行']
            .map((line) => h('div', { key: line, style: { ...S.mono, padding: '4px 0' } }, line)),
          policy ? h('div', { style: { ...S.mono, marginTop: '10px' } }, `自主程度：${policy.autonomy || '—'} · 自动放行 ${(policy.autoApprove || []).length} 项`) : null,
          h('div', { style: { ...S.notice, marginTop: '10px' } }, '发布作品永远要人点头，这条写死在代码里。'))
      )
    }

    // ---- 自检
    function DoctorTab({ act, busy }) {
      const [res, setRes] = useState(null)
      const run = (repair) => act(repair ? '修复' : '自检', async () => {
        const d = await api('/doctor', { method: 'POST', body: JSON.stringify({ repair }) })
        setRes(d.data || d); return d.data
      })
      const rows = res?.checks || []
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '自检', h('div', { style: S.row },
            h(Btn, { primary: true, disabled: busy, onClick: () => run(false) }, '查一遍'),
            h(Btn, { disabled: busy, onClick: () => run(true) }, '能修的直接修'))),
          rows.length ? h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null, h('th', { style: S.th }, '项目'), h('th', { style: S.th }, '状态'), h('th', { style: S.th }, '细节'))),
            h('tbody', null, rows.map((row) => h('tr', { key: row.name },
              h('td', { style: S.td }, row.name),
              h('td', { style: S.td }, h(Pill, { on: row.ok }, row.ok ? '正常' : '要处理')),
              h('td', { style: { ...S.td, ...S.mono } }, row.detail || ''))))) : h(Empty, { text: '还没查过' })),
        res ? h('section', { style: S.card },
          h('h3', { style: S.cardTitle }, '结果'),
          h('div', { style: S.mono }, res.note || ''),
          (res.repaired || []).length ? h('div', { style: { marginTop: '8px' } },
            h('div', { style: { fontSize: '12px', fontWeight: 560 } }, '修过这些：'),
            res.repaired.map((r, i) => h('div', { key: i, style: S.mono }, `${r.action} · ${r.detail || ''}`))) : null,
          h('pre', { style: { ...S.area, marginTop: '9px', maxHeight: '220px', overflow: 'auto' } }, JSON.stringify(res, null, 2))) : null)
    }

    const TABS = [
      ['overview', '总览'], ['douyin', '抖音'], ['watch', '看片'], ['persona', '人设'],
      ['memory', '记忆'], ['relations', '关系'], ['plan', '规划'], ['pending', '审批'],
      ['policy', '权限'], ['doctor', '自检'],
    ]

    function Console() {
      const [tab, setTab] = useState('overview')
      const [st, setSt] = useState({})
      const [beat, setBeat] = useState(null)
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState('')
      const timer = useRef(null)

      const load = useCallback(async () => {
        const [status, pulse, ledger] = await Promise.all([api('/status'), api('/tick'), api('/ledger')])
        if (status?.ok) setSt({ ...status, ledger: ledger.items || [] })
        if (pulse?.ok) setBeat(pulse.pulse || null)
      }, [])

      useEffect(() => {
        load()
        timer.current = setInterval(load, 20000)
        return () => { if (timer.current) clearInterval(timer.current) }
      }, [load])

      const act = useCallback(async (label, fn) => {
        setBusy(true); setNote(`${label}…`)
        try {
          const result = await fn()
          if (result && result.ok === false) setNote(`${label}失败：${result.error || result.message || '未知错误'}`)
          else setNote(`${label}完成`)
          await load()
          return result
        } catch (error) {
          setNote(`${label}失败：${String(error?.message || error)}`)
        } finally { setBusy(false) }
      }, [load])

      const docOpen = (name) => setTab(`doc:${name}`)

      let body
      if (tab === 'overview') body = h(Overview, { st, beat, act, busy, docOpen })
      else if (tab === 'douyin') body = h(DouyinTab, { st, act, busy })
      else if (tab === 'watch') body = h(WatchTab, { st, act, busy })
      else if (tab === 'persona') body = h(DocTab, { name: 'persona', act, busy })
      else if (tab === 'memory') body = h(MemoryTab, { act, busy })
      else if (tab === 'relations') body = h(RelationsTab, { act, busy })
      else if (tab === 'plan') body = h(PlanTab, { act, busy, docOpen })
      else if (tab === 'pending') body = h(PendingTab, { act, busy })
      else if (tab === 'policy') body = h(PolicyTab, { act, busy })
      else if (tab === 'doctor') body = h(DoctorTab, { act, busy })
      else if (tab.indexOf('doc:') === 0) body = h(DocTab, { name: tab.slice(4), act, busy })

      return h('div', { style: S.page },
        h('header', { style: S.header },
          h('div', null,
            h('h2', { style: S.title }, '抖音 · 我才不是魔丸鱼（小七）'),
            h('p', { style: S.sub }, st.status?.account?.nickname ? `@${st.status.account.nickname} · UID ${st.status.account.uniqueId || st.status.account.uid || ''}` : '还没登录抖音')),
          h('div', { style: S.row },
            note ? h('span', { style: { ...S.mono, color: C.info } }, note) : null,
            h(Btn, { onClick: load, disabled: busy }, '刷新'))),
        h('nav', { style: S.tabs },
          TABS.map(([id, label]) => h('button', { key: id, type: 'button', style: S.tab(tab === id), onClick: () => setTab(id) }, label)),
          tab.indexOf('doc:') === 0 ? h('button', { key: 'doc', type: 'button', style: S.tab(true) }, `文档 · ${tab.slice(4)}`) : null),
        body)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dafeiyu-douyin',
          order: 59,
          label: () => '抖音-我才不是魔丸鱼（小七）',
        }, Console))
      },
    }
  },
})
