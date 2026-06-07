package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"

	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

const (
	DefaultUDSPath = "/tmp/chrome-native-host.sock"
	ConnectTimeout = 5 * time.Second
	ConnectRetries = 3
	DefaultTimeout = 30 * time.Second
	MaxTimeout     = 5 * time.Minute
)

// Options configures the NativeHostBridge.
type Options struct {
	UDSPath string
}

// NativeHostBridge handles communication with the Chrome Native Host
type NativeHostBridge struct {
	conn    net.Conn
	connMu  sync.Mutex
	udsPath string
}

// New creates a new bridge to the Chrome Native Host with default options.
func New() (*NativeHostBridge, error) {
	return NewWithOptions(Options{UDSPath: DefaultUDSPath})
}

// NewWithOptions creates a new bridge with custom options.
func NewWithOptions(opts Options) (*NativeHostBridge, error) {
	udsPath := opts.UDSPath
	if udsPath == "" {
		udsPath = DefaultUDSPath
	}

	conn, err := connectWithRetry(context.Background(), udsPath)
	if err != nil {
		return nil, err
	}

	// Authenticate with the native host using the shared token.
	token, err := udsauth.ReadToken()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to read UDS auth token: %w", err)
	}

	authReq := map[string]string{"type": "auth", "token": token}
	// Bound the auth handshake so a misconfigured or unresponsive listener
	// can't block startup indefinitely.
	_ = conn.SetWriteDeadline(time.Now().Add(ConnectTimeout))
	if err := protocol.SendMessage(conn, authReq); err != nil {
		_ = conn.SetWriteDeadline(time.Time{})
		conn.Close()
		return nil, fmt.Errorf("failed to send auth: %w", err)
	}
	_ = conn.SetWriteDeadline(time.Time{})

	// Wait for auth response
	_ = conn.SetReadDeadline(time.Now().Add(ConnectTimeout))
	raw, err := protocol.ReadMessage(conn)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("auth response read failed: %w", err)
	}
	var authResp struct {
		Type  string `json:"type"`
		OK    string `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &authResp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("auth response parse failed: %w", err)
	}
	if authResp.Type != "auth_response" || authResp.OK != "true" {
		conn.Close()
		if authResp.Error != "" {
			return nil, fmt.Errorf("UDS authentication failed: %s", authResp.Error)
		}
		return nil, fmt.Errorf("UDS authentication failed: unexpected response type=%q ok=%q", authResp.Type, authResp.OK)
	}

	slog.Info("connected to chrome-native-host", "path", udsPath)

	return &NativeHostBridge{
		conn:    conn,
		udsPath: udsPath,
	}, nil
}

func connectWithRetry(ctx context.Context, udsPath string) (net.Conn, error) {
	var conn net.Conn
	var err error

	for i := 0; i < ConnectRetries; i++ {
		// Check context before each attempt
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("connect canceled: %w", err)
		}

		conn, err = net.DialTimeout("unix", udsPath, ConnectTimeout)
		if err == nil {
			return conn, nil
		}
		slog.Warn("failed to connect to UDS", "attempt", i+1, "max", ConnectRetries, "error", err)
		if i < ConnectRetries-1 {
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("connect canceled: %w", ctx.Err())
			case <-time.After(time.Second):
			}
		}
	}

	return nil, fmt.Errorf("failed to connect to chrome-native-host at %s: %w\nMake sure chrome-native-host is running", udsPath, err)
}

// Close closes the connection to the native host
func (b *NativeHostBridge) Close() error {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	if b.conn != nil {
		err := b.conn.Close()
		b.conn = nil
		return err
	}
	return nil
}

// reconnect attempts to re-establish the connection if it's broken.
// It respects the context deadline and will fail fast if ctx is canceled.
func (b *NativeHostBridge) reconnect(ctx context.Context) error {
	b.connMu.Lock()
	defer b.connMu.Unlock()

	// If we have a connection, assume it's valid. Broken connections will
	// be detected during the next send/recv and trigger a reconnect then.
	// This avoids probe reads that can consume protocol bytes.
	if b.conn != nil {
		return nil
	}

	slog.Info("attempting to reconnect to chrome-native-host")
	conn, err := connectWithRetry(ctx, b.udsPath)
	if err != nil {
		return err
	}
	b.conn = conn
	slog.Info("reconnected to chrome-native-host")

	return nil
}

// ExecuteTool sends a tool request to the native host and returns the result.
// It respects the context deadline and will attempt reconnection if the connection is lost.
func (b *NativeHostBridge) ExecuteTool(ctx context.Context, toolName string, args map[string]interface{}) (interface{}, error) {
	// Fail fast if context is already done
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("context already done: %w", err)
	}

	// Ensure we have a valid connection
	if err := b.reconnect(ctx); err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}

	// Normalize arguments before forwarding
	args = b.normalizeArgs(toolName, args)

	slog.Debug("forwarding to native host", "tool", toolName, "args", args)

	// Calculate timeout from context or use default.
	// Add headroom for forwarding overhead (the extension itself may sleep
	// up to `duration` seconds, so the bridge deadline must outlive that).
	timeout := DefaultTimeout
	headroom := 5 * time.Second
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return nil, fmt.Errorf("context deadline exceeded before send: %w", ctx.Err())
		}
		if remaining+headroom < MaxTimeout {
			timeout = remaining + headroom
		} else {
			timeout = MaxTimeout
		}
	}

	b.connMu.Lock()
	defer b.connMu.Unlock()

	// Recheck context after acquiring the lock — it may have expired while
	// waiting for a concurrent tool call to finish.
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("context expired while waiting for bridge lock: %w", err)
	}

	// Recheck b.conn after acquiring the lock — Close() may have nil'd it
	// between reconnect() releasing the lock and us re-acquiring it.
	if b.conn == nil {
		return nil, fmt.Errorf("connection closed while waiting for bridge lock")
	}

	// Set deadline on the connection and ensure it's cleared on all paths
	deadline := time.Now().Add(timeout)
	if err := b.conn.SetDeadline(deadline); err != nil {
		return nil, fmt.Errorf("failed to set deadline: %w", err)
	}
	defer func() {
		if b.conn != nil {
			_ = b.conn.SetDeadline(time.Time{})
		}
	}()

	// Send tool_request to native host
	req := map[string]interface{}{
		"type":   "tool_request",
		"method": "execute_tool",
		"params": map[string]interface{}{
			"tool": toolName,
			"args": args,
		},
	}

	// Bound each send/recv so a half-open UDS connection can't block forever.
	// Use 35s read deadline to accommodate the schema-maximum 30s wait action
	// plus 5s forwarding headroom.
	_ = b.conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if err := protocol.SendMessage(b.conn, req); err != nil {
		// Connection is broken; close it so reconnect() picks up a fresh one.
		_ = b.conn.SetWriteDeadline(time.Time{})
		b.conn.Close()
		b.conn = nil
		return nil, fmt.Errorf("failed to send to native host: %w", err)
	}
	_ = b.conn.SetWriteDeadline(time.Time{})

	// Wait for tool_response
	_ = b.conn.SetReadDeadline(time.Now().Add(35 * time.Second))
	response, err := protocol.ReadMessage(b.conn)
	_ = b.conn.SetReadDeadline(time.Time{})
	if err != nil {
		// Connection is broken (timeout, EOF, or protocol desync).
		// Close it so the next call reconnects on a clean stream
		// and avoids reading stale responses.
		b.conn.Close()
		b.conn = nil
		if isTimeoutError(err) {
			return nil, fmt.Errorf("tool execution timed out after %v: %w", timeout, err)
		}
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var resp protocol.ToolResponseMsg
	if err := json.Unmarshal(response, &resp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("tool error: %v", resp.Error.Content)
	}

	if resp.Result != nil && resp.Result.StructuredContent != nil {
		return resp.Result.StructuredContent, nil
	}

	return resp.Result.Content, nil
}

func isTimeoutError(err error) bool {
	if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
		return true
	}
	return false
}

// normalizeArgs normalizes tool arguments to match Chrome extension expectations
func (b *NativeHostBridge) normalizeArgs(tool string, args map[string]interface{}) map[string]interface{} {
	normalized := make(map[string]interface{})
	for k, v := range args {
		normalized[k] = v
	}

	// Validate computer tool parameters (duration bounds, etc.)
	if tool == "computer" {
		validateComputerArgs(normalized)
	}

	return normalized
}

func validateComputerArgs(args map[string]interface{}) {
	// Validate duration is within schema limits
	if duration, ok := args["duration"].(float64); ok {
		if duration > 30 {
			slog.Warn("duration exceeds schema maximum", "duration", duration, "max", 30)
		}
		if duration < 0 {
			slog.Warn("negative duration", "duration", duration)
		}
	}
}
