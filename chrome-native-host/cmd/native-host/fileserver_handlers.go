package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"

	"chrome-native-host/internal/protocol"
)

// handleUploadFile receives a file from CLI/MCP via UDS and stores it in the
// file server. Sends back the file metadata + URL so the caller can pass it
// to CRX, and notifies CRX via a file_ready message.
func (s *Server) handleUploadFile(raw []byte, writer io.Writer) {
	if s.fileServer == nil {
		_ = protocol.SendMessage(writer, map[string]any{
			"type": "upload_file_response", "error": "file server not available",
		})
		return
	}

	var req struct {
		Filename string `json:"filename"`
		MIMEType string `json:"mimeType"`
		Data     []byte `json:"data"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		_ = protocol.SendMessage(writer, map[string]any{
			"type": "upload_file_response", "error": fmt.Sprintf("invalid request: %v", err),
		})
		return
	}
	if req.MIMEType == "" {
		req.MIMEType = "application/octet-stream"
	}

	id, err := s.fileServer.Store().Put(req.Filename, req.MIMEType, req.Data)
	if err != nil {
		_ = protocol.SendMessage(writer, map[string]any{
			"type": "upload_file_response", "error": err.Error(),
		})
		return
	}

	url := fmt.Sprintf("%s/f/%s", s.fileServer.BaseURL(), id)
	slog.Info("file uploaded via UDS", "id", id, "filename", req.Filename, "size", len(req.Data))

	_ = protocol.SendMessage(writer, map[string]any{
		"type":     "upload_file_response",
		"id":       id,
		"url":      url,
		"filename": req.Filename,
		"mimeType": req.MIMEType,
		"size":     len(req.Data),
	})

	// Notify CRX that a file is ready for retrieval.
	s.sendToChrome(map[string]any{
		"type":     "file_ready",
		"id":       id,
		"url":      url,
		"filename": req.Filename,
		"mimeType": req.MIMEType,
		"size":     len(req.Data),
	})
}

// handleFileServerInfo returns the file server URL and auth token to the caller.
func (s *Server) handleFileServerInfo(writer io.Writer) {
	if s.fileServer == nil {
		_ = protocol.SendMessage(writer, map[string]any{
			"type": "file_server_info_response", "error": "file server not available",
		})
		return
	}
	_ = protocol.SendMessage(writer, map[string]any{
		"type":  "file_server_info_response",
		"url":   s.fileServer.BaseURL(),
		"port":  s.fileServer.Port(),
		"token": s.udsAuth,
	})
}
