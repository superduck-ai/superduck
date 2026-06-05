package main

import (
	"net"
	"os"
	"path/filepath"
	"testing"
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

func shortTempDir(t *testing.T) string {
	t.Helper()

	dir, err := os.MkdirTemp("/tmp", "sd-sock-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	return dir
}
