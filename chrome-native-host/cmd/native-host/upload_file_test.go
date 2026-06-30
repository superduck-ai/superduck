package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"chrome-native-host/internal/fileserver"
	"chrome-native-host/internal/protocol"
)

func TestHandleUploadFileFullFlow(t *testing.T) {
	store := fileserver.NewFileStore(fileserver.DefaultStoreConfig())
	defer store.Close()
	fs, err := fileserver.NewServer(store, testUploadToken)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	defer fs.Close()

	server := &Server{
		fileServer: fs,
		udsAuth:    testUploadToken,
	}

	fileData := []byte("# Test Report\n\nThis is a test markdown file.\n")
	req := map[string]any{
		"type":     "upload_file",
		"filename": "report.md",
		"mimeType": "text/markdown",
		"data":     fileData,
	}
	raw, _ := json.Marshal(req)

	var buf bytes.Buffer
	server.handleUploadFile(raw, &buf)

	respRaw, err := protocol.ReadMessage(&buf)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}

	var resp map[string]any
	if err := json.Unmarshal(respRaw, &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if errMsg, ok := resp["error"].(string); ok && errMsg != "" {
		t.Fatalf("upload failed: %s", errMsg)
	}

	id, _ := resp["id"].(string)
	if id == "" {
		t.Fatal("response missing id")
	}
	url, _ := resp["url"].(string)
	if url == "" {
		t.Fatal("response missing url")
	}
	if resp["filename"] != "report.md" {
		t.Errorf("filename = %v", resp["filename"])
	}
	if int(resp["size"].(float64)) != len(fileData) {
		t.Errorf("size = %v, want %d", resp["size"], len(fileData))
	}

	// Fetch the file from the HTTP server.
	httpReq, _ := http.NewRequest("GET", url, nil)
	httpReq.Header.Set("Authorization", "Bearer "+testUploadToken)
	httpResp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		t.Fatalf("HTTP GET: %v", err)
	}
	defer httpResp.Body.Close()
	if httpResp.StatusCode != http.StatusOK {
		t.Fatalf("HTTP status = %d", httpResp.StatusCode)
	}
	if ct := httpResp.Header.Get("Content-Type"); ct != "text/markdown" {
		t.Errorf("Content-Type = %q, want text/markdown", ct)
	}
	got, _ := io.ReadAll(httpResp.Body)
	if !bytes.Equal(got, fileData) {
		t.Errorf("content mismatch: got %q, want %q", got, fileData)
	}
}

func TestHandleUploadFileNoServer(t *testing.T) {
	server := &Server{fileServer: nil}
	raw, _ := json.Marshal(map[string]any{"type": "upload_file", "data": []byte("x")})

	var buf bytes.Buffer
	server.handleUploadFile(raw, &buf)

	respRaw, _ := protocol.ReadMessage(&buf)
	var resp map[string]any
	_ = json.Unmarshal(respRaw, &resp)
	if resp["error"] == nil {
		t.Error("expected error when fileServer is nil")
	}
}

func TestHandleFileServerInfo(t *testing.T) {
	store := fileserver.NewFileStore(fileserver.DefaultStoreConfig())
	defer store.Close()
	fs, _ := fileserver.NewServer(store, testUploadToken)
	defer fs.Close()

	server := &Server{fileServer: fs, udsAuth: testUploadToken}
	var buf bytes.Buffer
	server.handleFileServerInfo(&buf)

	respRaw, _ := protocol.ReadMessage(&buf)
	var resp map[string]any
	_ = json.Unmarshal(respRaw, &resp)
	if resp["url"] == nil {
		t.Error("missing url in file_server_info response")
	}
	if resp["token"] == nil {
		t.Error("missing token in file_server_info response")
	}
	if resp["port"] == nil {
		t.Error("missing port in file_server_info response")
	}
}

const testUploadToken = "test-upload-token-xyz"
