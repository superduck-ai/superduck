package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"chrome-native-host/internal/cliclient"
)

// cmdUploadFile: superduck push-file --path <file> [--mime <type>]
//
// Reads a file from disk and sends it to the native host via UDS.
// The native host stores it in the file server memory and notifies the CRX
// via native messaging (file_ready). The CRX can then fetch the file from
// the localhost HTTP server.
//
// This is distinct from `superduck upload` which uploads an image to a web
// page's file input (browser automation).
func cmdUploadFile(argv []string) error {
	fs := flag.NewFlagSet("upload-file", flag.ContinueOnError)
	path := fs.String("path", "", "Path to the file to upload")
	mime := fs.String("mime", "", "MIME type (auto-detected if omitted)")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	if *path == "" {
		return fmt.Errorf("--path is required")
	}

	absPath, err := filepath.Abs(*path)
	if err != nil {
		return fmt.Errorf("resolve path: %w", err)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return fmt.Errorf("read file: %w", err)
	}

	filename := filepath.Base(absPath)
	mimeType := *mime
	if mimeType == "" {
		mimeType = detectMIME(filename)
	}

	req := map[string]any{
		"type":     "upload_file",
		"filename": filename,
		"mimeType": mimeType,
		"data":     data,
	}

	resp, err := cliclient.Control(req, clientOpts())
	if err != nil {
		return err
	}

	if errMsg, ok := resp["error"].(string); ok && errMsg != "" {
		return fmt.Errorf("upload failed: %s", errMsg)
	}

	pretty, _ := json.MarshalIndent(resp, "", "  ")
	fmt.Println(string(pretty))
	return nil
}

// detectMIME returns a best-effort MIME type based on file extension.
func detectMIME(filename string) string {
	ext := filepath.Ext(filename)
	switch ext {
	case ".md":
		return "text/markdown"
	case ".txt":
		return "text/plain"
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".csv":
		return "text/csv"
	case ".html", ".htm":
		return "text/html"
	case ".css":
		return "text/css"
	case ".js":
		return "application/javascript"
	case ".xml":
		return "application/xml"
	case ".zip":
		return "application/zip"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	default:
		return "application/octet-stream"
	}
}
