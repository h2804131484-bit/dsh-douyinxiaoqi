# 三仓库能力对照与取舍（0.6.0）

对照对象：

1. `yuanstarstar/dafeiyu-hub` —— 大肥鱼的原始形态：人设/记忆/关系/规划/学习/心跳/情绪/厌倦/满足 + 请求闸 + 总控台，B 站为主。
2. `LockyBee/dsh-douyin-agent`（npm 包名 `dsh-douyin-browser-local`）—— 抖音原生助手：播放级控制、观察采样、证据化兴趣、白名单私信、自主观看、日报、自检。
3. 本仓库 `dafeiyu-douyin` —— 抖音版大肥鱼：真实 Chrome + 权限闸 + 总线程 + 投稿 + 私信。

## 能力对照

| 能力 | hub | dsh-douyin-agent | 本仓库 0.6.0 | 取舍 |
|---|---|---|---|---|
| 真实登录态 | B 站扫码 | Windows + Edge，`os: win32` | Chrome 持久化 profile / `cdpUrl` 接管 | 抄思路不抄实现：macOS 上 Chrome 已验证，不引入 Playwright MCP |
| 播放控制 | 无 | `play/pause/next/previous/open_video` | `state/play/pause/next/previous` | 抄：这是「真的在看」的地基 |
| 观察采样 | 无 | `observe` 1–10s 采样画面 | `observe args.seconds` 测播放进度与停留 | 抄：用播放器时间判「播没播」，比截图猜更硬 |
| 兴趣记忆 | 通用记忆 | `interest_record` 带 evidenceId，主题只是提案 | `interest_add/interest_list` + evidenceId + 信号 | 抄：没证据不算兴趣，防止自己脑补 |
| 看片流水/日报 | 无 | `daily-report` 本机生成 | `watchLog` + `report` 本机 Markdown | 抄：不额外调模型，白天下班能复盘 |
| 私信读 | 无 | `chat_read` 联系人白名单 + `msg:[a-f0-9]{64}` | `im_list/im_read` DOM 解析 + `isFromMe` 判方向 | 我们用轻量版：不建白名单库，但方向/发送都回读确认 |
| 私信回 | 无 | 发送前三重核对、发送后重开核 | Slate 键盘输入 + 回车 + 列表预览二次确认 | 我们只保留「回读确认」，不做可信事件见证 |
| 公开评论 | 无 | `comment-browser` 默认关、同作品不重复 | `comment` 过权限闸，限额 2/时 | 两条都保留，默认更严 |
| 自主观看 | 无 | 时段/每日分钟/请求额度 | `watch` + 时段/单次/每日分钟/条数额度 | 已整合；按上海日期从本机观看流水计算 |
| 投稿 | 无 | 无 | `publish prepare/commit` 两步 + 人工点头 | 我们的强项，继续保留 |
| 自检 | 部分 | `diagnostics/diagnostics_repair` | `doctor` / `doctor repair` | 已整合：运行时、Chrome、profile 锁、残留进程、登录态 |
| 权限闸 | 有（请求闸） | 部分 | 权限闸 + 总线程 + 审批队列 + 限额 | 我们的强项，继续保留 |
| 人格/记忆/关系/规划/学习 | 全套 | 共享人格卡 | 全套（0.2 起移植） | 保留 |

## 明确不整合的

- **Electron 客户端 / Windows Edge 依赖**：目标插件使用 DSH Web 控制台与 Chrome，不复制另一套 Windows 桌面程序。
- **QQ 机器人共享记忆**：与本插件无关。
- **`@playwright/mcp`**：与我们直接驱动 Chromium 的方式重复，且会拖依赖。
- **自动续火花（spark）**：对方已停用，属于刷量边缘。

## 结论

- 抄「看」：播放控制、观察采样、证据化兴趣、看片流水与日报。
- 抄「私信」：DOM 选择器与回读确认思路。
- 不抄「平台绑定」和「刷量边缘」的部分。
- 我们的差异化：macOS 真实 Chrome、权限闸/总线程/审批、投稿两步、人设与记忆体系。

## 0.4.0 之后

- 自主观看额度：已整合（`action=watch` + `config.watch` + `action=watch_status`），按分钟限额、按时段开关，不搬它的 Windows 播放器控制。
- 自检 / repair：已整合（`action=doctor args.repair=true`），覆盖运行时、Chrome、profile 锁、残留进程、登录态。
- 运营辅助：`im_auto` 找出未读或预览变化的会话；`share` 汇总一条作品和高赞评论；`trends` 同时取热榜与搜索结果；`compact` 归档旧短记忆。这四项均已作为工具动作注册。
- 仍未整合：`listen` 音频转写（要额外模型和本地 Whisper）、群聊回复、自动转发作品卡、QQ 共享记忆、`@playwright/mcp`、Windows/Edge 启动路径。它们依赖不同宿主、额外模型或另一个社交平台，不能直接移植到本插件。
