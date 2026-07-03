# SuperDuck 本地 Debug 能力建设计划

## 背景

SuperDuck 的排障困难不在于缺少某一条日志，而在于一次用户动作会跨过多个运行域：

- sidepanel React / Zustand 状态
- 普通 Agent loop 与 LLM streaming
- Lightning mode 的命令解析与执行循环
- MCP tool runtime 与 permission / tab resolution
- Chrome Debugger Protocol、input dispatch、console / network / window.open
- screenshot、AX snapshot、ref bridge、stale ref recovery
- JavaScript execution、输出清洗、child tab adoption
- workflow recording、selector injection、截图、语音、step enhancement
- background native messaging、Go native-host、UDS、MCP server、CLI

之前的 “Teach SuperDuck modal slow click 打不开” 问题就是典型例子：最终现象是 click 丢失，但根因证据横跨 sidepanel render loop、React DOM 更新、svg 节点身份、浏览器 click 派发规则。只记录 tool result 对这种问题没有帮助。

本计划目标是建设一个本地开发阶段可用、agent 友好的 debug 系统。它不是线上 telemetry，不依赖 Sentry / Honeycomb，也不以 dashboard 为第一目标。第一目标是：失败发生后，开发者或 agent 可以导出一份 evidence bundle，直接判断问题发生在哪个运行域、缺少哪类证据、下一步该看哪个文件。

## 目标

1. 为每次调试创建明确的 `debugSessionId`，把 CRX、native-host、MCP、CLI 的相关事件串起来。
2. 按 SuperDuck 真实运行域采集证据，而不是做一条泛化日志流。
3. 支持本地导出 debug bundle，包含结构化事件、截图、AX / ref 摘要、JS 执行详情、tab 状态、native 状态和 agent 摘要。
4. 支持 agent 通过 CLI / MCP 一键收集当前诊断材料。
5. 支持典型故障的自动 diagnosis，例如 native timeout、debugger attach failure、stale ref、sidepanel render spike、workflow capture drop。
6. 所有 debug 采集默认本地保存，默认关闭，不上传线上。

## 非目标

1. 不先做完整可视化 dashboard。dashboard 可作为后续能力。
2. 不替代现有 analytics / Sentry / Honeycomb。线上遥测不是本计划重点。
3. 不把用户 prompt、完整页面文本、完整 JS 输入无脑落盘。必须有 redaction 与 size limit。
4. 不要求所有事件第一阶段都 100% 接入，但数据模型必须能覆盖完整系统。

## 核心设计

### Debug Session

引入本地 debug session。开启 debug 后，CRX 内各运行域写入同一个 session；native-host / CLI / MCP 请求通过 request id 与 session 关联。

建议新增目录：

```text
chrome-crx/src/debug/
  recorder.ts
  session.ts
  schema.ts
  artifacts.ts
  redaction.ts
  ringBuffer.ts
  diagnostics.ts
  exportBundle.ts
  runtimeMap.ts
  index.ts

chrome-native-host/internal/debugbundle/
  collect.go
  types.go
  redact.go

chrome-native-host/cmd/superduck/cmd_debug.go
```

### 关联 ID

所有事件至少带：

```ts
interface DebugBaseEvent {
  schemaVersion: 1;
  ts: string;
  monotonicMs?: number;
  debugSessionId: string;
  domain: DebugDomain;
  event: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  ids: DebugIds;
  data?: Record<string, unknown>;
  artifactRefs?: DebugArtifactRef[];
}

interface DebugIds {
  runtimeSessionId?: string;
  sidepanelInstanceId?: string;
  conversationUuid?: string;
  agentRunId?: string;
  lightningIterationId?: string;
  toolUseId?: string;
  requestId?: string;
  nativeRequestId?: string;
  workflowRecordingId?: string;
  tabId?: number;
  tabGroupId?: number;
  mcpTabGroupId?: number;
  operationId?: string;
}
```

ID 语义：

- `runtimeSessionId`: service worker lifetime，扩展重启后变化。
- `sidepanelInstanceId`: 每个 sidepanel mount 创建一次。
- `conversationUuid`: 现有会话 ID。
- `agentRunId`: 普通 agent 的一次 send / continue / retry。
- `lightningIterationId`: Lightning mode 每轮 parse / execute / screenshot / synthesize。
- `toolUseId`: provider tool_use id 或内部生成 id。
- `requestId`: `executeTool()` 内部 request id。
- `nativeRequestId`: CLI / MCP / native-host 发起的一次工具请求。
- `workflowRecordingId`: 一次 workflow recording 生命周期。
- `tabId` / `tabGroupId` / `mcpTabGroupId`: 浏览器目标。
- `operationId`: 非 tool 操作，例如 sidepanel render sample、tab reconcile、native reconnect。

### 运行域

```ts
type DebugDomain =
  | 'sidepanel'
  | 'agent-loop'
  | 'lightning'
  | 'tool-runtime'
  | 'permission'
  | 'tab-state'
  | 'cdp'
  | 'input'
  | 'screenshot-ref'
  | 'javascript'
  | 'workflow-recording'
  | 'native-bridge'
  | 'cli'
  | 'mcp-server'
  | 'diagnosis';
```

每个 domain 有自己的事件枚举和数据字段。不要把所有东西压成 `message: string`。

## 数据存储

### CRX 侧

CRX 不直接写本地文件，应使用两级存储：

1. 内存 ring buffer：保存最近 N 条事件，便于 service worker / sidepanel 快速读取。
2. IndexedDB：保存 debug session、事件 JSONL、artifact metadata、大 artifact 内容。

建议限制：

- 默认只保留最近 3 个 debug session。
- 单 session 默认最大 200MB。
- 单 artifact 默认最大 20MB。
- 文本字段默认 50KB 截断。
- 截图可保留原图，但在 summary 中只引用 artifact id。

### Native / CLI 侧

CLI `superduck debug collect` 通过 native-host 请求 CRX 导出当前 session 数据，然后落盘到：

```text
~/.superduck/debug/<timestamp>-<debugSessionId>/
```

建议 bundle 结构：

```text
~/.superduck/debug/2026-06-27T120000Z-abc123/
  00-readme.md
  summary.agent.md
  diagnosis.json
  runtime-map.json
  events/
    sidepanel.jsonl
    agent-loop.jsonl
    lightning.jsonl
    tool-runtime.jsonl
    permission.jsonl
    tab-state.jsonl
    cdp.jsonl
    input.jsonl
    screenshot-ref.jsonl
    javascript.jsonl
    workflow-recording.jsonl
    native-bridge.jsonl
    cli.jsonl
    mcp-server.jsonl
  artifacts/
    screenshots/
    ax/
    js/
    tab-state/
    native/
  raw/
    native-host.log
    mcp-server.log
    audit.jsonl
```

`summary.agent.md` 是给 agent 首读的文件，应该短而具体：

- session 时间范围
- 当前浏览器 / extension / native-host 版本
- 失败摘要
- 关键 correlated ids
- 错误事件 Top N
- 慢操作 Top N
- diagnosis 结果
- 下一步建议看哪些源码文件

`runtime-map.json` 记录一次运行中出现过的实体关系：

```json
{
  "debugSessionId": "...",
  "runtimeSessionId": "...",
  "sidepanels": [],
  "agentRuns": [],
  "toolUses": [],
  "tabs": [],
  "nativeRequests": [],
  "artifacts": []
}
```

## 隐私与 Redaction

所有 debug 写入必须经过 redaction：

- 默认屏蔽 key：`apiKey`、`api_key`、`authorization`、`cookie`、`password`、`secret`、`token`、`credential`、`session`。
- URL 保留 origin、path 可选；query 默认 redacted。
- JS code 保存 hash + 前 200 字符 preview；完整 code 只有用户显式开启 `includeSensitiveDebugPayloads` 才保存。
- LLM prompt / response 默认不保存全文，只保存长度、block 类型、tool_use 摘要、stop reason。
- screenshot 是敏感 artifact，debug collect 命令需要明确标记 bundle 包含截图。

## CRX 接入计划

### 1. DebugRecorder

新增 `chrome-crx/src/debug/recorder.ts`：

- `startDebugSession(options)`
- `stopDebugSession()`
- `getDebugStatus()`
- `recordEvent(event)`
- `recordArtifact(artifact)`
- `exportDebugBundle(request)`
- `withDebugSpan(domain, event, ids, fn)`

要求：

- debug 未开启时，调用开销接近 no-op。
- event 写入失败不能影响业务流程。
- 支持采样型 counter，例如 render / store mutation。
- 支持 `DEBUG_MODE` storage key 联动，但不要把现有 UI debug mode 和本地 evidence bundle 强绑定；可以有独立开关。

### 2. Sidepanel / Zustand / React

目标：定位 render loop、store 自激、DOM 身份被替换、sidepanel gate 卡住。

接入文件：

- `chrome-crx/src/sidepanel/SidepanelApp.tsx`
- `chrome-crx/src/sidepanel/hooks/useSidepanelState.ts`
- `chrome-crx/src/sidepanel/stores/*.ts`
- `chrome-crx/src/sidepanel/components/ChatInputArea.tsx`
- `chrome-crx/src/sidepanel/components/RichTextInput.tsx`

事件：

- `sidepanel.mount`
- `sidepanel.unmount`
- `sidepanel.gate.route`
- `sidepanel.render.sample`
- `sidepanel.render.spike`
- `sidepanel.store.set_state`
- `sidepanel.store.set_state.spike`
- `sidepanel.effect.sync_actions`
- `sidepanel.effect.sync_input`
- `sidepanel.dom.identity_check`

必须记录：

- `sidepanelInstanceId`
- component name
- render count per 100ms / 1000ms
- store name
- setState caller label
- changed keys
- selector subscription count，若可安全获取
- active gate
- current tab id / query tab id

实现建议：

- 不要用 DOM monkey patch 作为常规方案。
- 对 Zustand store 增加 dev-only middleware 或统一包装 `setState`。
- render counter 只在 debug session 开启时生效。
- 对关键用户动作可记录 mousedown / mouseup / click 的 target identity，用于验证 DOM 替换类问题。

验收场景：

- 复现 render loop 时，bundle 能指出哪个 store 每 100ms setState 次数异常。
- 点击按钮失败时，bundle 能显示 mousedown 和 mouseup 是否落在同一 DOM 节点，期间是否发生 render spike。

### 3. 普通 Agent Loop

目标：定位普通聊天路径中 LLM streaming、tool_use 解析、permission prompt、message state、cancel 的问题。

接入文件：

- `chrome-crx/src/sidepanel/hooks/useAgentLoop.ts`
- `chrome-crx/src/sidepanel/hooks/agentLoop/streamAndProcess.ts`
- `chrome-crx/src/sidepanel/hooks/agentLoop/executeToolUses.ts`
- `chrome-crx/src/sidepanel/hooks/useSubmitActions.ts`
- `chrome-crx/src/sidepanel/hooks/useEffectiveSendPrompt.ts`

事件：

- `agent.run.start`
- `agent.run.end`
- `agent.run.cancel`
- `agent.request.prepare`
- `agent.stream.start`
- `agent.stream.first_token`
- `agent.stream.delta`
- `agent.stream.stop`
- `agent.tool_use.detected`
- `agent.tool_use.dispatch`
- `agent.tool_result.append`
- `agent.permission.prompt`
- `agent.message.append`
- `agent.compaction.start`
- `agent.compaction.end`
- `agent.error`

必须记录：

- `agentRunId`
- `conversationUuid`
- selected model / provider
- message count / approximate token count
- attachment count and media types
- stop reason
- tool names and tool_use ids
- duration breakdown
- error category

不要默认记录：

- 完整 prompt
- 完整 model output
- 用户附件原始内容

验收场景：

- provider 正常返回 tool_use 但没有执行时，bundle 能显示卡在 parse、permission、dispatch 还是 ToolExecutor。
- cancel 后仍继续执行 tool 时，bundle 能显示 cancel timestamp 与后续 tool dispatch。

### 4. Lightning Mode

目标：Lightning mode 是独立执行系统，不能只靠普通 agent loop 事件。

接入文件：

- `chrome-crx/src/sidepanel/lightningMode/useLightningMode.ts`
- `chrome-crx/src/sidepanel/lightningMode/prepareApiRequest.ts`
- `chrome-crx/src/sidepanel/lightningMode/streamResponse.ts`
- `chrome-crx/src/sidepanel/lightningMode/parseCommands.ts`
- `chrome-crx/src/sidepanel/lightningMode/executeCommands.ts`
- `chrome-crx/src/sidepanel/lightningMode/settleAndScreenshot.ts`
- `chrome-crx/src/sidepanel/lightningMode/synthesizeToolMessages.ts`

事件：

- `lightning.run.start`
- `lightning.iteration.start`
- `lightning.stream.start`
- `lightning.parse.start`
- `lightning.parse.result`
- `lightning.command.start`
- `lightning.command.end`
- `lightning.permission.denied`
- `lightning.settle.start`
- `lightning.screenshot.captured`
- `lightning.synthesize.start`
- `lightning.iteration.end`
- `lightning.error`

必须记录：

- `lightningIterationId`
- command count
- command type
- active tab before / after
- page type
- permission mode / plan approved state
- phase timings：ttfb、streaming、commandExecution、pageSettle、screenshot
- screenshot artifact id

验收场景：

- Lightning 执行 JS 失败时，bundle 能关联到 `javascript` domain 的 Runtime.evaluate 详情。
- Lightning 点击后页面没变化时，bundle 能看到 command、input action、before/after screenshot。

### 5. Tool Runtime

目标：定位工具请求有没有进入 CRX、tab 怎么解析、permission 怎么处理、ToolExecutor 有没有执行、结果如何回传。

接入文件：

- `chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts`
- `chrome-crx/src/mcpRuntime/toolExecution/toolExecutor.ts`
- `chrome-crx/src/mcpRuntime/toolExecution/toolContextState.ts`
- `chrome-crx/src/mcpRuntime/toolExecution/permissionPrompt.ts`
- `chrome-crx/src/mcpRuntime/batchTool/execution.ts`

事件：

- `tool.request.received`
- `tool.tab.resolve.start`
- `tool.tab.resolve.end`
- `tool.debugger.attach.start`
- `tool.debugger.attach.end`
- `tool.context.start`
- `tool.executor.start`
- `tool.input.coerced`
- `tool.input.validation_failed`
- `tool.permission.required`
- `tool.permission.granted`
- `tool.permission.denied`
- `tool.execute.start`
- `tool.execute.end`
- `tool.result.formatted`
- `tool.response.sent`
- `tool.timeout`
- `tool.error`

必须记录：

- tool name
- source：`sidepanel` / `native-messaging` / `bridge` / `lightning`
- `requestId`、`toolUseId`、`nativeRequestId`
- input structural fields：action、tabId、ref、coordinate presence、diff、limit、full 等
- effective tab id / tab group id
- URL origin
- permission mode
- duration
- result type：success / permission_required / is_error / exception / timeout

验收场景：

- CLI 调工具 timeout 时，bundle 能区分 native-host 没把请求送到 CRX，还是 CRX 执行中超时。
- `read_page` fallback 到 content script 时，bundle 能显示 CDP 失败和 fallback 成功。

### 6. Permission

目标：permission 是很多问题的隐性分支，应独立建模。

接入文件：

- `chrome-crx/src/mcpRuntime/domainPermissions/*`
- `chrome-crx/src/mcpRuntime/toolExecution/permissionPrompt.ts`
- `chrome-crx/src/sidepanel/conversation/planMode.ts`
- `chrome-crx/src/permissions/PermissionManager.ts`

事件：

- `permission.check`
- `permission.prompt.show`
- `permission.prompt.response`
- `permission.grant`
- `permission.deny`
- `permission.plan.check`
- `permission.plan.approved`
- `permission.plan.rejected`

必须记录：

- action type
- URL origin / netloc
- permission mode
- duration
- result
- whether prompt handler exists

### 7. Tab State / Group Manager

目标：定位 tab resolution、MCP tab group、child tab adoption、blocklist、reconcile、active tab preservation 的问题。

接入文件：

- `chrome-crx/src/mcpRuntime/tabState/tabGroups.ts`
- `chrome-crx/src/mcpRuntime/tabState/mcpTabGroup.ts`
- `chrome-crx/src/mcpRuntime/navigationIsolation/*`
- `chrome-crx/src/mcpRuntime/pageTools/tabsContextTool.ts`
- `chrome-crx/src/mcpRuntime/pageTools/navigateTool.ts`

事件：

- `tab.resolve.start`
- `tab.resolve.end`
- `tab.group.initialize`
- `tab.group.reconcile.start`
- `tab.group.reconcile.end`
- `tab.group.promote`
- `tab.group.blocked`
- `tab.child.policy.remember`
- `tab.child.adopt.start`
- `tab.child.adopt.end`
- `tab.active.preserve.start`
- `tab.active.preserve.end`
- `tab.navigation.start`
- `tab.navigation.end`

Artifact：

- tab snapshot：所有相关 tab 的 id、url origin、title、groupId、active、status。

验收场景：

- 工具执行到错误 tab 时，bundle 能显示 requested tab、effective tab、available tabs。
- window.open 后新 tab 没进 MCP group 时，bundle 能显示 policy 与 adoption 结果。

### 8. CDP / Debugger / Input

目标：定位 debugger attach、CDP command、input dispatch、console/network/windowOpen 的问题。

接入文件：

- `chrome-crx/src/mcpRuntime/cdp/debugger.ts`
- `chrome-crx/src/mcpRuntime/cdp/eventHandlers.ts`
- `chrome-crx/src/mcpRuntime/cdp/input.ts`
- `chrome-crx/src/mcpRuntime/cdp/screenshot.ts`
- `chrome-crx/src/mcpRuntime/inputTools/computerTool.ts`
- `chrome-crx/src/mcpRuntime/inputTools/computerActions/*`

事件：

- `cdp.attach.start`
- `cdp.attach.end`
- `cdp.detach`
- `cdp.command.start`
- `cdp.command.end`
- `cdp.command.error`
- `cdp.tab_lock.wait`
- `cdp.tab_lock.release`
- `cdp.console.message`
- `cdp.exception`
- `cdp.network.request`
- `cdp.network.response`
- `cdp.window_open`
- `input.action.start`
- `input.action.end`
- `input.ref.resolve`
- `input.coordinate.resolve`
- `input.dispatch`
- `input.navigation.side_effect`

必须记录：

- CDP method
- tab id
- duration
- error message / Chrome lastError
- debugger detach reason
- input action
- ref id / backendNodeId presence
- coordinate source：ref / direct coordinate / fallback
- before / after URL

注意：

- 不要记录全部 CDP payload。只记录 method 和必要结构字段。
- console/network tracking 需要限量，避免高频页面撑爆 bundle。

验收场景：

- 用户取消 debugger banner 后，bundle 有 `cdp.detach` reason，并关联 STOP_AGENT。
- click 执行但页面没反应时，bundle 有 input dispatch 和 before/after screenshot。

### 9. Screenshot / AX / Ref

目标：定位 read_page、find、annotated screenshot、stale ref、WeakRef 注入、snapshot cache 的问题。

接入文件：

- `chrome-crx/src/mcpRuntime/axSnapshot/*`
- `chrome-crx/src/mcpRuntime/pageTools/readPageTool.ts`
- `chrome-crx/src/mcpRuntime/pageTools/findTool.ts`
- `chrome-crx/src/mcpRuntime/pageToolsSupport/snapshotCache.ts`
- `chrome-crx/src/mcpRuntime/screenshot/annotatedScreenshot.ts`
- `chrome-crx/src/mcpRuntime/screenshot/refBridge.ts`

事件：

- `ax.snapshot.start`
- `ax.snapshot.end`
- `ax.snapshot.fallback`
- `ax.snapshot.lock.wait`
- `ax.snapshot.lock.release`
- `ref.register.start`
- `ref.register.end`
- `ref.clear`
- `ref.prune`
- `ref.resolve.start`
- `ref.resolve.end`
- `ref.resolve_stale.start`
- `ref.resolve_stale.end`
- `screenshot.capture.start`
- `screenshot.capture.end`
- `screenshot.annotate.start`
- `screenshot.annotate.end`
- `snapshot_cache.hit`
- `snapshot_cache.miss`
- `snapshot_cache.invalidate`

必须记录：

- node count
- ref count
- interactive ref count
- stale ref count
- backendNodeId missing count
- annotation count
- screenshot artifact id
- fallback reason

Artifact：

- AX summary JSON，不默认保存完整页面文本。
- annotated screenshot PNG。
- ref registry stats。

验收场景：

- `computer` 使用 ref 失败时，bundle 能显示 ref 是否存在、是否 stale、是否恢复成功。
- annotated screenshot 没有标签时，bundle 能显示是 refMeta 为空还是 `DOM.getContentQuads` 全失败。

### 10. JavaScript Execution

目标：JS tool 信息密度高且副作用复杂，需要单独证据模型。

接入文件：

- `chrome-crx/src/mcpRuntime/pageTools/javascriptTool.ts`
- `chrome-crx/src/mcpRuntime/pageToolsSupport/wrapUserCode.ts`
- `chrome-crx/src/mcpRuntime/navigationIsolation/*`

事件：

- `javascript.exec.start`
- `javascript.permission.check`
- `javascript.security.check`
- `javascript.runtime.evaluate.start`
- `javascript.runtime.evaluate.end`
- `javascript.runtime.exception`
- `javascript.output.sanitized`
- `javascript.output.truncated`
- `javascript.window_open.detected`
- `javascript.child_tab.adopted`
- `javascript.search_navigation.moved`
- `javascript.exec.end`

必须记录：

- code hash
- code preview，redacted / truncated
- effective tab id
- URL origin
- Runtime.evaluate duration
- result type / subtype
- exceptionDetails summary
- output length before / after sanitization
- opened tab ids

Artifact：

- `artifacts/js/<toolUseId>.json`，包含 sanitized output、exception summary、opened tab info。

验收场景：

- JS 报错时，bundle 能看到 exceptionDetails，而不是只有 “Failed to execute JavaScript”。
- JS 打开新 tab 后 agent 找不到新 tab 时，bundle 能显示 windowOpen event 和 adoption 结果。

### 11. Workflow Recording

目标：workflow recording 是独立于 tool runtime 的事件系统，需要覆盖注入、捕获、截图、语音、增强描述。

接入文件：

- `chrome-crx/src/sidepanel/workflowRecording/useWorkflowRecording.ts`
- `chrome-crx/src/sidepanel/workflowRecording/startRecording.ts`
- `chrome-crx/src/sidepanel/workflowRecording/handleCapturedEvent.ts`
- `chrome-crx/src/sidepanel/workflowRecording/stopRecording.ts`
- `chrome-crx/src/sidepanel/workflowRecording/togglePause.ts`
- `chrome-crx/src/sidepanel/elementSelectorInjector.ts`
- `chrome-crx/src/sidepanel/hooks/useScreenCapture.ts`
- `chrome-crx/src/sidepanel/hooks/useSpeechRecognition.ts`

事件：

- `workflow.start`
- `workflow.stop`
- `workflow.pause`
- `workflow.resume`
- `workflow.tab.activate`
- `workflow.tab.outside_group`
- `workflow.selector.inject.start`
- `workflow.selector.inject.end`
- `workflow.event.captured`
- `workflow.event.dropped`
- `workflow.event.deduped`
- `workflow.screenshot.start`
- `workflow.screenshot.end`
- `workflow.click_marker.start`
- `workflow.click_marker.end`
- `workflow.speech.segment`
- `workflow.step.added`
- `workflow.step.enhance.start`
- `workflow.step.enhance.end`
- `workflow.error`

必须记录：

- `workflowRecordingId`
- tab id / group id
- injected tabs
- event timestamp
- event type
- drop reason
- screenshot artifact id
- speech segment count
- step count
- enhancement duration / failure reason

验收场景：

- 用户点击了但 workflow 没生成 step 时，bundle 能显示是 selector 没注入、event 被 dedupe、截图失败，还是 recording paused。
- 切到其他 tab 后 recording 暂停时，bundle 有 outside-group 事件和 active group。

### 12. Native Bridge / Go / CLI / MCP

目标：跨进程问题要能区分 CLI、MCP server、native-host、Chrome native messaging、CRX runtime 各层。

接入文件：

- `chrome-crx/src/background/nativeHost.ts`
- `chrome-native-host/cmd/native-host/main.go`
- `chrome-native-host/cmd/mcp-server/main.go`
- `chrome-native-host/internal/bridge/native_host.go`
- `chrome-native-host/internal/cliclient/*`
- `chrome-native-host/cmd/superduck/main.go`
- `chrome-native-host/cmd/superduck/cmd_doctor.go`
- `chrome-native-host/cmd/superduck/cmd_log.go`

新增 CLI：

```bash
superduck debug start
superduck debug stop
superduck debug status --json
superduck debug collect --output ~/.superduck/debug
superduck debug doctor --json
```

MCP tool：

- `superduck_debug_status`
- `superduck_debug_collect`
- `superduck_debug_snapshot`

事件：

- `native.connect.start`
- `native.connect.end`
- `native.disconnect`
- `native.heartbeat.ping`
- `native.heartbeat.timeout`
- `native.reconnect.schedule`
- `native.reconnect.start`
- `native.tool_request.received`
- `native.tool_request.forwarded`
- `native.tool_response.received`
- `native.tool_response.sent`
- `native.tool_request.timeout`
- `mcp.request.received`
- `mcp.request.forwarded`
- `mcp.response.sent`
- `cli.command.start`
- `cli.command.end`
- `cli.doctor.check`

必须记录：

- process pid
- socket path
- host name
- Chrome readiness
- native port status
- mcp connected
- request id
- tool name
- timeout
- duration

`doctor --json` 输出建议：

```json
{
  "ok": false,
  "checks": [
    {
      "id": "native_manifest",
      "category": "install",
      "status": "pass",
      "message": "Native messaging manifest found for Edge",
      "fix": null,
      "details": {}
    }
  ]
}
```

验收场景：

- MCP 调工具超时时，bundle 能判断 timeout 在 MCP -> native-host、native-host -> Chrome、还是 CRX tool execution。
- Chrome native messaging host 未安装时，doctor JSON 明确给出 fix。

## Diagnosis Builder

新增 `chrome-crx/src/debug/diagnostics.ts` 和 Go 侧 bundle 汇总逻辑。诊断不是 ML，是规则引擎。

输出：

```json
{
  "summary": "Tool request reached CRX but failed before ToolExecutor because debugger attach failed.",
  "findings": [
    {
      "id": "debugger_attach_failed",
      "severity": "error",
      "domain": "cdp",
      "evidence": ["event-id-1", "event-id-2"],
      "likelyCause": "Chrome debugger attach failed or user canceled debugger banner.",
      "nextFiles": [
        "chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts",
        "chrome-crx/src/mcpRuntime/cdp/debugger.ts"
      ]
    }
  ]
}
```

必须实现的规则：

1. `native_tool_timeout_no_crx_start`
   - native/MCP 有 request，CRX 没有 `tool.request.received`。
   - 指向 native messaging / service worker / port。

2. `crx_tool_start_no_executor`
   - CRX 有 `tool.request.received`，没有 `tool.executor.start`。
   - 看 tab resolution、permission、debugger attach。

3. `debugger_attach_failed`
   - `tool.debugger.attach.end` failed 或 `cdp.attach.end` failed。
   - 关联 URL 是否 chrome:// / edge:// / extension://。

4. `sidepanel_render_spike`
   - 100ms 内 render 或 store mutation 超阈值。
   - 输出 top stores / components。

5. `click_dom_identity_changed`
   - mousedown/mouseup/click identity 不一致，且期间 render spike。
   - 指向 React DOM replacement 类问题。

6. `stale_ref_after_navigation`
   - ref resolve failed，之前有 main frame navigation 或 snapshot invalidation。
   - 指向 refBridge / snapshot cache。

7. `annotated_screenshot_no_refs`
   - annotate requested，refMeta empty 或 content quads 全失败。

8. `js_runtime_exception`
   - Runtime.evaluate exceptionDetails 存在。
   - 输出 exception summary 和 source URL。

9. `js_child_tab_adoption_mismatch`
   - windowOpen event 存在，但 adopted tab ids 为空。
   - 指向 navigationIsolation / tabGroupManager。

10. `workflow_event_dropped`
    - selector injected but no step added；或 event dropped / deduped。
    - 输出 drop reason。

11. `workflow_screenshot_failed`
    - captured event 有，screenshot artifact 缺失。

12. `permission_prompt_missing_handler`
    - permission_required result 出现，但 handler 不存在。

13. `tool_success_but_page_unchanged`
    - input action success，但 before/after screenshot hash 与 URL 均无变化。
    - 作为 warning，提示检查 ref/coordinate 或页面吞事件。

## Export Bundle 细节

### `00-readme.md`

说明 bundle 如何阅读：

- 先看 `summary.agent.md`
- 再看 `diagnosis.json`
- 再按 finding 的 `nextFiles` 和 `events/*.jsonl` 定位
- screenshot 在 `artifacts/screenshots`

### `summary.agent.md`

示例结构：

```md
# SuperDuck Debug Summary

## Session
- debugSessionId:
- timeRange:
- extensionVersion:
- nativeHostVersion:
- browser:

## Top Findings
1. ...

## Runtime Map
- sidepanelInstanceId:
- agentRunId:
- toolUseId:
- tabId:
- nativeRequestId:

## Errors
- ...

## Slow Operations
- ...

## Suggested Source Files
- ...
```

### `events/*.jsonl`

每行一个 `DebugBaseEvent`。按 domain 拆文件，避免单文件太大。

### Artifact metadata

```ts
interface DebugArtifact {
  id: string;
  type:
    | 'screenshot'
    | 'annotated-screenshot'
    | 'ax-summary'
    | 'ref-registry'
    | 'js-result'
    | 'tab-snapshot'
    | 'native-status'
    | 'text';
  createdAt: string;
  ids: DebugIds;
  mimeType: string;
  byteLength: number;
  sha256: string;
  redacted: boolean;
  path?: string;
  data?: unknown;
}
```

## Developer UX

### 开启方式

侧边栏 debug 设置可选，但 CLI 必须支持：

```bash
superduck debug start
superduck debug status
superduck debug collect
superduck debug stop
```

也支持环境 / storage：

- CRX storage key：`DEBUG_EVIDENCE_ENABLED`
- Native env：`SUPERDUCK_DEBUG=1`
- Go log level：继续支持 `SUPERDUCK_LOG_LEVEL=debug`

### Agent 使用路径

Agent 排障时应执行：

```bash
superduck debug start
# reproduce issue
superduck debug collect
```

如果 agent 通过 MCP 调用，则可以调用：

```text
superduck_debug_collect
```

MCP 返回应包含：

- bundle path
- `summary.agent.md` 前几 KB
- diagnosis finding ids
- artifact count

## 测试计划

### TS 单测

新增或覆盖：

- `debug/recorder.test.ts`
- `debug/redaction.test.ts`
- `debug/ringBuffer.test.ts`
- `debug/diagnostics.test.ts`
- `debug/exportBundle.test.ts`

测试点：

- debug disabled 时 no-op。
- event redaction。
- circular / BigInt / unserializable field 不崩。
- ring buffer eviction。
- artifact size limit。
- diagnosis rule 命中。

### CRX 集成测试

覆盖：

- `executeTool()` 生成 tool-runtime 事件。
- `javascriptTool` exception 生成 javascript artifact。
- `refBridge.resolveStaleRef` 成功 / 失败事件。
- `captureAnnotatedScreenshot` 无 ref / quads 失败路径。
- sidepanel store setState counter。

### Go 单测

覆盖：

- `superduck debug collect` bundle 写盘。
- doctor JSON schema。
- native log / audit copy 不存在时不失败。
- redaction。

### E2E

建议新增：

1. `debug-tool-timeout.spec.ts`
   - 模拟工具超时，断言 diagnosis 能定位 timeout domain。

2. `debug-js-execution.spec.ts`
   - 执行抛错 JS，collect 后检查 `javascript.runtime.exception` 和 artifact。

3. `debug-workflow-recording.spec.ts`
   - start recording、点击、collect，检查 workflow events 和 screenshot artifact。

4. `debug-sidepanel-render-spike.spec.ts`
   - 可用测试开关注入一个 store loop，断言 `sidepanel_render_spike` finding。

## 验收标准

功能完成不以“有日志”为标准，而以以下问题能被 bundle 回答为标准：

1. CLI 工具调用失败时，能判断请求是否到达 CRX。
2. CRX 收到工具请求但失败时，能判断失败在 tab resolution、permission、debugger attach、tool execute、response formatting 哪一步。
3. JS 工具失败时，能看到 Runtime.evaluate exception summary、输出截断状态、child tab adoption 状态。
4. 点击 / 输入失败时，能看到 ref/coordinate 解析、CDP input dispatch、before/after screenshot、URL/tab 变化。
5. read_page / find / screenshot 相关问题能看到 AX node count、ref count、stale ref recovery、screenshot artifact。
6. workflow recording 没生成 step 时，能看到 selector injection、event captured/dropped、screenshot、speech、enhancement 状态。
7. sidepanel 卡顿或按钮打不开时，能看到 render spike、store setState spike、关键 DOM identity。
8. native-host / MCP timeout 时，能区分 Go UDS、Chrome native messaging、CRX service worker、tool runtime。
9. Agent 拿到 `summary.agent.md` 和 `diagnosis.json` 后，不需要重新加临时探针就能提出下一步定位方向。

## 实施顺序

下面的阶段只表示依赖顺序，不表示可以降级交付。最终交付必须满足本文所有运行域、diagnosis、bundle、CLI / MCP、测试和验收要求。执行 agent 不应以“先做 MVP”为完成理由，也不应因为改动量大而跳过 sidepanel、workflow、screenshot/ref、JavaScript、native bridge 这些非 tool-runtime 路径。

### 阶段 1：Debug 基础设施

1. 新增 CRX `debug/` 模块。
2. 实现 debug session lifecycle。
3. 实现 event recorder、redaction、ring buffer、IndexedDB artifact store。
4. 实现 `exportDebugBundle()` 的 CRX 内部 API。
5. 添加基础单测。

完成标准：

- debug disabled no-op。
- debug enabled 后可以在 CRX 内导出 events + artifacts metadata。
- redaction 和 size limit 生效。

### 阶段 2：关键执行链路接入

1. 接入 `toolExecution.ts`。
2. 接入 `toolExecutor.ts`。
3. 接入 `cdp/debugger.ts` 与 `eventHandlers.ts`。
4. 接入 `computerTool.ts` 与关键 computerActions。
5. 接入 `javascriptTool.ts`。
6. 接入 screenshot / AX / refBridge。

完成标准：

- 一次 `computer.screenshot`、一次 `javascript_tool`、一次 `read_page` 都能生成完整 correlated events。
- artifact 中能看到截图 / JS result / AX summary。

### 阶段 3：Sidepanel / Agent / Lightning / Workflow 接入

1. 接入 sidepanel instance、render counter、store mutation counter。
2. 接入普通 agent loop。
3. 接入 Lightning mode。
4. 接入 workflow recording。

完成标准：

- 普通聊天工具调用能从 `agent.run.start` 串到 `tool.response.sent`。
- Lightning command 能串到 computer / javascript domain。
- Workflow recording 能串到 screenshot artifact。
- render spike 能生成 finding。

### 阶段 4：Native / CLI / MCP collect

1. Go native-host / mcp-server 增加 request id 传递。
2. CRX nativeHost message 增加 debug control 消息。
3. CLI 增加 `debug start|stop|status|collect|doctor --json`。
4. MCP 增加 `superduck_debug_status|collect|snapshot`。
5. collect 写出 bundle。

完成标准：

- `superduck debug collect` 能生成标准 bundle。
- MCP tool 能返回 bundle path 和 summary。
- doctor JSON 可被 agent 解析。

### 阶段 5：Diagnosis Builder

1. 实现 diagnosis rules。
2. 实现 `summary.agent.md`。
3. 实现 `runtime-map.json`。
4. 为典型故障补 e2e。

完成标准：

- 典型故障规则至少覆盖本计划列出的 13 条。
- bundle 首屏信息足够 agent 判断下一步。

## 代码约束

1. 修改 `chrome-crx/src/**` 后必须执行：

```bash
cd chrome-crx
bun run build
```

2. 涉及 TS 类型或测试时执行：

```bash
cd chrome-crx
bun run typecheck
bun run lint
bun run test
```

3. 修改 Go 代码后执行：

```bash
cd chrome-native-host
make test
make lint
make
```

4. 不要把 debug 事件写成散落的 `console.log`。所有新增事件必须通过 `debug/recorder`。
5. 不要在业务路径里让 debug 写入失败影响功能。
6. 不要默认保存敏感全文。
7. 不要只接 tool runtime；必须覆盖 sidepanel、workflow、screenshot/ref、JS、native bridge。

## 推荐给执行 Agent 的第一步

### Goal Prompt

可以把下面这段作为执行 agent 的目标提示词：

```text
你在 /Users/xg/Coding/CVTE/superduck 仓库工作。请完整实现 docs/debug-capability-plan.md 中定义的 SuperDuck 本地 debug evidence 系统。不要按工作量裁剪需求；优先保证 debug 系统质量、可诊断性、agent 可用性和测试覆盖。

你必须持续推进并分批 commit，直到计划中的所有运行域都接入：sidepanel/Zustand/React render、普通 agent loop、Lightning mode、tool runtime、permission、tab state、CDP/input、screenshot/AX/ref、JavaScript execution、workflow recording、native-host/MCP/CLI。

每个 commit 必须是可解释的垂直切片或清晰基础设施改动，并且必须包含对应单测；涉及用户可见链路、跨进程链路、浏览器行为或历史 bug 类型时，还必须新增或更新必要 e2e 测试。不要提交只加实现不加测试的功能改动。

每次修改 chrome-crx/src/** 后必须运行 cd chrome-crx && bun run build；相关 TS 改动还要运行 bun run typecheck、bun run lint、bun run test。每次修改 chrome-native-host/** 后必须运行 cd chrome-native-host && make test，并在可用时运行 make lint 和 make。测试失败必须修复，不能把失败留给后续 commit。

完成标准不是“有日志”或“工具调用有 trace”，而是 docs/debug-capability-plan.md 的验收标准全部满足：失败后 superduck debug collect / MCP debug collect 能导出包含 summary.agent.md、diagnosis.json、runtime-map.json、domain events、screenshots、AX/ref、JS、tab-state、native 状态的 evidence bundle；agent 能根据 bundle 判断问题发生在哪个运行域以及下一步该看哪个源码文件。

不要从 dashboard 或 UI 开始；先实现 debug recorder、redaction、artifact store、export bundle 和 diagnosis，再逐域接入。不要保存敏感全文；所有 debug 写入必须经过 redaction 和 size limit。debug disabled 时业务路径必须接近 no-op，debug 写入失败不得影响业务功能。
```

### Hard Rules

执行 agent 必须遵守：

1. 不允许把 “tool result trace” 当成完整方案；tool runtime 只是其中一个 domain。
2. 不允许只做 CRX 或只做 Go；最终必须覆盖 CRX + native-host + CLI + MCP。
3. 不允许用散落的 `console.log` 代替 debug recorder。
4. 不允许默认保存完整 prompt、完整页面文本、完整 JS code、cookie、token、authorization 或未清洗 URL query。
5. 不允许跳过 screenshot / AX / ref / JavaScript / workflow recording；这些是 SuperDuck 最难排障的核心路径。
6. 不允许用 dashboard 代替 evidence bundle；bundle 是第一交付面。
7. 不允许没有测试的功能 commit。
8. 不允许在没有更新 diagnosis / summary 规则的情况下新增只写不读的事件。
9. 不允许让 debug 写入失败影响正常工具执行、sidepanel 渲染或 native bridge。
10. 不允许在文档验收标准未全部满足时宣称完成。

执行 agent 开始前先读这些文件：

- `chrome-crx/src/lib/logger.ts`
- `chrome-crx/src/observability.ts`
- `chrome-crx/src/background/nativeHost.ts`
- `chrome-crx/src/mcpRuntime/toolExecution/toolExecution.ts`
- `chrome-crx/src/mcpRuntime/toolExecution/toolExecutor.ts`
- `chrome-crx/src/mcpRuntime/cdp/debugger.ts`
- `chrome-crx/src/mcpRuntime/cdp/eventHandlers.ts`
- `chrome-crx/src/mcpRuntime/pageTools/javascriptTool.ts`
- `chrome-crx/src/mcpRuntime/inputTools/computerTool.ts`
- `chrome-crx/src/mcpRuntime/screenshot/refBridge.ts`
- `chrome-crx/src/mcpRuntime/screenshot/annotatedScreenshot.ts`
- `chrome-crx/src/sidepanel/hooks/useSidepanelState.ts`
- `chrome-crx/src/sidepanel/lightningMode/useLightningMode.ts`
- `chrome-crx/src/sidepanel/lightningMode/executeCommands.ts`
- `chrome-crx/src/sidepanel/workflowRecording/useWorkflowRecording.ts`
- `chrome-crx/src/sidepanel/workflowRecording/startRecording.ts`
- `chrome-crx/src/sidepanel/workflowRecording/handleCapturedEvent.ts`
- `chrome-native-host/cmd/superduck/cmd_doctor.go`
- `chrome-native-host/cmd/superduck/cmd_log.go`
- `chrome-native-host/internal/bridge/native_host.go`

然后先实现 `chrome-crx/src/debug/` 的 no-op recorder 和 redaction 单测，再逐域接入。不要从 dashboard 或 UI 开始。
