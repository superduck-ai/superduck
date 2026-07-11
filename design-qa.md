# SuperDuck 侧边栏空状态视觉 QA

## 结论

本轮已按用户最新指示恢复仓库最原版的逐笔手绘 Canvas 动画。Logo 的绘制数据、笔画顺序、压力线宽、圆头笔触、固定灰色、倾斜角度和播放速度均与仓库基线一致；唯一对 Logo 原始方案的调整是将 `fontSize` 从 `88px` 缩小为 `64px`。

此前实现的实体字体和 CSS 裁切揭示均已移除。当前没有因本轮“恢复原动画、只缩小尺寸”产生的 P0、P1 或 P2 问题。

## 对比目标

- source visual truth path: `/var/folders/nd/5gq2rpmx7839dh6bjdr42frh0000gn/T/codex-clipboard-02c20e7e-2696-4858-9de2-21f9289d58cd.png`
- supplemental original-animation evidence path: `/var/folders/nd/5gq2rpmx7839dh6bjdr42frh0000gn/T/codex-clipboard-a51c083b-cb0e-4ce6-acea-425b0b5ed1d5.png`
- normalized source path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/source-514x934.png`
- primary implementation screenshot path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/01-empty-chat-514x934.png`
- dark implementation screenshot path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/04-empty-chat-dark-514x934.png`
- light theme round-trip screenshot path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/06-theme-roundtrip-light-514x934.png`
- original handdraw implementation path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/07-original-handdraw-light-485x928.png`
- original animation midpoint path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/08-original-animation-midpoint-485x928.png`
- original animation complete path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/09-original-animation-complete-485x928.png`
- English implementation path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/10-empty-chat-en-485x928.png`
- measured evidence path: `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/metrics.json`

## 视口与状态

- 主视口：`514 × 934`；中文、浅色、空会话、`kimi` provider、完全访问模式。
- 用户补充截图为 `970 × 1856`，对应约 `485 × 928` CSS 视口；实现已在该视口单独捕获。
- 额外状态：`360 × 720` 窄屏、深色、返回浅色、动画约 `450ms` 中间态、动画完成态。
- 本次 QA 的设计范围是 Logo 动画的原版还原与尺寸调整；页面其他区域只检查是否出现由 Logo 修改造成的布局回归。

## 对比证据

### Full-view comparison evidence

- `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/comparison-full.png`
- `/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/comparison-size-only-full.png`
- 全屏比较确认 Logo 从原来的大尺寸收敛为 `64px`，欢迎语、输入区和顶部工具的位置没有因恢复 Canvas 动画而发生新的偏移或溢出。

### Focused region comparison evidence

- 动画中间态／完成态：`/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/comparison-original-animation.png`
- 浅色／深色／返回浅色：`/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/comparison-theme-roundtrip.png`
- 中文／英文欢迎语：`/Users/it00013153/IdeaProjects/superduck/chrome-crx/e2e/test-results/visual-qa/comparison-bilingual-subtitle.png`
- 中间态可见按原 glyph stroke 顺序绘制到 “Su”；完成态为完整 `SuperDuck`。这不是左右裁切文字，而是原始压力采样点沿笔画路径逐段绘制。

## Required fidelity surfaces

### Fonts and typography

- 恢复原 `glyphData.json` 笔画数据与 Satisfy 字体度量，不使用实体 DOM 字形替代手绘过程。
- 恢复原 Canvas `requestAnimationFrame`、每字 glyph timing 和笔画 delay/duration。
- 保留原 `speed={3}`、`skewX(-10deg)` 和 `rgb(156,156,156)`。
- 唯一参数差异为 `fontSize={64}`；仓库原始值为 `88`。
- 欢迎语仍作为 Logo 下方二级信息，未被倾斜；Logo 自身保持原始倾斜风格。
- 中文欢迎语通过 `lang="zh-CN"` 使用 `Songti SC` 优先的中文衬线栈，规格为 `14px / 400 / 20px / 0.01em`。
- 英文欢迎语通过 `lang="en-US"` 使用 `Iowan Old Style` 优先的人文衬线栈，规格为 `15px / 400 / 21px / 0.005em`。
- 字体规则只作用于 `.superduck-welcome-subtitle`，未扩散到输入框、顶部栏、消息或其他 UI。

### Spacing and layout rhythm

- Canvas 最终高度约 `90px`，Logo 仍位于欢迎组上方，不改变底部输入区布局。
- Logo 与欢迎语的布局间距从 `12px` 收到 `10px`，衬线字体自带的上下留白得到光学校正。
- 输入框保持 `92px` 高、左右 `16px` 边距和底部 `12px` 安全区。
- `360px` 窄屏无横向 overflow，Canvas 会沿用原组件的容器宽度拟合逻辑。
- 恢复原动画没有修改顶部栏、输入框、免责声明或页面 dock 的间距。

### Colors and visual tokens

- Logo 恢复仓库原始固定灰色 `rgb(156, 156, 156)`，不再使用 `currentColor` 或主题 token 改写颜色。
- 浅色、深色、返回浅色三态中，Canvas 父容器计算色均保持同一个固定灰色。
- 页面其他颜色 token 未因本次恢复原动画而修改。
- 欢迎语浅色使用 foreground 的 `58%` 混合，深色使用 `68%`；中英文共享同一颜色规则。

### Image quality and asset fidelity

- Logo 使用项目原有 glyph stroke 数据和 Canvas 绘制，不是新字体、截图、图片、SVG、CSS 字形或近似动画。
- 恢复 `lineCap = round`、`lineJoin = round` 与原始 pressure-to-width 公式，保留原动画自身的手绘采样质感。
- Canvas 仍按 `devicePixelRatio` 输出，避免高分屏模糊。

### Copy and content

- 本轮未修改任何产品文案。
- “今天我能帮您什么？”、输入提示和免责声明保持此前确认版本。
- 英文保持 “How can I help you today?”，没有使用斜体或重新翻译。

## Interaction and accessibility checks

- 动画页面约 `450ms` 时 Canvas 已有非透明像素，证明逐笔绘制已开始。
- 完成态非透明像素数量大于中间态，证明动画持续沿笔画添加内容，而非静态图切换。
- 中间态与完成态颜色均为 `rgb(156, 156, 156)`。
- 同页完成浅色、深色、返回浅色切换，Logo 保持可见且颜色不发生主题化改写。
- Canvas 保留 `role="img"` 与 `aria-label="SuperDuck"`。
- 页面无横向溢出；console errors 与 page errors 均为空。
- 用户明确要求“最原版动画”，因此原版不响应 `prefers-reduced-motion` 的行为也一并恢复，没有擅自加入新的动效规则。
- 自动回归检查中文 `lang="zh-CN"`、英文 `lang="en-US"`，并验证各自字体栈、字号、字重、行高和英文宽度不超过视口。

## Findings

- P0：无。
- P1：无遗留问题。
- P2：无遗留问题。
- 接受的设计特征：原 Canvas 由压力采样点逐段绘制，完成态会保留原动画的手绘颗粒感；这是用户最新明确选择的原版样式，不再作为缺陷处理。
- 范围说明：工作区其他未提交视觉变化不属于本轮“恢复 Logo 原动画、仅调整尺寸”的授权范围，未在本轮回退或重做。

## QA iteration history

### Iteration 1 — P2：免责声明贴底过紧

- Fix: 底部 dock 保留单一 `12px` 安全区。
- Evidence: `comparison-bottom.png` 与 `metrics.json`。

### Iteration 2 — P2：输入框焦点环偏蓝紫

- Fix: 浅色和深色 focus ring 改为中性灰。
- Evidence: `02-input-focus-514x934.png`、`05-input-focus-dark-514x934.png`。

### Iteration 3 — P1：权限菜单点击后立即关闭

- Fix: 权限触发按钮阻止点击冒泡。
- Evidence: Chromium E2E 可稳定展开两种权限模式。

### Iteration 4 — 已被用户后续方向覆盖

- Earlier change: 用实体 Satisfy 字形替换 Canvas，以消除采样点。
- Superseded because: 用户明确要求恢复最原版手绘动画，并要求不改颜色和样式。

### Iteration 5 — 已被用户后续方向覆盖

- Earlier change: 为实体字形增加 `1.65s` 左右裁切揭示。
- Superseded because: 该效果不是原版沿 glyph stroke 路径逐笔绘制。

### Iteration 6 — 恢复最原版动画，仅调整尺寸

- Finding: 上一版仍偏离用户要求的“最原版手绘动画”。
- Fix: 完整恢复仓库基线 `HandwritingAnimation.tsx`；恢复 Canvas、glyph timing、压力线宽、圆头笔触、`speed={3}`、固定灰色和 `skewX(-10deg)`。只把调用处字号从 `88` 改为 `64`。
- Post-fix evidence: `08-original-animation-midpoint-485x928.png`、`09-original-animation-complete-485x928.png`、`comparison-original-animation.png` 和 `comparison-theme-roundtrip.png`。

### Iteration 7 — P2：欢迎语与手绘 Logo 的字体语气不协调

- Finding: 中文原为 `15px / 500` 的现代无衬线体，重量和硬度高于浅灰手绘 Logo；英文若沿用同一规则，语言切换后会像另一套品牌系统。
- Fix: 增加语言感知的 `.superduck-welcome-subtitle`。中文使用 Songti 系统栈 `14px / 400 / 20px`，英文使用 Iowan/Baskerville 系统栈 `15px / 400 / 21px`；分别设置轻微字距，统一深浅主题颜色规则，并将与 Logo 的间距收为 `10px`。
- Post-fix evidence: `07-original-handdraw-light-485x928.png`、`10-empty-chat-en-485x928.png` 与 `comparison-bilingual-subtitle.png`；真实 Chromium 计算样式和宽度断言均通过。

### Final comparison pass

- 打开并排检查动画中间态与完成态：笔画顺序、颜色、倾斜和质感符合原始实现。
- 打开浅色、深色、返回浅色三态：固定灰色保持一致。
- 打开中文与英文并排证据：两种语言都作为 Logo 的次级邀请语，英文长句无溢出，中文宋体在深浅主题均可读。
- 五个 required fidelity surfaces 已检查；当前没有与最新用户意图冲突的 P0/P1/P2。

## Verification summary

- `bun run typecheck`: passed
- `bun run lint:ci`: passed，0 warnings
- `bun run test`: passed，72 files / 702 tests
- `bun run build`: passed
- visual regression Playwright E2E: passed，1/1

## Implementation checklist

- [x] 恢复原 glyph stroke Canvas 绘制。
- [x] 恢复原固定灰色、倾斜、速度、压力线宽和圆头笔触。
- [x] 仅将 Logo 字号从 `88px` 缩小为 `64px`。
- [x] 移除实体 DOM 字形和 CSS 裁切动画。
- [x] 验证动画中间态、完成态和浅／深／浅主题往返。
- [x] 为中英文欢迎语分别应用语言感知衬线字体栈和光学尺寸。
- [x] 验证中文、英文、深色、窄屏和英文长句宽度。
- [x] 验证构建、类型、规范、测试、console/page error 和视觉 QA。

final result: passed
