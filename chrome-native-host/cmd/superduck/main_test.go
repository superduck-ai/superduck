package main

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chrome-native-host/internal/cliclient"
)

// resolvedBrowserSessionID is a test convenience that drops the `explicit`
// bool from resolvedBrowserSession — tests only need the resolved id.
func resolvedBrowserSessionID() string {
	id, _ := resolvedBrowserSession()
	return id
}

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

func TestSplitGlobalFlagsSession(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}

	args := splitGlobalFlags([]string{
		"--session", "session-a",
		"tab_group",
		"list",
	})

	if got, want := args, []string{"tab_group", "list"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("splitGlobalFlags args = %v, want %v", got, want)
	}
	if gflags.SessionID != "session-a" {
		t.Fatalf("session = %q, want session-a", gflags.SessionID)
	}
}

func TestSplitGlobalFlagsAllGlobalsRegardlessOfPosition(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})

	args := splitGlobalFlags([]string{
		"tab_group",
		"--json",
		"--tab", "42",
		"list",
		"--socket", "/tmp/sd.sock",
		"--timeout", "7",
		"--session-id", "session-a",
		"--create-if-empty",
	})

	wantArgs := []string{"tab_group", "list", "--create-if-empty"}
	if got := strings.Join(args, "\x00"); got != strings.Join(wantArgs, "\x00") {
		t.Fatalf("splitGlobalFlags args = %v, want %v", args, wantArgs)
	}
	if !gflags.JSON {
		t.Fatal("gflags.JSON = false, want true")
	}
	if got, want := gflags.Tab, 42; got != want {
		t.Fatalf("gflags.Tab = %d, want %d", got, want)
	}
	if got, want := gflags.SocketPath, "/tmp/sd.sock"; got != want {
		t.Fatalf("gflags.SocketPath = %q, want %q", got, want)
	}
	if got, want := gflags.Timeout, 7*time.Second; got != want {
		t.Fatalf("gflags.Timeout = %s, want %s", got, want)
	}
	if !gflags.TimeoutSet {
		t.Fatal("gflags.TimeoutSet = false, want true")
	}
	if got, want := gflags.SessionID, "session-a"; got != want {
		t.Fatalf("gflags.SessionID = %q, want %q", got, want)
	}
}

func TestSplitGlobalFlagsRepeatedFlagsLastWins(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})

	args := splitGlobalFlags([]string{
		"--session", "old-session",
		"--tab", "1",
		"tabs",
		"--session", "new-session",
		"--tab", "2",
		"--timeout", "3",
		"--timeout", "4",
	})

	if got, want := args, []string{"tabs"}; len(got) != len(want) || got[0] != want[0] {
		t.Fatalf("splitGlobalFlags args = %v, want %v", got, want)
	}
	if got, want := gflags.SessionID, "new-session"; got != want {
		t.Fatalf("gflags.SessionID = %q, want %q", got, want)
	}
	if got, want := gflags.Tab, 2; got != want {
		t.Fatalf("gflags.Tab = %d, want %d", got, want)
	}
	if got, want := gflags.Timeout, 4*time.Second; got != want {
		t.Fatalf("gflags.Timeout = %s, want %s", got, want)
	}
}

func TestSplitGlobalFlagsInvalidUsageExits(t *testing.T) {
	for _, tc := range []struct {
		name       string
		args       []string
		wantOutput string
	}{
		{"invalid tab", []string{"--tab", "abc", "tabs"}, "invalid --tab"},
		{"zero tab", []string{"--tab", "0", "tabs"}, "invalid --tab: must be positive"},
		{"missing tab", []string{"--tab"}, "missing value for --tab"},
		{"invalid timeout", []string{"--timeout", "abc", "tabs"}, "invalid --timeout"},
		{"zero timeout", []string{"--timeout", "0", "tabs"}, "invalid --timeout: must be positive"},
		{"missing session", []string{"--session"}, "missing value for --session"},
		{"missing session before flag", []string{"--session", "--json", "tabs"}, "missing value for --session"},
		{"empty session", []string{"--session", "", "tabs"}, "missing value for --session"},
		{"missing socket", []string{"--socket"}, "missing value for --socket"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cmd := exec.Command(os.Args[0], append([]string{
				"-test.run=TestSplitGlobalFlagsHelperProcess",
				"--",
			}, tc.args...)...)
			cmd.Env = append(os.Environ(), "GO_WANT_SPLIT_GLOBAL_FLAGS_HELPER=1")
			out, err := cmd.CombinedOutput()
			if err == nil {
				t.Fatalf("helper exited nil, want usage error; output=%s", out)
			}
			exitErr, ok := err.(*exec.ExitError)
			if !ok {
				t.Fatalf("helper error type = %T, want *exec.ExitError", err)
			}
			if got, want := exitErr.ExitCode(), ExitUsage; got != want {
				t.Fatalf("exit code = %d, want %d; output=%s", got, want, out)
			}
			if !strings.Contains(string(out), tc.wantOutput) {
				t.Fatalf("output = %q, want it to contain %q", out, tc.wantOutput)
			}
		})
	}
}

func TestSplitGlobalFlagsHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_SPLIT_GLOBAL_FLAGS_HELPER") != "1" {
		return
	}
	args := os.Args
	for i, arg := range args {
		if arg == "--" {
			gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}
			splitGlobalFlags(args[i+1:])
			os.Exit(0)
		}
	}
	os.Exit(2)
}

func TestResolvedBrowserSession(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second}

	t.Setenv("SUPERDUCK_SESSION_ID", "env-session")
	if got := resolvedBrowserSessionID(); got != "env-session" {
		t.Fatalf("resolvedBrowserSessionID() = %q, want env-session", got)
	}

	gflags.SessionID = "flag-session"
	if got := resolvedBrowserSessionID(); got != "flag-session" {
		t.Fatalf("flag session = %q, want flag-session", got)
	}
}

func TestResolvedBrowserSessionPrecedenceAndExplicit(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	clearBrowserSessionEnv(t)

	sessionFile := filepath.Join(tmp, "session-id")
	if err := os.WriteFile(sessionFile, []byte(" file-session \n"), 0o600); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", sessionFile, err)
	}
	t.Setenv("SUPERDUCK_SESSION_FILE", sessionFile)
	t.Setenv("SUPERDUCK_SESSION_ID", "env-session")
	gflags.SessionID = "flag-session"

	id, explicit := resolvedBrowserSession()
	if id != "flag-session" || !explicit {
		t.Fatalf("flag precedence resolved (%q, %t), want (flag-session, true)", id, explicit)
	}

	gflags.SessionID = ""
	id, explicit = resolvedBrowserSession()
	if id != "env-session" || !explicit {
		t.Fatalf("env precedence resolved (%q, %t), want (env-session, true)", id, explicit)
	}

	t.Setenv("SUPERDUCK_SESSION_ID", "")
	id, explicit = resolvedBrowserSession()
	if id != "file-session" || !explicit {
		t.Fatalf("file precedence resolved (%q, %t), want (file-session, true)", id, explicit)
	}
}

func TestResolvedBrowserSessionFallback(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	clearBrowserSessionEnv(t)

	first, explicit := resolvedBrowserSession()
	if first == "" || !strings.HasPrefix(first, "cli:file:") {
		t.Fatalf("resolvedBrowserSession() fallback = %q, want cli:file id", first)
	}
	if explicit {
		t.Fatalf("resolvedBrowserSession() explicit = %v, want false for default fallback", explicit)
	}
	// The fallback is persisted, so a second resolution is stable.
	if second := resolvedBrowserSessionID(); second != first {
		t.Fatalf("fallback changed: %q then %q", first, second)
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

func TestResolvedBrowserSessionWarnsWhenSessionFileIsUnusable(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	clearBrowserSessionEnv(t)

	blocker := filepath.Join(tmp, "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", blocker, err)
	}
	sessionFile := filepath.Join(blocker, "session-id")
	t.Setenv("SUPERDUCK_SESSION_FILE", sessionFile)

	var id string
	var explicit bool
	stderr := captureStderr(t, func() {
		id, explicit = resolvedBrowserSession()
	})

	if id == "" || !strings.HasPrefix(id, "cli:file:") {
		t.Fatalf("resolvedBrowserSession() id = %q, want fallback cli:file id", id)
	}
	if explicit {
		t.Fatal("resolvedBrowserSession() explicit = true, want false for fallback")
	}
	if !strings.Contains(stderr, "SUPERDUCK_SESSION_FILE") || !strings.Contains(stderr, sessionFile) {
		t.Fatalf("stderr = %q, want SUPERDUCK_SESSION_FILE warning for %q", stderr, sessionFile)
	}
}

func TestReadOrCreateSessionIDFileExistingAndEmptyFile(t *testing.T) {
	tmp := t.TempDir()
	existingPath := filepath.Join(tmp, "existing-session")
	if err := os.WriteFile(existingPath, []byte(" existing-id \n"), 0o600); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", existingPath, err)
	}
	id, err := readOrCreateSessionIDFile(existingPath)
	if err != nil {
		t.Fatalf("readOrCreateSessionIDFile(existing) error = %v", err)
	}
	if id != "existing-id" {
		t.Fatalf("existing session id = %q, want existing-id", id)
	}

	emptyPath := filepath.Join(tmp, "empty-session")
	if err := os.WriteFile(emptyPath, []byte(" \n\t"), 0o600); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", emptyPath, err)
	}
	id, err = readOrCreateSessionIDFile(emptyPath)
	if err != nil {
		t.Fatalf("readOrCreateSessionIDFile(empty) error = %v", err)
	}
	if !strings.HasPrefix(id, "cli:file:") {
		t.Fatalf("empty-file generated id = %q, want cli:file prefix", id)
	}
	data, err := os.ReadFile(emptyPath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", emptyPath, err)
	}
	if got := strings.TrimSpace(string(data)); got != id {
		t.Fatalf("empty session file contents = %q, want %q", got, id)
	}
}

func TestReadOrCreateSessionIDFileConcurrentCreateReturnsOneID(t *testing.T) {
	tmp := t.TempDir()
	sessionPath := filepath.Join(tmp, "nested", "session-id")

	const workers = 20
	ids := make(chan string, workers)
	errs := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, err := readOrCreateSessionIDFile(sessionPath)
			if err != nil {
				errs <- err
				return
			}
			ids <- id
		}()
	}
	wg.Wait()
	close(ids)
	close(errs)

	for err := range errs {
		t.Fatalf("readOrCreateSessionIDFile() concurrent error = %v", err)
	}
	var first string
	for id := range ids {
		if first == "" {
			first = id
			continue
		}
		if id != first {
			t.Fatalf("concurrent session ids differ: %q vs %q", first, id)
		}
	}
	data, err := os.ReadFile(sessionPath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", sessionPath, err)
	}
	if got := strings.TrimSpace(string(data)); got != first {
		t.Fatalf("session file = %q, want %q", got, first)
	}
}

func TestReadSessionIDFileCreatedByPeerRecoversStaleEmptyFile(t *testing.T) {
	tmp := t.TempDir()
	sessionPath := filepath.Join(tmp, "session-id")
	if err := os.WriteFile(sessionPath, nil, 0o600); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", sessionPath, err)
	}

	id, err := readSessionIDFileCreatedByPeer(sessionPath)
	if err != nil {
		t.Fatalf("readSessionIDFileCreatedByPeer() error = %v", err)
	}
	if !strings.HasPrefix(id, "cli:file:") {
		t.Fatalf("recovered id = %q, want cli:file prefix", id)
	}
	data, err := os.ReadFile(sessionPath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", sessionPath, err)
	}
	if got := strings.TrimSpace(string(data)); got != id {
		t.Fatalf("session file = %q, want %q", got, id)
	}
}

func TestReadOrCreateSessionIDFilePermissions(t *testing.T) {
	tmp := t.TempDir()
	sessionPath := filepath.Join(tmp, "nested", "session-id")
	if _, err := readOrCreateSessionIDFile(sessionPath); err != nil {
		t.Fatalf("readOrCreateSessionIDFile() error = %v", err)
	}
	dirInfo, err := os.Stat(filepath.Dir(sessionPath))
	if err != nil {
		t.Fatalf("Stat(session dir) error = %v", err)
	}
	if got, want := dirInfo.Mode().Perm(), os.FileMode(0o700); got != want {
		t.Fatalf("session dir permissions = %o, want %o", got, want)
	}
	fileInfo, err := os.Stat(sessionPath)
	if err != nil {
		t.Fatalf("Stat(session file) error = %v", err)
	}
	if got, want := fileInfo.Mode().Perm(), os.FileMode(0o600); got != want {
		t.Fatalf("session file permissions = %o, want %o", got, want)
	}
}

func TestDefaultCLISessionIDRejectsEmptyHome(t *testing.T) {
	if _, err := defaultCLISessionIDInHome(""); err == nil {
		t.Fatal("defaultCLISessionIDInHome(\"\") error = nil, want error")
	}
}

func TestClientOptsExplicitSessionDoesNotWarn(t *testing.T) {
	withCLIFlags(t, globalFlags{
		SocketPath: "/tmp/custom.sock",
		Timeout:    9 * time.Second,
		SessionID:  "session-a",
	})

	var opts cliclient.Options
	stderr := captureStderr(t, func() {
		opts = clientOpts()
	})

	if strings.Contains(stderr, "shared default session") {
		t.Fatalf("stderr = %q, want no shared-session warning", stderr)
	}
	if got, want := opts.SocketPath, "/tmp/custom.sock"; got != want {
		t.Fatalf("SocketPath = %q, want %q", got, want)
	}
	if got, want := opts.Timeout, 9*time.Second; got != want {
		t.Fatalf("Timeout = %s, want %s", got, want)
	}
	if got, want := opts.SessionID, "session-a"; got != want {
		t.Fatalf("SessionID = %q, want %q", got, want)
	}
}

func TestClientOptsDefaultSessionWarnsOnce(t *testing.T) {
	withCLIFlags(t, globalFlags{SocketPath: cliclient.DefaultSocketPath, Timeout: 30 * time.Second})
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	clearBrowserSessionEnv(t)

	var first cliclient.Options
	var second cliclient.Options
	stderr := captureStderr(t, func() {
		first = clientOpts()
		second = clientOpts()
	})

	if first.SessionID == "" || !strings.HasPrefix(first.SessionID, "cli:file:") {
		t.Fatalf("first SessionID = %q, want cli:file fallback", first.SessionID)
	}
	if second.SessionID != first.SessionID {
		t.Fatalf("second SessionID = %q, want same as first %q", second.SessionID, first.SessionID)
	}
	if got := strings.Count(stderr, "using a shared default session id"); got != 1 {
		t.Fatalf("shared-session warning count = %d, want 1; stderr=%q", got, stderr)
	}
}

func clearBrowserSessionEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"SUPERDUCK_SESSION_ID",
		"SUPERDUCK_SESSION_FILE",
	} {
		t.Setenv(key, "")
	}
}

func captureStream(t *testing.T, stream **os.File, fn func()) string {
	t.Helper()
	orig := *stream
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	*stream = w
	defer func() { *stream = orig }()
	done := make(chan string)
	go func() {
		data, _ := io.ReadAll(r)
		done <- string(data)
	}()
	fn()
	_ = w.Close()
	return <-done
}

func captureStderr(t *testing.T, fn func()) string {
	return captureStream(t, &os.Stderr, fn)
}

func captureStdout(t *testing.T, fn func()) string {
	return captureStream(t, &os.Stdout, fn)
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
