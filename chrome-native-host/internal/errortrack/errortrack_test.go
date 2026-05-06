package errortrack

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func newTestClient(t *testing.T, opts Options) *Client {
	t.Helper()
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")
	c := New(opts)
	if !c.Enabled() {
		t.Fatalf("expected client enabled with opts %+v", opts)
	}
	return c
}

func TestNewDisabledWithoutDSN(t *testing.T) {
	t.Setenv(envDSN, "")
	t.Setenv(envDisabled, "")
	t.Setenv(envCI, "")
	SentryDSN = ""

	c := New(Options{})
	if c.Enabled() {
		t.Fatalf("expected disabled when no DSN configured")
	}
}

func TestNewDisabledInCI(t *testing.T) {
	t.Setenv(envCI, "true")
	c := New(Options{DSN: "https://abc@example.com/42"})
	if c.Enabled() {
		t.Fatalf("expected disabled in CI even with valid DSN")
	}
}

func TestNewDisabledWhenOptedOut(t *testing.T) {
	t.Setenv(envCI, "")
	t.Setenv(envDisabled, "1")
	c := New(Options{DSN: "https://abc@example.com/42"})
	if c.Enabled() {
		t.Fatalf("expected disabled when SUPERDUCK_ERRORTRACK_DISABLED=1")
	}
}

func TestNewRejectsInvalidDSN(t *testing.T) {
	t.Setenv(envCI, "")
	t.Setenv(envDisabled, "")
	c := New(Options{DSN: "not-a-url"})
	if c.Enabled() {
		t.Fatalf("expected disabled for malformed DSN")
	}
}

func TestParseDSN(t *testing.T) {
	d, err := parseDSN("https://abc123@sentry.example.com/42")
	if err != nil {
		t.Fatalf("parseDSN: %v", err)
	}
	if d.publicKey != "abc123" || d.host != "sentry.example.com" || d.projectID != "42" {
		t.Fatalf("parsed DSN mismatch: %+v", d)
	}
	if d.storeEndpoint() != "https://sentry.example.com/api/42/store/" {
		t.Fatalf("unexpected endpoint: %s", d.storeEndpoint())
	}
	hdr := d.authHeader(time.Unix(1700000000, 0).UTC())
	if !strings.Contains(hdr, "sentry_key=abc123") || !strings.Contains(hdr, "sentry_version=7") {
		t.Fatalf("auth header missing fields: %s", hdr)
	}

	if _, err := parseDSN("https://sentry.example.com/42"); err == nil {
		t.Fatalf("expected error when public key missing")
	}
	if _, err := parseDSN("https://abc@sentry.example.com/"); err == nil {
		t.Fatalf("expected error when project id missing")
	}
}

func TestCaptureSendsEnvelope(t *testing.T) {
	var hits int32
	var lastBody []byte
	var lastAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/api/42/store/") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		lastAuth = r.Header.Get("X-Sentry-Auth")
		body, _ := io.ReadAll(r.Body)
		lastBody = body
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := newTestClient(t, Options{
		DSN:          "https://pubkey@" + strings.TrimPrefix(srv.URL, "http://") + "/42",
		HTTPClient:   srv.Client(),
		ComponentTag: "cli",
		Release:      "1.2.3",
		Environment:  "test",
	})
	// override scheme to plain http for the test server
	c.dsn.scheme = "http"

	c.AddBreadcrumb(Breadcrumb{Category: "cli", Message: "screenshot"})
	c.Capture(errors.New("boom"), map[string]any{
		"command": "screenshot",
		"token":   "supersecret",
	})

	flushCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c.Flush(flushCtx)

	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("expected 1 send, got %d", hits)
	}
	if !strings.Contains(lastAuth, "sentry_key=pubkey") {
		t.Errorf("auth header missing key: %s", lastAuth)
	}

	var got map[string]any
	if err := json.Unmarshal(lastBody, &got); err != nil {
		t.Fatalf("body not JSON: %v\n%s", err, string(lastBody))
	}
	if got["release"] != "1.2.3" {
		t.Errorf("release not propagated: %v", got["release"])
	}
	if got["environment"] != "test" {
		t.Errorf("environment not propagated: %v", got["environment"])
	}
	tags, ok := got["tags"].(map[string]any)
	if !ok || tags["component"] != "cli" {
		t.Errorf("component tag missing: %v", got["tags"])
	}
	extra, ok := got["extra"].(map[string]any)
	if !ok {
		t.Fatalf("extra missing")
	}
	if extra["token"] != "[REDACTED]" {
		t.Errorf("token not redacted: %v", extra["token"])
	}
	if extra["command"] != "screenshot" {
		t.Errorf("command lost: %v", extra["command"])
	}
	exc := got["exception"].(map[string]any)
	values := exc["values"].([]any)
	if len(values) != 1 {
		t.Fatalf("expected 1 exception value, got %d", len(values))
	}
	first := values[0].(map[string]any)
	if first["value"] != "boom" {
		t.Errorf("exception value lost: %v", first["value"])
	}

	bcWrap, _ := got["breadcrumbs"].(map[string]any)
	bcs, _ := bcWrap["values"].([]any)
	if len(bcs) != 1 {
		t.Fatalf("expected 1 breadcrumb, got %d", len(bcs))
	}
}

func TestCaptureNoOpOnNilErrAndDisabled(t *testing.T) {
	c := New(Options{}) // disabled
	c.Capture(errors.New("ignored when disabled"), nil)
	c.CaptureMessage("ignored", LevelWarning, nil)
	c.AddBreadcrumb(Breadcrumb{Message: "still-fine"})

	// Even an enabled client must no-op on nil err.
	enabled := newTestClient(t, Options{DSN: "https://k@example.com/1"})
	enabled.Capture(nil, nil)
	enabled.CaptureMessage("", LevelInfo, nil)
}

func TestBreadcrumbsAreBounded(t *testing.T) {
	c := newTestClient(t, Options{
		DSN:       "https://k@example.com/1",
		MaxCrumbs: 3,
	})
	for i := 0; i < 10; i++ {
		c.AddBreadcrumb(Breadcrumb{Message: "x"})
	}
	if got := len(c.snapshotCrumbs()); got != 3 {
		t.Fatalf("expected ring buffer cap 3, got %d", got)
	}
}

func TestRedactMapDoesNotMutateInput(t *testing.T) {
	in := map[string]any{"token": "abc", "ok": true}
	out := redactMap(in, map[string]struct{}{"token": {}})
	if in["token"] != "abc" {
		t.Errorf("input mutated: %v", in["token"])
	}
	if out["token"] != "[REDACTED]" {
		t.Errorf("output not redacted: %v", out["token"])
	}
	if out["ok"] != true {
		t.Errorf("non-secret value lost: %v", out["ok"])
	}
}

func TestClassifyStripsPackagePath(t *testing.T) {
	t.Parallel()
	if got := classify(errors.New("x")); got != "errorString" {
		t.Errorf("expected errorString, got %q", got)
	}
}

func TestRecoverReportsAndRepanics(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	c := newTestClient(t, Options{
		DSN:        "https://k@" + strings.TrimPrefix(srv.URL, "http://") + "/1",
		HTTPClient: srv.Client(),
	})
	c.dsn.scheme = "http"

	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("expected re-panic")
		}
	}()
	defer c.Recover()
	panic("kaboom")
}

func TestParseDSNRejectsEmptyPublicKey(t *testing.T) {
	t.Setenv(envCI, "")
	t.Setenv(envDisabled, "")
	if _, err := parseDSN("https://@sentry.example.com/42"); err == nil {
		t.Fatalf("expected error for empty public key")
	}
	c := New(Options{DSN: "https://@sentry.example.com/42"})
	if c.Enabled() {
		t.Fatalf("expected disabled for empty public key DSN")
	}
}

func TestRedactMapRecursive(t *testing.T) {
	redact := map[string]struct{}{"token": {}, "secret": {}}
	in := map[string]any{
		"ok": true,
		"headers": map[string]any{
			"authorization": "keep",
			"token":         "leaked",
			"nested": map[string]any{
				"secret": "deep",
			},
		},
	}
	out := redactMap(in, redact)
	headers := out["headers"].(map[string]any)
	if headers["token"] != "[REDACTED]" {
		t.Errorf("nested token not redacted: %v", headers["token"])
	}
	nested := headers["nested"].(map[string]any)
	if nested["secret"] != "[REDACTED]" {
		t.Errorf("deep nested secret not redacted: %v", nested["secret"])
	}
	if headers["authorization"] != "keep" {
		t.Errorf("non-redact key lost: %v", headers["authorization"])
	}
}

func TestRedactStringScrubbsSecrets(t *testing.T) {
	msg := "failed: Bearer sk-abc123 at https://user:pass@host.com/api"
	out := redactString(msg)
	if strings.Contains(out, "sk-abc123") {
		t.Errorf("Bearer token not redacted: %s", out)
	}
	if strings.Contains(out, "user:pass@") {
		t.Errorf("URL credentials not redacted: %s", out)
	}
}
