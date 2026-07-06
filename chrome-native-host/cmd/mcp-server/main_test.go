package main

import (
	"context"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chrome-native-host/internal/bridge"
	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

func TestCreateToolHandlerForwardsEnvSession(t *testing.T) {
	socketPath, reqCh, wait := startFakeMCPBridgeServer(t, protocol.ToolResponseMsg{
		Type: "tool_response",
		Result: &protocol.ContentWrap{
			Content: []map[string]any{{"type": "text", "text": "ok"}},
		},
	})
	t.Setenv("SUPERDUCK_SESSION_ID", "env-session")

	nativeHost, err := bridge.NewWithOptions(bridge.Options{UDSPath: socketPath, LazyConnect: true})
	if err != nil {
		t.Fatalf("NewWithOptions() error = %v", err)
	}
	defer nativeHost.Close()

	handler := createToolHandler(nativeHost, "tabs_context_mcp")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, _, err := handler(ctx, nil, map[string]interface{}{"createIfEmpty": true})
	if err != nil {
		t.Fatalf("handler() error = %v", err)
	}
	if result == nil || len(result.Content) == 0 {
		t.Fatalf("handler result = %+v, want non-empty content", result)
	}

	req := <-reqCh
	wait()
	if got, want := req.Params.Tool, "tabs_context_mcp"; got != want {
		t.Fatalf("tool = %q, want %q", got, want)
	}
	if got, want := req.Params.ClientID, "superduck-mcp-server"; got != want {
		t.Fatalf("client_id = %q, want %q", got, want)
	}
	if got, want := req.Params.SessionID, "env-session"; got != want {
		t.Fatalf("session_id = %q, want %q", got, want)
	}
	if got, want := req.Params.Args["createIfEmpty"], true; got != want {
		t.Fatalf("args.createIfEmpty = %v, want %v", got, want)
	}
	if _, ok := req.Params.Args["session_id"]; ok {
		t.Fatalf("session_id leaked into args: %v", req.Params.Args)
	}
	if _, ok := req.Params.Args["turn_id"]; ok {
		t.Fatalf("turn_id leaked into args: %v", req.Params.Args)
	}
}

func TestBrowserSessionFallbacks(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("SUPERDUCK_SESSION_ID", "")

	if got := browserSessionID(nil); !strings.HasPrefix(got, "mcp:install:sdid-") {
		t.Fatalf("browserSessionID(nil) = %q, want stable install-scoped session", got)
	}

	t.Setenv("SUPERDUCK_SESSION_ID", "env-session")
	if got, want := browserSessionID(nil), "env-session"; got != want {
		t.Fatalf("browserSessionID(env) = %q, want %q", got, want)
	}
}

func startFakeMCPBridgeServer(
	t *testing.T,
	response protocol.ToolResponseMsg,
) (socketPath string, reqCh <-chan protocol.ToolRequest, wait func()) {
	t.Helper()
	tmp, err := os.MkdirTemp("/tmp", "sd-mcp-")
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

		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			errCh <- err
			return
		}
		var auth struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		if err := json.Unmarshal(raw, &auth); err != nil {
			errCh <- err
			return
		}
		if auth.Type != "auth" || auth.Token != "test-token" {
			errCh <- testMCPServerError("unexpected auth request")
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
			t.Fatalf("fake MCP bridge server error = %v", err)
		}
	}
}

type testMCPServerError string

func (e testMCPServerError) Error() string {
	return string(e)
}
