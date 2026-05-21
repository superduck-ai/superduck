# SuperDuck Chrome 扩展 P0 端到端测试用例清单

> **适用范围**:Chrome MV3 扩展 `chrome-crx`,加载 `dist/` 构建产物,使用 Playwright 驱动。
> **优先级**:**P0(必测,主链路,失败即阻塞发布)**
> **测试方式**:LLM API 全部使用 mock(脚本化响应),保证确定性;真实 LLM 评测走独立 evals 模块。
> **维护**:每次发布前按本清单回归;新增 P0 功能时在对应大类追加 TC 编号。

---

## 思维导图

```
SuperDuck P0 E2E 测试用例
│
├─ 1. 扩展生命周期 (基础设施)
│   │
│   ├─ 1.1 加载安装
│   │   ├─ TC-1.1.1  加载 dist/ 后扩展出现在扩展列表, 无 manifest 报错
│   │   ├─ TC-1.1.2  Service Worker 注册成功, 可解析出 extensionId
│   │   ├─ TC-1.1.3  扩展图标显示在工具栏, title 为 "Open SuperDuck"
│   │   └─ TC-1.1.4  Options 页可通过右键菜单 / chrome://extensions 打开
│   │
│   ├─ 1.2 入口触发
│   │   ├─ TC-1.2.1  点击扩展图标可打开 side panel
│   │   ├─ TC-1.2.2  快捷键 Cmd+E (macOS) / Ctrl+E (其他) 切换 side panel 开关
│   │   └─ TC-1.2.3  再次按快捷键关闭 side panel
│   │
│   └─ 1.3 SW 生命周期
│       ├─ TC-1.3.1  Service Worker 被 idle 回收后, 用户操作能重新唤醒
│       └─ TC-1.3.2  重载扩展后 chrome.storage 数据持久化保留
│
├─ 2. Side Panel UI 基础
│   │
│   ├─ 2.1 打开 / 关闭 / 切换
│   │   ├─ TC-2.1.1  首次打开显示 EmptyState (含 RotatingTips)
│   │   ├─ TC-2.1.2  跨 tab 切换时 side panel 状态保留
│   │   ├─ TC-2.1.3  关闭再打开可恢复上次会话
│   │   └─ TC-2.1.4  side panel 在不同窗口 (window) 独立显示
│   │
│   ├─ 2.2 输入区 (RichTextInput)
│   │   ├─ TC-2.2.1  纯文本输入并通过 Enter 发送
│   │   ├─ TC-2.2.2  Shift+Enter 插入换行而不发送
│   │   ├─ TC-2.2.3  粘贴长文本 (>5000 字) 不卡顿且完整入框
│   │   ├─ TC-2.2.4  发送后输入框自动清空
│   │   ├─ TC-2.2.5  生成中发送按钮被禁用或切换为 Stop
│   │   └─ TC-2.2.6  截图附件可预览, 可点击移除
│   │
│   └─ 2.3 消息流 (MessageViews)
│       ├─ TC-2.3.1  用户消息按发送顺序正确渲染
│       ├─ TC-2.3.2  助手消息流式逐字出现 (ShimmerText 动画)
│       ├─ TC-2.3.3  Markdown 渲染: 标题 / 列表 / 链接 / 代码块
│       ├─ TC-2.3.4  代码块带语法高亮和复制按钮
│       ├─ TC-2.3.5  工具调用块 (ToolViews) 默认折叠, 可展开看到入参/出参
│       ├─ TC-2.3.6  AutoScroll 在流式输出时跟随到底
│       └─ TC-2.3.7  用户主动上滑后停止跟随, 出现"回到底部"按钮
│
├─ 3. 单轮问答主链路
│   │
│   ├─ 3.1 Happy Path
│   │   ├─ TC-3.1.1  发送一条普通问题, 收到完整流式回复, 状态机回到 idle
│   │   ├─ TC-3.1.2  收到回复后消息保存到当前会话历史
│   │   └─ TC-3.1.3  发送同一问题在新会话中独立, 不污染上一会话
│   │
│   ├─ 3.2 中断与错误
│   │   ├─ TC-3.2.1  生成中点击 Stop 立即停止流式输出
│   │   ├─ TC-3.2.2  Stop 后再次发送可正常工作
│   │   ├─ TC-3.2.3  API 5xx 错误展示 ErrorDisplay, 提供"重试"
│   │   ├─ TC-3.2.4  API 429 / 限流错误友好提示
│   │   └─ TC-3.2.5  请求超时 (mock) 后状态正确回滚
│   │
│   └─ 3.3 认证与引导
│       ├─ TC-3.3.1  无 API key 时引导用户跳转 Options
│       ├─ TC-3.3.2  无效 API key 返回 401, 提示"配置无效"
│       └─ TC-3.3.3  在 Options 配置 key 后, side panel 可立即正常发送
│
├─ 4. 工具调用 - 页面读取 (pageTools)
│   │
│   ├─ TC-4.1  get_url 返回当前活跃 tab 的 URL
│   ├─ TC-4.2  get_title 返回当前 tab 的 document.title
│   ├─ TC-4.3  get_a11y_tree 返回结构化无障碍树, 包含可见交互元素
│   ├─ TC-4.4  query_selector 命中存在元素时返回 ref
│   ├─ TC-4.5  query_selector 未命中时返回明确"未找到"错误
│   ├─ TC-4.6  scroll 工具按指定方向 / 距离滚动页面
│   └─ TC-4.7  wait 工具按指定毫秒数等待后返回
│
├─ 5. 工具调用 - 输入操作 (inputTools)
│   │
│   ├─ 5.1 click
│   │   ├─ TC-5.1.1  按有效 ref 点击按钮, 页面事件被触发
│   │   ├─ TC-5.1.2  点击链接触发导航, get_url 后返回新 URL
│   │   ├─ TC-5.1.3  ref 不存在时返回明确错误, 不阻塞会话
│   │   └─ TC-5.1.4  被遮挡 / disabled 元素点击失败有清晰报错
│   │
│   ├─ 5.2 type
│   │   ├─ TC-5.2.1  type 到 input, value 与传入字符串一致
│   │   ├─ TC-5.2.2  type 中文 / emoji / 特殊符号正确
│   │   ├─ TC-5.2.3  对非可编辑元素 type 返回错误
│   │   └─ TC-5.2.4  type 触发 input / change 事件
│   │
│   └─ 5.3 press_key
│       ├─ TC-5.3.1  press_key Enter 提交表单
│       ├─ TC-5.3.2  组合键 (Cmd+A / Cmd+C) 触发预期行为
│       └─ TC-5.3.3  Tab 键切换焦点到下一个可聚焦元素
│
├─ 6. 工具调用 - 媒体 (mediaTools)
│   │
│   ├─ TC-6.1  screenshot 整页, 返回有效图片 (尺寸 > 0)
│   ├─ TC-6.2  screenshot 按元素 ref 裁剪, 内容仅包含目标区域
│   ├─ TC-6.3  annotated screenshot 含标注层 (序号 / 框)
│   ├─ TC-6.4  跨 tab 切换后 screenshot 对应到正确 tab
│   └─ TC-6.5  截图在消息流中可点击放大
│
├─ 7. 工具调用 UX
│   │
│   ├─ TC-7.1  工具调用进行中显示"调用中"状态
│   ├─ TC-7.2  工具调用成功显示绿色 / 成功标识 + 结果摘要
│   ├─ TC-7.3  工具调用失败显示红色 / 错误标识 + 错误信息
│   ├─ TC-7.4  工具调用过程中页面出现视觉指示器 overlay
│   ├─ TC-7.5  工具调用结束 overlay 自动隐藏
│   └─ TC-7.6  blocking overlay 拦截用户在自动化期间的误操作
│
├─ 8. 端到端集成场景
│   │
│   ├─ 场景 A — 帮我点登录按钮
│   │   ├─ TC-8.A.1  打开 fixture 登录页 → 在 side panel 提问"帮我点登录按钮"
│   │   ├─ TC-8.A.2  LLM mock 返回 get_a11y_tree → click 工具序列
│   │   ├─ TC-8.A.3  click 工具执行成功, 页面跳转或弹窗出现
│   │   ├─ TC-8.A.4  视觉指示器在执行期间显示
│   │   └─ TC-8.A.5  助手最终给出"已点击登录按钮"自然语言确认
│   │
│   └─ 场景 B — 截图并总结当前页内容
│       ├─ TC-8.B.1  打开 fixture 长文页面 → 提问"总结这页"
│       ├─ TC-8.B.2  LLM mock 触发 screenshot 工具
│       ├─ TC-8.B.3  截图作为多模态消息回传 LLM (mock 验证 payload)
│       ├─ TC-8.B.4  收到 markdown 格式的总结流式输出
│       └─ TC-8.B.5  消息流中可看到截图缩略图 + 文字总结
│
└─ 通用前置条件 / 公共约定
    │
    ├─ 环境
    │   ├─ Node ≥ 20, Bun ≥ 1.1, Playwright ≥ 1.49
    │   ├─ Chromium (Playwright 内置)
    │   ├─ headed 模式启动 (扩展不支持纯 headless)
    │   └─ CI 上用 xvfb-run 包装
    │
    ├─ 启动方式
    │   ├─ 每个 spec 启动一个独立的 launchPersistentContext
    │   ├─ --disable-extensions-except=<abs path to dist>
    │   ├─ --load-extension=<abs path to dist>
    │   └─ 通过 service worker URL 解析 extensionId
    │
    ├─ Mock 策略
    │   ├─ LLM provider 请求统一被 fetch 拦截
    │   ├─ 每个 spec 注入自己的 mock 脚本 (messages → tool_calls → final)
    │   ├─ Native messaging host 不参与 P0, 全部 mock 或跳过
    │   └─ chrome.storage 在 fixture 中预置 API key / provider 配置
    │
    ├─ Fixture 页面
    │   ├─ 全部本地静态 html, 不依赖外网
    │   ├─ 包含: 登录按钮页 / 长文页 / 表单页
    │   └─ Playwright 内建 server 提供
    │
    ├─ 通过标准
    │   ├─ 每个 TC 必须有明确断言
    │   ├─ 失败时输出 trace + screenshot + video 到 e2e/test-results/
    │   └─ 不允许使用 sleep, 必须用 waitFor*
    │
    └─ 退出标准
        ├─ 全部 TC 在本地连续跑 3 次稳定通过
        ├─ 在 CI 上跑 1 次通过
        └─ 失败率 < 1% 视为稳定
```

---

## 统计

| 项目 | 值 |
|---|---|
| 大类 | 8 |
| 测试用例 (TC) 总数 | 60 |
| 覆盖模块 | 扩展生命周期 / Side Panel UI / 问答主链路 / 页面工具 / 输入工具 / 媒体工具 / 工具调用 UX / 集成场景 |
| **不在 P0 范围** | Options 完整功能 / 多轮压缩 / 工作流录制 / 语音 / Plan 模式 / Native host / 外部 MCP / 性能 / 安全 / i18n |

---

## 执行 Checklist (每次回归前打勾)

### 1. 扩展生命周期
- [ ] TC-1.1.1  加载 dist/ 后扩展出现在扩展列表, 无 manifest 报错
- [ ] TC-1.1.2  Service Worker 注册成功, 可解析出 extensionId
- [ ] TC-1.1.3  扩展图标显示在工具栏, title 为 "Open SuperDuck"
- [ ] TC-1.1.4  Options 页可通过右键菜单 / chrome://extensions 打开
- [ ] TC-1.2.1  点击扩展图标可打开 side panel
- [ ] TC-1.2.2  快捷键 Cmd+E / Ctrl+E 切换 side panel 开关
- [ ] TC-1.2.3  再次按快捷键关闭 side panel
- [ ] TC-1.3.1  Service Worker 被 idle 回收后, 用户操作能重新唤醒
- [ ] TC-1.3.2  重载扩展后 chrome.storage 数据持久化保留

### 2. Side Panel UI 基础
- [ ] TC-2.1.1  首次打开显示 EmptyState (含 RotatingTips)
- [ ] TC-2.1.2  跨 tab 切换时 side panel 状态保留
- [ ] TC-2.1.3  关闭再打开可恢复上次会话
- [ ] TC-2.1.4  side panel 在不同窗口独立显示
- [ ] TC-2.2.1  纯文本输入并通过 Enter 发送
- [ ] TC-2.2.2  Shift+Enter 插入换行而不发送
- [ ] TC-2.2.3  粘贴长文本 (>5000 字) 不卡顿且完整入框
- [ ] TC-2.2.4  发送后输入框自动清空
- [ ] TC-2.2.5  生成中发送按钮被禁用或切换为 Stop
- [ ] TC-2.2.6  截图附件可预览, 可点击移除
- [ ] TC-2.3.1  用户消息按发送顺序正确渲染
- [ ] TC-2.3.2  助手消息流式逐字出现 (ShimmerText 动画)
- [ ] TC-2.3.3  Markdown 渲染: 标题 / 列表 / 链接 / 代码块
- [ ] TC-2.3.4  代码块带语法高亮和复制按钮
- [ ] TC-2.3.5  工具调用块 (ToolViews) 默认折叠, 可展开看到入参/出参
- [ ] TC-2.3.6  AutoScroll 在流式输出时跟随到底
- [ ] TC-2.3.7  用户主动上滑后停止跟随, 出现"回到底部"按钮

### 3. 单轮问答主链路
- [ ] TC-3.1.1  发送一条普通问题, 收到完整流式回复, 状态机回到 idle
- [ ] TC-3.1.2  收到回复后消息保存到当前会话历史
- [ ] TC-3.1.3  发送同一问题在新会话中独立, 不污染上一会话
- [ ] TC-3.2.1  生成中点击 Stop 立即停止流式输出
- [ ] TC-3.2.2  Stop 后再次发送可正常工作
- [ ] TC-3.2.3  API 5xx 错误展示 ErrorDisplay, 提供"重试"
- [ ] TC-3.2.4  API 429 / 限流错误友好提示
- [ ] TC-3.2.5  请求超时 (mock) 后状态正确回滚
- [ ] TC-3.3.1  无 API key 时引导用户跳转 Options
- [ ] TC-3.3.2  无效 API key 返回 401, 提示"配置无效"
- [ ] TC-3.3.3  在 Options 配置 key 后, side panel 可立即正常发送

### 4. 工具调用 - 页面读取
- [ ] TC-4.1  get_url 返回当前活跃 tab 的 URL
- [ ] TC-4.2  get_title 返回当前 tab 的 document.title
- [ ] TC-4.3  get_a11y_tree 返回结构化无障碍树, 包含可见交互元素
- [ ] TC-4.4  query_selector 命中存在元素时返回 ref
- [ ] TC-4.5  query_selector 未命中时返回明确"未找到"错误
- [ ] TC-4.6  scroll 工具按指定方向 / 距离滚动页面
- [ ] TC-4.7  wait 工具按指定毫秒数等待后返回

### 5. 工具调用 - 输入操作
- [ ] TC-5.1.1  按有效 ref 点击按钮, 页面事件被触发
- [ ] TC-5.1.2  点击链接触发导航, get_url 后返回新 URL
- [ ] TC-5.1.3  ref 不存在时返回明确错误, 不阻塞会话
- [ ] TC-5.1.4  被遮挡 / disabled 元素点击失败有清晰报错
- [ ] TC-5.2.1  type 到 input, value 与传入字符串一致
- [ ] TC-5.2.2  type 中文 / emoji / 特殊符号正确
- [ ] TC-5.2.3  对非可编辑元素 type 返回错误
- [ ] TC-5.2.4  type 触发 input / change 事件
- [ ] TC-5.3.1  press_key Enter 提交表单
- [ ] TC-5.3.2  组合键 (Cmd+A / Cmd+C) 触发预期行为
- [ ] TC-5.3.3  Tab 键切换焦点到下一个可聚焦元素

### 6. 工具调用 - 媒体
- [ ] TC-6.1  screenshot 整页, 返回有效图片 (尺寸 > 0)
- [ ] TC-6.2  screenshot 按元素 ref 裁剪, 内容仅包含目标区域
- [ ] TC-6.3  annotated screenshot 含标注层 (序号 / 框)
- [ ] TC-6.4  跨 tab 切换后 screenshot 对应到正确 tab
- [ ] TC-6.5  截图在消息流中可点击放大

### 7. 工具调用 UX
- [ ] TC-7.1  工具调用进行中显示"调用中"状态
- [ ] TC-7.2  工具调用成功显示绿色 / 成功标识 + 结果摘要
- [ ] TC-7.3  工具调用失败显示红色 / 错误标识 + 错误信息
- [ ] TC-7.4  工具调用过程中页面出现视觉指示器 overlay
- [ ] TC-7.5  工具调用结束 overlay 自动隐藏
- [ ] TC-7.6  blocking overlay 拦截用户在自动化期间的误操作

### 8. 端到端集成场景
- [ ] TC-8.A.1  打开 fixture 登录页 → 在 side panel 提问"帮我点登录按钮"
- [ ] TC-8.A.2  LLM mock 返回 get_a11y_tree → click 工具序列
- [ ] TC-8.A.3  click 工具执行成功, 页面跳转或弹窗出现
- [ ] TC-8.A.4  视觉指示器在执行期间显示
- [ ] TC-8.A.5  助手最终给出"已点击登录按钮"自然语言确认
- [ ] TC-8.B.1  打开 fixture 长文页面 → 提问"总结这页"
- [ ] TC-8.B.2  LLM mock 触发 screenshot 工具
- [ ] TC-8.B.3  截图作为多模态消息回传 LLM (mock 验证 payload)
- [ ] TC-8.B.4  收到 markdown 格式的总结流式输出
- [ ] TC-8.B.5  消息流中可看到截图缩略图 + 文字总结

---

## 回归记录模板

每次回归在下面追加一条记录:

```
## YYYY-MM-DD 回归 — vX.Y.Z
- 执行人:
- 环境: macOS / Windows / Linux, Chromium 版本
- 通过 / 总数: __ / 60
- 失败 TC: TC-x.x.x (原因 / issue 链接)
- 备注:
```

### 历史记录

<!-- 在此追加每次回归记录 -->
