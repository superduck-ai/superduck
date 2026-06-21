package bridge

import (
	"context"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

func TestValidateComputerArgs(t *testing.T) {
	tests := []struct {
		name string
		args map[string]interface{}
	}{
		{"valid duration", map[string]interface{}{"duration": float64(5)}},
		{"zero duration", map[string]interface{}{"duration": float64(0)}},
		{"max duration", map[string]interface{}{"duration": float64(30)}},
		{"no duration", map[string]interface{}{"action": "screenshot"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			validateComputerArgs(tt.args)
		})
	}
}

func TestExecuteTool_ContextTimeout(t *testing.T) {
	// Create a bridge with a mock connection that never responds
	bridge := &NativeHostBridge{}

	// Create a context that's already cancelled (deterministic, no sleep)
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()

	// This should fail quickly because we have no connection and context is done
	_, err := bridge.ExecuteTool(ctx, "test_tool", map[string]interface{}{})
	if err == nil {
		t.Error("expected error from ExecuteTool with no connection")
	}
}

func TestReconnect_BrokenConnection(t *testing.T) {
	// Create a bridge with no connection - should attempt to reconnect
	bridge := &NativeHostBridge{}

	// reconnect should try to establish a new connection and fail
	// because there's no real UDS server
	ctx := context.Background()
	err := bridge.reconnect(ctx)
	if err == nil {
		t.Error("expected reconnect to fail without a real server")
	}

	// bridge.conn should still be nil after failed reconnect
	if bridge.conn != nil {
		t.Error("expected bridge.conn to be nil after failed reconnect")
	}
}

func TestReconnectAuthenticatesBeforeToolRequest(t *testing.T) {
	path, token := prepareBridgeAuthTest(t)
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	sequence := make(chan string, 2)
	serverErr := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			serverErr <- err
			return
		}
		defer conn.Close()

		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			serverErr <- err
			return
		}
		var auth struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		if err := json.Unmarshal(raw, &auth); err != nil {
			serverErr <- err
			return
		}
		sequence <- auth.Type
		if auth.Token != token {
			t.Errorf("auth token = %q, want %q", auth.Token, token)
		}
		if err := protocol.SendMessage(conn, map[string]string{"type": "auth_response", "ok": "true"}); err != nil {
			serverErr <- err
			return
		}

		raw, err = protocol.ReadMessage(conn)
		if err != nil {
			serverErr <- err
			return
		}
		var req protocol.ToolRequest
		if err := json.Unmarshal(raw, &req); err != nil {
			serverErr <- err
			return
		}
		sequence <- req.Type
		err = protocol.SendMessage(conn, protocol.ToolResponseMsg{
			Type:   "tool_response",
			Result: &protocol.ContentWrap{Content: "ok"},
		})
		serverErr <- err
	}()

	bridge := &NativeHostBridge{udsPath: path}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := bridge.ExecuteTool(ctx, "test_tool", map[string]interface{}{})
	if err != nil {
		t.Fatalf("ExecuteTool() error = %v", err)
	}
	if result != "ok" {
		t.Fatalf("ExecuteTool() result = %v, want ok", result)
	}
	if first := <-sequence; first != "auth" {
		t.Fatalf("first UDS message = %q, want auth", first)
	}
	if second := <-sequence; second != "tool_request" {
		t.Fatalf("second UDS message = %q, want tool_request", second)
	}
	if err := <-serverErr; err != nil {
		t.Fatalf("server error = %v", err)
	}
}

func TestCheckHealthConnectsAndMarksHealthy(t *testing.T) {
	path, token := prepareBridgeAuthTest(t)
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	serverErr := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			serverErr <- err
			return
		}
		defer conn.Close()

		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			serverErr <- err
			return
		}
		var auth struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		if err := json.Unmarshal(raw, &auth); err != nil {
			serverErr <- err
			return
		}
		if auth.Type != "auth" || auth.Token != token {
			t.Errorf("auth = (%q, %q), want (auth, %q)", auth.Type, auth.Token, token)
		}
		if err := protocol.SendMessage(conn, map[string]string{"type": "auth_response", "ok": "true"}); err != nil {
			serverErr <- err
			return
		}

		raw, err = protocol.ReadMessage(conn)
		if err != nil {
			serverErr <- err
			return
		}
		var healthReq struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &healthReq); err != nil {
			serverErr <- err
			return
		}
		if healthReq.Type != "health_check" {
			t.Errorf("health request type = %q, want health_check", healthReq.Type)
		}
		serverErr <- protocol.SendMessage(conn, map[string]interface{}{"type": "health_response", "ok": true})
	}()

	bridge, err := NewWithOptions(Options{UDSPath: path, LazyConnect: true})
	if err != nil {
		t.Fatalf("NewWithOptions() error = %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	status := bridge.CheckHealth(ctx)
	if !status.Healthy || !status.Connected || !status.Connectable {
		t.Fatalf("CheckHealth() = %+v, want healthy connected connectable", status)
	}
	if status.State != HealthStateHealthy {
		t.Fatalf("CheckHealth().State = %q, want %q", status.State, HealthStateHealthy)
	}
	if err := <-serverErr; err != nil {
		t.Fatalf("server error = %v", err)
	}
}

func TestIsTimeoutError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "generic error",
			err:      net.ErrClosed,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isTimeoutError(tt.err)
			if result != tt.expected {
				t.Errorf("isTimeoutError() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func prepareBridgeAuthTest(t *testing.T) (string, string) {
	t.Helper()
	tmp, err := os.MkdirTemp("/tmp", "sd-bridge-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(tmp) })
	t.Setenv("HOME", tmp)
	const token = "bridge-test-token"
	if err := udsauth.WriteToken(token); err != nil {
		t.Fatalf("WriteToken() error = %v", err)
	}
	return filepath.Join(tmp, "native-host.sock"), token
}

func TestDefaultTimeout(t *testing.T) {
	if DefaultTimeout != 30*time.Second {
		t.Errorf("DefaultTimeout = %v, expected 30s", DefaultTimeout)
	}
}

func TestDefaultToolResponseTimeoutExceedsNativeHostBackstop(t *testing.T) {
	const nativeHostChromeResponseTimeout = 40 * time.Second

	defaultToolResponseTimeout := DefaultTimeout + toolResponseHeadroom
	if defaultToolResponseTimeout <= nativeHostChromeResponseTimeout {
		t.Fatalf(
			"default tool response timeout = %s, want more than %s to stay above native-host backstop",
			defaultToolResponseTimeout,
			nativeHostChromeResponseTimeout,
		)
	}
}

func TestMaxTimeout(t *testing.T) {
	if MaxTimeout != 5*time.Minute {
		t.Errorf("MaxTimeout = %v, expected 5m", MaxTimeout)
	}
}

func TestComputeRequestDeadlineAddsHeadroomToContextDeadline(t *testing.T) {
	now := time.Now()
	ctx, cancel := context.WithDeadline(context.Background(), now.Add(2*time.Minute))
	defer cancel()

	deadline, timeout, err := computeRequestDeadline(ctx, now)
	if err != nil {
		t.Fatalf("computeRequestDeadline() error = %v", err)
	}
	want := 2*time.Minute + toolResponseHeadroom
	if deadline.Sub(now) != want {
		t.Fatalf("deadline delta = %v, want %v", deadline.Sub(now), want)
	}
	if timeout != want {
		t.Fatalf("timeout = %v, want %v", timeout, want)
	}
}

func TestComputeRequestDeadlineClampsLongContextDeadline(t *testing.T) {
	now := time.Now()
	ctx, cancel := context.WithDeadline(context.Background(), now.Add(10*time.Minute))
	defer cancel()

	deadline, timeout, err := computeRequestDeadline(ctx, now)
	if err != nil {
		t.Fatalf("computeRequestDeadline() error = %v", err)
	}
	if deadline.Sub(now) != MaxTimeout {
		t.Fatalf("deadline delta = %v, want %v", deadline.Sub(now), MaxTimeout)
	}
	if timeout != MaxTimeout {
		t.Fatalf("timeout = %v, want %v", timeout, MaxTimeout)
	}
}

func TestComputeRequestDeadlineUsesDefaultWithoutContextDeadline(t *testing.T) {
	now := time.Now()

	deadline, timeout, err := computeRequestDeadline(context.Background(), now)
	if err != nil {
		t.Fatalf("computeRequestDeadline() error = %v", err)
	}
	want := DefaultTimeout + toolResponseHeadroom
	if deadline.Sub(now) != want {
		t.Fatalf("deadline delta = %v, want %v", deadline.Sub(now), want)
	}
	if timeout != want {
		t.Fatalf("timeout = %v, want %v", timeout, want)
	}
}

func TestComputeRequestDeadlineRejectsExpiredDeadline(t *testing.T) {
	now := time.Now()
	ctx, cancel := context.WithDeadline(context.Background(), now.Add(-time.Second))
	defer cancel()

	if _, _, err := computeRequestDeadline(ctx, now); err == nil {
		t.Fatal("computeRequestDeadline() error = nil, want error")
	}
}

func TestBrowserBatchTimeoutScalesWithActionCount(t *testing.T) {
	t.Parallel()

	timeout := BrowserBatchTimeout(map[string]interface{}{
		"actions": []interface{}{
			map[string]interface{}{"tool": "computer"},
			map[string]interface{}{"tool": "read_page"},
			map[string]interface{}{"tool": "computer"},
		},
	}, DefaultTimeout)

	if want := DefaultTimeout + 3*browserBatchChildActionTimeout; timeout != want {
		t.Fatalf("BrowserBatchTimeout() = %v, want %v", timeout, want)
	}
}

func TestBrowserBatchTimeoutClampsToMaxTimeout(t *testing.T) {
	t.Parallel()

	actions := make([]interface{}, 20)
	timeout := BrowserBatchTimeout(map[string]interface{}{"actions": actions}, DefaultTimeout)

	if timeout != MaxTimeout {
		t.Fatalf("BrowserBatchTimeout() = %v, want %v", timeout, MaxTimeout)
	}
}

func TestBrowserBatchTimeoutFallsBackWithoutActions(t *testing.T) {
	t.Parallel()

	fallback := 42 * time.Second
	timeout := BrowserBatchTimeout(map[string]interface{}{"actions": "invalid"}, fallback)

	if timeout != fallback {
		t.Fatalf("BrowserBatchTimeout() = %v, want %v", timeout, fallback)
	}
}

func TestBrowserBatchTimeoutClampsFallbackWithoutActions(t *testing.T) {
	t.Parallel()

	timeout := BrowserBatchTimeout(map[string]interface{}{"actions": "invalid"}, MaxTimeout+time.Minute)

	if timeout != MaxTimeout {
		t.Fatalf("BrowserBatchTimeout() = %v, want %v", timeout, MaxTimeout)
	}
}
