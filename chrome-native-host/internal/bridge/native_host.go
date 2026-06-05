package bridge

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"

	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
)

const (
	UDSPath        = "/tmp/chrome-native-host.sock"
	ConnectTimeout = 5 * time.Second
	ConnectRetries = 3
)

// NativeHostBridge handles communication with the Chrome Native Host
type NativeHostBridge struct {
	mu   sync.Mutex
	conn net.Conn
}

// New creates a new bridge to the Chrome Native Host
func New() (*NativeHostBridge, error) {
	b := &NativeHostBridge{}
	if err := b.connect(); err != nil {
		return nil, err
	}
	return b, nil
}

// connect establishes and authenticates a UDS connection to the native host.
// Caller must NOT hold b.mu.
func (b *NativeHostBridge) connect() error {
	var conn net.Conn
	var err error

	for i := 0; i < ConnectRetries; i++ {
		conn, err = net.DialTimeout("unix", UDSPath, ConnectTimeout)
		if err == nil {
			break
		}
		slog.Warn("failed to connect to UDS", "attempt", i+1, "max", ConnectRetries, "error", err)
		if i < ConnectRetries-1 {
			time.Sleep(time.Second)
		}
	}
	if err != nil {
		return fmt.Errorf("failed to connect to chrome-native-host at %s: %w\nMake sure chrome-native-host is running with --uds flag", UDSPath, err)
	}

	// Authenticate with the native host using the shared token.
	token, err := udsauth.ReadToken()
	if err != nil {
		conn.Close()
		return fmt.Errorf("failed to read UDS auth token: %w", err)
	}

	authReq := map[string]string{"type": "auth", "token": token}
	_ = conn.SetWriteDeadline(time.Now().Add(ConnectTimeout))
	if err := protocol.SendMessage(conn, authReq); err != nil {
		conn.Close()
		return fmt.Errorf("failed to send auth: %w", err)
	}
	_ = conn.SetWriteDeadline(time.Time{})

	_ = conn.SetReadDeadline(time.Now().Add(ConnectTimeout))
	raw, err := protocol.ReadMessage(conn)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
		conn.Close()
		return fmt.Errorf("auth response read failed: %w", err)
	}

	var authResp struct {
		Type  string `json:"type"`
		OK    string `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &authResp); err != nil {
		conn.Close()
		return fmt.Errorf("auth response parse failed: %w", err)
	}
	if authResp.Type != "auth_response" || authResp.OK != "true" {
		conn.Close()
		if authResp.Error != "" {
			return fmt.Errorf("UDS authentication failed: %s", authResp.Error)
		}
		return fmt.Errorf("UDS authentication failed: unexpected response type=%q ok=%q", authResp.Type, authResp.OK)
	}

	b.mu.Lock()
	if b.conn != nil {
		b.conn.Close()
	}
	b.conn = conn
	b.mu.Unlock()

	slog.Info("connected to chrome-native-host", "path", UDSPath)
	return nil
}

// Close closes the connection to the native host
func (b *NativeHostBridge) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.conn != nil {
		err := b.conn.Close()
		b.conn = nil
		return err
	}
	return nil
}

// isBrokenConn reports whether an error indicates the connection is no longer
// usable (closed by peer, idle timeout, reset, etc.) and should be reconnected.
func isBrokenConn(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, net.ErrClosed) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	return false
}

// ExecuteTool sends a tool request to the native host and returns the result.
// If the connection was closed (e.g. by idle timeout), it transparently
// reconnects and retries once before returning an error.
func (b *NativeHostBridge) ExecuteTool(toolName string, args map[string]interface{}) (interface{}, error) {
	args = b.normalizeArgs(toolName, args)
	slog.Debug("forwarding to native host", "tool", toolName, "args", args)

	req := map[string]interface{}{
		"type":   "tool_request",
		"method": "execute_tool",
		"params": map[string]interface{}{
			"tool": toolName,
			"args": args,
		},
	}

	result, err := b.sendAndRecv(req)
	if err == nil {
		return result, nil
	}

	// If the connection broke, reconnect and retry once.
	if !isBrokenConn(err) {
		return nil, err
	}
	slog.Warn("bridge connection broken, reconnecting", "error", err)
	if reconnErr := b.connect(); reconnErr != nil {
		return nil, fmt.Errorf("reconnect failed: %w (original error: %v)", reconnErr, err)
	}
	return b.sendAndRecv(req)
}

// sendAndRecv performs one request-response cycle over the current connection.
func (b *NativeHostBridge) sendAndRecv(req map[string]interface{}) (interface{}, error) {
	b.mu.Lock()
	conn := b.conn
	b.mu.Unlock()
	if conn == nil {
		return nil, fmt.Errorf("bridge not connected")
	}

	_ = conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if err := protocol.SendMessage(conn, req); err != nil {
		_ = conn.SetWriteDeadline(time.Time{})
		return nil, fmt.Errorf("failed to send to native host: %w", err)
	}
	_ = conn.SetWriteDeadline(time.Time{})

	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	response, err := protocol.ReadMessage(conn)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
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

// normalizeArgs normalizes tool arguments to match Chrome extension expectations
func (b *NativeHostBridge) normalizeArgs(tool string, args map[string]interface{}) map[string]interface{} {
	normalized := make(map[string]interface{})
	for k, v := range args {
		normalized[k] = v
	}

	// Validate computer tool parameters based on action
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
