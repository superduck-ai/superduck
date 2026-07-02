package main

import (
	"strings"
	"testing"
)

// TestExtractScreenshotPayloadStripsTabContext ensures the synthetic
// "Tab Context" text block (appended by converter.ToMCPContent) is dropped
// from screenshot/zoom text output, while the real status text and image
// payload survive. Without this, `superduck --tab N --json screenshot | jq
// -r '.output'` is polluted with Tab Context noise.
func TestExtractScreenshotPayloadStripsTabContext(t *testing.T) {
	v := []any{
		map[string]any{"type": "text", "text": "Successfully captured screenshot (1512x722, jpeg) - ID: abc-123"},
		map[string]any{"type": "text", "text": "\n\nTab Context:\n- Executed on tabId: 42\n- Available tabs:\n  • tabId 42: \"Example\" (https://example.com/)"},
		map[string]any{"type": "image", "source": map[string]any{"data": "Zm9vYmFy", "media_type": "image/png"}},
	}

	text, img := extractScreenshotPayload(v)
	if strings.Contains(text, "Tab Context") {
		t.Fatalf("text still contains Tab Context noise: %q", text)
	}
	if want := "Successfully captured screenshot (1512x722, jpeg) - ID: abc-123"; text != want {
		t.Fatalf("text = %q, want %q", text, want)
	}
	if img == nil {
		t.Fatal("image payload dropped; want it preserved")
	}
	if img.Data != "Zm9vYmFy" {
		t.Fatalf("img.Data = %q, want %q", img.Data, "Zm9vYmFy")
	}
	if img.MediaType != "image/png" {
		t.Fatalf("img.MediaType = %q, want image/png", img.MediaType)
	}
}

// TestExtractScreenshotPayloadKeepsPlainTextWhenNoTabContext is a regression
// guard: a capture whose only text block is the status line must survive
// unchanged (no over-stripping).
func TestExtractScreenshotPayloadKeepsPlainTextWhenNoTabContext(t *testing.T) {
	v := []any{
		map[string]any{"type": "text", "text": "Captured region"},
		map[string]any{"type": "image", "source": map[string]any{"data": "AAAA", "media_type": "image/jpeg"}},
	}
	text, img := extractScreenshotPayload(v)
	if text != "Captured region" {
		t.Fatalf("text = %q, want %q", text, "Captured region")
	}
	if img == nil || img.MediaType != "image/jpeg" {
		t.Fatalf("image not preserved: %+v", img)
	}
}
