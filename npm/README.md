# superduck

> Your browser's session, callable as a tool.

`superduck` is a CLI that lets browser-capable agents inspect and operate the user's currently-running Chrome - same login state, same cookies, managed browser tabs.

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
TAB=$(superduck tab_group list --create-if-empty | awk '/^- tabId/ {gsub(/:/, "", $3); print $3; exit}')
superduck --tab "$TAB" navigate https://example.com/
superduck --tab "$TAB" read_page --filter interactive
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
