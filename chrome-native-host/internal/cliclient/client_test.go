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

func TestCallSendsSessionAndTurnInEnvelope(t *testing.T) {
	tmp, err := os.MkdirTemp("/tmp", "sd-cliclient-")
	if err != nil {
		t.Fatalf("MkdirTemp() error = %v", err)
	}
	defer os.RemoveAll(tmp)
	t.Setenv("HOME", tmp)
	if err := udsauth.WriteToken("test-token"); err != nil {
		t.Fatalf("WriteToken() error = %v", err)
	}

	socketPath := filepath.Join(tmp, "sd.sock")
	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer ln.Close()
	defer os.Remove(socketPath)

	requestCh := make(chan map[string]any, 1)
	errCh := make(chan error, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			errCh <- err
			return
		}
		defer conn.Close()

		if _, err := protocol.ReadMessage(conn); err != nil {
			errCh <- err
			return
		}
		if err := protocol.SendMessage(conn, map[string]any{
			"type": "auth_response",
			"ok":   "true",
		}); err != nil {
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
		requestCh <- req

		errCh <- protocol.SendMessage(conn, map[string]any{
			"type": "tool_response",
			"result": map[string]any{
				"content": []map[string]any{{"type": "text", "text": "ok"}},
			},
		})
	}()

	result, err := Call("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
		SessionID:  "session-a",
		TurnID:     "turn-1",
	})
	if err != nil {
		t.Fatalf("Call() error = %v", err)
	}
	if got := contentToString(result); got != "ok" {
		t.Fatalf("Call() result = %q, want ok", got)
	}

	req := <-requestCh
	if err := <-errCh; err != nil {
		t.Fatalf("server error = %v", err)
	}
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
	if got, want := params["turn_id"], "turn-1"; got != want {
		t.Fatalf("params.turn_id = %v, want %q", got, want)
	}
	if _, ok := args["session_id"]; ok {
		t.Fatal("session_id should not be injected into tool args")
	}
	if _, ok := args["turn_id"]; ok {
		t.Fatal("turn_id should not be injected into tool args")
	}
}

// TestRunToolJSONPromotesStructuredTabContext verifies that structuredContent
// (tabContext) from the extension is promoted to the JSON envelope top level so
// callers can `jq '.tabContext.currentTabId'` instead of parsing text output.
func TestRunToolJSONPromotesStructuredTabContext(t *testing.T) {
	tmp, err := os.MkdirTemp("/tmp", "sd-cliclient-")
	if err != nil {
		t.Fatalf("MkdirTemp() error = %v", err)
	}
	defer os.RemoveAll(tmp)
	t.Setenv("HOME", tmp)
	if err := udsauth.WriteToken("test-token"); err != nil {
		t.Fatalf("WriteToken() error = %v", err)
	}

	socketPath := filepath.Join(tmp, "sd.sock")
	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("Listen() error = %v", err)
	}
	defer ln.Close()
	defer os.Remove(socketPath)

	errCh := make(chan error, 1)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			errCh <- err
			return
		}
		defer conn.Close()

		if _, err := protocol.ReadMessage(conn); err != nil {
			errCh <- err
			return
		}
		if err := protocol.SendMessage(conn, map[string]any{
			"type": "auth_response",
			"ok":   "true",
		}); err != nil {
			errCh <- err
			return
		}
		if _, err := protocol.ReadMessage(conn); err != nil {
			errCh <- err
			return
		}
		errCh <- protocol.SendMessage(conn, map[string]any{
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
	}()

	raw, err := RunToolJSON("tabs_context_mcp", map[string]any{"createIfEmpty": true}, Options{
		SocketPath: socketPath,
		Timeout:    time.Second,
	}, &AuditRecord{Cmd: "tab_group list"})
	if err := nilErr(errCh, err); err != nil {
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

func nilErr(errCh <-chan error, callErr error) error {
	if callErr != nil {
		return callErr
	}
	return <-errCh
}
