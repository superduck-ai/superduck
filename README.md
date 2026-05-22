<p align="center">
  <img src="extension_icon.svg" alt="SuperDuck" width="128" height="128" />
</p>

<h1 align="center">SuperDuck</h1>

<p align="center">
  <strong>Open-source AI browser assistant — any model, anywhere.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">🇨🇳 中文文档</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/chrome-%3E%3D116-green" alt="Chrome >= 116" />
  <img src="https://img.shields.io/badge/license-ISC-brightgreen" alt="License ISC" />
  <a href="https://www.npmjs.com/package/superduck-cli"><img src="https://img.shields.io/npm/v/superduck-cli" alt="npm" /></a>
</p>

---

## Why SuperDuck?

**Claude for Chrome** is great but geo-restricted and locked to expensive Claude models.

SuperDuck fixes both — **use any model, from anywhere**:

| | Claude for Chrome | SuperDuck |
|---|---|---|
| Region | US/UK only | Global |
| Models | Claude only | Claude, DeepSeek, Qwen, Kimi, Gemini, GPT, or any OpenAI-compatible API |
| Cost | Fixed pricing | Your API key, your budget |
| Browser control | Limited | Full CDP: click, scroll, type, screenshot, JS exec |
| Extensibility | Closed | MCP runtime, workflow recording, CLI |

## Features

**Multi-model routing** — Map Opus / Sonnet / Haiku slots to any provider's model. Switch per task.

**Browser automation** — Screenshot, click, scroll, type, navigate, and execute JavaScript on any tab via CDP.

**Workflow recording** — Record browser actions with voice narration. AI replays them for repeatable automation.

**MCP runtime** — Built-in Model Context Protocol runtime. Connect to any MCP-compatible server.

**CLI + MCP server** — `superduck` CLI lets AI coding agents (Claude Code, Codex, Cursor) drive your live Chrome session. Same cookies, same login — no headless browser.

**Refined UI** — Markdown with syntax highlighting, LaTeX math, image attachments, dark/light themes.

## Model Mapping

Point Settings at any OpenAI-compatible endpoint, then assign each slot:

| Slot | Default | Custom example |
|------|---------|----------------|
| Opus | `claude-opus-4-6` | `deepseek-r1` / `gpt-4o` |
| Sonnet | `claude-sonnet-4-6` | `qwen-max` / `kimi-k2.5` |
| Haiku | `claude-haiku-4-5` | `deepseek-chat` / `gemini-2.5-flash` |

## Quick Start

### Install the CLI (recommended)

```bash
npm install -g superduck-cli
superduck setup          # install native host & permissions
superduck doctor         # verify everything is wired
```

### Or load the extension manually

1. Download the latest [release](https://github.com/superduck-ai/superduck/releases) or [build from source](#build-from-source)
2. Go to `chrome://extensions/` → enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-crx/dist/` folder
4. Pin SuperDuck to your toolbar

## CLI

The `superduck` CLI bridges AI coding agents to your live Chrome session via Unix domain socket + Chrome Native Messaging.

```
Agent CLI  ──▶  superduck  ──▶  native host  ──▶  SuperDuck CRX  ──▶  tab
claude code      CLI binary     Go process        chrome extension     live page
                        └── UDS ─┘    └── chrome.runtime ─┘
```

Key commands:

```bash
superduck context             # read active tab url/title/selection
superduck screenshot          # capture viewport
superduck --tab $TAB navigate https://example.com
superduck --tab $TAB left_click 120 240
superduck --tab $TAB type "hello"
superduck --tab $TAB exec "document.title"
superduck --tab $TAB read_page --filter interactive
superduck --tab $TAB console --pattern error
```

Run `superduck --help` for the full command reference.

## Build from Source

```bash
git clone https://github.com/superduck-ai/superduck.git
cd superduck/chrome-crx
bun install
bun run build      # Output → chrome-crx/dist/
```

Development:

```bash
bun run dev         # Watch mode
bun run typecheck   # Type check
bun run lint        # Lint
bun run test        # Run tests
```

## Tech Stack

React 19 · TypeScript 5 · Vite 7 · Tailwind CSS 4 · Zustand · Framer Motion · Tiptap · @anthropic-ai/sdk · MCP SDK · Go

## Contributing

Contributions welcome! Fork → branch → commit → PR.

## License

[ISC](LICENSE)

---

<p align="center">Made with 🦆 by the SuperDuck community</p>
