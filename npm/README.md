# superduck

> Your browser's session, callable as a tool.

`superduck` is a CLI that lets agents (Claude Code, Codex, etc.) read from and fetch as the user's currently-running Chrome — same login state, same cookies, same active tab.

## Install

```bash
npm install -g superduck-cli
superduck setup
```

Then in Chrome: install the SuperDuck extension, reload, and run:

```bash
superduck doctor
```

All green → you're ready.

## Quick start

```bash
superduck context                       # see what the user is reading
superduck fetch https://api.example.com # using their cookies
superduck tabs
```

See [SKILL.md](./SKILL.md) for the agent-facing usage doc.

## Architecture

```
agent CLI ──► superduck (this binary)
                 │ UDS /tmp/chrome-native-host.sock
                 ▼
              chrome-native-host (Go) ──Chrome Native Messaging──► SuperDuck extension ──► active tab
```

The native binary is shipped via npm `optionalDependencies` (one platform package per arch) so install never runs a `postinstall` download script.

## License

MIT
