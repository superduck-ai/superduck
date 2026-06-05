package main

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"chrome-native-host/internal/protocol"
)

// helper: client goroutine that sends auth and reads response
func clientAuthWithResponse(clientConn net.Conn, msg map[string]string, respCh chan<- map[string]string) {
	_ = protocol.SendMessage(clientConn, msg)
	raw, err := protocol.ReadMessage(clientConn)
	if err != nil {
		respCh <- map[string]string{"error": err.Error()}
		return
	}
	var resp map[string]string
	_ = json.Unmarshal(raw, &resp)
	respCh <- resp
}

func TestAuthenticateUDSClient_InvalidToken(t *testing.T) {
	validToken := "valid-token-123"
	server := &Server{udsAuth: validToken}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	// Client sends invalid token and reads response (to avoid deadlock)
	respCh := make(chan map[string]string, 1)
	go clientAuthWithResponse(clientConn, map[string]string{"type": "auth", "token": "wrong-token"}, respCh)

	err := server.authenticateUDSClient(serverConn)
	if err == nil {
		t.Fatal("expected authentication to fail with invalid token")
	}
	if !strings.Contains(err.Error(), "invalid auth token") {
		t.Errorf("expected 'invalid auth token' error, got: %v", err)
	}

	// Verify client received error response
	select {
	case resp := <-respCh:
		if resp["error"] != "authentication failed" {
			t.Errorf("expected client to receive 'authentication failed', got: %v", resp)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for client response")
	}
}

func TestAuthenticateUDSClient_MalformedJSON(t *testing.T) {
	server := &Server{udsAuth: "valid-token"}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	// Client sends invalid JSON (raw bytes that aren't valid JSON)
	go func() {
		// Send a string that isn't a valid JSON object (will fail unmarshal into struct)
		_ = protocol.SendMessage(clientConn, "this is not a json object")
	}()

	err := server.authenticateUDSClient(serverConn)
	if err == nil {
		t.Fatal("expected authentication to fail with malformed JSON")
	}
}

func TestAuthenticateUDSClient_MissingType(t *testing.T) {
	server := &Server{udsAuth: "valid-token"}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	// Client sends auth without type field and reads response to avoid deadlock
	respCh := make(chan map[string]string, 1)
	go clientAuthWithResponse(clientConn, map[string]string{"token": "valid-token"}, respCh)

	err := server.authenticateUDSClient(serverConn)
	if err == nil {
		t.Fatal("expected authentication to fail without type field")
	}
}

func TestAuthenticateUDSClient_WrongType(t *testing.T) {
	server := &Server{udsAuth: "valid-token"}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	// Send a message with wrong type
	respCh := make(chan map[string]string, 1)
	go clientAuthWithResponse(clientConn, map[string]string{"type": "tool_request", "token": "valid-token"}, respCh)

	err := server.authenticateUDSClient(serverConn)
	if err == nil {
		t.Fatal("expected authentication to fail with wrong type")
	}
}

func TestAuthenticateUDSClient_ValidToken(t *testing.T) {
	validToken := "valid-token-456"
	server := &Server{udsAuth: validToken}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	respCh := make(chan map[string]string, 1)
	go clientAuthWithResponse(clientConn, map[string]string{"type": "auth", "token": validToken}, respCh)

	err := server.authenticateUDSClient(serverConn)
	if err != nil {
		t.Fatalf("expected authentication to succeed, got: %v", err)
	}

	// Verify client received ok response
	select {
	case resp := <-respCh:
		if resp["ok"] != "true" {
			t.Errorf("expected ok=true, got: %v", resp)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for client response")
	}
}

func TestAuthenticateUDSClient_ClientDisconnects(t *testing.T) {
	server := &Server{udsAuth: "valid-token"}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()

	// Client disconnects immediately without sending anything
	clientConn.Close()

	err := server.authenticateUDSClient(serverConn)
	if err == nil {
		t.Fatal("expected authentication to fail when client disconnects")
	}
}

func TestAuthenticateUDSClient_EmptyMessage(t *testing.T) {
	server := &Server{udsAuth: "valid-token"}

	serverConn, clientConn := net.Pipe()
	defer serverConn.Close()
	defer clientConn.Close()

	// Send an empty JSON object
	respCh := make(chan map[string]string, 1)
	go clientAuthWithResponse(clientConn, map[string]string{}, respCh)

	err := server.authenticateUDSClient(serverConn)
	if err == nil {
		t.Fatal("expected authentication to fail with empty message")
	}
}

// Integration-style test: full server auth flow
func TestServerAuthFlow_Integration(t *testing.T) {
	tmpDir := t.TempDir()
	sockPath := filepath.Join(tmpDir, "test.sock")

	// Create a real UDS listener
	listener, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer listener.Close()
	defer os.Remove(sockPath)

	validToken := "integration-test-token"
	server := &Server{
		udsAuth:        validToken,
		udsConnections: make(map[net.Conn]bool),
		closed:         make(chan struct{}),
	}

	// Accept one connection in background
	serverDone := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			serverDone <- err
			return
		}
		serverDone <- server.authenticateUDSClient(conn)
	}()

	// Client connects and authenticates
	clientConn, err := net.Dial("unix", sockPath)
	if err != nil {
		t.Fatalf("failed to dial: %v", err)
	}
	defer clientConn.Close()

	authReq := map[string]string{"type": "auth", "token": validToken}
	if err := protocol.SendMessage(clientConn, authReq); err != nil {
		t.Fatalf("failed to send auth: %v", err)
	}

	// Read response
	raw, err := protocol.ReadMessage(clientConn)
	if err != nil {
		t.Fatalf("failed to read response: %v", err)
	}

	var resp map[string]string
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["ok"] != "true" {
		t.Errorf("expected ok=true, got: %v", resp)
	}

	// Verify server side also succeeded
	select {
	case err := <-serverDone:
		if err != nil {
			t.Errorf("server auth failed: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for server auth")
	}
}
