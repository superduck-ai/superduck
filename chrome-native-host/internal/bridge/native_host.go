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
	DefaultUDSPath               = "/tmp/chrome-native-host.sock"
	ConnectTimeout               = 5 * time.Second
	ConnectRetries               = 3
	DefaultTimeout               = 30 * time.Second
	MaxTimeout                   = 5 * time.Minute
	DefaultHealthCheckTimeout    = 2 * time.Second
	DefaultHealthMonitorInterval = 30 * time.Second

	browserBatchChildActionTimeout = 15 * time.Second
	toolResponseHeadroom           = 15 * time.Second
	lockRetryInterval              = 10 * time.Millisecond
)

// Options configures the NativeHostBridge.
type Options struct {
	UDSPath     string
	LazyConnect bool
}

type HealthState string

const (
	HealthStateDisconnected HealthState = "disconnected"
	HealthStateConnecting   HealthState = "connecting"
	HealthStateConnected    HealthState = "connected"
	HealthStateHealthy      HealthState = "healthy"
	HealthStateBusy         HealthState = "busy"
	HealthStateUnhealthy    HealthState = "unhealthy"
)

// HealthStatus is a point-in-time view of the bridge's connection to the
// browser native-host process.
type HealthStatus struct {
	UDSPath             string      `json:"udsPath"`
	State               HealthState `json:"state"`
	Connected           bool        `json:"connected"`
	Healthy             bool        `json:"healthy"`
	Connectable         bool        `json:"connectable"`
	LastError           string      `json:"lastError,omitempty"`
	LastCheckedAt       time.Time   `json:"lastCheckedAt,omitempty"`
	LastConnectedAt     time.Time   `json:"lastConnectedAt,omitempty"`
	LastDisconnectedAt  time.Time   `json:"lastDisconnectedAt,omitempty"`
	ConsecutiveFailures int         `json:"consecutiveFailures"`
}

// Map returns a stable JSON-friendly representation for MCP structuredContent.
func (s HealthStatus) Map() map[string]interface{} {
	result := map[string]interface{}{
		"udsPath":             s.UDSPath,
		"state":               string(s.State),
		"connected":           s.Connected,
		"healthy":             s.Healthy,
		"connectable":         s.Connectable,
		"consecutiveFailures": s.ConsecutiveFailures,
	}
	if s.LastError != "" {
		result["lastError"] = s.LastError
	}
	if !s.LastCheckedAt.IsZero() {
		result["lastCheckedAt"] = s.LastCheckedAt.UTC().Format(time.RFC3339Nano)
	}
	if !s.LastConnectedAt.IsZero() {
		result["lastConnectedAt"] = s.LastConnectedAt.UTC().Format(time.RFC3339Nano)
	}
	if !s.LastDisconnectedAt.IsZero() {
		result["lastDisconnectedAt"] = s.LastDisconnectedAt.UTC().Format(time.RFC3339Nano)
	}
	return result
}

// NativeHostBridge handles communication with the Chrome Native Host
type NativeHostBridge struct {
	conn         net.Conn
	connMu       sync.Mutex
	udsPath      string
	healthMu     sync.Mutex
	healthStatus HealthStatus
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

	bridge := &NativeHostBridge{
		udsPath: udsPath,
	}
	bridge.markDisconnected("not connected")
	if opts.LazyConnect {
		return bridge, nil
	}

	conn, err := connectAndAuthenticate(context.Background(), udsPath)
	if err != nil {
		bridge.markFailure(fmt.Sprintf("connect failed: %v", err), true)
		return nil, err
	}
	bridge.conn = conn
	bridge.markConnected(time.Now(), "")

	slog.Info("connected to chrome-native-host", "path", udsPath)

	return bridge, nil
}

func connectAndAuthenticate(ctx context.Context, udsPath string) (net.Conn, error) {
	conn, err := connectWithRetry(ctx, udsPath)
	if err != nil {
		return nil, err
	}

	token, err := udsauth.ReadToken()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("failed to read UDS auth token: %w", err)
	}

	authReq := map[string]string{"type": "auth", "token": token}
	// Bound the auth handshake so a misconfigured or unresponsive listener
	// can't block startup indefinitely.
	authTimeout, err := timeoutForContext(ctx, ConnectTimeout)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	_ = conn.SetWriteDeadline(time.Now().Add(authTimeout))
	if err := protocol.SendMessage(conn, authReq); err != nil {
		_ = conn.SetWriteDeadline(time.Time{})
		_ = conn.Close()
		return nil, fmt.Errorf("failed to send auth: %w", err)
	}
	_ = conn.SetWriteDeadline(time.Time{})

	authTimeout, err = timeoutForContext(ctx, ConnectTimeout)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	_ = conn.SetReadDeadline(time.Now().Add(authTimeout))
	raw, err := protocol.ReadMessage(conn)
	_ = conn.SetReadDeadline(time.Time{})
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("auth response read failed: %w", err)
	}
	var authResp struct {
		Type  string `json:"type"`
		OK    string `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &authResp); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("auth response parse failed: %w", err)
	}
	if authResp.Type != "auth_response" || authResp.OK != "true" {
		_ = conn.Close()
		if authResp.Error != "" {
			return nil, fmt.Errorf("UDS authentication failed: %s", authResp.Error)
		}
		return nil, fmt.Errorf("UDS authentication failed: unexpected response type=%q ok=%q", authResp.Type, authResp.OK)
	}
	return conn, nil
}

func connectWithRetry(ctx context.Context, udsPath string) (net.Conn, error) {
	var conn net.Conn
	var err error

	for i := 0; i < ConnectRetries; i++ {
		// Check context before each attempt
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("connect canceled: %w", err)
		}

		dialTimeout, timeoutErr := timeoutForContext(ctx, ConnectTimeout)
		if timeoutErr != nil {
			return nil, fmt.Errorf("connect canceled: %w", timeoutErr)
		}
		conn, err = net.DialTimeout("unix", udsPath, dialTimeout)
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

func timeoutForContext(ctx context.Context, fallback time.Duration) (time.Duration, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return 0, context.DeadlineExceeded
		}
		if remaining < fallback {
			return remaining, nil
		}
	}
	return fallback, nil
}

func (b *NativeHostBridge) markDisconnected(lastError string) {
	b.healthMu.Lock()
	defer b.healthMu.Unlock()
	now := time.Now()
	b.healthStatus.UDSPath = b.udsPath
	b.healthStatus.State = HealthStateDisconnected
	b.healthStatus.Connected = false
	b.healthStatus.Healthy = false
	b.healthStatus.Connectable = false
	b.healthStatus.LastError = lastError
	b.healthStatus.LastDisconnectedAt = now
}

func (b *NativeHostBridge) markConnected(now time.Time, lastError string) {
	b.healthMu.Lock()
	defer b.healthMu.Unlock()
	b.healthStatus.UDSPath = b.udsPath
	b.healthStatus.State = HealthStateConnected
	b.healthStatus.Connected = true
	b.healthStatus.Healthy = false
	b.healthStatus.Connectable = true
	b.healthStatus.LastError = lastError
	b.healthStatus.LastConnectedAt = now
	b.healthStatus.ConsecutiveFailures = 0
}

func (b *NativeHostBridge) markHealthy(now time.Time) HealthStatus {
	b.healthMu.Lock()
	defer b.healthMu.Unlock()
	b.healthStatus.UDSPath = b.udsPath
	b.healthStatus.State = HealthStateHealthy
	b.healthStatus.Connected = true
	b.healthStatus.Healthy = true
	b.healthStatus.Connectable = true
	b.healthStatus.LastError = ""
	b.healthStatus.LastCheckedAt = now
	if b.healthStatus.LastConnectedAt.IsZero() {
		b.healthStatus.LastConnectedAt = now
	}
	b.healthStatus.ConsecutiveFailures = 0
	return b.healthStatus
}

func (b *NativeHostBridge) markBusy(lastError string) HealthStatus {
	b.healthMu.Lock()
	defer b.healthMu.Unlock()
	now := time.Now()
	b.healthStatus.UDSPath = b.udsPath
	b.healthStatus.State = HealthStateBusy
	b.healthStatus.Healthy = false
	b.healthStatus.LastError = lastError
	b.healthStatus.LastCheckedAt = now
	return b.healthStatus
}

func (b *NativeHostBridge) markFailure(lastError string, connectable bool) HealthStatus {
	b.healthMu.Lock()
	defer b.healthMu.Unlock()
	now := time.Now()
	b.healthStatus.UDSPath = b.udsPath
	b.healthStatus.State = HealthStateUnhealthy
	b.healthStatus.Connected = false
	b.healthStatus.Healthy = false
	b.healthStatus.Connectable = connectable
	b.healthStatus.LastError = lastError
	b.healthStatus.LastCheckedAt = now
	b.healthStatus.LastDisconnectedAt = now
	b.healthStatus.ConsecutiveFailures++
	return b.healthStatus
}

// Status returns the last known bridge health without performing I/O.
func (b *NativeHostBridge) Status() HealthStatus {
	b.healthMu.Lock()
	defer b.healthMu.Unlock()
	status := b.healthStatus
	status.UDSPath = b.udsPath
	return status
}

func (b *NativeHostBridge) lockWithContext(ctx context.Context) error {
	for {
		if b.connMu.TryLock() {
			return nil
		}
		timer := time.NewTimer(lockRetryInterval)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			return ctx.Err()
		case <-timer.C:
		}
	}
}

// CheckHealth performs an active, local UDS health check against native-host.
// The request is answered by native-host itself and does not round-trip through
// Chrome, so it remains useful when extension-side tool execution is stuck.
func (b *NativeHostBridge) CheckHealth(ctx context.Context) HealthStatus {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, DefaultHealthCheckTimeout)
		defer cancel()
	}

	if err := b.lockWithContext(ctx); err != nil {
		return b.markBusy(fmt.Sprintf("health check skipped while bridge is busy: %v", err))
	}
	defer b.connMu.Unlock()

	if b.conn == nil {
		b.healthMu.Lock()
		b.healthStatus.State = HealthStateConnecting
		b.healthStatus.UDSPath = b.udsPath
		b.healthMu.Unlock()

		conn, err := connectAndAuthenticate(ctx, b.udsPath)
		if err != nil {
			return b.markFailure(fmt.Sprintf("connect failed: %v", err), false)
		}
		b.conn = conn
		b.markConnected(time.Now(), "")
	}

	deadlineTimeout, err := timeoutForContext(ctx, DefaultHealthCheckTimeout)
	if err != nil {
		return b.markFailure(fmt.Sprintf("health check deadline expired: %v", err), true)
	}
	deadline := time.Now().Add(deadlineTimeout)
	_ = b.conn.SetDeadline(deadline)
	if err := protocol.SendMessage(b.conn, map[string]string{"type": "health_check"}); err != nil {
		_ = b.conn.SetDeadline(time.Time{})
		_ = b.conn.Close()
		b.conn = nil
		return b.markFailure(fmt.Sprintf("health check send failed: %v", err), false)
	}

	raw, err := protocol.ReadMessage(b.conn)
	_ = b.conn.SetDeadline(time.Time{})
	if err != nil {
		_ = b.conn.Close()
		b.conn = nil
		return b.markFailure(fmt.Sprintf("health check read failed: %v", err), false)
	}

	var response struct {
		Type string `json:"type"`
		OK   bool   `json:"ok"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		_ = b.conn.Close()
		b.conn = nil
		return b.markFailure(fmt.Sprintf("health response parse failed: %v", err), false)
	}
	if response.Type != "health_response" || !response.OK {
		_ = b.conn.Close()
		b.conn = nil
		return b.markFailure(fmt.Sprintf("unexpected health response: %s", raw), false)
	}

	return b.markHealthy(time.Now())
}

// StartHealthMonitor periodically refreshes bridge health. It never terminates
// the native-host process; when health fails, the next check or tool call will
// reconnect after the user/browser restarts native-host.
func (b *NativeHostBridge) StartHealthMonitor(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = DefaultHealthMonitorInterval
	}
	go func() {
		check := func() {
			checkCtx, cancel := context.WithTimeout(ctx, DefaultHealthCheckTimeout)
			defer cancel()
			status := b.CheckHealth(checkCtx)
			if !status.Healthy && status.State != HealthStateBusy {
				slog.Warn("native-host health check failed",
					"state", status.State,
					"connectable", status.Connectable,
					"error", status.LastError,
				)
			}
		}

		check()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				check()
			}
		}
	}()
}

// Close closes the connection to the native host
func (b *NativeHostBridge) Close() error {
	b.connMu.Lock()
	defer b.connMu.Unlock()
	if b.conn != nil {
		err := b.conn.Close()
		b.conn = nil
		b.markDisconnected("closed")
		return err
	}
	b.markDisconnected("closed")
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
	conn, err := connectAndAuthenticate(ctx, b.udsPath)
	if err != nil {
		b.markFailure(fmt.Sprintf("reconnect failed: %v", err), false)
		return err
	}
	b.conn = conn
	b.markConnected(time.Now(), "")
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
	args, normErr := b.normalizeArgs(toolName, args)
	if normErr != nil {
		return nil, fmt.Errorf("invalid tool arguments: %w", normErr)
	}

	slog.Debug("forwarding to native host", "tool", toolName, "args", args)

	requestDeadline, timeout, deadlineErr := computeRequestDeadline(ctx, time.Now())
	if deadlineErr != nil {
		return nil, deadlineErr
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

	// Set deadline on the connection and ensure it's cleared on all paths.
	if err := b.conn.SetDeadline(requestDeadline); err != nil {
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

	// Bound each send so a half-open UDS connection can't block forever while
	// preserving the request-level read deadline derived from ctx.
	writeDeadline := time.Now().Add(30 * time.Second)
	if requestDeadline.Before(writeDeadline) {
		writeDeadline = requestDeadline
	}
	_ = b.conn.SetWriteDeadline(writeDeadline)
	if err := protocol.SendMessage(b.conn, req); err != nil {
		// Connection is broken; close it so reconnect() picks up a fresh one.
		_ = b.conn.SetWriteDeadline(time.Time{})
		_ = b.conn.Close()
		b.conn = nil
		b.markFailure(fmt.Sprintf("send failed: %v", err), false)
		return nil, fmt.Errorf("failed to send to native host: %w", err)
	}
	_ = b.conn.SetWriteDeadline(time.Time{})

	// Wait for tool_response using the request deadline plus forwarding headroom.
	_ = b.conn.SetReadDeadline(requestDeadline)
	response, err := protocol.ReadMessage(b.conn)
	_ = b.conn.SetReadDeadline(time.Time{})
	if err != nil {
		// Connection is broken (timeout, EOF, or protocol desync).
		// Close it so the next call reconnects on a clean stream
		// and avoids reading stale responses.
		_ = b.conn.Close()
		b.conn = nil
		b.markFailure(fmt.Sprintf("read failed: %v", err), false)
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

func computeRequestDeadline(ctx context.Context, now time.Time) (time.Time, time.Duration, error) {
	maxDeadline := now.Add(MaxTimeout)
	if deadline, ok := ctx.Deadline(); ok {
		if !deadline.After(now) {
			err := ctx.Err()
			if err == nil {
				err = context.DeadlineExceeded
			}
			return time.Time{}, 0, fmt.Errorf("context deadline exceeded before send: %w", err)
		}
		deadline = deadline.Add(toolResponseHeadroom)
		if deadline.After(maxDeadline) {
			return maxDeadline, MaxTimeout, nil
		}
		return deadline, deadline.Sub(now), nil
	}

	timeout := DefaultTimeout + toolResponseHeadroom
	if timeout > MaxTimeout {
		timeout = MaxTimeout
	}
	return now.Add(timeout), timeout, nil
}

// BrowserBatchTimeout returns a request timeout large enough for the extension
// runtime's per-child action timeout while still respecting MaxTimeout.
func BrowserBatchTimeout(args map[string]interface{}, fallback time.Duration) time.Duration {
	if fallback <= 0 {
		fallback = DefaultTimeout
	}
	if fallback > MaxTimeout {
		fallback = MaxTimeout
	}
	actionCount := browserBatchActionCount(args)
	if actionCount == 0 {
		return fallback
	}
	timeout := fallback + time.Duration(actionCount)*browserBatchChildActionTimeout
	if timeout > MaxTimeout {
		return MaxTimeout
	}
	return timeout
}

func browserBatchActionCount(args map[string]interface{}) int {
	if args == nil {
		return 0
	}
	switch actions := args["actions"].(type) {
	case []interface{}:
		return len(actions)
	case []map[string]interface{}:
		return len(actions)
	default:
		return 0
	}
}

// normalizeArgs normalizes tool arguments to match Chrome extension expectations.
// Returns an error if validation fails (e.g., out-of-range parameters).
func (b *NativeHostBridge) normalizeArgs(tool string, args map[string]interface{}) (map[string]interface{}, error) {
	normalized := make(map[string]interface{})
	for k, v := range args {
		normalized[k] = v
	}

	// Validate computer tool parameters (duration bounds, etc.)
	if tool == "computer" {
		if err := validateComputerArgs(normalized); err != nil {
			return nil, err
		}
	}

	return normalized, nil
}

func validateComputerArgs(args map[string]interface{}) error {
	// Validate duration is within schema limits (0–30 seconds).
	// Reject rather than clamp so the agent receives a clear error and
	// learns the correct bounds (avoids "over-shackling" per agent
	// harness best practices).
	if duration, ok := args["duration"].(float64); ok {
		if duration > 30 {
			return fmt.Errorf("duration %.1f exceeds schema maximum of 30 seconds", duration)
		}
		if duration < 0 {
			return fmt.Errorf("duration %.1f is negative; must be >= 0", duration)
		}
	}
	return nil
}
