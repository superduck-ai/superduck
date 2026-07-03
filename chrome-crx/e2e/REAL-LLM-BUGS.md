# Real-LLM E2E 探索 Bug 记录

用真实 LLM（qwen3.7-plus，token.cvte.com，anthropic 协议）驱动扩展跑真实网页时发现的 bug。

## 运行统计（headed 模式，真实 LLM）

| 批次 | 测试数 | 完成（done=true） | 挂起（done=false） |
|---|---|---|---|
| extract | 6 | 2（hn-top3, wiki-infobox） | 4 |
| search | 3（部分） | 0 | 3 |
| forms | 6 | 0 | 6 |

约 85% 的测试挂起，根因都是 BUG-002（CDP 附加）+ BUG-003（无迭代上限）叠加。完成的 2 个测试都恰好让模型选了 content-script 工具（`get_page_text`）。

## 2026-06-29 重跑确认（docs/debug-capability-plan 分支，headed）

重跑 `real-llm-navigation.spec.ts`：4 failed / 1 passed（13.8 分钟），三个 bug 均仍存在：
- BUG-002：`tabs_create_mcp` CDP 附加超时（`Failed to attach debugger to tab: Timed out attaching debugger`）
- BUG-003：agent loop 迭代 `workingMessages` 27→30+，工具失败后持续重试到 200s 超时（`agent did not finish`）
- sidepanel 被关闭（`page closed`，疑似 OOM/崩溃，BUG-001 影子）
- 1 个通过的是模型恰好选 content-script 工具

将另开分支修复。

## BUG-001: read_page 在大页面上挂起并崩溃 sidepanel

**状态：** 未修复
**复现：** `e2e/specs/real-llm-complex.spec.ts`（需 `SUPERDUCK_REAL_LLM_API_KEY`）
**严重度：** 高（整个 agent 卡死，永不回到 idle）

**现象：**
在大型页面（如 `en.wikipedia.org/wiki/Ada_Lovelace`，AX 树数万节点）上：
1. `get_page_text` 报错：`Output exceeds 50000 character limit (90114 characters)`，提示模型改用 `read_page`
2. 模型按提示调用 `read_page`（depth 默认 15，全 AX 树快照）
3. `read_page` 的 `takeSnapshotUnlocked` 挂起，~48s 后 sidepanel 页面被关闭（疑似 OOM）
4. agent loop 无 per-tool 超时，工具挂死时 stop 按钮一直可见、永不 idle，测试超时

**根因：**
- `readPageTool.ts` 只有 `maxChars` 字符限制，且在昂贵的 AX 快照构建**之后**才检查，无节点数上限、无超时保护
- `useAgentLoop.ts` 的 do-while 循环对 `executeToolUse` 没有整体超时

**修复方向：**
1. `read_page` 加 per-tool 超时 + AX 节点数上限，超限返回结构化错误而非挂起
2. agent loop 给 `executeToolUse` 加整体超时，挂死时中止并回填错误 tool_result 让模型恢复
3. 大页面默认 `filter:'interactive'` 或更小 depth

**STALL 检测到但无法打断挂死工具（2026-06-29 复现）：**
`real-llm-interaction.spec.ts -g "Cross-site"`（完整日志 `e2e/debug-int-cross-marie.log`）精准复现 BUG-001：模型第 1 轮就调用 `read_page`（Bing 首页），工具静默挂起（`errs=0`，无 per-tool 超时），agent 卡死到 240s 超时（`done=false llm=2`，2 轮 LLM 后 160 秒无变化）。

watchdog 在 +80s 触发 `STALL detected — firing onStall`，但 `onStall` 回调没能打断挂死的 read_page、也没让 agent 恢复/中止。**说明 stall 机制存在但不生效**——修复 BUG-001 时必须让 onStall 能强制中止 read_page（例如 AbortController + 工具执行支持取消），否则即使检测到挂死也无法恢复。

**诊断过程：**
- 用 `globalThis.__SD_DEBUG_MSGS` 受控 console.log 打点 `streamAndProcess` / `useAgentLoop` / `executeToolUses`
- 用只读 fetch 观察器（`page.on('request')` 读 `postDataJSON`，**不** tee response 流）记录 LLM 请求
- 确认 agent loop 历史累积正确（workingMessages 1→3→5...），问题在 read_page 工具本身

## BUG-002: CDP 调试器附加在 e2e 环境超时

**状态：** 未修复
**严重度：** 高（headless 下几乎所有 CDP 工具不可用）

**现象：**
`javascript_tool` / `read_page` 等 CDP 类工具报错：
`Failed to attach debugger to tab: Timed out attaching debugger. The user may have declined the Chrome debugger prompt, or the tab may have been closed.`

`chrome.debugger.attach` 的回调在 `DEBUGGER_API_TIMEOUT_MS = 10000`（10s）内不触发 → 超时。

**根因：**
- headless（`--headless=new`）下 `chrome.debugger.attach` 回调不触发，10s 超时
- headed 模式下附加也会偶发失败（"tab may have been closed"），但 agent 能恢复
- 这是 e2e 环境问题，但暴露了产品侧的脆弱性：工具失败时 agent 无法优雅退出（见 BUG-003）

**影响：**
headless e2e 下 `javascript_tool` / `read_page`(CDP 路径) / `computer` 等 CDP 工具全部不可用，agent 只能用 `get_page_text` / `form_input` / `find` 等 content-script 工具。

**headed 模式补充：**
headed 模式下 CDP 附加偶发成功，但后续 CDP 命令（`Runtime.evaluate` / `Accessibility.getFullAXTree`）会挂起（无超时）。headed 批次 12 个测试中约 70% 仍挂起（第一个 CDP 工具就卡住，`sdDebug=5`：`executeToolUses start` 后无 `done`）。仅当模型恰好选择 content-script 工具（`get_page_text`）时才能完成。

**与 BUG-003 叠加：** CDP 工具挂起 + agent loop 无最大迭代 → 几乎所有需要 CDP 工具的真实任务在 e2e 里死循环到测试超时。

## BUG-003: agent loop 无最大迭代限制，工具持续失败时死循环

**状态：** 未修复
**严重度：** 高

**现象：**
当工具持续返回错误（如 BUG-002 的调试器超时），agent loop 无限重试：模型换工具 → 失败 → 再换 → 失败，直到测试超时（120-280s）。`stop` 按钮一直可见，永不回到 idle。

**根因：**
`useAgentLoop.ts` 的 `while (continueLoop)` 只有 `continueLoop = synthesizeResult.continueLoop`（lightning）/ 工具执行后 `continueLoop = true`（普通 agent），没有最大迭代数 / 累计 token / 累计时长上限。

**修复方向：**
加 `MAX_ITERATIONS`（如 15）或累计时长上限，超限后强制结束并提示用户"工具多次失败，请检查环境/权限"。

## BUG-004: agent 低效挣扎后给含糊回复放弃，断言过松让 test 假通过

**状态：** 未修复
**严重度：** 中（任务未完成却显示成功，掩盖真实质量）
**复现：** `e2e/specs/real-llm-navigation.spec.ts -g "GitHub"`（完整日志 `e2e/debug-nav-github.log`）

**现象：**
GitHub trending 测试 13 轮 LLM、10 个工具调用、2.6 分钟，`errs=0`（无 CDP 错误、未挂起），但 agent 在 tab 操作上反复挣扎（Get tabs / Tabs create mcp / Superduck open / background fetch 循环），最终模型主动给出含糊回复"可能需要重新加载...请确认以上情况后，我可以再次尝试为您导航到 GitHub Trending 页面"，`done=true` 结束。`finalUrl=https://github.com/`（根本没到 trending）。

test 仍 passed——断言只检查 `done=true` + `finalUrl 含 github.com`，没验证真的到 trending 页 + 取到仓库名。

**根因：**
- 与 BUG-003 同根因：agent loop 无 `MAX_ITERATIONS`，允许低效挣扎很多轮（13 轮、10 工具）
- 模型在 tab/导航类任务上反复尝试同类工具，无"明确告知失败"机制，选择含糊推脱回复而非失败信号
- spec 断言过松：只检查 `done` + URL 域名，不验证任务实际完成

**与 BUG-003 的区别：** BUG-003 是工具持续失败时死循环到超时（done=false）；BUG-004 是模型自己放弃给含糊回复（done=true），任务未完成但看起来成功。

**修复方向：**
1. agent loop 加 `MAX_ITERATIONS`（同 BUG-003）——超限时强制明确失败，而非让模型磨到放弃
2. spec 断言加强：验证任务实际完成（`finalUrl` 含 `/trending`、回复含仓库名），而非只检查 `done` + 域名
3. 系统提示引导模型卡住时明确报告失败，而非含糊推脱

**诊断手段：** `[nav-github-trending +Ns]` watchdog 每 8 秒快照（tools/llm/roles/tail），node 侧 console.log 可被 playwright stdout 捕获；`[SD_DEBUG]` 是 sidepanel 页面 console，需 `page.on('console')` 转发才能捕获。

## 陷阱：LLM 观察器 Heisenbug（非产品 bug，已规避）

最初用 `fetch wrap + response.body.tee()` 观察 LLM 流，tee 破坏了 Anthropic SDK 的流读取，每次抛 `Connection error.` → 触发重试 → 历史不增长 → 看起来像"每轮只发 1 条消息的死循环"。改成只读 `request.postDataJSON()` 后消失。详见 memory `e2e-llm-observer-heisenbug`。
