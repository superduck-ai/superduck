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
	if err := os.WriteFile(path, []byte("stale"), 0o600); err != nil {
		t.Fatal(err)
	}

	if err := prepareSocketPath(path); err != nil {
		t.Fatalf("prepareSocketPath() error = %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("socket path still exists after stale cleanup: %v", err)
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
