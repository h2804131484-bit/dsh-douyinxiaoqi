# 大肥鱼 · 抖音版

让 AI agent 用**你本机的真实 Chrome** 操作抖音：刷推荐、看热榜、搜作品、读评论、看主页、点赞收藏关注、在作品下发一条评论，还能把本地视频传进创作者中心。

不是 API 爬虫。抖音的 Web 接口靠 `a_bogus` 签名 + 设备指纹，硬逆向既脏又容易失效；这个插件反过来——**让真实浏览器自己发请求，我们只拦页面里的 JSON**，读数据靠拦截，写动作靠点真实 DOM。

---

## 它是什么 / 不是什么

**是**

- 一个 DSH（DeepSeek Harness）插件，装完会多一个工具 `dafeiyu_douyin`，和一个总控台页面「设置 → 大肥鱼·抖音」。
- 一套**权限闸**：读的随便跑，写的过安静时段 / 限额 / 风控冷却 / 审批。
- 一套**总线程**：一次只做一件事，写动作之前必须先开线程，避免 agent 东一下西一下。

**不是**

- 不是免登录的外挂。第一次必须你本人用抖音 App 扫码。
- 不是批量刷量工具。默认限额压得很低（比如评论 2 条/小时），就是不想让它变成 spam 机。
- 不碰你的密码。cookie 存在本地状态目录，权限 0600，不上传任何地方。

---

## 装法

```bash
# 在 DSH profile 目录里
cd ~/.dsh/profiles/desktop
pnpm add github:<your-github-username>/dafeiyu-douyin
```

然后在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 里加一条，并在 `cordis.patch.yml` 里 insert：

```yml
- insert:
    - id: dafeiyu-douyin
      name: dafeiyu-douyin
      config: {}
```

重启 DSH。总控台「设置」里会多一个 **大肥鱼·抖音** 页签。

> 需要本机装了 Google Chrome。playwright-core 不用手动装——第一次点「装/更新运行时」，插件会把它装进自己的状态目录（`~/.dsh/dafeiyu-douyin/douyin/runtime`），不污染你的项目依赖。

---

## 第一次用

1. 设置 → 大肥鱼·抖音 → **装/更新运行时**（约 30 秒）
2. **扫码登录**，用抖音 App 扫弹出的二维码
3. 登录态落在 `~/.dsh/dafeiyu-douyin/douyin/secrets/cookies.json`，之后不用天天扫

> 不想扫码？如果你已经有一个**带调试端口**的 Chrome（`chrome --remote-debugging-port=9222`），在 `~/.dsh/dafeiyu-douyin/config.json` 里写 `{"douyin":{"cdpUrl":"http://127.0.0.1:9222"}}`，插件就直接接管那个浏览器，登录态跟着它走。
> 抖音桌面客户端（`/Applications/抖音.app`）虽然是 Electron，但它自己解析启动参数，`--remote-debugging-port` 会被拒（`bad option`），所以**没法从客户端里抠登录态**，还是扫码这一条路。

想用命令行验证：

```bash
curl -s http://127.0.0.1:<dsh-port>/dafeiyu-douyin/api/status | jq .status
```

---

## 给 agent 用的动作

工具名 `dafeiyu_douyin`，参数 `{ action, args, approvalId, dryRun }`。

| action | 说明 | 类型 |
|---|---|---|
| `status` | 环境 + 登录态 | 环境 |
| `login` / `poll` / `check` / `logout` | 扫码登录四件套（poll 带 `args.key`） | 环境 |
| `setup` / `open` / `close` / `shot` | 装运行时、开关浏览器、截图 | 环境 |
| `feed` | 推荐流（`args.limit`） | 读 |
| `hot` | 热榜 | 读 |
| `search` | 搜作品（`args.keyword`） | 读 |
| `video` | 作品详情（`args.id`） | 读 |
| `comments` | 读评论（`args.id`、`args.limit`） | 读 |
| `user` | 某人主页 + 作品（`args.secUid` 或 `args.keyword`） | 读 |
| `works` | 自己发过的作品 | 读 |
| `like` / `collect` | 点赞 / 收藏（`args.id`） | 写 |
| `follow` | 关注（`args.secUid` 或 `args.nickname`） | 写 |
| `comment` | 发评论（`args.id`、`args.text`） | 写 |
| `publish` | 投稿，两步走（见下） | 写（必审批） |

投稿是故意的两步：

```text
action=publish args={mode:"prepare", videoPath:"/abs/clip.mp4", title:"…", desc:"…", tags:["…"]}
  → 上传、填好标题简介，停在发布页，不点按钮
action=publish args={mode:"commit"} approvalId=… 
  → 人类在总控台点头后才真发
```

补充几个 prepare 阶段会自动做掉的事（都是踩过坑才加上的）：

- 等「重新上传」出现才算传完，出现「上传失败」直接报错，不会傻等
- 标题框是 `input[placeholder*="填写作品标题"]`，简介是 `div.zone-container[contenteditable]`（新版发布页 DOM）
- **自主声明**：默认帮你勾「内容由AI生成」（`args.declaration` 可改）。AI 配音/字幕的成片本来就该声明
- 点发布前清掉新手引导/话题下拉浮层，否则按钮点不动
- 没设封面时自动选它的第一个推荐封面兜底
- 撞到短信验证会返回 `needsSms`，需要你本人收验证码，插件不会瞎猜

另外两个工具：`dafeiyu_douyin_thread`（总线程）、`dafeiyu_douyin_pending`（审批队列，只能看不能批自己）、`dafeiyu_douyin_policy`（看/改策略）。

---

## 权限闸怎么判

写动作按这个顺序过：

1. **审批 id**（带了就校验：存在 / 已批准 / 动作匹配 / 参数哈希一致 / 没过期）
2. **风控冷却**：结果里出现 `-352` / `-412` / 「验证码中间页」就给 24 分钟冷却
3. **安静时段**（默认 23:30–08:30，读不受影响）
4. **限额**（like 30/时 300/天、comment 2/时 20/天、follow 10/天…）
5. **自主名单**：`policy.autonomy=high` 且动作在 `autoApprove` 里才直接放行
6. 否则进**审批队列**，等人类点头

`alwaysAsk` 里的动作（默认只有 `publish`）不管自主程度多高都要人批。

改策略有两条路：总控台页面上的开关，或工具 `dafeiyu_douyin_policy action=set patch={...}`。

---

## 为什么要先开总线程

`dafeiyu_douyin_thread action=start title=…` 之后才允许写。原因是 agent 容易「顺手」连做几件事，而抖音这种地方连着做很容易撞风控。线程是刹车片：一次一件事，做完 `finish` 写结果。

---

## 状态目录

```text
~/.dsh/dafeiyu-douyin/
├── config.json        # 浏览器配置（headless/channel/timeout…）
├── policy.json        # 权限策略
├── state.json         # 登录态快照
├── thread.json        # 总线程
├── pending.json       # 审批队列
├── actions.jsonl      # 动作日志（append-only）
├── risk.json          # 风控冷却
└── douyin/
    ├── profile/         # 持久化 Chrome profile（登录态在这）
    ├── runtime/         # playwright-core
    ├── secrets/         # cookies.json
    └── shots/           # 截图（出问题时好排查）
```

删掉整个目录 = 完全重置（等于退出登录）。

---

## 已知限制

- **必须 headed**。无头模式会被抖音识别成爬虫，直接跳「验证码中间页」。插件默认 `headless:false`，别改。
- **DOM 会变**。抖音前端是构建 hash 的 class，插件定位靠 `data-e2e` 和「分享按钮同行第 N 个」这种相对锚点。哪天真坏了，`douyin/shots/` 里的截图 + `lib/douyin.js` 的 `ACTION_CANDIDATES` / `BAR_INDEX` 是改的地方。
- **一个 profile 只能被一个进程用**。插件开着浏览器时，外面的脚本再开会报「正在现有的浏览器会话中打开」。先 `action=close`。
- **搜索别直接拼 URL**。`/search/xxx` 直连会被风控，插件是进推荐页后点搜索框输入。
- 私信（读会话/发消息）还没做——接口是 `/aweme/v1/web/im/*`，能接，但怕被拿来群发，先留白。
- **桌面客户端不能当登录源**。它是 Electron，但启动器只认自己的参数，`--remote-debugging-port` 直接 `bad option` 退出；想复用登录态只能走上面的 `cdpUrl` + 一个自己开的 Chrome。

---

## 一点边界

这插件是给「自己的账号、自己的操作节奏」用的。默认限额和安静时段不是装饰，是防止 agent 半夜上头。如果你 fork 之后把限额全放开、把安静时段关掉，那是你的选择，但别把这个仓库当外挂的底座。

---

## 致谢 / 借鉴

这套东西不是从零造的，上传那半边的选择器和踩坑结论大量来自这两个项目，建议一起看：

- [dreammis/social-auto-upload](https://github.com/dreammis/social-auto-upload) —— 抖音/小红书/视频号/B站/YouTube 的自动投稿。本仓库的创作者中心流程参考了它的 `uploader/douyin_uploader/main.py`：上传完成判定（`重新上传`）、标题/简介选择器、自主声明弹窗（`semi-radio` + `内容由AI生成`）、清浮层（`.shepherd-element` / `mention-wrapper`）、短信验证码兜底、发布成功以跳转 `content/manage` 为准。
- [NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) —— 各平台评论抓取的 Playwright 方案，读数据那半边的思路（别硬逆签名，让真实浏览器发请求）和它一致。

本仓库和它们的区别：这里把它包成 DSH 插件，加了权限闸、总线程、两步投稿和审批队列，不批量刷、不群发。

---

## License

MIT
