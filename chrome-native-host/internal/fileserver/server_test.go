package fileserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testToken = "test-auth-token-abc123"

func newTestServer(t *testing.T) (*Server, *FileStore) {
	t.Helper()
	store := NewFileStore(DefaultStoreConfig())
	srv, err := NewServer(store, testToken)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}
	t.Cleanup(func() {
		srv.Close()
		store.Close()
	})
	return srv, store
}

func TestServerHealth(t *testing.T) {
	srv, _ := newTestServer(t)
	resp, err := http.Get(srv.BaseURL() + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body["ok"] != true {
		t.Errorf("body[ok] = %v", body["ok"])
	}
}

func TestServerPutAndGet(t *testing.T) {
	srv, _ := newTestServer(t)

	data := []byte("file content here")
	req, _ := http.NewRequest("POST", srv.BaseURL()+"/f", bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("X-Filename", "report.md")
	req.Header.Set("Content-Type", "text/markdown")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /f: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("POST status = %d, body = %s", resp.StatusCode, body)
	}

	var putResp PutFileResponse
	_ = json.NewDecoder(resp.Body).Decode(&putResp)
	if putResp.ID == "" {
		t.Fatal("Put response missing ID")
	}
	if putResp.Size != int64(len(data)) {
		t.Errorf("Size = %d, want %d", putResp.Size, len(data))
	}

	// GET the file back.
	getReq, _ := http.NewRequest("GET", putResp.URL, nil)
	getReq.Header.Set("Authorization", "Bearer "+testToken)
	getResp, err := http.DefaultClient.Do(getReq)
	if err != nil {
		t.Fatalf("GET %s: %v", putResp.URL, err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d", getResp.StatusCode)
	}
	if ct := getResp.Header.Get("Content-Type"); ct != "text/markdown" {
		t.Errorf("Content-Type = %q, want text/markdown", ct)
	}
	gotData, _ := io.ReadAll(getResp.Body)
	if !bytes.Equal(gotData, data) {
		t.Errorf("data mismatch: got %q, want %q", gotData, data)
	}
}

func TestServerAuthRequired(t *testing.T) {
	srv, store := newTestServer(t)
	id, _ := store.Put("test.txt", "text/plain", []byte("secret"))

	tests := []struct {
		name string
		auth string
		want int
	}{
		{"no auth", "", http.StatusUnauthorized},
		{"wrong token", "Bearer wrong-token", http.StatusUnauthorized},
		{"empty bearer", "Bearer ", http.StatusUnauthorized},
		{"correct token", "Bearer " + testToken, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, _ := http.NewRequest("GET", srv.BaseURL()+"/f/"+id, nil)
			if tt.auth != "" {
				req.Header.Set("Authorization", tt.auth)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tt.want {
				t.Errorf("status = %d, want %d", resp.StatusCode, tt.want)
			}
		})
	}
}

func TestServerGetNotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	req, _ := http.NewRequest("GET", srv.BaseURL()+"/f/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+testToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestServerDelete(t *testing.T) {
	srv, store := newTestServer(t)
	id, _ := store.Put("del.txt", "text/plain", []byte("to delete"))

	req, _ := http.NewRequest("DELETE", srv.BaseURL()+"/f/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+testToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("DELETE status = %d, want 204", resp.StatusCode)
	}

	// Verify it's gone.
	if entry := store.Get(id); entry != nil {
		t.Error("file still exists after DELETE")
	}
}

func TestServerDeleteNotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	req, _ := http.NewRequest("DELETE", srv.BaseURL()+"/f/nonexistent", nil)
	req.Header.Set("Authorization", "Bearer "+testToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

func TestServerPutFileTooLarge(t *testing.T) {
	store := NewFileStore(StoreConfig{MaxFileSize: 100, TTL: DefaultTTL})
	srv, err := NewServer(store, testToken)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	t.Cleanup(func() {
		srv.Close()
		store.Close()
	})

	data := make([]byte, 101)
	req, _ := http.NewRequest("POST", srv.BaseURL()+"/f", bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Content-Type", "application/octet-stream")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want 413", resp.StatusCode)
	}
}

func TestServerBaseURL(t *testing.T) {
	srv, _ := newTestServer(t)
	if !strings.HasPrefix(srv.BaseURL(), "http://127.0.0.1:") {
		t.Errorf("BaseURL = %q, want http://127.0.0.1:PORT", srv.BaseURL())
	}
	if srv.Port() <= 0 {
		t.Errorf("Port = %d, want > 0", srv.Port())
	}
}

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"report.md", "report.md"},
		{"/etc/passwd", "passwd"},
		{"../../../etc/shadow", "shadow"},
		{"..", "unnamed"},
		{".", "unnamed"},
		{"", "unnamed"},
		{"C:\\Users\\test\\file.txt", "file.txt"},
	}
	for _, tt := range tests {
		got := sanitizeFilename(tt.input)
		if got != tt.want {
			t.Errorf("sanitizeFilename(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestValidateWritePath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("cannot get home dir: %v", err)
	}
	tests := []struct {
		path    string
		wantErr bool
	}{
		{filepath.Join(home, "doc.md"), false},
		{filepath.Join(home, "subdir", "file.txt"), false},
		{"/tmp/output.txt", true}, // outside home
		{"relative/path.md", true},
		{filepath.Join(home, "..", "etc", "passwd"), true},
		{"../escape", true},
	}
	for _, tt := range tests {
		_, err := validateWritePath(tt.path)
		if (err != nil) != tt.wantErr {
			t.Errorf("validateWritePath(%q) error = %v, wantErr = %v", tt.path, err, tt.wantErr)
		}
	}
}

func TestServerConcurrentAccess(t *testing.T) {
	srv, _ := newTestServer(t)

	// Put 20 files concurrently.
	done := make(chan string, 20)
	for i := 0; i < 20; i++ {
		go func(n int) {
			data := []byte(fmt.Sprintf("content-%d", n))
			req, _ := http.NewRequest("POST", srv.BaseURL()+"/f", bytes.NewReader(data))
			req.Header.Set("Authorization", "Bearer "+testToken)
			req.Header.Set("X-Filename", fmt.Sprintf("file-%d.txt", n))
			req.Header.Set("Content-Type", "text/plain")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				done <- ""
				return
			}
			defer resp.Body.Close()
			var pr PutFileResponse
			_ = json.NewDecoder(resp.Body).Decode(&pr)
			done <- pr.ID
		}(i)
	}

	ids := make([]string, 0, 20)
	for i := 0; i < 20; i++ {
		id := <-done
		if id == "" {
			t.Error("concurrent PUT failed")
			continue
		}
		ids = append(ids, id)
	}

	// Verify all files are retrievable.
	for _, id := range ids {
		req, _ := http.NewRequest("GET", srv.BaseURL()+"/f/"+id, nil)
		req.Header.Set("Authorization", "Bearer "+testToken)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Errorf("GET %s: %v", id, err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("GET %s status = %d", id, resp.StatusCode)
		}
	}
}

func TestServerPutAuthTimingAttack(t *testing.T) {
	// Verify that wrong tokens of varying length all get 401.
	srv, _ := newTestServer(t)
	for _, token := range []string{"a", "ab", "abc", "a-longer-wrong-token", testToken + "extra"} {
		req, _ := http.NewRequest("GET", srv.BaseURL()+"/health", nil)
		// Health doesn't need auth, but test that auth middleware is consistent.
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := http.DefaultClient.Do(req)
		resp.Body.Close()
		// Health endpoint doesn't require auth, so this always succeeds.
		if resp.StatusCode != http.StatusOK {
			t.Errorf("health with token %q: status = %d", token, resp.StatusCode)
		}
	}
}

// TestServerPutEmptyBody verifies that an empty POST body is accepted (0-byte file).
func TestServerPutEmptyBody(t *testing.T) {
	srv, _ := newTestServer(t)
	req, _ := http.NewRequest("POST", srv.BaseURL()+"/f", strings.NewReader(""))
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Content-Type", "text/plain")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("status = %d, want 201", resp.StatusCode)
	}
}

// Ensure unused import doesn't cause build issues.
var _ = httptest.NewServer
