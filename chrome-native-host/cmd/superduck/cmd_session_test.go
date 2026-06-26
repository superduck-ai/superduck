package main

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
)

func TestNewSessionID(t *testing.T) {
	t.Parallel()
	id, err := newSessionID()
	if err != nil {
		t.Fatalf("newSessionID() error = %v", err)
	}
	if !strings.HasPrefix(id, "cli:") {
		t.Fatalf("newSessionID() = %q, want cli: prefix", id)
	}
	if len(id) <= len("cli:") {
		t.Fatalf("newSessionID() = %q, want non-empty body", id)
	}
	other, _ := newSessionID()
	if other == id {
		t.Fatalf("newSessionID() returned the same id twice: %q", id)
	}
}

func TestCmdSessionNewOutput(t *testing.T) {
	original := gflags
	t.Cleanup(func() { gflags = original })
	gflags = globalFlags{}

	// Plain output: a single cli:-prefixed line.
	out := captureStdout(t, func() {
		if err := cmdSessionNew(nil); err != nil {
			t.Fatalf("cmdSessionNew() error = %v", err)
		}
	})
	id := strings.TrimSpace(out)
	if !strings.HasPrefix(id, "cli:") {
		t.Fatalf("plain output = %q, want cli: prefix", out)
	}

	// JSON output: {"session_id": "..."}.
	gflags.JSON = true
	out = captureStdout(t, func() {
		if err := cmdSessionNew(nil); err != nil {
			t.Fatalf("cmdSessionNew() error = %v", err)
		}
	})
	var parsed struct {
		SessionID string `json:"session_id"`
	}
	if err := json.Unmarshal([]byte(out), &parsed); err != nil {
		t.Fatalf("json output = %q, unmarshal error = %v", out, err)
	}
	if !strings.HasPrefix(parsed.SessionID, "cli:") {
		t.Fatalf("json session_id = %q, want cli: prefix", parsed.SessionID)
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	orig := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe() error = %v", err)
	}
	os.Stdout = w
	defer func() { os.Stdout = orig }()
	done := make(chan string)
	go func() {
		data, _ := io.ReadAll(r)
		done <- string(data)
	}()
	fn()
	w.Close()
	return <-done
}
