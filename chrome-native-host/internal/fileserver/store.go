// Package fileserver provides a localhost HTTP server that bridges file
// transfers between the native host (CLI/MCP) and the Chrome extension.
//
// Architecture:
//
//	CLI/MCP ──UDS──▶ native host ──stdin──▶ CRX: { type: "file_ready", url }
//	                       │                       │
//	                       ▼                       ▼
//	                 fileserver              CRX fetch(url)
//	               (127.0.0.1:PORT)         ◀── HTTP GET ──
//
// Security:
//   - Binds 127.0.0.1 only (not reachable from network)
//   - Bearer token auth reusing the udsauth session token
//   - Per-file TTL to prevent unbounded memory growth
//   - Max file size cap (64 MB, matching Chrome CRX→host limit)
package fileserver

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	// DefaultMaxFileSize is the maximum size of a single stored file (64 MB).
	DefaultMaxFileSize = 64 << 20

	// DefaultTTL is how long a file stays in memory before automatic cleanup.
	DefaultTTL = 1 * time.Hour

	// CleanupInterval is how often the background goroutine scans for expired files.
	CleanupInterval = 5 * time.Minute
)

// FileEntry is a stored file with metadata and expiration.
type FileEntry struct {
	ID        string
	Filename  string
	MIMEType  string
	Size      int64
	Data      []byte
	CreatedAt time.Time
	ExpiresAt time.Time
}

// StoreConfig configures a FileStore.
type StoreConfig struct {
	MaxFileSize int64
	TTL         time.Duration
}

// DefaultStoreConfig returns a StoreConfig with production defaults.
func DefaultStoreConfig() StoreConfig {
	return StoreConfig{
		MaxFileSize: DefaultMaxFileSize,
		TTL:         DefaultTTL,
	}
}

// FileStore is a concurrent-safe in-memory file store with TTL expiration.
type FileStore struct {
	mu      sync.RWMutex
	files   map[string]*FileEntry
	config  StoreConfig
	stopCh  chan struct{}
	stopped bool
}

// NewFileStore creates a FileStore and starts the background cleanup goroutine.
func NewFileStore(cfg StoreConfig) *FileStore {
	s := &FileStore{
		files:  make(map[string]*FileEntry),
		config: cfg,
		stopCh: make(chan struct{}),
	}
	go s.cleanupLoop()
	return s
}

// Put stores a file and returns its unique ID. Returns an error if the data
// exceeds MaxFileSize.
func (s *FileStore) Put(filename, mimeType string, data []byte) (string, error) {
	if int64(len(data)) > s.config.MaxFileSize {
		return "", ErrFileTooLarge
	}
	id := generateID()
	now := time.Now()
	entry := &FileEntry{
		ID:        id,
		Filename:  filename,
		MIMEType:  mimeType,
		Size:      int64(len(data)),
		Data:      append([]byte(nil), data...), // defensive copy
		CreatedAt: now,
		ExpiresAt: now.Add(s.config.TTL),
	}
	s.mu.Lock()
	s.files[id] = entry
	s.mu.Unlock()
	return id, nil
}

// Get retrieves a file by ID. Returns nil if not found or expired.
func (s *FileStore) Get(id string) *FileEntry {
	s.mu.RLock()
	entry, ok := s.files[id]
	s.mu.RUnlock()
	if !ok {
		return nil
	}
	if time.Now().After(entry.ExpiresAt) {
		s.mu.Lock()
		// Re-check under write lock to avoid TOCTOU: another goroutine
		// may have already deleted this entry.
		if e, exists := s.files[id]; exists && time.Now().After(e.ExpiresAt) {
			delete(s.files, id)
		}
		s.mu.Unlock()
		return nil
	}
	return entry
}

// Delete removes a file by ID. Returns true if the file existed.
func (s *FileStore) Delete(id string) bool {
	s.mu.Lock()
	_, ok := s.files[id]
	if ok {
		delete(s.files, id)
	}
	s.mu.Unlock()
	return ok
}

// Count returns the number of stored files (including not-yet-cleaned expired ones).
func (s *FileStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.files)
}

// Close stops the background cleanup goroutine. Safe to call multiple times.
func (s *FileStore) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.stopped {
		s.stopped = true
		close(s.stopCh)
	}
}

// cleanupLoop runs periodically to evict expired entries.
func (s *FileStore) cleanupLoop() {
	ticker := time.NewTicker(CleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.evictExpired()
		case <-s.stopCh:
			return
		}
	}
}

// evictExpired removes all entries past their ExpiresAt.
func (s *FileStore) evictExpired() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, entry := range s.files {
		if now.After(entry.ExpiresAt) {
			delete(s.files, id)
		}
	}
}

// ErrFileTooLarge is returned when a file exceeds MaxFileSize.
var ErrFileTooLarge = errors.New("file exceeds maximum size")

func generateID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	return hex.EncodeToString(b[:])
}
