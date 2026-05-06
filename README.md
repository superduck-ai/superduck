<p align="center">
  <img src="extension_icon.svg" alt="SuperDuck" width="128" height="128" />
</p>

<h1 align="center">🦆 SuperDuck</h1>

<p align="center">
  <strong>AI Browser Assistant — Any Model, Anywhere</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">🇨🇳 中文文档</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/chrome-%3E%3D116-green" alt="Chrome >= 116" />
  <img src="https://img.shields.io/badge/license-ISC-brightgreen" alt="License ISC" />
</p>

---

**Claude for Chrome** is great but geo-restricted and locked to expensive Claude models. SuperDuck fixes both:

- 🌍 **No region lock** — works everywhere
- 🔄 **Any model** — Claude, DeepSeek, Qwen, Kimi, Gemini, or any OpenAI-compatible API
- 💰 **Flexible cost** — cheap models for simple tasks, powerful ones for complex work

## Features

- **🧠 Multi-Model Switching** — Map Opus / Sonnet / Haiku slots to any provider's model
- **🖥️ Browser Automation** — Screenshot, click, scroll, type, navigate, execute JavaScript
- **📝 Workflow Recording** — Record browser actions with voice narration, let AI replay them
- **🔌 MCP Support** — Built-in Model Context Protocol runtime for extensible tools
- **🌐 i18n** — English & 简体中文
- **⌨️ Quick Access** — `Cmd+E` / `Ctrl+E` to toggle side panel
- **🎨 Rich UI** — Markdown with code highlighting, LaTeX math, image attachments, dark/light theme

## Model Mapping

Set a custom API endpoint in Settings, then map each slot to your preferred model:

| Slot | Default (Claude) | Custom Example |
|------|------------------|----------------|
| Opus | `claude-opus-4-6` | `deepseek-r1` / `gpt-4o` |
| Sonnet | `claude-sonnet-4-6` | `qwen-max` / `kimi-k2.5` |
| Haiku | `claude-haiku-4-5` | `deepseek-chat` / `gemini-2.5-flash` |

## Installation

1. Download the latest release or [build from source](#build-from-source)
2. Go to `chrome://extensions/` → enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-crx/dist/` folder
4. Pin SuperDuck to your toolbar 📌

## Build from Source

```bash
git clone https://github.com/superduck-ai/superduck.git
cd superduck/chrome-crx
bun install
bun run build      # Output in chrome-crx/dist/
```

Development:

```bash
bun run dev         # Watch mode
bun run typecheck   # Type check
bun run lint        # Lint
```

## Tech Stack

React 19 · TypeScript 5 · Vite 7 · Tailwind CSS 4 · Zustand · Framer Motion · Tiptap · @anthropic-ai/sdk · MCP SDK · react-intl

## Runbooks / Incident Response

Operational runbooks for on-call and AI agents live in [`runbooks/`](runbooks/) — covering extension crashes, native host disconnects, MCP server hangs, release rollback, CI failures, and secret-leak response. See [runbooks/README.md](runbooks/README.md) for the index.

## Contributing

Contributions welcome! Fork → branch → commit → PR.

## License

[ISC](LICENSE)

---

<p align="center">Made with 🦆 by the SuperDuck community</p>
