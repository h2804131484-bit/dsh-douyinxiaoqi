# 小七功能说明（0.6.0）

`dsh-douyinxiaoqi` 以 `dsh-douyinxiaoqi v1.0.0` 为底座，整合了三个项目中适合抖音 DSH 插件的能力：

| 来源 | 已采用的能力 | 本插件中的位置 |
| --- | --- | --- |
| `yuanstarstar/dafeiyu-hub` | 人设、记忆、关系、规划、学习、情绪、厌倦、满足度、心跳、总线程、审批与策略闸 | `lib/store.js`、`lib/prompt.js`、`lib/heartbeat.js`、`lib/policy.js`、`lib/tools.js` |
| `LockyBee/dsh-douyin-agent` / `dsh-douyin-browser-local` | 播放控制、实际播放观察、证据化兴趣、观看流水与日报、时段和分钟额度、自检修复、私信读写的回读确认思路 | `lib/douyin.js`、`lib/store.js`、`lib/tools.js` |
| `h2804131484-bit/dsh-douyinxiaoqi v1.0.0` | 本机 Chrome 登录、推荐/热榜/搜索/评论/主页、互动写入、创作者中心两步投稿、DSH 设置页 | `lib/douyin.js`、`lib/http.js`、`client.js` |

## 开始使用

1. 在 DSH 安装插件后，打开“设置 → 抖音-我才不是魔丸鱼（小七）”。
2. 点击“装/更新运行时”，再用抖音 App 扫码登录。
3. 先在“权限”确认安静时段、日限额和自主级别；默认评论、私信等日常互动仍受限额和风控冷却约束，投稿永远等待人类批准。
4. 使用“抖音”页完成读取、播放或私信操作；“看片”页显示本机观看额度、流水、兴趣和日报。

状态默认保存在 `~/.dsh/dsh-douyinxiaoqi/`。旧版 `dafeiyu-douyin` 的状态目录存在而新目录不存在时，会自动继续使用旧目录。

## 抖音浏览与账号

所有抖音读取都通过本机可见的 Chrome 完成。插件不逆向抖音签名接口；它让浏览器正常加载页面，再读取页面和浏览器收到的数据。

| 动作 | 参数要点 | 结果 |
| --- | --- | --- |
| `status`、`setup`、`open`、`close`、`shot` | `shot` 可传 `name` | 查看或维护本机浏览器运行环境 |
| `login`、`poll`、`check`、`logout` | `poll` 需要 `args.key` | 扫码登录、轮询和检查登录态 |
| `feed`、`hot`、`search` | `search` 需要 `args.keyword` | 推荐、热榜和搜索结果 |
| `video`、`comments` | `args.id` | 作品详情和评论 |
| `user`、`works` | `user` 使用 `secUid` 或 `keyword` | 主页作品或自己的投稿 |
| `im_list`、`im_read` | `im_read` 使用 `name` 或 `index` | 会话列表和近期消息 |

可在 `config.json` 的 `douyin.cdpUrl` 填入已启用调试端口的 Chrome 地址，以复用那个浏览器的登录态。抖音桌面客户端不能作为登录态来源。

## 播放、观看记录和兴趣

`state`、`play`、`pause`、`next`、`previous` 控制当前播放器。`observe` 接受 1 到 10 秒的 `args.seconds`，用视频播放时间的变化判断是否实际播放与停留，不用截图臆测。

`watch` 会在额度内观看多条作品；可传 `minutes`、`maxRounds` 和 `seconds`。额度设置位于 `config.watch`：

- `enabled`：是否允许自主观看；
- `sessionMinutes`：单次上限，默认 6 分钟；
- `dailyMinutes`：每天上限，默认 30 分钟；
- `stopAfterVideos`：一轮最多作品数，默认 8；
- `windowStart`、`windowEnd`：允许观看时段，默认 08:00–23:30。

每次观察、播放切换和自主观看会写入 `state/watch.jsonl`。`report` 只读取本机流水，生成 Markdown 日报，不调用模型。通过 `dafeiyu_memory action=interest_add` 记录兴趣时必须带 `evidenceId`，并可声明 `like`、`dislike` 或 `neutral` 信号；`interest_list` 可查看汇总。

## 人格与长期状态

这组能力来自大肥鱼的人格层，独立于具体抖音动作：

| 工具 | 主要动作 |
| --- | --- |
| `dafeiyu_self` | `list`、`get`、`set`、`append` 管理 persona、style、preferences、plan、progress、heartbeat |
| `dafeiyu_memory` | 检索、核心记忆、短记忆、情绪、厌倦、满足度、兴趣和 `compact` 归档 |
| `dafeiyu_relation` | 为具体账号读取或写入印象与关系记录 |
| `dafeiyu_plan` | 读取、设置、追加和完成计划 |
| `dafeiyu_learn` | 管理学习目标与技能证据 |
| `dafeiyu_tick` | 汇总当前情绪、线程、风控、审批、心跳和下一步建议 |
| `dafeiyu_chat` | 只有满足度达标且计划更新后才允许收尾 |

每次会话会注入一张当前状态卡，其中包括人设摘要、情绪、能量、厌倦、满足度、当前线程、最近记忆和学习进度。自主心跳按 `config.heartbeat` 的时间间隔工作，并在安静时段停止唤醒。

## 私信、运营辅助与互动

`im_send` 使用抖音网页真实输入框逐字输入，发送后重新读取会话和列表预览确认结果。它是写动作，必须先通过 `dafeiyu_thread action=start` 创建总线程。

| 动作 | 用途 | 是否写入平台 |
| --- | --- | --- |
| `im_auto` | 扫描会话的未读数和预览变化，列出待回复对象，并记录已见状态 | 否 |
| `share` | 汇总一条作品的作者、数据、高赞评论和链接，供人工选择是否再发私信 | 否 |
| `trends` | 组合热榜与指定关键词搜索，供后续阅读评论和学习用法 | 否 |
| `like`、`collect`、`follow`、`comment`、`im_send` | 执行互动 | 是 |

插件不会自动替用户生成或批量发送私信、评论或分享。`im_auto` 只发现变化；实际回复仍需先读上下文，再由 agent 生成内容并走权限闸。

## 发布、审批和风控

写操作依次检查：现有总线程、已批准的审批项、风控冷却、安静时段、动作限额和自主名单。未满足自动放行条件时，动作进入 `pending/`，由总控台审批页批准或拒绝。

投稿固定使用两步：

1. `publish` 的 `args.mode="prepare"` 上传本地视频并填写标题、简介、标签和声明，但停在发布页；
2. 人类批准后，使用相同参数与 `approvalId` 调用 `args.mode="commit"` 才会点击发布。

平台出现验证码或常见风控结果时，插件会记录冷却期，期间拒绝继续写入。`doctor` 默认只检查；只有 `doctor args.repair=true` 才会处理 profile 锁、残留 Chrome 和缺失运行时。

## 未直接移植的功能

没有复制 `dsh-douyin-agent` 的 Windows Electron 程序、Edge 启动路径、QQ群同步、群聊自动回复、自动转发、自动续火花、音频转写和 `@playwright/mcp`。这些能力依赖另一个操作系统、另一个社交平台、额外本地模型，或会扩大自动外发的范围。详细对照见 [INTEGRATION.md](INTEGRATION.md)。
