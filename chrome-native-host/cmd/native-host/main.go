package main

import (
	"chrome-native-host/internal/analytics"
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
	"sync"
	"syscall"
	"time"
)

const (
	socketPath = "/tmp/chrome-native-host.sock"
)

const identitySyncWait = 2 * time.Second

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

	// Chrome stdio is single-threaded: one goroutine reads stdin,
	// responses are routed back via chromeCh.
	// chromeMu serializes request-response pairs to Chrome.
	chromeMu         sync.Mutex
	chromeCh         chan []byte
	identitySyncOnce sync.Once
}

func NewServer() (*Server, error) {
	if err := prepareSocketPath(socketPath); err != nil {
		return nil, err
	}

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
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
		closed:         make(chan struct{}),
	}, nil
}

func prepareSocketPath(path string) error {
	if _, err := os.Lstat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to stat UDS socket: %w", err)
	}

	conn, err := net.DialTimeout("unix", path, 200*time.Millisecond)
	if err == nil {
		_ = conn.Close()
		return fmt.Errorf("chrome-native-host already listening at %s", path)
	}

	if err := os.Remove(path); err != nil {
		return fmt.Errorf("failed to remove stale UDS socket: %w", err)
	}
	return nil
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
		s.udsConnections[conn] = true
		s.connMu.Unlock()

		go s.handleUDSConnection(conn)
	}
}

func (s *Server) authenticateUDSClient(conn net.Conn) error {
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	raw, err := protocol.ReadMessage(conn)
	if err != nil {
		return fmt.Errorf("auth read: %w", err)
	}
	_ = conn.SetReadDeadline(time.Time{})
	var auth struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &auth); err != nil {
		return fmt.Errorf("auth parse: %w", err)
	}
	if auth.Type != "auth" || auth.Token != s.udsAuth {
		_ = protocol.SendMessage(conn, map[string]string{
			"type":  "auth_response",
			"error": "authentication failed",
		})
		return errors.New("invalid auth token")
	}
	_ = protocol.SendMessage(conn, map[string]string{"type": "auth_response", "ok": "true"})
	return nil
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
			close(s.chromeCh)
			s.Close()
			return
		}

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
		s.connMu.Lock()
		delete(s.udsConnections, conn)
		s.connMu.Unlock()
		conn.Close()
	}()

	slog.Debug("new UDS connection from MCP server")

	if err := s.authenticateUDSClient(conn); err != nil {
		slog.Warn("UDS authentication failed", "error", err)
		return
	}
	slog.Debug("UDS client authenticated")

	for {
		raw, err := protocol.ReadMessage(conn)
		if err != nil {
			if err != io.EOF {
				slog.Error("UDS read error", "error", err)
			}
			return
		}

		// Forward to Chrome and send response back
		s.forwardToChrome(raw, conn)
	}
}

func (s *Server) forwardToChrome(raw []byte, responseWriter io.Writer) {
	s.identitySyncOnce.Do(func() {
		if !waitForInstallIDConfirmed(identitySyncWait) {
			slog.Warn("analytics identity not yet synced, forwarding anyway")
		}
	})

	// Serialize: only one request-response pair in flight at a time
	s.chromeMu.Lock()
	defer s.chromeMu.Unlock()

	logRaw := string(raw)
	if len(logRaw) > 500 {
		logRaw = logRaw[:500] + "...(truncated)"
	}
	slog.Debug("forwarding to Chrome", "message", logRaw)

	// Send to Chrome via stdout
	if err := protocol.SendMessage(os.Stdout, json.RawMessage(raw)); err != nil {
		slog.Error("failed to forward to Chrome", "error", err)
		sendToolError(responseWriter, fmt.Sprintf("forward error: %v", err))
		return
	}

	// Wait for response from readChromeStdio via channel
	response, ok := <-s.chromeCh
	if !ok {
		slog.Error("Chrome channel closed")
		sendToolError(responseWriter, "chrome connection closed")
		return
	}

	// Send response back to MCP via UDS
	if err := protocol.SendMessage(responseWriter, json.RawMessage(response)); err != nil {
		slog.Error("failed to send response to MCP", "error", err)
	}
}

func (s *Server) handleChromeMessage(raw []byte, msg *protocol.Message) {
	logRaw := string(raw)
	if len(logRaw) > 500 {
		logRaw = logRaw[:500] + "...(truncated)"
	}
	slog.Debug("received from Chrome", "type", msg.Type, "message", logRaw)

	switch msg.Type {
	case "ping":
		protocol.SendMessage(os.Stdout, map[string]string{"type": "pong"})
	case "get_status":
		protocol.SendMessage(os.Stdout, map[string]string{"type": "mcp_connected"})
		protocol.SendMessage(os.Stdout, map[string]string{"type": "status_response"})
	case "get_analytics_id":
		analytics.ConfirmInstallID()
		protocol.SendMessage(os.Stdout, map[string]string{
			"type":        "analytics_id_response",
			"distinct_id": analytics.GetOrCreateDistinctID(),
		})
	case "sync_analytics_id":
		var syncMsg struct {
			DistinctID string `json:"distinct_id"`
		}
		_ = json.Unmarshal(raw, &syncMsg)
		analytics.ConfirmInstallID()
		protocol.SendMessage(os.Stdout, map[string]string{
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
		}
		s.connMu.Lock()
		for conn := range s.udsConnections {
			_ = conn.Close()
		}
		s.connMu.Unlock()
		_ = os.Remove(socketPath)
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
