package logger

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func TestNewWritesJSONWithComponent(t *testing.T) {
	var buf bytes.Buffer
	l := New(Options{
		Writer:    &buf,
		Format:    FormatJSON,
		Component: "cli",
	})
	l.Info("hello", slog.String("scope", "test"))

	var record map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &record); err != nil {
		t.Fatalf("expected JSON output, got %q: %v", buf.String(), err)
	}
	if record["msg"] != "hello" {
		t.Errorf("msg = %v, want hello", record["msg"])
	}
	if record["component"] != "cli" {
		t.Errorf("component = %v, want cli", record["component"])
	}
	if record["scope"] != "test" {
		t.Errorf("scope = %v, want test", record["scope"])
	}
}

func TestRedactsSensitiveAttributes(t *testing.T) {
	var buf bytes.Buffer
	l := New(Options{
		Writer:     &buf,
		Format:     FormatJSON,
		RedactKeys: []string{"api_key", "secret"},
	})
	l.Info("auth", slog.String("api_key", "abcd1234"), slog.String("user", "alice"))

	out := buf.String()
	if strings.Contains(out, "abcd1234") {
		t.Fatalf("expected api_key to be redacted, got %s", out)
	}
	if !strings.Contains(out, "[REDACTED]") {
		t.Fatalf("expected redaction marker in output, got %s", out)
	}
	if !strings.Contains(out, "alice") {
		t.Fatalf("non-sensitive field should be preserved, got %s", out)
	}
}

func TestLevelFiltering(t *testing.T) {
	var buf bytes.Buffer
	level := slog.LevelWarn
	l := New(Options{Writer: &buf, Format: FormatText, Level: &level})
	l.Debug("skip-me")
	l.Info("skip-me-too")
	l.Warn("keep")
	out := buf.String()
	if strings.Contains(out, "skip-me") {
		t.Errorf("expected debug/info filtered, got %s", out)
	}
	if !strings.Contains(out, "keep") {
		t.Errorf("expected warn line, got %s", out)
	}
}

func TestContextRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	l := New(Options{Writer: &buf, Format: FormatJSON, Component: "ctxtest"})
	ctx := IntoContext(context.Background(), l.With(slog.String("request_id", "req-1")))

	got := FromContext(ctx)
	got.Info("served")

	if !strings.Contains(buf.String(), "req-1") {
		t.Fatalf("expected request_id in output, got %s", buf.String())
	}
}

func TestFromContextFallsBackToDefault(t *testing.T) {
	var buf bytes.Buffer
	SetDefault(New(Options{Writer: &buf, Format: FormatText, Component: "fallback"}))
	t.Cleanup(func() { SetDefault(New(Options{Component: "superduck"})) })

	got := FromContext(context.Background())
	got.Info("hi")

	if !strings.Contains(buf.String(), "fallback") {
		t.Fatalf("expected default logger output, got %s", buf.String())
	}
}
