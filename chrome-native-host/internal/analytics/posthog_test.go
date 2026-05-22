package analytics

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewDisabledWithoutKey(t *testing.T) {
	t.Setenv(envWriteKey, "")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")
	PostHogWriteKey = ""

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected client disabled when no API key is configured")
	}
}

func TestNewDisabledWhenOptedOut(t *testing.T) {
	t.Setenv(envWriteKey, "phc_test_key")
	t.Setenv(envDisabled, "true")
	t.Setenv(envCI, "")

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected client disabled when SUPERDUCK_ANALYTICS_DISABLED=true")
	}
}

func TestNewDisabledInCI(t *testing.T) {
	t.Setenv(envWriteKey, "phc_test_key")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "true")

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected client disabled in CI")
	}
}

func TestNewDisabledWhenConfirmedIDRequiredButMissing(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv(envWriteKey, "phc_test_key")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")

	EnsureInstallID()
	c := New(Options{RequireConfirmedID: true})
	if c.Enabled() {
		t.Fatalf("expected client disabled before install id confirmation")
	}
}

func TestNewEnabledWhenConfirmedIDRequiredAndPresent(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv(envWriteKey, "phc_test_key")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")

	EnsureInstallID()
	ConfirmInstallID()
	c := New(Options{RequireConfirmedID: true})
	if !c.Enabled() {
		t.Fatalf("expected client enabled after install id confirmation")
	}
}

func TestConfirmInstallIDCreatesMarker(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	if IsInstallIDConfirmed() {
		t.Fatal("expected fresh install id to start unconfirmed")
	}
	ConfirmInstallID()
	if !IsInstallIDConfirmed() {
		t.Fatal("expected install id confirmation marker")
	}
}

func TestEnabledClientCapturesEvents(t *testing.T) {
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")

	var hits int32
	var lastBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/capture/" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		lastBody = buf
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(Options{
		APIKey:     "phc_test_key",
		Host:       srv.URL,
		DistinctID: "user-123",
		HTTPClient: srv.Client(),
	})
	if !c.Enabled() {
		t.Fatalf("expected client enabled")
	}

	c.Capture("cli.command", map[string]any{"command": "screenshot", "ok": true})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c.Flush(ctx)

	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("expected exactly 1 capture call, got %d", hits)
	}

	var got map[string]any
	if err := json.Unmarshal(lastBody, &got); err != nil {
		t.Fatalf("response body was not JSON: %v\nbody=%s", err, string(lastBody))
	}
	if got["api_key"] != "phc_test_key" {
		t.Errorf("api_key not propagated: %v", got["api_key"])
	}
	if got["distinct_id"] != "user-123" {
		t.Errorf("distinct_id not propagated: %v", got["distinct_id"])
	}
	if got["event"] != "cli.command" {
		t.Errorf("event not propagated: %v", got["event"])
	}
	props, ok := got["properties"].(map[string]any)
	if !ok {
		t.Fatalf("properties missing or not an object")
	}
	if props["command"] != "screenshot" {
		t.Errorf("custom property dropped: %v", props["command"])
	}
	if props["$lib"] != "superduck-cli" {
		t.Errorf("expected $lib stamped, got %v", props["$lib"])
	}
}

func TestCaptureNoOpWhenDisabled(t *testing.T) {
	t.Setenv(envWriteKey, "")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")
	PostHogWriteKey = ""

	c := New(Options{})

	// Use a sentinel server that fails the test if hit.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("disabled client should not POST to %s", r.URL)
	}))
	defer srv.Close()
	c.host = srv.URL // even if someone forces a host, disabled means disabled

	c.Capture("cli.command", nil)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	c.Flush(ctx)
}

func TestCaptureRejectsEmptyEventName(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("empty event name should not produce a capture call")
	}))
	defer srv.Close()

	c := New(Options{
		APIKey:     "phc_test_key",
		Host:       srv.URL,
		DistinctID: "user-123",
		HTTPClient: srv.Client(),
	})
	c.Capture("", map[string]any{"x": 1})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	c.Flush(ctx)
}

func TestBuildCaptureBodyDoesNotAllowOverridingLibFields(t *testing.T) {
	t.Parallel()
	body := buildCaptureBody("k", "u", "evt", map[string]any{
		"$lib":   "evil",
		"custom": 42,
	}, time.Unix(0, 0).UTC())

	var got map[string]any
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	props := got["properties"].(map[string]any)
	if props["$lib"] != "superduck-cli" {
		t.Errorf("$lib was overwritten by caller: %v", props["$lib"])
	}
	if props["custom"].(float64) != 42 {
		t.Errorf("custom prop was lost: %v", props["custom"])
	}
}

func TestLoadOrCreateDistinctIDPersistsAcrossCalls(t *testing.T) {
	// NOTE: not Parallel — mutates HOME via t.Setenv.
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	// On macOS UserHomeDir checks $HOME first, so the override above is enough.

	first := loadOrCreateDistinctID()
	if first == "" {
		t.Fatalf("expected non-empty id")
	}
	if !strings.HasPrefix(first, "sdid-") {
		t.Fatalf("expected sdid-* install id, got %q", first)
	}
	if _, err := os.Stat(filepath.Join(tmp, ".superduck", "analytics-id")); err != nil {
		t.Fatalf("expected id file to be persisted: %v", err)
	}
	second := loadOrCreateDistinctID()
	if first != second {
		t.Errorf("expected stable id across calls, got %q vs %q", first, second)
	}
}

func TestEnsureInstallIDCreatesAnalyticsIDFile(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	id := EnsureInstallID()
	if !strings.HasPrefix(id, "sdid-") {
		t.Fatalf("expected sdid-* install id, got %q", id)
	}

	data, err := os.ReadFile(filepath.Join(tmp, ".superduck", "analytics-id"))
	if err != nil {
		t.Fatalf("expected analytics id file to be created: %v", err)
	}
	if strings.TrimSpace(string(data)) != id {
		t.Fatalf("persisted id mismatch: got %q want %q", strings.TrimSpace(string(data)), id)
	}
}

func TestLoadOrCreateDistinctIDMigratesLegacyAnonID(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	dir := filepath.Join(tmp, ".superduck")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	idFile := filepath.Join(dir, "analytics-id")
	if err := os.WriteFile(idFile, []byte("anon-legacy\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	id := loadOrCreateDistinctID()
	if id == "anon-legacy" {
		t.Fatal("expected legacy anon id to be migrated")
	}
	if !strings.HasPrefix(id, "sdid-") {
		t.Fatalf("expected migrated sdid-* install id, got %q", id)
	}

	data, err := os.ReadFile(idFile)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != id+"\n" {
		t.Fatalf("expected migrated id to be persisted, got %q want %q", string(data), id+"\n")
	}
}

func TestAdoptInstallIDPersistsExtensionID(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	id := AdoptInstallID("sdid-extensionfirst")
	if id != "sdid-extensionfirst" {
		t.Fatalf("AdoptInstallID() = %q, want extension id", id)
	}

	data, err := os.ReadFile(filepath.Join(tmp, ".superduck", "analytics-id"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(data)) != "sdid-extensionfirst" {
		t.Fatalf("persisted id = %q", strings.TrimSpace(string(data)))
	}
}

func TestAdoptInstallIDIgnoresInvalidID(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	id := AdoptInstallID("sdext-old")
	if !strings.HasPrefix(id, "sdid-") {
		t.Fatalf("expected generated sdid for invalid adoption, got %q", id)
	}
	if id == "sdext-old" {
		t.Fatal("invalid extension id was adopted")
	}
}
