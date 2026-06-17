package bridge

import (
	"context"
	"net"
	"testing"
	"time"
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
