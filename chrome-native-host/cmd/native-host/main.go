package main

import (
	"chrome-native-host/internal/analytics"
	"chrome-native-host/internal/bridge"
	"chrome-native-host/internal/protocol"
	"chrome-native-host/internal/udsauth"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	socketPath = "/tmp/chrome-native-host.sock"
)

const defaultIdentitySyncWait = 2 * time.Second

// Must be higher than the extension-side tool timeout and the documented
// `computer.wait` maximum of 30s.
const defaultChromeResponseTimeout = 40 * time.Second

// maxUDSConnections caps concurrent UDS client connections to prevent
// resource exhaustion from buggy or malicious local processes.
const maxUDSConnections = 16

// --- Server with dual channels ---

type Server struct {
	udsListener    net.Listener
	udsAuth        string
	udsConnections map[net.Conn]bool
	connMu         sync.Mutex
	closed         chan struct{}
	closeOnce      sync.Once
	startedAt      time.Time
	stateMu        sync.Mutex
	chromeReady    bool
	lastChromeAt   time.Time
	lastChromeErr  string

	// Chrome stdio is single-threaded: one goroutine reads stdin,
	// responses are routed back via chromeCh.
	// chromeMu serializes request-response pairs to Chrome.
	chromeMu         sync.Mutex
	chromeCh         chan []byte
	chromeWriter     io.Writer
	chromeTimeout    time.Duration
	skipIdentitySync bool
	identitySyncOnce sync.Once
}

func NewServer() (*Server, error) {
	// bindAttempts covers the edge case where the old process's
	// Listener.Close() removes our freshly-bound socket file. If
	// net.Listen fails, re-run prepareSocketPath and retry.
	const bindAttempts = 3
	var listener net.Listener
	for attempt := 0; attempt < bindAttempts; attempt++ {
		if err := prepareSocketPath(socketPath); err != nil {
			return nil, err
		}

		var err error
		listener, err = net.Listen("unix", socketPath)
		if err == nil {
			// Verify the socket file still exists: the old process's
			// Listener.Close() may have unlinked it after our bind.
			if _, statErr := os.Lstat(socketPath); statErr != nil {
				_ = listener.Close()
				if os.IsNotExist(statErr) {
					if attempt == bindAttempts-1 {
						return nil, fmt.Errorf("socket unlinked after bind (retries exhausted): %w", statErr)
					}
					slog.Warn("socket unlinked after bind, retrying",
						"path", socketPath, "attempt", attempt+1)
					time.Sleep(200 * time.Millisecond)
					continue
				}
				return nil, fmt.Errorf("failed to stat newly-created UDS socket: %w", statErr)
			}
			break
		}

		if attempt < bindAttempts-1 {
			slog.Warn("bind failed, retrying (old process may have removed socket)",
				"path", socketPath, "attempt", attempt+1, "error", err)
			time.Sleep(200 * time.Millisecond)
			continue
		}
		return nil, fmt.Errorf("failed to create UDS listener: %w", err)
	}

	// Restrict socket to owner-only so other local users cannot connect.
	if err := os.Chmod(socketPath, 0700); err != nil {
		slog.Warn("failed to restrict socket permissions", "path", socketPath, "error", err)
	}

	slog.Info("UDS server listening", "path", socketPath)

	return &Server{
		udsListener:    listener,
		udsConnections: make(map[net.Conn]bool),
		chromeCh:       make(chan []byte, 1),
		chromeWriter:   os.Stdout,
		chromeTimeout:  defaultChromeResponseTimeout,
		closed:         make(chan struct{}),
		startedAt:      time.Now(),
		chromeReady:    true,
	}, nil
}

// prepareSocketPath checks if a socket file exists at the given path and handles
// stale socket cleanup. It reduces the TOCTOU race window by renaming before
// removal rather than removing in place.
func prepareSocketPath(path string) error {
	// Check if socket exists
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // No existing socket, safe to proceed
		}
		return fmt.Errorf("failed to stat UDS socket: %w", err)
	}

	// Verify it's actually a socket, not a regular file or directory
	if info.Mode()&os.ModeSocket == 0 {
		return fmt.Errorf("path %s exists but is not a socket (mode: %v)", path, info.Mode())
	}

	// Socket exists, try to connect to see if it's active
	conn, err := net.DialTimeout("unix", path, 200*time.Millisecond)
	if err == nil {
		_ = conn.Close()

		// The socket is responding, but the owning process may be shutting
		// down (race between old process SIGTERM/stdin-close and new process
		// startup). Retry with short intervals — the old process typically
		// exits within 200-300ms based on observed logs.
		const maxRetries = 5
		const retryInterval = 300 * time.Millisecond

		slog.Info("socket appears active, retrying in case old process is shutting down", "path", path, "maxRetries", maxRetries)
		stillAlive := true
		for i := 0; i < maxRetries; i++ {
			time.Sleep(retryInterval)
			c, e := net.DialTimeout("unix", path, 200*time.Millisecond)
			if e != nil {
				if isConnRefused(e) {
					slog.Info("previous process exited during retry", "path", path, "attempt", i+1)
					stillAlive = false
					break
				}
				return fmt.Errorf("socket at %s dial failed with unexpected error during retry %d: %w", path, i+1, e)
			}
			_ = c.Close()
		}
		if stillAlive {
			return fmt.Errorf("chrome-native-host already listening at %s", path)
		}
		// Fall through to stale socket cleanup below
	} else if !isConnRefused(err) {
		// Only treat connection-refused errors as stale sockets.
		// Other dial failures (permission denied, path is a directory, etc.)
		// indicate a real problem and should not be silently removed.
		return fmt.Errorf("socket at %s exists and dial failed with unexpected error: %w", path, err)
	}

	// Revalidate before cleanup: another replacement process may have
	// bound a live socket at this path while we were in the retry loop.
	// If the socket is now active, abort — the other process owns it.
	conn, err = net.DialTimeout("unix", path, 200*time.Millisecond)
	if err == nil {
		_ = conn.Close()
		return fmt.Errorf("chrome-native-host already listening at %s (recheck)", path)
	}
	if !isConnRefused(err) {
		return fmt.Errorf("socket at %s recheck dial failed with unexpected error: %w", path, err)
	}

	// Socket is stale. Rename first to free the path immediately, then
	// remove the renamed file. A unique suffix avoids colliding with a
	// leftover .stale file from a previous crashed cleanup.
	stalePath := fmt.Sprintf("%s.stale.%d", path, os.Getpid())
	if err := os.Rename(path, stalePath); err != nil {
		// Rename failed — the file may have been removed by the dying
		// process (Go's net.Listener.Close removes UDS files). Check
		// if the path is already gone; if so, we're done.
		if os.IsNotExist(err) {
			return nil
		}
		// If rename fails for other reasons, try direct remove as fallback
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to remove stale UDS socket: %w", err)
		}
		return nil
	}
	// Successfully renamed, now remove the renamed file
	if err := os.Remove(stalePath); err != nil {
		// Log but don't fail - the important thing is the original path is clear
		slog.Warn("failed to remove renamed stale socket", "path", stalePath, "error", err)
	}
	return nil
}

// isConnRefused reports whether the error indicates the peer is not listening
// (connection refused or socket file does not exist), as opposed to a
// permission error or other dial failure.
func isConnRefused(err error) bool {
	if err == nil {
		return false
	}
	// net.OpError wraps the underlying syscall error
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		var sysErr *os.SyscallError
		if errors.As(opErr.Err, &sysErr) {
			return sysErr.Err == syscall.ECONNREFUSED || sysErr.Err == syscall.ENOENT
		}
	}
	// Fallback: check the error string for common refused patterns
	errStr := err.Error()
	return strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "no such file or directory")
}

func (s *Server) Run() error {
	// Single goroutine owns stdin reads
	go s.readChromeStdio()

	for {
		conn, err := s.udsListener.Accept()
		if err != nil {
			select {
			case <-s.closed:
				return nil
			default:
			}
			slog.Error("accept error", "error", err)
			continue
		}

		s.connMu.Lock()
		if len(s.udsConnections) >= maxUDSConnections {
			s.connMu.Unlock()
			slog.Warn("UDS connection rejected: max connections reached", "max", maxUDSConnections)
			_ = conn.Close()
			continue
		}
		s.udsConnections[conn] = false
		s.connMu.Unlock()

		go s.handleUDSConnection(conn)
	}
}

func (s *Server) authenticateUDSClient(conn net.Conn) (string, error) {
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	raw, err := protocol.ReadMessage(conn)
	if err != nil {
		return "", fmt.Errorf("auth read: %w", err)
	}
	_ = conn.SetReadDeadline(time.Time{})
	var auth struct {
		Type    string `json:"type"`
		Token   string `json:"token"`
		Purpose string `json:"purpose"`
	}
	if err := json.Unmarshal(raw, &auth); err != nil {
		return "", fmt.Errorf("auth parse: %w", err)
	}
	if auth.Type != "auth" || auth.Token != s.udsAuth {
		_ = protocol.SendMessage(conn, map[string]string{
			"type":  "auth_response",
			"error": "authentication failed",
		})
		return "", errors.New("invalid auth token")
	}
	_ = protocol.SendMessage(conn, map[string]string{"type": "auth_response", "ok": "true"})
	return auth.Purpose, nil
}

// readChromeStdio is the ONLY goroutine that reads os.Stdin.
// It dispatches messages based on type:
//   - tool_response → chromeCh (for forwardToChrome)
//   - everything else → handleChromeMessage
func (s *Server) readChromeStdio() {
	for {
		raw, err := protocol.ReadMessage(os.Stdin)
		if err != nil {
			if err == io.EOF {
				slog.Info("Chrome stdin closed")
			} else {
				slog.Error("Chrome read error", "error", err)
			}
			s.markChromeDisconnected(err)
			close(s.chromeCh)
			s.Close()
			return
		}
		s.markChromeMessage()

		var msg protocol.Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			slog.Error("json unmarshal error from Chrome", "error", err)
			continue
		}

		if msg.Type == "tool_response" {
			// Route to whoever is waiting in forwardToChrome
			s.chromeCh <- raw
		} else {
			s.handleChromeMessage(raw, &msg)
		}
	}
}

func (s *Server) handleUDSConnection(conn net.Conn) {
	defer func() {
		s.removeUDSConnection(conn)
		conn.Close()
	}()

	slog.Debug("new UDS connection from MCP server")

	purpose, err := s.authenticateUDSClient(conn)
	if err != nil {
		slog.Warn("UDS authentication failed", "error", err)
		return
	}
	slog.Debug("UDS client authenticated")
	isControlConnection := purpose == "control"
	if !isControlConnection {
		s.setUDSAuthenticated(conn)
	}

	// Set idle timeout: if no message received within 5 minutes, close connection
	// This prevents resource leaks from abandoned connections
	idleTimeout := 5 * time.Minute

	for {
		// Set read deadline for idle timeout
		_ = conn.SetReadDeadline(time.Now().Add(idleTimeout))
		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			if err != io.EOF {
				// Check if it's a timeout error
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					slog.Debug("UDS connection idle timeout, closing", "timeout", idleTimeout)
					return
				}
				slog.Error("UDS read error", "error", err)
			}
			return
		}

		// Clear read deadline for processing
		_ = conn.SetReadDeadline(time.Time{})

		if s.handleUDSControlMessage(raw, conn) {
			continue
		}

		s.forwardToChrome(raw, conn)
	}
}

func (s *Server) markChromeMessage() {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.chromeReady = true
	s.lastChromeAt = time.Now()
	s.lastChromeErr = ""
}

func (s *Server) markChromeDisconnected(err error) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	s.chromeReady = false
	if err != nil {
		s.lastChromeErr = err.Error()
	}
}

func (s *Server) authenticatedUDSConnectionCountLocked() int {
	count := 0
	for _, authenticated := range s.udsConnections {
		if authenticated {
			count++
		}
	}
	return count
}

func (s *Server) authenticatedUDSConnectionCount() int {
	s.connMu.Lock()
	defer s.connMu.Unlock()
	return s.authenticatedUDSConnectionCountLocked()
}

func (s *Server) setUDSAuthenticated(conn net.Conn) {
	s.connMu.Lock()
	previousCount := s.authenticatedUDSConnectionCountLocked()
	s.udsConnections[conn] = true
	nextCount := s.authenticatedUDSConnectionCountLocked()
	s.connMu.Unlock()

	if previousCount == 0 && nextCount > 0 {
		s.sendMCPStateToChrome(true)
	}
}

func (s *Server) removeUDSConnection(conn net.Conn) {
	s.connMu.Lock()
	wasAuthenticated := s.udsConnections[conn]
	delete(s.udsConnections, conn)
	nextCount := s.authenticatedUDSConnectionCountLocked()
	s.connMu.Unlock()

	if wasAuthenticated && nextCount == 0 {
		s.sendMCPStateToChrome(false)
	}
}

func (s *Server) chromeOutput() io.Writer {
	if s.chromeWriter != nil {
		return s.chromeWriter
	}
	return os.Stdout
}

func (s *Server) sendToChrome(msg interface{}) {
	if err := protocol.SendMessage(s.chromeOutput(), msg); err != nil {
		slog.Error("failed to send message to Chrome", "error", err)
	}
}

func (s *Server) sendMCPStateToChrome(connected bool) {
	messageType := "mcp_disconnected"
	if connected {
		messageType = "mcp_connected"
	}
	s.sendToChrome(map[string]string{"type": messageType})
}

func (s *Server) healthSnapshot() map[string]interface{} {
	s.connMu.Lock()
	udsConnectionCount := len(s.udsConnections)
	authenticatedUDSConnectionCount := s.authenticatedUDSConnectionCountLocked()
	s.connMu.Unlock()

	s.stateMu.Lock()
	chromeReady := s.chromeReady
	lastChromeAt := s.lastChromeAt
	lastChromeErr := s.lastChromeErr
	startedAt := s.startedAt
	s.stateMu.Unlock()

	closed := false
	select {
	case <-s.closed:
		closed = true
	default:
	}

	response := map[string]interface{}{
		"type":                        "health_response",
		"ok":                          !closed,
		"pid":                         os.Getpid(),
		"socketPath":                  socketPath,
		"chromeReady":                 chromeReady && !closed,
		"udsConnections":              udsConnectionCount,
		"authenticatedUdsConnections": authenticatedUDSConnectionCount,
		"mcpConnected":                authenticatedUDSConnectionCount > 0,
		"startedAt":                   startedAt.UTC().Format(time.RFC3339Nano),
		"uptimeMs":                    time.Since(startedAt).Milliseconds(),
	}
	if !lastChromeAt.IsZero() {
		response["lastChromeMessageAt"] = lastChromeAt.UTC().Format(time.RFC3339Nano)
	}
	if lastChromeErr != "" {
		response["lastChromeError"] = lastChromeErr
	}
	return response
}

func (s *Server) handleUDSControlMessage(raw []byte, writer io.Writer) bool {
	var msg protocol.Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return false
	}

	switch msg.Type {
	case "health_check", "native_health":
		if err := protocol.SendMessage(writer, s.healthSnapshot()); err != nil {
			slog.Error("failed to send health response", "error", err)
		}
		return true
	default:
		return false
	}
}

func (s *Server) forwardToChrome(raw []byte, responseWriter io.Writer) {
	if !s.skipIdentitySync {
		s.identitySyncOnce.Do(func() {
			if !waitForInstallIDConfirmed(defaultIdentitySyncWait) {
				slog.Warn("analytics identity not yet synced, forwarding anyway")
			}
		})
	}

	// Serialize: only one request-response pair in flight at a time
	s.chromeMu.Lock()
	defer s.chromeMu.Unlock()

	logRaw := string(raw)
	if len(logRaw) > 500 {
		logRaw = logRaw[:500] + "...(truncated)"
	}
	slog.Debug("forwarding to Chrome", "message", logRaw)

	chromeWriter := s.chromeWriter
	if chromeWriter == nil {
		chromeWriter = os.Stdout
	}
	if err := protocol.SendMessage(chromeWriter, json.RawMessage(raw)); err != nil {
		slog.Error("failed to forward to Chrome", "error", err)
		sendToolError(responseWriter, fmt.Sprintf("forward error: %v", err))
		return
	}

	chromeTimeout := s.chromeTimeout
	if chromeTimeout <= 0 {
		chromeTimeout = defaultChromeResponseTimeout
	}
	chromeTimeout = chromeResponseTimeoutForRequest(raw, chromeTimeout)

	timer := time.NewTimer(chromeTimeout)
	defer timer.Stop()

	select {
	case response, ok := <-s.chromeCh:
		if !ok {
			slog.Error("Chrome channel closed")
			sendToolError(responseWriter, "chrome connection closed")
			return
		}
		if err := protocol.SendMessage(responseWriter, json.RawMessage(response)); err != nil {
			slog.Error("failed to send response to MCP", "error", err)
		}
	case <-timer.C:
		slog.Error("Chrome tool response timeout", "timeout", chromeTimeout)
		sendToolError(responseWriter, fmt.Sprintf("chrome extension did not respond to tool request within %s; reload the extension if this repeats", chromeTimeout))
		_ = s.Close()
	}
}

func chromeResponseTimeoutForRequest(raw []byte, fallback time.Duration) time.Duration {
	if fallback <= 0 {
		fallback = defaultChromeResponseTimeout
	}

	var req protocol.ToolRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return fallback
	}
	if req.Type != "tool_request" || req.Method != "execute_tool" {
		return fallback
	}
	if req.Params.Tool != "browser_batch" {
		return fallback
	}
	return bridge.BrowserBatchTimeout(req.Params.Args, fallback)
}

func (s *Server) handleChromeMessage(raw []byte, msg *protocol.Message) {
	logRaw := string(raw)
	if len(logRaw) > 500 {
		logRaw = logRaw[:500] + "...(truncated)"
	}
	slog.Debug("received from Chrome", "type", msg.Type, "message", logRaw)

	switch msg.Type {
	case "ping":
		s.sendToChrome(map[string]string{"type": "pong"})
	case "get_status":
		authenticatedUDSConnectionCount := s.authenticatedUDSConnectionCount()
		s.sendToChrome(map[string]interface{}{
			"type":                        "status_response",
			"mcpConnected":                authenticatedUDSConnectionCount > 0,
			"authenticatedUdsConnections": authenticatedUDSConnectionCount,
		})
	case "get_analytics_id":
		analytics.ConfirmInstallID()
		s.sendToChrome(map[string]string{
			"type":        "analytics_id_response",
			"distinct_id": analytics.GetOrCreateDistinctID(),
		})
	case "sync_analytics_id":
		var syncMsg struct {
			DistinctID string `json:"distinct_id"`
		}
		_ = json.Unmarshal(raw, &syncMsg)
		analytics.ConfirmInstallID()
		s.sendToChrome(map[string]string{
			"type":        "analytics_id_response",
			"distinct_id": analytics.AdoptInstallID(syncMsg.DistinctID),
		})
	case "notification":
		slog.Debug("notification", "method", msg.Method, "params", msg.Params)
	case "tool_request":
		handleIncomingToolRequest(raw, os.Stdout)
	default:
		slog.Warn("unknown message type", "type", msg.Type)
	}
}

func (s *Server) Close() error {
	s.closeOnce.Do(func() {
		close(s.closed)
		if s.udsListener != nil {
			s.udsListener.Close()
			// Note: Go's net.Listener.Close() for Unix domain sockets
			// automatically removes the socket file. We intentionally do
			// NOT call os.Remove(socketPath) here because it creates a
			// race condition: if a new process has already bound a new
			// socket at the same path, os.Remove would delete the NEW
			// socket, leaving the new process unreachable.
		}
		s.connMu.Lock()
		for conn := range s.udsConnections {
			_ = conn.Close()
		}
		s.connMu.Unlock()
	})
	return nil
}

func main() {
	analytics.EnsureInstallID()

	logFile, err := os.OpenFile("/tmp/chrome-native-host.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open log file: %v\n", err)
		os.Exit(1)
	}
	defer logFile.Close()

	logger := slog.New(slog.NewJSONHandler(logFile, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
	slog.SetDefault(logger)

	slog.Info("Chrome Native Host started", "mode", "dual-channel")

	server, err := NewServer()
	if err != nil {
		slog.Error("failed to create server", "error", err)
		os.Exit(1)
	}
	defer server.Close()

	token, err := udsauth.Generate()
	if err != nil {
		slog.Error("failed to generate UDS auth token", "error", err)
		os.Exit(1)
	}
	server.udsAuth = token
	if err := udsauth.WriteToken(token); err != nil {
		slog.Error("failed to write UDS auth token", "error", err)
		os.Exit(1)
	}
	slog.Info("UDS auth token written", "path", udsauth.TokenPath())

	// Handle signals for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		slog.Info("received shutdown signal")
		server.Close()
		os.Exit(0)
	}()

	if err := server.Run(); err != nil {
		slog.Error("server error", "error", err)
		os.Exit(1)
	}
}

// --- Helper functions ---

func handleIncomingToolRequest(raw []byte, writer io.Writer) {
	var req protocol.ToolRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		slog.Error("tool_request unmarshal error", "error", err)
		sendToolError(writer, fmt.Sprintf("invalid tool request: %v", err))
		return
	}
	slog.Debug("tool_request from extension", "method", req.Method, "tool", req.Params.Tool, "args", req.Params.Args)
	sendToolError(writer, fmt.Sprintf("tool not implemented: %s", req.Params.Tool))
}

func sendToolError(writer io.Writer, msg string) {
	protocol.SendMessage(writer, protocol.ToolResponseMsg{
		Type:  "tool_response",
		Error: &protocol.ContentWrap{Content: msg},
	})
}

func waitForInstallIDConfirmed(timeout time.Duration) bool {
	if analytics.IsInstallIDConfirmed() {
		return true
	}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
		if analytics.IsInstallIDConfirmed() {
			return true
		}
	}
	return false
}
