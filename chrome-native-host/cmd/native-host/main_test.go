package main

import (
	"bytes"
	"chrome-native-host/internal/protocol"
	"encoding/json"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPrepareSocketPathRemovesStaleSocket(t *testing.T) {
	t.Parallel()

	dir := shortTempDir(t)
	path := filepath.Join(dir, "stale.sock")

	// Create a real socket, then close it to make it stale
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	listener.Close()
	// Socket file still exists, but nothing is listening - it's stale

	if err := prepareSocketPath(path); err != nil {
		t.Fatalf("prepareSocketPath() error = %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("socket path still exists after stale cleanup: %v", err)
	}
}

func TestPrepareSocketPathRejectsRegularFile(t *testing.T) {
	t.Parallel()

	dir := shortTempDir(t)
	path := filepath.Join(dir, "not-a-socket.sock")
	if err := os.WriteFile(path, []byte("regular file"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Should fail because the path exists but is not a socket
	err := prepareSocketPath(path)
	if err == nil {
		t.Fatal("prepareSocketPath() should fail for regular file, got nil")
	}
	// File should still exist (we don't remove non-socket files)
	if _, statErr := os.Stat(path); statErr != nil {
		t.Fatalf("regular file should not be removed: %v", statErr)
	}
}

func TestPrepareSocketPathKeepsLiveSocket(t *testing.T) {
	t.Parallel()

	dir := shortTempDir(t)
	path := filepath.Join(dir, "live.sock")
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	if err := prepareSocketPath(path); err == nil {
		t.Fatal("prepareSocketPath() error = nil, want active socket error")
	}

	conn, err := net.Dial("unix", path)
	if err != nil {
		t.Fatalf("live socket was removed or broken: %v", err)
	}
	conn.Close()
}

func TestForwardToChromeTimesOutWhenExtensionDoesNotRespond(t *testing.T) {
	t.Parallel()

	var chromeOut bytes.Buffer
	var clientOut bytes.Buffer
	server := &Server{
		chromeCh:         make(chan []byte, 1),
		chromeWriter:     &chromeOut,
		chromeTimeout:    10 * time.Millisecond,
		skipIdentitySync: true,
		closed:           make(chan struct{}),
	}

	raw := []byte(`{"type":"tool_request","method":"execute_tool","params":{"tool":"superduck_list_tabs","args":{},"client_id":"superduck-cli"}}`)
	server.forwardToChrome(raw, &clientOut)

	forwarded, err := protocol.ReadMessage(&chromeOut)
	if err != nil {
		t.Fatalf("failed to read forwarded message: %v", err)
	}
	if string(forwarded) != string(raw) {
		t.Fatalf("forwarded message mismatch: got %s want %s", forwarded, raw)
	}

	responseRaw, err := protocol.ReadMessage(&clientOut)
	if err != nil {
		t.Fatalf("failed to read timeout response: %v", err)
	}
	var response protocol.ToolResponseMsg
	if err := json.Unmarshal(responseRaw, &response); err != nil {
		t.Fatalf("failed to parse timeout response: %v", err)
	}
	if response.Error == nil {
		t.Fatalf("expected error response, got %s", responseRaw)
	}
	content, ok := response.Error.Content.(string)
	if !ok || !strings.Contains(content, "did not respond to tool request") {
		t.Fatalf("unexpected timeout content: %#v", response.Error.Content)
	}
	select {
	case <-server.closed:
	case <-time.After(time.Second):
		t.Fatal("server was not closed after Chrome response timeout")
	}
}

func TestHandleUDSControlMessageRespondsToHealthCheckLocally(t *testing.T) {
	t.Parallel()

	var clientOut bytes.Buffer
	server := &Server{
		udsConnections: make(map[net.Conn]bool),
		closed:         make(chan struct{}),
		startedAt:      time.Now(),
		chromeReady:    true,
	}

	raw := []byte(`{"type":"health_check"}`)
	if !server.handleUDSControlMessage(raw, &clientOut) {
		t.Fatal("health_check was not handled locally")
	}

	responseRaw, err := protocol.ReadMessage(&clientOut)
	if err != nil {
		t.Fatalf("failed to read health response: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(responseRaw, &response); err != nil {
		t.Fatalf("failed to parse health response: %v", err)
	}
	if response["type"] != "health_response" {
		t.Fatalf("response type = %v, want health_response", response["type"])
	}
	if response["ok"] != true {
		t.Fatalf("response ok = %v, want true", response["ok"])
	}
	if response["chromeReady"] != true {
		t.Fatalf("response chromeReady = %v, want true", response["chromeReady"])
	}
	if _, ok := response["pid"].(float64); !ok {
		t.Fatalf("response pid has type %T, want number", response["pid"])
	}
}

func TestControlHealthConnectionDoesNotCountAsMCPConnected(t *testing.T) {
	t.Parallel()

	clientConn, serverConn := net.Pipe()
	defer clientConn.Close()
	_ = clientConn.SetDeadline(time.Now().Add(time.Second))

	var chromeOut bytes.Buffer
	server := &Server{
		udsAuth: "test-token",
		udsConnections: map[net.Conn]bool{
			serverConn: false,
		},
		chromeWriter: &chromeOut,
		closed:       make(chan struct{}),
		startedAt:    time.Now(),
		chromeReady:  true,
	}

	done := make(chan struct{})
	go func() {
		server.handleUDSConnection(serverConn)
		close(done)
	}()

	if err := protocol.SendMessage(clientConn, map[string]string{
		"type":    "auth",
		"token":   "test-token",
		"purpose": "control",
	}); err != nil {
		t.Fatalf("failed to send auth: %v", err)
	}
	if _, err := protocol.ReadMessage(clientConn); err != nil {
		t.Fatalf("failed to read auth response: %v", err)
	}

	if err := protocol.SendMessage(clientConn, map[string]string{"type": "health_check"}); err != nil {
		t.Fatalf("failed to send health check: %v", err)
	}
	responseRaw, err := protocol.ReadMessage(clientConn)
	if err != nil {
		t.Fatalf("failed to read health response: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(responseRaw, &response); err != nil {
		t.Fatalf("failed to parse health response: %v", err)
	}
	if response["mcpConnected"] != false {
		t.Fatalf("response mcpConnected = %v, want false", response["mcpConnected"])
	}
	if response["authenticatedUdsConnections"] != float64(0) {
		t.Fatalf("response authenticatedUdsConnections = %v, want 0", response["authenticatedUdsConnections"])
	}

	clientConn.Close()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("control connection did not close")
	}
	if chromeOut.Len() != 0 {
		t.Fatalf("control connection wrote unexpected Chrome state message: %q", chromeOut.String())
	}
}

func TestHandleChromeGetStatusReportsAuthenticatedUDSState(t *testing.T) {
	t.Parallel()

	var chromeOut bytes.Buffer
	clientConn, peerConn := net.Pipe()
	defer clientConn.Close()
	defer peerConn.Close()

	server := &Server{
		udsConnections: map[net.Conn]bool{
			clientConn: true,
		},
		chromeWriter: &chromeOut,
		closed:       make(chan struct{}),
		startedAt:    time.Now(),
	}

	server.handleChromeMessage([]byte(`{"type":"get_status"}`), &protocol.Message{Type: "get_status"})

	responseRaw, err := protocol.ReadMessage(&chromeOut)
	if err != nil {
		t.Fatalf("failed to read status response: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(responseRaw, &response); err != nil {
		t.Fatalf("failed to parse status response: %v", err)
	}
	if response["type"] != "status_response" {
		t.Fatalf("response type = %v, want status_response", response["type"])
	}
	if response["mcpConnected"] != true {
		t.Fatalf("response mcpConnected = %v, want true", response["mcpConnected"])
	}
	if response["authenticatedUdsConnections"] != float64(1) {
		t.Fatalf("response authenticatedUdsConnections = %v, want 1", response["authenticatedUdsConnections"])
	}
	if chromeOut.Len() != 0 {
		t.Fatalf("get_status wrote extra native-host messages after status_response")
	}
}

func TestHandleUDSControlMessageIgnoresToolRequests(t *testing.T) {
	t.Parallel()

	server := &Server{
		closed:    make(chan struct{}),
		startedAt: time.Now(),
	}
	raw := []byte(`{"type":"tool_request","method":"execute_tool","params":{"tool":"superduck_list_tabs","args":{}}}`)
	if server.handleUDSControlMessage(raw, io.Discard) {
		t.Fatal("tool_request should be forwarded to Chrome, not handled locally")
	}
}

func TestDefaultChromeResponseTimeoutExceedsExtensionToolRequestTimeout(t *testing.T) {
	t.Parallel()

	const minExtensionTimeout = 35 * time.Second

	if defaultChromeResponseTimeout <= minExtensionTimeout {
		t.Fatalf(
			"defaultChromeResponseTimeout = %s, want more than %s to stay above extension timeout",
			defaultChromeResponseTimeout,
			minExtensionTimeout,
		)
	}
}

func TestChromeResponseTimeoutForBrowserBatchScalesWithActionCount(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"type":"tool_request","method":"execute_tool","params":{"tool":"browser_batch","args":{"actions":[{"tool":"computer"},{"tool":"computer"},{"tool":"computer"}]}}}`)

	timeout := chromeResponseTimeoutForRequest(raw, defaultChromeResponseTimeout)
	want := defaultChromeResponseTimeout + 45*time.Second
	if timeout != want {
		t.Fatalf("chromeResponseTimeoutForRequest() = %s, want %s", timeout, want)
	}
}

func TestChromeResponseTimeoutForNonBatchUsesFallback(t *testing.T) {
	t.Parallel()

	raw := []byte(`{"type":"tool_request","method":"execute_tool","params":{"tool":"computer","args":{"action":"wait","duration":30}}}`)

	timeout := chromeResponseTimeoutForRequest(raw, defaultChromeResponseTimeout)
	if timeout != defaultChromeResponseTimeout {
		t.Fatalf(
			"chromeResponseTimeoutForRequest() = %s, want %s",
			timeout,
			defaultChromeResponseTimeout,
		)
	}
}

// TestPrepareSocketPathRaceWithShutdown simulates the race where the old
// process is shutting down: first dial succeeds (old process still listening),
// but by the time prepareSocketPath retries (after 500ms), the old process
// has exited and the socket is stale.
func TestPrepareSocketPathRaceWithShutdown(t *testing.T) {
	t.Parallel()

	dir := shortTempDir(t)
	path := filepath.Join(dir, "race.sock")

	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}

	// Close the listener after 200ms — simulating the old process
	// exiting during prepareSocketPath's 500ms wait. Don't remove the
	// socket file: it stays on disk as a stale socket (connection refused).
	go func() {
		<-time.After(200 * time.Millisecond)
		listener.Close()
	}()

	// prepareSocketPath should: first dial succeeds → wait 500ms →
	// second dial fails (listener closed) → treat as stale → succeed.
	if err := prepareSocketPath(path); err != nil {
		t.Fatalf("prepareSocketPath() should succeed after old process exits, got: %v", err)
	}

	// Socket file should be cleaned up
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("stale socket path should be removed, stat err: %v", err)
	}
}

func shortTempDir(t *testing.T) string {
	t.Helper()

	dir, err := os.MkdirTemp("/tmp", "sd-sock-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	return dir
}
