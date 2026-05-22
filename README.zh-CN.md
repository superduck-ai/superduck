<p align="center">
  <img src="extension_icon.svg" alt="SuperDuck" width="128" height="128" />
</p>

<h1 align="center">SuperDuck</h1>

<p align="center">
  <strong>开源 AI 浏览器助手 — 任意模型，随处可用</strong>
</p>

<p align="center">
  <a href="README.md">🇺🇸 English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/chrome-%3E%3D116-green" alt="Chrome >= 116" />
  <img src="https://img.shields.io/badge/license-ISC-brightgreen" alt="License ISC" />
  <a href="https://www.npmjs.com/package/superduck-cli"><img src="https://img.shields.io/npm/v/superduck-cli" alt="npm" /></a>
</p>

---

## 为什么选 SuperDuck？

**Claude for Chrome** 很优秀，但有地区限制且只能用昂贵的 Claude 模型。

SuperDuck 解决了这两个问题 — **用任意模型，在任何地方**：

| | Claude for Chrome | SuperDuck |
|---|---|---|
| 地区 | 仅美/英 | 全球可用 |
| 模型 | 仅 Claude | Claude、DeepSeek、通义千问、Kimi、Gemini、GPT 或任何 OpenAI 兼容 API |
| 成本 | 固定定价 | 你的 API key，你的预算 |
| 浏览器控制 | 有限 | 完整 CDP：点击、滚动、输入、截图、JS 执行 |
| 可扩展性 | 封闭 | MCP 运行时、工作流录制、CLI |

## 功能特性

**多模型路由** — 将 Opus / Sonnet / Haiku 槽位映射到任意厂商模型，按任务切换。

**浏览器自动化** — 通过 CDP 在任意标签页上截图、点击、滚动、输入、导航、执行 JavaScript。

**工作流录制** — 带语音解说录制浏览器操作，AI 可重放，实现可复用的精细自动化。

**MCP 运行时** — 内置 Model Context Protocol 运行时，连接任意 MCP 兼容服务器。

**CLI + MCP 服务器** — `superduck` CLI 让 AI 编程助手（Claude Code、Codex、Cursor）直接驱动你正在运行的 Chrome。相同的 Cookie、相同的登录态 — 无需 headless 浏览器。

**精致界面** — Markdown 语法高亮、LaTeX 数学公式、图片附件、深色/浅色主题。

## 模型映射

在设置中填入任意 OpenAI 兼容的 API 地址，然后映射每个槽位：

| 槽位 | 默认 | 自定义示例 |
|------|------|------------|
| Opus | `claude-opus-4-6` | `deepseek-r1` / `gpt-4o` |
| Sonnet | `claude-sonnet-4-6` | `qwen-max` / `kimi-k2.5` |
| Haiku | `claude-haiku-4-5` | `deepseek-chat` / `gemini-2.5-flash` |

## 快速开始

### 安装 CLI（推荐）

```bash
npm install -g superduck-cli
superduck setup          # 安装 native host 与权限
superduck doctor         # 检查一切是否就绪
```

### 或手动加载扩展

1. 下载最新 [Release](https://github.com/superduck-ai/superduck/releases) 或[从源码构建](#从源码构建)
2. 访问 `chrome://extensions/` → 开启 **开发者模式**
3. 点击 **加载已解压的扩展程序** → 选择 `chrome-crx/dist/` 目录
4. 将 SuperDuck 固定到工具栏

## CLI

`superduck` CLI 通过 Unix domain socket + Chrome Native Messaging 将 AI 编程助手桥接到你正在运行的 Chrome。

```
Agent CLI  ──▶  superduck  ──▶  native host  ──▶  SuperDuck CRX  ──▶  tab
AI 编程助手      CLI 二进制     Go 进程           Chrome 扩展         实际页面
                        └── UDS ─┘    └── chrome.runtime ─┘
```

常用命令：

```bash
superduck context             # 读取当前标签页 url/标题/选中内容
superduck screenshot          # 截取可视区域
superduck --tab $TAB navigate https://example.com
superduck --tab $TAB left_click 120 240
superduck --tab $TAB type "hello"
superduck --tab $TAB exec "document.title"
superduck --tab $TAB read_page --filter interactive
superduck --tab $TAB console --pattern error
```

运行 `superduck --help` 查看完整命令参考。

## 从源码构建

```bash
git clone https://github.com/superduck-ai/superduck.git
cd superduck/chrome-crx
bun install
bun run build      # 产物 → chrome-crx/dist/
```

开发调试：

```bash
bun run dev         # 监听模式
bun run typecheck   # 类型检查
bun run lint        # 代码检查
bun run test        # 运行测试
```

## 技术栈

React 19 · TypeScript 5 · Vite 7 · Tailwind CSS 4 · Zustand · Framer Motion · Tiptap · @anthropic-ai/sdk · MCP SDK · Go

## 参与贡献

欢迎贡献！Fork → 新建分支 → 提交 → 发起 PR。

## 开源协议

[ISC](LICENSE)

---

<p align="center">Made with 🦆 by the SuperDuck community</p>
