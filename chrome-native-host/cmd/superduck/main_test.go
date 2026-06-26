package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chrome-native-host/internal/cliclient"
)

func TestExtractSubcommand(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		cmd, want string
		rest      []string
	}{
		{"tab_group/list", "tab_group", "list", []string{"list"}},
		{"tab_group/ls-alias", "tab_group", "list", []string{"ls", "--create-if-empty"}},
		{"tab_group/new", "tab_group", "new", []string{"new"}},
		{"tab_group/finalize", "tab_group", "finalize", []string{"finalize", "--deliverable", "123"}},
		{"tab_group/unknown", "tab_group", "unknown", []string{"weird"}},
		{"tab_group/empty", "tab_group", "", nil},
		{"gif/start", "gif", "start", []string{"start"}},
		{"gif/export", "gif", "export", []string{"export", "--download"}},
		{"gif/unknown", "gif", "unknown", []string{"foo"}},
		{"shortcuts/list", "shortcuts", "list", []string{"list"}},
		{"shortcuts/get", "shortcuts", "get", []string{"get", "my-shortcut"}},
		{"navigate/back", "navigate", "back", []string{"back"}},
		{"navigate/url", "navigate", "url", []string{"https://example.com"}},
		{"navigate/url-with-tab", "navigate", "url", []string{"--tab", "https://example.com"}},
		{"screenshot/empty", "screenshot", "", []string{"--output", "/tmp"}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := extractSubcommand(tc.cmd, tc.rest)
			if got != tc.want {
				t.Errorf("extractSubcommand(%q, %v) = %q, want %q", tc.cmd, tc.rest, got, tc.want)
			}
		})
	}
}

func TestSplitGlobalFlagsSessionTurn(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}

	args := splitGlobalFlags([]string{
		"--session", "session-a",
		"tab_group",
		"--turn", "turn-1",
		"list",
	})

	if got, want := args, []string{"tab_group", "list"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("splitGlobalFlags args = %v, want %v", got, want)
	}
	if gflags.SessionID != "session-a" || gflags.TurnID != "turn-1" {
		t.Fatalf("session/turn = (%q, %q), want (session-a, turn-1)", gflags.SessionID, gflags.TurnID)
	}
}

func TestResolvedBrowserSessionAndTurn(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}

	t.Setenv("SUPERDUCK_SESSION_ID", "env-session")
	t.Setenv("SUPERDUCK_TURN_ID", "env-turn")
	if got := resolvedBrowserSessionID(); got != "env-session" {
		t.Fatalf("resolvedBrowserSessionID() = %q, want env-session", got)
	}
	if got := resolvedBrowserTurnID("env-session"); got != "env-turn" {
		t.Fatalf("resolvedBrowserTurnID() = %q, want env-turn", got)
	}

	gflags.SessionID = "flag-session"
	gflags.TurnID = "flag-turn"
	if got := resolvedBrowserSessionID(); got != "flag-session" {
		t.Fatalf("flag session = %q, want flag-session", got)
	}
	if got := resolvedBrowserTurnID("flag-session"); got != "flag-turn" {
		t.Fatalf("flag turn = %q, want flag-turn", got)
	}
}

func TestResolvedBrowserSessionUsesStableFallback(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	clearBrowserSessionEnv(t)
	t.Setenv("TERM_SESSION_ID", "unstable-terminal")
	t.Setenv("TMUX_PANE", "%1")

	first := resolvedBrowserSessionID()
	second := resolvedBrowserSessionID()
	if first == "" {
		t.Fatal("resolvedBrowserSessionID() returned empty fallback")
	}
	if !strings.HasPrefix(first, "cli:file:") {
		t.Fatalf("resolvedBrowserSessionID() fallback = %q, want stable cli:file id", first)
	}
	if second != first {
		t.Fatalf("resolvedBrowserSessionID() fallback changed: %q then %q", first, second)
	}
	if got := resolvedBrowserTurnID(first); got != first {
		t.Fatalf("resolvedBrowserTurnID() = %q, want fallback session %q", got, first)
	}
}

func TestResolvedBrowserSessionUsesSessionFile(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	clearBrowserSessionEnv(t)

	sessionFile := filepath.Join(tmp, "session-id")
	t.Setenv("SUPERDUCK_SESSION_FILE", sessionFile)

	first := resolvedBrowserSessionID()
	second := resolvedBrowserSessionID()
	if first == "" || !strings.HasPrefix(first, "cli:file:") {
		t.Fatalf("resolvedBrowserSessionID() = %q, want generated cli:file id", first)
	}
	if second != first {
		t.Fatalf("session file fallback changed: %q then %q", first, second)
	}
	data, err := os.ReadFile(sessionFile)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", sessionFile, err)
	}
	if got := strings.TrimSpace(string(data)); got != first {
		t.Fatalf("session file = %q, want %q", got, first)
	}
}

func clearBrowserSessionEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"SUPERDUCK_SESSION_ID",
		"SUPERDUCK_TURN_ID",
		"SUPERDUCK_SESSION_FILE",
		"TERM_SESSION_ID",
		"TMUX_PANE",
		"WEZTERM_PANE",
		"KITTY_WINDOW_ID",
		"VSCODE_IPC_HOOK_CLI",
	} {
		t.Setenv(key, "")
	}
}

func TestClassify(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name     string
		err      error
		wantCode int
		wantKind string
	}{
		{"nil", nil, 0, ""},
		{"not_connected", cliclient.ErrNotConnected, ExitNotConnected, "not_connected"},
		{"timeout", cliclient.ErrTimeout, ExitTimeout, "timeout"},
		{"tool_error", &cliclient.ToolError{Msg: "bad"}, ExitToolError, "tool_error"},
		{"no_args", errNoArgs, ExitUsage, "usage_error"},
		{"generic", errors.New("nope"), ExitUsage, "usage_error"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			code, kind := classify(tc.err)
			if code != tc.wantCode || kind != tc.wantKind {
				t.Errorf("classify(%v) = (%d, %q), want (%d, %q)", tc.err, code, kind, tc.wantCode, tc.wantKind)
			}
		})
	}
}
