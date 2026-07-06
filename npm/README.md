# superduck

> Your browser's session, callable as a tool.

`superduck` is a CLI bridge that lets AI agents inspect and operate your Chrome browser - same login state, same cookies, managed browser tabs.

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
superduck context                       # read the active tab's url/title/selection/visible text

SID=$(superduck session new)
TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty --name "Quick start" | jq -r '.tabContext.currentTabId')
superduck --session "$SID" --tab "$TAB" navigate https://example.com/
superduck --session "$SID" --tab "$TAB" read_page      # read page content + accessibility tree
superduck --session "$SID" --tab "$TAB" page_text      # extract main article text
superduck --session "$SID" --tab "$TAB" read_page --filter interactive  # find refs for actions
superduck --session "$SID" tab_group finalize
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
