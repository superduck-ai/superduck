package fileserver

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxHeaderOverhead = 1024 // bytes of header/metadata overhead above MaxFileSize

// Server is a localhost-only HTTP file server with Bearer token auth.
type Server struct {
	store    *FileStore
	token    string
	listener net.Listener
	server   *http.Server
	baseURL  string
}

// NewServer creates a Server bound to 127.0.0.1 on a system-assigned port.
// The token is the Bearer auth credential (typically the udsauth session token).
func NewServer(store *FileStore, token string) (*Server, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen 127.0.0.1:0: %w", err)
	}

	s := &Server{
		store:    store,
		token:    token,
		listener: listener,
		baseURL:  fmt.Sprintf("http://127.0.0.1:%d", listener.Addr().(*net.TCPAddr).Port),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /f/{id}", s.handleGetFile)
	mux.HandleFunc("POST /f", s.handlePutFile)
	mux.HandleFunc("DELETE /f/{id}", s.handleDeleteFile)
	mux.HandleFunc("GET /health", s.handleHealth)

	s.server = &http.Server{
		Handler:        mux,
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   30 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB header limit
	}

	go func() {
		if err := s.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("fileserver serve error", "error", err)
		}
	}()

	slog.Info("fileserver started", "url", s.baseURL)
	return s, nil
}

// BaseURL returns the server's base URL (e.g. "http://127.0.0.1:54321").
func (s *Server) BaseURL() string {
	return s.baseURL
}

// Port returns the TCP port the server is listening on.
func (s *Server) Port() int {
	return s.listener.Addr().(*net.TCPAddr).Port
}

// Store returns the underlying FileStore.
func (s *Server) Store() *FileStore {
	return s.store
}

// Close gracefully shuts down the HTTP server with a 5-second timeout.
func (s *Server) Close() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.server.Shutdown(ctx)
}

// checkAuth validates the Bearer token from the Authorization header.
// Uses constant-time comparison to prevent timing attacks.
func (s *Server) checkAuth(r *http.Request) bool {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return false
	}
	provided := strings.TrimPrefix(auth, "Bearer ")
	return subtle.ConstantTimeCompare([]byte(provided), []byte(s.token)) == 1
}

// PutFileResponse is the JSON response from POST /f.
type PutFileResponse struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Size     int64  `json:"size"`
	Filename string `json:"filename"`
	MIMEType string `json:"mimeType"`
}

// handlePutFile stores a file uploaded via POST /f.
//
// Expected headers:
//
//	Authorization: Bearer <token>
//	X-Filename: <original filename>
//	Content-Type: <mime type>
//
// Body: raw file bytes (max 64 MB).
func (s *Server) handlePutFile(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(r) {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.store.config.MaxFileSize+maxHeaderOverhead)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "file too large")
			return
		}
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("read body: %v", err))
		return
	}

	filename := sanitizeFilename(r.Header.Get("X-Filename"))
	mimeType := r.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	id, err := s.store.Put(filename, mimeType, data)
	if err != nil {
		if errors.Is(err, ErrFileTooLarge) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "file too large")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := PutFileResponse{
		ID:       id,
		URL:      fmt.Sprintf("%s/f/%s", s.baseURL, id),
		Size:     int64(len(data)),
		Filename: filename,
		MIMEType: mimeType,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

// handleGetFile serves a stored file via GET /f/{id}.
func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(r) {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "missing file ID")
		return
	}

	entry := s.store.Get(id)
	if entry == nil {
		writeJSONError(w, http.StatusNotFound, "file not found or expired")
		return
	}

	w.Header().Set("Content-Type", entry.MIMEType)
	if entry.Filename != "" {
		safe := sanitizeHeaderValue(entry.Filename)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, safe))
	}
	w.Header().Set("Content-Length", fmt.Sprintf("%d", entry.Size))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(entry.Data)
}

// handleDeleteFile removes a stored file via DELETE /f/{id}.
func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	if !s.checkAuth(r) {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := r.PathValue("id")
	if !s.store.Delete(id) {
		writeJSONError(w, http.StatusNotFound, "file not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleHealth is a simple liveness check (no auth required).
func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":    true,
		"files": s.store.Count(),
	})
}

// WriteFileToDisk writes a stored file to the given path on disk.
// It validates that the target path is within the user's home directory
// to prevent path traversal attacks from CRX-supplied paths.
func (s *Server) WriteFileToDisk(id, targetPath string) error {
	entry := s.store.Get(id)
	if entry == nil {
		return errors.New("file not found or expired")
	}

	cleanPath, err := validateWritePath(targetPath)
	if err != nil {
		return err
	}

	if err := writeFileAtomic(cleanPath, entry.Data); err != nil {
		return fmt.Errorf("write file: %w", err)
	}
	return nil
}

// validateWritePath ensures the target path is safe to write to:
// - Must be absolute
// - No path traversal (..)
// - Must be within the user's home directory
func validateWritePath(p string) (string, error) {
	// Reject path traversal attempts before cleaning (Clean would resolve them).
	for _, seg := range strings.Split(filepath.ToSlash(p), "/") {
		if seg == ".." {
			return "", fmt.Errorf("path traversal rejected: %s", p)
		}
	}

	clean := filepath.Clean(p)

	if !filepath.IsAbs(clean) {
		return "", fmt.Errorf("path must be absolute: %s", p)
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	homeClean := filepath.Clean(home)
	if !strings.HasPrefix(clean, homeClean+string(filepath.Separator)) && clean != homeClean {
		return "", fmt.Errorf("path must be within home directory (%s): %s", homeClean, p)
	}

	return clean, nil
}

// writeFileAtomic writes data to path atomically by writing to a temp file
// first and renaming.
func writeFileAtomic(path string, data []byte) error {
	var b [4]byte
	_, _ = rand.Read(b[:])
	tmpPath := fmt.Sprintf("%s.tmp-%x", path, b[:])

	if err := writeFileWithDir(tmpPath, data); err != nil {
		return err
	}
	if err := renameFile(tmpPath, path); err != nil {
		_ = removeFile(tmpPath)
		return err
	}
	return nil
}

// These are package-level variables so tests can override them.
var (
	writeFileWithDir = func(path string, data []byte) error {
		dir := filepath.Dir(path)
		if err := mkdirAll(dir, 0o755); err != nil {
			return err
		}
		return writeFile(path, data, 0o644)
	}
	renameFile = func(old, newPath string) error {
		return rename(old, newPath)
	}
	removeFile = func(path string) error {
		return remove(path)
	}
	mkdirAll  = mkdirAllImpl
	writeFile = writeFileImpl
	rename    = renameImpl
	remove    = removeImpl
)

func mkdirAllImpl(path string, perm uint32) error {
	return mkdirAllOS(path, perm)
}

func writeFileImpl(path string, data []byte, perm uint32) error {
	return writeFileOS(path, data, perm)
}

func renameImpl(old, newPath string) error {
	return renameOS(old, newPath)
}

func removeImpl(path string) error {
	return removeOS(path)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func sanitizeFilename(name string) string {
	// Handle both Unix and Windows path separators.
	name = strings.ReplaceAll(name, "\\", "/")
	base := filepath.Base(name)
	if base == "." || base == ".." || base == "" {
		return "unnamed"
	}
	return base
}

func sanitizeHeaderValue(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	return s
}
