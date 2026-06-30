package main

import "testing"

func TestDetectMIME(t *testing.T) {
	tests := []struct {
		filename string
		want     string
	}{
		{"report.md", "text/markdown"},
		{"data.txt", "text/plain"},
		{"config.json", "application/json"},
		{"image.png", "image/png"},
		{"photo.jpg", "image/jpeg"},
		{"photo.jpeg", "image/jpeg"},
		{"anim.gif", "image/gif"},
		{"logo.svg", "image/svg+xml"},
		{"doc.pdf", "application/pdf"},
		{"data.csv", "text/csv"},
		{"page.html", "text/html"},
		{"page.htm", "text/html"},
		{"style.css", "text/css"},
		{"script.js", "application/javascript"},
		{"data.xml", "application/xml"},
		{"archive.zip", "application/zip"},
		{"video.mp4", "video/mp4"},
		{"clip.webm", "video/webm"},
		{"unknown.xyz", "application/octet-stream"},
		{"noextension", "application/octet-stream"},
	}
	for _, tt := range tests {
		got := detectMIME(tt.filename)
		if got != tt.want {
			t.Errorf("detectMIME(%q) = %q, want %q", tt.filename, got, tt.want)
		}
	}
}
