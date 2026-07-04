package cliclient

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

func TestCallSendsSessionInEnvelope(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{{"type": "text", "text": "ok"}},
		},
	})

	result, err := Call("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
		SessionID:  " session-a \n",
	})
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if got := contentToString(result); got != "ok" {
		t.Fatalf("Call() result = %q, want ok", got)
	}

	req := <-reqCh
	wait()
	params, ok := req["params"].(map[string]any)
	if !ok {
		t.Fatalf("params has type %T, want map[string]any", req["params"])
	}
	args, ok := params["args"].(map[string]any)
	if !ok {
		t.Fatalf("args has type %T, want map[string]any", params["args"])
	}
	if got, want := params["session_id"], "session-a"; got != want {
		t.Fatalf("params.session_id = %v, want %q", got, want)
	}
	if _, ok := args["session_id"]; ok {
		t.Fatal("session_id should not be injected into tool args")
	}
	if _, ok := args["turn_id"]; ok {
		t.Fatal("turn_id should not be injected into tool args")
	}
}

func TestCallOmitsSessionMetadataWhenSessionMissing(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{{"type": "text", "text": "ok"}},
		},
	})

	result, err := Call("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	})
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if got := contentToString(result); got != "ok" {
		t.Fatalf("Call() result = %q, want ok", got)
	}

	req := <-reqCh
	wait()
	params, ok := req["params"].(map[string]any)
	if !ok {
		t.Fatalf("params has type %T, want map[string]any", req["params"])
	}
	if _, ok := params["session_id"]; ok {
		t.Fatalf("params unexpectedly contains session_id: %v", params)
	}
	if _, ok := params["turn_id"]; ok {
		t.Fatalf("params unexpectedly contains turn_id: %v", params)
	}
}

func TestCallReturnsStructuredPayloadWhenContentIsEmpty(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": "",
			"structuredContent": map[string]any{
				"tabContext": map[string]any{"currentTabId": 42},
			},
		},
	})

	result, err := Call("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	})
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	<-reqCh
	wait()

	structured, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("Call() result has type %T, want structured map", result)
	}
	tabContext, ok := structured["tabContext"].(map[string]any)
	if !ok {
		t.Fatalf("structured tabContext has type %T, want map", structured["tabContext"])
	}
	if got, want := tabContext["currentTabId"], float64(42); got != want {
		t.Fatalf("tabContext.currentTabId = %v, want %v", got, want)
	}
}

// TestRunToolJSONPromotesStructuredTabContext verifies that structuredContent
// (tabContext) from the extension is promoted to the JSON envelope top level so
// callers can `jq '.tabContext.currentTabId'` instead of parsing text output.
func TestRunToolJSONPromotesStructuredTabContext(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "Tab Group 7:\n- tabId 42: \"Example\" (https://example.com/)"},
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

	raw, err := RunToolJSON("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	}, &AuditRecord{Cmd: "tab_group list"})
	if err := nilErrFromServer(reqCh, wait, err); err != nil {
		t.Fatalf("RunToolJSON() error = %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got, want := envelope["ok"], true; got != want {
		t.Fatalf("envelope.ok = %v, want %v", got, want)
	}
	output, _ := envelope["output"].(string)
	if !strings.Contains(output, "tabId 42") {
		t.Fatalf("envelope.output = %q, want it to contain the human-readable tab list", output)
	}
	tc, ok := envelope["tabContext"].(map[string]any)
	if !ok {
		t.Fatalf("envelope.tabContext has type %T, want map", envelope["tabContext"])
	}
	if got, want := tc["currentTabId"], float64(42); got != want {
		t.Fatalf("tabContext.currentTabId = %v, want %v", got, want)
	}
	if got, want := tc["tabGroupId"], float64(7); got != want {
		t.Fatalf("tabContext.tabGroupId = %v, want %v", got, want)
	}
}

func TestRunToolJSONDoesNotLetStructuredContentOverwriteEnvelopeFields(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{{"type": "text", "text": "human output"}},
			"structuredContent": map[string]any{
				"tool":    "malicious_tool_name",
				"ok":      false,
				"error":   "structured error should not appear on a successful envelope",
				"output":  "structured output should not replace content output",
				"content": "structured content should be hidden",
				"tabContext": map[string]any{
					"currentTabId": 42,
				},
			},
		},
	})

	raw, err := RunToolJSON("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	}, &AuditRecord{Cmd: "tab_group list"})
	if err := nilErrFromServer(reqCh, wait, err); err != nil {
		t.Fatalf("RunToolJSON() error = %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got, want := envelope["tool"], "tabs_context_mcp"; got != want {
		t.Fatalf("envelope.tool = %v, want %q", got, want)
	}
	if got, want := envelope["ok"], true; got != want {
		t.Fatalf("envelope.ok = %v, want %v", got, want)
	}
	if got, want := envelope["output"], "human output"; got != want {
		t.Fatalf("envelope.output = %v, want %q", got, want)
	}
	if _, ok := envelope["content"]; ok {
		t.Fatalf("envelope unexpectedly contains structured content field: %v", envelope)
	}
	if _, ok := envelope["error"]; ok {
		t.Fatalf("envelope unexpectedly contains structured error field on success: %v", envelope)
	}
	if _, ok := envelope["tabContext"].(map[string]any); !ok {
		t.Fatalf("envelope.tabContext has type %T, want map", envelope["tabContext"])
	}
}

// TestRunToolJSONStripsTabContextFromOutput verifies that the synthetic
// "Tab Context" text block appended by converter.ToMCPContent (for
// human-readable-only clients) is stripped from envelope.output in JSON mode.
// That context is already promoted to the structured `tabContext` field, so
// duplicating it in `output` breaks `superduck --json ... | jq -r '.output'`.
func TestRunToolJSONStripsTabContextFromOutput(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "Created new tab. Tab ID: 42"},
				{"type": "text", "text": "\n\nTab Context:\n- Executed on tabId: 42\n- Available tabs:\n  • tabId 42: \"Example\" (https://example.com/)"},
			},
			"structuredContent": map[string]any{
				"tabContext": map[string]any{
					"currentTabId":  42,
					"availableTabs": []map[string]any{{"id": 42, "title": "Example", "url": "https://example.com/"}},
				},
			},
		},
	})

	raw, err := RunToolJSON("tabs_create_mcp", map[string]any{}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	}, &AuditRecord{Cmd: "tab_group new"})
	if err := nilErrFromServer(reqCh, wait, err); err != nil {
		t.Fatalf("RunToolJSON() error = %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	output, _ := envelope["output"].(string)
	if strings.Contains(output, "Tab Context") {
		t.Fatalf("envelope.output still contains Tab Context noise: %q\nwant pure business text", output)
	}
	if got, want := output, "Created new tab. Tab ID: 42"; got != want {
		t.Fatalf("envelope.output = %q, want %q", got, want)
	}
	if _, ok := envelope["tabContext"].(map[string]any); !ok {
		t.Fatalf("envelope.tabContext missing; structured field must be preserved when stripping text copy")
	}
}

// TestRunToolJSONKeepsOutputWhenNoTabContextBlock is a regression guard: a
// plain single text block with no Tab Context must pass through unchanged.
func TestRunToolJSONKeepsOutputWhenNoTabContextBlock(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "7"},
			},
		},
	})

	raw, err := RunToolJSON("javascript_tool", map[string]any{"code": "1+2*3"}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	}, &AuditRecord{Cmd: "exec"})
	if err := nilErrFromServer(reqCh, wait, err); err != nil {
		t.Fatalf("RunToolJSON() error = %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got, want := envelope["output"], "7"; got != want {
		t.Fatalf("envelope.output = %v, want %q (plain output must be untouched)", got, want)
	}
}

func TestRunToolJSONKeepsRealOutputThatStartsWithTabContext(t *testing.T) {
	socketPath, reqCh, wait := startOneShotToolServer(t, map[string]any{
		"type": "tool_response",
		"result": map[string]any{
			"content": []map[string]any{
				{"type": "text", "text": "Tab Context:\nThis is page content, not a synthetic tab summary."},
			},
		},
	})

	raw, err := RunToolJSON("read_page", map[string]any{}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	}, &AuditRecord{Cmd: "read_page"})
	if err := nilErrFromServer(reqCh, wait, err); err != nil {
		t.Fatalf("RunToolJSON() error = %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got, want := envelope["output"], "Tab Context:\nThis is page content, not a synthetic tab summary."; got != want {
		t.Fatalf("envelope.output = %v, want %q", got, want)
	}
}

func nilErrFromServer(reqCh <-chan map[string]any, wait func(), callErr error) error {
	if callErr != nil {
		return callErr
	}
	<-reqCh
	wait()
	return nil
}

func startOneShotToolServer(
	t *testing.T,
	response map[string]any,
) (socketPath string, reqCh <-chan map[string]any, wait func()) {
	t.Helper()
	tmp, err := os.MkdirTemp("/tmp", "sd-cliclient-")
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
		t.Fatalf("Listen() error = %v", err)
	}
	t.Cleanup(func() {
		_ = ln.Close()
		_ = os.Remove(socketPath)
	})

	requests := make(chan map[string]any, 1)
	errCh := make(chan error, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			errCh <- err
			return
		}
		defer conn.Close()

		authRaw, err := protocol.ReadMessage(conn)
		if err != nil {
			errCh <- err
			return
		}
		var auth struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		if err := json.Unmarshal(authRaw, &auth); err != nil {
			errCh <- err
			return
		}
		if auth.Type != "auth" || auth.Token != "test-token" {
			errCh <- &testClientServerError{msg: "unexpected auth request"}
			return
		}
		if err := protocol.SendMessage(conn, map[string]any{"type": "auth_response", "ok": "true"}); err != nil {
			errCh <- err
			return
		}

		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			errCh <- err
			return
		}
		var req map[string]any
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
			t.Fatalf("server error = %v", err)
		}
	}
}

type testClientServerError struct {
	msg string
}

func (e *testClientServerError) Error() string {
	return e.msg
}
