package fileserver

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestFileStorePutGet(t *testing.T) {
	s := NewFileStore(DefaultStoreConfig())
	defer s.Close()

	data := []byte("hello world")
	id, err := s.Put("test.txt", "text/plain", data)
	if err != nil {
		t.Fatalf("Put failed: %v", err)
	}
	if id == "" {
		t.Fatal("Put returned empty ID")
	}

	entry := s.Get(id)
	if entry == nil {
		t.Fatal("Get returned nil")
	}
	if entry.Filename != "test.txt" {
		t.Errorf("Filename = %q, want %q", entry.Filename, "test.txt")
	}
	if entry.MIMEType != "text/plain" {
		t.Errorf("MIMEType = %q, want %q", entry.MIMEType, "text/plain")
	}
	if entry.Size != int64(len(data)) {
		t.Errorf("Size = %d, want %d", entry.Size, len(data))
	}
	if !bytes.Equal(entry.Data, data) {
		t.Errorf("Data mismatch")
	}
}

func TestFileStoreDefensiveCopy(t *testing.T) {
	s := NewFileStore(DefaultStoreConfig())
	defer s.Close()

	original := []byte("original data")
	id, err := s.Put("test.txt", "text/plain", original)
	if err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	// Mutate the original slice after Put.
	original[0] = 'X'

	entry := s.Get(id)
	if entry == nil {
		t.Fatal("Get returned nil")
	}
	if entry.Data[0] == 'X' {
		t.Error("FileStore did not make a defensive copy — mutation leaked")
	}
}

func TestFileStoreGetMissing(t *testing.T) {
	s := NewFileStore(DefaultStoreConfig())
	defer s.Close()

	if entry := s.Get("nonexistent"); entry != nil {
		t.Errorf("Get(nonexistent) = %v, want nil", entry)
	}
}

func TestFileStoreDelete(t *testing.T) {
	s := NewFileStore(DefaultStoreConfig())
	defer s.Close()

	id, _ := s.Put("test.txt", "text/plain", []byte("data"))
	if !s.Delete(id) {
		t.Error("Delete returned false for existing file")
	}
	if s.Delete(id) {
		t.Error("Delete returned true for already-deleted file")
	}
	if entry := s.Get(id); entry != nil {
		t.Error("Get returned non-nil after Delete")
	}
}

func TestFileStoreMaxSize(t *testing.T) {
	cfg := StoreConfig{MaxFileSize: 100, TTL: time.Hour}
	s := NewFileStore(cfg)
	defer s.Close()

	_, err := s.Put("big.bin", "application/octet-stream", make([]byte, 101))
	if err != ErrFileTooLarge {
		t.Errorf("Put(101 bytes) error = %v, want ErrFileTooLarge", err)
	}

	// Exactly at limit should succeed.
	id, err := s.Put("ok.bin", "application/octet-stream", make([]byte, 100))
	if err != nil {
		t.Errorf("Put(100 bytes) failed: %v", err)
	}
	if id == "" {
		t.Error("Put returned empty ID")
	}
}

func TestFileStoreTTLExpiration(t *testing.T) {
	cfg := StoreConfig{MaxFileSize: DefaultMaxFileSize, TTL: 50 * time.Millisecond}
	s := NewFileStore(cfg)
	defer s.Close()

	id, _ := s.Put("expire.txt", "text/plain", []byte("temp"))

	// Should be accessible before expiration.
	if entry := s.Get(id); entry == nil {
		t.Fatal("Get returned nil before TTL")
	}

	time.Sleep(100 * time.Millisecond)

	// Should be nil after expiration.
	if entry := s.Get(id); entry != nil {
		t.Error("Get returned non-nil after TTL expired")
	}
}

func TestFileStoreEvictExpired(t *testing.T) {
	cfg := StoreConfig{MaxFileSize: DefaultMaxFileSize, TTL: 50 * time.Millisecond}
	s := NewFileStore(cfg)
	defer s.Close()

	s.Put("a.txt", "text/plain", []byte("a"))
	s.Put("b.txt", "text/plain", []byte("b"))

	time.Sleep(100 * time.Millisecond)
	s.evictExpired()

	if s.Count() != 0 {
		t.Errorf("Count after eviction = %d, want 0", s.Count())
	}
}

func TestFileStoreCount(t *testing.T) {
	s := NewFileStore(DefaultStoreConfig())
	defer s.Close()

	if s.Count() != 0 {
		t.Errorf("initial Count = %d", s.Count())
	}
	s.Put("a.txt", "text/plain", []byte("a"))
	s.Put("b.txt", "text/plain", []byte("b"))
	if s.Count() != 2 {
		t.Errorf("Count = %d, want 2", s.Count())
	}
}

func TestFileStoreCloseIdempotent(t *testing.T) {
	s := NewFileStore(DefaultStoreConfig())
	s.Close()
	s.Close() // should not panic
}

func TestGenerateIDUnique(t *testing.T) {
	seen := make(map[string]bool, 1000)
	for i := 0; i < 1000; i++ {
		id := generateID()
		if seen[id] {
			t.Fatalf("duplicate ID %q at iteration %d", id, i)
		}
		seen[id] = true
	}
}

func TestGenerateIDLength(t *testing.T) {
	id := generateID()
	if len(id) != 32 {
		t.Errorf("generateID() length = %d, want 32", len(id))
	}
	if strings.ContainsAny(id, "GHIJKLMNOPQRSTUVWXYZghijklmnopqrstuvwxyz") {
		t.Error("generateID() contains non-hex characters")
	}
}
