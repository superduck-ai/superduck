# SuperDuck CLI 产品定位与设计方向

## 一句话定位

**SuperDuck 把用户的真实浏览器,变成 agent 可调用的工具。**

agent(Claude Code / Codex 等)通过命令行,以用户当前 Chrome 的身份去读数据、操作页面。
session、cookies、登录态、当前 tab —— 这些原本锁在浏览器里的上下文,
通过 SuperDuck 暴露给 agent 使用。

> *"Your browser's session, callable as a tool."*

## 解决的核心问题

agent 不缺浏览能力,缺的是**以用户身份去浏览**的能力。

- Playwright / agent-browser:给 agent 一个空白浏览器,内网、SSO、Gmail 都要重新登录
- SuperDuck:复用用户已登录的 Chrome,飞书、Jira、内部 OA 即开即用

真正的竞争对手不是其他自动化工具,是用户在 Chrome 和终端之间来回截图、复制、粘贴的那 30 秒。

## 典型用户故事

> 我在 Chrome 看一个 Jira ticket → 在 terminal 跟 Claude Code 说 "按这个 ticket 写个 PR" →
> Claude Code 调 `superduck` → 拿到我当前 tab 的内容 → 不用复制粘贴,不用 agent 重新登录。

## 与同类项目的差异

| 项目 | 浏览器从哪来 | 定位 |
|---|---|---|
| chrome-devtools-mcp | 工具自启独立 Chrome | AI 调试工具 |
| agent-browser | 工具自启 Chrome,可选连外部 | agent 自动化 CLI |
| **SuperDuck** | **用户自己的 Chrome** | **把用户浏览器变成 agent 的工具** |

前两者是 "agent 自带浏览器",SuperDuck 是 "agent 借用用户浏览器"。
这是架构差异 —— 它们再怎么优化也绕不过"那不是用户那个 Chrome"。

CLI 在我们这里的作用:之前 SuperDuck 只是扩展,只有用户能用(侧边栏聊天)。
加了 CLI,**agent 也能用了**。同一套底层能力,服务两类调用方。

## MVP 范围:先做什么,先不做什么

目标:**让 Claude Code 能在用户当前 Chrome 上"读到 + 简单操作"**。
其他能力都可以晚一步。

### 必须做(MVP / P0)

1. **`superduck context`** —— 读当前 tab 的 url + title + selection + viewport 文本。
   这是最高频的用例,一个命令搞定 80% 的"agent 想知道用户在看啥"
2. **`superduck fetch <url>`** —— 用当前 Chrome 的 cookies 发请求。
   这是 SuperDuck 独占的核心价值(其他工具要么没登录态,要么要导出 cookies)
3. **默认操作 active tab** —— 不引入 MCP group 概念,agent 调用即作用于用户当前 tab
4. **npm 分发 + `setup` 一键初始化** —— `npm i -g superduck && superduck setup`,
   决定首次留存
5. **SKILL.md** —— 让 Claude Code 知道什么时候调这个 CLI、怎么调
6. **基础审计日志** —— 写到 `~/.superduck/audit.jsonl`,至少记录:命令、目标 tab、目标域、时间

这六项构成最小闭环:**装好 → agent 能读到用户浏览器 → 用户能看到 agent 做了什么**。

### 暂不做(P1+,验证 MVP 后再加)

- **`click / fill` 等 Act 命令** —— 读比写优先,先让 agent 能"看见",再让它"动手"
- **`screenshot / snapshot / console / network` 等其他 Read 命令** —— 有 `context` 已能覆盖大部分场景
- **`tab pin / focus`** —— 默认 active tab 已经够用
- **侧边栏 ↔ CLI 双向通道(`notify / ask / panel`)** —— 差异化能力,但 MVP 不需要
- **操作前红框预览、危险动作确认** —— 没有 Act 命令就不需要事前确认
- **`@eN` 短 ref、batch 多命令** —— 优化项,验证后再做

## 命令初版

```bash
# Read(MVP 核心)
superduck context              # 当前 tab 的 url + title + selection + viewport 文本
superduck fetch <url>          # 用当前 Chrome 身份发请求

# Tabs(只保留最基本的)
superduck tabs                 # 列出所有 tab(调试用)

# Setup
superduck setup                # 注册 native messaging + 拉起扩展商店
superduck doctor               # 健康检查
superduck log                  # 查审计日志
```

### `context` 的输出

默认返回:
```json
{
  "url": "...",
  "title": "...",
  "selection": "用户高亮的文本",
  "text": "viewport 内可见文本"
}
```

`--full` 返回整页文本(警告 token 占用)。其他参数(selector / 短 ref 等)等用起来再加。

### `fetch` 的安全默认

- 默认仅允许**当前 tab 同域**的 fetch
- 跨域请求直接拒绝(P1 再加侧边栏确认弹窗)
- 永不导出 cookie 本体

## 安装

```bash
npm install -g superduck-cli   # 跨平台,任何装了 Node 的环境
superduck setup                # 注册 native messaging manifest + 拉起扩展商店
superduck doctor               # 全绿即可开始用
```

为什么选 npm:
- 目标用户(Claude Code / Codex 用户)基本都装着 Node
- 跨平台一份包,不用维护 brew + winget + apt
- agent 可自举:发现命令不存在时,SKILL.md 引导它自己 `npm i -g superduck`

native-host 是 Go 二进制,通过 npm 的 **optionalDependencies** 分平台子包分发,
避免 postinstall 脚本被企业内网拦截。

## NON-GOALS

- ❌ **headless 模式** —— 跟 agent-browser 重叠,违背"用户当前浏览器"定位
- ❌ **多 profile / 隔离 context** —— 我们不是浏览器引擎
- ❌ **网络拦截 / cookie 编辑 / HAR 录制** —— Playwright 的活
- ❌ **cookie 导出** —— 暴露的是"以你身份发请求"的能力,cookies 永远留在 Chrome 里
- ❌ **批量并发 / 定时任务** —— 副驾驶是 1:1,定时会滑向 agent-browser

## MVP 之后的演进方向(仅作记录,不在当前范围)

按需求验证后再考虑:

- Act 命令(`click / fill / open`)+ 操作前红框预览 + 审计
- 完整 Read 命令(`screenshot / snapshot / console / network`)
- 侧边栏 ↔ CLI 双向通道(`notify / ask / panel`)—— 差异化护城河
- `tab pin` 长任务锁定工作 tab
- `@eN` 短 ref、`batch` 多命令一进程

## 参考资料

- [Command Line Interface Guidelines (clig.dev)](https://clig.dev/) —— 通用 CLI 设计原则
- [agent-browser](https://github.com/vercel-labs/agent-browser) —— Vercel,CDP 路线,工具自管 Chrome
- [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) —— Google 官方 MCP,自启 Chrome
- [CLI-Anything](https://github.com/HKUDS/CLI-Anything) —— SKILL.md / agent-native CLI 范式
