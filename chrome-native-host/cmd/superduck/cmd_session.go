package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"

	"chrome-native-host/internal/cliclient"
)

// cmdSession dispatches the `session <subcommand>` family.
//
//	superduck session new           Mint a fresh browser-automation session id.
//
// The CLI has no host runtime to bound a browser session the way Codex's agent
// runtime does, so a long-running shell would otherwise reuse one global
// session (the persisted ~/.superduck/cli-session-id file) across unrelated
// tasks, leaking handoff tabs from one task into the next. Minting a per-task
// session id and passing it via --session gives each task its own tab scope.
func cmdSession(argv []string) error {
	if len(argv) == 0 {
		fmt.Fprintln(os.Stderr, sessionUsage)
		return nil
	}
	sub, rest := argv[0], argv[1:]
	switch sub {
	case "new":
		return cmdSessionNew(rest)
	case "name":
		return cmdSessionName(rest)
	case "-h", "--help", "help":
		fmt.Fprintln(os.Stderr, sessionUsage)
		return nil
	default:
		return fmt.Errorf("unknown session subcommand: %s\n%s", sub, sessionUsage)
	}
}

func cmdSessionNew(argv []string) error {
	fs := flag.NewFlagSet("session new", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}
	id, err := newSessionID()
	if err != nil {
		return err
	}
	if gflags.JSON {
		b, err := json.Marshal(map[string]any{"session_id": id})
		if err != nil {
			return err
		}
		fmt.Println(string(b))
		return nil
	}
	fmt.Println(id)
	return nil
}

// newSessionID mints a fresh, opaque browser-automation session id.
func newSessionID() (string, error) {
	return newRandomPrefixedID("cli:")
}

// cmdSessionName: superduck session name <text>
//
// Names the current browser session so its tab group is visually
// distinguishable from other concurrent sessions (mirrors Codex nameSession).
// The name is applied to the session's Chrome tab group.
func cmdSessionName(argv []string) error {
	fs := flag.NewFlagSet("session name", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}
	name := strings.TrimSpace(strings.Join(fs.Args(), " "))
	if name == "" {
		return fmt.Errorf("usage: superduck session name <text>")
	}
	args := map[string]any{"name": name}

	rec := cliclient.AuditRecord{Cmd: "session name"}
	if gflags.JSON {
		raw, err := cliclient.RunToolJSON("tabs_name_session_mcp", args, clientOpts(), &rec)
		if raw != "" {
			fmt.Println(raw)
		}
		return err
	}
	raw, err := cliclient.RunTool("tabs_name_session_mcp", args, clientOpts(), &rec)
	if err != nil {
		return err
	}
	fmt.Println(raw)
	return nil
}

const sessionUsage = `usage: superduck session <subcommand>

Subcommands:
  new             Mint a fresh browser-automation session id and print it.
  name <text>     Name the current session so its tab group is distinguishable
                  from other concurrent sessions. The 🦆 marker is auto-prepended
                  (do not add it). Pass --session <id> first.

Pass the minted id to every browser command in a task via --session <id>
(or export SUPERDUCK_SESSION_ID=<id>) so the task owns its own tab group
and does not collide with other concurrent tasks.

Example:
  SID=$(superduck session new)
  superduck --session "$SID" session name "🔎 deepseek research"
  TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty | jq -r '.tabContext.currentTabId')
  superduck --session "$SID" --tab "$TAB" navigate https://example.com/
  superduck --session "$SID" tab_group finalize --deliverable "$TAB"`
