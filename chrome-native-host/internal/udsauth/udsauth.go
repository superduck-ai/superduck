// Package udsauth implements per-session UDS authentication shared between
// the native-host server (which generates and writes the token at startup)
// and CLI/MCP clients (which read the token to authenticate on connect).
package udsauth

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

// TokenFileName is the basename of the per-session auth token file inside
// the user's ~/.superduck directory.
const TokenFileName = "uds-token"

// TokenPath returns the absolute path to the auth token file. Returns an
// empty string if the user's home directory cannot be determined.
func TokenPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".superduck", TokenFileName)
}

// Generate returns a fresh 256-bit cryptographically random token encoded
// as 64 hex characters.
func Generate() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("crypto/rand: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

// WriteToken atomically creates ~/.superduck (mode 0700) if needed and
// writes the given token to TokenFileName with mode 0600.
func WriteToken(token string) error {
	path := TokenPath()
	if path == "" {
		return errors.New("cannot determine home directory")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("mkdir %s: %w", dir, err)
	}
	// Tighten permissions on existing directory
	if err := os.Chmod(dir, 0o700); err != nil {
		slog.Warn("failed to tighten token directory permissions", "path", dir, "error", err)
	}
	// Write to temp file first, then atomically rename
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, []byte(token), 0o600); err != nil {
		return fmt.Errorf("write temp token: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("rename token: %w", err)
	}
	return nil
}

// ReadToken returns the token previously written by WriteToken. The
// returned value is whitespace-trimmed; an empty token after trimming
// is reported as an error.
func ReadToken() (string, error) {
	path := TokenPath()
	if path == "" {
		return "", errors.New("cannot determine home directory")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	token := string(bytes.TrimSpace(data))
	if token == "" {
		return "", fmt.Errorf("empty auth token in %s", path)
	}
	return token, nil
}
