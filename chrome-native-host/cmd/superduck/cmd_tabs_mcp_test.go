package main

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

func TestCmdTabGroupListSendsCreateNameSessionAndPrintsStructuredJSON(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "Tab Group 7:\n- tabId 42: \"Example\""},
			},
			"structuredContent": map[string]any{
				"tabContext": map[string]any{
					"currentTabId":  42,
					"tabGroupId":    7,
					"tabCount":      1,
					"availableTabs": []map[string]any{{"id": 42, "title": "Example", "url": "https://example.com/"}},
				},
			},
		},
	})
	withCLIFlags(t, globalFlags{
		JSON:       true,
		SocketPath: socketPath,
		Timeout:    time.Second,
		SessionID:  "session-a",
	})

	out := captureStdout(t, func() {
		if err := cmdTabGroupList([]string{"--create-if-empty", "--name", "Research task"}); err != nil {
			t.Fatalf("cmdTabGroupList() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "tabs_context_mcp"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	if got, want := req.Params.ClientID, "superduck-cli"; got != want {
		t.Fatalf("client_id = %q, want %q", got, want)
	}
	if got, want := req.Params.SessionID, "session-a"; got != want {
		t.Fatalf("session_id = %q, want %q", got, want)
	}
	if got, want := req.Params.Args["createIfEmpty"], true; got != want {
		t.Fatalf("args.createIfEmpty = %v, want %v", got, want)
	}
	if got, want := req.Params.Args["name"], "Research task"; got != want {
		t.Fatalf("args.name = %v, want %q", got, want)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(out), &envelope); err != nil {
		t.Fatalf("stdout JSON = %q, unmarshal error = %v", out, err)
	}
	tabContext, ok := envelope["tabContext"].(map[string]any)
	if !ok {
		t.Fatalf("stdout tabContext has type %T, want map", envelope["tabContext"])
	}
	if got, want := tabContext["currentTabId"], float64(42); got != want {
		t.Fatalf("stdout tabContext.currentTabId = %v, want %v", got, want)
	}
}

func TestCmdTabGroupNewForceSendsForceAndPrintsText(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{{"type": "text", "text": "Created new tab. Tab ID: 99"}},
		},
	})
	withCLIFlags(t, globalFlags{
		SocketPath: socketPath,
		Timeout:    time.Second,
		SessionID:  "session-a",
	})

	out := captureStdout(t, func() {
		if err := cmdTabGroupNew([]string{"--force"}); err != nil {
			t.Fatalf("cmdTabGroupNew() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "tabs_create_mcp"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	if got, want := req.Params.Args["force"], true; got != want {
		t.Fatalf("args.force = %v, want %v", got, want)
	}
	if !strings.Contains(out, "Created new tab. Tab ID: 99") {
		t.Fatalf("stdout = %q, want created-tab text", out)
	}
}

func TestCmdTabGroupFinalizeBuildsKeepList(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{{"type": "text", "text": "Finalized MCP tab group."}},
		},
	})
	withCLIFlags(t, globalFlags{
		SocketPath: socketPath,
		Timeout:    time.Second,
		SessionID:  "session-a",
	})

	if err := cmdTabGroupFinalize([]string{
		"--handoff", "12",
		"--deliverable", "34",
		"--handoff", "56",
	}); err != nil {
		t.Fatalf("cmdTabGroupFinalize() error = %v", err)
	}

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "tabs_finalize_mcp"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	keep, ok := req.Params.Args["keep"].([]any)
	if !ok {
		t.Fatalf("args.keep has type %T, want []any", req.Params.Args["keep"])
	}
	want := []struct {
		tabID  int
		status string
	}{
		{12, "handoff"},
		{56, "handoff"},
		{34, "deliverable"},
	}
	if len(keep) != len(want) {
		t.Fatalf("keep length = %d, want %d (%v)", len(keep), len(want), keep)
	}
	for i, expected := range want {
		item, ok := keep[i].(map[string]any)
		if !ok {
			t.Fatalf("keep[%d] has type %T, want map[string]any", i, keep[i])
		}
		if got := intFromJSONNumber(t, item["tabId"]); got != expected.tabID {
			t.Fatalf("keep[%d].tabId = %d, want %d", i, got, expected.tabID)
		}
		if got := item["status"]; got != expected.status {
			t.Fatalf("keep[%d].status = %v, want %q", i, got, expected.status)
		}
	}
}

func TestCmdTabGroupFinalizeRejectsInvalidTabIDs(t *testing.T) {
	for _, argv := range [][]string{
		{"--handoff", "0"},
		{"--deliverable", "-1"},
		{"--handoff", "abc"},
	} {
		if err := cmdTabGroupFinalize(argv); err == nil {
			t.Fatalf("cmdTabGroupFinalize(%v) error = nil, want invalid tab id error", argv)
		}
	}
}

func TestCmdSessionNameSendsTrimmedName(t *testing.T) {
	socketPath, reqCh, wait := startFakeCLIToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{{"type": "text", "text": "Session group titled \"🦆 Deep research\"."}},
		},
	})
	withCLIFlags(t, globalFlags{
		SocketPath: socketPath,
		Timeout:    time.Second,
		SessionID:  "session-a",
	})

	out := captureStdout(t, func() {
		if err := cmdSessionName([]string{"  Deep", "research  "}); err != nil {
			t.Fatalf("cmdSessionName() error = %v", err)
		}
	})

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "tabs_name_session_mcp"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	if got, want := req.Params.Args["name"], "Deep research"; got != want {
		t.Fatalf("args.name = %v, want %q", got, want)
	}
	if !strings.Contains(out, "Session group titled") {
		t.Fatalf("stdout = %q, want session title text", out)
	}
}

func withCLIFlags(t *testing.T, flags globalFlags) {
	t.Helper()
	original := gflags
	originalSharedWarning := sharedSessionWarned
	t.Cleanup(func() {
		gflags = original
		sharedSessionWarned = originalSharedWarning
	})
	gflags = flags
	sharedSessionWarned = false
}

func startFakeCLIToolServer(
	t *testing.T,
	response map[string]any,
) (socketPath string, reqCh <-chan protocol.ToolRequest, wait func()) {
	t.Helper()
	tmp, err := os.MkdirTemp("/tmp", "sd-cli-")
	if err != nil {
		t.Fatalf("MkdirTemp() error = %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(tmp) })
	t.Setenv("HOME", tmp)
	if err := udsauth.WriteToken("test-token"); err != nil {
		t.Fatalf("WriteToken() error = %v", err)
	}

	socketPath = filepath.Join(tmp, "sd.sock")
	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Listen(%q) error = %v", socketPath, err)
	}
	t.Cleanup(func() {
		_ = ln.Close()
		_ = os.Remove(socketPath)
	})

	requests := make(chan protocol.ToolRequest, 1)
	errCh := make(chan error, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			errCh <- err
			return
		}
		defer conn.Close()

		var auth struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			errCh <- err
			return
		}
		if err := json.Unmarshal(raw, &auth); err != nil {
			errCh <- err
			return
		}
		if auth.Type != "auth" || auth.Token != "test-token" {
			errCh <- &testServerError{msg: "unexpected auth request"}
			return
		}
		if err := protocol.SendMessage(conn, map[string]any{"type": "auth_response", "ok": "true"}); err != nil {
			errCh <- err
			return
		}

		raw, err = protocol.ReadMessage(conn)
		if err != nil {
			errCh <- err
			return
		}
		var req protocol.ToolRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			errCh <- err
			return
		}
		requests <- req
		errCh <- protocol.SendMessage(conn, response)
	}()

	return socketPath, requests, func() {
		t.Helper()
		if err := <-errCh; err != nil {
			t.Fatalf("fake tool server error = %v", err)
		}
	}
}

type testServerError struct {
	msg string
}

func (e *testServerError) Error() string {
	return e.msg
}

func intFromJSONNumber(t *testing.T, value any) int {
	t.Helper()
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		t.Fatalf("number has type %T, want float64 or int", value)
		return 0
	}
}
