package main

import (
	"chrome-native-host/internal/protocol"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
)

const (
	socketPath = "/tmp/chrome-native-host.sock"
)

// --- Server with dual channels ---

type Server struct {
	udsListener    net.Listener
	udsConnections map[net.Conn]bool
	connMu         sync.Mutex
	closed         chan struct{}
	closeOnce      sync.Once

	// Chrome stdio is single-threaded: one goroutine reads stdin,
	// responses are routed back via chromeCh.
	// chromeMu serializes request-response pairs to Chrome.
	chromeMu sync.Mutex
	chromeCh chan []byte
}

func NewServer() (*Server, error) {
	os.Remove(socketPath)

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create UDS listener: %w", err)
	}

	slog.Info("UDS server listening", "path", socketPath)

	return &Server{
		udsListener:    listener,
		udsConnections: make(map[net.Conn]bool),
		chromeCh:       make(chan []byte, 1),
		closed:         make(chan struct{}),
	}, nil
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
		s.udsConnections[conn] = true
		s.connMu.Unlock()

		go s.handleUDSConnection(conn)
	}
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
	logFile, err := os.OpenFile("/tmp/chrome-native-host.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
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
